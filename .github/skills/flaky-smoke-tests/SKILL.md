---
name: flaky-smoke-tests
description: Diagnose intermittent VS Code Electron smoke-test failures from the Azure DevOps Flaky Smoke Tests pipeline (definition 700). Covers finding failed iterations, downloading task logs and platform artifacts with Azure CLI, correlating cumulative runner logs, tracing the introducing commit, and queueing focused validation runs.
---

# Diagnosing Flaky Smoke Tests

Use this skill for failures from the Azure DevOps **Flaky Smoke Tests** pipeline:

- Organization: `https://dev.azure.com/monacotools`
- Project: `Monaco`
- Definition ID: `700`
- Pipeline YAML: `build/azure-pipelines/product-smoke-flaky.yml`
- Scheduled runs: twice daily on `main`

The pipeline builds VS Code from source and runs the complete Electron smoke
suite once per entry in the `iterations` parameter. Each platform runs its
iterations sequentially in one job.

## Important Pipeline Behavior

- Each iteration is a separate timeline task named
  `Smoke test iteration <N>/<total> (Electron)`.
- Iteration tasks use `continueOnError: true`, so a failed iteration normally
  has result `succeededWithIssues` and later iterations still run.
- Do not infer smoke-test health from the overall build or job result. Inspect
  every iteration task.
- Logs are published once per platform job from the shared `.build/logs`
  directory. The artifact is job-scoped, not iteration-scoped:
  `smoke-test-runner.log` can contain multiple iterations, and suite
  directories are not separated by iteration.
- The exact iteration task log is authoritative for its failure summary and
  time range. Correlate that range with the job-level artifact.
- Iterations can see persisted smoke-test state from earlier iterations, such
  as historical session rows. Never assume the newest-looking row or a matching
  prompt belongs to the active conversation without verifying the active view.

Platform definitions and artifacts:

| Platform | Job | Logs artifact | Crash artifact |
|---|---|---|---|
| macOS arm64 | `macOSSmokeFlaky` | `logs-macos-arm64-smoke-<attempt>` | `crash-dump-macos-arm64-smoke-<attempt>` |
| Windows x64 | `WindowsSmokeFlaky` | `logs-windows-x64-smoke-<attempt>` | `crash-dump-windows-x64-smoke-<attempt>` |
| Linux x64 | `LinuxSmokeFlaky` | `logs-linux-x64-smoke-<attempt>` | `crash-dump-linux-x64-smoke-<attempt>` |

## Prerequisites

Use Azure CLI rather than the browser:

```bash
az --version
az extension show --name azure-devops
az devops configure --defaults \
  organization=https://dev.azure.com/monacotools \
  project=Monaco
```

If authentication fails, run `az login`.

## 1. Confirm the Build and Source Revision

```bash
az pipelines build show \
  --id <BUILD_ID> \
  --org https://dev.azure.com/monacotools \
  --project Monaco \
  --query "{id:id,status:status,result:result,sourceBranch:sourceBranch,sourceVersion:sourceVersion,templateParameters:templateParameters}" \
  --output json
```

Record `sourceVersion`. Investigate the exact code built by the pipeline, not
the current working tree.

## 2. Find Failed Iterations

Download the build timeline:

```bash
az devops invoke \
  --org https://dev.azure.com/monacotools \
  --area build \
  --resource timeline \
  --route-parameters project=Monaco buildId=<BUILD_ID> \
  --output json
```

Filter task records whose names contain `Smoke test iteration`. Treat
`succeededWithIssues`, `failed`, and tasks with error issues as failed
iterations. Record:

- task `id`
- parent job `id`
- task `name`
- `startTime` and `finishTime`
- `log.id`
- `issues`

If the user supplied an Azure log URL, its `j=` value is the job ID and its
`t=` value is the task ID. Query those records directly:

```bash
az devops invoke \
  --org https://dev.azure.com/monacotools \
  --area build \
  --resource timeline \
  --route-parameters project=Monaco buildId=<BUILD_ID> \
  --query "records[?id=='<JOB_OR_TASK_ID>'].{id:id,parentId:parentId,name:name,type:type,state:state,result:result,logId:log.id,startTime:startTime,finishTime:finishTime,issues:issues}" \
  --output json
```

## 3. Download the Exact Iteration Task Log

Use timeline record `log.id`. The correct REST resource is `logs`, not
`buildLog`:

```bash
az devops invoke \
  --org https://dev.azure.com/monacotools \
  --area build \
  --resource logs \
  --route-parameters project=Monaco buildId=<BUILD_ID> logId=<LOG_ID> \
  --out-file task-log.json
```

The downloaded response is JSON with a `value` array containing one string per
log line. Convert it to plain text.

PowerShell:

```powershell
(Get-Content -Raw task-log.json | ConvertFrom-Json).value |
  Set-Content task-log.txt
```

Bash:

```bash
jq -r '.value[]' task-log.json > task-log.txt
```

The task log provides the concise Mocha failure, stack, active-view dump, and
the iteration's exact time range even before platform artifacts are published.

## 4. Download the Platform Logs Artifact

