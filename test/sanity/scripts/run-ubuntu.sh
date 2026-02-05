#!/bin/sh
set -e

echo "System: $(uname -s) $(uname -r) $(uname -m)"
echo "Memory: $(free -h | awk '/^Mem:/ {print $2 " total, " $3 " used, " $7 " available"}')"
echo "Disk: $(df -h / | awk 'NR==2 {print $2 " total, " $3 " used, " $4 " available"}')"

echo "Configuring Azure mirror"
sudo sed -i 's|http://archive.ubuntu.com|http://azure.archive.ubuntu.com|g' /etc/apt/sources.list

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
