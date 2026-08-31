# Full-width character spacing

This note records the rendering problem behind `editor.forceFullwidthCharacterWidth`
and the decision to move from one representative full-width measurement to
grapheme-specific corrections.

## Goal

When the setting is enabled for a monospace editor font, every Unicode character
with East Asian Width `Wide` or `Fullwidth` should advance exactly two half-width
character cells:

```text
target advance = 2 * typicalHalfwidthCharacterWidth
```

This is an advance-width guarantee. It changes where the following character is
placed; it does not scale the glyph's ink.

## The configured font is not necessarily the rendered font

The editor applies a CSS `font-family` value or font-family list to a line. The
browser then selects an effective font for each grapheme. When the configured
font does not contain a glyph, the browser silently uses a fallback font.

One authored CSS run can therefore contain several effective font runs:

```text
A 中 国 あ 𠀀 B
│ │ │ │ │  │
│ │ │ │ │  └─ configured monospace font
│ │ │ │ └──── supplementary CJK fallback
│ │ │ └────── Japanese fallback
│ └─┴──────── Chinese fallback
└──────────── configured monospace font
```

The configured font being monospace does not guarantee that all fallback fonts
use the same metrics. Even if each fallback font is internally monospace, its
cell size can differ from the configured font's cell size.

For a half-width cell of 8 px, the browser might produce:

| Grapheme | Natural advance | Target advance | Required correction |
| --- | ---: | ---: | ---: |
| `中` | 14 px | 16 px | 2 px |
| `国` | 14 px | 16 px | 2 px |
| `あ` | 16 px | 16 px | 0 px |
| `𠀀` | 15 px | 16 px | 1 px |

## Why one line-wide correction is insufficient

The initial implementation measures one representative full-width character,
U+FF4D FULLWIDTH LATIN SMALL LETTER M (`ｍ`), and computes a single
`fullwidthLetterSpacing` value from it. Every full-width run on the line then
receives that value.

For example, if `ｍ` is 14 px wide and the target is 16 px, the line-wide
correction is 2 px. Applying that correction to the table above produces:

| Grapheme | Natural advance | Line-wide correction | Result |
| --- | ---: | ---: | ---: |
| `中` | 14 px | 2 px | 16 px |
| `国` | 14 px | 2 px | 16 px |
| `あ` | 16 px | 2 px | 18 px |
| `𠀀` | 15 px | 2 px | 17 px |

The representative measurement works only when all full-width graphemes resolve
to fonts with the same advance. Font fallback makes that assumption unreliable.

## Why effective font names cannot drive the solution

Browsers perform font fallback internally and do not expose which font face
rendered each grapheme. Script or Unicode-block detection is not a replacement:

- Two Han characters can resolve to different fonts because one font lacks one
  of the glyphs.
- Chinese and Japanese text can use different locale-dependent fallback fonts.
- Supplementary-plane CJK characters commonly need another fallback.
- Explicit editor font decorations can change the applicable font family, size,
  weight, or style within a line.

The implementation therefore cannot reliably identify effective font runs by
font name. It must observe the result that matters: each grapheme's natural
advance.

## Decision: measure full-width graphemes

The browser rendering path will determine each full-width grapheme's intrinsic
advance in its actual text style by measuring it with `letter-spacing: 0`. For
each grapheme:

```text
target advance = 2 * typicalHalfwidthCharacterWidth
span letter-spacing = target advance - intrinsic grapheme advance
```

The renderer always writes the resulting value, including `0px`. This is
necessary because an inline value must replace any inherited or class-specific
letter spacing for the final advance to be exact.

### Why the unit is a grapheme

JavaScript strings are indexed by UTF-16 code unit, but one visible character can
contain several code units:

- A supplementary-plane CJK character uses a surrogate pair.
- A base character can be followed by a variation selector.
- A visible character can contain combining marks or other continuations.

Measuring or correcting each code unit independently would double-count
surrogate pairs and could split a visible character. Grapheme iteration keeps
the base character and its continuations together.

The Unicode helpers in
[`strings.ts`](../../../base/common/strings.ts) remain responsible only for
classification and grapheme boundaries. They cannot perform font-aware
measurement because `vs/base/common` has no DOM or font environment.

