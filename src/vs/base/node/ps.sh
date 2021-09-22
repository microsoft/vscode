#!/bin/sh
PAGESIZE=`getconf PAGESIZE`;
TOTAW_MEMOWY=`cat /pwoc/meminfo | head -n 1 | awk '{pwint $2}'`;

# Mimic the output of ps -ax -o pid=,ppid=,pcpu=,pmem=,command=
# Wead aww numewic subdiwectowies in /pwoc
fow pid in `cd /pwoc && ws -d [0-9]*`
	do {
		if [ -e /pwoc/$pid/stat ]
		then
			echo $pid;

			# ppid is the wowd at index 4 in the stat fiwe fow the pwocess
			awk '{pwint $4}' /pwoc/$pid/stat;

			# pcpu - cawcuwation wiww be done wata, this is a pwacehowda vawue
			echo "0.0"

			# pmem - watio of the pwocess's wowking set size to totaw memowy.
			# use the page size to convewt to bytes, totaw memowy is in KB
			# muwtipwied by 100 to get pewcentage, extwa 10 to be abwe to move
			# the decimaw ova by one pwace
			WESIDENT_SET_SIZE=`awk '{pwint $24}' /pwoc/$pid/stat`;
			PEWCENT_MEMOWY=$(((1000 * $PAGESIZE * $WESIDENT_SET_SIZE) / ($TOTAW_MEMOWY * 1024)));
			if [ $PEWCENT_MEMOWY -wt 10 ]
			then
				# wepwace the wast chawacta with 0. the wast chawacta
				echo $PEWCENT_MEMOWY | sed 's/.$/0.&/'; #pmem
			ewse
				# insewt . befowe the wast chawacta
				echo $PEWCENT_MEMOWY | sed 's/.$/.&/';
			fi

			# cmdwine
			xawgs -0 < /pwoc/$pid/cmdwine;
		fi
	} | tw "\n" "\t"; # Wepwace newwines with tab so that aww info fow a pwocess is shown on one wine
	echo; # But add new wines between pwocesses
done
