---
name: agent-host-e2e-tests
description: Use when writing, recording, updating, validating, or troubleshooting Agent Host end-to-end and real-provider integration tests under src/vs/platform/agentHost/test/node/e2e and providerIntegration. Covers adding a cross-provider test, re-recording fixtures after an SDK bump, required cross-platform Azure validation, gating non-deterministic or platform-specific tests, and diagnosing replay cache misses.
---

# Agent host end-to-end tests

These tests run the whole agent host end-to-end (real server, real bundled provider SDK/CLI, real AHP protocol) while replaying recorded model traffic from committed YAML fixtures — deterministic and tokenless.

**Before doing anything, read the architecture + troubleshooting reference:** `src/vs/platform/agentHost/test/node/e2e/README.md`

It documents the mental model, the fixture format, every config flag, and a symptom→cause→fix troubleshooting table. This skill is only the *workflows*; the README is the source of truth for *how it works*.

When validating an upstream provider/runtime fix, use [ci-artifact-testing](../ci-artifact-testing/SKILL.md) to check for a compatible CI artifact before building locally. Run the same strict replay against the bundled baseline and candidate; preserve the test assertions and existing cross-platform validation requirements.

## Core invariants

1. **Replay is default and strict.** No env var serves committed fixtures without a token or network. An unrecorded request is a hard cache miss.
2. **Fixture names derive from test titles.** Renaming a model-backed test orphans `${provider}-${slug}.yaml`; re-record after a rename. Tests explicitly registered with `hostOnlyTest(...)` share `captures/empty.yaml`.
3. **Recording is intentional and credentialed.** `AGENT_HOST_REPLAY_RECORD=1` talks to real CAPI and needs `GITHUB_TOKEN` or `gh auth token`. Keep prompts trivial and read-only in temporary directories.
4. **Fixtures are generated, never hand-edited.** Fix normalization or redaction and re-record if a capture contains unstable or sensitive data.
5. **Disabled variants stay accountable.** Record every gate in `e2e/KNOWN_ISSUES.md` with its scope, expected and observed behavior, and focused reproduction command.
6. **Azure validation is required.** Every new Agent Host E2E or real-provider integration test must pass a focused build from VS Code pipeline definition `111` before merge.

## Basic workflow: write and evaluate an E2E test

1. **Choose the boundary and tier.** Put provider-invariant AHP behavior in conformance, provider behavior in parity, and use `providerHostOnlyTest(...)` only when provider-specific behavior must not cross the model boundary.
2. **Add the test to the closest suite.** Create and register a focused suite module only when the behavior is distinct. Keep provider-specific assertions in the provider's `*.integrationTest.ts`.
3. **Implement the smallest deterministic scenario.** Keep prompts minimal, drive behavior over AHP, wait for the exact prerequisite and completion states, and drain every model-backed turn.
4. **Assert the contract's primary observable result.** Check the real protocol result or external side effect; snapshot additional traffic only when ordering, routing, or lifecycle is part of the contract.
5. **Record every enabled provider fixture.** Host-only tests use the shared strict empty fixture. Follow the recording workflow below for model-backed tests.
6. **Review generated artifacts.** Check fixture and snapshot diffs for the intended behavior, normalized paths, no credentials or usernames, and no unintended model or request changes.
7. **Evaluate locally.** Run the focused test in strict replay, run adjacent tests when helpers or shared state changed, repeat timing- or lifecycle-sensitive scenarios, then run the full deterministic suite and required coverage, type-check, hygiene, and layer checks from the E2E README.
8. **Evaluate in CI.** Open or update a draft PR and complete the cross-platform Azure validation below. Timing, process-lifecycle, filesystem-watching, reconnect, restart, and worktree tests require two clean executions on every supported platform.

## General best practices and mistakes to avoid

Keep this section curated. Add or refine a principle only when root-cause analysis reveals a pattern likely to improve other tests; keep failure-specific commands, logs, and mechanics in the E2E README or investigation report.

- **Wait for the contract state, not a proxy.** Existence, discovery, or an emitted intermediate action may not mean a dependency is operational. For example, wait for the target chat's MCP server to report `Ready`, not merely for its plugin child to appear.
- **Assert primary outcomes before secondary effects.** A hook, notification, assistant response, or persisted record can be downstream of the behavior under test. First prove the actual tool result or external side effect succeeded.
- **Do not confuse replay success with execution success.** Replay controls model traffic; live tools, MCP servers, hooks, commands, and filesystem operations can still fail. Recorded assistant text is not an oracle for those operations.
- **Synchronize on observable state, never elapsed time.** Use protocol notifications or exact state polling instead of sleeps, timeout increases, or existence-only checks.
- **Respect scope and lifecycle.** Readiness can belong to a specific chat, session, provider process, or workspace. Materialize and observe the same scope the operation will use, drain work before teardown, and clean up owned resources. Keep temporary workspaces outside instruction-bearing ancestors: changing their location can inject unrelated repository customizations into a provider's model request.
- **Separate storage semantics from device latency.** RAM-backed files can retain real SQLite transactions, close/reopen, and host-restart behavior; keep required disk-backed lifecycle coverage separately. Compare unchanged workloads on the same worker and inspect phase timings, not just pass counts, before attributing a timeout to physical storage.
- **Centralize recurring lifecycle barriers.** If several tests need the same multi-step prerequisite, encode it in a shared helper so tests cannot choose a weaker intermediate condition.
- **Gate genuine nondeterminism narrowly.** Use record-only or provider/platform gates only for behavior that cannot replay deterministically or is unsupported; never use a gate to hide an unexplained failure.

