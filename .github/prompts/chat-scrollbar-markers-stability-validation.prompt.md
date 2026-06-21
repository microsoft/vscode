# Prompt: Expansive Stability & Performance Validation for Chat (with Scrollbar Markers)

## Context

You are working in the `microsoft/vscode` repository on the worktree branch `agents/chat-scrollbar-markers-impl`. This branch adds a **chat scrollbar prompt marker** feature (colored markers on the chat transcript overview ruler for prompts, ask-question responses, file-change responses, compaction, and errors) plus supporting base-layer additions (`getOverviewRulerLayoutInfo`, `getElementTop`, `getElementHeight` on list/tree widgets) and a `ChatScrollbarPromptMarkerController` that owns DOM, event listeners, and per-render marker maps.

A prior effort hardened the unit tests. A prior validation pass confirmed no perf regression and no additional memory leak (the pre-existing leak is identical between branch and baseline). The `appendDebugLog` hardcoded-path issue has been fixed (removed from source). **Your job is to re-validate after the fix** — confirm the application remains stable and has matching performance characteristics across the full chat lifecycle — startup, rendering new multi-step chats, re-rendering existing chats, scrolling, clicking markers, closing chats, and idle wait periods — and to surface any memory leaks or regressions, comparing this branch against `main`.

This is an **autonomous AI-agent task**: you will leverage the repository's existing perf/leak harnesses, launch Code OSS from sources, drive the workbench via Playwright, capture heap snapshots and run summaries, and save all artifacts for archival.

## Hard guardrail

- **Do not modify any source file.** This is a validation/measurement task only. If you discover a bug, file it in the report — do not fix it.
- **Do not modify any test file or shared test infrastructure.** You may create throwaway scripts under `/tmp/chat-validation-<timestamp>/` for scenario driving or snapshot comparison, but do not commit them to the repo.
- All measurement artifacts (heap snapshots, CPU profiles, screenshots, run-summary JSON, the final report) must be saved under `/tmp/chat-validation-<timestamp>/artifacts/` and referenced from the report.
- If a scenario cannot be automated without modifying repo files, document the blocker in the report rather than working around it by editing tracked files.

## Known harness issues (read before starting — these will save you hours)

The first validation pass discovered several harness issues that **must be worked around**. Read this section before running any harness command.

### Issue 1: IPC socket path too long on macOS

macOS's default `TMPDIR` (`/var/folders/<long-hash>/T/`, ~45 chars) combined with the harness's `run-<runId>/` user data dir naming exceeds the 103-char Unix socket path limit. This causes `Error: listen EINVAL: invalid argument ... 1.12-main.sock` and VS Code exits with code 1.

**Workaround:** Set `TMPDIR=/tmp/vs/` before running any harness command:
```bash
export TMPDIR=/tmp/vs/
```
This is **required for all harness runs**, not just `--baseline-build` runs.

### Issue 2: `stdio: ['ignore', 'ignore', 'ignore']` crashes VS Code

`launchVSCode()` in `utils.js` uses `stdio: opts.verbose ? 'inherit' : ['ignore', 'ignore', 'ignore']`. Without `--verbose`, the child process crashes on startup (exit code 1, no error message).

**Workaround:** Always pass `--verbose` to `perf:chat` and `perf:chat-leak`. This produces very large log files (redirect to a file with `tee`), but is required for the harness to work.

### Issue 3: `--heap-snapshots` causes `RangeError: Invalid string length`

`HeapProfiler.takeHeapSnapshot` via CDP returns the snapshot as a single string. Dev build heap snapshots exceed V8's max string length (512MB on 64-bit). Playwright's CDP session tries to serialize the string → `RangeError: Invalid string length`.

**No workaround exists.** Do NOT use `--heap-snapshots` with `perf:chat` or `perf:chat-leak` on dev builds. The heap snapshot analysis (§5) must use runtime DOM counts and `Runtime.getHeapUsage` instead of full heap snapshots. See §5 for the revised methodology.

### Issue 4: `--baseline-build` with local dev paths fails

The native two-build comparison mode (`--build X --baseline-build Y`) fails for local dev paths due to Issue 1 (IPC socket path) and Issue 3 (heap snapshot in the comparison path).

**Workaround:** Run each build separately with `--no-baseline` and compare results manually. This produces equivalent data — the harness runs the same scenarios with the same metrics, just without the automatic statistical comparison. You can compute Welch's t-test manually using the `welchTTest()` function from `utils.js` or compare medians directly.

### Issue 5: Baseline worktree needs extension compilation

`npm run transpile-client` only compiles `src/`, NOT `extensions/`. The Copilot extension must be compiled separately, or the harness fails with "VS Code exited before CDP connected" because the built-in copilot extension's `dist/extension.js` is missing.

**Workaround:** After `npm run transpile-client`, also run:
```bash
npm run compile-copilot      # compiles extensions/copilot/dist/extension.js
npm run gulp compile-extensions  # compiles other built-in extensions
```

### Issue 6: Node version mismatch

The repo requires Node 24.15.0 (per `.nvmrc`). The system default may be different (e.g., Node 26). The `build/npm/preinstall.ts` script checks and rejects wrong Node versions during `npm install`.

**Workaround:** Always run `nvm use 24.15.0` before any harness commands. If using a non-interactive shell, source nvm first:
```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 24.15.0
```

## Existing tooling to use (read these before starting)

