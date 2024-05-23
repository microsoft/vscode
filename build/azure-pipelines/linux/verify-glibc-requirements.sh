#!/usr/bin/env bash

set -e

TRIPLE="x86_64-linux-gnu"
if [ "$VSCODE_ARCH" == "arm64" ]; then
  TRIPLE="aarch64-linux-gnu"
elif [ "$VSCODE_ARCH" == "armhf" ]; then
  TRIPLE="arm-rpi-linux-gnueabihf"
fi

# Get all files with .node extension from remote/node_modules folder
files=$(find remote/node_modules -name "*.node" -not -path "*prebuilds*")

echo "Verifying requirements for files: $files"

for file in $files; do
  glibc_version="$EXPECTED_GLIBC_VERSION"
  glibcxx_version="$EXPECTED_GLIBCXX_VERSION"
  while IFS= read -r line; do
    if [[ $line == *"GLIBC_"* ]]; then
      version=$(echo "$line" | awk '{print $5}' | tr -d '()')
      version=${version#*_}
      if [[ $(printf "%s\n%s" "$version" "$glibc_version" | sort -V | tail -n1) == "$version" ]]; then
        glibc_version=$version
      fi
    elif [[ $line == *"GLIBCXX_"* ]]; then
      version=$(echo "$line" | awk '{print $5}' | tr -d '()')
      version=${version#*_}
      if [[ $(printf "%s\n%s" "$version" "$glibcxx_version" | sort -V | tail -n1) == "$version" ]]; then
        glibcxx_version=$version
      fi
    fi
  done < <("$PWD/.build/sysroots/$TRIPLE/$TRIPLE/bin/objdump" -T "$file")

  if [[ "$glibc_version" != "$EXPECTED_GLIBC_VERSION" ]]; then
    echo "Error: File $file has dependency on GLIBC > $EXPECTED_GLIBC_VERSION"
    exit 1
  fi
  if [[ "$glibcxx_version" != "$EXPECTED_GLIBCXX_VERSION" ]]; then
    echo "Error: File $file has dependency on GLIBCXX > $EXPECTED_GLIBCXX_VERSION"
    exit 1
  fi
done
