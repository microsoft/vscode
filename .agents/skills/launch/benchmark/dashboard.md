# Launch skill performance dashboard

Last updated: 2026-08-22

## Current status

| Stage | State | Result |
|---|---|---|
| Isolated baseline | Complete | Both Agents and Editor windows measured against a non-git fixture |
| Batched checked driver | In progress | Replace one-process-per-action orchestration |
| Adaptive waits | In progress | Observe actual response/fork state instead of fixed sleeps |
| Action recording hints | Planned | Capture user actions and compact DOM-change evidence |
| Launcher startup | Baseline complete | 1.78-2.02 s to CDP ready on this machine |

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

## Commit history

This table is updated after every measured optimization.

| Commit | Change | Metric |
|---|---|---|
| Pending | Isolated baseline and dashboard | 45-62 s end to end; 21-43 PW calls |
