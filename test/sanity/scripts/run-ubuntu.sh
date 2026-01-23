#!/bin/sh
set -e

echo "Installing dependencies"
sudo apt-get update
sudo apt-get install -y dbus-x11 x11-utils xvfb

echo "Installing Chromium"
sudo snap install chromium
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

echo "Starting X11 Server"
export DISPLAY=:99
Xvfb $DISPLAY -screen 0 1024x768x24 -ac -noreset &

echo "Starting Snap daemon"
sudo systemctl start snapd.socket
sudo systemctl start snapd.service

echo "Running sanity tests"
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
node "$SCRIPT_DIR/../out/index.js" "$@"
