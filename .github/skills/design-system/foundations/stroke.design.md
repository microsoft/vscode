---
title: "Stroke"
kind: "foundation"
isDraft: true
order: 12
presentation: "foundations"
tokenDomain: true
---

# Stroke

Use the standard stroke for ordinary boundaries and separators. Product registrations own its current value and color.

Sources: [baseSizes.ts](../../../../src/vs/platform/theme/common/sizes/baseSizes.ts), [design-token CSS guidance](../../../instructions/design-tokens.instructions.md).

## Introduction

Use a stroke to separate or define a boundary. Stroke thickness, control dimensions, and scrollbar width are different decisions.

<a id="stroke-usage"></a>
<a id="stroke-guidance"></a>
## Use strokes to define boundaries

Use the registered base stroke for standard dividers and control boundaries. Preserve stronger focus and contrast indicators where required.

<a id="stroke-reference"></a>
## Stroke reference

The standard boundary uses the 1px `--vscode-strokeThickness` token. Prefer the registered variable in CSS when the host supplies it.

This is not a universal maximum. Focus indicators, semantic alerts, and high-contrast boundaries may need stronger treatment. Keep scrollbar dimensions and control hit areas separate from border thickness.

Avoid adding a second border to compensate for a missing boundary, and don't assume both neighbors draw one: when neighboring surfaces omit the same edge, the boundary disappears instead. Identify the component that owns the visible edge and align adjacent surfaces with it. See [rounded-surface geometry](../../ux-css-layout/SKILL.md#rounded-surface-geometry) for double-painted edges, clipping, ownership, and alignment.

## Build and review

- Ordinary dividers and boundaries use the shared stroke.
- Focus and semantic indicators remain sufficiently visible.
- Adjacent elements do not double-paint or obscure the intended edge.
- High-contrast mode retains a clear boundary without relying on shadow.

Check the painted result in the owning component and its surrounding surface.