The repository already provides mature, purpose-built tooling. **Maximize reuse of these tools rather than reinventing them.**

### Primary harnesses (`scripts/chat-simulation/`)

1. **`npm run perf:chat`** (`scripts/chat-simulation/test-chat-perf-regression.js`) — Full Playwright-Electron perf harness that launches VS Code with a mock LLM server, sends chat messages across 16 built-in scenarios, and measures timing/rendering metrics via CDP. Supports **native two-build comparison** via `--build <path> --baseline-build <path>` (⚠️ broken for local dev paths — see Known Issues §4), statistical analysis (Welch's t-test, median, outlier removal), per-metric thresholds, `--ci` mode (writes `ci-summary.md`), `--heap-snapshots` flag (⚠️ broken on dev builds — see Known Issues §3), and `--setting`/`--test-setting`/`--baseline-setting` for A/B feature toggling. Config in `scripts/chat-simulation/config.jsonc`. **Always pass `--verbose`** (see Known Issues §2).

2. **`npm run perf:chat-leak`** (`scripts/chat-simulation/test-chat-mem-leaks.js`) — Dedicated memory leak checker. Uses a **state-based approach**: open fresh chat → measure (forced double-GC + `Runtime.getHeapUsage` + DOM node count) → cycle through all 16 scenarios → open new chat → measure again → delta = leaked memory. Runs multiple iterations. Configurable threshold (`--threshold <MB>`, default 10 MB from config). **Always pass `--verbose`** (see Known Issues §2).

3. **`scripts/chat-simulation/common/`** — Shared infrastructure:
   - `utils.js` — `launchVSCode()`, `waitForCDP()`, `findWorkbenchPage()`, `buildEnv()` (sets `IS_SCENARIO_AUTOMATION=1`, `VSCODE_COPILOT_CHAT_TOKEN`), `writeSettings()` (points copilot at mock server), `preseedStorage()`, `robustStats()`, `welchTTest()`, `linearRegressionSlope()`. Note: the `measure()` pattern (double GC + settle delays) is defined locally in `test-chat-mem-leaks.js`, not exported from `utils.js`.
   - `perf-scenarios.js` — 16 scenarios across 3 groups: **Content** (`text-only`, `large-codeblock`, `many-small-chunks`, `mixed-content`, `many-codeblocks`, `long-prose`, `rich-markdown`, `giant-codeblock`, `rapid-stream`, `file-links`), **Tool-call** (`tool-read-file`, `tool-edit-file`, `tool-terminal`), **Multi-turn** (`thinking-response`, `multi-turn-user`, `long-conversation`).
   - `mock-llm-server.ts` — Full mock CAPI server with `ScenarioBuilder` API (`stream()`, `emit()`, `wait()`, `burst()`) and `registerScenario()` for custom scenarios.

### Agent-driven runners (`.github/skills/auto-perf-optimize/scripts/`)

4. **`chat-memory-smoke.mts`** — Multi-turn chat smoke runner: launches Code OSS, opens chat, sends prompts, waits for responses, writes screenshots + `summary.json`, samples renderer heap, takes optional labeled `.heapsnapshot` files. Supports `--iterations`, `--message`, `--heap-snapshot-label`, `--no-heap-snapshots`, `--workspace`, `--temporary-user-data`.

5. **`chat-session-switch-smoke.mts`** — Creates multiple chat sessions with different content types, then repeatedly switches between them via the sessions sidebar. Samples heap and takes targeted snapshots.

### Analysis helpers (`.github/skills/heap-snapshot-analysis/helpers/`)

6. **`compareSnapshots.ts`** — `compareSnapshots(beforePath, afterPath)` → returns `topBySize`, `topByCount`, `newObjectGroups`, `summary`. Groups by `type::name` constructor. **Designed for before/after within the same process** — node IDs are process-local, so do NOT use for cross-build comparison.
7. **`findRetainers.ts`** — `findRetainerPaths(graph, targetName)`, `findDirectRetainers(graph, nodeIndex)`, `findNodesByName(graph, name)`. Use to trace why `ChatScrollbarPromptMarkerController` instances survive GC.
8. **`parseSnapshot.ts`** — `parseSnapshot(path)`, `buildGraph(data)`. Buffer-based loading for >500 MB snapshots.
9. **`streamSnapshot.mjs`** — Streaming primitives for snapshots >2 GiB (`findArrayStart`, `findTokenOffsets`, `parseMeta`, `streamNumberTuples`).

### Other skills

10. **`launch`** skill (`.agents/skills/launch/SKILL.md`) — Launches Code OSS with isolated throwaway profile and unique debug ports. Use for manual scenario driving (scroll, click, reload). **Do NOT use for `perf:chat` benchmarks** — the harness has its own launch lifecycle with mock server/auth setup.
11. **`code-oss-logs`** skill — Log directory layout and filtering.
12. **`cpu-profile-analysis`** skill — For `.cpuprofile` call-tree analysis (not frame-rate measurement).

## Methodology

### Execution order summary

The sections below must be executed in this order. Each section lists its prerequisites explicitly; do not skip ahead. **Estimated total time: 3–5 hours** (mostly waiting for harness runs).

1. **§0 (Pre-flight)** — ~15 min. Builds both worktrees, creates artifacts directory, sets up environment. No dependencies.
2. **§1 (perf:chat)** — ~30 min per build, ~60 min total. Depends on §0. Runs `perf:chat --no-baseline --runs 3 --verbose` separately for each build (NOT `--baseline-build` — see Known Issues §4). Produces `results.json` per build. Does NOT use `--heap-snapshots` (broken — see Known Issues §3).
3. **§2 (perf:chat-leak)** — ~30 min per build, ~60 min total. Depends on §0. Independent of §1. Runs `perf:chat-leak --iterations 3 --verbose --build <path>` separately for each build. Produces leak reports to stdout and `.chat-simulation-data/chat-simulation-leak-results.json`.
4. **§3 (session-switch-smoke)** — ~15 min. Depends on §0 (branch build). Launches its own instance; does not need the mock server. Produces `summary.json` in `artifacts/session-switch/`. Does NOT use `--heap-snapshot-label` (broken — see Known Issues §3).
5. **§4 (custom scenarios)** — ~30–60 min. Depends on §0 (branch build). Requires mock LLM server started before scenarios C, D, E, I, J, K. Produces screenshots and DOM marker counts in `artifacts/custom-scenarios/`.
6. **§5 (runtime marker analysis)** — ~15 min. Depends on §1, §2, §3, and §4. Uses runtime DOM counts and `Runtime.getHeapUsage` data (NOT heap snapshots — see Known Issues §3). Analyzes marker controller lifecycle from the data already collected.
7. **§6 (open/close cycle)** — ~30 min. Depends on §0 (branch build). Launches its own fresh instance with mock server. Produces per-iteration heap samples.
8. **Deliverables** — ~15 min. Compile `report.md` from all artifacts produced by §1–§6.
9. **Cleanup** — ~2 min. Remove the `/tmp/vscode-main-baseline` worktree and throwaway scripts.

### 0. Pre-flight

1. **Set up Node version:** Run `nvm use 24.15.0` (or the version in `.nvmrc`). The repo's `preinstall.ts` will reject other versions. If using a non-interactive shell:
   ```bash
   export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 24.15.0
   ```
2. **Set up short TMPDIR:** Run `export TMPDIR=/tmp/vs/` and `mkdir -p /tmp/vs`. This is required for all harness runs (see Known Issues §1). Without it, the harness will fail with `EINVAL` socket errors.
3. Confirm the branch build is up to date: check the `VS Code - Build` watch task output, or run `npm run typecheck-client`. Do not proceed if there are compilation errors.
4. Confirm the branch's compiled Electron app exists at `.build/electron/Code - OSS.app/Contents/MacOS/Code - OSS`. If it does not, run `npm run electron` (downloads Electron) and ensure the watch task has produced the compiled output. This path is referenced by §1, §2, §4, §5, and §6 — it must exist before any of them run.
5. Create the artifacts directory: `/tmp/chat-validation-<timestamp>/artifacts/`.
6. Record the git SHA of this branch and of `main` for reproducibility (`artifacts/git-sha.txt`).
7. **Build `main` in a separate worktree** (only to get a compiled executable — do NOT manually launch or drive it):
   ```bash
   git worktree add /tmp/vscode-main-baseline main
   cd /tmp/vscode-main-baseline && npm install && npm run electron && npm run transpile-client
   ```
   **⚠️ Critical:** `transpile-client` only compiles `src/`, NOT `extensions/`. You must also compile the Copilot extension and other built-in extensions (see Known Issues §5):
   ```bash
   cd /tmp/vscode-main-baseline && npm run compile-copilot && npm run gulp compile-extensions
   ```
   Verify `extensions/copilot/dist/extension.js` exists before proceeding. Without it, the harness will fail with "VS Code exited before CDP connected".
   This produces the baseline executable at `/tmp/vscode-main-baseline/.build/electron/Code - OSS.app/Contents/MacOS/Code - OSS`, which is referenced by §1 and §2. Verify this path exists before proceeding. **Remember to remove this worktree after validation is complete** — see the Cleanup section.
8. Both builds must be in the same build mode (both dev). Dev-build memory numbers are not representative of production — note this in the report.

### 1. Perf regression comparison (branch vs main) — separate `perf:chat` runs

**⚠️ Do NOT use `--baseline-build`** — it fails for local dev paths (see Known Issues §4). Instead, run each build separately with `--no-baseline` and compare results manually.

**⚠️ Do NOT use `--heap-snapshots`** — it causes `RangeError: Invalid string length` on dev builds (see Known Issues §3).

**⚠️ Always pass `--verbose`** — without it, VS Code crashes on startup (see Known Issues §2).

**⚠️ Ensure `TMPDIR=/tmp/vs/` is set** — without it, the harness fails with socket path errors (see Known Issues §1).

Run the branch build first:
```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 24.15.0
export TMPDIR=/tmp/vs/
ARTDIR=/tmp/chat-validation-<timestamp>/artifacts
BRANCH_BIN=".build/electron/Code - OSS.app/Contents/MacOS/Code - OSS"

npm run perf:chat -- --build "$BRANCH_BIN" --no-baseline --runs 3 --verbose --force --no-cache \
  2>&1 | tee "$ARTDIR/perf-chat-branch-run.log"
```

Then copy the results JSON:
```bash
# The harness prints the runDir path on startup — find the latest results.json
cp .chat-simulation-data/<timestamp>/results.json "$ARTDIR/perf-chat-branch-results.json"
```

Then run the baseline build:
```bash
BASELINE_BIN="/tmp/vscode-main-baseline/.build/electron/Code - OSS.app/Contents/MacOS/Code - OSS"

npm run perf:chat -- --build "$BASELINE_BIN" --no-baseline --runs 3 --verbose --force --no-cache \
  2>&1 | tee "$ARTDIR/perf-chat-baseline-run.log"
cp .chat-simulation-data/<timestamp>/results.json "$ARTDIR/perf-chat-baseline-results.json"
```

**Output locations:** The harness writes all output under `.chat-simulation-data/` (relative to the repo root). The `results.json` file contains per-scenario median, p95, and cv for all metrics. The verbose log contains per-run details including `[trace]` lines with timing and memory data.

After both runs complete, compare the two `results.json` files manually. Focus on:
- **Timing metrics** (`timeToFirstToken`, `timeToComplete`, `timeToRenderComplete`) — compare medians, noting cv (coefficient of variation). Dev builds typically have cv 20-70%, so differences <20% are noise.
- **Rendering metrics** (`longTaskCount`, `longAnimationFrameCount`, `layoutDurationMs`, `forcedReflows`) — these should be nearly identical between builds if the scrollbar marker feature has no rendering overhead.
- **Memory metrics** (`heapDelta`, `heapDeltaPostGC`) — compare medians, noting high cv.

**Thresholds:** Use the existing `config.jsonc` thresholds (20% global, `100ms` absolute for `timeToFirstToken`). A metric is flagged as a regression **only when it both exceeds the threshold AND is statistically significant** (p < 0.05). Do not invent a new 10% threshold — it is below dev-build noise floor (cv ≈ 20%). With only 3 runs, statistical significance is hard to achieve — focus on whether the branch is consistently slower/faster across scenarios, not on individual scenario deltas.

**What this covers:** Scenarios B (multi-step chat with tool calls, file edits, thinking blocks) and partially D (long conversations) from the original plan are fully covered by the 16 built-in scenarios (`tool-read-file`, `tool-edit-file`, `tool-terminal`, `multi-turn-user`, `long-conversation`).

**Independence note:** `perf:chat` and `perf:chat-leak` (§2) each launch their own VS Code instance and mock LLM server internally. They do not share state or artifacts and can be run in any order. No port coordination is needed — the harnesses pick ephemeral ports. **However, do not run two harness instances simultaneously** — they will compete for CPU and skew each other's timing measurements.

### 2. Memory leak check — use `perf:chat-leak` natively

**⚠️ Always pass `--verbose`** (see Known Issues §2). **⚠️ Ensure `TMPDIR=/tmp/vs/` is set** (see Known Issues §1). **⚠️ Ensure `nvm use 24.15.0`** (see Known Issues §6).

Run the dedicated leak checker against each build separately. Use 3 iterations (5 is overkill for re-validation — the first pass showed identical results with 3):

```bash
# Branch:
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 24.15.0
export TMPDIR=/tmp/vs/
ARTDIR=/tmp/chat-validation-<timestamp>/artifacts
BRANCH_BIN=".build/electron/Code - OSS.app/Contents/MacOS/Code - OSS"

npm run perf:chat-leak -- --iterations 3 --verbose --build "$BRANCH_BIN" \
  2>&1 | tee "$ARTDIR/branch-leak-report.txt"
cp .chat-simulation-data/chat-simulation-leak-results.json "$ARTDIR/branch-leak-results.json"

# Clean up orphaned processes between runs:
pkill -f 'Code - OSS' 2>/dev/null; pkill -f 'mock-llm-server' 2>/dev/null; sleep 2

# Main (note: this overwrites the JSON — copy before running main):
BASELINE_BIN="/tmp/vscode-main-baseline/.build/electron/Code - OSS.app/Contents/MacOS/Code - OSS"

npm run perf:chat-leak -- --iterations 3 --verbose --build "$BASELINE_BIN" \
  2>&1 | tee "$ARTDIR/main-leak-report.txt"
cp .chat-simulation-data/chat-simulation-leak-results.json "$ARTDIR/main-leak-results.json"
```

This uses the **state-based approach**: open fresh chat → force GC (double-call with 500ms + 300ms settle delays) → measure heap + DOM nodes → cycle through all 16 scenarios → open new chat → measure again → delta = leaked memory. Runs 3 iterations to distinguish consistent leaks from one-time caching.

**Output locations:** The leak checker prints its full results table to **stdout** (captured via `tee`) and also writes structured output to `.chat-simulation-data/chat-simulation-leak-results.json`.

**Comparison methodology:** Compare the two JSON files. The key metrics are:
- **Total residual heap growth** (MB) — should be nearly identical between builds if no new leak
- **Total residual DOM growth** (nodes) — should be identical if marker DOM elements are properly disposed
- **Per-iteration residual** — iteration 1 has a large one-time caching cost (~21MB); iterations 2-3 show the steady-state leak rate (~7MB). Both should be identical between builds.

**What this covers:** Scenarios F (close/open chat), G (idle memory growth), and H (repeated open/close accumulation) from the original plan. The leak checker calls `openNewChat()` between iterations and cycles through all scenario types.

### 3. Session switch leak check — use `chat-session-switch-smoke.mts`

This script launches its own Code OSS instance via `scripts/code.sh` (it does **not** accept a `--build` flag — it always launches from the current worktree's compiled sources). It does **not** require the mock LLM server — it creates sessions with pre-seeded content, not live chat responses. Ensure the `VS Code - Build` watch task is running or has produced compiled output before launching.

**⚠️ Do NOT use `--heap-snapshot-label`** — heap snapshot capture is broken on dev builds (see Known Issues §3). Use `--no-heap-snapshots` to skip snapshot capture and rely on `summary.json` for heap samples.

```bash
node .github/skills/auto-perf-optimize/scripts/chat-session-switch-smoke.mts \
  --switch-iterations 10 \
  --no-heap-snapshots \
  --output /tmp/chat-validation-<timestamp>/artifacts/session-switch
```

This creates multiple chat sessions with different content types and repeatedly switches between them — exercising per-session marker controller creation/disposal. Save `summary.json` to `artifacts/session-switch/`. The `summary.json` contains per-iteration heap samples that are used in §5 (runtime marker analysis).

### 4. Custom scenarios (true gaps — no existing tool covers these)

These are the scenarios that the existing harnesses do **not** cover. Implement each as a scratchpad script under `/tmp/chat-validation-<timestamp>/` that reuses the `launch` skill + `@playwright/cli` patterns from `auto-perf-optimize`. **Critical:** the launched instance must have the mock LLM server configured — set `IS_SCENARIO_AUTOMATION=1`, `VSCODE_COPILOT_CHAT_TOKEN`, and write settings pointing to the mock server. The `--disable-extension=vscode.vscode-api-tests` flag is auto-added by `buildArgs()` in `utils.js` for dev builds; if using the `launch` skill instead of `buildArgs()`, add it manually. Note: `chat-memory-smoke.mts` handles Code OSS launch and auth pre-seeding but does **not** start the mock LLM server or write mock server settings — you must start the mock server separately and write the matching settings before launching (see §6's note on `chat-memory-smoke.mts` limitations).

**Mock LLM server setup (required before Scenarios C, D, E, I, J, K):** Scenarios that send chat messages and expect responses (C, D, E, I, J, K) require a running mock LLM server. Start the mock server standalone:
```bash
node scripts/chat-simulation/common/mock-llm-server.ts <port>
```
This loads the 16 built-in scenarios from `perf-scenarios.js` automatically. The server prints its URL and registered scenario IDs on startup. The mock server port must match the `github.copilot.advanced.debug.overrideCapiUrl` setting written to the launched instance's user data (use `writeSettings()` from `scripts/chat-simulation/common/utils.js`, or write the settings JSON manually). Scenarios A and L do not require the mock server (A tests empty chat; L observes file I/O during D).

**Scenario selection:** The mock server matches scenarios by looking for a `[scenario:<id>]` tag in the user's message content. To trigger a specific scenario, send a chat message containing `[scenario:<id>]` (e.g., `[scenario:long-conversation]`).

**Scenario I (error response) — known limitation:** The mock LLM server does **not** have a built-in error scenario, and the `registerScenario()` / `ScenarioBuilder` API only supports content chunks and multi-turn sequences — it cannot produce HTTP errors or `errorDetails` on the response. The `errorDetails` field that triggers the Error marker is set by the Copilot extension when the API returns an error or the stream fails. To produce an error marker **without modifying repo files**, use one of these approaches:
1. **Kill the mock server mid-stream** — start a prompt, then stop the mock server so the response stream aborts. The extension should set `errorDetails` on the partial response.
2. **Point the settings to a dead port** — configure `github.copilot.advanced.debug.overrideCapiUrl` to a port with nothing listening, send a prompt, and wait for the connection error.
3. If neither approach produces an `errorDetails` marker, **skip Scenario I and document the blocker** in the report. Do not modify the mock server source.

**Scenario J (compaction marker) — known limitation:** The compaction marker is triggered when `request.slashCommand?.name === 'compact'`. The `/compact` slash command is handled by the Copilot extension, not the mock LLM server. To trigger it:
1. Type `/compact` in the chat input and submit. The extension processes the slash command locally.
2. If the extension requires a live model connection to perform compaction, ensure the mock server is running and responding.
3. If `/compact` does not produce a compaction marker (e.g., the extension version doesn't support it, or it requires a minimum conversation length), **skip Scenario J and document the blocker**. Do not modify any source or extension files.

**Failure handling for all custom scenarios:** If a scenario cannot be automated (e.g., the mock server can't produce the needed response, a selector doesn't match, or a timeout occurs), do **not** retry indefinitely. Attempt the scenario up to 2 times. If it still fails, mark it as **BLOCKED** in the report with the failure reason, capture a screenshot of the current state, and move on to the next scenario. A blocked scenario is not a test failure — it is a tooling limitation.

**Runtime marker data for §5:** For scenarios that exercise marker creation/disposal (C, D, E, I, J, K), capture runtime DOM marker counts before and after the scenario using `page.evaluate(() => document.querySelectorAll('.chat-scrollbar-prompt-marker').length)`. Also capture `Runtime.getHeapUsage` via CDP before and after (following the double-GC pattern from §5). Save these to `artifacts/custom-scenarios/<scenario>-markers.json`. These are consumed by §5 (runtime marker analysis).

For each scenario, capture:
- Screenshots at start and end (`artifacts/<scenario>-start.png`, `artifacts/<scenario>-end.png`).
- Renderer log (via `code-oss-logs` skill) — flag any errors/warnings.
- Runtime DOM marker count via `page.evaluate(() => document.querySelectorAll('.chat-scrollbar-prompt-marker').length)` — this is cheaper and more accurate than heap snapshot parsing for DOM elements.
- Runtime heap usage via CDP `Runtime.getHeapUsage` (before and after, with double-GC).

#### Scenario A — Cold startup with chat view visible

1. Launch Code OSS with the chat view open (pre-seeded profile or open via command palette immediately after launch).
2. Measure time from process launch to chat input being focusable.
3. Screenshot the empty chat state.
4. Verify `document.querySelectorAll('.chat-scrollbar-prompt-marker').length === 0` (no markers on empty chat — exercises the `scrollHeight <= 0` edge case).
5. **Pass criteria**: no errors in renderer log; chat input focusable; zero markers on empty chat.

#### Scenario C — Re-render existing chat after window reload

1. After running a multi-step chat (use `chat-memory-smoke.mts` to seed content), capture the marker count: `document.querySelectorAll('.chat-scrollbar-prompt-marker').length`.
2. Execute `Developer: Reload Window` via command palette.
3. Wait for chat transcript to re-render.
4. Verify markers re-appear: `document.querySelectorAll('.chat-scrollbar-prompt-marker').length` should match the pre-reload count.
5. Screenshot after reload.
6. **Pass criteria**: markers present after reload; same marker count as before reload; no errors.

#### Scenario D — Scroll a long chat (with trace events, not CPU profiles)

1. Load or create a chat with 50+ turns (use `long-conversation` scenario via `chat-memory-smoke.mts --message`).
2. **Use trace events for frame-rate analysis**, not CPU profiles. Launch with `--enable-tracing=devtools.timeline` and parse the trace for frame timings. CPU profiles (`.cpuprofile`) are sampling call stacks — they do not measure per-frame timing.
3. Scroll continuously from top to bottom and back, including fast fling scrolls. Specifically scroll to the **virtualization boundary** where most rows are off-screen — this exercises `host.getElementTop()` / `host.getElementHeight()` for virtualized rows.
4. Capture the trace file (`artifacts/scroll-trace.json`).
5. Screenshot mid-scroll.
6. **Pass criteria**: `longAnimationFrameCount` (frames > 50ms) is low; markers reposition correctly during scroll; no markers clustered at top/bottom (which would indicate virtualization height estimation bugs). Use the existing 50ms threshold, not 16ms — dev builds are not optimized for 60fps.

#### Scenario E — Click scrollbar markers (both click behaviors)

1. In the 50+ turn chat, click 10 different markers at various vertical positions (top, middle, bottom, overlapping markers).
2. For each click, verify the chat scrolls to and focuses the correct turn.
3. **Test both `Reveal` and `RevealAndFocus` config modes** — the `--test-setting` flag is only available on `perf:chat`, not on `chat-memory-smoke.mts` or the `launch` skill. For custom scenario driving, write the setting `chat.scrollbarPromptMarkers.clickBehavior` to the launched instance's `settings.json` manually (`"reveal"` for the first run, `"revealAndFocus"` for the second). Alternatively, use `perf:chat --test-setting chat.scrollbarPromptMarkers.clickBehavior=reveal --scenario long-conversation` to test via the built-in harness.
4. For `RevealAndFocus`, verify focus lands on the target row (not the scrollbar) after the animation-frame retry loop completes — especially for virtualized rows where `hasElement` returns false initially.
5. Test **full-width hit-testing**: click the opposite lane from a marker (e.g., click the left side when a right-lane prompt marker is at that Y position) — it should still activate the marker.
6. Test **overlapping markers at the same Y**: verify right-lane (prompt) wins over left-lane wins over full-lane.
7. Screenshot after a click that targets a marker in a virtualized (off-screen) region.
8. **Pass criteria**: every click reveals the correct turn; focus lands correctly for `RevealAndFocus`; opposite-lane clicks work; lane priority is correct; no focus traps; no errors.

#### Scenario I — Error marker (new — no existing scenario produces this)

1. Configure the mock LLM server to return an error response (HTTP 500 or a response with `errorDetails`).
2. Send a prompt and wait for the error response.
3. Verify a red Error marker appears: `document.querySelectorAll('.chat-scrollbar-prompt-marker-type-error').length >= 1`.
4. Verify it is full-lane and has the highest z-index (priority 100).
5. Screenshot.
6. **Pass criteria**: Error marker present; full-lane; correct color.

#### Scenario J — Compaction marker (new — no existing scenario produces this)

1. Send a `/compact` slash command as the user message.
2. Wait for the compaction response.
3. Verify a Compaction marker appears: `document.querySelectorAll('.chat-scrollbar-prompt-marker-type-compaction').length >= 1`.
4. Verify it is full-lane and has priority 90.
5. Screenshot.
6. **Pass criteria**: Compaction marker present; full-lane; correct color.

#### Scenario K — Dense overlap (new — exercises the two-pass overlap algorithm)

1. Create a chat with 30+ very short turns (one sentence each) in a small viewport (e.g., 300px render height).
2. Screenshot the scrollbar.
3. Verify markers don't overlap visually and none exceed the ruler bounds.
4. **Pass criteria**: no marker extends beyond `rulerHeight`; no two markers occupy the same Y range; the two-pass push-down/clamp algorithm produces a valid layout.

### 5. Runtime marker analysis (using DOM counts and heap usage, NOT heap snapshots)

**Prerequisites:** This section consumes runtime data produced by earlier sections. Before starting, verify the following data sources exist:
- **From §1 (`perf:chat`):** `results.json` per build with per-scenario `heapDelta` and `heapDeltaPostGC` metrics.
- **From §2 (`perf:chat-leak`):** leak results JSON per build with per-iteration residual heap and DOM node growth.
- **From §3 (`chat-session-switch-smoke.mts`):** `summary.json` with per-iteration heap samples across 10 switch iterations.
- **From §4 (custom scenarios):** `<scenario>-markers.json` files with before/after DOM marker counts and heap usage for scenarios C, D, E, I, J, K.

If any source is missing, note it in the report and proceed with available data.

**Why not heap snapshots?** The `--heap-snapshots` flag is broken on dev builds (see Known Issues §3) — `HeapProfiler.takeHeapSnapshot` via CDP returns a string that exceeds V8's max string length, causing `RangeError: Invalid string length`. Instead, use runtime DOM counts and `Runtime.getHeapUsage` which are cheaper, more reliable, and sufficient for leak detection.

#### Analysis methodology

1. **DOM marker count comparison:** Compare `.chat-scrollbar-prompt-marker` DOM element counts before and after each custom scenario (from §4 `<scenario>-markers.json` files). If markers persist after chat disposal/reload, that indicates a DOM leak.

2. **Heap usage comparison:** Compare `Runtime.getHeapUsage` before and after each custom scenario (with double-GC). If the branch shows significantly more residual heap than baseline for the same scenario, that indicates a memory leak.

3. **Leak check comparison (from §2):** Compare the total residual heap growth and DOM node growth between branch and baseline. The first pass showed 34.76MB (branch) vs 34.79MB (baseline) — a 0.03MB difference, confirming no additional leak. The re-validation should show similar parity.

4. **Session switch comparison (from §3):** Check `summary.json` for heap growth across 10 switch iterations. If heap grows linearly with switch count, that indicates per-session controller leak.

5. **Perf memory metrics (from §1):** Compare `heapDelta` and `heapDeltaPostGC` medians per scenario between branch and baseline. Large deltas (>20%) in memory metrics could indicate marker-related memory overhead.

**Double-GC pattern for runtime measurements:** When capturing `Runtime.getHeapUsage` via CDP, always force GC first:
```
await cdp.send('Runtime.evaluate', { expression: 'gc()', awaitPromise: false, includeCommandLineAPI: true });
await new Promise(r => setTimeout(r, 500));
await cdp.send('Runtime.evaluate', { expression: 'gc()', awaitPromise: false, includeCommandLineAPI: true });
await new Promise(r => setTimeout(r, 300));
const heap = await cdp.send('Runtime.getHeapUsage');
```
A single GC call may not finalize V8's concurrent marking.

### 6. Open/close cycle accumulation (per-iteration sampling, not end-only snapshot)

**Prerequisites:** This section requires a running Code OSS instance with CDP access. Do **not** rely on §4's instance — §4 scenarios may have torn down their instance. Launch a fresh instance using `chat-memory-smoke.mts` (which handles Code OSS launch and auth pre-seeding) or the `launch` skill with `IS_SCENARIO_AUTOMATION=1` and `VSCODE_COPILOT_CHAT_TOKEN` set. The instance must have the mock LLM server running so that chat open/close cycles produce real responses (exercising marker controller creation/disposal). Verify CDP connectivity before starting the measurement loop.

**Note on `chat-memory-smoke.mts`:** This script launches via `scripts/code.sh` (no `--build` flag) and does **not** start the mock LLM server itself — it only handles the Code OSS launch and auth pre-seeding. You must start the mock LLM server separately (see §4's mock server setup instructions) and write the matching settings before launching. Alternatively, use the `launch` skill with `IS_SCENARIO_AUTOMATION=1`, `VSCODE_COPILOT_CHAT_TOKEN`, and settings pointing to the mock server. **Pass `--no-heap-snapshots`** to avoid the broken heap snapshot capture (see Known Issues §3).

For the open/close accumulation check (original Scenario H):

1. Capture a `measure()` sample (forced double-GC + `Runtime.getHeapUsage` + `document.querySelectorAll('.chat-scrollbar-prompt-marker').length`) **after each of 20 open/close cycles**, not just at the end.
2. Compute `linearRegressionSlope()` (available in `scripts/chat-simulation/common/utils.js`) on the 20 heap samples.
3. A positive slope with low variance is the leak signal.
4. Do NOT take 20 full heap snapshots — use the lightweight `measure()` approach per iteration. Reserve full snapshots for baseline and final states only.

## Deliverables

Save everything under `/tmp/chat-validation-<timestamp>/`:

1. **`artifacts/`** — all heap snapshots (`.heapsnapshot`), trace files (`trace.json`), screenshots (`.png`), run-summary JSON, `ci-summary.md` from `perf:chat --ci`, and leak reports from `perf:chat-leak`.
2. **`report.md`** — a markdown report with:
   - **Summary table**: one row per scenario (A, C, D, E, I, J, K) with pass/fail/blocked status and key metric.
   - **Perf comparison table (from §1)**: `perf:chat` metrics for `main` vs branch with % delta, threshold, and statistical significance (p-value). Incorporate the `ci-summary.md` output.
   - **Leak comparison table (from §2)**: per-build residual heap growth (MB) and DOM node growth from `perf:chat-leak`, with pass/fail against the 10 MB threshold.
   - **Session switch findings (from §3)**: heap delta and DOM marker count across 10 switch iterations, from `chat-session-switch-smoke.mts` `summary.json`.
   - **Open/close cycle findings (from §6)**: per-iteration heap slope (MB/iteration) from `linearRegressionSlope()` over 20 samples, with leak determination.
   - **Marker-specific findings (from §5)**: `.chat-scrollbar-prompt-marker` DOM count delta per scenario, `Runtime.getHeapUsage` delta per scenario, comparison of leak residuals between branch and baseline.
   - **Log findings**: any errors or warnings from renderer/extension-host/agent-host logs during scenarios.
   - **Blocked scenarios**: list any scenarios that could not be completed (with reason), so reviewers know what was not covered.
   - **Recommendation**: overall pass/fail and whether the branch is safe to merge from a stability/performance standpoint.
3. **`artifacts/git-sha.txt`** — the git SHA of this branch and `main` used for the comparison.

## Cleanup

After the report is finalized and all artifacts are saved:
1. Remove the baseline worktree to free disk space: `git worktree remove /tmp/vscode-main-baseline --force`
2. Remove any throwaway scripts created under `/tmp/chat-validation-<timestamp>/` (artifacts should already be saved; the scripts themselves do not need archival).
3. Do **not** remove `.chat-simulation-data/` from the main worktree — it contains cached baselines that speed up future runs.

## Launch failure handling

If `perf:chat` or `perf:chat-leak` fails to launch, check these in order:

1. **Missing Electron download** — if the error mentions the executable not found at `.build/electron/...`, run `npm run electron` in the relevant worktree and retry.
2. **Missing Copilot extension** — if the error is "VS Code exited before CDP connected (code=1)" and the baseline worktree was just created, you forgot to compile extensions. Run `npm run compile-copilot && npm run gulp compile-extensions` in the baseline worktree (see Known Issues §5).
3. **IPC socket path too long** — if the error mentions `EINVAL` or `invalid argument ... .sock`, you forgot to set `TMPDIR`. Run `export TMPDIR=/tmp/vs/` and retry (see Known Issues §1).
4. **VS Code crashes without error** — if the harness reports "VS Code exited before CDP connected (code=1)" with no other error, you forgot `--verbose`. Add `--verbose` to the command (see Known Issues §2).
5. **`RangeError: Invalid string length`** — you used `--heap-snapshots`. Remove it — heap snapshots are broken on dev builds (see Known Issues §3).
6. **Node version mismatch** — if `npm install` fails with a preinstall error, you're using the wrong Node version. Run `nvm use 24.15.0` (see Known Issues §6).
7. **Port conflicts** — both harnesses pick ephemeral ports for the mock server and VS Code instance, so port conflicts are unlikely. If one occurs (error message mentioning `EADDRINUSE`), kill any orphaned Code OSS or mock server processes (`pkill -f 'Code - OSS'` or `pkill -f 'mock-llm-server'`) and retry.
8. **CDP connection timeout** — if the harness reports a timeout waiting for the CDP endpoint, the VS Code instance may have crashed on startup. Check `.chat-simulation-data/<timestamp>/` for any crash logs. Retry once; if it fails again, document the blocker and skip the affected section.
9. **Missing `sqlite3`** — `preseedStorage()` requires the `sqlite3` CLI on PATH. On macOS it ships with the OS; on Linux install it via `apt install sqlite3`. If absent, the harness will error on startup.
10. **Orphaned processes from previous run** — always run `pkill -f 'Code - OSS' 2>/dev/null; pkill -f 'mock-llm-server' 2>/dev/null; sleep 2` between harness runs to clean up orphaned processes.

## Constraints recap

- **No source or test file modifications.** Measurement only.
- All artifacts go to `/tmp/chat-validation-<timestamp>/`; do not commit them.
- **Maximize reuse of existing tooling:** use `perf:chat --no-baseline --verbose` for perf comparison (run separately per build), `perf:chat-leak --verbose` for leak checking, `chat-session-switch-smoke.mts --no-heap-snapshots` for session switching, `chat-memory-smoke.mts` for smoke runs. Only write custom scripts for the true gaps (scenarios A, C, D, E, I, J, K).
- **Compare per-build deltas**, not absolute cross-build heap snapshots. Node IDs are process-local.
- **Use the double-GC pattern** (500ms + 300ms settle delays) before any memory measurement.
- **Use trace events for frame-rate analysis**, not CPU profiles. Use 50ms threshold, not 16ms.
- **Use existing thresholds** (20% global, `100ms` absolute for `timeToFirstToken`) with Welch's t-test significance (p < 0.05).
- **Use `perf:chat --no-baseline --verbose` for benchmarks** — do not use `--baseline-build` (broken for local dev paths) or `--heap-snapshots` (broken on dev builds). Do not use the `launch` skill for benchmarks, which bypasses mock server and auth setup. For manual scenarios, augment the `launch` skill with `IS_SCENARIO_AUTOMATION=1`, `VSCODE_COPILOT_CHAT_TOKEN`, mock server settings.
- **Mandate a warmup step** (open chat, send one message, open new chat) before taking any baseline measurement.
- **Both builds must be in the same build mode** (both dev). Dev-build memory numbers are not representative of production.
- **Do NOT use `--heap-snapshots`** — it is broken on dev builds (see Known Issues §3). Use runtime DOM counts and `Runtime.getHeapUsage` instead.
- The final report must be self-contained: a reviewer reading `report.md` should be able to understand pass/fail without opening the artifacts.
- **Clean up the baseline worktree** (`git worktree remove /tmp/vscode-main-baseline --force`) after validation is complete.
