import { Injectable } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import deepClone from 'clone-deep'
import { PartialProfile, Profile } from '../api/profileProvider'
import { ProfilesService } from './profiles.service'

/**
 * Runs on the remote machine through `sh -c`, so it works whatever the login shell is (bash, zsh, fish).
 * Login scripts unescape backslashes and fish treats them specially inside single quotes,
 * so the script must contain neither backslashes nor single quotes.
 * $1 = working folder, $2 = install prompt, $3 = tmux session name, $4 = TRUST_SCRIPT in base64
 */
const REMOTE_SCRIPT = [
    'export PATH="$HOME/.local/bin:$PATH"',
    'd="$1"',
    'case "$d" in "~") d="$HOME";; "~/"*) d="$HOME/${d#??}";; esac',
    'if [ -n "$d" ]; then cd "$d" || exit 1; fi',
    // Without python3 Claude Code asks about the folder as before
    'if command -v python3 >/dev/null 2>&1; then echo "$4" | base64 -d | python3 >/dev/null 2>&1; fi',
    'if ! command -v claude >/dev/null 2>&1; then printf "%s [y/N] " "$2"; read a; case "$a" in y|Y|yes) if command -v curl >/dev/null 2>&1; then curl -fsSL https://claude.ai/install.sh | bash; else wget -qO- https://claude.ai/install.sh | bash; fi || exit 1;; *) exit 0;; esac; fi',
    // tmux keeps Claude running when the tab closes; an already running tmux server does not see
    // the PATH set above, so claude is started by its full path. Its titles are passed through so Tsugite can
    // follow the work, and its status bar is hidden because Tsugite shows the state itself.
    // CLAUDE_CODE_HIDE_CWD drops the folder line from Claude Code's start-up header (the work panel
    // and the tab already say where it runs); it is set on the command so a running tmux server gets it too
    'if command -v tmux >/dev/null 2>&1; then tmux has-session -t "$3" 2>/dev/null || tmux -u new-session -d -s "$3" "env CLAUDE_CODE_HIDE_CWD=1 $(command -v claude)"; tmux set-option -t "$3" set-titles on; tmux set-option -t "$3" set-titles-string "#T"; tmux set-option -t "$3" status off; exec tmux -u attach-session -t "$3"; fi',
    'CLAUDE_CODE_HIDE_CWD=1 exec claude',
].join('; ')

/**
 * Marks the working folder as trusted in ~/.claude.json, so Claude Code starts without asking
 * "Yes, I trust this folder" every time. The key is the physical path, as Claude Code itself uses.
 */
const TRUST_SCRIPT = `
import json, os
p = os.path.realpath(os.path.expanduser("~/.claude.json"))
try:
    c = json.load(open(p))
except FileNotFoundError:
    c = {}
d = c.setdefault("projects", {}).setdefault(os.getcwd(), {})
if not d.get("hasTrustDialogAccepted"):
    d["hasTrustDialogAccepted"] = True
    t = p + ".tsugite"
    with open(os.open(t, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as f:
        json.dump(c, f, indent=2)
    os.replace(t, p)
`

@Injectable({ providedIn: 'root' })
export class ClaudeLauncherService {
    constructor (
        private profiles: ProfilesService,
        private translate: TranslateService,
    ) { }

    /** Characters that would break out of the double-quoted arguments on the remote command line */
    static isValidWorkdir (workdir: string): boolean {
        return !/["'`$\\]/.test(workdir)
    }

    async openTerminal (profile: PartialProfile<Profile>): Promise<void> {
        await this.profiles.openNewTabForProfile(profile)
    }

    async openClaude (profile: PartialProfile<Profile>): Promise<void> {
        const clone = deepClone(profile)
        const workdir: string = clone.options?.claudeWorkdir ?? ''
        clone.name = `${profile.name} · Claude`
        // The work panel and the side panel follow this tab under the machine's own name
        clone.tsugiteAssist = profile.name
        // The tab title then follows the task title Claude sets
        clone.disableDynamicTitle = false
        clone.options ??= {}
        clone.options.scripts = [
            ...clone.options.scripts ?? [],
            { expect: '', send: this.getCommand(ClaudeLauncherService.isValidWorkdir(workdir) ? workdir : '') },
        ]
        await this.profiles.openNewTabForProfile(clone)
    }

    getCommand (workdir: string): string {
        const prompt = this.translate.instant('Claude Code is not installed on this machine. Install it now?').replace(/["'`$\\]/g, '')
        // One tmux session per folder, so reopening the same folder reattaches to the running Claude
        const folder = workdir.replace(/\/+$/, '').split('/').pop()?.replace(/[^A-Za-z0-9_-]/g, '') ?? ''
        const session = folder ? `claude-${folder}` : 'claude'
        // The leading space keeps the line out of shell history where HISTCONTROL=ignorespace is set
        const trust = Buffer.from(TRUST_SCRIPT).toString('base64')
        return ` clear; sh -c '${REMOTE_SCRIPT}' tsugite "${workdir}" "${prompt}" "${session}" "${trust}"`
    }
}
