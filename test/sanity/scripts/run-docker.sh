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

	# Install QEMU system emulation and tools if not present
	if ! command -v qemu-system-aarch64 > /dev/null 2>&1; then
		echo "Installing QEMU system emulation and tools..."
		sudo apt-get update && sudo apt-get install -y qemu-system-arm cpio
	fi

	# Set up QEMU user-mode emulation for building arm64 container on x64
	echo "Setting up QEMU user-mode emulation for container build"
	docker run --privileged --rm tonistiigi/binfmt --install "$ARCH" > /dev/null

	# Convert page size to bytes and set kernel package name
	# CentOS provides kernel-16k and kernel-64k packages for arm64
	case "$PAGE_SIZE" in
		16k)
			PAGE_BYTES=16384
			KERNEL_PKG="kernel-16k"
			;;
		64k)
			PAGE_BYTES=65536
			KERNEL_PKG="kernel-64k"
			;;
		*) echo "Error: Unknown page size '$PAGE_SIZE'"; exit 1 ;;
	esac

	# Create a temporary container with the kernel installed
	echo "Building container with $KERNEL_PKG kernel..."
	CONTAINER_ID=$(docker run -d --platform "linux/$ARCH" "$CONTAINER" sleep infinity)
	docker exec "$CONTAINER_ID" dnf install -y "$KERNEL_PKG"

	# Export container filesystem
	ROOTFS_DIR=$(mktemp -d)
	docker export "$CONTAINER_ID" | sudo tar -xf - -C "$ROOTFS_DIR"
	docker rm -f "$CONTAINER_ID" > /dev/null

	# Copy test files into rootfs
	sudo cp -r "$ROOT_DIR"/* "$ROOTFS_DIR/root/"

	# Find the kernel in /boot
	VMLINUZ=$(find "$ROOTFS_DIR/boot" -name "vmlinuz-*${PAGE_SIZE}*" -o -name "vmlinuz-*+${PAGE_SIZE}*" 2>/dev/null | head -1)
	if [ -z "$VMLINUZ" ]; then
		# Try alternative naming pattern
		VMLINUZ=$(find "$ROOTFS_DIR/boot" -name "vmlinuz-*" | grep -E "(${PAGE_SIZE}|${PAGE_BYTES})" | head -1)
	fi

	if [ -z "$VMLINUZ" ]; then
		echo "Error: Could not find ${PAGE_SIZE} kernel in /boot"
		echo "Available kernels:"
		ls -la "$ROOTFS_DIR/boot/" || true
		sudo rm -rf "$ROOTFS_DIR"
		exit 1
	fi

	echo "Using kernel: $VMLINUZ"
	KERNEL_DIR=$(mktemp -d)
	cp "$VMLINUZ" "$KERNEL_DIR/vmlinuz"

	# Store test arguments in rootfs
	echo "$ARGS" | sudo tee "$ROOTFS_DIR/test-args" > /dev/null

	# Create init script that sets up the system and runs entrypoint
	sudo tee "$ROOTFS_DIR/init" > /dev/null << 'INITEOF'
#!/bin/sh
mount -t proc proc /proc
mount -t sysfs sys /sys
mount -t devtmpfs dev /dev
mkdir -p /dev/pts
mount -t devpts devpts /dev/pts
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ARGS=$(cat /test-args)
exec /entrypoint.sh $ARGS
INITEOF
	sudo chmod +x "$ROOTFS_DIR/init"

	# Create a disk image from the rootfs
	DISK_IMG=$(mktemp)
	dd if=/dev/zero of="$DISK_IMG" bs=1M count=8192 2>/dev/null
	sudo mkfs.ext4 -q -d "$ROOTFS_DIR" "$DISK_IMG"

	echo "Running QEMU system emulation with ${PAGE_SIZE} page size"
	timeout 1800 qemu-system-aarch64 \
		-M virt \
		-cpu max,pauth-impdef=on \
		-accel tcg,thread=multi \
		-m 4096 \
		-smp 2 \
		-kernel "$KERNEL_DIR/vmlinuz" \
		-append "console=ttyAMA0 root=/dev/vda rw quiet init=/init" \
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
