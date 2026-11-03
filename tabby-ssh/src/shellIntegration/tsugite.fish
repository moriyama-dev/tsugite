# Written by Tsugite (https://github.com/moriyama-dev/tsugite). Overwritten on each connection.
# After each command, tells the terminal which folder the shell is in (OSC 7), so
# Tsugite's explorer can follow it. Terminals that do not know OSC 7 ignore it.
status is-interactive; or exit 0

function __tsugite_report_cwd --on-event fish_prompt
    # "%" is the only character escaped, so the path can be decoded unambiguously
    set -l p (string replace -a -- % %25 $PWD)
    if set -q TMUX
        # tmux passes this on only with "set -g allow-passthrough on"
        printf '\ePtmux;\e\e]7;file://%s%s\a\e\\\\' $hostname $p
    else
        printf '\e]7;file://%s%s\a' $hostname $p
    end
end