## Group adjacent equal corrections into render runs

Correctness requires grapheme-specific measurements, but it does not require one
DOM span per grapheme. After calculating corrections, adjacent graphemes with the
same effective text style and correction can be grouped:

```text
Text:        A  中  国  あ  𠀀  B
Correction:  -  +2  +2   0  +1  -
Runs:        A | 中国 | あ | 𠀀 | B
```

The corresponding structure is conceptually:

```html
<span>A</span>
<span style="letter-spacing:2px">中国</span>
<span>あ</span>
<span style="letter-spacing:1px">𠀀</span>
<span>B</span>
```

Grouping is a DOM-size and rendering optimization. The measurements remain
grapheme-specific. Equal correction values do not prove that the browser used
the same font; they only prove that the graphemes can share the same rendering
adjustment.

## Rendering contract

[`RenderLineInput`](./viewLineRenderer.ts) no longer describes the whole line
with one `fullwidthLetterSpacing` scalar. It receives a provider that batches
missing measurements before the renderer creates corrected line parts:

```ts
interface IFullwidthLetterSpacingProvider {
	readonly generation: number;
	prepare(requests: readonly IFullwidthLetterSpacingRequest[]): void;
	getLetterSpacing(grapheme: string, className: string): number;
}
```

The request's class name contains the syntax-token and inline-decoration classes
that establish the grapheme's effective CSS text style. The renderer stores the
measured spacing on each resulting line part. A part never crosses an existing
token or decoration boundary.

## Consistency requirements

All editor systems that reason about horizontal advances must agree on the final
two-cell result:

- The DOM line renderer must apply the grapheme's measured correction.
- The DOM line-break computer must measure wrapping with those corrections.
- The monospace line-break computer can continue treating corrected full-width
  graphemes as two logical columns.
- GPU rendering must position the next glyph at the same two-cell target.
- Cursor mapping, selections, hit testing, rulers, sticky scroll, ghost text,
  accessible rendering, and diff view zones must use compatible advances.

The run representation does not necessarily need to cross every layer, but each
layer must implement the same final advance contract. Wrapping must never assume
two cells while final rendering produces a different width.

## Measurement and caching

Measuring every occurrence during every render would be too expensive. The
provider therefore collects every uncached grapheme/style pair for a line,
creates all probes, and then reads all widths in one batch. It never alternates
DOM writes and reads for individual graphemes. Results are cached by:

- Grapheme text.
- Font family or font-family list.
- Font size.
- Font weight and style.
- Font feature and variation settings.
- Editor letter spacing.
- Font-affecting token or decoration styles.

The cache is bounded. It is invalidated when fonts are remeasured and on theme
changes, and the provider generation participates in render-input equality so a
line cannot reuse stale HTML after invalidation. Device-pixel ratio affects GPU
coordinates, but DOM correction values remain in CSS pixels.

Measurements should preserve the grapheme's rendering context where shaping can
affect its advance. The initial scope remains non-RTL lines because splitting
bidirectional text into additional DOM spans can change bidi ordering, shaping,
and caret mapping.

## Rejected alternatives

### Keep one representative full-width measurement

Rejected because fallback fonts can have different advances within one line.

### Detect runs by Unicode script

Rejected because script does not determine the selected fallback font or its
metrics.

### Ask the browser for the selected font face

Not available through current browser text-layout APIs.

### Apply one fixed-width inline box to every full-width grapheme

This guarantees layout width but can clip or overlap glyph ink and changes the
existing text-flow and selection behavior more substantially than correcting
advance with `letter-spacing`.

## Validation scenarios

Tests should cover:

1. Adjacent Chinese graphemes requiring the same correction are grouped.
2. Chinese and Japanese graphemes requiring different corrections are split.
3. A supplementary-plane CJK grapheme is measured once, not once per surrogate.
4. A variation selector remains attached to its base grapheme.
5. Font-family, font-size, bold, and italic boundaries create separate
   measurement contexts.
6. Corrected text wraps at the same columns in both line-break strategies.
7. Cursor, selection, and hit-test positions agree with rendered advances.
8. Disabling the setting or using a proportional configured font preserves
   natural advances.
9. RTL-containing lines retain their existing safe behavior.
