import { Injectable } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import deepClone from 'clone-deep'
import { PartialProfile, Profile } from '../api/profileProvider'
import { ProfilesService } from './profiles.service'

/**
 * Runs on the remote machine through `sh -c`, so it works whatever the login shell is (bash, zsh, fish).
 * Login scripts unescape backslashes and fish treats them specially inside single quotes,
 * so the script must contain neither backslashes nor single quotes.
 * $1 = working folder, $2 = install prompt, $3 = tmux session name
 */
const REMOTE_SCRIPT = [
    'export PATH="$HOME/.local/bin:$PATH"',
    'd="$1"',
    'case "$d" in "~") d="$HOME";; "~/"*) d="$HOME/${d#??}";; esac',
    'if [ -n "$d" ]; then cd "$d" || exit 1; fi',
    'if ! command -v claude >/dev/null 2>&1; then printf "%s [y/N] " "$2"; read a; case "$a" in y|Y|yes) if command -v curl >/dev/null 2>&1; then curl -fsSL https://claude.ai/install.sh | bash; else wget -qO- https://claude.ai/install.sh | bash; fi || exit 1;; *) exit 0;; esac; fi',
    'if command -v tmux >/dev/null 2>&1; then exec tmux new -A -s "$3" claude; fi',
    'exec claude',
].join('; ')

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
        return ` clear; sh -c '${REMOTE_SCRIPT}' tsugite "${workdir}" "${prompt}" "${session}"`
    }
}
