# Full-width character centering (two-cell spans)

This PR introduces an optional rendering mode that forces full-width graphemes (e.g. many CJK characters) to occupy exactly **two monospace cells**, with the glyph visually centered in that fixed-width box.

The tests in `src/vs/editor/test/common/viewLayout/viewLineRenderer.test.ts` assert on the exact HTML and `CharacterMapping` produced by this mode so that cursor/selection geometry and wrapping calculations stay consistent with what is rendered.

## Why fixed-width spans (vs. letter spacing)

Using `letter-spacing` to “stretch” a run of full-width text makes the result dependent on font shaping and can drift from the editor’s monospace cell grid. The fixed-width approach instead:

- renders each full-width grapheme as its own inline element (`display: inline-block`)
- sets the box width to `2 * spaceWidth` (in pixels)
- uses `text-align: center` to center the glyph within that box

Because the width is derived from the already-measured `spaceWidth`, the resulting layout matches the grid used by cursor, selection, hit-testing, and wrapping.

## Grapheme clusters (don’t split code units)

Full-width “characters” are not always a single UTF-16 code unit. Combining marks, variation selectors, and surrogate pairs must stay attached to their base glyph. The renderer therefore iterates grapheme clusters (via `strings.GraphemeIterator`) and marks/splits full-width ranges at grapheme boundaries.

This is covered by the `keeps full-width grapheme clusters in one two-cell span` test (e.g. `擦\u0301`).

## Directionality (RTL / bidi)

Splitting a line into additional inline elements changes what the browser’s Unicode bidirectional algorithm sees as reordering units. For bidirectional input, per-grapheme boxes can cause unexpected visual reordering (e.g. the logical `擦字` being displayed as `字擦` in an RTL context).

To avoid that class of issues, the fixed-width path is only taken when the line content contains no RTL characters. If the line direction is explicitly RTL but the content is still LTR-only (e.g. CJK), the renderer wraps the output in `direction:ltr; unicode-bidi:isolate` to keep the grapheme boxes in logical order while still isolating the run from the surrounding RTL layout.

The corresponding expectations are exercised by:

- `does not force full-width characters on lines containing RTL text`
- `keeps two-cell spans in logical order on explicitly RTL lines`
