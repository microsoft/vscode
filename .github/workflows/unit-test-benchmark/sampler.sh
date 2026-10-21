#!/usr/bin/env bash
# [experiment] DO NOT MERGE. Samples CPU, memory, disk (vmstat) and pressure stall information
# (/proc/pressure) every 2 seconds into <directory> until it is terminated.
set -u

dir=$1
vmstat -n -t -w 2 > "$dir/vmstat.log" 2>&1 &
vmstat_pid=$!
trap 'kill "$vmstat_pid" 2>/dev/null; exit 0' TERM INT

while true; do
	echo "$(date +%s) cpu $(head -1 /proc/pressure/cpu 2>/dev/null) io $(head -1 /proc/pressure/io 2>/dev/null) memory $(head -1 /proc/pressure/memory 2>/dev/null)" >> "$dir/psi.log"
	sleep 2 &
	wait $!
done
