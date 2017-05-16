#!/bin/bash
set -e

# set agent specific npm cache
if [ -n "$AGENT_WORKFOLDER" ]
then
	export npm_config_cache="$AGENT_WORKFOLDER/npm-cache"
	echo "Using npm cache: $npm_config_cache"
fi

SUMMARY=""
step() {
	START=$SECONDS
	TASK=$1; shift
	echo ""
	echo "*****************************************************************************"
	echo "Start: $TASK"
	echo "*****************************************************************************"
	"$@"
	DURATION=$(echo "$SECONDS - $START" | bc)
	echo "*****************************************************************************"
	echo "End: $TASK, $DURATION seconds"
	echo "*****************************************************************************"
	SUMMARY="$SUMMARY$TASK;$DURATION seconds"$'\n'
}

done_steps() {
	echo ""
	echo "Task Summary"
	echo "============"
	echo "${SUMMARY}" | column -t -s';'
}

trap done_steps EXIT