---
title: "Iconography"
kind: "foundation"
status: "stable"
order: 14
legacyPaths:
  - ".github/design-system/iconography.design.md"
  - "src/vs/base/common/iconography.design.md"
  - "src/vs/base/common/iconography.md"
---

# Iconography

Use an icon to help identify an action or state, not as decoration or a substitute for an accessible name. Glyph registrations and component behavior remain owned by code.

Sources: [Codicon definitions](../../../../src/vs/base/common/codicons.ts), [design-token CSS guidance](../../../instructions/design-tokens.instructions.md).

## Introduction

Use an icon with a clear meaning and an accessible name. Choose the base or compact glyph for its context, not an arbitrary size.

## Choose a recognizable symbol

Apply [The interface explains itself](principles.design.md#3-the-interface-explains-itself-plainly-and-kindly). Prefer a visible text label when a symbol is unfamiliar or its meaning depends on product-specific context. A lone icon is appropriate when its meaning is widely recognized or space is genuinely constrained.

Reuse established product icons for familiar actions and states. Do not select a glyph only because its silhouette or color looks suitable; confirm that people can predict the result.

## Pair icons with their context

Keep an icon visually associated with the text it qualifies. Avoid making a decorative glyph compete with a primary label or appear to be a separate action.

Use [size guidance](size.design.md) for base and compact glyphs. The glyph's visual size does not define the control's hit target.

## Preserve accessibility

- Give every actionable icon a programmatic accessible name through its owning control.
- Do not communicate status or category by icon alone; provide text or another perceivable indicator.
- Keep focus, hover, selection, and disabled states distinguishable from the icon's meaning.
- Verify contrast and meaning in light, dark, and high-contrast themes.

Use the owning component's accessible-name and interaction contract. See [accessibility](accessibility.design.md) for keyboard and assistive-technology requirements.

## Build and review

- A person can identify the action or state without guessing.
- Related icons remain aligned and consistently sized within their context.
- Labels remain readable at narrow widths, and icon-only controls retain accessible names.
- State and meaning remain clear with theme changes and without color alone.

Check the icon in its real component, including keyboard focus and the surrounding label.
