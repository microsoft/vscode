---
name: smoke-tests
description: Use when running VS Code smoke tests or working on smoke-test CI steps. Covers npm run smoketest / smoketest-no-compile, grep filtering tests, and a temporary repeat-loop technique for tracking down flaky smoke tests in CI.
---

# Running Smoke Tests

Smoke tests live in `test/smoke/` and drive a full VS Code instance (Electron, web, or remote) through end-to-end user flows.

## Scripts

- `npm run smoketest` — compiles the smoke tests first (`test/smoke`), then runs them.
- `npm run smoketest-no-compile` — runs the already-compiled smoke tests. CI uses this after an explicit compile step.

Both forward extra arguments after `--` to the runner (`test/smoke/test/index.js`).

## Common options

| Option | Description |
|--------|-------------|
| `-g <pattern>` (alias `-f`) | Grep filter on test/suite titles (mocha `grep`). |
| `--build <path>` | Run against a packaged build instead of the compiled-from-source dev build. |
| `--tracing` | Capture Playwright traces (and screenshots on failure). |
| `--web` | Run the browser smoke tests instead of Electron. |
| `--headless` | Headless browser (used with `--web`). |
| `--remote` | Run the remote smoke tests. |

```bash
# Run everything (Electron, from source)
npm run smoketest

# Run only a subset of suites by name, with tracing (replace <suite name> with your suite, e.g. "Agents Window")
npm run smoketest -- -g "<suite name>" --tracing

# Run against a packaged build (CI style)
npm run smoketest-no-compile -- --tracing --build "/path/to/VSCode-darwin-arm64/Code - OSS.app"
```

The `-g` pattern matches against test/suite titles. For example, `-g "Agents Window"` matches all three Agents Window suites (`Agents Window`, `Agents Window (local AgentHost)`, and `Agents Window (local AgentHost, SDK sandbox)`); use whatever substring identifies the suite(s) you care about.

The runner exits non-zero if any test fails, so a `0` exit code means every selected test passed.

## Temporarily looping a suite to hunt flaky CI tests

When a smoke test fails intermittently only in CI, a useful technique is to **temporarily** run the suspect suite many times in a row and fail on the first failure. This reproduces the flake under the real CI environment and captures its traces/screenshots, instead of waiting for it to recur naturally across unrelated PRs.

This is a debugging aid, **not a permanent CI fixture**:

- Add it on a throwaway branch, push, and let CI run it. Iterate until you reproduce (and then fix) the flake.
- **Remove the loop before merging** — leaving it in would add ~an hour per platform to every run.
- It is **not specific to any one suite**. Point the `-g` filter at whichever suite you are investigating (the examples below use `"Agents Window"`, but substitute your own).

### Where to add it

Drop the loop next to the existing Electron smoke step, gated on the same condition, in the test step(s) for the platform(s) where the flake reproduces:

**GitHub PR workflows** (run from source, no `--build`):
- `.github/workflows/pr-linux-test.yml` (bash; sets `DISPLAY: ":10"`)
- `.github/workflows/pr-darwin-test.yml` (bash; no `DISPLAY`)
- `.github/workflows/pr-win32-test.yml` (PowerShell)

**Azure DevOps test steps** (run against the packaged build via `--build`):
- `build/azure-pipelines/linux/steps/product-build-linux-test.yml`
- `build/azure-pipelines/darwin/steps/product-build-darwin-test.yml`
- `build/azure-pipelines/win32/steps/product-build-win32-test.yml`

### Shape

Loop N iterations (e.g. 20) and abort on the first failing run. Give it a generous timeout — N sequential runs of a ~3-minute suite can take roughly an hour.

Bash (Linux/macOS):

```yaml
# TEMPORARY: loop the suite to reproduce a flaky failure. Remove before merge.
# Replace <suite name> with the suite you're investigating (e.g. "Agents Window").
- name: 🧪 Smoke test flakiness probe (TEMPORARY)
  if: ${{ inputs.electron_tests }}
  timeout-minutes: 60
  run: |
    for i in $(seq 1 20); do
      echo "::group::Smoke probe run $i/20"
      npm run smoketest-no-compile -- --tracing -g "<suite name>" || { echo "::error::Smoke test failed on run $i/20"; exit 1; }
      echo "::endgroup::"
    done
```

