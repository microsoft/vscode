---
title: "Hover card"
kind: "composite"
status: "draft"
legacyPaths:
  - "src/vs/base/browser/ui/hover/hover-design.md"
  - "src/vs/base/browser/ui/hover/hover.design.md"
---

# HoverWidget

## Overview

A tooltip surface for supplemental information.

## Usage

- Use IHoverService for hover timing, anchoring, and dismissal.
- Keep supplemental information brief; essential instructions must remain visible elsewhere.
- When changing the surface contents directly, call `onContentsChanged()` so scroll geometry is recalculated.

## Accessibility

- Do not make essential information available only on pointer hover.
- The service integration must support keyboard access and dismissal; the shell alone does not provide that contract.

## Preview

Interactive hover example not yet available.
