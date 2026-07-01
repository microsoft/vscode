---
name: chat-perf
description: Run chat perf benchmarks and memory leak checks against the local dev build or any published VS Code version. Use when investigating chat rendering regressions, validating perf-sensitive changes to chat UI, or checking for memory leaks in the chat response pipeline.
---

# Chat Performance Testing

## When to use

- Before/after modifying chat rendering code (`chatListRenderer.ts`, `chatInputPart.ts`, markdown rendering)
- When changing the streaming response pipeline or SSE processing
- When modifying disposable/lifecycle patterns in chat components
- To compare performance between two VS Code releases
- In CI to gate PRs that touch chat UI code

## Quick start

```bash
# Run perf regression test (compares local dev build vs VS Code 1.115.0):
npm run perf:chat -- --scenario text-only --runs 3

# Run all scenarios with no baseline (just measure):
npm run perf:chat -- --no-baseline --runs 3

# Compare two local builds (apples-to-apples):
npm run perf:chat -- --build /path/to/build-A --baseline-build /path/to/build-B --runs 5

# Build a local production package and compare against a release:
npm run perf:chat -- --production-build --baseline-build 1.115.0 --runs 5

# Run memory leak check (10 messages in one session):
npm run perf:chat-leak

# Run leak check with more messages for accuracy:
npm run perf:chat-leak -- --messages 20 --verbose
```

## Perf regression test

**Script:** `scripts/chat-simulation/test-chat-perf-regression.js`
**npm:** `npm run perf:chat`

Launches VS Code via Playwright Electron, opens the chat panel, sends a message with a mock LLM response, and measures timing, layout, and rendering metrics. By default, downloads VS Code 1.115.0 as a baseline, benchmarks it, then benchmarks the local dev build and compares.

> **You don't always need a baseline.** A baseline exists only for *comparison* (regression detection). If you just want the current build's numbers — profiling a single change, capturing traces/heap snapshots, or iterating on a scenario — pass `--no-baseline` to skip downloading and benchmarking the baseline entirely (roughly halves runtime). Baseline comparison is what turns raw measurements into a pass/fail verdict; without it you still get all the metrics, just no verdict.

### Key flags

| Flag | Default | Description |
|---|---|---|
| `--runs <n>` | `5` | Runs per scenario. More = more stable. Use 5+ for CI. |
| `--scenario <id>` / `-s` | all | Scenario to test (repeatable). See `common/perf-scenarios.js`. |
| `--build <path\|ver>` / `-b` | local dev | Build to test. Accepts path or version (`1.110.0`, `insiders`, commit hash). |
| `--baseline <path>` | — | Compare against a previously saved baseline JSON file. |
| `--baseline-build <path\|ver>` | `1.115.0` | Version or local path to benchmark as baseline. |
| `--no-baseline` | — | Skip the baseline entirely — just measure the test build (no download, no comparison, ~2× faster). Use when you only need raw numbers, not a regression verdict. |
| `--save-baseline` | — | Save results as the new baseline (requires `--baseline <path>`). |
| `--resume <path>` | — | Resume a previous run, adding more iterations to increase confidence. |
| `--threshold <frac>` | `0.2` | Regression threshold (0.2 = flag if 20% slower). |
| `--production-build` | — | Build a local bundled package via `gulp vscode` for comparison against a release baseline. |
| `--no-cache` | — | Ignore cached baseline data, always run fresh. |
| `--force` | — | Skip build mode mismatch confirmation prompt. |
| `--ci` | — | CI mode: write Markdown summary to `ci-summary.md` (implies `--no-cache`, `--heap-snapshots`, `--cleanup-diagnostics`). |
| `--heap-snapshots` | — | Take heap snapshots after each run (slow; auto-enabled in `--ci` mode). |
| `--gc-object-stats` | — | **GC deep-dives only.** Enables V8 `gc_stats` tracing (per-type heap object dump on every GC). ⚠️ Corrupts all timing metrics — a major GC landing mid-request adds ~550ms — so never use it for benchmarking. Off by default; prefer heap snapshots for memory analysis. |
| `--cleanup-diagnostics` | — | Delete heap snapshots, CPU profiles, and traces to save disk. During runs, only the latest run's files are kept; after comparison, files for non-regressed scenarios are deleted. Auto-enabled in `--ci` mode. |
| `--setting <k=v>` | — | Set a VS Code setting override for all builds (repeatable). |
| `--test-setting <k=v>` | — | Set a VS Code setting override for the test build only. |
| `--baseline-setting <k=v>` | — | Set a VS Code setting override for the baseline build only. |
| `--verbose` | — | Print per-run details including response content. |

### Comparing two remote builds

```bash
# Compare 1.110.0 against 1.115.0 (no local build needed):
npm run perf:chat -- --build 1.110.0 --baseline-build 1.115.0 --runs 5
```

