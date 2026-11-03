# Written by Tsugite (https://github.com/moriyama-dev/tsugite). Overwritten on each connection.
# After each command, tells the terminal which folder the shell is in (OSC 7), so
# Tsugite's explorer can follow it. Terminals that do not know OSC 7 ignore it.
[ -n "${__tsugite_cwd_hook-}" ] && return 0
case $- in *i*) ;; *) return 0 ;; esac
__tsugite_cwd_hook=1

__tsugite_report_cwd() {
    local status=$?
    # "%" is the only character escaped, so the path can be decoded unambiguously
    local path="${PWD//\%/%25}"
    if [ -n "${TMUX-}" ]; then
        # tmux passes this on only with "set -g allow-passthrough on"
        printf '\033Ptmux;\033\033]7;file://%s%s\007\033\\' "${HOSTNAME-}" "$path"
    else
        printf '\033]7;file://%s%s\007' "${HOSTNAME-}" "$path"
    fi
    return $status
}

if [[ "$(declare -p PROMPT_COMMAND 2>/dev/null)" == "declare -a"* ]]; then
    PROMPT_COMMAND=(__tsugite_report_cwd "${PROMPT_COMMAND[@]}")
else
    PROMPT_COMMAND="__tsugite_report_cwd${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
fi
