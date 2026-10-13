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
for arg in "$@"; do
	if [ "$arg" = "--setuid-sandbox" ]; then
		# Only the dedicated setuid pass needs a non-root runner and privileged package installation.
		if ! command -v sudo > /dev/null 2>&1; then
			if command -v apt-get > /dev/null 2>&1; then
				apt-get update
				apt-get install -y sudo
			elif command -v dnf > /dev/null 2>&1; then
				dnf install -y sudo
			elif command -v yum > /dev/null 2>&1; then
				yum install -y sudo
			elif command -v zypper > /dev/null 2>&1; then
				zypper --non-interactive install sudo
			else
				echo "Error: no supported package manager to install sudo for setuid sandbox tests" >&2
				exit 1
			fi
		fi
		useradd --create-home sanity
		printf 'sanity ALL=(root) NOPASSWD: /usr/bin/dpkg, /usr/bin/rpm\n' > /etc/sudoers.d/sanity
		chmod 440 /etc/sudoers.d/sanity
		chmod 755 /root
		chown sanity /root
		mkdir -p /root/screenshots /root/crash-dumps
		chown -R sanity /root/screenshots /root/crash-dumps
		exec runuser -u sanity -- node /root/out/index.js "$@"
	fi
done
node /root/out/index.js "$@"
