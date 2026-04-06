---
name: fix-ci-failures
description: Investigate and fix CI failures on a pull request. Use when CI checks fail on a PR branch — covers finding the PR, identifying failed checks, downloading logs and artifacts, extracting the failure cause, and iterating on a fix. Requires the `gh` CLI.
---

# Investigating and Fixing CI Failures

This skill guides you through diagnosing and fixing CI failures on a PR using the `gh` CLI. The user has the PR branch checked out locally.

## Workflow Overview

1. Identify the current branch and its PR
2. Check CI status and find failed checks
3. Download logs for failed jobs
4. Extract and understand the failure
5. Fix the issue and push

---

## Step 1: Identify the Branch and PR

```bash
# Get the current branch name
git branch --show-current

# Find the PR for this branch
gh pr view --json number,title,url,statusCheckRollup
```

If no PR is found, the user may need to specify the PR number.

---

## Step 2: Check CI Status

```bash
# List all checks and their status (pass/fail/pending)
gh pr checks --json name,state,link,bucket

# Filter to only failed checks
gh pr checks --json name,state,link,bucket --jq '.[] | select(.bucket == "fail")'
```

The `link` field contains the URL to the GitHub Actions job. Extract the **run ID** from the URL — it's the number after `/runs/`:
```
https://github.com/microsoft/vscode/actions/runs/<RUN_ID>/job/<JOB_ID>
```

If checks are still `IN_PROGRESS`, wait for them to complete before downloading logs:
```bash
gh pr checks --watch --fail-fast
```

---

## Step 3: Get Failed Job Details

```bash
# List failed jobs in a run (use the run ID from the check link)
gh run view <RUN_ID> --json jobs --jq '.jobs[] | select(.conclusion == "failure") | {name: .name, id: .databaseId}'
```

---

## Step 4: Download Failure Logs

There are two approaches depending on the type of failure.

### Option A: View Failed Step Logs Directly

Best for build/compile/lint failures where the error is in the step output:

```bash
# View only the failed step logs (most useful — shows just the errors)
gh run view <RUN_ID> --job <JOB_ID> --log-failed
```

> **Important**: `--log-failed` requires the **entire run** to complete, not just the failed job. If other jobs are still running, this command will block or error. Use **Option C** below to get logs for a completed job while the run is still in progress.

The output can be large. Pipe through `tail` or `grep` to focus:
```bash
# Last 100 lines of failed output
gh run view <RUN_ID> --job <JOB_ID> --log-failed | tail -100

# Search for common error patterns
gh run view <RUN_ID> --job <JOB_ID> --log-failed | grep -E "Error|FAIL|error TS|AssertionError|failing"
```

### Option B: Download Artifacts

Best for integration test failures where detailed logs (terminal logs, ext host logs, crash dumps) are uploaded as artifacts:

```bash
# List available artifacts for a run
gh run download <RUN_ID> --pattern '*' --dir /dev/null 2>&1 || gh run view <RUN_ID> --json jobs --jq '.jobs[].name'

# Download log artifacts for a specific failed job
# Artifact naming convention: logs-<platform>-<arch>-<test-type>-<attempt>
# Examples: logs-linux-x64-electron-1, logs-linux-x64-remote-1
gh run download <RUN_ID> -n "logs-linux-x64-electron-1" -D /tmp/ci-logs

# Download crash dumps if available
gh run download <RUN_ID> -n "crash-dump-linux-x64-electron-1" -D /tmp/ci-crashes
```

> **Tip**: Use the test runner name from the failed check (e.g., "Linux / Electron" → `electron`, "Linux / Remote" → `remote`) and platform map ("Windows" → `windows-x64`, "Linux" → `linux-x64`, "macOS" → `macos-arm64`) to construct the artifact name.

> **Warning**: Log artifacts may be empty if the test runner crashed before producing output (e.g., Electron download failure). In that case, fall back to **Option C**.

### Option C: Download Per-Job Logs via API (works while run is in progress)

When the run is still in progress but the failed job has completed, use the GitHub API to download that job's step logs directly:

```bash
# Save the full job log to a temp file (can be very large — 30k+ lines)
gh api repos/microsoft/vscode/actions/jobs/<JOB_ID>/logs > "$TMPDIR/ci-job-log.txt"
```

Then search the saved file. **Start with `##[error]`** — this is the GitHub Actions error annotation that marks the exact line where the step failed:

```bash
# Step 1: Find the error annotation (fastest path to the failure)
grep -n '##\[error\]' "$TMPDIR/ci-job-log.txt"

# Step 2: Read context around the error (e.g., if error is on line 34371, read 200 lines before it)
sed -n '34171,34371p' "$TMPDIR/ci-job-log.txt"
```

If `##[error]` doesn't reveal enough, use broader patterns:
```bash
# Find test failures, exceptions, and crash indicators
grep -n -E 'HTTPError|ECONNRESET|ETIMEDOUT|502|exit code|Process completed|node:internal|triggerUncaughtException' "$TMPDIR/ci-job-log.txt" | head -20
```

> **Why save to a file?** The API response for a full job log can be 30k+ lines. Tool output gets truncated, so always redirect to a file first, then search.

### VS Code Log Artifacts Structure

Downloaded log artifacts typically contain:
```
logs-linux-x64-electron-1/
  main.log              # Main process log
  terminal.log          # Terminal/pty host log (key for run_in_terminal issues)
  window1/
    renderer.log        # Renderer process log
    exthost/
      exthost.log       # Extension host log (key for extension test failures)
```

