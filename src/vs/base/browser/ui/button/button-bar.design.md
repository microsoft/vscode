---
title: "Button bar"
kind: "composite"
status: "draft"
legacyPaths:
  - "src/vs/base/browser/ui/button/button-bar-design.md"
---

# ButtonBar

## Overview

A reusable group of related button actions.

## Usage

- Group choices that belong to the same decision.
- Keep primary and supporting actions distinguishable.
- Use the returned button interfaces rather than querying internal DOM.
- Use `clear()` to remove and dispose the current buttons before repopulating the group.

## Accessibility

- Give every button a meaningful label or accessible name.
- The group supports directional navigation between its buttons.

## Preview

Related button actions.
