#!/bin/bash

function get_total_cpu_time() {
  # Read the first line of /proc/stat and remove the cpu prefix
  cpu=($(sed -n 's/^cpu\s//p' /proc/stat))

  # Sum all of the values in cpu to get total time
  for value in "${cpu[@]}"; do
    let $1=$1+$value
  done
}

total_time_before=0
get_total_cpu_time total_time_before

# Loop over the arguments, which are a list of PIDs
# The 13th and 14th words in /proc/<PID>/stat are the user and system time
# the process has used, so sum these to get total process run time
declare -a process_before_times
iter=0
for pid in "$@"; do
  if [ -f /proc/"$pid"/stat ]
  then
    process_stat_array=($(cat /proc/"$pid"/stat))
    process_time_before=$((${process_stat_array[13]}+${process_stat_array[14]}))
  else
    process_time_before=0
  fi

  process_before_times[$iter]=$process_time_before
  ((++iter))
done

# Wait for a second
sleep 1

total_time_after=0
get_total_cpu_time total_time_after

# Check the user and system time sum of each process again and compute the change
# in process time used over total system time
iter=0
for pid in "$@"; do
  if [ -f /proc/"$pid"/stat ]
  then
    process_stat_array=($(cat /proc/"$pid"/stat))
    process_time_after=$((${process_stat_array[13]}+${process_stat_array[14]}))
  else
    process_time_after=${process_before_times[$iter]}
  fi

  process_time_before=${process_before_times[$iter]}
  process_delta=$((process_time_after-process_time_before))
  total_delta=$((total_time_after-total_time_before))
  cpu_usage=$((100*process_delta/total_delta))

  # Parent script reads from stdout, so echo result to be read
  echo "$cpu_usage"
  ((++iter))
done
