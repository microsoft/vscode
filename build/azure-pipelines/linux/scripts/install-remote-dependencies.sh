#!/usr/bin/env bash
set -e

echo "Installing remote dependencies"
rm -rf remote/node_modules

for i in {1..5}; do # try 5 times
  yarn --cwd remote --frozen-lockfile --check-files && break
  if [ $i -eq 3 ]; then
    echo "Yarn failed too many times" >&2
    exit 1
  fi
  echo "Yarn failed $i, trying again..."
done

if [ -d .build/distro/npm/remote ]; then
  echo "Installing distro remote dependencies"
  rm -rf .build/distro/npm/remote/node_modules

  if [ -f remote/.yarnrc ]; then
    cp remote/.yarnrc .build/distro/npm/remote/.yarnrc
  fi

  for i in {1..5}; do # try 5 times
    yarn --cwd .build/distro/npm/remote --frozen-lockfile --check-files && break
    if [ $i -eq 3 ]; then
      echo "Yarn failed too many times" >&2
      exit 1
    fi
    echo "Yarn failed $i, trying again..."
  done
fi
