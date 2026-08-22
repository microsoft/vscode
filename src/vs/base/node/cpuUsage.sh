#!/bin/bash

function get_total_cpu_time() {
  # Read the first line of /proc/stat and remove the cpu prefix
  CPU=(`sed -n 's/^cpu\s//p' /proc/stat`)

  # Sum all of the values in CPU to get total time
  for VALUE in "${CPU[@]}"; do
    let $1=$1+$VALUE
  done
}

# Sum the user (utime) and system (stime) CPU time of a process, which are
# fields 14 and 15 of /proc/<pid>/stat. Echoes the fallback in $2 when the
# process has exited or its stat can no longer be read - a process can vanish
# between listing it and reading its stat, leaving the values empty. Field 2
# (comm) is wrapped in parentheses and may itself contain spaces, so the
# numeric fields are counted after the final ")" instead of by splitting the
# whole line.
function get_process_time() {
  local PID=$1
  local FALLBACK=$2

  # 2>/dev/null so reading a file that just vanished does not pollute stderr;
  # ps.ts treats any stderr from this script as fatal.
  local STAT=$(cat "/proc/$PID/stat" 2>/dev/null)
  local AFTER_COMM=${STAT##*) }
  local FIELDS=($AFTER_COMM)

  # After dropping everything up to the final ")", index 0 is "state", so
  # utime and stime are at indices 11 and 12.
  if [ -n "${FIELDS[11]}" ] && [ -n "${FIELDS[12]}" ]
  then
    echo "$(( ${FIELDS[11]} + ${FIELDS[12]} ))"
  else
    echo "$FALLBACK"
  fi
}

TOTAL_TIME_BEFORE=0
get_total_cpu_time TOTAL_TIME_BEFORE

# Loop over the arguments, which are a list of PIDs, recording each process's
# CPU time so the change can be computed after a short wait.
declare -a PROCESS_BEFORE_TIMES
ITER=0
for PID in "$@"; do
  PROCESS_BEFORE_TIMES[$ITER]=$(get_process_time "$PID" 0)
  ((++ITER))
done

# Wait for a second
sleep 1

TOTAL_TIME_AFTER=0
get_total_cpu_time TOTAL_TIME_AFTER

# Check the CPU time of each process again and compute the change in process
# time used over the change in total system time. A process that has exited
# falls back to its previous time, yielding a zero delta.
ITER=0
for PID in "$@"; do
  PROCESS_TIME_BEFORE=${PROCESS_BEFORE_TIMES[$ITER]}
  PROCESS_TIME_AFTER=$(get_process_time "$PID" "$PROCESS_TIME_BEFORE")

  let PROCESS_DELTA=$PROCESS_TIME_AFTER-$PROCESS_TIME_BEFORE
  let TOTAL_DELTA=$TOTAL_TIME_AFTER-$TOTAL_TIME_BEFORE
  CPU_USAGE=`echo "$((100*$PROCESS_DELTA/$TOTAL_DELTA))"`

  # Parent script reads from stdout, so echo result to be read
  echo $CPU_USAGE
  ((++ITER))
done
