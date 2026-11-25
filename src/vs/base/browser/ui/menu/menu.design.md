---
title: "Menu"
kind: "component"
isDraft: true
aliases:
  - "menu-item"
  - "menu-section-title"
component:
  implementation: "src/vs/base/browser/ui/menu/menu.ts"
  relatedSources:
    - "src/vs/base/browser/ui/dropdown/dropdown.ts"
  api:
    - "IMenuOptions.ariaLabel"
    - "IMenuOptions.enableMnemonics"
    - "IMenuOptions.getKeyBinding"
    - "Menu.constructor"
---

# Menu

## Overview

An action-menu surface with shared selection and submenu behavior.

## Usage

- Use context menu or workbench menu services for normal product integration.
- Supply actions and shared Separator objects.

## Accessibility

- Provide ariaLabel and meaningful action names.
- Preserve the owning service’s focus, keyboard navigation, disabled states, and Escape-to-dismiss behavior.

## Preview

Interactive menu example not yet available.
