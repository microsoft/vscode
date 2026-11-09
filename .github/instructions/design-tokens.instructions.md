---
description: Semantic design-token usage and source-backed lookup for CSS sizing, spacing, typography, icons, strokes, and motion.
applyTo: src/vs/**/*.css
---

# Design-token usage in CSS

Choose the design role before the implementation value. Use the [design philosophy](../skills/design-philosophy/SKILL.md) to explain the intended hierarchy, relationship, or surface role; use the product registries to find its current token.

## Read definitions from their owners

[baseSizes.ts](../../src/vs/platform/theme/common/sizes/baseSizes.ts) owns the shared size, spacing, radius, typography, icon-size, and stroke registrations. [motionRegistry.ts](../../src/vs/platform/theme/common/motionRegistry.ts) and [motionRecipes.ts](../../src/vs/platform/theme/common/motion/motionRecipes.ts) own motion parameters and recipes.

Read current IDs, values, units, deprecation messages, and replacements from these sources. Do not infer a value from a token name or maintain another numeric table, token catalog, or alias map in instructions.

The [design-system book](../extensions/vscode-design-system/README.md) provides source-backed references and a [headless interface](../extensions/vscode-design-system/README.md#headless-access) for agents. A visible canvas is not required.

## Choose by role

Use the token variable for a design-system choice rather than substituting a literal merely because the values match. Reuse an existing component or shared style contract before choosing individual tokens. The existing spacing-literal allowance is described below.

Structural measurements are not automatically design tokens. Preserve intentional geometry, relative units, inherited values, expressions, and `!important` unless the requested change requires otherwise. Do not apply a blanket nearest-value conversion across unrelated CSS properties.

## Spacing

Use the current registered spacing ramp for padding, margins, gaps, and dedicated spacers. Prefer token variables; existing on-scale spacing literals remain valid when checked against the current registry.

When normalizing off-scale spacing, select the nearest registered step, rounding ties upward. Check each length in a shorthand independently. Do not round relative units, automatic sizing, or expressions as though they were absolute spacing values.

## Corner radius

Choose the radius by the surface's [elevation role](../skills/design-philosophy/SKILL.md#elevation-tiers), not by numeric proximity. Preserve fully rounded pills and circles rather than replacing them with the largest fixed-radius token.

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

Follow the [motion specification and authoring method](../../src/vs/platform/theme/common/motion/MOTION.md#authoring-and-validation). Choose by intent and reuse the owning component or recipe before composing properties. Keep state and focus immediate, honor effective reduced motion, and preserve theme-owned colors and anchor geometry.

Preserve shipped timing and curves when centralizing existing behavior. Compatibility parameters must not be snapped to the ordinary duration ramp.

## Register and validate variables

Follow the [CSS variable validator](../../build/lib/stylelint/validateVariableNames.ts) and its existing product-icon exemptions. Referenced variables must be recognized by [vscode-known-variables.json](../../build/lib/stylelint/vscode-known-variables.json); custom properties without a product registry belong in `others`.

After adding a size registration, use [the documentation tests](../../scripts/test-documentation.sh) to update the generated size-variable inventory. Review generated changes rather than maintaining a second list here.

## `.monaco-editor-background` must be opaque

`.monaco-editor-background` must use a fully opaque color. Monaco uses this layer to carve the reverse-rounded notches out of text selections; transparency can cause rendering artifacts and performance problems. To blend an embedded editor into its surface, keep `.monaco-editor` transparent and paint `.monaco-editor-background` with the container's solid background color.
