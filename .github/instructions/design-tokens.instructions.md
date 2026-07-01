---
description: Design-system size tokens (spacing, corner radius, font size, codicon size, stroke). Use when writing or editing CSS to size, space, or round UI — prefer the `--vscode-*` token vars over hardcoded px values.
applyTo: src/vs/**/*.css
---

# Design tokens for sizing, spacing & radii

VS Code ships a design-system **size** ramp. These tokens are registered in
[baseSizes.ts](../../src/vs/platform/theme/common/sizes/baseSizes.ts) (and the
agents font ramp in [sizes.ts](../../src/vs/sessions/common/sizes.ts)) and are
emitted as `--vscode-*` CSS variables. **When generating or editing CSS, use the
token variable instead of a raw `px` value** wherever a token exists for that
value. This keeps new UI visually consistent with the design system.

> Every `--vscode-*` size var you reference must already exist in
> [vscode-known-variables.json](../../build/lib/stylelint/vscode-known-variables.json)
> (`"sizes"` array, alphabetically sorted) or stylelint/hygiene fails. Adding a
> *new* token means adding it both in `baseSizes.ts` and that JSON file.

## Spacing — padding, margin, gap

Use for `padding`, `margin`, `gap`, and fixed `width`/`height` of spacers.
The numeric token name is the value in tenths of a px (`size200` = 20px).

| px | Variable |
|----|----------|
| 0  | `--vscode-spacing-sizeNone` |
| 2  | `--vscode-spacing-size20` |
| 4  | `--vscode-spacing-size40` |
| 6  | `--vscode-spacing-size60` |
| 8  | `--vscode-spacing-size80` |
| 10 | `--vscode-spacing-size100` |
| 12 | `--vscode-spacing-size120` |
| 16 | `--vscode-spacing-size160` |
| 20 | `--vscode-spacing-size200` |
| 24 | `--vscode-spacing-size240` |
| 28 | `--vscode-spacing-size280` |
| 32 | `--vscode-spacing-size320` |
| 36 | `--vscode-spacing-size360` |
| 40 | `--vscode-spacing-size400` |

```css
/* token   */          padding: var(--vscode-spacing-size80) var(--vscode-spacing-size120);
/* also ok */          padding: 8px 12px;   /* on-scale raw px is fine */
/* avoid   */          padding: 5px 7px;    /* off-scale - breaks rhythm */
```

**What matters is the value, not the token.** Adopting the `var()` is optional —
a raw px value is fine **as long as it lands on the scale** (0, 2, 4, 6, 8, 10,
12, 16, 20, 24, 28, 32, 36, 40). What breaks visual rhythm is an **off-scale**
value (3, 5, 7, 14, 26px…). Snap those to the nearest scale value (ties round
**up**), e.g. `5px → 6px`, `3px → 4px`, `1px → 2px`, `26px → 28px`. Each length
of a shorthand is checked independently (`0 5px → 0 6px`). `auto`, `%`,
`em`/`rem`, and any `var()`/`calc()` expression are left untouched.

## Corner radius — `border-radius`

| px | Variable | Use |
|----|----------|-----|
| 2  | `--vscode-cornerRadius-xSmall` | very compact elements |
| 4  | `--vscode-cornerRadius-small` | controls (buttons, inputs) |
| 6  | `--vscode-cornerRadius-medium` | base / inner surfaces |
| 8  | `--vscode-cornerRadius-large` | prominent / outer surfaces |
| 12 | `--vscode-cornerRadius-xLarge` | very prominent surfaces |
| 9999 | `--vscode-cornerRadius-circle` | fully rounded (pills, dots) |

**Snap map** for off-scale literals (ties round **up**):
`2→xSmall`, `3,4→small`, `5,6→medium`, `7,8→large`, `10,11,12→xLarge`,
`14,16,18,20→xLarge`, `999→circle`.

- **Pills** (radius ≈ half the element height, e.g. `28h`/`14r`, `36h`/`18r`,
  `22×22`/`11r`) → `--vscode-cornerRadius-circle`, **not** xLarge. The
  literal-nearest token would square them and lose the fully-rounded intent.
- **Leave untouched:** `50%`, `0`, `0px`, `inherit`, and any `calc()`/`var()`
  expression. Preserve `!important`.

## Font size — `font-size`

Generic UI chrome (fixed px):

