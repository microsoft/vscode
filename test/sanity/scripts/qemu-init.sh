#!/bin/sh
# Init script for QEMU system emulation
# This script runs as PID 1 inside the VM, sets up the environment,
# and then executes the container's entrypoint

# Mount essential filesystems
mount -t proc proc /proc
mount -t sysfs sys /sys
mount -t devtmpfs dev /dev
mkdir -p /dev/pts
mount -t devpts devpts /dev/pts

# Set up networking - QEMU user-mode provides DHCP and DNS
ip link set lo up
ip link set eth0 up 2>/dev/null || ip link set enp0s1 up 2>/dev/null || true
udhcpc -i eth0 2>/dev/null || udhcpc -i enp0s1 2>/dev/null || dhclient eth0 2>/dev/null || dhclient enp0s1 2>/dev/null || true

# Fallback: manually configure if DHCP fails
# QEMU user-mode network: gateway 10.0.2.2, DNS 10.0.2.3
if ! ip addr show eth0 2>/dev/null | grep -q "inet "; then
	ip addr add 10.0.2.15/24 dev eth0 2>/dev/null || ip addr add 10.0.2.15/24 dev enp0s1 2>/dev/null || true
	ip route add default via 10.0.2.2 2>/dev/null || true
fi

# Set up DNS resolution
echo "nameserver 10.0.2.3" > /etc/resolv.conf

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Read test arguments and execute entrypoint
ARGS=$(cat /test-args)
exec /entrypoint.sh $ARGS
