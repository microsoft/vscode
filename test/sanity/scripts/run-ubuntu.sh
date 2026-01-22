#!/bin/sh
set -e

echo "Installing dependencies"
sudo apt-get update
sudo apt-get install -y dbus-x11 snapd x11-utils xvfb

echo "Chromium"
sudo snap install chromium
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

echo "Starting X11 Server"
Xvfb $DISPLAY -screen 0 1280x960x24 -ac +extension GLX +render -noreset &

#echo "Starting Desktop Bus"
#dbus-daemon --system --fork

echo "Starting Snap Daemon"
sudo systemctl start snapd.socket
sudo systemctl start snapd.service

echo "Running Tests"
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
node "$SCRIPT_DIR/../out/index.js" "$@"
