#!/bin/bash

# This script prints a JSON array containing all top-level directories
# ["foo", "bar"]
#
# Usage: ./list-all-dirs.sh

dirs=()
while IFS= read -r dir; do
    # Exclude directories starting with '.'
    if [[ ! "$dir" =~ ^\. ]]; then
        dirs+=("$dir")
    fi
done < <(find . -maxdepth 1 -type d -not -path '.' -exec basename {} \;)

# Convert to JSON array
if [ ${#dirs[@]} -eq 0 ]; then
    echo "[]"
else
    # Use printf to create JSON array
    printf '[%s]' "$(printf '"%s",' "${dirs[@]}" | sed 's/,$//')"
fi
