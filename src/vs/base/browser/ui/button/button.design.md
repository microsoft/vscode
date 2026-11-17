# Button / ButtonBar

Authored usage and accessibility guidance for the Button family. API declarations come from the implementation, and live examples come from its existing fixtures.

## Overview

Runs actions through labeled, icon-only, descriptive, split, or grouped buttons.

## Usage

- Use a clear verb for the action. Prefer a link when the purpose is navigation.
- Keep one primary action prominent; use secondary buttons for supporting choices.
- Register the button and its event subscriptions with the owning disposable store. Subscribe through `onDidClick` rather than adding a second DOM click path.
- Use ButtonWithDropdown for a primary action with a separate alternatives menu. ButtonBar groups related actions with directional keyboard navigation.
- Use `disabled` for the initial construction state and change `enabled` on an existing button.
- `ButtonBar.clear()` disposes its buttons. Do not retain and reuse the cleared instances.
- For working source examples, see the [Button and ButtonBar fixtures](../../../../workbench/test/browser/componentFixtures/baseUI.fixture.ts).

## Accessibility

- Enter and Space activate an enabled button.
- Provide an accessible name for icon-only buttons. Disabled buttons must not run their action.

## Preview

Primary, secondary, icon, description, disabled, and grouped-button examples.
