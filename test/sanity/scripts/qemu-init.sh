#!/bin/sh

echo "Mounting essential filesystems"
mount -t proc proc /proc
mount -t sysfs sys /sys
mount -t devtmpfs dev /dev || true
mkdir -p /dev/pts
mount -t devpts devpts /dev/pts

echo "Setting up networking"
ip link set lo up
ip link set eth0 up || ip link set enp0s1 up || true
ip addr add 10.0.2.15/24 dev eth0 || ip addr add 10.0.2.15/24 dev enp0s1 || true
ip route add default via 10.0.2.2 || true
echo "nameserver 10.0.2.3" > /etc/resolv.conf

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

echo "Starting entrypoint"
ARGS=$(cat /test-args)
exec /entrypoint.sh $ARGS
