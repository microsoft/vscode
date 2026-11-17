# MultiSelectDropdown

Usage and accessibility guidance for this component. The design-system reference checks API annotations against its implementation.

## Overview

An anchored, sectioned menu for selecting multiple values.

## Usage

- Use when several independent values may be selected.
- Selections are immediate; closing the menu does not roll them back.
- The caller owns the trigger and persists selection changes. A single-select dropdown is a different control.

## Accessibility

- Provide ariaLabel and meaningful section/item labels.
- The widget manages trigger expansion state; searchable and menu presentations use different selection semantics.

## Preview

A menu for selecting weekdays.
