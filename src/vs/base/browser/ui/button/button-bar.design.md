---
title: "Button bar"
kind: "component"
isDraft: true
component:
  implementation: "src/vs/base/browser/ui/button/button.ts"
  api:
    - "ButtonBar.addButton"
    - "ButtonBar.addButtonWithDescription"
    - "ButtonBar.buttons"
    - "ButtonBar.clear"
  fixtures:
    - "baseUI/ButtonBar"
---

# ButtonBar

## Overview

A reusable group of related button actions.

## Usage

- Group choices that belong to the same decision.
- Keep primary and supporting actions distinguishable.
- Use the returned button interfaces rather than querying internal DOM.
- Use `clear()` to remove and dispose the current buttons before repopulating the group. Do not retain and reuse the cleared instances.

## Accessibility

- Give every button a meaningful label or accessible name.
- The group supports directional navigation between its buttons.

## Preview

Related button actions.
