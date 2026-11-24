# Optional editor-view renderer

`@vscode/editor-view` is a **desktop distro dependency**, not an OSS dependency.
The editor builds without it. The host-owned subset of its API is declared in
[`editorViewTypes.ts`](./editorViewTypes.ts); keep it compatible with the version
installed by the distro.

Bracket-pair guides and view zones require a renderer exposing
`setBracketGuides` and `setVerticalLayout`; these APIs are not in the initial
npm `0.0.1` release. Use the updated local build during development and pin the
next published release in the distro to enable them.

## Distro setup

In `microsoft/vscode-distro` (checked out as `.build/distro` during product
builds), add the pinned runtime dependency to `npm/package.json`:

```json
"@vscode/editor-view": "0.0.1"
```

Then refresh that folder's `pnpm-lock.yaml` by running `pnpm install` in `npm/`.
`npm/` is a separate pnpm install root. Its `minimumReleaseAge` exempts
`@vscode/*`, so a new renderer release can be pinned right after it is
published. The package has no install scripts, so it needs no `allowBuilds`
entry, and it has no runtime dependencies.

During the build, the root `pnpm install` installs the distro roots. Then
`build/azure-pipelines/distro/mixin-npm.ts` copies each distro dependency,
following symlinks, into the root `node_modules/@vscode/editor-view`, and
production-dependency packaging picks that copy up. Ship all of `dist/` together: the JS entry point references its
hashed WASM asset relatively. Desktop packaging stores the JS in
`node_modules.asar` and unpacks WASM through the existing `**/*.wasm` rule.
No `product.json` opt-in flag or source `package.json` dependency is required.
This integration does not enable the renderer in standalone web/server builds.

## Availability and failure behavior

Desktop startup probes the application's `@vscode/editor-view/dist/index.js`
once, using ASAR-aware filesystem access and the same location as the runtime
loader. Both detection and loading use the environment service's `isBuilt`
state, not the presence of `product.commit`: custom packaged builds without
commit metadata still use ASAR, and development runs use `node_modules`.
The detected `hasEditorView` value is passed to renderer windows in
their product configuration **before** editor settings are registered:

- Present: `editor.experimentalGpuAcceleration` offers `off`, `on`, `editorView`.
- Absent: it offers only `off`, `on`; a saved `editorView` value validates to
  `off`. DOM text, carets, selections and overlays remain active. No import or
  WASM request is attempted.
- Import or initialization failure: report the error, remove `editorView` for
  that renderer window, and rebuild affected editors using the DOM renderer.
  User settings are not rewritten.
- Older renderer without `setBracketGuides`: ordinary GPU rendering still works
  with bracket guides disabled. Enabling bracket guides reports an unsupported
  package error and returns to DOM rendering instead of hiding the guides.
- Older renderer without `setVerticalLayout`: GPU rendering continues while the
  editor has no top padding or view zones. As soon as either is needed, it reports
  an unsupported package error and returns to DOM rendering instead of drawing
  lines in the wrong place.

The existing `on` renderer is independent of this package and is unchanged.
Availability is detected on application startup; restart after installing or
removing the optional package.

For local development, place the package at `node_modules/@vscode/editor-view`
without declaring it in `package.json` or `pnpm-lock.yaml`. pnpm does not remove
undeclared folders there, and the same startup detection applies. To use a
published release:

```sh
mkdir -p node_modules/@vscode/editor-view
npm pack @vscode/editor-view@0.0.1 --pack-destination /tmp
tar -xzf /tmp/vscode-editor-view-0.0.1.tgz -C node_modules/@vscode/editor-view --strip-components=1
```

To use a local renderer build, run `npm run build` in the package, then link it:
`ln -sfn /path/to/vscode-editor-view node_modules/@vscode/editor-view`.

## Document size

The adapter mirrors the complete view model; there is no renderer-specific
line-count cap. The mirror always has the view model's line count, but holds a
line's text and tokens only once the renderer paints, measures or minimaps it:
`EditorViewModelSync` turns edits into line splices by count and marks changed
lines stale, and the lines a renderer call reads are sent just before it.
Opening a document, a theme change or a view remap (folding, word wrap) sends
the visible lines rather than the document, and background tokenization of
lines never shown sends nothing. Decorations and folding controls are sent
only for the lines around the viewport (one renderer range of margin on each
side), and queried again when they change or scrolling leaves those lines, so
typing in a long document costs what it does in a short one. Large documents
remain subject to normal editor and available-memory limits, not silent
truncation.

## Glyph cache experiment

`editor.experimental.editorViewGlyphCache` (`characters` by default) is sent
as the renderer's `glyphCache` and applies as soon as it changes. ASCII text in
a verified monospace font (and line numbers) is drawn one character per cell
from rasters cached per character and subpixel position. `runs` brings back
one raster per token run, which other text always uses; it remains to compare
the two (rasterization while typing and scrolling, pixel fidelity to the DOM)
and goes away once per-character text has shipped.

## Incremental rendering

