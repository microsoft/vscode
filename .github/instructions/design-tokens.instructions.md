---
description: Use VS Code's registered --vscode-* CSS variables for shared size and color choices. Covers token lookup, usage, and validation when editing CSS.
applyTo: src/vs/**/*.css
---

# Design-token usage in CSS

In these CSS instructions, **design tokens are the `--vscode-*` CSS custom properties generated from VS Code's registered design values**, such as `--vscode-spacing-size80` and `--vscode-editor-background`. Use them through `var(...)`. A local custom property or a literal measurement is not automatically a design token.

The registrations also have programmatic identifiers; CSS is not their only consumer. For example, the color ID `editor.background` becomes `--vscode-editor-background`, while TypeScript can use the registered ID through the theme service. See the [theming skill](../skills/ux-theming/SKILL.md#3-using-colors-in-css) for that mapping. Do not assume a separate primitive/semantic/component token hierarchy or copy names from another design system.

Choose the design role before the implementation value. Use the [design principles](../skills/design-system/foundations/principles.design.md) to explain the intended hierarchy, relationship, or surface role; use the product registries to find its current token.

## Read definitions from their owners

[baseSizes.ts](../../src/vs/platform/theme/common/sizes/baseSizes.ts) owns the shared size, spacing, radius, typography, icon-size, and stroke registrations. [agentsSizes.ts](../../src/vs/workbench/common/agentsSizes.ts) owns Agents-specific size registrations and deprecated aliases. [colorRegistry.ts](../../src/vs/platform/theme/common/colorRegistry.ts) exposes the registered theme colors.

Read current IDs, values, units, deprecation messages, and replacements from these sources. Do not infer a value from a token name or maintain another numeric table, token catalog, or alias map in instructions.

The [design-system guidance](../skills/design-system/SKILL.md) provides source-backed references as ordinary Markdown. External viewers can render that content, but are not needed for CSS work.

## Choose by role

Use the token variable for a design-system choice rather than substituting a literal merely because the values match. Reuse an existing component or shared style contract before choosing individual tokens. The existing spacing-literal allowance is described below.

Structural measurements are not automatically design tokens. Preserve intentional geometry, relative units, inherited values, expressions, and `!important` unless the requested change requires otherwise. Do not apply a blanket nearest-value conversion across unrelated CSS properties.

## Spacing

Use the current registered spacing ramp for padding, margins, gaps, and dedicated spacers. Prefer token variables; existing on-scale spacing literals remain valid when checked against the current registry.

When normalizing off-scale spacing, select the nearest registered step, rounding ties upward. Check each length in a shorthand independently. Do not round relative units, automatic sizing, or expressions as though they were absolute spacing values.

## Corner radius

Choose the radius by the surface's [role](../skills/design-system/foundations/shape.design.md#round-by-surface-role), not by numeric proximity. Preserve fully rounded pills and circles rather than replacing them with the largest fixed-radius token.

## Font size

Choose a shared UI type role according to its place in the hierarchy. Pair the size with the appropriate registered weight. Strong emphasis reuses the same size role; it is not a separate size token.

Editor font configuration is distinct from the UI type ramp.

## Font weight

Use the registered UI weights for ordinary text and headings or strong emphasis. Do not introduce intermediate or heavier weights outside that ramp. Preserve inherited and relative weight expressions unless their behavior is intentionally being changed.

## Deprecated aliases

Follow the replacement declared by the owning registration rather than a copied migration table. Avoid deprecated aliases in new code; preserve compatibility where existing consumers still require it.

## Codicon size

Choose the registered base or compact size by the icon's density and role. When using the compact size, use the matching compact glyph if one is registered; CSS scaling alone does not select it.

Check the current [Codicon definitions](../../src/vs/base/common/codicons.ts) instead of maintaining a list of glyph exceptions. If no compact variant exists, retain the regular glyph at the compact size. When changing a glyph, also check selectors targeting its original class and keep them consistent.

## Stroke

Use the registered base stroke for standard borders and separators. Preserve stronger focus, contrast, and other semantic strokes; do not normalize them to the ordinary boundary stroke.

## Motion

Follow the [motion guidance](../skills/design-system/foundations/motion.design.md#build-and-review). Choose by intent and reuse the owning component's animation before composing properties. Keep state and focus immediate, honor the effective reduced-motion setting, including in JavaScript-driven effects, and preserve theme-owned colors and anchor geometry.

Preserve the timing and curves an existing component already ships rather than retiming it to match another.

## Register and validate variables

Follow the [CSS variable validator](../../build/lib/stylelint/validateVariableNames.ts) and its existing product-icon exemptions. Referenced variables must be recognized by [vscode-known-variables.json](../../build/lib/stylelint/vscode-known-variables.json); custom properties without a product registry belong in `others`.

After adding a size registration, use [the documentation tests](../../scripts/test-documentation.sh) to update the generated size-variable inventory. Review generated changes rather than maintaining a second list here.

At a supported standalone or fixture boundary where size tokens may be absent, provide valid length fallbacks for required padding, insets, radii, and outlines. A `var()` fallback handles an unavailable custom property, not a defined value of the wrong type or a unitless length. Follow the host contract rather than adding speculative fallbacks to every token.

## `.monaco-editor-background` must be opaque

`.monaco-editor-background` must use a fully opaque color. Monaco uses this layer to carve the reverse-rounded notches out of text selections; transparency can cause rendering artifacts and performance problems. To blend an embedded editor into its surface, keep `.monaco-editor` transparent and paint `.monaco-editor-background` with the container's solid background color.
