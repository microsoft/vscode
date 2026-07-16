---
name: agent-host-e2e-tests
description: Use when writing, recording, updating, or troubleshooting the agent host end-to-end tests under src/vs/platform/agentHost/test/node/protocol (black-box tests that drive the whole agent host over the AHP protocol, using a CapiReplayProxy record/replay system for Claude/Copilot/Codex). Covers adding a cross-provider test, re-recording fixtures after an SDK bump, gating non-deterministic or platform-specific tests, and diagnosing replay cache misses.
---

# Agent host end-to-end tests

These tests run the whole agent host end-to-end (real server, real bundled provider SDK/CLI, real AHP protocol) while replaying recorded model traffic from committed YAML fixtures — deterministic and tokenless.

**Before doing anything, read the architecture + troubleshooting reference:**
`src/vs/platform/agentHost/test/node/protocol/README.md`

It documents the mental model, the fixture format, every config flag, and a symptom→cause→fix troubleshooting table. This skill is only the *workflows*; the README is the source of truth for *how it works*.

## Non-negotiable rules

1. **Replay is default and strict.** No env var → serves committed fixtures, no token, no network. An unrecorded request is a hard cache miss that fails the run.
2. **A fixture's filename is derived from the test title** (`${provider}-${slug}.yaml`). Renaming a test orphans its fixture — re-record after any rename.
3. **Recording needs a real token** (`GITHUB_TOKEN` or `gh auth token`) and talks to real CAPI. Only run it intentionally, with trivial/read-only prompts in temp dirs.
4. **Never hand-write or hand-edit fixture contents** (especially not secrets/paths). Fixtures are always produced by recording; normalization/redaction is the proxy's job.
5. **Gate, don't fight.** If a behavior can't replay deterministically, gate the test (see Workflow C) instead of loosening timeouts or the strict check.

## Workflow A — Add a cross-provider test

1. Add a `test(...)` inside `defineAgentHostE2ETests` in `agentHostE2ETestHelpers.ts`. Drive it with `dispatchTurn(...)` + `client.waitForNotification(...)`; assert on AHP notifications, never on wall-clock timing.
2. Keep the prompt minimal and deterministic (fewer model turns → smaller, more robust fixtures).
3. Record fixtures for every enabled provider (Workflow B).
4. **Review the diff** (Workflow B step 3), then run the test in plain replay mode to confirm it's green, then commit the test + fixtures together.

Provider-specific assertions go in that provider's `*.integrationTest.ts` after the `defineAgentHostE2ETests(config)` call.

## Workflow B — Record / re-record fixtures

Re-record when you add a test, or when a bundled SDK/CLI bump changes its wire behavior (new endpoint, different turn count, changed tool schema).

1. Ensure a token is available: `gh auth token` (or export `GITHUB_TOKEN`).
2. Record per provider:
   ```bash
   AGENT_HOST_REPLAY_RECORD=1 ./scripts/test-integration.sh --run \
     src/vs/platform/agentHost/test/node/protocol/claudeAgentHostE2E.integrationTest.ts
   ```
   Repeat for `copilotAgentHostE2E` / `codexAgentHostE2E` as needed.
3. **Review `git diff` on the fixtures**: no local usernames/absolute paths, no tokens, no unreleased model ids. If something leaked, the fix is to extend normalization/redaction in `capiReplayProxy.ts` (`_normalize` + the `*_RE` redactors) and re-record — not to edit the fixture.
4. Run plain replay (no env var) to confirm green, then commit.

If an SDK now hits a new **ancillary/bootstrap** endpoint (a probe, not a real model turn), add it to `capiStubs.ts` (served, not recorded) instead of recording it — see how `/models/session` is handled.

## Workflow C — When a test can't replay deterministically

Real-time streaming, mid-turn aborts, and POSIX-specific local execution (shell tools, `pwd`, git worktrees) don't replay reliably. Gate them precisely so you keep coverage where it works:

- **Record-only** (no deterministic replay at all): `(RECORD ? test : test.skip)('…')` — see `can abort a running turn`.
- **Subagent fixtures stale after an SDK bump**: re-record them (`AGENT_HOST_REPLAY_RECORD=1 …`). Subagent flows are the most SDK-version-sensitive (parent + child share one `/v1/messages` sequence), but replay reliably once re-recorded, so no gating is needed.
- **POSIX-only** (fails on Windows): gate with `!isWindows`, or a targeted per-provider flag when only one provider diverges. See the worktree and subagent-reopen tests.
- **Provider/OS-specific replay**: add a targeted config gate that still permits recording and unaffected platforms. See the Codex shell-tool Linux gate.

Always add a comment explaining *why* the gate exists.

## Verifying & troubleshooting

- Run a single provider in replay: `./scripts/test-integration.sh --run <path>` (no env var).
- Filter to one test: add `--grep "<test title fragment>"`.
- For any failure (`cache miss`, missing fixture, per-OS timeout, leaked PII, subagent staleness, accidental real-CAPI contact), go to the **Troubleshooting** section of the README — it maps each symptom to its cause and fix.
