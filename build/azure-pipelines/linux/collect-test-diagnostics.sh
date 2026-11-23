#!/usr/bin/env bash
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root.

set -o pipefail
export LC_ALL=C

if [[ "$#" -lt 2 || "$#" -gt 3 || ( "$1" != before && "$1" != after ) || ( "$#" -eq 3 && "$3" != --collect ) ]]; then
  echo "##vso[task.logissue type=error]Expected diagnostic phase (before or after) and agent temporary directory."
  exit 2
fi

if [ "$#" -eq 2 ]; then
  set -e
  diagnostic_state=$(mktemp -d "$2/vscode-diagnostics.XXXXXX")
  trap 'rm -f "$diagnostic_state/failed" "$diagnostic_state/timeout"; rmdir "$diagnostic_state"' EXIT

  # Isolate timeout's stderr from the collector's. Exit 137 alone also means an
  # unrelated SIGKILL, so only downgrade it when timeout confirms its deadline.
  status=0
  timeout --verbose --signal=KILL 60s bash "$0" "$@" --collect \
    3>&2 4>"$diagnostic_state/failed" 2>"$diagnostic_state/timeout" || status=$?
  cat "$diagnostic_state/timeout"
  if [ "$status" -eq 137 ] && grep -Fq 'timeout: sending signal KILL to command ' "$diagnostic_state/timeout"; then
    echo "##vso[task.logissue type=warning]Diagnostics $1 smoke tests reached the 60s deadline; optional output is incomplete."
    status=0
  fi
  # A later timeout must not hide an earlier command or pipeline failure.
  if [ -s "$diagnostic_state/failed" ]; then
    status=1
  fi
  if [ "$status" -ne 0 ]; then
    echo "##vso[task.logissue type=warning]Diagnostics $1 smoke tests failed (exit $status); see command output above."
  fi
  exit "$status"
fi

exec 2>&3 3>&-

run_diagnostic() {
  local errors status=0
  printf -- '--- Running diagnostic: %s ---\n' "$*" >&2
  # Keep stdout streaming through the caller's pipeline while capturing stderr.
  {
    errors=$("$@" 2>&1 1>&3) || status=$?
  } 3>&1
  if [ -n "$errors" ]; then
    printf '%s\n' "$errors" >&2
  fi

  # Broad du scans can encounter unreadable directories or entries that disappear.
  # Do not downgrade other errors, mixed errors, or an unexplained exit code 1.
  if [ "$1" = du ] && [ "$status" -eq 1 ] && [ -n "$errors" ]; then
    local line expected_errors=true
    local expected_error="^du: (cannot read directory|cannot access) .+: (Permission denied|No such file or directory)$"
    while IFS= read -r line; do
      if [[ ! "$line" =~ $expected_error ]]; then
        expected_errors=false
        break
      fi
    done <<< "$errors"
    if [ "$expected_errors" = true ]; then
      printf 'Diagnostic %s skipped inaccessible or missing entries; disk usage is partial.\n' "$*" >&2
      return 0
    fi
  fi

  if [ "$status" -ne 0 ]; then
    printf 'failed\n' >&4
    printf '##vso[task.logissue type=warning]Diagnostic %s failed (exit %s); output may be incomplete.\n' "$*" "$status" >&2
  fi
  return "$status"
}

diagnostic_status=0
# Aggregate command failures separately from the outer timeout's exit status.
trap 'diagnostic_status=1; printf "failed\n" >&4' ERR

run_diagnostic df -h
run_diagnostic ps -ef
run_diagnostic cat /proc/sys/fs/inotify/max_user_watches
run_diagnostic lsof | run_diagnostic wc -l
echo "--- top consumers under \$HOME ---"
# Read to EOF so limiting the output does not trigger SIGPIPE with pipefail.
run_diagnostic du -xhd1 "$HOME" | run_diagnostic sort -rh | run_diagnostic sed -n '1,30p'

if [ "$1" = before ]; then
  echo "--- top consumers under /tmp ---"
  run_diagnostic du -xhd1 /tmp | run_diagnostic sort -rh | run_diagnostic sed -n '1,30p'
  echo "--- top consumers under /var ---"
  run_diagnostic du -xhd1 /var | run_diagnostic sort -rh | run_diagnostic sed -n '1,30p'
else
  echo "--- smoke test data dirs ---"
  shopt -s nullglob
  smoke_test_dirs=("$2"/vscsmoke-* /tmp/vscsmoke-*)
  if [ "${#smoke_test_dirs[@]}" -gt 0 ]; then
    run_diagnostic du -sh "${smoke_test_dirs[@]}"
  fi
fi

# Keep du on the small OS root disk, excluding the large /mnt work volume.
# Scan it last so a slow root scan does not prevent the other diagnostics.
echo "--- top consumers on / ---"
run_diagnostic du -xhd1 / | run_diagnostic sort -rh | run_diagnostic sed -n '1,30p'

exit "$diagnostic_status"