### Comparing two local builds

Both `--build` and `--baseline-build` accept local paths to VS Code executables. This enables apples-to-apples comparisons between any two builds:

```bash
# Compare two dev builds (e.g. feature branch vs main):
npm run perf:chat -- \
  --build .build/electron/Code\ -\ OSS.app/Contents/MacOS/Code\ -\ OSS \
  --baseline-build /path/to/other/Code\ -\ OSS.app/Contents/MacOS/Code\ -\ OSS \
  --runs 5

# Compare two production builds:
npm run perf:chat -- \
  --build ../VSCode-darwin-arm64-feature/Code\ -\ OSS.app/Contents/MacOS/Code\ -\ OSS \
  --baseline-build ../VSCode-darwin-arm64-main/Code\ -\ OSS.app/Contents/MacOS/Code\ -\ OSS \
  --runs 5
```

Local path baselines are never cached (the build may change between runs). Version string baselines are cached for reuse.

### Build modes and mismatch detection

The tool classifies builds into three modes based on the executable path:

| Mode | Source | Characteristics |
|---|---|---|
| `dev` | `.build/electron/` (local dev) | Unbundled sources, `VSCODE_DEV=1`, `NODE_ENV=development`. Higher memory and startup overhead. |
| `production` | `../VSCode-<platform>-<arch>/` (from `gulp vscode`) | Bundled JS, no dev flags. Matches release characteristics but uses local source. |
| `release` | `.vscode-test/` (downloaded via `@vscode/test-electron`) | Official published build. |

When test and baseline builds have different modes (e.g. dev vs release), the tool shows a warning and prompts for confirmation. Use `--force` or `--ci` to skip the prompt.

Using `--production-build` builds a local bundled package via `gulp vscode` for fair comparison against a release baseline. This eliminates dev-mode overhead while still testing your local changes.

```bash
# Production build vs release baseline (fair comparison):
npm run perf:chat -- --production-build --baseline-build 1.115.0 --runs 5
```

### Settings overrides

Use `--setting`, `--test-setting`, and `--baseline-setting` to inject VS Code settings into the launched instance. This is useful for A/B testing experimental features:

```bash
# Enable a feature for the test build only:
npm run perf:chat -- --test-setting chat.experimental.incrementalRendering.enabled=true --runs 3

# Compare two builds with different settings:
npm run perf:chat -- \
  --baseline-build "../vscode2/.build/electron/Code - OSS.app/Contents/MacOS/Code - OSS" \
  --baseline-setting chat.experimental.incrementalRendering.enabled=true \
  --test-setting chat.experimental.incrementalRendering.enabled=false \
  --runs 3

# Set a value for both builds:
npm run perf:chat -- --setting chat.mcp.enabled=false --runs 3
```

Precedence: `--test-setting` / `--baseline-setting` override `--setting` for the same key. Values are auto-parsed: `true`/`false` become booleans, numbers become numbers, everything else stays a string.

### Resuming a run for more confidence

When results exceed the threshold but aren't statistically significant, the tool prints a `--resume` hint. Use it to add more iterations to an existing run:

```bash
# Initial run with 3 iterations — may be inconclusive:
npm run perf:chat -- --scenario text-only --runs 3

# Add 3 more runs to the same results file (both test + baseline):
npm run perf:chat -- --resume .chat-simulation-data/2026-04-14T02-15-14/results.json --runs 3

# Keep adding until confidence is reached:
npm run perf:chat -- --resume .chat-simulation-data/2026-04-14T02-15-14/results.json --runs 5
```

`--resume` loads the previous `results.json` and its associated `baseline-*.json`, runs N more iterations for both builds, merges rawRuns, recomputes stats, and re-runs the comparison. The updated files are written back in-place. You can resume multiple times — samples accumulate.

### Statistical significance

Regression detection uses **Welch's t-test** to avoid false positives from noisy measurements. A metric is only flagged as `REGRESSION` when it both exceeds the threshold AND is statistically significant (p < 0.05). Otherwise it's reported as `(likely noise — p=X, not significant)`.

With typical variance (cv ≈ 20%), you need:
- **n ≥ 5** per build to detect a 35% regression at 95% confidence
- **n ≥ 10** per build to detect a 20% regression reliably

Confidence levels reported: `high` (p < 0.01), `medium` (p < 0.05), `low` (p < 0.1), `none`.

### Exit codes

- `0` — all metrics within threshold, or exceeding threshold but not statistically significant
- `1` — statistically significant regression detected, or all runs failed

### Scenarios

Scenarios are defined in `scripts/chat-simulation/common/perf-scenarios.js` and registered via `registerPerfScenarios()`. There are three categories:

