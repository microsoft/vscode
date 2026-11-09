# Button / ButtonBar

Usage and accessibility guidance for this component. The design-system reference checks API annotations against its implementation.

## Overview

Runs actions through labeled, icon-only, descriptive, split, or grouped buttons.

## Usage

- Use a clear verb for the action. Prefer a link when the purpose is navigation.
- Keep one primary action prominent; use secondary buttons for supporting choices.
- Register the button and its event subscriptions with the owning disposable store.
- Use ButtonWithDropdown for a primary action with a separate alternatives menu. ButtonBar groups related actions with directional keyboard navigation.

## Accessibility

- Enter and Space activate an enabled button.
- Provide an accessible name for icon-only buttons. Disabled buttons must not run their action.

## Preview

Primary, secondary, icon, description, disabled, and grouped-button examples.
