#!/usr/bin/env bash

set -e

# To workaround the issue of yarn not respecting the registry value from .npmrc
yarn config set registry "$NPM_REGISTRY"

if [ -z "$CC" ] || [ -z "$CXX" ]; then
  # Download clang based on chromium revision used by vscode
  curl -s https://raw.githubusercontent.com/chromium/chromium/114.0.5735.199/tools/clang/scripts/update.py | python - --output-dir=$PWD/.build/CR_Clang --host-os=linux

  # Download libcxx headers and objects from upstream electron releases
  DEBUG=libcxx-fetcher \
  VSCODE_LIBCXX_OBJECTS_DIR=$PWD/.build/libcxx-objects \
  VSCODE_LIBCXX_HEADERS_DIR=$PWD/.build/libcxx_headers  \
  VSCODE_LIBCXXABI_HEADERS_DIR=$PWD/.build/libcxxabi_headers \
  VSCODE_ARCH="$npm_config_arch" \
  node build/linux/libcxx-fetcher.js

  # Set compiler toolchain
  # Flags for the client build are based on
  # https://source.chromium.org/chromium/chromium/src/+/refs/tags/114.0.5735.199:build/config/arm.gni
  # https://source.chromium.org/chromium/chromium/src/+/refs/tags/114.0.5735.199:build/config/compiler/BUILD.gn
  # https://source.chromium.org/chromium/chromium/src/+/refs/tags/114.0.5735.199:build/config/c++/BUILD.gn
  export CC=$PWD/.build/CR_Clang/bin/clang
  export CXX=$PWD/.build/CR_Clang/bin/clang++
  export CXXFLAGS="-nostdinc++ -D__NO_INLINE__ -I$PWD/.build/libcxx_headers -isystem$PWD/.build/libcxx_headers/include -isystem$PWD/.build/libcxxabi_headers/include -fPIC -flto=thin -fsplit-lto-unit -D_LIBCPP_ABI_NAMESPACE=Cr"
  export LDFLAGS="-stdlib=libc++ -fuse-ld=lld -flto=thin -L$PWD/.build/libcxx-objects -lc++abi -Wl,--lto-O0"
  export VSCODE_REMOTE_CC=$(which gcc)
  export VSCODE_REMOTE_CXX=$(which g++)
fi

for i in {1..5}; do # try 5 times
  yarn --frozen-lockfile --check-files && break
  if [ $i -eq 3 ]; then
    echo "Yarn failed too many times" >&2
    exit 1
  fi
  echo "Yarn failed $i, trying again..."
done
