# Sculpt-n-Code

Sculpt-n-Code (SNC) is a modified version of VS Code that provides **live, inline visualizations of Python runtime values** as you type. When you open a Python file, SNC automatically executes it, captures the values produced by each statement, and renders interactive HTML visualizations directly in the editor next to the line that produced them. Visualizations are interactive; for example, users can select portions of a string by dragging to build regex patterns by demonstration.

## How It Works

When a Python file is open in the editor, SNC:

1. **Parses** the user's code into a Python AST.
2. **Transforms** the AST by injecting `_log_value()` calls after every assignment, expression, conditional, loop iteration, and return statement.
3. **Executes** the transformed code in a pooled Python worker subprocess.
4. **Streams** JSON-encoded visualization items (one per logged value) back to the editor over stdout.
5. **Renders** each item as an HTML overlay widget positioned at the end of the corresponding source line.

The user's original line numbers are preserved through AST compilation (it's not string-based code generation), so error tracebacks still point to the correct lines. User program `stdout`/`stderr` are captured separately from the visualization stream.

## Architecture

The system is split across three layers:

```
┌──────────────────────────────────────────────────────────┐
│  VS Code Renderer (TypeScript)                           │
│  src/vs/editor/contrib/snc/browser/snc.ts                │
│  - SNCController: editor contribution, manages lifecycle │
│  - VisualizationWidget: overlay widget per value per line│
│  - Debounced re-execution on every edit                  │
│  - Routes mouse/keyboard events from HTML back to Python │
│  - Elm-style command handling (e.g. NewCode inserts line │
│    edits; CopyToClipboard writes text to clipboard)      │
└────────────────────┬─────────────────────────────────────┘
                     │ IPC channel "sncProcess"
                     │ (VS Code's mainProcessService)
┌────────────────────▼─────────────────────────────────────┐
│  Main Process Service (TypeScript, Node.js)              │
│  src/vs/platform/snc/node/sncProcessService.ts           │
│  - SNCProcessService: spawns & manages Python processes  │
│  - Checkpointed process pools (CP1/CP2 workers)          │
│  - Streams NDJSON from Python stdout → onStream event    │
│  - Timing instrumentation (spawn → stdout → render)      │
└────────────────────┬─────────────────────────────────────┘
                     │ stdin/stdout (NDJSON)
┌────────────────────▼─────────────────────────────────────┐
│  Python Runner + Visualizers                             │
│  src/vs/platform/snc/node/python_runner.py               │
│  - AST parsing → CodeTransformer → compile → exec        │
│  - Pool-worker mode: workers emit checkpoint_ready(1),   │
│    optionally warm to checkpoint_ready(2) by pre-running │
│    leading imports for the current code                  │
│  - Per-run visualizer reload by file mtime; pluggable    │
│    visualizer system loaded from disk                    │
│                                                          │
│  src/vs/platform/snc/node/visualizers/                   │
│  - the type-specific visualizers                         │
└──────────────────────────────────────────────────────────┘
```

### Communication Protocol

Node.js and Python communicate over stdio using **newline-delimited JSON (NDJSON)**. Message types:

| Message Type | Direction | Purpose |
|---|---|---|
| `checkpoint_ready` | Python → Node | Worker reached checkpoint 1 or 2 and is ready |
| `item` | Python → Node → Renderer | A single visualization item (line, visIndex, html, model) |
| `command` | Python → Node → Renderer | An Elm-style command for VS Code (e.g. `NewCode`) |
| `end` | Python → Node → Renderer | Run completed, includes stdout/stderr/exitCode |
| `warning` | Python → Node → Renderer | Visualizer load/runtime warning |
| `error` | Node → Renderer | Process error or timeout |
| `spawn` | Node → Renderer | Timing data when process was spawned |

### Interactive Visualizer Protocol (Elm Architecture)

Visualizers that support interaction implement the Elm architecture:

- **`init_model(value)`** — returns initial state for this visualization instance.
- **`visualize(value, model)`** — renders HTML from the value and current model. HTML elements can carry `snc-mouse-down`, `snc-mouse-move`, `snc-mouse-up`, `snc-key-down`, and `snc-input` attributes whose values are Python expression strings. Nested visualizers can route events with `snc-child-key`.
- **`update(event, source_code, source_line, model, value)`** — processes a UI event and returns `(new_model, commands)`. Commands include `NewCode` (line-based insert edits) and `CopyToClipboard`.

Models are serialized to JSON and round-tripped through the TypeScript frontend so they survive across re-executions. The value itself is **not** stored in the model; it is always passed as a parameter.

Static (non-interactive) visualizers only need `can_visualize(value)` and `visualize(value)`.

### Execution Optimization: Checkpointed Worker Pools (No `os.fork()`)

To minimize latency between a keystroke and seeing updated visualizations, SNC uses pre-spawned worker pools:

- **Checkpoint 1 (CP1)**: Pool workers start with visualizers loaded and emit `checkpoint_ready(1)`. CP1 workers run full transform+compile+exec and then exit.
- **Checkpoint 2 (CP2)**: Workers can be warmed with `init_imports` for the current code, pre-running leading imports and emitting `checkpoint_ready(2)`. CP2 workers then execute only the transformed body with cached imports and exit.

The service prefers ready CP2 workers when code matches the currently warmed code, falls back to CP1 workers otherwise, invalidates stale CP2 workers on code changes, and refills pools lazily after runs complete.

### Visualizer Discovery

Visualizers are loaded from three directories, checked in priority order:

1. `.snc_visualizers/` in the current workspace (project-specific)
2. `~/.snc_visualizers/` in the user's home directory (user-global)
3. `src/vs/platform/snc/node/visualizers/` (built-in)

Any Python file matching `*_visualizer.py` that exports `can_visualize()` and `visualize()` is loaded. The first visualizer whose `can_visualize(value)` returns `True` wins.

## Cursor Position Awareness

When a value is inside a loop, the visualizer displays either the **first** or **last** iteration's value depending on where the cursor is. If the cursor is positioned within the loop body (at or before the loop's last line, or on the line right after the loop), the first iteration is shown; otherwise, the last iteration is shown. This is tracked via the `last_line_in_containing_loop` field injected by the `CodeTransformer`.