| px | Variable |
|----|----------|
| 13 | `--vscode-bodyFontSize` (base) |
| 12 | `--vscode-bodyFontSize-small` |
| 11 | `--vscode-bodyFontSize-xSmall` |

Agents window ramp (`src/vs/sessions/**`) — pair size with a weight token,
**never** add a separate "strong" size:

| px | Size var | Weight |
|----|----------|--------|
| 26 | `--vscode-agents-fontSize-heading1` | semiBold |
| 18 | `--vscode-agents-fontSize-heading2` | semiBold |
| 13 | `--vscode-agents-fontSize-heading3` | semiBold |
| 13 | `--vscode-agents-fontSize-body1` | regular |
| 11 | `--vscode-agents-fontSize-body2` | regular |
| 12 | `--vscode-agents-fontSize-label1` | regular |
| 11 | `--vscode-agents-fontSize-label2` | regular |
| 10 | `--vscode-agents-fontSize-label3` | regular |

Weights: `--vscode-agents-fontWeight-regular` (400),
`--vscode-agents-fontWeight-semiBold` (600). The ramp is **400/600 only** — there
is no medium (500). "Strong" = same size token + `semiBold`. See
[Font weight](#font-weight--font-weight) below.

## Font weight — `font-weight`

The agents window uses a **two-weight ramp** — there are no other weights.
Pair every text style with one of these:

| weight | Variable | Use |
|--------|----------|-----|
| 400 | `--vscode-agents-fontWeight-regular` | body, labels, metadata |
| 600 | `--vscode-agents-fontWeight-semiBold` | headings, "strong" emphasis |

- **No medium (500).** `font-weight: 500` is **off the ramp** — snap it to
  `semiBold` (600). The same goes for `700`/`bold` and any other numeric weight:
  round to the nearer of 400/600.
- **"Strong" is not a separate size.** A "Body 1 Strong" / "Label 2 Strong"
  style reuses the matching `--vscode-agents-fontSize-*` token paired with
  `semiBold`. Never introduce a separate strong *size* token.
- `normal` ≡ 400 → `regular`. **Leave untouched:** `inherit`, `lighter`,
  `bolder`, and any `var()`/`calc()` expression. Preserve `!important`.

```css
/* avoid */            font-weight: 500;   /* not on the 400/600 ramp */
/* prefer */           font-weight: var(--vscode-agents-fontWeight-semiBold);
```

## Codicon size — icon `font-size`

Codicons are **only ever 16px or 12px**. There is no in-between size — never use
`14px` (or any other value) for a codicon. Pick the base or the compact token:

| px | Variable | Use |
|----|----------|-----|
| 16 | `--vscode-codiconFontSize` (base) | default icon size |
| 12 | `--vscode-codiconFontSize-compact` | dense/inline chrome |

If a design or existing CSS sizes a codicon at 14px, treat it as a bug: snap it to
16 (default) or 12 (compact) and flag it.

When sizing an icon at the **compact** 12px size, also swap the registered glyph
to its `*Compact` variant (e.g. `Codicon.close` → `Codicon.closeCompact`) so the
icon is visually optimized for the small size. CSS `font-size` alone only scales
the icon — it does not change to the compact glyph. Only swap the glyph when no
CSS selector targets the original glyph class (e.g. `.codicon-close`), otherwise
update that selector too. Some icons (settings/sliders, agent, vm, info, lock,
plus) have no compact variant — keep the regular glyph at the compact size.

## Stroke — border width

The design system has a **single** stroke thickness: 1px. Any `border`/`outline`
width of 1px should use the token.

| px | Variable |
|----|----------|
| 1  | `--vscode-strokeThickness` |

```css
/* prefer */           border: var(--vscode-strokeThickness) solid var(--vscode-widget-border);
/* avoid  */           border: 1px solid var(--vscode-widget-border);
```

Applies to the `border: 1px solid <color>` shorthand and `border-width: 1px`.
Other widths have no token — leave them as-is.

## `.monaco-editor-background` must be opaque

`.monaco-editor-background` must use a fully opaque color — making it
`transparent` (or any partial alpha) is forbidden. Monaco reuses this layer to
carve the reverse-rounded notches out of text selections, so a non-opaque
background introduces subtle rendering bugs (blocky selection corners) and
performance problems. To blend an embedded editor into its surface, keep
`.monaco-editor` transparent and paint `.monaco-editor-background` with the
container's solid background color.
