# KeybindingLabel

Usage and accessibility guidance for this component. The design-system reference checks API annotations against its implementation.

## Overview

Platform-aware visual notation for a resolved keyboard shortcut.

## Usage

- Pass a binding resolved by the keybinding service in product code.
- Display the shortcut beside its command; this widget does not register a keybinding.

## Accessibility

- The widget exposes the resolved shortcut’s accessible label.
- Keep the command name available alongside the shortcut; do not rely on keycap glyphs alone.

## Preview

The same command chord rendered with Windows/Linux and macOS notation.
