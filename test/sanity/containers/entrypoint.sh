#!/bin/sh
set -e

if [ -n "$DISPLAY" ]; then
	echo "Starting X11 Server"
	Xvfb $DISPLAY -screen 0 1280x960x24 -ac +extension GLX +render -noreset &
fi

if command -v dbus-daemon > /dev/null 2>&1; then
	echo "Starting Desktop Bus"
	dbus-daemon --system --fork
fi

echo "Running sanity tests"
node /root/out/index.js "$@"