PowerShell (Windows) checks `$LASTEXITCODE` after each run and `exit 1` on failure. The AzDO variants use `set -e` (bash) / `$LASTEXITCODE` (pwsh) for fail-fast and append `--build "<packaged app path>"`.

### Why fail-fast

The loop is a probe: the first failure is the signal. Stopping immediately preserves the failing run's traces/screenshots (under the logs artifact) and avoids burning ~an hour of agent time finishing a run that has already proven flaky.

## Debugging CI smoke failures

Both CI systems publish the smoke runner's per-platform logs (the `.build/logs` directory) as a downloadable artifact. The artifact's internal layout is identical on both — only the artifact name and the download tool differ.

### Downloading the logs artifact

#### GitHub Actions

The GitHub PR workflows upload the artifact as `logs-<os>-<arch>-<suite>-<attempt>`, where `<os>` is `linux` / `macos` / `windows`, `<suite>` is `electron` / `browser` / `remote`, and `<attempt>` is the run attempt (e.g. `logs-macos-arm64-electron-1`).

The run id is the number in the run/job URL — for `…/actions/runs/<run-id>/job/<job-id>` use `<run-id>`. Download with the `gh` CLI:

```bash
# A specific artifact into ./logs
gh run download <run-id> -n logs-<os>-<arch>-<suite>-<attempt> -D ./logs

# Or every artifact from the run
gh run download <run-id>
```

`gh run view <run-id>` lists the run's jobs/artifacts; the run summary page in the browser also has an **Artifacts** section at the bottom.

#### Azure DevOps

The artifact name depends on which pipeline produced it:

- **Product build** (`product-build-<os>.yml`): `logs-<os>-<arch>-<attempt>` — no suite segment, e.g. `logs-macos-arm64-1`.
- **Suite-split CI build** (`product-build-<os>-ci.yml`): `logs-<os>-<arch>-<suite>-<attempt>` — the `<suite>` segment is `lower(VSCODE_TEST_SUITE)` (e.g. `electron`), so e.g. `logs-macos-arm64-electron-1` (same shape as GitHub).

`<os>` is `linux` / `macos` / `windows`, `<arch>` is `x64` / `arm64`, and `<attempt>` is `$(System.JobAttempt)`. Download with the Azure CLI:

```bash
az pipelines runs artifact download \
  --org <ORG_URL> --project <PROJECT_NAME> \
  --run-id <BUILD_ID> --artifact-name <artifact-name> \
  --path ./logs
```

For the VS Code build that is `--org https://dev.azure.com/monacotools --project Monaco`; see the `azure-pipelines` skill for finding the `<BUILD_ID>`.

### Inside the artifact

Under `smoke-tests-<suite>/` (`smoke-tests-electron/`, `smoke-tests-browser/`, or `smoke-tests-remote/`, matching the suite that ran):

- `smoke-test-runner.log` — the mocha driver output plus, for suites that use the mock LLM server, its verbose request/response bodies (look for `request body:`).
- `<N>_suite_<Suite_Name>/window2/exthost/<extension>/…log` — per-suite extension-host logs (e.g. `GitHub.copilot-chat/GitHub Copilot Chat.log`). Many diagnostics are gated behind a setting the suite enables in its `before` hook, so check the suite's setup if an expected log line is missing.
- `<N>_suite_<Suite_Name>/playwright-screenshot-*.png` — last-frame screenshot captured when a test fails (only when the suite ran with `--tracing`).

`<Suite_Name>` is the mocha suite title with non-word characters replaced by `_`. See also the `code-oss-logs` skill.



## Distinction from other test types

- **Unit tests** (`.test.ts`) → `scripts/test.sh` / `runTests` tool (see the `unit-tests` skill).
- **Integration tests** (`.integrationTest.ts` + extension tests) → `scripts/test-integration.sh` (see the `integration-tests` skill).
- **Smoke tests** (`test/smoke/`) → `npm run smoketest` — full end-to-end UI flows.
