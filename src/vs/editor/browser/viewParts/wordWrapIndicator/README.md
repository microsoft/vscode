# Word wrap indicator

Renders a small `↩` glyph (U+21A9, LEFTWARDS ARROW WITH HOOK) at the end of every view line that
is soft wrapped, so that a wrapped line can be told apart from a real line break. Addresses
[#47855](https://github.com/microsoft/vscode/issues/47855).

Off by default. Set `editor.wordWrapIndicator` to `"end"` to turn it on; it only has an effect
while `editor.wordWrap` is enabled.

## How it works

`WordWrapIndicatorOverlay` is a `DynamicViewOverlay`, registered on `contentViewOverlays` in
[`view.ts`](../../view.ts) next to `WhitespaceOverlay`, which it is modelled on.

A `DynamicViewOverlay` participates in the view's two-phase render:

1. **`prepareRender(ctx)`** — the read phase. It may measure the DOM, so this is where all the
   positioning happens. The overlay walks the viewport line by line and builds an HTML string per
   line into `_renderResult`.
2. **`render(startLineNumber, lineNumber)`** — the write phase. No measuring allowed; it just hands
   back the string computed in step 1. `ContentViewOverlays` concatenates the output of every
   overlay for a line into a single `ViewOverlayLine` div.

Content overlays paint underneath `.view-lines` and live inside `_linesContent`, so they scroll
horizontally with the text. That means positions handed to them are content-relative, not
viewport-relative — see [Right edge](#right-edge) below.

### Deciding which lines get an indicator

`ViewLineRenderingData.continuesWithWrappedLine` is exactly the question being asked: it is `true`
when the next view line is a continuation of the same model line. No wrap mapping has to be
recomputed here.

Two lines are skipped:

- lines where `continuesWithWrappedLine` is `false` — a real line break, or the last line of the
  model;
- lines whose `textDirection` is `TextDirection.RTL` — see [Limitations](#limitations).

### Positioning

```ts
const visibleRange = ctx.visibleRangeForPosition(new Position(lineNumber, lineData.maxColumn));
```

`maxColumn` is the column just past the last character, so `visibleRange.left` is the x offset where
the text ends. The glyph is emitted as an absolutely positioned div at that offset, with the line's
height from `ctx.getLineHeightForLineNumber(lineNumber)` so it lines up under variable line heights.

`visibleRangeForPosition` returns `null` when the line is not currently rendered, in which case the
line contributes an empty string.

### Cheap early-out

`WordWrapIndicatorOptions` caches `wrappingInfo.wrappingColumn !== -1` as `isWrapping`.
`wrappingColumn === -1` means wrapping is off, so when the feature is disabled or wrapping is off
`prepareRender` clears `_renderResult` and returns without a single `getViewLineRenderingData` call.

### Invalidation

`shouldRender` is ORed across all overlays, so returning `true` from a handler here only forces this
overlay's `prepareRender` to rerun. Two handlers are worth calling out, because `WhitespaceOverlay`
does not have them and the same gaps would apply to it:

| Handler | Returns | Why |
| --- | --- | --- |
| `onLineMappingChanged` | `true` | The wrap mapping is what decides `continuesWithWrappedLine`. `ViewModelImpl` emits this event without a companion `ViewFlushedEvent`, so nothing else would invalidate us. |
| `onTokensChanged` | `true` | Bold and italic token styles change the measured advance width of a line, which moves the x position the glyph is pinned to. |
| `onScrollChanged` | `e.scrollTopChanged` | Vertical scrolling changes which lines are in the viewport. Horizontal scrolling does not, and the glyph's position is content-relative, so it does not need a rerender. |
| `onConfigurationChanged` | `layoutInfo` changed | When the cached options are unchanged, a layout change can still move the wrap column and therefore the line ends. |

## Settings and theming

| Id | Kind | Notes |
| --- | --- | --- |
| `editor.wordWrapIndicator` | Setting, `"none"` \| `"end"` | Registered as an `EditorStringEnumOption` in `editorOptions.ts`. Editor options are contributed to the settings schema automatically by `editorConfigurationSchema.ts`, so no separate registration is needed. |
| `editorWordWrapIndicator.foreground` | Color | Registered in `editorColorRegistry.ts`, defaults to `editorWhitespace.foreground`. `registerColor` generates the `--vscode-editorWordWrapIndicator-foreground` CSS variable, so `wordWrapIndicator.css` needs no theming participant. |

Adding a color also means adding its variable to `build/lib/stylelint/vscode-known-variables.json`,
otherwise the hygiene pre-commit hook rejects the CSS.

## Limitations

Deliberately not handled, to keep the change small:

- **RTL lines get no indicator.** The glyph points the wrong way and would need to be anchored to the
  line's left edge instead. Skipping is silent; rendering it naively is visibly wrong.
- <a id="right-edge"></a>**No right-edge clamp.** A viewport-relative clamp would be wrong once the
  view is scrolled horizontally, since the overlay scrolls with the content. Wrapping reserves
  `verticalScrollbarWidth + 2`px of slack past the wrap column, so the glyph fits in the default
  configuration; with a hidden vertical scrollbar and an unbreakable token wider than the wrap
  column it can clip, or sit off screen until scrolled to.
- **No sticky scroll, diff view or GPU view lines parity.** Each renders lines through a separate
  path that does not run content overlays.
- **No minimap or overview ruler representation.**
- **The glyph is fixed**, and there is no `"start"` variant that would mark the continuation line
  rather than the wrapped one.
