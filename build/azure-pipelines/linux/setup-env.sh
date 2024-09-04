#!/usr/bin/env bash

set -e

SYSROOT_ARCH=$VSCODE_ARCH
if [ "$SYSROOT_ARCH" == "x64" ]; then
  SYSROOT_ARCH="amd64"
fi

export VSCODE_SYSROOT_DIR=$PWD/.build/sysroots
if [ -d "$VSCODE_SYSROOT_DIR" ]; then
  echo "Using cached sysroot"
else
  echo "Downloading sysroot"
  SYSROOT_ARCH="$SYSROOT_ARCH" node -e '(async () => { const { getVSCodeSysroot } = require("./build/linux/debian/install-sysroot.js"); await getVSCodeSysroot(process.env["SYSROOT_ARCH"]); })()'
fi

if [ "$npm_config_arch" == "x64" ]; then
  if [ "$(echo "$@" | grep -c -- "--only-remote")" -eq 0 ]; then
    # Download clang based on chromium revision used by vscode
    curl -s https://raw.githubusercontent.com/chromium/chromium/124.0.6367.243/tools/clang/scripts/update.py | python - --output-dir=$PWD/.build/CR_Clang --host-os=linux

    # Download libcxx headers and objects from upstream electron releases
    DEBUG=libcxx-fetcher \
    VSCODE_LIBCXX_OBJECTS_DIR=$PWD/.build/libcxx-objects \
    VSCODE_LIBCXX_HEADERS_DIR=$PWD/.build/libcxx_headers  \
    VSCODE_LIBCXXABI_HEADERS_DIR=$PWD/.build/libcxxabi_headers \
    VSCODE_ARCH="$npm_config_arch" \
    node build/linux/libcxx-fetcher.js

    # Set compiler toolchain
    # Flags for the client build are based on
    # https://source.chromium.org/chromium/chromium/src/+/refs/tags/124.0.6367.243:build/config/arm.gni
    # https://source.chromium.org/chromium/chromium/src/+/refs/tags/124.0.6367.243:build/config/compiler/BUILD.gn
    # https://source.chromium.org/chromium/chromium/src/+/refs/tags/124.0.6367.243:build/config/c++/BUILD.gn
    export CC="$PWD/.build/CR_Clang/bin/clang --gcc-toolchain=$VSCODE_SYSROOT_DIR/x86_64-linux-gnu"
    export CXX="$PWD/.build/CR_Clang/bin/clang++ --gcc-toolchain=$VSCODE_SYSROOT_DIR/x86_64-linux-gnu"
    export CXXFLAGS="-nostdinc++ -D__NO_INLINE__ -I$PWD/.build/libcxx_headers -isystem$PWD/.build/libcxx_headers/include -isystem$PWD/.build/libcxxabi_headers/include -fPIC -flto=thin -fsplit-lto-unit -D_LIBCPP_ABI_NAMESPACE=Cr -D_LIBCPP_HARDENING_MODE=_LIBCPP_HARDENING_MODE_EXTENSIVE --sysroot=$VSCODE_SYSROOT_DIR/x86_64-linux-gnu/x86_64-linux-gnu/sysroot"
    export LDFLAGS="-stdlib=libc++ --sysroot=$VSCODE_SYSROOT_DIR/x86_64-linux-gnu/x86_64-linux-gnu/sysroot -fuse-ld=lld -flto=thin -L$PWD/.build/libcxx-objects -lc++abi -L$VSCODE_SYSROOT_DIR/x86_64-linux-gnu/x86_64-linux-gnu/sysroot/usr/lib/x86_64-linux-gnu -L$VSCODE_SYSROOT_DIR/x86_64-linux-gnu/x86_64-linux-gnu/sysroot/lib/x86_64-linux-gnu -Wl,--lto-O0"

    # Set compiler toolchain for remote server
    export VSCODE_REMOTE_CC=$VSCODE_SYSROOT_DIR/x86_64-linux-gnu/bin/x86_64-linux-gnu-gcc
    export VSCODE_REMOTE_CXX=$VSCODE_SYSROOT_DIR/x86_64-linux-gnu/bin/x86_64-linux-gnu-g++
    export VSCODE_REMOTE_CXXFLAGS="--sysroot=$VSCODE_SYSROOT_DIR/x86_64-linux-gnu/x86_64-linux-gnu/sysroot"
    export VSCODE_REMOTE_LDFLAGS="--sysroot=$VSCODE_SYSROOT_DIR/x86_64-linux-gnu/x86_64-linux-gnu/sysroot -L$VSCODE_SYSROOT_DIR/x86_64-linux-gnu/x86_64-linux-gnu/sysroot/usr/lib/x86_64-linux-gnu -L$VSCODE_SYSROOT_DIR/x86_64-linux-gnu/x86_64-linux-gnu/sysroot/lib/x86_64-linux-gnu"
  fi
