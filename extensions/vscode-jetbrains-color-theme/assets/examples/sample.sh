#!/bin/bash
# Single-line comment
: '
Multi-line comment
'

declare -r CONSTANT="value"
array=("item1" "item2" "${ENV_VAR}")

function greet() {
  local name="$1"
  echo "Hello $name!" > output.txt
}

for file in *.txt; do
  if [[ -f "$file" && ! -d "$file" ]]; then
    cp "$file" /backup/
  fi
done

case "$OSTYPE" in
  linux*) echo "Linux" ;;
  darwin*) echo "macOS" ;;
esac

trap 'cleanup' EXIT
