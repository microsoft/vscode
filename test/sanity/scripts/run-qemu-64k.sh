#!/bin/sh
set -e

CONTAINER=""
ARGS=""

while [ $# -gt 0 ]; do
	case "$1" in
		--container) CONTAINER="$2"; shift 2 ;;
		--) shift; ARGS="$*"; break ;;
		*) echo "Unknown option: $1"; exit 1 ;;
	esac
done

if [ -z "$CONTAINER" ]; then
	echo "Usage: $0 --container CONTAINER [-- ARGS...]"
	exit 1
fi

echo "Installing QEMU system emulation and tools"
sudo apt-get update && sudo apt-get install -y qemu-system-arm binutils

echo "Exporting container filesystem"
CONTAINER_ID=$(docker create --platform linux/arm64 "$CONTAINER")
ROOTFS_DIR=$(mktemp -d)
docker export "$CONTAINER_ID" | sudo tar -xf - -C "$ROOTFS_DIR"
docker rm -f "$CONTAINER_ID"

# echo "Removing container image to free disk space"
# docker rmi "$CONTAINER" || true
docker system prune -f || true

echo "Copying test files into root filesystem"
TEST_DIR=$(cd "$(dirname "$0")/.." && pwd)
sudo cp -r "$TEST_DIR"/* "$ROOTFS_DIR/root/"

echo "Downloading Ubuntu 24.04 generic-64k kernel for ARM64"
KERNEL_URL="https://ports.ubuntu.com/ubuntu-ports/pool/main/l/linux/linux-image-unsigned-6.8.0-90-generic-64k_6.8.0-90.91_arm64.deb"
KERNEL_DIR=$(mktemp -d)
curl -fL "$KERNEL_URL" -o "$KERNEL_DIR/kernel.deb"

echo "Extracting kernel"
cd "$KERNEL_DIR" && ar x kernel.deb && rm kernel.deb
tar xf data.tar* && rm -f debian-binary control.tar* data.tar*
VMLINUZ="$KERNEL_DIR/boot/vmlinuz-6.8.0-90-generic-64k"
if [ ! -f "$VMLINUZ" ]; then
	echo "Error: Could not find kernel at $VMLINUZ"
	exit 1
fi

echo "Storing test arguments and installing init script"
echo "$ARGS" > "$ROOTFS_DIR/test-args"
date -u '+%Y-%m-%d %H:%M:%S' > "$ROOTFS_DIR/host-time"
sudo mv "$ROOTFS_DIR/root/scripts/qemu-init.sh" "$ROOTFS_DIR/init"
sudo chmod +x "$ROOTFS_DIR/init"

echo "Creating disk image with root filesystem"
DISK_IMG=$(mktemp)
dd if=/dev/zero of="$DISK_IMG" bs=1M count=2048 status=none
sudo mkfs.ext4 -q -d "$ROOTFS_DIR" "$DISK_IMG"
sudo rm -rf "$ROOTFS_DIR"

echo "Starting QEMU VM with 64K page size kernel"
timeout 1800 qemu-system-aarch64 \
	-M virt \
	-cpu max,pauth-impdef=on \
	-accel tcg,thread=multi \
	-m 4096 \
	-smp 2 \
	-kernel "$VMLINUZ" \
	-append "console=ttyAMA0 root=/dev/vda rw init=/init net.ifnames=0" \
	-drive file="$DISK_IMG",format=raw,if=virtio \
	-netdev user,id=net0 \
	-device virtio-net-pci,netdev=net0 \
	-nographic \
	-no-reboot

echo "Extracting test results from disk image"
MOUNT_DIR=$(mktemp -d)
sudo mount -o loop "$DISK_IMG" "$MOUNT_DIR"
sudo cp "$MOUNT_DIR/root/results.xml" "$TEST_DIR/results.xml"
sudo chown "$(id -u):$(id -g)" "$TEST_DIR/results.xml"

EXIT_CODE=$(sudo cat "$MOUNT_DIR/exit-code" 2>/dev/null || echo 1)
sudo umount "$MOUNT_DIR"
exit $EXIT_CODE
