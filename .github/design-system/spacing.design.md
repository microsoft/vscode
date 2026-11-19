# Spacing

## Introduction

Help people scan related content by keeping groups close and separating changes of task. Use spacing for relationships, not to redefine control geometry or hit targets.

## Make relationships visible

Apply [Room to breathe](../skills/design-philosophy/SKILL.md#2-room-to-breathe) through grouping: use less space within a group than between groups. Repeat intervals for equivalent relationships before adding borders.

## Give each interval one owner

Choose padding, gap, or margin according to who owns the relationship. Account for the parent gap before adding child margins; both contribute to the visible distance.

Keep control size, text line-height, tree indentation, and overlay offsets with their owning components.

## Choose a spacing pattern

Reuse the component's layout first. For a new composition, choose the relationship below before selecting a step from the ramp.

## Spacing between controls

The example uses a smaller gap between sibling actions than between action groups. Its measured intervals illustrate this relationship, not universal button spacing.

## When space gets tight

Adapt the composition before squeezing every interval. Preserve label associations, allow controls to wrap, and reduce outer gutters before sacrificing usable content.

Keep spacing within a field smaller than spacing between fields after wrapping. Check long labels, keyboard focus, and the smallest supported pane before choosing a denser layout.

## Spacing ramp

Select padding, margin, and gap values from [baseSizes.ts](../../src/vs/platform/theme/common/sizes/baseSizes.ts). The same ramp supports horizontal and vertical relationships.

Follow [CSS spacing guidance](../instructions/design-tokens.instructions.md#spacing) for token application and existing on-scale literals.

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

## Build and review

- Related content reads as a group without extra separators.
- Repeated relationships use the same intervals.
- Parent layout and child margins do not accidentally double the intended gap.
- Wrapping and zoom preserve label associations and visible keyboard focus.
- Component padding and hit targets remain intact.

Inspect the rendered relationships at the smallest supported pane and with long translations. Use [layout guidance](../skills/ux-css-layout/SKILL.md#8-responsive-layout) when the composition, not the interval, needs to change.
