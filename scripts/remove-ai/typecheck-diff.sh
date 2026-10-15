#!/bin/bash
# Type-check everything reachable from the app entry points and compare the
# set of errors against a baseline ref. Environmental errors (no Electron
# typings without a full postinstall, etc.) cancel out; only errors this
# branch introduced are printed under NEW.
#
# Uses the native TypeScript 7 compiler with one checker so it fits in ~7 GB.
# usage (from repo root): scripts/remove-ai/typecheck-diff.sh [baseline-ref=main]
set -u
BASE=${1:-main}
TSC=node_modules/@typescript/native/bin/tsc
CFG=scripts/remove-ai/tsconfig.entrycheck.json
OUT=$(mktemp -d)
norm() { grep "error TS" | sed -E 's/\([0-9]+,[0-9]+\)//' | sort -u; }

$TSC -p $CFG --noEmit --checkers 1 2>&1 | norm > "$OUT/after.txt"
git stash -q --include-untracked -- src || true
git checkout -q "$BASE" -- src
$TSC -p $CFG --noEmit --checkers 1 2>&1 | norm > "$OUT/before.txt"
git checkout -q HEAD -- src
git stash pop -q 2>/dev/null || true

echo "baseline $(wc -l < "$OUT/before.txt") / now $(wc -l < "$OUT/after.txt") distinct errors"
echo "NEW:"; comm -13 "$OUT/before.txt" "$OUT/after.txt"
NEW=$(comm -13 "$OUT/before.txt" "$OUT/after.txt" | wc -l)
rm -rf "$OUT"
exit $(( NEW > 0 ))
