---
title: "Select box"
kind: "component"
isDraft: true
id: "select"
aliases:
  - "select-box"
component:
  implementation: "src/vs/base/browser/ui/selectBox/selectBox.ts"
  api:
    - "ISelectBoxOptions.ariaLabel"
    - "ISelectBoxOptions.useCustomDrawn"
    - "ISelectBoxDelegate.setOptions"
    - "SelectBox.onDidSelect"
---

# SelectBox

## Overview

A single selection from a list of known options.

## Usage

- Use when the value must come from a known set; it is not editable text or a combobox.
- Supply option data and styles through the shared API.
- Uses a native picker on macOS by default and a custom list elsewhere.

## Accessibility

- Provide ariaLabel and meaningful option text.
- The native and custom delegates own keyboard selection. Preserve disabled options and do not replace selection with menu-action semantics.

## Preview

Enabled and disabled custom-drawn SelectBox instances.
