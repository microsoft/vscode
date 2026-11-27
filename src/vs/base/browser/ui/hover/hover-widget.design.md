---
title: "Hover card"
kind: "component"
isDraft: true
id: "hover"
aliases:
  - "hover-widget"
component:
  implementation: "src/vs/base/browser/ui/hover/hoverWidget.ts"
  api:
    - "HoverWidget.constructor"
    - "HoverWidget.containerDomNode"
    - "HoverWidget.contentsDomNode"
    - "HoverWidget.onContentsChanged"
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
