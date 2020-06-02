#!/bin/bash

NONROOT_USER=node
LOG=/tmp/container-init.log

# Execute the command it not already running
startInBackgroundIfNotRunning()
{
	log "Starting $1."
	echo -e "\n** $(date) **" | sudoIf tee -a /tmp/$1.log > /dev/null
	if [ ! -f "/tmp/$1.pid" ] || ! ps -p $(cat /tmp/$1.pid) > /dev/null; then
		($2 sh -c "while :; do echo [\$(date)] Process started.; $3; echo [\$(date)] Process exited!; sleep 5; done 2>&1" | sudoIf tee -a /tmp/$1.log > /dev/null & echo "$!" | sudoIf tee /tmp/$1.pid > /dev/null)
		log "$1 started."
	else
		echo "$1 is already running." | sudoIf tee -a /tmp/$1.log > /dev/null
		log "$1 is already running."
	fi
}

# Use sudo to run as root when required
sudoIf()
{
    if [ "$(id -u)" -ne 0 ]; then
        sudo "$@"
    else
        "$@"
    fi
}

# Use sudo to run as non-root user if not already running
sudoUserIf()
{
    if [ "$(id -u)" -eq 0 ]; then
        sudo -u ${NONROOT_USER} "$@"
    else
        "$@"
    fi
}

# Log messages
log()
{
    echo -e "[$(date)] $@" | sudoIf tee -a $LOG > /dev/null
}

log "** SCRIPT START **"

# Start dbus.
log 'Running "/etc/init.d/dbus start".'
if [ -f "/var/run/dbus/pid" ] && ! ps -p $(cat /var/run/dbus/pid) > /dev/null; then
	sudoIf rm -f /var/run/dbus/pid
fi
sudoIf /etc/init.d/dbus start 2>&1 | sudoIf tee -a /tmp/dbus-daemon-system.log > /dev/null
while ! pidof dbus-daemon > /dev/null; do
	sleep 1
done

# Set up Xvfb.
startInBackgroundIfNotRunning "Xvfb" sudoIf "Xvfb ${DISPLAY:-:1} +extension RANDR -screen 0 ${MAX_VNC_RESOLUTION:-1920x1080x16}"
while ! pidof Xvfb > /dev/null; do
	sleep 1
done

# Start fluxbox as a light weight window manager.
startInBackgroundIfNotRunning "fluxbox" sudoUserIf "dbus-launch startfluxbox"
while ! pidof fluxbox > /dev/null; do
	sleep 1
done

# Set resolution
/usr/local/bin/set-resolution ${VNC_RESOLUTION:-1280x720} ${VNC_DPI:-72}

# Start x11vnc if installed.
if type x11vnc 2>&1 > /dev/null; then
	startInBackgroundIfNotRunning "x11vnc" sudoIf "x11vnc -display ${DISPLAY:-:1} -rfbport ${VNC_PORT:-5901}  -listen localhost -rfbportv6 ${VNC_PORT:-5901} -listenv6 localhost -xkb -shared -forever -nopw"
else
	log "Skipping x11vnc - not installed."
fi

# Spin up noVNC if installed.
if [ -d "/usr/local/novnc" ]; then
	startInBackgroundIfNotRunning "noVNC" sudoIf "/usr/local/novnc/noVNC*/utils/launch.sh --listen ${NOVNC_PORT:-6080} --vnc localhost:${VNC_PORT:-5901}"
else
	log "Skipping noVNC - not installed."
fi

# Run whatever was passed in
log "Executing \"$@\"."
"$@"
log "** SCRIPT EXIT **"
