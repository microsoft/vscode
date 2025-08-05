#!/bin/bash

# This script prints a JSON array containing only top-level directories
# with modified files, using git diff, excluding folders starting with '.'.
# For example, if only files in "foo" and "bar" have changes, the output will be:
# ["foo", "bar"]
#
# Usage: ./list-updated-dirs.sh

# Determine the Git reference to compare against
if [ "$GITHUB_EVENT_NAME" = "pull_request" ]; then
    # For pull requests, compare against the base branch
    git fetch origin "$GITHUB_BASE_REF" --depth=2  # Fetch base branch with enough depth
    base_commit=$(git rev-parse "origin/$GITHUB_BASE_REF")
else
    # For push events, ensure enough history is available
    git fetch origin --depth=2  # Fetch enough history for HEAD^
    base_commit="HEAD^"
fi

# Get list of changed files using git diff
changed_files=$(git diff "$base_commit" HEAD --name-only 2>/dev/null || echo "")

# Extract top-level directories from changed files
changed_dirs=()
while IFS= read -r file; do
    if [ -n "$file" ]; then
        # Get top-level directory (before first '/')
        top_dir="${file%%/*}"
        if [ -n "$top_dir" ] && [[ ! "$top_dir" =~ ^\. ]]; then
            # Add to array if not already present and doesn't start with '.'
            if [[ ! " ${changed_dirs[@]} " =~ " $top_dir " ]]; then
                if [[ "$file" == extensions/* ]]; then
                    changed_dirs+=("$top_dir")
                fi
            fi
        fi
    fi
done <<< "$changed_files"

# Convert to JSON array
if [ ${#changed_dirs[@]} -eq 0 ]; then
    echo "[]"
else
    # Use printf to create JSON array
    printf '[%s]' "$(printf '"%s",' "${changed_dirs[@]}" | sed 's/,$//')"
fi
