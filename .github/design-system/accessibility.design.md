# Accessibility

## Introduction

Make meaning and actions available without depending on vision, color, motion, or a pointing device. A focused interface makes the current action clear; a calm interface gives useful feedback without repeating or interrupting unnecessarily.

Start with the existing component's keyboard and accessibility behavior. This chapter brings together the repository's [accessibility workflow](../skills/accessibility/SKILL.md) and [implementation instructions](../instructions/accessibility.instructions.md); those sources retain their scope. The checks below evaluate the experience, not just the presence of ARIA attributes.

## Keyboard and focus

Every action must work without a mouse. Use Tab and Shift+Tab to move between controls, and the established arrow-key pattern within lists, trees, grids, and toolbars. Reuse the workbench widget rather than building a second navigation model.

- Keep keyboard focus visible when hover, selection, or an open state is also active. Focus and selection describe different things.
- Let Escape dismiss overlays and return focus to the control that opened them. Modal dialogs keep focus inside until dismissed.
- Make click, hover, context-menu, and drag actions available through the keyboard. An action revealed only on hover still needs a keyboard path.
- When a row contains an inline action, show the action's focus boundary rather than a competing parent boundary.

### Scope shortcuts to their context

An accessibility-specific shortcut must not replace a standard command outside its intended context. Scope it to the focused feature and accessibility mode where required by the [keybinding instructions](../instructions/accessibility.instructions.md#keybinding-scoping). Help text should use `<keybinding:commandId>` references so it reflects the user's bindings, not a hardcoded shortcut.

### Explain unavailable options

When an otherwise relevant option remains discoverable but disabled, communicate both its state and its reason. A grey label, policy icon, or hover alone is not enough. Keep explanatory links independently keyboard-operable without activating the disabled option. Preserve explicit feature-hiding choices; this is not a reason to expose disabled AI or unsupported capabilities.

The [unavailable-option guidance](../skills/accessibility/SKILL.md#explaining-unavailable-options) includes the supported patterns and boundary cases.

## Names and states

Use the control's visible label as its accessible name where possible. Associate existing explanatory text with `aria-labelledby` or `aria-describedby` rather than maintaining a second description.

| What the user needs to understand | What to provide |
| --- | --- |
| What an icon-only action does | A localized action name, such as "Close panel", not "button" or "icon". |
| What kind of custom control this is | The appropriate role and the keyboard behavior that role promises. |
| Whether an item is open, selected, or checked | The corresponding expanded, selected, or checked state, updated with the control. |
| Where an item sits in a virtualized collection | The collection's position and size through its accessibility provider. |
| Whether an icon adds meaning | Hide decorative or redundant icons from the accessibility tree. |

Prefer native semantics where they already express the interaction. For example, native `details` and `summary` expose disclosure behavior; style their open state rather than adding redundant `aria-expanded` attributes.

These choices follow the [labels and roles guidance](../skills/accessibility/SKILL.md#7-aria-labels-and-roles). Check the spoken name, role, and state together; a correct attribute in isolation does not prove that the control makes sense.

## Help and readable content

Help explains how to operate a feature. An Accessible View presents its current content for reading. They solve different problems; neither replaces keyboard access to the original surface.

| Surface or change | What to provide |
| --- | --- |
| A new interactive surface | Contextual Accessibility Help and a verbosity setting for its help hint; reuse existing providers where available. |
| Rich or visual content that cannot be read directly | An Accessible View as well as help, with meaningful current content and applicable actions. |
| A simple native text input | Contextual help; a separate Accessible View is not needed just to repeat the input. |
| New actions or shortcuts in an existing feature | Update that feature's help to describe the available behavior. |

Match help to the focused surface and its available capabilities. Restore the previous focus when help or the Accessible View closes. Let users disable repeated help hints through the feature's accessibility verbosity setting.

Use `AccessibleContentProvider` directly, following the [help-dialog instructions](../instructions/accessibility.instructions.md#accessible-help-dialogs-altf1). Keep registration, localization, dynamic keybinding references, and provider lifecycle in the [implementation workflow](../skills/accessibility/SKILL.md#1-accessibility-help-dialog).

### Product examples

- **Contextual help:** [Chat help](../../src/vs/workbench/contrib/chat/browser/actions/chatAccessibilityHelp.ts) describes actions for the current chat surface. Its [tests](../../src/vs/workbench/contrib/chat/test/browser/accessibility/chatAccessibilityHelp.test.ts) check that conditional actions are described only where supported.
- **Readable content:** the [notification Accessible View](../../src/vs/workbench/browser/parts/notifications/notificationAccessibleView.ts) exposes the message, severity, source, and available actions, and returns focus to the notification list. Its [tests](../../src/vs/workbench/test/browser/notificationAccessibleView.test.ts) cover changing links, navigation, and listener lifetime.

These are implementation examples, not a requirement to copy every action or lifecycle choice into another feature.

## Feedback and announcements

Choose feedback by urgency and purpose. Keep messages concise and localized. Do not speak the same information through both a signal announcement and a separate live-region message.

| Situation | Choose | Preserve |
| --- | --- | --- |
| Non-urgent progress, result counts, or background updates | A polite `status()` message | The user's current reading should finish before the update is spoken. |
| Urgent information that needs immediate attention | An `alert()` message | Use interruption deliberately, not for every state change. |
| An event with an existing accessibility signal | `IAccessibilitySignalService` and that signal | User-controlled sound and announcement preferences; no duplicate speech. |
| A discoverability hint on focus | The feature's verbosity-controlled hint | Announce only in the relevant visible context and prevent repeated hints. |

The [ARIA implementation](../../src/vs/base/browser/ui/aria/aria.ts) owns the polite and alert live regions. The [signal service](../../src/vs/platform/accessibilitySignal/browser/accessibilitySignalService.ts) can announce as well as play sound; check the selected signal before adding another announcement. Coordinate a genuinely new signal through the [signal workflow](../skills/accessibility/SKILL.md#4-accessibility-signals-sounds-announcements).

### Attention beyond the current surface

Important user-action requests may need visual, spoken, and audio feedback, plus an OS notification under the feature's notification policy. Do not apply a chat-specific notification rule to every background update.

For chat, use the existing [window notifier](../../src/vs/workbench/contrib/chat/browser/chatWindowNotifier.ts) and its configured mode. The [accessibility instruction](../instructions/accessibility.instructions.md#multi-modal-notifications) describes background-window notifications; the current notifier also allows an explicit Always mode in a focused window. Preserve that distinction rather than adding an unconditional toast or another speech channel.

## Visual alternatives

Keep the same meaning available when appearance changes. Use [theme roles and high-contrast behavior](../skills/ux-theming/SKILL.md), not fixed colors that work in only one theme.

- Keep keyboard focus distinguishable from hover, selection, and pressed state in light, dark, and high-contrast themes.
- Pair meaningful color with text, a state, or another non-color cue. Follow the [color guidance](./colors.design.md) for contrast and feedback roles.
- Keep actions and reading order usable at narrow widths and increased zoom. The [typography guidance](./typography.design.md) covers readable roles and text-spacing overrides.
- Honor reduced-motion preferences without losing the outcome or feedback. The [motion guidance](./motion.design.md) owns the reduced alternative.
- Give meaningful illustrations a text equivalent; keep decorative artwork out of the accessibility tree. See [Illustration](./illustration.design.md#accessibility).

## Build and review

Review a representative interaction and a conditional case, such as an unavailable option or an action that exists on only one surface.

- Complete the action with Tab, Shift+Tab, arrow keys, and activation keys as appropriate, without using the pointer.
- Open and dismiss help or an overlay; focus returns to a useful, predictable place.
- Check the real focused control while it is also hovered, selected, or open. Its focus indicator remains visible.
- With a screen reader, confirm that names, roles, states, and disabled reasons are understandable in context.
- Trigger a dynamic update. Its urgency is appropriate, it is announced once, and disabling optional hints or sounds is respected.
- Read rich content through its Accessible View. The content and actions match the current item, including after navigation or updates.
- Check light, dark, high-contrast, narrow, zoomed, and reduced-motion states relevant to the surface. Meaning and actions remain available.

Source checks can verify bindings, localization, scoped keybindings, and provider registration. Automated tests can cover conditional help, state changes, and cleanup. Neither replaces keyboard, screen-reader, and visual inspection of the resulting feature.
