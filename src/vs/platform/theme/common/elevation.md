# Elevation

## Introduction

Elevation describes the perceived distance between a surface and what sits behind it. Use it to explain where work happens, what belongs together, and which temporary surface needs attention. Raise a surface to clarify a relationship, not to decorate it.

## Surface hierarchy

Start with the user's task. Can they keep working beside this surface, inspect something without leaving their place, or must they resolve it before continuing? Choose the least intrusive relationship that supports that task.

| Relationship | Purpose | VS Code example | Visual treatment |
| --- | --- | --- | --- |
| Beside the work | Keep navigation and supporting tools available | Explorer, editor groups, Terminal | Distinct layout regions; spacing, surface fills, and separators before shadows |
| Inside a surface | Group related content without implying another window | Settings sections, an expanded details region | Spacing or a quiet boundary; no default lift |
| Above the work | Offer temporary information or an action without rearranging the workspace | Hover, context menu, Command Palette, notification toast | Component-owned fill and boundary, with an overlay shadow |
| Blocking the work | Protect a decision that must be resolved first | Save changes confirmation | Dialog, modal backdrop, and managed focus |

These are composition roles, not numeric z-index levels. A hover and a menu can share a shadow while occupying different positions in the stack. A selected tab is not a new elevation level, and an important message doesn't automatically deserve a modal.

## What makes elevation

Depth is a combination of cues. A shadow alone cannot explain ownership, interactivity, or whether the underlying task is available.

| Cue | What it communicates | How to choose it |
| --- | --- | --- |
| Position and overlap | Which surface is above another | Anchor local help to its source; reserve window-level placement for window-level tasks |
| Surface fill and text | A readable, distinct plane | Use the component's background and foreground together; don't assume higher always means lighter |
| Edge or contour | Where a surface ends | Use the component border and theme contrast border; keep ordinary boundaries to one stroke |
| Shadow | Separation from the receiving surface | Reuse the shared shadow ramp; don't give every nested container its own shadow |
| Shape | The kind of surface | Use radius roles, preserving the existing component's geometry |
| Backdrop and focus | Whether the task beneath remains available | Only a modal blocks interaction; implement that behavior through the dialog service, not a dark rectangle |

Keep the editor visually primary during everyday work. Accent fills signal actions or state, not height. Transparency and blur are optional materials, not prerequisites for elevation.

## Product scenarios

Use the following relationships to shorten the path from finding something to acting on it.

### Navigate without losing the editor

When a developer selects a file in Explorer or checks Terminal output, both regions remain part of the working layout. Keep them beside the editor rather than presenting each as a floating card. This makes repeated navigation predictable and preserves space for code.

Use `sideBar.background`, `editor.background`, and `panel.background` for their actual regions. Preserve resize sashes and the active editor's focus indicator. A settings group inside an editor needs spacing or a separator, not the shadow of a hover.

### Inspect a symbol in place

A developer checking a type or diagnostic should still recognize the code that triggered it. Place the hover near that symbol, avoid obscuring the relevant text where possible, and let the existing hover controller handle repositioning and dismissal.

Pair `editorHoverWidget.background`, `editorHoverWidget.foreground`, and `editorHoverWidget.border` with the shared `lg` shadow. The menu and hover can use the same shadow because both are local overlays; their controllers, not larger shadows, determine which is on top.

### Jump to another file or command

Quick Open and the Command Palette briefly move attention from the current file to a workspace-wide choice. Their window-level placement and stronger `xl` shadow distinguish them from local help without moving the editor underneath.

Reuse Quick Input. Keep keyboard navigation, filtering, Escape, and focus restoration intact. Don't dim the entire workspace merely to make a picker feel important. Its temporary focus ownership isn't a substitute for a blocking confirmation.

### Resolve a decision before continuing

When closing an unsaved file requires a decision, a dialog deliberately interrupts the flow. Use the existing dialog service so the decision, focus trap, accessible name, dismissal policy, and return focus stay together.

The custom dialog uses the `xl` shadow and a backdrop; native dialogs own their platform styling. A background task completing is different: use a notification rather than borrowing a modal's interruption. Notification toasts use `lg` and don't require a modal backdrop.

## Relationship summaries

### Navigation relationship

Peer regions remain available together. The editor leads; navigation and tools support it without becoming independent floating layers.

### Inspection relationship

The overlay stays visually connected to the content it explains. The underlying document remains recognizable and in place.

### Picker relationship

One temporary choice surface sits above the workspace. Its shadow separates the choice from the work without suggesting a permanent layout region.

### Decision relationship

The dialog and backdrop signal an unavailable underlying task. This relationship requires modal behavior, not just modal styling.

## Shadow scale

Reuse the `--vscode-shadow-*` CSS scale defined in [workbench styles](../../../workbench/browser/media/style.css). These are CSS shadow recipes, not distances, z-index values, or theme-color IDs.

The ramp is already shared; don't create another elevation scale for a feature. `lg` and `xl` have clear overlay consumers. The smaller steps don't establish a rule that ordinary controls or every card must cast shadows.

### Small shadow

Subtle workbench separation. This step is suppressed by the workbench shadow preference and Modern UI's flat-part treatment. Don't use it for an overlay that must retain separation.

### Medium shadow

