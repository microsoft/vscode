#!/usr/bin/env bash

# ---------------------------------------------------------------------------------------------
# Copyright (C) 2025 Lotas Inc. All rights reserved.
# ---------------------------------------------------------------------------------------------

if [ $# -lt 2 ]; then
	echo "Usage: $0 <output-file> <program> [program-args...]" >&2
	echo "       $0 nohup <output-file> <program> [program-args...]" >&2
	exit 1
fi

use_nohup=false
if [ "$1" = "nohup" ]; then
	use_nohup=true
	shift

	if [ $# -lt 2 ]; then
		echo "Usage: $0 nohup <output-file> <program> [program-args...]" >&2
		exit 1
	fi
fi

output_file="$1"
shift

DEFAULT_SHELL=$SHELL

if [ -z "$DEFAULT_SHELL" ]; then
    DEFAULT_SHELL=$(which bash 2>/dev/null || which sh)
fi

if [ -z "$DEFAULT_SHELL" ] || [ ! -x "$DEFAULT_SHELL" ]; then
    echo "Error: Could not determine a valid shell." >&2
    exit 1
fi

echo "$DEFAULT_SHELL" -l -c "$@" >> "$output_file"

QUOTED_ARGS=""
for arg in "$@"; do
    escaped_arg=$(printf "%s" "$arg" | sed "s/'/'\\\\''/g")
    QUOTED_ARGS="${QUOTED_ARGS} '${escaped_arg}'"
done

if [ "$use_nohup" = true ]; then
	nohup $DEFAULT_SHELL -l -c "${QUOTED_ARGS}" >> "$output_file" 2>&1 &
	wait $!
else
	$DEFAULT_SHELL -l -c "${QUOTED_ARGS}" >> "$output_file" 2>&1
fi

exit_code=$?

exit $exit_code