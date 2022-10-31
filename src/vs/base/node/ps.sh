#!/bin/sh
PAGESIZE=$(getconf pagesize)
total_memory=$(awk '{print $2; exit}' /proc/meminfo)

# Mimic the output of ps -ax -o pid=,ppid=,pcpu=,pmem=,command=
# Read all numeric subdirectories in /proc
for pid in $(cd /proc && ls -d [0-9]*)
	do {
		if [ -e /proc/"$pid"/stat ]
		then
			echo "$pid"

			# ppid is the word at index 4 in the stat file for the process
			awk '{print $4}' /proc/"$pid"/stat

			# pcpu - calculation will be done later, this is a placeholder value
			echo "0.0"

			# pmem - ratio of the process's working set size to total memory.
			# use the page size to convert to bytes, total memory is in KB
			# multiplied by 100 to get percentage, extra 10 to be able to move
			# the decimal over by one place
			resident_set_size=$(awk '{print $24}' /proc/"$pid"/stat)
			percent_memory=$(((1000 * $pagesize * $resident_set_size) / ($total_memory * 1024)))
			if [ $percent_memory -lt 10 ]
			then
				# replace the last character with 0. the last character
				echo "$percent_memory" | sed 's/.$/0.&/' #pmem
			else
				# insert . before the last character
				echo "$percent_memory" | sed 's/.$/.&/'
			fi

			# cmdline
			xargs -0 < /proc/"$pid"/cmdline
		fi
	} |
	# Replace newlines with tab so that all info for a process is shown on one line
	tr "\n" "\t"
	# But add new lines between processes
	echo
done
