---
title: "Shape"
kind: "foundation"
status: "stable"
order: 11
legacyPaths:
  - ".github/design-system/shape.design.md"
  - "src/vs/platform/theme/common/sizes/shape.design.md"
  - "src/vs/platform/theme/common/sizes/shape.md"
---

# Shape

Choose corner geometry by surface role and the behavior of the owning component. Registered values belong to [baseSizes.ts](../../../../src/vs/platform/theme/common/sizes/baseSizes.ts).

Sources: [baseSizes.ts](../../../../src/vs/platform/theme/common/sizes/baseSizes.ts), [design-token CSS guidance](../../../instructions/design-tokens.instructions.md).

## Introduction

Choose roundness by the surface role: controls, inner containers, and floating overlays. Equivalent roles should use equivalent corners.

## Round by surface role

Apply [Room to breathe](principles.design.md#2-room-to-breathe) and [Elevation is encoded](principles.design.md#5-elevation-is-encoded-not-eyeballed): use control geometry for buttons and inputs, inner geometry for nested containers, and outer geometry for floating surfaces.

Choose by surface family, not nesting depth or a numeric comparison. A control inside a large panel remains a control; a child surface does not automatically inherit the container's corner.

## Corner scale

Use the registered shape that fits the component's role. A pill or circular marker is fully rounded; do not approximate it with the largest fixed-radius value.

Treat registered values as defaults, not permission to restyle every existing surface. Quick Input, custom dialogs, workbench hovers, notification containers, and native windows retain their component-owned geometry.

## Preserve component-owned geometry

When a panel or window exposes a semantic radius customization, its frame and dependent paint use the resolved value, including zero. Keep native-window radii, panel preferences, and generic control or overlay tiers separate.

Trace which layer owns the visible perimeter before changing a radius. A child corner can be clipped by an ancestor or obscured by surface paint; changing the numeric value alone may not fix it. See [rounded-surface geometry](../../ux-css-layout/SKILL.md#rounded-surface-geometry) for clipping, paint, and overlay constraints.

## Build and review

- Equivalent surface roles use equivalent geometry.
- Pills remain fully rounded, and controls retain usable targets.
- Component and native-window customizations remain effective.
- Nested paint and clipping preserve the intended visible perimeter.

Check exposed corners in the rendered component, including high-contrast and customized states. Use [elevation](elevation.design.md) for surface ownership and overlay behavior.
