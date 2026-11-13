---
description: Use when changing the editor minimap, its layout, slider, decorations or section headers, or the editor overview ruler. Covers deliberate behaviors that are easy to break and how to verify minimap changes.
applyTo: "src/vs/editor/browser/viewParts/minimap/**,src/vs/editor/browser/viewParts/overviewRuler/**,src/vs/editor/common/services/findSectionHeaders.ts,src/vs/editor/test/browser/view/minimap*.test.ts,src/vs/editor/test/common/services/findSectionHeaders.test.ts"
---

# Editor Minimap

The minimap is a canvas view part, `src/vs/editor/browser/viewParts/minimap/minimap.ts`, drawn on top of the editor contents beside the vertical scrollbar. Its layout (`minimapLeft`, `minimapWidth`, the canvas sizes and the scale) is computed in `EditorLayoutInfoComputer._computeMinimapLayout` and `_computeMinimapScale` in `src/vs/editor/common/config/editorOptions.ts`. Section headers come from `findSectionHeaders.ts`, which runs in the editor worker.

## Deliberate behaviors: don't break them

- **A translucent `minimap.background` shows the code underneath.** This is a feature (#32581, #58324, #132681). `_applyLayout` paints the background behind the canvas only when it is opaque. A change that always paints the background passes CI and breaks this.
- **The slider follows lines, not view zones.** View zones (inline chat, diff hunks, peek) are absent from the minimap. When the viewport starts inside a zone or the top padding, the fraction of the first visible line is clamped to `[0, 1]`, so the slider never jumps back while zones scroll by (#290138). Keep scrolling-down monotonic. `minimapLayout.test.ts` covers this.
- **The scale steps with the pixel ratio and tolerates a pixel ratio just below a step.** `floor(scale * pixelRatio + 0.125)` keeps a pixel ratio such as 1.9999998 (a slightly negative zoom on a Retina screen) at the higher step instead of halving the minimap (#236999). `editorLayoutProvider.test.ts` lists the pixel ratios to keep.
- **The decorations layer repaints only the rows that changed.** Any 2D draw on a visible canvas makes Chromium repaint the whole layer. So the decorations are recorded as a `RecordedFrame`, `RowSignatures.diff` compares them with the previous frame, and only the dirty band is replayed under a clip (#193422, `minimapDirtyRows.ts`). Don't read pixels back (`getImageData`) per frame: it costs more than the full repaint it saves. Anything drawn on that layer must go through the frame, or it won't be repainted.
- **Every themed color must be in `MinimapOptions.equals`.** Otherwise a theme change keeps the old color. Section header text once kept its old color this way.
- **Section header labels don't overlap.** Adjacent headers are stacked rather than drawn over each other (#213027). In `minimap.size: fill` the header must not be squeezed by the canvas scale (#244902).

## Section headers (`findSectionHeaders.ts`)

- Keep it language-agnostic. Don't hard-code keywords like `region` or comment syntax for one language. Language-specific data belongs in the language configuration: `folding.markers.start` may declare a named group `label` for the region name; otherwise the name is the text after the match. The comment tokens come from `blockCommentStartToken` and `blockCommentEndToken`.
- A `MARK:` label inside a block comment drops the comment end token (`<!-- MARK: Label -->` shows `Label`, #210371). The token is stripped only when a block comment is open on that line just before the first `separator` or `label` capture, not before the match. A custom regex may consume the opening token itself (`^<!--\s*MARK:\s*(?<label>.*)$`) and still have the end token stripped.
- Use the `d` flag and `match.indices` for positions, not `indexOf` on the matched text.

## Overview ruler

- `decorationsOverviewRuler.ts` uses `contain: size`, not `strict`. With paint containment, Chromium rounds the ruler's layer down at fractional zoom, and one device pixel of editor text shows through at the editor's right edge (#213309). `overviewRuler.ts` (diff editor) still uses `strict`.

## Verifying a change

- `build-fast` and the unit tests transpile without type checking, and minimap test files have failed to compile this way. When you change TypeScript, including tests, check the diagnostics of an active watch task, or run `pnpm run typecheck-client` if none covers the change.
- The unit tests run the compiled output in `out/`. Refresh it first, with an active watch task or `pnpm run build-fast --client-only`, then run `./scripts/test.sh --grep "Minimap|SectionHeaders|EditorLayoutProvider"`.
- Many minimap bugs depend on the pixel ratio. Reproduce at a fractional zoom (for example `window.zoomLevel: -1` on a Retina screen, a pixel ratio of 1.667) as well as at 1 and 2.
- Assert on numbers from the page, not on screenshots: the canvas `width`/`height` attributes against their CSS sizes, the slider's `top` while scrolling, pixel colors sampled from the canvas. Compare before and after pixel-for-pixel when a change shouldn't alter the output.
- In a UI scenario (the `validate-ui-scenario` skill), a synthetic `WheelEvent` doesn't scroll the editor. Use `page.mouse.wheel`, or keyboard scrolling, and check that `scrollTop` changed.
- For repaint performance, record a trace and compare paint rectangles and per-keystroke renderer time with main, not only the time spent in minimap code.
