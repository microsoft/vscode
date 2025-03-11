# Selection Handling Redesign — 2025-08-26

Scope
- Move selection computation from renderer to Python visualizers.
- Renderer sends primitive pointer events only (mousedown/mousemove/mouseup) with nearest data-snc-idx.
- Python visualizers own selection model construction and rendering.

Types/Protocol
- IVisualizationItem: add optional model?: unknown (JSON-serializable).
- New UiEvent variant VizPointerEvent: { type: 'viz_pointer'; line; phase: 'down'|'move'|'up'; idx: number|null; modifiers?; prevModel?: unknown }.

Runner
- Read UI events from SNC_UI_EVENTS env var per run (existing).
- In log_value(line, value, ...):
  - If ui_event.type == 'viz_pointer' and ui_event.line == line:
    - model0 = ui_event.prevModel || init_model() if available.
    - If visualizer.update exists, model1 = update(ui_event, model0); else model1 = model0.
  - Else fallback to model = init_model() if available.
  - visualize(value, model1) preferred; fallback to visualize(value).
  - Attach item["model"] = model1 (JSON-serializable) to streamed item.

Renderer
- VisualizationWidget:
  - Remove DOM Range selection parsing and computeSelectionRanges().
  - Add mousedown/mousemove/mouseup listeners; map target → nearest data-snc-idx; maintain local dragging flag; throttle move (~30–50ms).
- SNCController:
  - Maintain lastModelByLine: Map<number, unknown>.
  - On stream item: if item.model present, persist to lastModelByLine[item.line].
  - onPointerEvent(line, phase, idx, modifiers): send VizPointerEvent with prevModel from map; start streaming run (cancel previous).
  - Do not rerun on cursor move; rerun on edits, editor visibility change, and pointer events.

String Visualizer
- update(event, model):
  - Support event.type == 'viz_pointer':
    - down: set anchor/cursor; dragging = true; compute stringSelectionRanges from anchor..cursor (end-exclusive).
    - move: if dragging and idx != None: update cursor; recompute ranges.
    - up: dragging = false (keep anchor/cursor).
- visualize(value, model) continues to use stringSelectionRanges and data-snc-idx spans (existing).

Notes
- Indices are 0-based; sentinels (e.g., -2, -1) permitted if emitted in HTML.
- Frequent reruns expected on pointer move; streaming NDJSON keeps UI responsive.

Files
- TS: src/vs/platform/snc/common/snc.ts (types).
- Python: src/vs/platform/snc/node/python_runner.py (log_value attach model; use ui_event.prevModel).
- Python: src/vs/platform/snc/node/visualizers/string_visualizer.py (pointer-event update).
- TS: src/vs/editor/contrib/snc/browser/snc.ts (widget pointer handlers; controller model persistence).
