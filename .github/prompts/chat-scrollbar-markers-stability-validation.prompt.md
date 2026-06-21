# Prompt: Expansive Stability & Performance Validation for Chat (with Scrollbar Markers)

## Context

You are working in the `microsoft/vscode` repository on the worktree branch `agents/chat-scrollbar-markers-impl`. This branch adds a **chat scrollbar prompt marker** feature (colored markers on the chat transcript overview ruler for prompts, ask-question responses, file-change responses, compaction, and errors) plus supporting base-layer additions (`getOverviewRulerLayoutInfo`, `getElementTop`, `getElementHeight` on list/tree widgets) and a `ChatScrollbarPromptMarkerController` that owns DOM, event listeners, and per-render marker maps.

A prior effort hardened the unit tests. A follow-up effort will refactor the internal implementation for performance and memory safety. **Your job is to validate that the application remains stable and has matching performance characteristics** across the full chat lifecycle — startup, rendering new multi-step chats, re-rendering existing chats, scrolling, clicking markers, closing chats, and idle wait periods — and to surface any memory leaks or regressions, comparing this branch against `main`.

This is an **autonomous AI-agent task**: you will leverage the repository's existing perf/leak harnesses, launch Code OSS from sources, drive the workbench via Playwright, capture heap snapshots and run summaries, and save all artifacts for archival.

## Hard guardrail

- **Do not modify any source file.** This is a validation/measurement task only. If you discover a bug, file it in the report — do not fix it.
- **Do not modify any test file or shared test infrastructure.** You may create throwaway scripts under `/tmp/chat-validation-<timestamp>/` for scenario driving or snapshot comparison, but do not commit them to the repo.
- All measurement artifacts (heap snapshots, CPU profiles, screenshots, run-summary JSON, the final report) must be saved under `/tmp/chat-validation-<timestamp>/artifacts/` and referenced from the report.
- If a scenario cannot be automated without modifying repo files, document the blocker in the report rather than working around it by editing tracked files.

## Existing tooling to use (read these before starting)

The repository already provides mature, purpose-built tooling. **Maximize reuse of these tools rather than reinventing them.**

### Primary harnesses (`scripts/chat-simulation/`)