elif [ "$npm_config_arch" == "arm64" ]; then
  if [ "$(echo "$@" | grep -c -- "--only-remote")" -eq 0 ]; then
    # Set compiler toolchain for client native modules
    export CC=$VSCODE_SYSROOT_DIR/aarch64-linux-gnu/bin/aarch64-linux-gnu-gcc
    export CXX=$VSCODE_SYSROOT_DIR/aarch64-linux-gnu/bin/aarch64-linux-gnu-g++
    export CXXFLAGS="--sysroot=$VSCODE_SYSROOT_DIR/aarch64-linux-gnu/aarch64-linux-gnu/sysroot"
    export LDFLAGS="--sysroot=$VSCODE_SYSROOT_DIR/aarch64-linux-gnu/aarch64-linux-gnu/sysroot -L$VSCODE_SYSROOT_DIR/aarch64-linux-gnu/aarch64-linux-gnu/sysroot/usr/lib/aarch64-linux-gnu -L$VSCODE_SYSROOT_DIR/aarch64-linux-gnu/aarch64-linux-gnu/sysroot/lib/aarch64-linux-gnu"

    # Set compiler toolchain for remote server
    export VSCODE_REMOTE_CC=$VSCODE_SYSROOT_DIR/aarch64-linux-gnu/bin/aarch64-linux-gnu-gcc
    export VSCODE_REMOTE_CXX=$VSCODE_SYSROOT_DIR/aarch64-linux-gnu/bin/aarch64-linux-gnu-g++
    export VSCODE_REMOTE_CXXFLAGS="--sysroot=$VSCODE_SYSROOT_DIR/aarch64-linux-gnu/aarch64-linux-gnu/sysroot"
    export VSCODE_REMOTE_LDFLAGS="--sysroot=$VSCODE_SYSROOT_DIR/aarch64-linux-gnu/aarch64-linux-gnu/sysroot -L$VSCODE_SYSROOT_DIR/aarch64-linux-gnu/aarch64-linux-gnu/sysroot/usr/lib/aarch64-linux-gnu -L$VSCODE_SYSROOT_DIR/aarch64-linux-gnu/aarch64-linux-gnu/sysroot/lib/aarch64-linux-gnu"
  fi
elif [ "$npm_config_arch" == "arm" ]; then
  # Set compiler toolchain for client native modules
  export CC=$VSCODE_SYSROOT_DIR/arm-rpi-linux-gnueabihf/bin/arm-rpi-linux-gnueabihf-gcc
  export CXX=$VSCODE_SYSROOT_DIR/arm-rpi-linux-gnueabihf/bin/arm-rpi-linux-gnueabihf-g++
  export CXXFLAGS="--sysroot=$VSCODE_SYSROOT_DIR/arm-rpi-linux-gnueabihf/arm-rpi-linux-gnueabihf/sysroot"
  export LDFLAGS="--sysroot=$VSCODE_SYSROOT_DIR/arm-rpi-linux-gnueabihf/arm-rpi-linux-gnueabihf/sysroot -L$VSCODE_SYSROOT_DIR/arm-rpi-linux-gnueabihf/arm-rpi-linux-gnueabihf/sysroot/usr/lib/arm-linux-gnueabihf -L$VSCODE_SYSROOT_DIR/arm-rpi-linux-gnueabihf/arm-rpi-linux-gnueabihf/sysroot/lib/arm-linux-gnueabihf"

  # Set compiler toolchain for remote server
  export VSCODE_REMOTE_CC=$VSCODE_SYSROOT_DIR/arm-rpi-linux-gnueabihf/bin/arm-rpi-linux-gnueabihf-gcc
  export VSCODE_REMOTE_CXX=$VSCODE_SYSROOT_DIR/arm-rpi-linux-gnueabihf/bin/arm-rpi-linux-gnueabihf-g++
  export VSCODE_REMOTE_CXXFLAGS="--sysroot=$VSCODE_SYSROOT_DIR/arm-rpi-linux-gnueabihf/arm-rpi-linux-gnueabihf/sysroot"
  export VSCODE_REMOTE_LDFLAGS="--sysroot=$VSCODE_SYSROOT_DIR/arm-rpi-linux-gnueabihf/arm-rpi-linux-gnueabihf/sysroot -L$VSCODE_SYSROOT_DIR/arm-rpi-linux-gnueabihf/arm-rpi-linux-gnueabihf/sysroot/usr/lib/arm-linux-gnueabihf -L$VSCODE_SYSROOT_DIR/arm-rpi-linux-gnueabihf/arm-rpi-linux-gnueabihf/sysroot/lib/arm-linux-gnueabihf"
fi
