#!/bin/sh

echo "Mounting essential filesystems"
mount -t proc proc /proc
mount -t sysfs sys /sys
mkdir -p /dev/pts
mount -t devpts devpts /dev/pts

echo "Setting system clock"
date -s "$(cat /host-time)" > /dev/null 2>&1 || true

echo "Setting up networking"
ip link set lo up
ip link set eth0 up
ip addr add 10.0.2.15/24 dev eth0
ip route add default via 10.0.2.2
echo "nameserver 10.0.2.3" > /etc/resolv.conf

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

echo "Starting entrypoint"
ARGS=$(cat /test-args)
/entrypoint.sh $ARGS
EXIT_CODE=$?

echo "Powering off"
poweroff -f