An available intermediate shadow, not a prescribed card level. Use an existing component's treatment first; don't introduce a raised surface solely to use every step of the ramp.

### Large shadow

Local floating surfaces: editor hovers, menus, custom select dropdowns, and notification toasts. Keep the component's own surface colors and border.

### Extra-large shadow

Window-level temporary surfaces: Quick Input and custom dialogs. A shadow doesn't make either modal; only the dialog's interaction contract does.

## Elevation by role

Radius and shadow answer different questions. Radius describes the surface family; shadow separates it from what it overlaps. Don't calculate one from the other or increase both each time content is nested.

| Shape role | Token | Guidance |
| --- | --- | --- |
| Control | `cornerRadius.small` | Buttons, inputs, and interactive rows inside a surface |
| Inner | `cornerRadius.medium` | Contained, non-control groups |
| Outer | `cornerRadius.large` | Starting point for new local overlays, including editor hovers |
| Prominent outer | `cornerRadius.xLarge` | Existing Quick Input and custom-dialog shells |

Existing components can have their own geometry. For example, notification containers retain their component-owned geometry. Reuse an existing component without restyling it to force a universal radius.

## Implementation

Prefer the existing component or service over a hand-built overlay. Use [IHoverService](../../hover/browser/hover.ts) for help, [IContextMenuService](../../contextview/browser/contextView.ts) for menus, [Quick Input](../../quickinput/common/quickInput.ts) for searchable choices, [IDialogService](../../dialogs/common/dialogs.ts) for blocking decisions, and [INotificationService](../../notification/common/notification.ts) for nonblocking status. Their positioning, keyboard behavior, and lifecycle matter as much as their CSS.

For a genuinely new local inspection surface, this recipe composes existing tokens. It is not a replacement for the hover controller or a new global utility class:

```css
.inspection-surface {
	background: var(--vscode-editorHoverWidget-background);
	color: var(--vscode-editorHoverWidget-foreground);
	border: var(--vscode-strokeThickness) solid var(--vscode-editorHoverWidget-border);
	border-radius: var(--vscode-cornerRadius-large);
	box-shadow: var(--vscode-shadow-lg);
}

.hc-black .inspection-surface,
.hc-light .inspection-surface {
	border-color: var(--vscode-contrastBorder);
	box-shadow: none;
}
```

`widget.shadow` is a themeable color used by some widgets and fallbacks; it is not a complete `box-shadow` value. `widget.border` supplies a generic high-contrast boundary. Prefer the owning component's more specific color and style contract. Generic new content surfaces can use `color.background.canvas` and `color.background.raised` with compatible text, but those roles don't replace editor, menu, or picker customization keys.

Use the owning overlay host or context-view service for stacking and viewport placement. Don't fix clipping with a giant z-index; an ancestor's overflow or stacking context can still trap the surface. Keep subordinate menus above their parent through the existing host, rather than inventing a stronger shadow.

## High contrast

Preserve the relationship when shadows are weak or absent. In dark themes, overlapping fills can merge; in high contrast, a clear contour is more useful than a soft shadow. Check the actual surface, text, boundary, and focus colors together.

In high-contrast themes, use explicit, theme-aware boundaries rather than relying on a soft shadow. Existing components may provide different high-contrast treatments; preserve their accessibility styling.

`workbench.shadows: false` removes part-level depth, active-tab shadows, and `sm`; it deliberately preserves floating overlays using `lg` and `xl`. Modern UI also flattens part-level shadows. Neither should be described as a global no-shadows mode.

Scroll shadows are a separate affordance: `scrollbar.shadow` and component-specific sticky-scroll shadows indicate content passing under an edge. Show them when content is actually occluded, not as permanent lift on every header.

### Check before shipping

- Name the surface's owner and receiving surface. If spacing or a border explains the grouping, don't add lift.
- Verify light, dark, high-contrast dark, and high-contrast light themes, including customized backgrounds and borders.
- With part shadows turned off, confirm overlays still separate and docked regions don't regain decorative shadows.
- Check zoom, narrow windows, viewport edges, and scroll containers. Keep content and controls reachable; don't crop the shadow or hide the triggering context unnecessarily.
- Verify keyboard entry, visible focus, Escape where supported, and return focus. Trap focus only for a modal.
- Provide an accessible name and appropriate roles through the existing component. Neither a shadow nor a backdrop communicates modality to assistive technology.
- Use hover and selection styling for interaction states. Don't lift every row on hover or animate depth without a navigation or feedback purpose.

## Source contracts

- [Workbench shadow ramp and preference overrides](../../../workbench/browser/media/style.css)
- [Widget shadow and border colors](colors/editorColors.ts)
- [Semantic surface colors](colors/semanticColors.ts)
- [Radius and stroke tokens](sizes/baseSizes.ts)
- [Editor hover styles](../../../editor/contrib/hover/browser/hover.css)
- [Quick Input styles](../../quickinput/browser/media/quickInput.css)
- [Custom-dialog styles](../../../base/browser/ui/dialog/dialog.css)
- [Menu styling](../../../base/browser/ui/menu/menu.ts)
- [Notification toast styles](../../../workbench/browser/parts/notifications/media/notificationsToasts.css)
- [Modern UI part-shadow treatment](../../../workbench/contrib/modernUI/browser/media/shadows.css)
- [Shared widget styles](../browser/defaultStyles.ts)
