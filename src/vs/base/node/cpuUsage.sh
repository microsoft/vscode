#!/bin/bash

function get_total_cpu_time() {
  # Read the first line of /proc/stat and remove the cpu prefix
  CPU=(`sed -n 's/^cpu\s//p' /proc/stat`)

  # Sum all of the values in CPU to get total time
  for VALUE in "${CPU[@]}"; do
    let $1=$1+$VALUE
  done
}

TOTAL_TIME_BEFORE=0
get_total_cpu_time TOTAL_TIME_BEFORE

# Loop over the arguments, which are a list of PIDs
# The 13th and 14th words in /proc/<PID>/stat are the user and system time
# the process has used, so sum these to get total process run time
declare -a PROCESS_BEFORE_TIMES
ITER=0
for PID in "$@"; do
  if [ -f /proc/$PID/stat ]
  then
    PROCESS_STATS=`cat /proc/$PID/stat`
    PROCESS_STAT_ARRAY=($PROCESS_STATS)

    let PROCESS_TIME_BEFORE="${PROCESS_STAT_ARRAY[13]}+${PROCESS_STAT_ARRAY[14]}"
  else
    let PROCESS_TIME_BEFORE=0
  fi

  PROCESS_BEFORE_TIMES[$ITER]=$PROCESS_TIME_BEFORE
  ((ITER++))
done

# Wait for a second
sleep 1

TOTAL_TIME_AFTER=0
get_total_cpu_time TOTAL_TIME_AFTER

# Check the user and system time sum of each process again and compute the change
# in process time used over total system time
ITER=0
for PID in "$@"; do
  if [ -f /proc/$PID/stat ]
  then
    PROCESS_STATS=`cat /proc/$PID/stat`
    PROCESS_STAT_ARRAY=($PROCESS_STATS)

    let PROCESS_TIME_AFTER="${PROCESS_STAT_ARRAY[13]}+${PROCESS_STAT_ARRAY[14]}"
  else
    let PROCESS_TIME_AFTER=${PROCESS_BEFORE_TIMES[$ITER]}
  fi

  PROCESS_TIME_BEFORE=${PROCESS_BEFORE_TIMES[$ITER]}
  let PROCESS_DELTA=$PROCESS_TIME_AFTER-$PROCESS_TIME_BEFORE
  let TOTAL_DELTA=$TOTAL_TIME_AFTER-$TOTAL_TIME_BEFORE
  CPU_USAGE=`echo "100*$PROCESS_DELTA/$TOTAL_DELTA" | bc -l`

  # Parent script reads from stdout, so echo result to be read
  echo $CPU_USAGE
  ((ITER++))
done
