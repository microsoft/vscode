#!/bin/bash

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

# Extract the git subcommand from the command line, skipping global options that
# precede it (e.g. `git -C repo push origin main`, `git -c x=y reset --hard`,
# `FOO=1 git clean -fd`). Matching the raw string alone misses those forms.
SUBCOMMAND=""
ARGS=""
TOKENS=($COMMAND)
for ((i = 0; i < ${#TOKENS[@]}; i++)); do
	if [ "${TOKENS[$i]}" = "git" ]; then
		j=$((i + 1))
		while [ $j -lt ${#TOKENS[@]} ]; do
			case "${TOKENS[$j]}" in
				-C | -c | --git-dir | --work-tree | --exec-path | --namespace | --super-prefix)
					j=$((j + 2))
					continue
					;;
				--no-pager | --paginate | -p | --no-replace-objects | --bare | -P)
					j=$((j + 1))
					continue
					;;
				*)
					SUBCOMMAND="${TOKENS[$j]}"
					ARGS=("${TOKENS[@]:$((j + 1))}")
					break
					;;
			esac
		done
		break
	fi
done

blocked() {
	echo "BLOCKED: '$COMMAND' matches a dangerous git pattern ($1). The user has prevented you from doing this." >&2
	exit 2
}

case "$SUBCOMMAND" in
	push)
		blocked "git push"
		;;
	reset)
		for a in "${ARGS[@]}"; do
			case "$a" in --hard) blocked "git reset --hard" ;; esac
		done
		;;
	clean)
		for a in "${ARGS[@]}"; do
			case "$a" in -fd* | -df* | -f* | -ff*) blocked "git clean -f" ;; esac
		done
		;;
	branch)
		for a in "${ARGS[@]}"; do
			case "$a" in -D | -dD | -dD* | -DD*) blocked "git branch -D" ;; esac
		done
		;;
	checkout | restore)
		for a in "${ARGS[@]}"; do
			case "$a" in . | -- . | "..") blocked "git $SUBCOMMAND ." ;; esac
		done
		;;
esac

exit 0