`editor.experimental.editorViewIncrementalRendering` (on by default) is sent as
the renderer's `incrementalRendering` and applies as soon as it changes. On
WebGPU, the editor, minimap, overview ruler and scrollbar surfaces keep their
pixels between frames and redraw only the horizontal bands whose content
changed: typing redraws a line or two, scrolling what scrolls into view, and
the minimap paints only the lines that changed. Turning it off redraws every
frame in full, which tells whether a wrong picture comes from it.

## Scrolling by compositor

`editor.experimental.editorViewOverscan` (on by default) makes the canvas draw
a quarter of the viewport's height above and below it. The canvas keeps its
place while the viewport stays within it and moves with a CSS transform as the
editor scrolls: a frame in which only the vertical scroll position changed
neither syncs the renderer nor draws, and the compositor moves the picture as
it moves DOM text. Once the viewport leaves
the canvas, the canvas moves to leave the whole margin ahead of the scroll and
draws only the rows new to it. It applies with WebGPU and incremental
rendering, with renderers that skip frames that change nothing
(`presentNextFrame`), and at any display scale with renderers that draw
content on the document's device pixels (`scrollAnchor`; older ones at
whole-number scales only). The canvas moves by the difference of the
renderer's anchors for the two scroll positions, whole device pixels, so the
picture is not resampled and shows what drawing it there would.
Decorations that change in place are still queried for the visible lines only,
the range whose cache the DOM overlays share; the lines drawn beyond the
viewport get theirs on the first frame that scrolls, before it shows them.

The minimap's canvas does the same under the same conditions, in its own rows:
it paints a quarter of the minimap's rows above and below them, and while the
minimap scrolls within them `Minimap` only moves the canvas, by whole rows,
which are whole device pixels. A clip ends at the minimap's last whole row, and
its border paints the partial row below in the minimap's background, as the
DOM minimap leaves it, so no row of the margin shows there. (At a fractional
scale, a DOM minimap on half a device pixel is resampled, and its last whole
row bleeds faintly into the partial row, where this shows the background.)
Lines and decorations that change in the margin repaint the canvas as they
change. A minimap as tall as the editor (`minimap.size` `fill`, or `fit` once
the document no longer fits) shows all its lines and does not scroll, so it
paints no margin.

## Guide ownership

The GPU owns both indentation and bracket-pair guides through the shared
`guides` capability. VS Code supplies visible/overscan per-view-line guide
descriptions, including active/inactive filtering and wrap remapping, and resolves
the theme palette using the same transparent-color fallbacks as the DOM overlay.
Rust owns endpoint measurement, vertical/horizontal stroke geometry, clipping
and indentation overlap suppression. Both horizontal guide modes and all
bracket-pair settings remain host-controlled. Cursor moves, model edits, theme
changes and scrolling update the next visible batch.

## View zones and padding

View zones (CodeLens, peek views, inline chat, diff spacers) and
`editor.padding.top` move lines away from `lineNumber × lineHeight`. Before each
frame the adapter compares `viewLayout.getWhitespaces()` and the top padding
with what it last sent, and sends any change through one `setVerticalLayout`
call. The renderer then places all GPU paint, and computes its visible lines,
with the same offsets as `LinesLayout`, matching VS Code's hit testing. Guide
batches use `getLinesViewportDataAtScrollTop`, so they cover the lines visible
around zones. Zone DOM in the content area and the margin sits above the canvas
(see "Layering").

## Layering

The canvas is the editor's bottom layer, in the place of the DOM text it
replaces. `View` mounts it first in the overflow guard. Once the renderer has
painted its first frame, the editor root gets the `editor-view-gpu` class, and
[`editorViewGpu.css`](./editorViewGpu.css) makes the DOM editor and gutter
backgrounds transparent. Until then the DOM backgrounds stay, so loading never
shows an unpainted editor. `View` owns the root's class name and rebuilds it on
focus, configuration and theme changes, so it takes the class from
`EditorViewGpu.editorClassName` instead of the adapter adding it once. With the
backgrounds transparent, every remaining DOM layer stacks above the GPU picture
as it would above DOM text:

- gutter: change bars and other line decorations, glyph-margin icons and
  widgets (breakpoints, lightbulbs), and line numbers with a
  `lineNumberClassName` decoration (coverage, agent feedback). The DOM
  `LineNumbersOverlay` renders only those decorated lines, and the GPU leaves
  their labels blank.
- content: view zones, non-overflowing content widgets, rulers, the
  unsupported-decoration fallback overlay, and the caret: the DOM
  `ViewCursors` draws it, as it blinks without presenting the canvas (the
  renderer can draw it too; see `EDITOR_VIEW_GPU_CAPABILITIES.cursor`).

Content widgets and carets get positions from the renderer through
`RenderingContext`,
because the DOM view lines hold no text in this mode. The one stacking
difference from DOM mode is that DOM layers drawn below text there (rulers,
fallback decorations) draw above the GPU text here.

## Line-dependent state

