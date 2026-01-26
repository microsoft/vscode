#!/bin/sh
set -e

CONTAINER=""
ROOT_DIR=""
SCRIPT_DIR=""
ARGS=""

while [ $# -gt 0 ]; do
	case "$1" in
		--container) CONTAINER="$2"; shift 2 ;;
		--root-dir) ROOT_DIR="$2"; shift 2 ;;
		--script-dir) SCRIPT_DIR="$2"; shift 2 ;;
		--) shift; ARGS="$*"; break ;;
		*) echo "Unknown option: $1"; exit 1 ;;
	esac
done

if [ -z "$CONTAINER" ] || [ -z "$ROOT_DIR" ] || [ -z "$SCRIPT_DIR" ]; then
	echo "Usage: $0 --container CONTAINER --root-dir DIR --script-dir DIR [-- ARGS...]"
	exit 1
fi

KERNEL_DIR=""
ROOTFS_DIR=""
DISK_IMG=""

cleanup() {
	sudo rm -rf "$KERNEL_DIR" "$ROOTFS_DIR" "$DISK_IMG" 2>/dev/null || true
}
trap cleanup EXIT

echo "Setting up QEMU system emulation for ARM64 with 64K page size"

if ! command -v qemu-system-aarch64 > /dev/null 2>&1; then
	echo "Installing QEMU system emulation and tools"
	sudo apt-get update && sudo apt-get install -y qemu-system-arm binutils
fi

echo "Setting up QEMU user-mode emulation for container operations"
docker run --privileged --rm tonistiigi/binfmt --install arm64

echo "Exporting container filesystem"
CONTAINER_ID=$(docker create --platform linux/arm64 "$CONTAINER")
ROOTFS_DIR=$(mktemp -d)
docker export "$CONTAINER_ID" | sudo tar -xf - -C "$ROOTFS_DIR"
docker rm -f "$CONTAINER_ID"

echo "Removing container image to free disk space"
docker rmi "$CONTAINER" 2>/dev/null || true
docker system prune -f 2>/dev/null || true

echo "Copying test files into root filesystem"
sudo cp -r "$ROOT_DIR"/* "$ROOTFS_DIR/root/"

echo "Downloading Ubuntu 24.04 generic-64k kernel for ARM64"
KERNEL_URL="http://ports.ubuntu.com/ubuntu-ports/pool/main/l/linux/linux-image-unsigned-6.8.0-90-generic-64k_6.8.0-90.91_arm64.deb"
KERNEL_DIR=$(mktemp -d)
curl -sfL "$KERNEL_URL" -o "$KERNEL_DIR/kernel.deb"

echo "Extracting kernel"
(cd "$KERNEL_DIR" && ar x kernel.deb && tar xf data.tar*)
VMLINUZ="$KERNEL_DIR/boot/vmlinuz-6.8.0-90-generic-64k"
if [ ! -f "$VMLINUZ" ]; then
	echo "Error: Could not find kernel at $VMLINUZ"
	exit 1
fi

echo "Storing test arguments and installing init script"
echo "$ARGS" | sudo tee "$ROOTFS_DIR/test-args" > /dev/null
sudo cp "$SCRIPT_DIR/qemu-init.sh" "$ROOTFS_DIR/init"
sudo chmod +x "$ROOTFS_DIR/init"

echo "Creating disk image with root filesystem"
DISK_IMG=$(mktemp)
dd if=/dev/zero of="$DISK_IMG" bs=1M count=2048 status=none
sudo mkfs.ext4 -q -d "$ROOTFS_DIR" "$DISK_IMG"
sudo rm -rf "$ROOTFS_DIR"
ROOTFS_DIR=""

echo "Starting QEMU VM with 64K page size kernel"
timeout 1800 qemu-system-aarch64 \
	-M virt \
	-cpu max,pauth-impdef=on \
	-accel tcg,thread=multi \
	-m 2048 \
	-smp 2 \
	-kernel "$VMLINUZ" \
	-append "console=ttyAMA0 root=/dev/vda rw init=/init" \
	-drive file="$DISK_IMG",format=raw,if=virtio \
	-netdev user,id=net0 \
	-device virtio-net-pci,netdev=net0 \
	-nographic \
	-no-reboot