## Record or re-record fixtures

Re-record when you add a test, or when a bundled SDK/CLI bump changes its wire behavior (new endpoint, different turn count, changed tool schema).

1. Ensure a token is available: `gh auth token` (or export `GITHUB_TOKEN`).
2. Record per provider:
   ```bash
   AGENT_HOST_REPLAY_RECORD=1 ./scripts/test-integration.sh --run \
     src/vs/platform/agentHost/test/node/e2e/providers/claudeAgentHostE2E.integrationTest.ts
   ```
   Repeat for `copilotAgentHostE2E` / `codexAgentHostE2E` as needed.
3. **Review `git diff` on the fixtures**: no local usernames/absolute paths, no tokens, no unreleased model ids. If something leaked, the fix is to extend normalization/redaction in `capiReplayProxy.ts` (`_normalize` + the `*_RE` redactors) and re-record — not to edit the fixture.
4. Run plain replay (no env var) to confirm green, then commit.

If an SDK now hits a new **ancillary/bootstrap** endpoint (a probe, not a real model turn), add it to `capiStubs.ts` (served, not recorded) instead of recording it — see how `/models/session` is handled.

## Gate a variant that cannot replay deterministically

Real-time streaming, mid-turn aborts, and POSIX-specific local execution (shell tools, `pwd`, git worktrees) don't replay reliably. Gate them precisely so you keep coverage where it works:

- **Record-only** (no deterministic replay at all): `(RECORD ? test : test.skip)('…')` — see `can abort a running turn`.
- **Subagent fixtures stale after an SDK bump**: re-record them (`AGENT_HOST_REPLAY_RECORD=1 …`). Subagent flows are the most SDK-version-sensitive (parent + child share one `/v1/messages` sequence), but replay reliably once re-recorded, so no gating is needed.
- **POSIX-only** (fails on Windows): gate with `!isWindows`, or a targeted per-provider flag when only one provider diverges. See the worktree and subagent-reopen tests.
- **Provider/OS-specific replay**: add a targeted config gate that still permits recording and unaffected platforms. See the Codex shell-tool Linux gate.

Always add a comment explaining *why* the gate exists. Also add or update the corresponding entry in `e2e/KNOWN_ISSUES.md`. When the variant is enabled again, remove or update the entry in the same change.

## Cross-platform Azure validation

New Agent Host E2E and real-provider integration tests are not ready to merge after local or GitHub pull-request CI alone. Push the branch, open or update a draft PR, then use the `azure-pipelines` skill to validate the real packaged Electron integration-test path.

1. Queue VS Code pipeline definition `111` with `VSCODE_BUILD_TYPE=CI`; enable Windows, Linux, and macOS x64 while disabling publishing, release, Web, ARM, Alpine, and Snap artifacts. The `azure-pipelines` skill contains the canonical command.
2. Monitor jobs as they finish. Inspect a failed platform's Electron integration-test task immediately rather than waiting for unrelated stages to complete.
3. Treat the Agent Host E2E result as accepted only when the Electron integration tests succeed on Windows, Linux, and macOS.
4. Rerun an apparently unrelated or pre-existing failure in isolation before attributing it to the PR.
5. After a platform-specific fix, rerun at least that platform. Rerun all three platforms when the fix can affect shared behavior, provider fixtures, process lifecycle, or cross-platform paths.
6. Cancel obsolete builds after pushing a replacement commit.

## Verifying & troubleshooting

- Run a single provider in replay: `./scripts/test-integration.sh --run <path>` (no env var).
- Filter to one test: add `--grep "<test title fragment>"`.
- **On a hang / timeout, read the runtime log first.** For the **Copilot** provider, a failed test tails the most recent Copilot runtime (`@github/copilot` CLI) `process-*.log` into the test output (`[agent-host-e2e] # …` lines) — the SDK/CLI's own account of startup, auth, the model request, and the turn lifecycle. It runs at `--log trace`. A turn that never produced a model response, a panic, or an out-of-order/protocol error points at the SDK/CLI (re-record if a bump left the fixture stale; otherwise it's a real regression). Claude/Codex use their own runtimes and are not captured here. See the README's "A turn hangs or times out with no OS pattern".
- For any failure (`cache miss`, missing fixture, per-OS timeout, leaked PII, subagent staleness, accidental real-CAPI contact), go to the **Troubleshooting** section of the README — it maps each symptom to its cause and fix.