List artifacts first; names include the job attempt:

```bash
az pipelines runs artifact list \
  --run-id <BUILD_ID> \
  --org https://dev.azure.com/monacotools \
  --project Monaco \
  --output table
```

Download the relevant platform:

```bash
az pipelines runs artifact download \
  --run-id <BUILD_ID> \
  --artifact-name <LOGS_ARTIFACT> \
  --path <DESTINATION> \
  --org https://dev.azure.com/monacotools \
  --project Monaco
```

Artifacts are available after the platform job publishes its outputs.

## 5. Correlate the Failure

Start with `<DESTINATION>/smoke-tests-electron/smoke-test-runner.log`.
Use the failed task's timestamps and test title to isolate the matching
`Test start` / `Test end` interval. Do not use the first occurrence of a test
title because the runner log can contain several iterations.

Within that interval, establish this chain:

1. **Gesture**: Was the expected editor clicked and prompt typed?
2. **Dispatch**: Did the send action fire and did the new-session view close?
3. **Request**: Did the mock server receive the expected scenario tag?
4. **Tool loop**: For shell tests, did the second model request contain the
   expected tool result?
5. **Rendering**: Did an assistant response render, and in which session view?
6. **Routing**: Did the active session auto-swap to a new composer while the
   completed response remained in another session?

For mock-LLM suites, search for:

- the scenario ID
- `request body:`
- the expected response marker
- `model turn 1/2` and `model turn 2/2`

The request log distinguishes:

- no dispatch
- wrong provider or scenario
- tool call never executed
- tool result returned but UI rendering/routing lost it

Then inspect the suite directory:

```text
smoke-tests-electron/<N>_suite_<Suite_Name>/
```

Useful files include:

- `window*/exthost/<extension>/<extension>.log`
- `main.log`, `renderer.log`, and `agenthost.log`
- `playwright-screenshot-*.png`
- Playwright trace archives

For native exits or renderer crashes, also download the platform crash artifact.

## 6. Interpret UI Diagnostics Carefully

Session-list text and active-view text answer different questions:

- A list row can contain a prompt from the current test but a command or title
  inherited from a prior request.
- The active view can already be a fresh untitled composer while the response
  belongs to a completed, inactive session.
- Broad response selectors can match stale DOM from an earlier session or
  iteration.
- Reusing a fixed warm-up scenario marker can let a later warm-up wait match an
  earlier response and abandon the actually-running warm-up.

Prefer assertions that establish identity:

- unique scenario IDs or response markers per attempt
- active chat/session resource attributes
- expected response in the active session before follow-up input
- mock-server request count or captured request content after the gesture

Do not "fix" these races by only increasing a timeout. Wait for the actual
state transition or remove duplicate/in-flight work.

## 7. Find the Introducing Commit

Use the build's `sourceVersion` and identify the source file from the stack:

```bash
git show <SOURCE_VERSION>:test/smoke/src/areas/<area>/<test>.test.ts
git log --oneline <KNOWN_GOOD>..<SOURCE_VERSION> -- <relevant paths>
git blame -L <start>,<end> <file>
git show <SUSPECT_COMMIT> -- <relevant paths>
```

Trace the whole causal sequence, not only the failing assertion. For example,
inspect setup hooks, warm-ups, session selection, response waits, and teardown.

Distinguish:

- the commit that introduced the racy behavior
- a later unrelated commit after which timing happened to expose it
- a commit that only added diagnostics or made the flake visible

State the introducing commit only when the diff contains the causal behavior
and the pipeline evidence matches it.

## 8. Queue a Focused Validation Run

The branch and commit must already be pushed to `microsoft/vscode`. Check for
and cancel obsolete definition-700 runs on the same branch before queueing.

Use `az pipelines run` directly because `iterations` is an object parameter:

```bash
az pipelines run \
  --id 700 \
  --branch <BRANCH> \
  --commit-id <COMMIT_SHA> \
  --parameters "iterations=[1,2,3,4,5,6]" \
    VSCODE_BUILD_MACOS=true \
    VSCODE_BUILD_LINUX=false \
    VSCODE_BUILD_WIN32=true \
  --org https://dev.azure.com/monacotools \
  --project Monaco \
  --output json
```

Enable only platforms relevant to the failure. Confirm the queued run's
`sourceVersion` and `templateParameters` with `az pipelines build show`.

Six iterations are a useful quick validation sample. Use the default 20 when
the failure is rare or when validating before declaring a recurring flake
resolved.

## 9. Validate the Local Change

For smoke-test TypeScript changes:

```bash
npm run compile --prefix test/smoke
node --experimental-strip-types build/hygiene.ts <changed-file>
```

If local dependencies are missing or stale, report that explicitly and rely on
the focused definition-700 run for full compiled validation; do not silently
skip validation or install unrelated tooling.

## Expected Report

Summarize:

- build ID and source revision
- failing platform and iteration count
- exact failing test and symptom
- dispatch/request/rendering evidence
- root cause
- introducing commit, with why it is causal
- fix commit
- focused validation run ID, platforms, iterations, and current result

