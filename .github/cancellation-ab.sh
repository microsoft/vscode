#!/usr/bin/env bash
set -euo pipefail

# Temporary investigation only; never merge this script into main.
base=e341a3c1515af84f5f679761d76a05a02af182cd
feature=6acb3aafa40acf016d00efd5230a97e446ecfa7e
evidence="$RUNNER_TEMP/cancellation-ab"
mkdir -p "$evidence"
printf 'phase\titeration\tcommit\texit_code\n' > "$evidence/results.tsv"
node -p 'JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,copilot:require("./node_modules/@github/copilot/package.json").version})' > "$evidence/environment.json"
sw_vers >> "$evidence/environment.json"
failed=0
for phase in base-1 feature-1 feature-2 base-2; do
  if [[ "$phase" == base-* ]]; then
    revision="$base"
  else
    revision="$feature"
  fi
  git switch --detach "$revision"
  git apply "$RUNNER_TEMP/cancellation.patch"
  npm run transpile-client > "$evidence/$phase-transpile.log" 2>&1
  for iteration in 1 2 3; do
    destination="$evidence/$phase-$iteration"
    mkdir -p "$destination"
    export VSCODE_CANCELLATION_DIAGNOSTICS="$destination"
    result=0
    ./scripts/test-integration.sh \
      --run src/vs/platform/agentHost/test/node/e2e/providers/copilotAgentHostE2E.integrationTest.ts \
      --grep 'cancelling a turn paused' > "$destination/test.log" 2>&1 || result=$?
    printf '%s\t%s\t%s\t%s\n' "$phase" "$iteration" "$revision" "$result" | tee -a "$evidence/results.tsv"
    if [[ "$result" != 0 ]]; then
      failed=1
    fi
  done
  git apply --reverse "$RUNNER_TEMP/cancellation.patch"
done
cat "$evidence/results.tsv" >> "$GITHUB_STEP_SUMMARY"
exit "$failed"
