# Spacing

Design guidance and example descriptions. Referenced registrations own the implemented values.

Sources: [SKILL.md](../../../../../../.github/skills/design-philosophy/SKILL.md), [design-tokens.instructions.md](../../../../../../.github/instructions/design-tokens.instructions.md), [SKILL.md](../../../../../../.github/skills/ux-css-layout/SKILL.md).

## Introduction

Space makes relationships visible. Keep related things close, separate independent groups, and repeat the same rhythm for equivalent content.

## Make relationships visible

Use less space within a group than between groups. Repeated intervals make related content easy to scan without adding borders.

## Give each interval one owner

Avoid compensating for a parent gap with more child margins. The visible distance includes both, so doubling ownership can push an otherwise on-scale layout off rhythm.

Spacing is not control size, text line-height, tree indentation, or an overlay offset. Keep the owning component’s geometry and hit targets intact.

## Choose a spacing pattern

Start with the relationship between the elements. Reuse the owning component’s layout before adding a new interval.

## Spacing between controls

Compare the 8px gap between sibling actions with the 12px gap between action groups.

## When space gets tight

Adapt the composition before squeezing every interval. Preserve label associations, allow controls to wrap, and reduce outer gutters before sacrificing usable content.

Keep spacing within a field smaller than spacing between fields, even after controls wrap. Check long labels, keyboard focus, and the smallest supported pane before choosing a denser layout.

## Spacing ramp

Available steps for padding, margins, and gaps.

The same tokens work horizontally and vertically. The name encodes the value: size160 is 16px.

## Keep a label and its icon together

A small gap makes the icon read as part of the label, not a separate action group. Leave the icon its own usable target.

## Keep a field close to its label

Use a smaller interval inside a field than between independent groups. Read the label and its content as one unit.

## Give sibling controls a steady rhythm

Equivalent controls use equal spacing. When the row wraps, choose row and column gaps deliberately rather than adding margins to each child.

## Let the surface own its inset

Give repeated rows the same content edge. Separate the label block from the trailing control without adding space between every line of text.

## Use a larger break for a new section

Keep a heading close to its description and give the next section more room. Space communicates grouping before another divider is needed.
