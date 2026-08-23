# Launch skill performance dashboard

Last updated: 2026-08-22

## Current status

| Stage | State | Result |
|---|---|---|
| Isolated baseline | Complete | Both Agents and Editor windows measured against a non-git fixture |
| Batched checked driver | Complete | One direct-CDP process runs the full checked scenario |
| Adaptive waits | Complete | Response/fork state polled every 50 ms up to a real deadline |
| Action recording hints | Complete | Redacted input events plus compact DOM mutation evidence |
| Launcher startup | Complete | 0.99 s safe default; 0.69 s prepared-build fast path |

## Baseline

The dominant cost is not Code OSS startup. A no-op `@playwright/cli eval` takes
about **1.48 s** because each command starts another CLI process. Current
model-driven trials used 21-43 Playwright invocations.

| Orchestrator | Surface | Result | Total | Setup | Turn 1 | Turn 2 | Fork | PW calls |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| GPT-5.4 mini | Agents | Fork timed out | 62.0 s | 24.0 s | 3.0 s | 3.0 s | 30.0 s | 43 |
| GPT-5.4 mini | Editor | Fork timed out | 51.0 s | 14.0 s | 3.0 s | 2.0 s | 30.0 s | 24 |
| Gemini 3.7 Flash | Agents | Passed | 45.8 s | 21.2 s | 6.1 s | 5.0 s | 5.5 s | 21 |
| Gemini 3.7 Flash | Editor | Passed | 45.0 s | 14.1 s | 8.0 s | 5.0 s | 5.6 s | 24 |

> The model runner reported a different internal model label in some trials.
> The table uses the model requested by the benchmark invocation; raw output
> preserves both values.

## Targets

| Metric | Baseline | Target |
|---|---:|---:|
| Playwright processes per two-turn/fork scenario | 21-43 | 1 |
| Automation overhead excluding model responses | 25-56 s | < 5 s |
| Fork completion detection | Up to fixed 30 s | Actual state change, usually 1-6 s |
| Modal handling | Inconsistent | No action may run behind a visible modal |
| Workspace isolation | Manual | Enforced non-git fixture |

## Checked-driver result

Final three-run validation after batching:

| Surface | Reliability | Median launch | Median scenario | Median total | Automation processes | Median fork |
|---|---:|---:|---:|---:|---:|---:|
| Agents | 3/3 | 1.11 s | 13.89 s | 14.87 s | 1 | 0.24 s |
| Editor | 3/3 | 0.75 s | 14.62 s | 15.37 s | 1 | 0.22 s |

Every trial used and removed a unique child of
`/tmp/vscode-launch-benchmark-workspaces`, ended with zero visible modals, and
left the repository worktree list unchanged. The Agents window transiently
dropped its selected workspace once per cold trial while models initialized;
the driver detected and repaired that state before sending.

## Launcher result

| Mode | Baseline | Current | Change |
|---|---:|---:|---:|
| Safe default | 1.78 s | 0.99 s | 44% faster |
| Prepared Editor build (`--skip-prelaunch`) | 1.78 s | 0.69 s | 61% faster |
| Prepared Agents build (`--skip-prelaunch`) | 1.78 s | 0.74 s | 58% faster |

The launcher now allocates all four debug ports with one Node process, probes
CDP every 100 ms instead of every second, and reports profile/pre-launch/CDP
phase timings in its JSON output.

An initial Agents comparison incorrectly attributed workspace-picker/session
races to skipped pre-launch preparation. After hardening that flow, five repeated
Agents trials with `--skip-prelaunch` passed with a 0.74 s median launch.

## Commit history

This table is updated after every measured optimization.

| Commit | Change | Metric |
|---|---|---|
| `57fba0f1fde` | Isolated baseline and dashboard | 45-62 s end to end; 21-43 PW calls |
| `0cf9811efae` | Batched checked driver, adaptive waits, recorder | 15.38-15.91 s; 1 automation process |
| `0b87e78adc5` | Faster launch, state-specific waits, per-trial fixtures | 14.87-15.37 s median; 3/3 on both surfaces |
| `26e51087e35` | Correct Agents pre-launch attribution and picker race | 5/5 prepared Agents trials; 0.74 s median launch |
