---
title: "Toolbar"
kind: "composite"
status: "draft"
legacyPaths:
  - "src/vs/base/browser/ui/actionbar/action-bar-design.md"
---

# ActionBar

## Overview

Groups actions with shared keyboard navigation and optional overflow.

## Usage

- Use the shared action model rather than separate ad-hoc click handlers.
- Choose orientation to match the surrounding layout.
- Prefer workbench toolbar integrations when actions are contributed through menus.
- ActionBar owns basic action navigation. ToolBar composes it with secondary actions and responsive overflow.
- Choose `focusOnlyEnabledItems` deliberately; it controls whether keyboard navigation may focus unavailable actions.

## Accessibility

- Give the action group an ariaLabel.
- Keep action names meaningful and let the container own its keyboard navigation.

## Preview

Related actions in an action bar.
