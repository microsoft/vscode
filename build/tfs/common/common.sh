#!/bin/bash
set -e

# set agent specific npm cache
if [ -n "$AGENT_WORKFOLDER" ]
then
	export npm_config_cache="$AGENT_WORKFOLDER/npm-cache"
	echo "Using npm cache: $npm_config_cache"
fi

SUMMARY="Task;Duration"$'\n'
step() {
	START=$SECONDS
	TASK=$1; shift
	echo ""
	echo "*****************************************************************************"
	echo "Start: $TASK"
	echo "*****************************************************************************"
	"$@"

	# Calculate total duration
	TOTAL=$(echo "$SECONDS - $START" | bc)
	M=$(echo "$TOTAL / 60" | bc)
	S=$(echo "$TOTAL % 60" | bc)
	DURATION="$(printf "%02d" $M):$(printf "%02d" $S)"

	echo "*****************************************************************************"
	echo "End: $TASK, Total: $DURATION"
	echo "*****************************************************************************"
	SUMMARY="$SUMMARY$TASK;$DURATION"$'\n'
}

done_steps() {
	echo ""
	echo "Build Summary"
	echo "============="
	echo "${SUMMARY}" | column -t -s';'
}

trap done_steps EXIT