- **Content-only** — plain streaming responses (e.g. `text-only`, `large-codeblock`, `rapid-stream`)
- **Tool-call** — multi-turn scenarios with tool invocations (e.g. `tool-read-file`, `tool-edit-file`)
- **Multi-turn user** — multi-turn conversations with user follow-ups, thinking blocks (e.g. `thinking-response`, `multi-turn-user`, `long-conversation`)

Run `npm run perf:chat -- --help` to see the full list of registered scenario IDs.

### Metrics collected

- **Timing:** time to first token, time to complete, time to render complete (includes typewriter animation)
- **Rendering:** layout count, layout duration (ms), style recalculation count, forced reflows, long tasks (>50ms), long animation frame count and duration
- **Memory:** heap before/after, heap delta post-GC (informational, noisy for single requests)
- **Extension host:** heap before/after/delta via CDP inspector

### Regression triggers vs informational metrics

Only these metrics trigger a regression failure (when they exceed the threshold with statistical significance):
- `timeToFirstToken`, `timeToComplete` — user-perceived latency
- `layoutDurationMs` — total layout time from the trace (the *real* layout cost)
- `forcedReflowCount` — forced synchronous layouts are always bad
- `longTaskCount`, `longAnimationFrameCount` — main thread jank

These are reported but **informational only** (won't fail CI):
- `layoutCount` — number of layout ops; inflated by CSS animations (compositor-driven, cheap). A build can do *more but cheaper* layouts, so gate on `layoutDurationMs`, not this count.
- `recalcStyleCount` — number of style recalcs; inflated by CSS animations (compositor-driven, cheap)
- `timeToRenderComplete` — includes typewriter animation tail
- Memory/heap metrics — too noisy for single-request benchmarks

### Statistics

Results use **IQR-based outlier removal** and **median** (not mean) to handle startup jitter. The **coefficient of variation (cv)** is reported — under 15% is stable, over 15% gets a ⚠ warning. Baseline comparison uses **Welch's t-test** on raw run values to determine statistical significance before flagging regressions. Use 5+ runs to get stable results.

## Memory leak check

**Script:** `scripts/chat-simulation/test-chat-mem-leaks.js`
**npm:** `npm run perf:chat-leak`

Launches one VS Code session, sends N messages sequentially, forces GC between each, and measures renderer heap and DOM node count. Uses **linear regression** on the samples to compute per-message growth rate, which is compared against a threshold.

### Key flags

| Flag | Default | Description |
|---|---|---|
| `--messages <n>` / `-n` | `10` | Number of messages to send. More = more accurate slope. |
| `--build <path\|ver>` / `-b` | local dev | Build to test. |
| `--threshold <MB>` | `2` | Max per-message heap growth in MB. |
| `--setting <k=v>` | — | Set a VS Code setting override (repeatable). |
| `--verbose` | — | Print per-message heap/DOM counts. |

### What it measures

- **Heap growth slope** (MB/message) — linear regression over forced-GC heap samples. A leak shows as sustained positive slope.
- **DOM node growth** (nodes/message) — catches rendering leaks where elements aren't cleaned up. Healthy chat virtualizes old messages so node count plateaus.

### Interpreting results

- `0.3–1.0 MB/msg` — normal (V8 internal overhead, string interning)
- `>2.0 MB/msg` — likely leak, investigate retained objects
- DOM nodes stable after first message — normal (chat list virtualization working)
- DOM nodes growing linearly — rendering leak, check disposable cleanup

## CI runs & pinpointing regressions

The perf + leak checks run in CI via the **`.github/workflows/chat-perf.yml`** workflow (a scheduled daily `workflow_dispatch`, plus manual dispatch). Each run benchmarks the current `main` as the **test** build against a fixed release **baseline** (from `config.jsonc`, e.g. `1.122.0`). Because the baseline is fixed, the **test** median for a metric across successive daily runs traces `main`'s trajectory over time — that's what lets you bisect *when* something regressed or went flaky.

### Finding and reading historic runs

```bash
# List recent runs (most recent first) — note the run IDs and dates
gh run list --workflow chat-perf.yml -R microsoft/vscode --limit 30 \
  --json databaseId,status,conclusion,createdAt,headBranch \
  --jq '.[] | [.databaseId, (.conclusion//.status), .createdAt, .headBranch] | @tsv'

# See a run's per-job results
gh run view <run-id> -R microsoft/vscode --json jobs \
  --jq '.jobs[] | [.name, (.conclusion//.status)] | @tsv'

# Trigger a run manually against any ref/version:
gh workflow run chat-perf.yml -R microsoft/vscode --ref main \
  -f test_build=<branch|sha|version> -f baseline_build=<version>
```

### Artifacts per run (and retention — this matters for old runs)

| Artifact | Contents | Retention |
|---|---|---|
| `chat-perf-summary` | Unified `ci-summary.md`: verdicts, per-metric medians ±stddev, **per-run raw tables** | 30 days |
| `perf-results-<group>` | Everything below **plus traces, CPU profiles, heap snapshots** (large) | 30 days |
| `leak-results` | Leak log + `chat-simulation-leak-results.json` | 30 days |
| `perf-summary-<group>` | `results.json` (full per-run metrics incl. `rawRuns`) + `baseline-*.json` | **1 day** |

```bash
# List a run's artifacts + whether they've expired
gh api repos/microsoft/vscode/actions/runs/<run-id>/artifacts \
  --jq '.artifacts[] | [.name, .expired] | @tsv'

# Download the human-readable summary (best first stop; survives 30 days)
gh run download <run-id> -R microsoft/vscode -n chat-perf-summary
```

### Pinpointing where a metric regressed / went flaky

1. **Bisect across dates.** Pull `chat-perf-summary/ci-summary.md` from several runs spanning the window. Compare the **test** median (and ±stddev) for the suspect metric+scenario run-to-run — the day it jumps is when `main` changed. A metric that goes *bimodal* (e.g. a raw-run column showing two clusters like `~250 / ~900`) is the flaky signature; a stable shift is a genuine regression.
2. **Confirm it's real vs. measurement noise.** Check the per-run raw tables (in `ci-summary.md`) — high ±stddev / bimodal values mean the *median* is being pulled around by a few outlier runs, not a uniform slowdown.
3. **Deep-dive the cause.** Download `perf-results-<group>` (has the `trace.json` per run) for a slow run and inspect what dominates the slow window. Trick that found the `gc_stats` artifact: sum main-thread `RunTask` durations between two `code/chat/*` marks (e.g. `willCollectInstructions` → `didCollectInstructions`) — if the window is ~0% busy, it's an async wait or a GC pause, not real work; then look at the largest `X`-phase events in that window (`MajorGC`, `Layout`, etc.).
4. **Reproduce a suspect commit locally** to bisect precisely: `npm run perf:chat -- --build <sha> --baseline-build <ver> --runs 7` (or two commits directly via `--build <shaA> --baseline-build <shaB>`).

> Tip: `perf-summary-*` (the machine-readable `results.json` with `rawRuns`) is deleted after **1 day**, so for older runs rely on `chat-perf-summary` (raw tables, 30 days) or extract `results.json` from `perf-results-*` (also 30 days).

## Architecture

```
scripts/chat-simulation/
├── common/
│   ├── mock-llm-server.js    # Mock CAPI server matching @vscode/copilot-api URL structure
│   ├── perf-scenarios.js     # Built-in scenario definitions (content, tool-call, multi-turn)
│   └── utils.js              # Shared: paths, env setup, stats, launch helpers
├── config.jsonc              # Default config (baseline version, runs, thresholds)
├── fixtures/                 # TypeScript fixture files used by tool-call scenarios
├── test-chat-perf-regression.js
└── test-chat-mem-leaks.js
```

### Mock server

The mock LLM server (`common/mock-llm-server.js`) implements the full CAPI URL structure from `@vscode/copilot-api`'s `DomainService`:

- `GET /models` — returns model metadata
- `POST /models/session` — returns `AutoModeAPIResponse` with `available_models` and `session_token`
- `POST /models/session/intent` — model router
- `POST /chat/completions` — SSE streaming response matching the scenario
- Agent, session, telemetry, and token endpoints

The copilot extension connects to this server via `IS_SCENARIO_AUTOMATION=1` mode with `overrideCapiUrl` and `overrideProxyUrl` settings. The `vscode-api-tests` extension must be disabled (`--disable-extension=vscode.vscode-api-tests`) because it contributes a duplicate `copilot` vendor that blocks the real extension's language model provider registration.

### Adding a scenario

1. Add a new entry to the appropriate object (`CONTENT_SCENARIOS`, `TOOL_CALL_SCENARIOS`, or `MULTI_TURN_SCENARIOS`) in `common/perf-scenarios.js` using the `ScenarioBuilder` API from `common/mock-llm-server.js`
2. The scenario is auto-registered by `registerPerfScenarios()` — no manual ID list to update
3. Run: `npm run perf:chat -- --scenario your-new-scenario --runs 1 --no-baseline --verbose`

## Related skills

- **heap-snapshot-analysis** — When a perf regression or leak check identifies high memory growth, use the heap-snapshot-analysis skill to dig deeper. It can parse `.heapsnapshot` files, compare before/after snapshots, group object deltas, and trace retainer paths to find what keeps disposed objects alive. The chat-perf leak check measures overall heap slope; heap-snapshot-analysis finds the specific objects responsible.
- **auto-perf-optimize** — For launching VS Code, driving a scenario, and capturing heap snapshots or CPU profiles automatically before doing low-level analysis.
