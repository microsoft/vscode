#!/usr/bin/env bash

set -e

TRIPLE="x86_64-linux-gnu"
if [ "$VSCODE_ARCH" == "arm64" ]; then
  TRIPLE="aarch64-linux-gnu"
elif [ "$VSCODE_ARCH" == "armhf" ]; then
  TRIPLE="arm-rpi-linux-gnueabihf"
fi

# Get all files with .node extension from server folder
files=$(find $SEARCH_PATH -name "*.node" -not -path "*prebuilds*" -not -path "*extensions/node_modules/@parcel/watcher*" -o -type f -executable -name "node")

echo "Verifying requirements for files: $files"

for file in $files; do
  glibc_version="$EXPECTED_GLIBC_VERSION"
  glibcxx_version="$EXPECTED_GLIBCXX_VERSION"
  while IFS= read -r line; do
    if [[ $line == *"GLIBC_"* ]]; then
      version=$(echo "$line" | awk '{if ($5 ~ /^[0-9a-fA-F]+$/) print $6; else print $5}' | tr -d '()')
      version=${version#*_}
      if [[ $(printf "%s\n%s" "$version" "$glibc_version" | sort -V | tail -n1) == "$version" ]]; then
        glibc_version=$version
      fi
    elif [[ $line == *"GLIBCXX_"* ]]; then
      version=$(echo "$line" | awk '{if ($5 ~ /^[0-9a-fA-F]+$/) print $6; else print $5}' | tr -d '()')
      version=${version#*_}
      if [[ $(printf "%s\n%s" "$version" "$glibcxx_version" | sort -V | tail -n1) == "$version" ]]; then
        glibcxx_version=$version
      fi
    fi
  done < <("$VSCODE_SYSROOT_DIR/$TRIPLE/$TRIPLE/bin/objdump" -T "$file")

  if [[ "$glibc_version" != "$EXPECTED_GLIBC_VERSION" ]]; then
    echo "Error: File $file has dependency on GLIBC > $EXPECTED_GLIBC_VERSION, found $glibc_version"
    exit 1
  fi
  if [[ "$glibcxx_version" != "$EXPECTED_GLIBCXX_VERSION" ]]; then
    echo "Error: File $file has dependency on GLIBCXX > $EXPECTED_GLIBCXX_VERSION, found $glibcxx_version"
  fi
done
