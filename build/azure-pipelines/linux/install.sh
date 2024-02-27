#!/usr/bin/env bash

set -e

# To workaround the issue of yarn not respecting the registry value from .npmrc
yarn config set registry "$NPM_REGISTRY"

SYSROOT_ARCH=$VSCODE_ARCH
if [ "$SYSROOT_ARCH" == "x64" ]; then
  SYSROOT_ARCH="amd64"
fi

export VSCODE_SYSROOT_DIR=$PWD/.build/sysroots
SYSROOT_ARCH="$SYSROOT_ARCH" node -e '(async () => { const { getVSCodeSysroot } = require("./build/linux/debian/install-sysroot.js"); await getVSCodeSysroot(process.env["SYSROOT_ARCH"]); })()'

if [ "$npm_config_arch" == "x64" ]; then
  # Download clang based on chromium revision used by vscode
  curl -s https://raw.githubusercontent.com/chromium/chromium/120.0.6099.268/tools/clang/scripts/update.py | python - --output-dir=$PWD/.build/CR_Clang --host-os=linux

  # Download libcxx headers and objects from upstream electron releases
  DEBUG=libcxx-fetcher \
  VSCODE_LIBCXX_OBJECTS_DIR=$PWD/.build/libcxx-objects \
  VSCODE_LIBCXX_HEADERS_DIR=$PWD/.build/libcxx_headers  \
  VSCODE_LIBCXXABI_HEADERS_DIR=$PWD/.build/libcxxabi_headers \
  VSCODE_ARCH="$npm_config_arch" \
  node build/linux/libcxx-fetcher.js

  # Set compiler toolchain
  # Flags for the client build are based on
  # https://source.chromium.org/chromium/chromium/src/+/refs/tags/120.0.6099.268:build/config/arm.gni
  # https://source.chromium.org/chromium/chromium/src/+/refs/tags/120.0.6099.268:build/config/compiler/BUILD.gn
  # https://source.chromium.org/chromium/chromium/src/+/refs/tags/120.0.6099.268:build/config/c++/BUILD.gn
  export CC="$PWD/.build/CR_Clang/bin/clang --gcc-toolchain=$VSCODE_SYSROOT_DIR/x86_64-linux-gnu"
  export CXX="$PWD/.build/CR_Clang/bin/clang++ --gcc-toolchain=$VSCODE_SYSROOT_DIR/x86_64-linux-gnu"
  export CXXFLAGS="-nostdinc++ -D__NO_INLINE__ -I$PWD/.build/libcxx_headers -isystem$PWD/.build/libcxx_headers/include -isystem$PWD/.build/libcxxabi_headers/include -fPIC -flto=thin -fsplit-lto-unit -D_LIBCPP_ABI_NAMESPACE=Cr --sysroot=$VSCODE_SYSROOT_DIR/x86_64-linux-gnu/x86_64-linux-gnu/sysroot"
  export LDFLAGS="-stdlib=libc++ --sysroot=$VSCODE_SYSROOT_DIR/x86_64-linux-gnu/x86_64-linux-gnu/sysroot -fuse-ld=lld -flto=thin -L$PWD/.build/libcxx-objects -lc++abi -L$VSCODE_SYSROOT_DIR/x86_64-linux-gnu/x86_64-linux-gnu/sysroot/usr/lib/x86_64-linux-gnu -L$VSCODE_SYSROOT_DIR/x86_64-linux-gnu/x86_64-linux-gnu/sysroot/lib/x86_64-linux-gnu -Wl,--lto-O0"
elif [ "$npm_config_arch" == "arm64" ]; then
  # Set compiler toolchain for client native modules and remote server
  export CC=$VSCODE_SYSROOT_DIR/aarch64-linux-gnu/bin/aarch64-linux-gnu-gcc
  export CXX=$VSCODE_SYSROOT_DIR/aarch64-linux-gnu/bin/aarch64-linux-gnu-g++
  export CXXFLAGS="--sysroot=$VSCODE_SYSROOT_DIR/aarch64-linux-gnu/aarch64-linux-gnu/sysroot"
  export LDFLAGS="--sysroot=$VSCODE_SYSROOT_DIR/aarch64-linux-gnu/aarch64-linux-gnu/sysroot -L$VSCODE_SYSROOT_DIR/aarch64-linux-gnu/aarch64-linux-gnu/sysroot/usr/lib/aarch64-linux-gnu -L$VSCODE_SYSROOT_DIR/aarch64-linux-gnu/aarch64-linux-gnu/sysroot/lib/aarch64-linux-gnu"
elif [ "$npm_config_arch" == "arm" ]; then
  # Set compiler toolchain for client native modules and remote server
  export CC=$VSCODE_SYSROOT_DIR/arm-rpi-linux-gnueabihf/bin/arm-rpi-linux-gnueabihf-gcc
  export CXX=$VSCODE_SYSROOT_DIR/arm-rpi-linux-gnueabihf/bin/arm-rpi-linux-gnueabihf-g++
  export CXXFLAGS="--sysroot=$VSCODE_SYSROOT_DIR/arm-rpi-linux-gnueabihf/arm-rpi-linux-gnueabihf/sysroot"
  export LDFLAGS="--sysroot=$VSCODE_SYSROOT_DIR/arm-rpi-linux-gnueabihf/arm-rpi-linux-gnueabihf/sysroot -L$VSCODE_SYSROOT_DIR/arm-rpi-linux-gnueabihf/arm-rpi-linux-gnueabihf/sysroot/usr/lib/arm-linux-gnueabihf -L$VSCODE_SYSROOT_DIR/arm-rpi-linux-gnueabihf/arm-rpi-linux-gnueabihf/sysroot/lib/arm-linux-gnueabihf"
fi

for i in {1..5}; do # try 5 times
  yarn --frozen-lockfile --check-files && break
  if [ $i -eq 3 ]; then
    echo "Yarn failed too many times" >&2
    exit 1
  fi
  echo "Yarn failed $i, trying again..."
done
