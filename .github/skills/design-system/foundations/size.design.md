---
title: "Size"
kind: "foundation"
status: "stable"
order: 10
legacyPaths:
  - ".github/design-system/size.design.md"
  - "src/vs/platform/theme/common/sizes/size.design.md"
  - "src/vs/platform/theme/common/sizes/size.md"
---

# Size

## Introduction

Keep actions recognizable by choosing icon dimensions for their context while preserving usable targets. This topic covers shared glyph sizes, not component, pane, or text sizing.

## Choose a glyph size

Apply [Sameness signals sameness](principles.design.md#6-sameness-signals-sameness) by keeping equivalent icons at the same density. Reuse the component's existing icon and target treatment first.

| Context | Choice |
| --- | --- |
| Standalone action | 16px base icon size |
| Dense text or compact context | 12px compact size, with a matching compact glyph when available |

Glyph size is not a hit target. A smaller icon must not shrink its component's interactive area.

Compact CSS dimensions alone do not select the optically tuned glyph. Use the registered `*Compact` variant when available, and update any selectors that depend on the original glyph class. If no compact variant exists, retain the regular glyph at 12px. Follow [Codicon size guidance](../../../instructions/design-tokens.instructions.md#codicon-size) for dependent selectors.

## Size reference

The specimens resolve base and compact dimensions from [baseSizes.ts](../../../../src/vs/platform/theme/common/sizes/baseSizes.ts). Use [Codicon definitions](../../../../src/vs/base/common/codicons.ts) to check which compact variants exist.

## Build and review

- Equivalent actions use the same icon density.
- Compact contexts use a matching compact glyph when one exists.
- Labels remain readable beside the icon at zoom and narrow widths.
- Keyboard focus and the component's hit target remain intact.

Use [typography](typography.design.md) for text roles and [spacing](spacing.design.md) for intervals. Keep component dimensions with their owner rather than deriving them from glyph size. The [registered size values](../../../../src/vs/platform/theme/common/sizes/baseSizes.ts) remain authoritative.
