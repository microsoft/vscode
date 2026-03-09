#!/bin/sh
set -e

echo "System: $(uname -s) $(uname -r) $(uname -m), page size: $(getconf PAGESIZE) bytes"
echo "Memory: $(awk '/MemTotal/ {t=$2} /MemAvailable/ {a=$2} END {printf "%.0f MB total, %.0f MB available", t/1024, a/1024}' /proc/meminfo)"
echo "Disk: $(df -h / | awk 'NR==2 {print $2 " total, " $3 " used, " $4 " available"}')"

if command -v Xvfb > /dev/null 2>&1; then
	echo "Starting X11 Server"
	export DISPLAY=:99
	Xvfb $DISPLAY -screen 0 1024x768x24 -ac -noreset &
fi

if command -v dbus-daemon > /dev/null 2>&1; then
	echo "Starting Desktop Bus"
	dbus-daemon --system --fork
fi

export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

echo "Running sanity tests"
node /root/out/index.js "$@"