1. **`npm run perf:chat`** (`scripts/chat-simulation/test-chat-perf-regression.js`) — Full Playwright-Electron perf harness that launches VS Code with a mock LLM server, sends chat messages across 16 built-in scenarios, and measures timing/rendering metrics via CDP. Supports **native two-build comparison** via `--build <path> --baseline-build <path>`, statistical analysis (Welch's t-test, median, outlier removal), per-metric thresholds, `--ci` mode (writes `ci-summary.md`), `--heap-snapshots` flag, and `--setting`/`--test-setting`/`--baseline-setting` for A/B feature toggling. Config in `scripts/chat-simulation/config.jsonc`.

2. **`npm run perf:chat-leak`** (`scripts/chat-simulation/test-chat-mem-leaks.js`) — Dedicated memory leak checker. Uses a **state-based approach**: open fresh chat → measure (forced double-GC + `Runtime.getHeapUsage` + DOM node count) → cycle through all 16 scenarios → open new chat → measure again → delta = leaked memory. Runs multiple iterations. Configurable threshold (`--threshold <MB>`, default 10 MB from config).

3. **`scripts/chat-simulation/common/`** — Shared infrastructure:
   - `utils.js` — `launchVSCode()`, `waitForCDP()`, `findWorkbenchPage()`, `buildEnv()` (sets `IS_SCENARIO_AUTOMATION=1`, `VSCODE_COPILOT_CHAT_TOKEN`), `writeSettings()` (points copilot at mock server), `preseedStorage()`, `robustStats()`, `welchTTest()`, `linearRegressionSlope()`, `measure()` pattern (double GC + settle delays).
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

The sections below must be executed in this order. Each section lists its prerequisites explicitly; do not skip ahead.

1. **§0 (Pre-flight)** — builds both worktrees, creates artifacts directory. No dependencies.
2. **§1 (perf:chat)** — depends on §0 (both builds must exist). Produces `ci-summary.md`, run-summary JSON, and optional heap snapshots in `artifacts/perf-chat-heap-snapshots/`. Note: `--ci` mode deletes non-regressed snapshots, so a second pass without `--ci` is needed if §5 requires perf:chat snapshots.
3. **§2 (perf:chat-leak)** — depends on §0 (both builds must exist). Independent of §1 (each harness launches its own instance + mock server). Produces leak reports to stdout and `.chat-simulation-data/chat-simulation-leak-results.json`.
4. **§3 (session-switch-smoke)** — depends on §0 (branch build must exist). Launches its own instance; does not need the mock server. Produces snapshots in `artifacts/session-switch/`.
5. **§4 (custom scenarios)** — depends on §0 (branch build). Requires mock LLM server started before scenarios C, D, E, I, J, K. Scenario L runs concurrently with D (same instance). Produces snapshots in `artifacts/custom-scenarios/`.
6. **§5 (heap snapshot analysis)** — depends on §1, §3, and §4 having produced snapshots. Analyzes them offline (no running instance needed).
7. **§6 (open/close cycle)** — depends on §0 (branch build). Launches its own fresh instance with mock server; does not depend on §4's instance. Produces per-iteration heap samples.
8. **Deliverables** — compile `report.md` from all artifacts produced by §1–§6.
9. **Cleanup** — remove the `/tmp/vscode-main-baseline` worktree and throwaway scripts.

### 0. Pre-flight

1. Confirm the branch build is up to date: check the `VS Code - Build` watch task output, or run `npm run typecheck-client`. Do not proceed if there are compilation errors.
2. Confirm the branch's compiled Electron app exists at `.build/electron/Code - OSS.app/Contents/MacOS/Code - OSS`. If it does not, run `npm run electron` (downloads Electron) and ensure the watch task has produced the compiled output. This path is referenced by §1, §2, §4, §5, and §6 — it must exist before any of them run.
3. Create the artifacts directory: `/tmp/chat-validation-<timestamp>/artifacts/`.
4. Record the git SHA of this branch and of `main` for reproducibility (`artifacts/git-sha.txt`).
5. **Build `main` in a separate worktree** (only to get a compiled executable — do NOT manually launch or drive it):
   ```bash
   git worktree add /tmp/vscode-main-baseline main
   cd /tmp/vscode-main-baseline && npm install && npm run electron && npm run transpile-client
   ```
   This produces the baseline executable at `/tmp/vscode-main-baseline/.build/electron/Code - OSS.app/Contents/MacOS/Code - OSS`, which is referenced by §1 (`--baseline-build`) and §2 (`--build` for the main run). Verify this path exists before proceeding to §1. **Remember to remove this worktree after validation is complete** — see the Cleanup section.
6. Both builds must be in the same build mode (both dev). Dev-build memory numbers are not representative of production — note this in the report.

### 1. Perf regression comparison (branch vs main) — use `perf:chat` natively

Run the existing harness with native two-build comparison. This replaces manual launch + Playwright + JSON diffing:

```bash
npm run perf:chat -- \
  --build .build/electron/Code\ -\ OSS.app/Contents/MacOS/Code\ -\ OSS \
  --baseline-build /tmp/vscode-main-baseline/.build/electron/Code\ -\ OSS.app/Contents/MacOS/Code\ -\ OSS \
  --runs 5 --ci --heap-snapshots
```

This runs all 16 scenarios against both builds, does statistical comparison (Welch's t-test, p < 0.05), and writes `ci-summary.md`.

**Output locations:** The harness writes all output under `.chat-simulation-data/` (relative to the repo root). Specifically:
- `ci-summary.md` → `.chat-simulation-data/ci-summary.md`
- Run-summary JSON → `.chat-simulation-data/<timestamp>/` (the harness prints the exact `runDir` path on startup)
- Heap snapshots → `.chat-simulation-data/<timestamp>/<role>-<build>/<scenario>-<i>/heap.heapsnapshot` (renderer) and `exthost-heap.heapsnapshot` (extension host)

After the run completes, copy `ci-summary.md` and the run-summary JSON to `artifacts/`.

**⚠️ `--ci` enables `--cleanup-diagnostics`:** In CI mode, the harness deletes heap snapshots, CPU profiles, and traces for all scenarios that did **not** regress (only regressed-scenario snapshots are retained for investigation). This means `--ci --heap-snapshots` will likely produce **zero or very few** surviving snapshots. To get heap snapshots for §5 analysis, run a **second pass without `--ci`**:
```bash
npm run perf:chat -- \
  --build .build/electron/Code\ -\ OSS.app/Contents/MacOS/Code\ -\ OSS \
  --baseline-build /tmp/vscode-main-baseline/.build/electron/Code\ -\ OSS.app/Contents/MacOS/Code\ -\ OSS \
  --runs 3 --heap-snapshots
```
Then locate `.heapsnapshot` files under `.chat-simulation-data/<timestamp>/` and copy them to `artifacts/perf-chat-heap-snapshots/`. These snapshots are consumed by §5 (heap snapshot analysis). If no snapshots are produced (e.g., the harness failed before reaching the snapshot step), note this in the report — §5 will rely on §3 and §4 snapshots instead.

**Thresholds:** Use the existing `config.jsonc` thresholds (20% global, `100ms` absolute for `timeToFirstToken`). A metric is flagged as a regression **only when it both exceeds the threshold AND is statistically significant** (p < 0.05). Do not invent a new 10% threshold — it is below dev-build noise floor (cv ≈ 20%).

**What this covers:** Scenarios B (multi-step chat with tool calls, file edits, thinking blocks) and partially D (long conversations) from the original plan are fully covered by the 16 built-in scenarios (`tool-read-file`, `tool-edit-file`, `tool-terminal`, `multi-turn-user`, `long-conversation`).

**Independence note:** `perf:chat` and `perf:chat-leak` (§2) each launch their own VS Code instance and mock LLM server internally. They do not share state or artifacts and can be run in any order. No port coordination is needed — the harnesses pick ephemeral ports.

### 2. Memory leak check — use `perf:chat-leak` natively

Run the dedicated leak checker against each build separately:

```bash
# Branch:
npm run perf:chat-leak -- --iterations 5 --verbose \
  --build .build/electron/Code\ -\ OSS.app/Contents/MacOS/Code\ -\ OSS

# Main:
npm run perf:chat-leak -- --iterations 5 --verbose \
  --build /tmp/vscode-main-baseline/.build/electron/Code\ -\ OSS.app/Contents/MacOS/Code\ -\ OSS
```

This uses the **state-based approach**: open fresh chat → force GC (double-call with 500ms + 300ms settle delays) → measure heap + DOM nodes → cycle through all 16 scenarios → open new chat → measure again → delta = leaked memory. Runs 5 iterations to distinguish consistent leaks from one-time caching.

**Output locations:** The leak checker prints its full results table to **stdout** (capture it via shell redirection) and also writes structured output to disk:
- JSON results → `.chat-simulation-data/chat-simulation-leak-results.json`
- CI summary (only with `--ci` flag) → `.chat-simulation-data/ci-summary-leak.md`

Redirect stdout to capture the human-readable report, then copy both the stdout capture and the JSON file to `artifacts/`:
```bash
# Branch:
npm run perf:chat-leak -- --iterations 5 --verbose \
  --build .build/electron/Code\ -\ OSS.app/Contents/MacOS/Code\ -\ OSS \
  2>&1 | tee artifacts/branch-leak-report.txt
cp .chat-simulation-data/chat-simulation-leak-results.json artifacts/branch-leak-results.json

# Main (note: this overwrites the JSON — rename or copy before running main):
npm run perf:chat-leak -- --iterations 5 --verbose \
  --build /tmp/vscode-main-baseline/.build/electron/Code\ -\ OSS.app/Contents/MacOS/Code\ -\ OSS \
  2>&1 | tee artifacts/main-leak-report.txt
cp .chat-simulation-data/chat-simulation-leak-results.json artifacts/main-leak-results.json
```

**What this covers:** Scenarios F (close/open chat), G (idle memory growth), and H (repeated open/close accumulation) from the original plan. The leak checker calls `openNewChat()` between iterations and cycles through all scenario types.

### 3. Session switch leak check — use `chat-session-switch-smoke.mts`

This script launches its own Code OSS instance via `scripts/code.sh` (it does **not** accept a `--build` flag — it always launches from the current worktree's compiled sources). It does **not** require the mock LLM server — it creates sessions with pre-seeded content, not live chat responses. Ensure the `VS Code - Build` watch task is running or has produced compiled output before launching.

```bash
node .github/skills/auto-perf-optimize/scripts/chat-session-switch-smoke.mts \
  --switch-iterations 10 \
  --heap-snapshot-label 04-switch-01 \
  --heap-snapshot-label 04-switch-10 \
  --output /tmp/chat-validation-<timestamp>/artifacts/session-switch
```

This creates multiple chat sessions with different content types and repeatedly switches between them — exercising per-session marker controller creation/disposal. Save `summary.json` and snapshots to `artifacts/session-switch/`. The `.heapsnapshot` files produced here are consumed by §5 (heap snapshot analysis).

### 4. Custom scenarios (true gaps — no existing tool covers these)

These are the scenarios that the existing harnesses do **not** cover. Implement each as a scratchpad script under `/tmp/chat-validation-<timestamp>/` that reuses the `launch` skill + `@playwright/cli` patterns from `auto-perf-optimize`. **Critical:** the launched instance must have the mock LLM server configured — set `IS_SCENARIO_AUTOMATION=1`, `VSCODE_COPILOT_CHAT_TOKEN`, write settings pointing to the mock server, and `--disable-extension=vscode.vscode-api-tests`. Alternatively, use `chat-memory-smoke.mts` as the launch vehicle (it handles this setup).

**Mock LLM server setup (required before Scenarios C, D, E, I, J, K):** Scenarios that send chat messages and expect responses (C, D, E, I, J, K) require a running mock LLM server. Start the mock server standalone:
```bash
node scripts/chat-simulation/common/mock-llm-server.ts <port>
```
This loads the 16 built-in scenarios from `perf-scenarios.js` automatically. The server prints its URL and registered scenario IDs on startup. The mock server port must match the `github.copilot.advanced.debug.overrideCAPIUrl` setting written to the launched instance's user data (use `writeSettings()` from `scripts/chat-simulation/common/utils.js`, or write the settings JSON manually). Scenarios A and L do not require the mock server (A tests empty chat; L observes file I/O during D).

**Scenario selection:** The mock server matches scenarios by looking for a `[scenario:<id>]` tag in the user's message content. To trigger a specific scenario, send a chat message containing `[scenario:<id>]` (e.g., `[scenario:long-conversation]`).

**Scenario I (error response) — known limitation:** The mock LLM server does **not** have a built-in error scenario, and the `registerScenario()` / `ScenarioBuilder` API only supports content chunks and multi-turn sequences — it cannot produce HTTP errors or `errorDetails` on the response. The `errorDetails` field that triggers the Error marker is set by the Copilot extension when the API returns an error or the stream fails. To produce an error marker **without modifying repo files**, use one of these approaches:
1. **Kill the mock server mid-stream** — start a prompt, then stop the mock server so the response stream aborts. The extension should set `errorDetails` on the partial response.
2. **Point the settings to a dead port** — configure `overrideCAPIUrl` to a port with nothing listening, send a prompt, and wait for the connection error.
3. If neither approach produces an `errorDetails` marker, **skip Scenario I and document the blocker** in the report. Do not modify the mock server source.

**Scenario J (compaction marker) — known limitation:** The compaction marker is triggered when `request.slashCommand?.name === 'compact'`. The `/compact` slash command is handled by the Copilot extension, not the mock LLM server. To trigger it:
1. Type `/compact` in the chat input and submit. The extension processes the slash command locally.
2. If the extension requires a live model connection to perform compaction, ensure the mock server is running and responding.
3. If `/compact` does not produce a compaction marker (e.g., the extension version doesn't support it, or it requires a minimum conversation length), **skip Scenario J and document the blocker**. Do not modify any source or extension files.

**Failure handling for all custom scenarios:** If a scenario cannot be automated (e.g., the mock server can't produce the needed response, a selector doesn't match, or a timeout occurs), do **not** retry indefinitely. Attempt the scenario up to 2 times. If it still fails, mark it as **BLOCKED** in the report with the failure reason, capture a screenshot of the current state, and move on to the next scenario. A blocked scenario is not a test failure — it is a tooling limitation.

**Heap snapshot capture for §5:** For scenarios that exercise marker creation/disposal (C, D, E, I, J, K), capture a baseline `.heapsnapshot` before the scenario and an after `.heapsnapshot` after the scenario (following the double-GC pattern from §5). Save these to `artifacts/custom-scenarios/<scenario>-baseline.heapsnapshot` and `artifacts/custom-scenarios/<scenario>-after.heapsnapshot`. These are consumed by §5 alongside snapshots from §1 and §3.

For each scenario, capture:
- Screenshots at start and end (`artifacts/<scenario>-start.png`, `artifacts/<scenario>-end.png`).
- Renderer log (via `code-oss-logs` skill) — flag any errors/warnings.
- Runtime DOM marker count via `page.evaluate(() => document.querySelectorAll('.chat-scrollbar-prompt-marker').length)` — this is cheaper and more accurate than heap snapshot parsing for DOM elements.

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
3. **Test both `Reveal` and `RevealAndFocus` config modes** — run the scenario twice with `--test-setting chat.scrollbarPromptMarkers.clickBehavior=reveal` and `--test-setting chat.scrollbarPromptMarkers.clickBehavior=revealAndFocus`.
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

#### Scenario L — Debug log file I/O measurement (new — flag potential bug)

**Dependency:** This scenario runs concurrently with Scenario D (scrolling). It does not launch its own instance — it observes the same Code OSS instance and renderer log produced by Scenario D. Run L's measurement steps during or immediately after D, before the instance from D is torn down.

1. The controller calls `appendDebugLog()` on **every `renderMarkers` call**, writing a JSONL line to a hardcoded path via `fileService.writeFile()`. **Verify the exact path** by reading the source: `grep -n 'CHAT_SCROLLBAR_MARKER_DEBUG_LOG' src/vs/workbench/contrib/chat/browser/widget/chatScrollbarPromptMarkerController.ts`. At time of writing, the path is `URI.file('/Users/core/out.txt')` (line 57), but confirm this before relying on it. This is:
   - A **hardcoded absolute path** that will fail on any machine that isn't the developer's.
   - A **performance concern** — during scrolling, `renderMarkers` may be called dozens of times per second.
2. During Scenario D (scrolling), measure the file I/O overhead by checking the renderer log for `[ChatScrollbarPromptMarkerDebug] Failed to append debug log` warnings (the error is silently caught via `.catch()` on the write promise).
3. Check if the debug log file exists at the path found in step 1 and note its size after the scenario.
4. **Flag this as a finding in the report** — the hardcoded path and per-render write are a performance and stability risk.

### 5. Heap snapshot analysis (per-build deltas, not cross-build absolute comparison)

**Prerequisites:** This section consumes heap snapshots produced by earlier sections. Before starting, verify the following snapshot sources exist:
- **From §1 (`perf:chat --heap-snapshots`):** snapshots in `artifacts/perf-chat-heap-snapshots/` (if the harness produced them — see §1's note).
- **From §3 (`chat-session-switch-smoke.mts`):** snapshots in `artifacts/session-switch/` (labeled `04-switch-01`, `04-switch-10`).
- **From §4 (custom scenarios):** baseline/after snapshot pairs in `artifacts/custom-scenarios/` for scenarios C, D, E, I, J, K.

If any source is missing, note it in the report and proceed with available snapshots. If all sources are missing, this section cannot be completed — flag as a blocker.

**Critical methodology note:** Node IDs are process-local. `compareSnapshots()` groups by constructor name (stable across builds) but its `newObjectGroups` feature (IDs present in "after" but not "before") is **meaningless across different process instances** — every object in the branch snapshot will appear "new" relative to main. **Compare per-build deltas, not absolute cross-build snapshots.**

For each build (branch and main):
1. Capture a **baseline** snapshot (fresh chat, warmed up after one message — mandate a warmup step to amortize JIT compilation and module loading).
2. Run the scenario (e.g., `chat-memory-smoke.mts --iterations 8`).
3. Return to baseline state (open new empty chat).
4. Force GC using the **double-GC pattern** from `measure()`: `HeapProfiler.collectGarbage` → wait 500ms → `HeapProfiler.collectGarbage` → wait 300ms. A single GC call may not finalize V8's concurrent marking.
5. Capture an **after** snapshot.
6. Run `compareSnapshots(baseline, after)` **within that build**.

Then compare the **two delta reports** (main's delta vs branch's delta). If branch's delta shows `ChatScrollbarPromptMarkerController` instances or `.chat-scrollbar-prompt-marker` DOM nodes surviving GC while main's delta does not, **that** is a leak signal.

**Reserve full heap snapshots for baseline and final states only.** Taking snapshots allocates memory and perturbs the heap. For per-iteration measurements, use the lightweight `measure()` pattern (`Runtime.getHeapUsage` + DOM count) — not full snapshots.

#### Marker-specific leak analysis

Write a scratchpad script in `.github/skills/heap-snapshot-analysis/scratchpad/<date>-scrollbar-markers/`:

```typescript
import { compareSnapshots } from '../helpers/compareSnapshots.ts';
import { parseSnapshot, buildGraph } from '../helpers/parseSnapshot.ts';
import { findRetainerPaths, findNodesByName } from '../helpers/findRetainers.ts';

// Within a single build's before/after snapshots:
const result = compareSnapshots(beforePath, afterPath);
// Filter result.topByCount for 'object::ChatScrollbarPromptMarkerController'

const graph = buildGraph(parseSnapshot(afterPath));
const controllerNodes = findNodesByName(graph, 'ChatScrollbarPromptMarkerController');
// If controllerNodes.length > 0 after disposal, trace retainers:
findRetainerPaths(graph, 'ChatScrollbarPromptMarkerController', { maxPaths: 5 });
```

**Use dev builds only** for heap snapshot analysis — production/bundled builds may mangle class names via esbuild minification.

**For DOM marker count:** use `page.evaluate(() => document.querySelectorAll('.chat-scrollbar-prompt-marker').length)` at runtime — this is cheaper, more accurate, and matches the unit test approach. Do not parse heap snapshots for DOM elements.

**For `markerById`/`targetById` map entries:** these are private `Map` fields on the controller. `compareSnapshots()` groups by constructor name only, not by field name. Write a custom scratchpad script that finds controller instances via `findNodesByName()`, then traverses their outgoing edges to count `Map` entries.

**For large snapshots (>2 GiB):** use `streamSnapshot.mjs` streaming primitives instead of `parseSnapshot.ts` (which uses `readFileSync` and will fail with `ERR_FS_FILE_TOO_LARGE`).

### 6. Open/close cycle accumulation (per-iteration sampling, not end-only snapshot)

**Prerequisites:** This section requires a running Code OSS instance with CDP access. Do **not** rely on §4's instance — §4 scenarios may have torn down their instance. Launch a fresh instance using `chat-memory-smoke.mts` (which handles mock server setup) or the `launch` skill with `IS_SCENARIO_AUTOMATION=1` and `VSCODE_COPILOT_CHAT_TOKEN` set. The instance must have the mock LLM server running so that chat open/close cycles produce real responses (exercising marker controller creation/disposal). Verify CDP connectivity before starting the measurement loop.

**Note on `chat-memory-smoke.mts`:** This script launches via `scripts/code.sh` (no `--build` flag) and does **not** start the mock LLM server itself — despite the plan referencing it as handling mock server setup, it only handles the Code OSS launch and auth pre-seeding. You must start the mock LLM server separately (see §4's mock server setup instructions) and write the matching settings before launching. Alternatively, use the `launch` skill with `IS_SCENARIO_AUTOMATION=1`, `VSCODE_COPILOT_CHAT_TOKEN`, and settings pointing to the mock server.

For the open/close accumulation check (original Scenario H):

1. Capture a `measure()` sample (forced double-GC + `Runtime.getHeapUsage` + `document.querySelectorAll('.chat-scrollbar-prompt-marker').length`) **after each of 20 open/close cycles**, not just at the end.
2. Compute `linearRegressionSlope()` (available in `scripts/chat-simulation/common/utils.js`) on the 20 heap samples.
3. A positive slope with low variance is the leak signal.
4. Do NOT take 20 full heap snapshots — use the lightweight `measure()` approach per iteration. Reserve full snapshots for baseline and final states only.

## Deliverables

Save everything under `/tmp/chat-validation-<timestamp>/`:

1. **`artifacts/`** — all heap snapshots (`.heapsnapshot`), trace files (`trace.json`), screenshots (`.png`), run-summary JSON, `ci-summary.md` from `perf:chat --ci`, and leak reports from `perf:chat-leak`.
2. **`report.md`** — a markdown report with:
   - **Summary table**: one row per scenario (A, C, D, E, I, J, K, L) with pass/fail/blocked status and key metric.
   - **Perf comparison table (from §1)**: `perf:chat` metrics for `main` vs branch with % delta, threshold, and statistical significance (p-value). Incorporate the `ci-summary.md` output.
   - **Leak comparison table (from §2)**: per-build residual heap growth (MB) and DOM node growth from `perf:chat-leak`, with pass/fail against the 10 MB threshold.
   - **Session switch findings (from §3)**: heap delta and DOM marker count across 10 switch iterations, from `chat-session-switch-smoke.mts` `summary.json`.
   - **Open/close cycle findings (from §6)**: per-iteration heap slope (MB/iteration) from `linearRegressionSlope()` over 20 samples, with leak determination.
   - **Marker-specific findings (from §5)**: `ChatScrollbarPromptMarkerController` instance count delta (per-build), `.chat-scrollbar-prompt-marker` DOM count delta, retainer paths for any leaked instances.
   - **Debug log I/O finding (from Scenario L)**: flag the hardcoded debug log path (verified from source) and per-render write as a risk. Include the file size if it was created.
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

If `perf:chat` or `perf:chat-leak` fails to launch:
1. **Missing Electron download** — if the error mentions the executable not found at `.build/electron/...`, run `npm run electron` in the relevant worktree and retry.
2. **Port conflicts** — both harnesses pick ephemeral ports for the mock server and VS Code instance, so port conflicts are unlikely. If one occurs (error message mentioning `EADDRINUSE`), kill any orphaned Code OSS or mock server processes (`pkill -f 'Code - OSS'` or `pkill -f 'mock-llm-server'`) and retry.
3. **CDP connection timeout** — if the harness reports a timeout waiting for the CDP endpoint, the VS Code instance may have crashed on startup. Check `.chat-simulation-data/<timestamp>/` for any crash logs. Retry once; if it fails again, document the blocker and skip the affected section.
4. **Missing `sqlite3`** — `preseedStorage()` requires the `sqlite3` CLI on PATH. On macOS it ships with the OS; on Linux install it via `apt install sqlite3`. If absent, the harness will error on startup.

## Constraints recap

- **No source or test file modifications.** Measurement only.
- All artifacts go to `/tmp/chat-validation-<timestamp>/`; do not commit them.
- **Maximize reuse of existing tooling:** use `perf:chat --build --baseline-build --ci` for perf comparison, `perf:chat-leak` for leak checking, `chat-session-switch-smoke.mts` for session switching, `chat-memory-smoke.mts` for smoke runs, `compareSnapshots()`/`findRetainerPaths()` for heap analysis. Only write custom scripts for the true gaps (scenarios A, C, D, E, I, J, K, L).
- **Compare per-build deltas**, not absolute cross-build heap snapshots. Node IDs are process-local.
- **Use the double-GC pattern** (500ms + 300ms settle delays) before any memory measurement.
- **Use trace events for frame-rate analysis**, not CPU profiles. Use 50ms threshold, not 16ms.
- **Use existing thresholds** (20% global, `100ms` absolute for `timeToFirstToken`) with Welch's t-test significance (p < 0.05).
- **Use `perf:chat` directly for benchmarks** — do not use the `launch` skill, which bypasses mock server and auth setup. For manual scenarios, augment the `launch` skill with `IS_SCENARIO_AUTOMATION=1`, `VSCODE_COPILOT_CHAT_TOKEN`, mock server settings.
- **Mandate a warmup step** (open chat, send one message, open new chat) before taking any baseline measurement.
- **Both builds must be in the same build mode** (both dev). Dev-build memory numbers are not representative of production.
- **Use dev builds only** for heap snapshot analysis (class names preserved).
- The final report must be self-contained: a reviewer reading `report.md` should be able to understand pass/fail without opening the artifacts.
- **Clean up the baseline worktree** (`git worktree remove /tmp/vscode-main-baseline --force`) after validation is complete.
