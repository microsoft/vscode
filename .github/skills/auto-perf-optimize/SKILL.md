---
name: auto-perf-optimize
description: "Run agent-driven VS Code performance or memory investigations. Use when asked to launch Code OSS, automate a VS Code scenario, run the Chat memory smoke runner, capture renderer heap snapshots, take workflow screenshots, compare run summaries, or drive a repeatable scenario before heap-snapshot analysis."
---

# VS Code Performance Workflow

Drive a repeatable VS Code scenario, collect memory/performance artifacts, verify that the scenario actually happened, then hand the resulting heap snapshots to the generic heap-snapshot-analysis skill when object-level investigation is needed.

## When to Use

- User describes a VS Code workflow and asks whether it leaks or grows memory
- User asks the agent to launch VS Code, drive a scenario, and capture heap snapshots
- User asks to run the Chat memory smoke runner bundled with this skill
- User wants screenshots, `summary.json`, renderer heap samples, and targeted `.heapsnapshot` files for one scenario
- User wants a new automation runner for a non-Chat VS Code scenario

Do not use this skill when snapshots already exist and the user only wants heap object/retainer analysis. Use heap-snapshot-analysis directly.

## The Story

1. **Define the scenario.** Write down one warmup action, one repeatable iteration, and one quiescent point where it is fair to force GC and sample memory.
2. **Develop the automation.** Start with a tiny no-snapshot run. If it fails or the UI state is uncertain, keep the Code window open, connect agent-browser to the same CDP port, take workspace-local screenshots, inspect snapshots, and update the runner's selectors/waits.
3. **Run a fast smoke.** Disable heap snapshots first. Prove the scenario completes and the artifact summary says what you think it says.
4. **Capture targeted snapshots.** Snapshot a warmed-up baseline and a later iteration. Do not snapshot every sample unless necessary; snapshots are huge and slow.
5. **Verify the run.** Inspect `summary.json` and screenshots. Do not analyze a failed login, trust prompt, stuck progress row, or wrong UI state.
6. **Analyze snapshots.** Switch to heap-snapshot-analysis for compare scripts, object grouping, and retainer paths.
7. **Fix and verify.** After identifying leaks, make product-code fixes. Then rerun the same scenario with the same snapshot labels and compare like-for-like. Do not stop at analysis — the goal is to ship a fix, not just a report.
8. **Document.** Save a summary of findings, fixes, and before/after measurements to session memory so the work is preserved.

## Checked-in Runners

The `scripts/` folder contains stable, generic runners. Use them directly or as templates for scratchpad scripts:

- **[chat-memory-smoke.mts](./scripts/chat-memory-smoke.mts)** — Multi-turn chat smoke runner. Sends prompts, waits for responses, samples heap, takes optional snapshots. The most versatile runner.
- **[chat-session-switch-smoke.mts](./scripts/chat-session-switch-smoke.mts)** — Creates multiple chat sessions with different content types, then repeatedly switches between them via the sessions sidebar.
- **[userDataProfile.mts](./scripts/userDataProfile.mts)** — Utility for managing user-data profiles in smoke test runs.

### Chat Workflow: Chat Memory Smoke Runner

Use the bundled [Chat memory smoke runner](./scripts/chat-memory-smoke.mts) when the scenario is Chat-specific or can be expressed as repeated Chat prompts. It launches Code OSS, opens Chat, sends prompts, waits for responses, writes screenshots and `summary.json`, samples renderer heap, and can take selected heap snapshots.

Fast health check:

```bash
node .github/skills/auto-perf-optimize/scripts/chat-memory-smoke.mts --iterations 3 --no-heap-snapshots
```

Targeted post-warmup snapshots:

```bash
node .github/skills/auto-perf-optimize/scripts/chat-memory-smoke.mts --iterations 8 --heap-snapshot-label 03-iteration-01 --heap-snapshot-label 03-iteration-08
```

User-described Chat scenario:

```bash
node .github/skills/auto-perf-optimize/scripts/chat-memory-smoke.mts --iterations 8 --message 'For memory investigation iteration {iteration}, summarize the active workspace in one paragraph.' --heap-snapshot-label 03-iteration-01 --heap-snapshot-label 03-iteration-08
```

Important runner behavior:

- The default profile is persistent at `.build/auto-perf-optimize/user-data` so auth can be reused by all runners in this skill.
- Pass `--temporary-user-data` only if a clean profile is part of the scenario.
- Pass `--seed-user-data-dir <path>` to copy a logged-in profile into a fresh target profile before launch. The target profile may contain auth secrets; keep it inside ignored local `.build/...` folders and never attach it to issues or PRs.

