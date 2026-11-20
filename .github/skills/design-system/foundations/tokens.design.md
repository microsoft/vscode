---
title: "Design tokens"
kind: "foundation"
status: "stable"
order: 4
aliases:
  - "token lookup"
legacyPaths:
  - ".github/design-system/tokens.design.md"
  - "src/vs/platform/theme/common/design-tokens.md"
  - "src/vs/platform/theme/common/token-domains.md"
---

# Design tokens

Use a named token when it expresses the intended role. Registrations own identifiers and values; this guide routes design decisions to their shared foundation.

Sources: [baseSizes.ts](../../../../src/vs/platform/theme/common/sizes/baseSizes.ts), [design-token CSS guidance](../../../instructions/design-tokens.instructions.md).

## Introduction

Design tokens provide shared names for visual roles and choices. Read the relevant foundation before changing a value; do not infer a new contract from a matching number or current rendered color.

## Find the owning foundation

| Decision | Guidance owner |
| --- | --- |
| Spacing and gaps | [Spacing](spacing.design.md) |
| Surface family and corner shape | [Shape](shape.design.md) and [Elevation](elevation.design.md) |
| Text hierarchy and emphasis | [Typography](typography.design.md) |
| Component and icon sizing | [Size](size.design.md) and [Iconography](iconography.design.md) |
| Standard boundaries | [Stroke](stroke.design.md) |
| Color roles and compatibility | [Colors](colors.design.md) and [Theming](theming.design.md) |
| Motion parameters and behaviors | [Motion](motion.design.md) |
| Scoped layout decisions | [Layout](layout.design.md) |

These summaries route to the owning guidance; they do not register tokens or replace the source documents. Use product registrations for current identifiers, values, units, deprecation messages, and replacements.

## Keep token scope deliberate

Only explicitly registered, scoped layout decisions are tokens; ordinary component dimensions remain local implementation details. Deprecated aliases exist for existing code, but new or changed code should use their registered replacements.
