# InputBox

Usage and accessibility guidance for this component. The design-system reference checks API annotations against its implementation.

## Overview

Text entry with validation, optional actions, multiline sizing, and history variants.

## Usage

- Use a visible label that explains what to enter; a placeholder is not a replacement for a label.
- Use validation to explain how to fix an invalid value.
- Choose the input type and validation contract for the task, not just for appearance.
- Use flexibleHeight for multiline entry. HistoryInputBox and FindInput build on this text-entry contract.

## Accessibility

- Use ariaLabel when a separate label is not associated with the control.
- Keep validation messages understandable without relying on color.

## Preview

Text entry and validation states. Edit the fields to try validation.
