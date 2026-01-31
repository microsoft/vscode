#!/bin/sh
set -e

# Mount kernel filesystems (proc for process info, sysfs for device info)
echo "Mounting kernel filesystems"
mount -t proc proc /proc
mount -t sysfs sys /sys

# Mount pseudo-terminal and shared memory filesystems
echo "Mounting PTY and shared memory"
mkdir -p /dev/pts
mount -t devpts devpts /dev/pts
mkdir -p /dev/shm
mount -t tmpfs tmpfs /dev/shm

# Mount temporary directories with proper permissions
echo "Mounting temporary directories"
mount -t tmpfs tmpfs /tmp
chmod 1777 /tmp
mount -t tmpfs tmpfs /var/tmp

# Mount runtime directory for services (D-Bus, XDG)
echo "Mounting runtime directories"
mount -t tmpfs tmpfs /run
mkdir -p /run/dbus
mkdir -p /run/user/0
chmod 700 /run/user/0

echo "Setting up machine-id for D-Bus"
cat /proc/sys/kernel/random/uuid | tr -d '-' > /etc/machine-id

echo "Setting system clock"
date -s "$(cat /host-time)"

echo "Setting up networking"
ip link set lo up
ip link set eth0 up
ip addr add 10.0.2.15/24 dev eth0
ip route add default via 10.0.2.2
echo "nameserver 10.0.2.3" > /etc/resolv.conf

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export XDG_RUNTIME_DIR=/run/user/0

echo "Starting entrypoint"
sh /root/containers/entrypoint.sh $(cat /test-args)
echo $? > /exit-code
sync

echo "Powering off"
echo o > /proc/sysrq-trigger
