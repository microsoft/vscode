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

### 0. Pre-flight

1. Confirm the build is up to date: check the `VS Code - Build` watch task output, or run `npm run typecheck-client`. Do not proceed if there are compilation errors.
2. Create the artifacts directory: `/tmp/chat-validation-<timestamp>/artifacts/`.
3. Record the git SHA of this branch and of `main` for reproducibility (`artifacts/git-sha.txt`).
4. **Build `main` in a separate worktree** (only to get a compiled executable — do NOT manually launch or drive it):
   ```bash
   git worktree add /tmp/vscode-main-baseline main
   cd /tmp/vscode-main-baseline && npm run transpile-client
   ```
   Both builds must be in the same build mode (both dev). Dev-build memory numbers are not representative of production — note this in the report.

### 1. Perf regression comparison (branch vs main) — use `perf:chat` natively

Run the existing harness with native two-build comparison. This replaces manual launch + Playwright + JSON diffing:

```bash
npm run perf:chat -- \
  --build .build/electron/Code\ -\ OSS.app/Contents/MacOS/Code\ -\ OSS \
  --baseline-build /tmp/vscode-main-baseline/.build/electron/Code\ -\ OSS.app/Contents/MacOS/Code\ -\ OSS \
  --runs 5 --ci --heap-snapshots
```

This runs all 16 scenarios against both builds, does statistical comparison (Welch's t-test, p < 0.05), and writes `ci-summary.md`. Save `ci-summary.md` and all run-summary JSON to `artifacts/`.

**Thresholds:** Use the existing `config.jsonc` thresholds (20% global, `100ms` absolute for `timeToFirstToken`). A metric is flagged as a regression **only when it both exceeds the threshold AND is statistically significant** (p < 0.05). Do not invent a new 10% threshold — it is below dev-build noise floor (cv ≈ 20%).

**What this covers:** Scenarios B (multi-step chat with tool calls, file edits, thinking blocks) and partially D (long conversations) from the original plan are fully covered by the 16 built-in scenarios (`tool-read-file`, `tool-edit-file`, `tool-terminal`, `multi-turn-user`, `long-conversation`).

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

Save both outputs to `artifacts/branch-leak-report.txt` and `artifacts/main-leak-report.txt`.

**What this covers:** Scenarios F (close/open chat), G (idle memory growth), and H (repeated open/close accumulation) from the original plan. The leak checker calls `openNewChat()` between iterations and cycles through all scenario types.

### 3. Session switch leak check — use `chat-session-switch-smoke.mts`

```bash
node .github/skills/auto-perf-optimize/scripts/chat-session-switch-smoke.mts \
  --switch-iterations 10 \
  --heap-snapshot-label 04-switch-01 \
  --heap-snapshot-label 04-switch-10 \
  --output /tmp/chat-validation-<timestamp>/artifacts/session-switch
```

This creates multiple chat sessions with different content types and repeatedly switches between them — exercising per-session marker controller creation/disposal. Save `summary.json` and snapshots to `artifacts/`.

### 4. Custom scenarios (true gaps — no existing tool covers these)

These are the scenarios that the existing harnesses do **not** cover. Implement each as a scratchpad script under `/tmp/chat-validation-<timestamp>/` that reuses the `launch` skill + `@playwright/cli` patterns from `auto-perf-optimize`. **Critical:** the launched instance must have the mock LLM server configured — set `IS_SCENARIO_AUTOMATION=1`, `VSCODE_COPILOT_CHAT_TOKEN`, write settings pointing to the mock server, and `--disable-extension=vscode.vscode-api-tests`. Alternatively, use `chat-memory-smoke.mts` as the launch vehicle (it handles this setup).

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

1. The controller calls `appendDebugLog()` on **every `renderMarkers` call**, writing a JSONL line to a hardcoded path (`/Users/core/out.txt`) via `fileService.writeFile()`. This is:
   - A **hardcoded absolute path** that will fail on any machine that isn't the developer's.
   - A **performance concern** — during scrolling, `renderMarkers` may be called dozens of times per second.
2. During Scenario D (scrolling), measure the file I/O overhead by checking the renderer log for `[ChatScrollbarPromptMarkerDebug] Failed to append debug log` warnings (the error is silently caught).
3. Check if `/Users/core/out.txt` exists and its size after the scenario.
4. **Flag this as a finding in the report** — the hardcoded path and per-render write are a performance and stability risk.

### 5. Heap snapshot analysis (per-build deltas, not cross-build absolute comparison)

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

For the open/close accumulation check (original Scenario H):

1. Capture a `measure()` sample (forced double-GC + `Runtime.getHeapUsage` + `document.querySelectorAll('.chat-scrollbar-prompt-marker').length`) **after each of 20 open/close cycles**, not just at the end.
2. Compute `linearRegressionSlope()` (available in `scripts/chat-simulation/common/utils.js`) on the 20 heap samples.
3. A positive slope with low variance is the leak signal.
4. Do NOT take 20 full heap snapshots — use the lightweight `measure()` approach per iteration. Reserve full snapshots for baseline and final states only.

## Deliverables

Save everything under `/tmp/chat-validation-<timestamp>/`:

1. **`artifacts/`** — all heap snapshots (`.heapsnapshot`), trace files (`trace.json`), screenshots (`.png`), run-summary JSON, `ci-summary.md` from `perf:chat --ci`, and leak reports from `perf:chat-leak`.
2. **`report.md`** — a markdown report with:
   - **Summary table**: one row per scenario (A, C, D, E, I, J, K, L) with pass/fail and key metric.
   - **Perf comparison table**: `perf:chat` metrics for `main` vs branch with % delta, threshold, and statistical significance (p-value). Incorporate the `ci-summary.md` output.
   - **Leak comparison table**: per-build residual heap growth (MB) and DOM node growth from `perf:chat-leak`, plus per-iteration heap slope from the open/close cycle test.
   - **Marker-specific findings**: `ChatScrollbarPromptMarkerController` instance count delta (per-build), `.chat-scrollbar-prompt-marker` DOM count delta, retainer paths for any leaked instances.
   - **Debug log I/O finding**: flag the hardcoded `/Users/core/out.txt` path and per-render write as a risk.
   - **Log findings**: any errors or warnings from renderer/extension-host/agent-host logs during scenarios.
   - **Recommendation**: overall pass/fail and whether the branch is safe to merge from a stability/performance standpoint.
3. **`artifacts/git-sha.txt`** — the git SHA of this branch and `main` used for the comparison.

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
