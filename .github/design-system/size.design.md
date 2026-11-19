# Size

## Introduction

Keep actions recognizable by choosing icon dimensions for their context while preserving usable targets. This topic covers shared glyph sizes, not component, pane, or text sizing.

## Choose a glyph size

Apply [Sameness signals sameness](../skills/design-philosophy/SKILL.md#6-sameness-signals-sameness) by keeping equivalent icons at the same density. Reuse the component's existing icon and target treatment first.

| Context | Choice |
| --- | --- |
| Standalone action | Registered base icon size |
| Dense text or compact context | Registered compact size, with a matching compact glyph when available |

Glyph size is not a hit target. A smaller icon must not shrink its component's interactive area.

Compact CSS dimensions alone do not select the optically tuned glyph. Follow [Codicon size guidance](../instructions/design-tokens.instructions.md#codicon-size) for glyph selection and dependent selectors.

## Size reference

The specimens resolve base and compact dimensions from [baseSizes.ts](../../src/vs/platform/theme/common/sizes/baseSizes.ts). Use [Codicon definitions](../../src/vs/base/common/codicons.ts) to check which compact variants exist.

## Build and review

- Equivalent actions use the same icon density.
- Compact contexts use a matching compact glyph when one exists.
- Labels remain readable beside the icon at zoom and narrow widths.
- Keyboard focus and the component's hit target remain intact.

Use [typography](./typography.design.md) for text roles and [spacing](./spacing.design.md) for intervals. Keep component dimensions with their owner rather than deriving them from glyph size.
