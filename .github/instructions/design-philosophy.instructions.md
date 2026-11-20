---
description: VS Code design philosophy — reason about visual surfaces through shared values, principles, and moves rather than isolated pixel adjustments.
applyTo: "src/vs/**/browser/**/*.{ts,css}"
---

# Design philosophy

When creating, editing, or reviewing a visual surface, reason in design terms rather than pixels. Name the intended feeling, identify the principle it breaks, then choose the move that restores it. Use a named token when one expresses the role; retain intentional structural measurements and component-owned geometry.

The [design philosophy specification](../skills/design-system/foundations/principles.design.md) owns the shared values, principles, and examples. [Design-token instructions](./design-tokens.instructions.md) own CSS variable usage and validation.

For shadows, popup chains, modal decisions, and paint order, follow the [elevation foundation](../skills/design-system/foundations/elevation.design.md). Visual lift, stacking, and modality are separate contracts.
