#!/bin/sh

echo "Mounting essential filesystems"
mount -t proc proc /proc
mount -t sysfs sys /sys
mount -t devtmpfs dev /dev
mkdir -p /dev/pts
mount -t devpts devpts /dev/pts

echo "Setting up networking"
ip link set lo up
ip link set eth0 up || ip link set enp0s1 up || true
udhcpc -i eth0 || udhcpc -i enp0s1 || dhclient eth0 || dhclient enp0s1 || true

if ! ip addr show eth0 | grep -q "inet " && ! ip addr show enp0s1 | grep -q "inet "; then
	echo "Configuring fallback network since DHCP failed"
	ip addr add 10.0.2.15/24 dev eth0 || ip addr add 10.0.2.15/24 dev enp0s1 || true
	ip route add default via 10.0.2.2 || true
fi

echo "Setting up DNS resolution"
echo "nameserver 10.0.2.3" > /etc/resolv.conf

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

echo "Starting entrypoint"
ARGS=$(cat /test-args)
exec /entrypoint.sh $ARGS
