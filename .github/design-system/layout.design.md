# Layout

## Introduction

Keep the user's main task usable while navigation and supporting tools share the available space. This topic covers composition and resizing, not individual component dimensions.

## Arrange the primary task

Apply [One thing leads](../skills/design-philosophy/SKILL.md#4-one-thing-leads-the-rest-supports) by allocating the leading area to the current work. Place navigation and supporting details around it.

| Need | Layout choice |
| --- | --- |
| Read, edit, or compare primary content | Give the content a stable leading region |
| Keep supporting tools available | Use adjacent, resizable regions |
| Group related content within a region | Use [spacing](./spacing.design.md) before adding separators |
| Inspect temporary detail without leaving the task | Follow [elevation guidance](./elevation.design.md#surface-hierarchy) for an owned overlay |

Reuse the owning layout instead of wrapping every region in another card. Keep exterior gutters, inter-pane gaps, and component padding separate.

## Adapt to available space

Use the container's available space, not window width alone. A wide window can still contain a narrow pane.

Set minimum sizes and resize priorities through the owning SplitView or Grid. Let lower-priority supporting panes collapse where supported before making the main task unusable.

Allow reading content to reflow and controls to wrap where their contracts support it. For compact labels, preserve [truncation and access to full text](../skills/ux-css-layout/SKILL.md#9-text-overflow-ellipsis).

Keep focused controls reachable during resizing and collapse. Check long translations and zoom rather than compensating with smaller type or hit targets.

## Build and review

Use the [layout workflow](../skills/ux-css-layout/SKILL.md#8-responsive-layout) for constraints, sizing propagation, and implementation checks.

- The main task remains identifiable and usable in the smallest supported container.
- Supporting regions resize or collapse according to their intended priority.
- Content reflows or scrolls without clipping actions or focus indicators.
- Repeated rows align without doubled gutters or padding.
- Narrow-to-wide and wide-to-narrow transitions preserve relevant user sizing choices.
