#!/usr/bin/env bash
set -e

echo "Installing remote dependencies"
(cd remote && rm -rf node_modules)

for i in {1..3}; do # try 3 times
  yarn --cwd remote --frozen-lockfile --check-files && break
  if [ $i -eq 3 ]; then
    echo "Yarn failed too many times" >&2
    exit 1
  fi
  echo "Yarn failed $i, trying again..."
done
