---
title: "Spacing"
kind: "foundation"
isDraft: true
order: 9
presentation: "foundations"
specimens:
  relationships:
    - - "Within a group"
      - $text: "Within a group"
    - - "Between groups"
      - $text: "Between groups"
    - - "Inside a surface"
      - $text: "Inside a surface"
  ownership:
    - - "Padding · inside a surface"
      - $text: "Padding ownership"
    - - "Gap · between siblings"
      - $text: "Gap ownership"
    - - "Margin · outside an element"
      - $text: "Margin ownership"
  preview:
    control: "button"
    summary: "Related actions in light and dark themes."
  spacing:
    patterns:
      - id: "association"
        heading: "Keep a label and its icon together"
        context: "Automations · owner label"
        rules:
          - file: "src/vs/sessions/contrib/automations/browser/media/automationDialog.css"
            selector: ".automation-owner-label"
            properties:
              - "gap"
      - id: "field"
        heading: "Keep a field close to its label"
        context: "Automations · prompt section"
        rules:
          - file: "src/vs/sessions/contrib/automations/browser/media/automationDialog.css"
            selector: ".automation-prompt-section"
            properties:
              - "gap"
      - id: "siblings"
        heading: "Give sibling controls a steady rhythm"
        context: "Automations · provider tools"
        rules:
          - file: "src/vs/sessions/contrib/automations/browser/media/automationDialog.css"
            selector: ".automation-provider-tools"
            properties:
              - "gap"
      - id: "inset"
        heading: "Let the surface own its inset"
        context: "Agent settings · setting row"
        rules:
          - file: "src/vs/workbench/contrib/chat/browser/aiCustomization/media/agentGlobalConfigurationSettings.css"
            selector: ".agent-global-configuration-settings-row"
            properties:
              - "padding"
              - "gap"
      - id: "sections"
        heading: "Use a larger break for a new section"
        context: "Agent settings · sections"
        rules:
          - file: "src/vs/workbench/contrib/chat/browser/aiCustomization/media/agentGlobalConfigurationSettings.css"
            selector: ".agent-global-configuration-settings-section"
            properties:
              - "margin-top"
          - file: "src/vs/workbench/contrib/chat/browser/aiCustomization/media/agentGlobalConfigurationSettings.css"
            selector: ".agent-global-configuration-settings-section h2"
            properties:
              - "margin"
    responsive:
      - file: "src/vs/workbench/contrib/chat/browser/aiCustomization/media/agentGlobalConfigurationSettings.css"
        selector: ".agent-global-configuration-settings-content"
        properties:
          - "padding"
      - file: "src/vs/workbench/contrib/chat/browser/aiCustomization/media/agentGlobalConfigurationSettings.css"
        selector: ".agent-global-configuration-settings.narrow .agent-global-configuration-settings-content"
        properties:
          - "padding"
      - file: "src/vs/workbench/contrib/chat/browser/aiCustomization/media/agentGlobalConfigurationSettings.css"
        selector: ".agent-global-configuration-settings.narrow .agent-global-configuration-settings-row"
        properties:
          - "flex-wrap"
tokenDomain: true
sectionCopy:
  grouping:
    label: "Relationships"
  ownership:
    label: "Padding, gap, and margin"
  patterns:
    label: "Usage patterns"
  product:
    label: "Live example"
  responsive:
    label: "Narrow layouts"
  ramp:
    label: "Spacing tokens"
---

# Spacing

## Introduction

Help people scan related content by keeping groups close and separating changes of task. Use spacing for relationships, not to redefine control geometry or hit targets.

<a id="spacing-grouping"></a>
## Make relationships visible

Apply [Room to breathe](principles.design.md#2-room-to-breathe) through grouping: use less space within a group than between groups. Repeat intervals for equivalent relationships before adding borders.

<a id="spacing-ownership"></a>
<a id="spacing-guidance"></a>
## Give each interval one owner

Choose padding, gap, or margin according to who owns the relationship. Account for the parent gap before adding child margins; both contribute to the visible distance.

Keep control size, text line-height, tree indentation, and overlay offsets with their owning components.

<a id="spacing-patterns"></a>
## Choose a spacing pattern

Reuse the component's layout first. For a new composition, choose the relationship below before selecting a step from the ramp.

<a id="spacing-product"></a>
## Spacing between controls

The example uses a smaller gap between sibling actions than between action groups. Its measured intervals illustrate this relationship, not universal button spacing.

<a id="spacing-responsive"></a>
## When space gets tight

Adapt the composition before squeezing every interval. Preserve label associations, allow controls to wrap, and reduce outer gutters before sacrificing usable content.

Keep spacing within a field smaller than spacing between fields after wrapping. Check long labels, keyboard focus, and the smallest supported pane before choosing a denser layout.

<a id="spacing-ramp"></a>
<a id="layout-spacing"></a>
## Spacing ramp

Select padding, margin, and gap values from [baseSizes.ts](../../../../src/vs/platform/theme/common/sizes/baseSizes.ts). The same ramp supports horizontal and vertical relationships.

Follow [CSS spacing guidance](../../../instructions/design-tokens.instructions.md#spacing) for token application and existing on-scale literals.

## Within a group

Keep a label, its control, and supporting text close enough to read as one unit.

## Between groups

Use a larger break when the task or subject changes. Equal spacing at every level flattens the hierarchy.

## Inside a surface

Use one consistent inset to align content and keep it clear of the boundary.

## Padding ownership

The container owns the content inset. Align repeated rows to the same edge; keep the outer gutter separate from each control’s internal padding.

## Gap ownership

The layout owns the interval between children. Use row and column gaps for wrapping groups; let the component keep its own hit target.

## Margin ownership

Use it for a contextual separation such as the start of a new section. Account for adjacent margins and the parent layout before adding more.

## Keep a label and its icon together

A small gap makes the icon read as part of the label, not a separate action group. If interactive, preserve its usable target.

## Keep a field close to its label

Use a smaller interval inside a field than between independent groups. Read the label and its content as one unit.

## Give sibling controls a steady rhythm

Equivalent controls use equal spacing. When the row wraps, choose row and column gaps deliberately rather than adding margins to each child.

## Let the surface own its inset

Give repeated rows the same content edge. Separate the label block from the trailing control without adding space between every line of text.

## Use a larger break for a new section

Keep a heading close to its description and give the next section more room. Space communicates grouping before another divider is needed.

<a id="spacing-review"></a>
## Build and review

- Related content reads as a group without extra separators.
- Repeated relationships use the same intervals.
- Parent layout and child margins do not accidentally double the intended gap.
- Wrapping and zoom preserve label associations and visible keyboard focus.
- Component padding and hit targets remain intact.

Inspect the rendered relationships at the smallest supported pane and with long translations. Use [layout guidance](../../ux-css-layout/SKILL.md#8-responsive-layout) when the composition, not the interval, needs to change.
