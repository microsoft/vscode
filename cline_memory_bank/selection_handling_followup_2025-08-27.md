# Selection Handling Follow-up — 2025-08-27

Scope
- Undo renderer-side “optimistic/caching” behavior; make backend authoritative for selections.
- Add instrumentation to locate ~500ms lag.
- Reduce rerun overhead on pointer events without masking latency.
- Keep streaming NDJSON model snapshots and per-visualizer state handoff.

Renderer (TS)
- File: src/vs/editor/contrib/snc/browser/snc.ts
  - Removed provisional UI selection path:
    - Deleted VisualizationWidget.applyProvisionalSelection().
    - Removed front-end drag state (dragStateByKey) and associated logic.
  - Rerun policy:
    - Now reruns on every pointer event phase: 'down' | 'move' | 'up' (dedupe move by idx; 16ms throttle already present at widget level).
    - Track lastPointerEventMs (was lastPointerUpMs).
  - Event payload:
    - UiEvent = { type: 'viz_pointer', line, phase, idx, modifiers?, prevModel?, visIndex? }.
    - prevModel sourced from lastModelByKey, keyed by `${line}:${visIndex ?? 0}`.
  - Streaming / persistence:
    - Assign visIndex for streamed items to disambiguate multiple visualizations per line.
    - Persist per-visualizer model from item.model into lastModelByKey.
  - Timing logs:
    - 'SNC timing: run start' with ptrToStartMs = now - lastPointerEventMs.
    - 'SNC timing: first item' on first streamed item per run.
    - 'SNC timing: run end' with totalMs, spawnToFirstItemMs, ptrEvtToEndMs.

Backend (Node)
- File: src/vs/platform/snc/node/sncProcessService.ts
  - Added run timing fields per run: tSpawn, tStdinEnd, tStdoutFirst, tFirstItem, tEnd.
  - Emitted logs via ILogService:
    - 'SNC timing: stdin sent'
    - 'SNC timing: stdout first byte'
    - 'SNC timing: first item parsed'
    - 'SNC timing: run summary' with spawnToStdoutFirstMs, spawnToFirstItemMs, spawnToEndMs.
  - NDJSON stream parsing unchanged; added pass-through for runner 'meta' messages.

Python Runner (py)
- File: src/vs/platform/snc/node/python_runner.py
  - Model/state:
    - Already supports: log_value attaches item.model only for the targeted item (line + visIndex match) after applying update(event, model).
    - Uses ui_event.prevModel when provided.
  - Instrumentation:
    - Emit NDJSON “meta” messages to stdout immediately (via sys.__stdout__):
      - runner-started, chdir-done, code-received, transform-start/done, compile-done, exec-start.
  - Performance changes:
    - Fast-path for strings: load only built-in string_visualizer.py (no directory scan) and cache within-process.
    - Optional write of transformed.py gated behind SNC_WRITE_TRANSFORMED env var (avoid unnecessary unparse/IO cost per run).
- Visualizers:
  - src/vs/platform/snc/node/visualizers/string_visualizer.py
  - src/vs/platform/snc/node/visualizers/numpy_visualizer.py
    - Avoid import numpy in can_visualize(): identify ndarray by value.__class__.__module__/__name__.
  - src/vs/platform/snc/node/visualizers/pandas_visualizer.py
    - Avoid import pandas in can_visualize()/visualize(): identify DataFrame/Series by class name/module; operate directly on value.

Observed Timings (from logs)
- Before changes (string case): spawnToFirstItemMs ≈ 500–675ms on pointer events.
- After changes (string case):
  - spawnToFirstItemMs ≈ 30–44ms typical, sometimes ~150ms initial; consistent ~30–36ms during drag moves.
  - Meta shows transform/compile complete within ~1–2ms per run; prior lag was dominated by visualizer loading/imports and directory scan.
- Conclusion from instrumentation: significant portion of the prior ≈500ms was from per-run heavy imports (e.g., numpy/pandas) and scanning visualizer directories, exacerbated by process-per-event architecture. Fast-path and import avoidance reduce that overhead for common cases (strings).

Protocol/State Model
- UiEvents transport: SNC_UI_EVENTS JSON per run via env var.
- Python runner:
  - For each log_value(line, value):
    - Assign idx_in_line and scope event to the targeted item if (ui_event.line, ui_event.visIndex) match.
    - model := ui_event.prevModel or init_model() (if available), then model := update(ui_event, model).
    - html := visualize(value, model) with fallback to visualize(value).
    - Emit streamed item { line, execution_step, html, model? (only on targeted), last_line_in_containing_loop? }.
- Renderer:
  - Persist item.model keyed by (line, visIndex) and send back as prevModel.
  - Rerun on pointer move/down/up; move events deduped by idx.

Files Touched
- TS:
  - src/vs/editor/contrib/snc/browser/snc.ts (remove optimistic selection; rerun policy; timing; model persistence)
  - src/vs/platform/snc/node/sncProcessService.ts (timing instrumentation; meta passthrough)
- Python:
  - src/vs/platform/snc/node/python_runner.py (meta emission; string fast-path; write gate)
  - src/vs/platform/snc/node/visualizers/numpy_visualizer.py (no import numpy in can_visualize)
  - src/vs/platform/snc/node/visualizers/pandas_visualizer.py (no import pandas in can_visualize/visualize)

Testing Notes (internal)
- Used ./scripts/code.sh . ./snc_test.py (string example) to exercise pointer events with streaming and observe timing logs.
- Confirmed per-event reruns and backend-controlled highlights (no JS provisional UI).
