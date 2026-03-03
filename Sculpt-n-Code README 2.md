# Sculpt-n-Code

Sculpt-n-Code (SNC) is a modified version of VS Code that provides **live, inline visualizations of Python runtime values** as you type. When you open a Python file, SNC automatically executes it, captures the values produced by each statement, and renders interactive HTML visualizations directly in the editor next to the line that produced them. Visualizations are interactive, e.g. users can select portions of a string by dragging to build regex patterns by demonstration.

## How It Works

When a Python file is open in the editor, SNC:

1. **Parses** the user's code into a Python AST.
2. **Transforms** the AST by injecting `_log_value()` calls after every assignment, expression, conditional, loop iteration, and return statement.
3. **Executes** the transformed code in a subprocess.
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
│  - Elm-style command handling (e.g. NewCode to replace   │
│    file contents when Enter generates a regex line)      │
└────────────────────┬─────────────────────────────────────┘
                     │ IPC channel "sncProcess"
                     │ (VS Code's mainProcessService)
┌────────────────────▼─────────────────────────────────────┐
│  Main Process Service (TypeScript, Node.js)              │
│  src/vs/platform/snc/node/sncProcessService.ts           │
│  - SNCProcessService: spawns & manages Python processes  │
│  - Preloaded process pool with fork-based checkpointing  │
│  - Streams NDJSON from Python stdout → onStream event    │
│  - Timing instrumentation (spawn → stdout → render)      │
└────────────────────┬─────────────────────────────────────┘
                     │ stdin/stdout (NDJSON)
┌────────────────────▼─────────────────────────────────────┐
│  Python Runner + Visualizers                             │
│  src/vs/platform/snc/node/python_runner.py               │
│  - AST parsing → CodeTransformer → compile → exec        │
│  - Preload mode: long-lived parent with os.fork() for    │
│    each run; Checkpoint 1 (visualizers loaded) and       │
│    Checkpoint 2 (imports pre-executed)                   │
│  - Pluggable visualizer system loaded from disk          │
│                                                          │
│  src/vs/platform/snc/node/visualizers/                   │
│  - the type-specific visualizers                         │
└──────────────────────────────────────────────────────────┘
```

### Communication Protocol

All communication between the Node.js service and the Python process uses **newline-delimited JSON (NDJSON)** over stdout. Message types:

| Message Type | Direction | Purpose |
|---|---|---|
| `checkpoint_ready` | Python → Node | Preloaded process is ready to accept code |
| `item` | Python → Node → Renderer | A single visualization item (line, visIndex, html, model) |
| `command` | Python → Node → Renderer | An Elm-style command for VS Code (e.g. `NewCode`) |
| `end` | Python → Node → Renderer | Run completed, includes stdout/stderr/exitCode |
| `error` | Node → Renderer | Process error or timeout |
| `spawn` | Node → Renderer | Timing data when process was spawned |

### Interactive Visualizer Protocol (Elm Architecture)

Visualizers that support interaction implement the Elm architecture:

- **`init_model(value)`** — returns initial state for this visualization instance.
- **`visualize(value, model)`** — renders HTML from the value and current model. HTML elements carry `snc-mouse-down`, `snc-mouse-move`, `snc-mouse-up`, and `snc-key-down` attributes whose values are Python expression strings (e.g. `repr(MouseDown(5))`).
- **`update(event, source_code, source_line, model, value)`** — processes a UI event and returns `(new_model, commands)`. Commands like `NewCode(code)` tell VS Code to replace the file contents.

Models are serialized to JSON and round-tripped through the TypeScript frontend so they survive across re-executions. The value itself is **not** stored in the model; it is always passed as a parameter.

Static (non-interactive) visualizers only need `can_visualize(value)` and `visualize(value)`.

### Execution Optimization: Fork-Based Checkpointig

To minimize latency between a keystroke and seeing updated visualizations, the Python runner uses a preloaded process with `os.fork()`:

- **Checkpoint 1**: A long-lived Python process pre-imports all visualizer modules and waits for commands on stdin. When code arrives, it `fork()`s a child to handle the run while the parent immediately returns to waiting.
- **Checkpoint 2**: After the first run of a given piece of code, the parent also pre-executes the file's leading import statements. On subsequent runs with the same imports, the forked child inherits the already-imported modunles and only needs to execute the transformed body --- skipping both AST transformation and import execution entirely.

This means repeated edits to the body of a file (the common case) take only the time to fork + execute the changed code.

### Visualizer Discovery

Visualizers are loaded from three directories, checked in priority order:

1. `.snc_visualizers/` in the current workspace (project-specific)
2. `~/.snc_visualizers/` in the user's home directory (user-global)
3. `src/vs/platform/snc/node/visualizers/` (built-in)

Any Python file matching `*_visualizer.py` that exports `can_visualize()` and `visualize()` is loaded. The first visualizer whose `can_visualize(value)` returns `True` wins.

## Cursor Position Awareness

When a value is inside a loop, the visualizer displays either the **first** or **last** iteration's value depending on where the cursor is. If the cursor is positioned within the loop body (at or before the loop's last line, or on the line right after the loop), the first iteration is shown; otherwise, the last iteration is shown. This is tracked via the `last_line_in_containing_loop` field injected by the `CodeTransformer`.