**Safety: chat runs execute on the real machine.** The Code OSS instance launched by these runners is a full VS Code with Copilot auth on the user's actual computer — not a sandbox. Chat prompts you craft will be sent to a real LLM, and any tool calls the agent makes (terminal commands, file edits, etc.) will execute for real. Be responsible:

- **Use a throwaway workspace**, not the real repo. Pass `--workspace <scratch-folder>` pointing to a temporary or gitignored directory (e.g., the runner's scratchpad subfolder, or a folder under `.build/`). The default workspace in checked-in runners is the repo root for convenience, but scratchpad runners for Chat scenarios should always override it to avoid accidental file modifications in the source tree.
- Use **safe, read-only commands** for prompts that trigger terminal tools (e.g., `touch /tmp/foo`, `git log --oneline`, `ls`). Never instruct the agent to delete files, run destructive commands, or modify the user's workspace.
- If you need tool calls for testing, use harmless operations and clean up any temp files afterward.
- Don't be afraid to run terminal commands — just be thoughtful about what you ask.
- Pass `--keep-open` when the user needs to log in or watch the window, then close the window before the next automated run unless intentionally reusing it.
- Pass `--reuse` only when attaching to a Code window that was launched with `--enable-smoke-test-driver` and the chosen remote-debugging port.

## Profiles and Auth

Prefer the shared persistent performance profile for routine runs:

```bash
node .github/skills/auto-perf-optimize/scripts/chat-memory-smoke.mts --keep-open --iterations 1 --no-heap-snapshots
```

If Chat asks for auth, let the user sign in once, close the Code window, then rerun the fast smoke without `--keep-open`. The same profile is reused by the bundled Chat runner and by other runners that follow this skill's profile convention.

To bootstrap the shared performance profile from an older logged-in automation profile, copy it once into the default target:

```bash
node .github/skills/auto-perf-optimize/scripts/chat-memory-smoke.mts --seed-user-data-dir .build/chat-memory-smoke/user-data --keep-open --iterations 1 --no-heap-snapshots
```

To run a fresh disposable copy of a logged-in seed:

```bash
node .github/skills/auto-perf-optimize/scripts/chat-memory-smoke.mts --temporary-user-data --seed-user-data-dir .build/auto-perf-optimize/user-data --iterations 3 --no-heap-snapshots
```

Seed-copy rules:

- The seed Code window must be closed. Never copy a profile while a Code process is using it.
- The target user-data-dir must be absent or empty. If the script refuses to copy, pick a fresh `--user-data-dir`, use `--temporary-user-data`, or delete the local target deliberately.
- The copy skips root-level caches, logs, crash dumps, singleton lock/socket files, and session storage. It intentionally keeps user/global storage that may contain auth or extension state.
- Use explicit `--user-data-dir <fresh-path> --seed-user-data-dir <seed-path>` when you want to keep the copied profile after the run. User-provided `--user-data-dir` is never deleted by the runner.

## Develop and Watch a Runner

The first version of an automation runner is rarely correct. Treat the runner as a test you are developing: run a cheap scenario, observe the live workbench, adjust one selector or wait condition, and repeat. Do not collect heap snapshots until the runner is boringly reliable.

**New runners go in the [scratchpad](./scratchpad/) folder** (gitignored). Checked-in scripts in `scripts/` are stable, generic runners — don't modify them for a one-off investigation. Instead, copy patterns from them into a scratchpad script.

Organize scratchpad work into **dated subfolders** named `YYYY-MM-DD-short-description/` (e.g., `2026-04-09-chat-scroll-leak/`). Each subfolder should contain:

- The investigation scripts (`.mts`, `.mjs`, etc.)
- A **`findings.md`** file documenting the full investigation: all ideas considered, which ones led to changes and which were rejected (and why), before/after measurements, and a summary of the outcome. This lets the user review the agent's reasoning, decide which changes to keep, and follow up on deferred ideas.

**Start fresh.** Ignore any existing scratchpad subfolders from previous investigations. They belong to earlier sessions and their context, scripts, and findings are not relevant to your current task. Always create a new dated subfolder for your investigation.

**Import path depth:** Scripts in dated subfolders are 6 levels below the repo root (`.github/skills/auto-perf-optimize/scratchpad/YYYY-MM-DD-name/script.mts`), not 4 like the checked-in `scripts/*.mts` runners. Adjust relative imports accordingly — use 5 `..` segments to reach the repo root from a dated subfolder (e.g., `'../../../../../src/vs/base/common/stopwatch.ts'`), and `'../../scripts/userDataProfile.mts'` to reach sibling checked-in scripts.

Suggested watch loop for the bundled Chat runner:

```bash
node .github/skills/auto-perf-optimize/scripts/chat-memory-smoke.mts --keep-open --iterations 1 --no-heap-snapshots --port 9224 --output .build/chat-memory-smoke/watch-chat
```

While that Code window is open, inspect it with agent-browser from the repo root:

```bash
npx agent-browser connect 9224
npx agent-browser tab
npx agent-browser snapshot -i
npx agent-browser screenshot .build/chat-memory-smoke/watch-chat/agent-browser-observation.png
```

Agent-browser checkpoints:

- Run `tab` first. If the selected target is `about:blank` or a webview instead of the workbench, switch targets before trusting snapshots.
- Use `snapshot -i` to rediscover buttons, textboxes, list rows, webviews, and current accessible names. Prefer discovered state over stale selectors.
- Save screenshots inside the runner output folder or another workspace-local `.build/...` folder. Do not use `/tmp` for screenshots you expect the user to review.
- If the script is stuck, capture a screenshot and read the incremental `summary.json` before killing the window. The last submitted turn and last screenshot usually identify the missing wait condition.
- If auth is required, use `--keep-open`, let the user sign in once in the persistent default profile, close the window, then rerun the fast smoke.

When editing a scenario runner:

- Keep a stable output contract: `summary.json`, checkpoint screenshots, heap samples, optional `heap/*.heapsnapshot` files, and an `error` field on failure.
- Write summary/screenshot artifacts before long waits so failed runs are diagnosable.
- Wait for user-visible scenario completion, not arbitrary time. Prefer an observed response, progress disappearance, row-count change, editor content change, or command result.
- Validate with `--no-heap-snapshots` first. A broken runner plus a 2GB heap snapshot wastes time and hides the real failure.
- Close owned Code windows between runs unless the command intentionally uses `--keep-open` or `--reuse`.

## Verify Before Analyzing

Read the run's `summary.json` before opening heap snapshots. Check:

- `error` is absent
- `chatTurns` has the expected count
- each turn has a response-start reason and final response text, unless the run intentionally used `--skip-send`
- `analysis.postFirstTurnUsedBytes` and `analysis.postFirstTurnUsedBytesPerTurn` are present for multi-turn memory probes
- requested snapshot labels exist under `heap/`
- screenshots show the requested workflow and settled UI

Prefer a warmed-up baseline such as `03-iteration-01.heapsnapshot` over startup snapshots. Startup, Chat opening, login, extension activation, and first-use model loads are expected allocations.

## Compare a Chat Runner Result

After capture, use heap-snapshot-analysis. A minimal scratchpad comparison script looks like this:

```javascript
import path from 'node:path';
import { compareSnapshots, printComparison } from '../helpers/compareSnapshots.ts';

const runDir = process.env.RUN;
if (!runDir) {
	throw new Error('Set RUN to a chat-memory-smoke output directory');
}

const before = path.join(runDir, 'heap', '03-iteration-01.heapsnapshot');
const after = path.join(runDir, 'heap', '03-iteration-08.heapsnapshot');
printComparison(compareSnapshots(before, after));
```

Run it from the heap-snapshot-analysis skill folder:

```bash
cd .github/skills/heap-snapshot-analysis
RUN=../../../.build/chat-memory-smoke/<run-folder> node --max-old-space-size=16384 scratchpad/compare-chat-run.mjs
```

## Non-Chat VS Code Scenarios

When the user describes a non-Chat scenario, ask only for the missing essentials: what action starts the scenario, what counts as one repeatable iteration, what indicates the UI is settled, and whether the profile should be persistent or temporary.

**Write new scenario runners in the [scratchpad](./scratchpad/) folder.** This folder is gitignored — use it freely for one-off investigation scripts. If a runner proves generally useful, promote it to `scripts/` with documentation and validation.

Put each investigation in a **dated subfolder** (see "Develop and Watch a Runner" for the naming convention).

Example scratchpad workflow:

```bash
# Create a dated investigation folder
mkdir -p .github/skills/auto-perf-optimize/scratchpad/2026-04-09-editor-tab-leak

# Write a runner inside it
cat > .github/skills/auto-perf-optimize/scratchpad/2026-04-09-editor-tab-leak/scenario.mts << 'EOF'
// ... your scenario using patterns from the checked-in scripts
EOF

# Validate without snapshots first
node .github/skills/auto-perf-optimize/scratchpad/2026-04-09-editor-tab-leak/scenario.mts \
  --iterations 3 --no-heap-snapshots --skip-prelaunch \
  --user-data-dir .build/chat-memory-smoke/user-data

# Then capture targeted snapshots
node .github/skills/auto-perf-optimize/scratchpad/2026-04-09-editor-tab-leak/scenario.mts \
  --iterations 10 --heap-snapshot-label baseline --heap-snapshot-label final \
  --skip-prelaunch --user-data-dir .build/chat-memory-smoke/user-data

# Write findings.md when the investigation concludes
```

Reuse these patterns from the checked-in scripts ([chat-memory-smoke.mts](./scripts/chat-memory-smoke.mts), [chat-session-switch-smoke.mts](./scripts/chat-session-switch-smoke.mts)):

- launch `scripts/code.sh` or `scripts/code.bat`
- pass `--enable-smoke-test-driver`, `--disable-workspace-trust`, a known `--remote-debugging-port`, explicit `--user-data-dir`, explicit `--extensions-dir`, `--skip-welcome`, and `--skip-release-notes`
- use a **throwaway workspace** (`--workspace <scratch-folder>`) instead of the repo root to prevent Chat tool calls from modifying real source files
- connect Playwright with `chromium.connectOverCDP`
- wait for `globalThis.driver?.whenWorkbenchRestored?.()`
- enable CDP `Performance` and `HeapProfiler`
- collect garbage before memory samples
- write screenshots at important checkpoints
- write a machine-readable `summary.json` incrementally, especially before long waits
- support `--no-heap-snapshots` and targeted snapshot labels so validation stays fast
- make cleanup explicit: close the CDP browser, terminate owned Code processes, and preserve user-provided profiles

Keep scenario-specific UI selectors and wait logic in the scenario runner. Avoid making the Chat runner a generic abstraction unless multiple proven scenarios share the exact same lifecycle.

## Handoff to Heap Snapshot Analysis

Use heap-snapshot-analysis when you need to:

- compare two `.heapsnapshot` files by constructor/object group
- find direct retainers or paths to GC roots
- inspect why a particular class, model, widget, editor input, or DOM tree survived
- write investigation-specific scratchpad analysis against parsed snapshots

The output of this workflow is evidence: run summaries, screenshots, heap samples, targeted snapshots, comparison output, and retainer paths. Use that evidence to form a concrete leak hypothesis, then fix the product code and verify the fix with another run.

## Root-Cause, Don't Treat Symptoms

A surface-level observation ("this Map is growing") is not a diagnosis. Before writing a fix, understand **why** the code is structured the way it is:

1. **Use `git blame` and `git log`** on the leaking code. Read the commit message, the PR description, and any linked issues. A guard like `if (this._isDisposed) return` may exist because removing it once caused crashes — understand the original intent before changing it.
2. **Trace the full lifecycle**, not just the leak site. If `disposeContext()` is silently dropped, ask: why is the parent disposed before the child? Is the disposal order wrong, or is the guard wrong? The answer determines whether you fix the guard, fix the disposal order, or add a different cleanup path.
3. **Distinguish caches from leaks.** A Map that grows but has a trim/eviction mechanism (like `UriIdentityService._canonicalUris` with its 2^16 limit) is a cache, not a leak. Don't "fix" caches unless they lack any eviction policy.
4. **Look for the design-level problem.** If transient objects register in a global singleton and the singleton never unregisters them, the fix isn't just adding a `delete` call — ask whether the registration should happen at all for transient objects, or whether an intermediate scoped registry should exist.
5. **Check for prior art.** Search the codebase for similar patterns that handle the same lifecycle correctly. If a sibling pool/service already disposes in-use items on clear, follow that pattern. If nothing else does, understand why before introducing a new contract.

The goal is to fix the **cause**, not paper over the **effect**. A fix that adds cleanup code without understanding why cleanup was missing will often introduce new bugs or re-break a previous fix.

## Fix, Don't Just Report

The goal of this workflow is to **ship fixes**, not produce reports. After identifying leaks:

1. **Make product-code changes** that address the root cause. Common patterns:
   - Pools that `clear()` idle items but leave `_inUse` orphaned — also dispose `_inUse` on clear
   - Global service maps (`ContextKeyService._contexts`, `HoverService._managedHovers`, `UriIdentityService._canonicalUris`) that grow because transient objects register but never unregister
   - Disposable chains where `_register(service.createScoped(...))` is correct but the parent `dispose()` is never called
   - Observable subscriptions (`autorunIterableDelta` `lastValues`) that retain stale model references

2. **Verify the fix** by rerunning the same scenario with the same snapshot labels. Compare the `postFirst*UsedBytes` trend and the snapshot diff. A successful fix should show flat or decreasing memory in the iteration phase.

3. **Run all tests.** Before finishing, run all unit tests and integration tests for any files you changed. Unit tests in this repo are expected to be stable — any unit test failure is very likely caused by your changes and must be fixed. Integration tests are slightly more prone to flakiness, but failures should still be investigated.

4. **Document results** in the scratchpad `findings.md` and session memory before declaring done: what leaked, what was fixed, before/after measurements.

Do not stop at analysis. If you have evidence of a leak, attempt a fix. If the fix is unclear or risky, explain why and propose alternatives.
