---
title: "Design philosophy"
kind: "foundation"
status: "stable"
order: 1
legacyPaths:
  - ".github/design-system/guidance/principles.md"
  - ".github/design-system/principles.design.md"
  - ".github/skills/design-philosophy/SKILL.md"
---

# Design philosophy

Use shared values and principles to explain why a visual choice helps or hinders the user's task. This specification owns design reasoning; foundation specifications own the concrete decisions and product code owns implemented behavior.

Sources: [Colors](colors.design.md), [Elevation](elevation.design.md), [Accessibility](accessibility.design.md), [Content](content.design.md), [Motion](motion.design.md), [Review guidance](../references/review.md).

## Values

| Value | Intended feeling | Common tension |
| --- | --- | --- |
| **Calm** | Quiet at rest, uncluttered, and plain-spoken | Density: what belongs at rest? |
| **Focused** | One thing leads while supporting information stays secondary | Access: what can be demoted without being lost? |
| **Consistent** | Equivalent choices use shared roles and behavior | Context: when is a difference intentional? |
| **Delightful** | Small moments guide, confirm, or orient | Restraint: when does polish become noise? |

These values name qualities that are easy to lose in a dense, long-lived tool. They can conflict; make the tradeoff deliberate rather than treating any one value as an absolute.

## Principles

### Calm

#### 1. Quiet at rest, present on intent

> **Ask:** Is anything competing for attention when nothing is happening?

Let chrome recede until it helps with the current task. Quiet must not make controls undiscoverable or hide keyboard focus. See [theming](theming.design.md), [interaction patterns](../patterns/interaction-patterns.design.md), and [focus guidance](accessibility.design.md).

#### 2. Room to breathe

> **Ask:** Does the content feel cramped, boxed in, or jagged?

Space and soft geometry should clarify grouping without squeezing the work. More padding is not always calmer, especially in narrow or dense layouts. See [spacing](spacing.design.md), [shape](shape.design.md), and [layout](layout.design.md).

#### 3. The interface explains itself, plainly and kindly

> **Ask:** Can someone understand the control and its result without guessing?

Prefer clear, visible labels when a symbol is not self-explanatory. Keep purpose available while typing, waiting, and using assistive technology. Make gestures honest, discoverable, and keyboard-accessible. See [content](content.design.md) and [accessibility](accessibility.design.md).

### Focused

#### 4. One thing leads; the rest supports

> **Ask:** Where does the eye go first, and is anything secondary competing with it?

Give each view a clear center of attention. Supporting detail should explain rather than cover the work; quiet can yield when a meaningful warning needs attention. See [typography](typography.design.md), [size](size.design.md), [iconography](iconography.design.md), and [elevation](elevation.design.md).

#### 5. Elevation is encoded, not eyeballed

> **Ask:** Does the surface treatment explain ownership, overlap, and the next action?

Use the owning component's complete surface treatment. Visual lift, paint order, and modality are separate contracts: a shadow does not bring a popup forward, and a backdrop does not implement a modal. See [elevation](elevation.design.md), [shape](shape.design.md), and the [modal pattern](../patterns/modal.design.md).

### Consistent

#### 6. Sameness signals sameness

> **Ask:** Do equivalent things look and respond alike, and are differences intentional?

Use shared roles and behavior for equivalent choices. A difference in purpose or density can justify a difference in treatment; accidental drift cannot. See [tokens](tokens.design.md), [spacing](spacing.design.md), [typography](typography.design.md), [iconography](iconography.design.md), and [stroke](stroke.design.md).

### Delightful

#### 7. Delight earns its keep

> **Ask:** What does this change help the user recognize, understand, or do?

Keep a flourish only when it guides, confirms, or orients. Make it bounded and interruptible, preserve access to the task, and keep the result understandable without motion. See [motion](motion.design.md).

## Unavailable features

When a relevant feature is blocked by policy, entitlement, setup, or platform support, prefer a concise explanation and useful next step over unexplained disappearance. Distinguish authoritative reasons, keep explanation available without hover, and prevent presentation from granting access. Preserve intentional hiding choices, including disabled AI and unreleased feature gates.

Reuse the owning patterns rather than copying implementations: [managed-setting indicators](../../../../src/vs/workbench/contrib/preferences/browser/settingsEditorSettingIndicators.ts), [model availability](../../../../src/vs/workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerItemPrimitives.ts), [harness availability](../../../../src/vs/workbench/contrib/chat/browser/agentSessions/sessionTypeAvailability.ts), and [permission presentation](../../../../src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostModePickerPresentation.ts). See [managed-settings guidance](../../policy-and-managed-settings/SKILL.md) and [accessibility](accessibility.design.md).

## Worked examples

- **Busy panel:** If a panel feels noisy and competes with the editor, question its permanent emphasis and hierarchy before tuning a color.
- **Boxed-in toolbar:** If a toolbar feels crowded, reconsider separators and spacing together rather than shrinking its controls.
- **Flat settings row:** If the label, help text, and reset action have equal weight, let the task lead and make the reset action secondary.
- **Mismatched dialogs:** If equivalent menus use different corners and shadows, reuse the owning surface contract instead of tuning each wrapper.
- **Bouncing panel:** If motion delays a routine toggle without helping orientation, remove it; if arrival needs explaining, use one restrained, interruptible cue.

For feedback, name the feeling, surface, principle, and proposed move before discussing a measurement. The [review guide](../references/review.md) contains the phrasebook and evidence checklist.
