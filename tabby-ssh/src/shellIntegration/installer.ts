export interface ShellHooks {
    bash: string
    zsh: string
    fish: string
}

/** The line added to a shell's start-up file; "tsugite/tsugite." is how an existing one is recognized */
const sourceLine = (ext: string): string =>
    `[ -f "$HOME/.config/tsugite/tsugite.${ext}" ] && . "$HOME/.config/tsugite/tsugite.${ext}" # Added by Tsugite: lets its explorer follow the folder you are in`

/**
 * A POSIX sh script, fed to `sh -s` on the remote machine before the shell starts, that
 * sets up the shells there to report their folder (OSC 7) after each command:
 * - writes the hooks to ~/.config/tsugite/ (and fish's to its conf.d, which fish reads by itself)
 * - adds one line that loads the hook to ~/.bashrc / ~/.zshrc, once, for the shells in use
 * Nothing is replaced or removed; deleting the line and ~/.config/tsugite undoes it.
 */
export function buildShellIntegrationInstaller (hooks: ShellHooks): string {
    const heredoc = (path: string, content: string) => `cat > "${path}" <<'TSUGITE_EOF'\n${content.replace(/\n?$/, '\n')}TSUGITE_EOF`
    return [
        'umask 022',
        'd="$HOME/.config/tsugite"',
        'mkdir -p "$d" || exit 0',
        heredoc('$d/tsugite.bash', hooks.bash),
        heredoc('$d/tsugite.zsh', hooks.zsh),
        // Appends the line unless one is there, starting it on a line of its own
        'add () {',
        '    grep -qs "tsugite/tsugite\\." "$1" && return 0',
        '    if [ -s "$1" ] && [ -n "$(tail -c 1 "$1")" ]; then echo >> "$1"; fi',
        '    printf "%s\\n" "$2" >> "$1"',
        '}',
        'login_shell=$(basename "${SHELL:-sh}")',
        `if [ "$login_shell" = bash ] || [ -f "$HOME/.bashrc" ]; then`,
        `    add "$HOME/.bashrc" '${sourceLine('bash')}'`,
        // A login bash reads ~/.bash_profile, which on macOS often does not load ~/.bashrc
        `    if [ -f "$HOME/.bash_profile" ] && ! grep -qs bashrc "$HOME/.bash_profile"; then add "$HOME/.bash_profile" '${sourceLine('bash')}'; fi`,
        'fi',
        `if [ "$login_shell" = zsh ] || [ -f "$HOME/.zshrc" ]; then`,
        `    add "$HOME/.zshrc" '${sourceLine('zsh')}'`,
        'fi',
        'if [ "$login_shell" = fish ] || [ -d "$HOME/.config/fish" ]; then',
        '    mkdir -p "$HOME/.config/fish/conf.d" &&',
        heredoc('$HOME/.config/fish/conf.d/tsugite.fish', hooks.fish),
        'fi',
        'exit 0',
        '',
    ].join('\n')
}
