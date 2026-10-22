#!/bin/bash
# Only on a real removal; an upgrade runs after-install again right away
if [ "$1" = "remove" ] || [ "$1" = "purge" ]; then
    rm -f '/usr/bin/${executable}'
fi