Key files to examine first:
- **Test assertion failures**: Check `exthost.log` for the extension host output and stack traces
- **Terminal/sandbox issues**: Check `terminal.log` for rewriter pipeline, shell integration, and strategy logs
- **Crash/hang**: Check `main.log` and look for crash dumps artifacts

---

## Step 5: Extract the Failure

### For Test Failures

Look for the test runner output in the failed step log:
```bash
# Find failing test names and assertion messages
gh run view <RUN_ID> --job <JOB_ID> --log-failed | grep -A 5 "failing\|AssertionError\|Expected\|Unexpected"
```

Common patterns in VS Code CI:
- **`AssertionError [ERR_ASSERTION]`**: Test assertion failed — check expected vs actual values
- **`Extension host test runner exit code: 1`**: Integration test suite had failures
- **`Command produced no output`**: Shell integration may not have captured command output (see terminal.log)
- **`Error: Timeout`**: Test timed out — could be a hang or slow CI machine

### For Build Failures

```bash
# Find TypeScript compilation errors
gh run view <RUN_ID> --job <JOB_ID> --log-failed | grep "error TS"

# Find hygiene/lint errors
gh run view <RUN_ID> --job <JOB_ID> --log-failed | grep -E "eslint|stylelint|hygiene"
```

---

## Step 6: Determine if Failures are Related to the PR

Before fixing, determine if the failure is caused by the PR changes or is a pre-existing/infrastructure issue:

1. **Check if the failing test is in code you changed** — if the test is in a completely unrelated area, it may be a flake
2. **Check the test name** — does it relate to the feature area you modified?
3. **Look at the failure output** — does it reference code paths your PR touches?
4. **Check if the same tests fail on main** — if identical failures exist on recent main commits, it's a pre-existing issue
5. **Look for infrastructure failures** — network timeouts, npm registry errors, and machine-level issues are not caused by code changes

```bash
# Check recent runs on main for the same workflow
gh run list --branch main --workflow pr-linux-test.yml --limit 5 --json databaseId,conclusion,displayTitle
```

### Recognizing Infrastructure / Flaky Failures

Not all CI failures are caused by code changes. Common infrastructure failures:

**Network / Registry issues**:
- `npm ERR! network`, `ETIMEDOUT`, `ECONNRESET`, `EAI_AGAIN` — npm registry unreachable
- `error: RPC failed; curl 56`, `fetch-pack: unexpected disconnect` — git network failure
- `Error: unable to get local issuer certificate` — TLS/certificate issues
- `rate limit exceeded` — GitHub API rate limiting
- `HTTPError: Request failed with status code 502` on `electron/electron/releases` — Electron CDN download failure (common in the `node.js integration tests` step, which downloads Electron at runtime)

**Machine / Environment issues**:
- `No space left on device` — CI disk full
- `ENOMEM`, `JavaScript heap out of memory` — CI machine ran out of memory
- `The runner has received a shutdown signal` — CI preemption / timeout
- `Error: The operation was canceled` — GitHub Actions cancelled the job
- `Xvfb failed to start` — display server for headless Linux tests failed

**Test flakes** (not infrastructure, but not your fault either):
- Timeouts on tests that normally pass — slow CI machine
- Race conditions in async tests
- Shell integration not reporting exit codes (see terminal.log for `exitCode: undefined`)

**What to do with infrastructure failures**:
1. **Don't change code** — the failure isn't caused by your PR
2. **Re-run the failed jobs** via the GitHub UI or:
   ```bash
   gh run rerun <RUN_ID> --failed
   ```
3. If failures persist across re-runs, check if main is also broken:
   ```bash
   gh run list --branch main --limit 10 --json databaseId,conclusion,displayTitle
   ```
4. If main is broken too, wait for it to be fixed — your PR is not the cause

---

## Step 7: Fix and Iterate

1. Make the fix locally
2. Verify compilation: check the `VS Code - Build` task or run `npm run compile-check-ts-native`
3. Run relevant unit tests locally: `./scripts/test.sh --grep "<pattern>"`
4. Commit and push:
   ```bash
   git add -A
   git commit -m "fix: <description>"
   git push
   ```
5. Watch CI again:
   ```bash
   gh pr checks --watch --fail-fast
   ```

---

## Quick Reference

| Task | Command |
|------|---------|
| Find PR for branch | `gh pr view --json number,url` |
| List all checks | `gh pr checks --json name,state,bucket` |
| List failed checks only | `gh pr checks --json name,state,link,bucket --jq '.[] \| select(.bucket == "fail")'` |
| Watch checks until done | `gh pr checks --watch --fail-fast` |
| Failed jobs in a run | `gh run view <RUN_ID> --json jobs --jq '.jobs[] \| select(.conclusion == "failure") \| {name, id: .databaseId}'` |
| View failed step logs | `gh run view <RUN_ID> --job <JOB_ID> --log-failed` (requires full run to complete) |
| Download job log via API | `gh api repos/microsoft/vscode/actions/jobs/<JOB_ID>/logs > "$TMPDIR/ci-job-log.txt"` (works while run is in progress) |
| Find error line in log | `grep -n '##\[error\]' "$TMPDIR/ci-job-log.txt"` |
| Download log artifacts | `gh run download <RUN_ID> -n "<artifact-name>" -D /tmp/ci-logs` |
| Re-run failed jobs | `gh run rerun <RUN_ID> --failed` |
| Recent main runs | `gh run list --branch main --workflow <workflow>.yml --limit 5` |
