---
title: "Accessibility"
kind: "foundation"
isDraft: true
order: 2
references:
  - title: "ARIA APG: Developing a Keyboard Interface"
    url: "https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/"
    description: "Explains tab-stop placement, focus versus selection, and navigation inside composite widgets."
---

# Accessibility

Make the same task understandable and operable without depending on vision, color, motion, or a pointing device. Start with the existing component's behavior rather than adding a second interaction model.

The [accessibility skill](../../accessibility/SKILL.md) owns VS Code's shared accessibility requirements and implementation workflow. This topic connects design decisions to that owner; it does not maintain a second checklist.

## Find the applicable guidance

| Design question | Authoritative guidance |
| --- | --- |
| Can someone reach, operate, and leave the surface without a mouse? | [Keyboard navigation and focus](../../accessibility/SKILL.md#6-keyboard-navigation) |
| Are purpose, state, and available actions understandable without seeing the control? | [Names, roles, and states](../../accessibility/SKILL.md#7-aria-labels-and-roles) |
| How will someone discover the feature's interactions? | [Accessibility Help](../../accessibility/SKILL.md#1-accessibility-help-dialog) and [verbosity settings](../../accessibility/SKILL.md#3-accessibility-verbosity-setting) |
| How will someone read rich or visual content? | [Accessible View](../../accessibility/SKILL.md#2-accessible-view) |
| Does feedback convey the change without unnecessary interruption or repetition? | [Signals](../../accessibility/SKILL.md#4-accessibility-signals-sounds--announcements) and [ARIA announcements](../../accessibility/SKILL.md#5-aria-alerts-vs-status-messages) |
| Can someone understand why an option is unavailable and what to do next? | [Unavailable options](../../accessibility/SKILL.md#explaining-unavailable-options) |

Use the skill's applicability rules when changing an existing feature or introducing a new surface. Keep component-specific obligations beside the component, linked to the shared requirements.

## Keep meaning across visual alternatives

Accessibility participates in each design choice, rather than forming a separate visual style:

- [Colors](colors.design.md) and [theming](../../ux-theming/SKILL.md) cover contrast, non-color cues, and high-contrast interaction states.
- [Typography](typography.design.md) covers readable roles and text-spacing overrides; [layout](layout.design.md) covers constrained space.
- [Motion](motion.design.md#offer-reduced-motion) covers reduced alternatives that preserve the result.
- [Illustration](illustration.design.md#accessibility) distinguishes meaningful artwork from decoration.

## Review a real task

Use the [skill's implementation checklist](../../accessibility/SKILL.md#checklist-for-every-new-feature) and validate the user's journey with the actual keyboard and screen reader. A source check can verify an attribute or registration; it cannot establish that the resulting experience makes sense.

Useful product examples:

- [Chat help](../../../../src/vs/workbench/contrib/chat/browser/actions/chatAccessibilityHelp.ts) describes actions for the current surface. Its [tests](../../../../src/vs/workbench/contrib/chat/test/browser/accessibility/chatAccessibilityHelp.test.ts) exercise conditional help.
- The [notification Accessible View](../../../../src/vs/workbench/browser/parts/notifications/notificationAccessibleView.ts) exposes the current message and actions. Its [tests](../../../../src/vs/workbench/test/browser/notificationAccessibleView.test.ts) cover navigation, changing links, and listener lifetime.

These are examples to inspect, not implementations to copy wholesale.
