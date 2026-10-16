#!/usr/bin/env bash
# TEMPORARY: samples runner memory while a command runs; removed before merge.
# usage: tmp-mem-sampler.sh <label> <command...>
label=$1; shift
out="/tmp/mem-peak-$label.txt"
(
	peak=0
	while :; do
		used=$(free -m | awk '/^Mem:/{print $3}')
		if [ "$used" -gt "$peak" ]; then
			peak=$used
			{
				echo "peak used ${used} MB at $(date +%T)"
				ps -eo rss=,args= --sort=-rss | head -15 | awk '{rss=$1; $1=""; printf "%7d MB %s\n", rss/1024, substr($0, 2, 160)}'
			} > "$out.tmp" && mv "$out.tmp" "$out"
		fi
		sleep 1
	done
) &
sampler=$!
start=$(date +%s)
rc=0
"$@" || rc=$?
kill "$sampler" 2>/dev/null
echo "::group::Memory peak ($label), duration $(( $(date +%s) - start ))s"
free -m
cat "$out"
echo "::endgroup::"
echo "MEMPEAK $label $(head -1 "$out") duration=$(( $(date +%s) - start ))s"
exit $rc
