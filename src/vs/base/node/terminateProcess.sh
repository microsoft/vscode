#!/bin/sh

ROOT_PID=$1
SIGNAL=$2

terminateTree() {
	for cpid in $(pgrep -P $1); do
		terminateTree $cpid
	done
	kill -$SIGNAL $1 > /dev/null 2>&1
}

terminateTree $ROOT_PID
