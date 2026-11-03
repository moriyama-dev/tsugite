# Written by Tsugite (https://github.com/moriyama-dev/tsugite). Overwritten on each connection.
# After each command, tells the terminal which folder the shell is in (OSC 7), so
# Tsugite's explorer can follow it. Terminals that do not know OSC 7 ignore it.
[[ -n "${__tsugite_cwd_hook-}" || ! -o interactive ]] && return 0
__tsugite_cwd_hook=1

__tsugite_report_cwd() {
    local exit_status=$?
    # "%" is the only character escaped, so the path can be decoded unambiguously
    local p="${PWD//\%/%25}"
    if [[ -n "${TMUX-}" ]]; then
        # tmux passes this on only with "set -g allow-passthrough on"
        printf '\033Ptmux;\033\033]7;file://%s%s\007\033\\' "${HOST-}" "$p"
    else
        printf '\033]7;file://%s%s\007' "${HOST-}" "$p"
    fi
    return $exit_status
}

autoload -Uz add-zsh-hook
add-zsh-hook precmd __tsugite_report_cwd