Some of a line's payload depends on more than its own content: gutter labels
(inserts and deletes renumber the lines below, relative and interval modes
follow the primary cursor, and `lineNumbers` can change), and text paint from
inline decorations and, in high-contrast themes, the selection. The adapter
records what it sent for each line, and before each frame it re-sends visible
lines whose label or text paint changed.

### Inline decorations

Inline decorations (`inlineClassName`) color text: bracket-pair colorization,
ghost text, inlay-hint labels and extension decorations. For lines in the
renderer's range, the adapter reads them as `ViewLine` does, including injected
text, and combines overlapping ones with `LineDecorationsNormalizer`. A hidden
probe span inside the editor root (`.view-line > span > span.mtk1 …`) asks the
browser for each class combination's computed style. Color applies only when
its rule wins over token colors, as in the DOM. Opacity (and
`visibility: hidden`), italic and bold become token overrides, applied by
splitting tokens at decoration edges. No renderer API is needed.

Decorations whose CSS the GPU cannot draw in place of DOM text are left out, so
their text keeps its token paint: backgrounds, borders, outlines, text
decorations, padding or margins, font size or family, letter spacing, other
font weights, `display` changes, shadows and filters, and `::before`/`::after`
content (including `beforeContentClassName`/`afterContentClassName`).
Width-only injected text is left out too. These need a DOM fallback for the
affected spans (planned).

High-contrast themes color selected text with `editor.selectionForeground`, as
`ViewLine` does with `inline-selected-text` spans. It is applied last, over
inline decorations.

## Minimap

The `Minimap` view part stays mounted and keeps its layout, slider, input,
autohide fades and section headers. On WebGPU it hands the rest of its paint to
`EditorViewGpu.minimapPainter`: characters, selections and decorations are drawn
by the renderer into a canvas that `Minimap` mounts in the slot of its 2D
character canvas, below the decorations canvas, which then draws only section
headers. The canvas is an auxiliary surface on the renderer's device, sharing
its pipelines and glyph atlas, and the renderer reads the lines it already
retains, so the minimap no longer rasterizes characters into `ImageData` on the
CPU. Characters use the token's own colors (`baseForeground`), not inline
decoration colors, as in the DOM minimap. The painter sends settings, the char
sheet and decorations only when they change and skips frames in which nothing
changed. On WebGL2, before the renderer paints, or when a surface fails, the 2D
canvases paint as before. One known difference: with a translucent
`minimap.background`, the DOM blends characters against that background over the
editor background, while the GPU blends them over the translucent background.

## Overview ruler

`DecorationsOverviewRuler` stays mounted and paints through
`EditorViewGpu.overviewRulerPainter` the same way. A sibling canvas with the
same class takes the place of its 2D canvas, and the renderer draws the marks,
cursors, background and border on an auxiliary surface. It places lines with the
vertical layout it already mirrors, including view zones and padding. Colors
resolve as a 2D canvas resolves `fillStyle`, so every CSS color syntax that
extensions use paints the same.

## Device loss

A GPU process restart, a driver update or a lost WebGL2 context takes the
renderer's device and all its textures with it. The package reports the loss
through `onRendererLost`. The adapter then leaves the ready state, so the DOM
backgrounds and the minimap's and overview ruler's 2D canvases show, and asks
the package to rebuild the renderer on the same canvas with `recoverRenderer`.
The document, decorations and measurements retained in WASM survive, and glyphs
re-rasterize into the new atlas on the first frame. Once that frame is drawn the
adapter is ready again and the parts attach their surfaces to the new device. If
no renderer can be created, for example when the browser has disabled WebGPU
after repeated GPU crashes or does not restore a WebGL2 context within five
seconds, the editor falls back to DOM rendering as after a failed start.

## Decoration probes in auxiliary windows

Decoration probe elements are created in the main-window DOM realm even when
the editor root has already been adopted into an auxiliary document. Probes are
temporarily attached to that root and read through its current owner window's
`getComputedStyle`, so they retain main-realm identity while using the editor's
actual stylesheet and theme.

## Validation

Run the detector tests in both Node and the Electron unit runner: Electron loads
ES modules through an import map, so Node-only validation can miss import errors.

```sh
pnpm run test-node -- --run src/vs/platform/product/test/node/editorView.test.ts
./scripts/test.sh --run src/vs/platform/product/test/node/editorView.test.ts
pnpm run monaco-compile-check
pnpm run gulp monacodts-check
pnpm run gulp editor-distro
```

Changes to editor options must also preserve the generated Monaco declaration
surface. The declaration generator processes modules in isolation: explicitly
type the availability singleton and keep implementation classes `@internal`.
After intentional API changes, regenerate with `pnpm run gulp monacodts`.
The distro build also tree-shakes class members. GPU hit-test implementations
must explicitly implement `IViewLineHitTestProvider` so its methods are retained.

`editorViewModelSync.test.ts` covers complete mirrors and incremental edits
past 20,000 and 100,000 lines. The package's DOM-vs-GPU compare suite additionally
checks visible text, EOL measurements, pointer hit testing, insert/delete and
undo/redo across the old boundary, and 12,000 model lines wrapping to 60,000
view lines (`npm run test:compare` in the package).
