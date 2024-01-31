#!/usr/bin/env sh
#
# Copyright (c) Microsoft Corporation. All rights reserved.
#

set -e

# Do not remove this check.
# Provides a way to skip the server requirements check from
# outside the install flow. A system process can create this
# file before the server is downloaded and installed.
#
# This check is duplicated between code-server-linux.sh and here
# since remote container calls into this script directly quite early
# before the usual server startup flow.
if [ -f "/tmp/vscode-skip-server-requirements-check" ]; then
	echo "!!! WARNING: Skipping server pre-requisite check !!!"
	echo "!!! Server stability is not guaranteed. Proceed at your own risk. !!!"
	exit 0
fi

BITNESS=$(getconf LONG_BIT)
ARCH=$(uname -m)
found_required_glibc=0
found_required_glibcxx=0

# Extract the ID value from /etc/os-release
OS_ID="$(cat /etc/os-release | grep -Eo 'ID=([^"]+)' | sed 's/ID=//')"
if [ "$OS_ID" = "nixos" ]; then
  echo "Warning: NixOS detected, skipping GLIBC check"
  exit 0
fi

# Based on https://github.com/bminor/glibc/blob/520b1df08de68a3de328b65a25b86300a7ddf512/elf/cache.c#L162-L245
case $ARCH in
	x86_64) LDCONFIG_ARCH="x86-64";;
	armv7l | armv8l) LDCONFIG_ARCH="hard-float";;
	arm64 | aarch64)
		if [ "$BITNESS" = "32" ]; then
			# Can have 32-bit userland on 64-bit kernel
			LDCONFIG_ARCH="hard-float"
		else
			LDCONFIG_ARCH="AArch64"
		fi
		;;
esac

if [ -f /usr/lib64/libstdc++.so.6 ]; then
	# Typical path
	libstdcpp_path='/usr/lib64/libstdc++.so.6'
elif [ -f /usr/lib/libstdc++.so.6 ]; then
	# Typical path
	libstdcpp_path='/usr/lib/libstdc++.so.6'
elif [ -f /sbin/ldconfig ]; then
    # Look up path
    libstdcpp_paths=$(/sbin/ldconfig -p | grep 'libstdc++.so.6')

    if [ "$(echo "$libstdcpp_paths" | wc -l)" -gt 1 ]; then
        libstdcpp_path=$(echo "$libstdcpp_paths" | grep "$LDCONFIG_ARCH" | awk '{print $NF}')
    else
        libstdcpp_path=$(echo "$libstdcpp_paths" | awk '{print $NF}')
    fi
else
	echo "Warning: Can't find libstdc++.so or ldconfig, can't verify libstdc++ version"
fi

if [ -n "$libstdcpp_path" ]; then
	# Extracts the version number from the path, e.g. libstdc++.so.6.0.22 -> 6.0.22
	# which is then compared based on the fact that release versioning and symbol versioning
	# are aligned for libstdc++. Refs https://gcc.gnu.org/onlinedocs/libstdc++/manual/abi.html
	# (i-e) GLIBCXX_3.4.<release> is provided by libstdc++.so.6.y.<release>
    libstdcpp_real_path=$(readlink -f "$libstdcpp_path")
    libstdcpp_version=$(echo "$libstdcpp_real_path" | awk -F'\\.so\\.' '{print $NF}')
    if [ "$(printf '%s\n' "6.0.25" "$libstdcpp_version" | sort -V | head -n1)" = "6.0.25" ]; then
        found_required_glibcxx=1
    else
        echo "Warning: Missing GLIBCXX >= 3.4.25! from $libstdcpp_real_path"
    fi
fi

if [ -n "$(ldd --version | grep -v musl)" ]; then
    if [ -f /usr/lib64/libc.so.6 ]; then
        # Typical path
        libc_path='/usr/lib64/libc.so.6'
    elif [ -f /usr/lib/libc.so.6 ]; then
        # Typical path
        libc_path='/usr/lib/libc.so.6'
    elif [ -f /sbin/ldconfig ]; then
        # Look up path
        libc_paths=$(/sbin/ldconfig -p | grep 'libc.so.6')

        if [ "$(echo "$libc_paths" | wc -l)" -gt 1 ]; then
            libc_path=$(echo "$libc_paths" | grep "$LDCONFIG_ARCH" | awk '{print $NF}')
        else
            libc_path=$(echo "$libc_paths" | awk '{print $NF}')
        fi
    else
        echo "Warning: Can't find libc.so or ldconfig, can't verify libc version"
    fi

    if [ -n "$libc_path" ]; then
		# Rather than trusting the output of ldd --version (which is not always accurate)
		# we instead use the version of the cached libc.so.6 file itself.
        libc_real_path=$(readlink -f "$libc_path")
        libc_version=$(cat "$libc_real_path" | sed -n 's/.*release version \([0-9]\+\.[0-9]\+\).*/\1/p')
        if [ "$(printf '%s\n' "2.28" "$libc_version" | sort -V | head -n1)" = "2.28" ]; then
            found_required_glibc=1
        else
            echo "Warning: Missing GLIBC >= 2.28! from $libc_real_path"
        fi
    fi
else
    echo "Warning: musl detected, skipping GLIBC check"
    found_required_glibc=1
fi

if [ "$found_required_glibc" = "0" ] || [ "$found_required_glibcxx" = "0" ]; then
	echo "Error: Missing required dependencies. Please refer to our FAQ https://aka.ms/vscode-remote/faq/old-linux for additional information."
	# Custom exit code based on https://tldp.org/LDP/abs/html/exitcodes.html
	exit 99
fi
