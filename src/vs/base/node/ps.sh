#!/bin/sh
PAGESIZE=`getconf PAGESIZE`;
TOTAL_MEMORY=`cat /proc/meminfo | head -n 1 | awk '{print $2}'`;

# Mimic the output of ps -ax -o pid=,ppid=,pcpu=,pmem=,command=
# Read all numeric subdirectories in /proc
# A process can exit at any point between enumerating /proc and reading its
# files, so every access below races against process exit. Errors from these
# reads are suppressed and the vanished process skipped or reported with
# placeholder values instead of failing the whole listing.
# (https://github.com/microsoft/vscode/issues/186500)
for pid in `cd /proc && ls -d [0-9]* 2>/dev/null`
	do {
		if [ -e /proc/$pid/stat ]
		then
			echo $pid;

			# ppid is the word at index 4 in the stat file for the process
			awk '{print $4}' /proc/$pid/stat 2>/dev/null;

			# pcpu - calculation will be done later, this is a placeholder value
			echo "0.0"

			# pmem - ratio of the process's working set size to total memory.
			# use the page size to convert to bytes, total memory is in KB
			# multiplied by 100 to get percentage, extra 10 to be able to move
			# the decimal over by one place
			RESIDENT_SET_SIZE=`awk '{print $24}' /proc/$pid/stat 2>/dev/null`;
			if [ -n "$RESIDENT_SET_SIZE" ]
			then
				PERCENT_MEMORY=$(((1000 * $PAGESIZE * $RESIDENT_SET_SIZE) / ($TOTAL_MEMORY * 1024)));
				if [ $PERCENT_MEMORY -lt 10 ]
				then
					# replace the last character with 0. the last character
					echo $PERCENT_MEMORY | sed 's/.$/0.&/'; #pmem
				else
					# insert . before the last character
					echo $PERCENT_MEMORY | sed 's/.$/.&/';
				fi
			else
				# the process exited between the existence check above and
				# reading its stat file - report without memory data
				echo "0.0"
			fi

			# cmdline
			xargs -0 < /proc/$pid/cmdline 2>/dev/null;
		fi
	} | tr "\n" "\t"; # Replace newlines with tab so that all info for a process is shown on one line
	echo; # But add new lines between processes
done
