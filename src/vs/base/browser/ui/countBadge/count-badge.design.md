---
title: "Count badge"
kind: "component"
isDraft: true
id: "badge"
aliases:
  - "count-badge"
component:
  implementation: "src/vs/base/browser/ui/countBadge/countBadge.ts"
  api:
    - "ICountBadgeOptions.count"
    - "ICountBadgeOptions.countFormat"
    - "ICountBadgeOptions.titleFormat"
    - "CountBadge.setCount"
  fixtures:
    - "baseUI/CountBadges"
---

# CountBadge

## Overview

A compact numeric indicator attached to a meaningful label or destination.

## Usage

- Use a badge when a quantity helps someone choose a destination or understand a nearby label.
- Use inline text when a count needs no extra emphasis, and a progress indicator when work is running without a known total.
- Keep status words, severity, and explanations outside the badge; a number alone cannot communicate what needs attention.

### Example: filtering a results list

An illustrative results header reads "Search results" beside a badge showing `12`. When a filter leaves three matches, call `setCount(3)` without replacing the header or moving keyboard focus.

At zero matches, show `0` with an explanation of how to broaden the search. If zero should hide the badge instead, make that an explicit caller decision.

The component does not automatically hide zero or abbreviate large counts. Check the owning layout with realistic counts rather than assuming a fixed-width indicator.

For runnable component examples, use the existing [Count badge fixtures](../../../../workbench/test/browser/componentFixtures/baseUI.fixture.ts).

## Accessibility

- Make the meaning of the count understandable without color.
- Keep the count's meaning in the owning label or control's accessible text, not only in `titleFormat` hover content.
- The badge is not interactive; its owning control provides any navigation, keyboard behavior, and accessible name.
- Count updates do not automatically announce themselves. Follow the [status-announcement guidance](../../../../../../.github/skills/accessibility/SKILL.md#5-aria-alerts-vs-status-messages) only when a change needs spoken feedback.

Use the shared badge foreground/background styles and follow the [theme validation baseline](../../../../../../.github/skills/design-system/foundations/theming.design.md#theme-comparisons).

## Preview

Counts with different digit lengths show how the badge width adapts.
