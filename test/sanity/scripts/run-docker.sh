#!/bin/sh
set -e

# Downloads and extracts kernel, sets KERNEL_DIR and verifies vmlinuz exists
# Arguments: $1 = page size (e.g., "64k")
download_kernel() {
	local page_size="$1"
	local url
	local vmlinuz_path

	# Ubuntu 24.04 generic-64k kernel packages for arm64
	# Using generic kernel (not cloud-specific) for better QEMU compatibility
	case "$page_size" in
		64k)
			url="http://ports.ubuntu.com/ubuntu-ports/pool/main/l/linux/linux-image-unsigned-6.8.0-90-generic-64k_6.8.0-90.91_arm64.deb"
			vmlinuz_path="boot/vmlinuz-6.8.0-90-generic-64k"
			;;
		*)
			echo "Error: Unknown page size '$page_size'"
			return 1
			;;
	esac

	KERNEL_DIR=$(mktemp -d)
	echo "Downloading kernel from $url..."
	curl -sfL "$url" -o "$KERNEL_DIR/kernel.deb"

	echo "Extracting kernel package..."
	# Extract .deb using ar and tar (works without dpkg-deb)
	(cd "$KERNEL_DIR" && ar x kernel.deb && tar xf data.tar* 2>&1)
	rm -f "$KERNEL_DIR/kernel.deb" "$KERNEL_DIR/control.tar"* "$KERNEL_DIR/data.tar"* "$KERNEL_DIR/debian-binary"

	VMLINUZ="$KERNEL_DIR/$vmlinuz_path"

	if [ ! -f "$VMLINUZ" ]; then
		echo "Error: Could not find kernel at $VMLINUZ"
		ls -laR "$KERNEL_DIR/" 2>/dev/null || true
		return 1
	fi

	echo "Using kernel: $VMLINUZ"
	cp "$VMLINUZ" "$KERNEL_DIR/vmlinuz"
	# Clean up extracted kernel files except vmlinuz
	rm -rf "$KERNEL_DIR/lib" "$KERNEL_DIR/boot" 2>/dev/null || true
}

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

	if ! command -v qemu-system-aarch64 > /dev/null 2>&1; then
		echo "Installing QEMU system emulation and tools"
		sudo apt-get update && sudo apt-get install -y qemu-system-arm binutils
	fi

	echo "Setting up QEMU user-mode emulation for container build"
	docker run --privileged --rm tonistiigi/binfmt --install "$ARCH"

	echo "Exporting container filesystem"
	CONTAINER_ID=$(docker create --platform "linux/$ARCH" "$CONTAINER")
	ROOTFS_DIR=$(mktemp -d)
	docker export "$CONTAINER_ID" | sudo tar -xf - -C "$ROOTFS_DIR"
	docker rm -f "$CONTAINER_ID"

	# Free disk space by removing docker image
	docker rmi "$CONTAINER" 2>/dev/null || true
	docker system prune -f 2>/dev/null || true

	# Copy test files into rootfs
	sudo cp -r "$ROOT_DIR"/* "$ROOTFS_DIR/root/"

	# Download and extract kernel
	download_kernel "$PAGE_SIZE" || {
		sudo rm -rf "$ROOTFS_DIR"
		exit 1
	}

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
	dd if=/dev/zero of="$DISK_IMG" bs=1M count=2048
	sudo mkfs.ext4 -q -d "$ROOTFS_DIR" "$DISK_IMG"

	# Free disk space by removing rootfs (now in disk image)
	sudo rm -rf "$ROOTFS_DIR"

	echo "Running QEMU system emulation with ${PAGE_SIZE} page size"
	timeout 1800 qemu-system-aarch64 \
		-M virt \
		-cpu max,pauth-impdef=on \
		-accel tcg,thread=multi \
		-m 2048 \
		-smp 2 \
		-kernel "$KERNEL_DIR/vmlinuz" \
		-append "console=ttyAMA0 root=/dev/vda rw init=/init earlyprintk=ttyAMA0 printk.devkmsg=on" \
		-drive file="$DISK_IMG",format=raw,if=virtio \
		-netdev user,id=net0 \
		-device virtio-net-pci,netdev=net0 \
		-nographic \
		-no-reboot

	# Cleanup
	sudo rm -rf "$KERNEL_DIR" "$DISK_IMG"
else
	echo "Running sanity tests in container"
	docker run \
		--rm \
		--platform "linux/$ARCH" \
		--volume "$ROOT_DIR:/root" \
		"$CONTAINER" \
		$ARGS
fi
