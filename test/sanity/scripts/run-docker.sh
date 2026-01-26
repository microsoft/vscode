#!/bin/sh
set -e

CONTAINER=""
ARCH="amd64"
BASE_IMAGE=""
PAGE_SIZE=""
ARGS=""

while [ $# -gt 0 ]; do
	case "$1" in
		--container) CONTAINER="$2"; shift 2 ;;
		--arch) ARCH="$2"; shift 2 ;;
		--base-image) BASE_IMAGE="$2"; shift 2 ;;
		--page-size) PAGE_SIZE="$2"; shift 2 ;;
		*) ARGS="$ARGS $1"; shift ;;
	esac
done

if [ -z "$CONTAINER" ]; then
	echo "Error: --container is required"
	exit 1
fi

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(cd "$SCRIPT_DIR/.." && pwd)

# Only build if image doesn't exist (i.e., not loaded from cache)
if ! docker image inspect "$CONTAINER" > /dev/null 2>&1; then
	echo "Building container image: $CONTAINER"
	docker buildx build \
		--platform "linux/$ARCH" \
		${BASE_IMAGE:+--build-arg "BASE_IMAGE=$BASE_IMAGE"} \
		--tag "$CONTAINER" \
		--file "$ROOT_DIR/containers/$CONTAINER.dockerfile" \
		"$ROOT_DIR/containers"
else
	echo "Using cached container image: $CONTAINER"
fi

# For cross-architecture with custom page size, use QEMU system emulation
if [ -n "$PAGE_SIZE" ]; then
	echo "Setting up QEMU system emulation for linux/$ARCH with $PAGE_SIZE page size"

	# Install QEMU system emulation if not present
	if ! command -v qemu-system-aarch64 > /dev/null 2>&1; then
		echo "Installing QEMU system emulation..."
		sudo apt-get update && sudo apt-get install -y qemu-system-arm
	fi

	# Convert page size to bytes
	case "$PAGE_SIZE" in
		16k) PAGE_BYTES=16384 ;;
		64k) PAGE_BYTES=65536 ;;
		*) echo "Error: Unknown page size '$PAGE_SIZE'"; exit 1 ;;
	esac

	# Export container filesystem
	CONTAINER_ID=$(docker create --platform "linux/$ARCH" "$CONTAINER")
	ROOTFS_DIR=$(mktemp -d)
	docker export "$CONTAINER_ID" | sudo tar -xf - -C "$ROOTFS_DIR"
	docker rm "$CONTAINER_ID" > /dev/null

	# Copy test files into rootfs
	sudo cp -r "$ROOT_DIR"/* "$ROOTFS_DIR/root/"

	# Extract kernel from the container's /boot directory
	KERNEL_DIR=$(mktemp -d)
	VMLINUZ=$(find "$ROOTFS_DIR/boot" -name "vmlinuz-*" | head -1)
	INITRAMFS=$(find "$ROOTFS_DIR/boot" -name "initramfs-*.img" -o -name "initrd.img-*" | head -1)

	if [ -z "$VMLINUZ" ] || [ -z "$INITRAMFS" ]; then
		echo "Error: Could not find kernel or initramfs in container"
		sudo rm -rf "$ROOTFS_DIR" "$KERNEL_DIR"
		exit 1
	fi

	cp "$VMLINUZ" "$KERNEL_DIR/vmlinuz"
	cp "$INITRAMFS" "$KERNEL_DIR/initramfs"

	# Create a disk image from the rootfs
	DISK_IMG=$(mktemp)
	dd if=/dev/zero of="$DISK_IMG" bs=1M count=2048 2>/dev/null
	sudo mkfs.ext4 -q -d "$ROOTFS_DIR" "$DISK_IMG"

	echo "Running QEMU system emulation with ${PAGE_SIZE} page size"
	timeout 1800 qemu-system-aarch64 \
		-M virt \
		-cpu max,pauth-impdef=on,pagesize=$PAGE_BYTES \
		-accel tcg,thread=multi \
		-m 4096 \
		-smp 2 \
		-kernel "$KERNEL_DIR/vmlinuz" \
		-initrd "$KERNEL_DIR/initramfs" \
		-append "console=ttyAMA0 root=/dev/vda rw quiet" \
		-drive file="$DISK_IMG",format=raw,if=virtio \
		-netdev user,id=net0 -device virtio-net-pci,netdev=net0 \
		-nographic \
		-no-reboot \
		2>&1 | tee /tmp/qemu.log

	# Cleanup
	sudo rm -rf "$ROOTFS_DIR" "$KERNEL_DIR" "$DISK_IMG"
else
	echo "Running sanity tests in container"
	docker run \
		--rm \
		--platform "linux/$ARCH" \
		--volume "$ROOT_DIR:/root" \
		"$CONTAINER" \
		$ARGS
fi
