# Elevation

## Introduction

Elevation describes the perceived distance between a surface and what sits behind it. Use it to make ownership and the next action clear: the document is the work, a hover explains part of it, and a confirmation temporarily asks for a decision. A calm interface uses the fewest overlapping surfaces needed for that task.

## Surface hierarchy

Start with the user's task. Can they keep working beside this surface, inspect something without leaving their place, or must they resolve it before continuing? Choose the least intrusive relationship that supports that task.

| Relationship | Purpose | VS Code example | Visual treatment |
| --- | --- | --- | --- |
| Beside the work | Keep navigation and supporting tools available | Explorer, editor groups, Terminal | Distinct layout regions; spacing, surface fills, and separators before shadows |
| Inside a surface | Group related content without implying another window | Settings sections, an expanded details region | Spacing or a quiet boundary; no default lift |
| Above the work | Offer temporary information or an action without rearranging the workspace | Hover, context menu, Command Palette, notification toast | Component-owned fill and boundary, with an overlay shadow |
| Blocking the work | Protect a decision that must be resolved first | Save changes confirmation | Dialog, modal backdrop, and managed focus |

These are composition roles, not numeric z-index levels. A hover and a menu can share a shadow while occupying different positions in the stack. A selected tab is not a new elevation level, and an important message doesn't automatically deserve a modal.

### Choose the working context

Use an editor for content people need to read, edit, compare, or revisit. Use a docked view or panel for tools they need alongside that content. Neither needs to look like a floating card to have a clear hierarchy.

A temporary overlay is appropriate when leaving the current place would cost more than briefly covering it. Keep local help near its trigger; use Quick Input for a workspace-wide choice. If the task grows into sustained reading, several steps, or repeated comparisons, move it into an editor or view instead of adding another popup.

The existing [modal editor](../../../src/vs/workbench/browser/parts/editor/modalEditorPart.ts) is a separate, focused editor host, not a confirmation dialog or a new document type. Use it only when the feature needs that temporary, constrained context; retain its close and move-to-editor behavior where supported. Don't imitate it by placing an ordinary editor over a dimmed rectangle.

## What makes elevation

Depth is a combination of cues. A shadow alone cannot explain ownership, interactivity, or whether the underlying task is available.

### Fill and foreground

Pair the owning component's background and foreground. The fill separates the overlay's content from the receiving surface; it must remain readable without underlying text showing through. Higher does not always mean lighter, and an accent color signals an action or state, not height.

### Boundary and shape

Use the component's border to define its perimeter and preserve its radius. Radius identifies the surface family, not a distance. In high contrast, a solid contour must carry the separation even when the shadow is absent. Content groups inside the overlay don't need another floating frame.

### Shadow and receiving surface

Apply the shared shadow to the outer surface that overlaps the work. The shadow falls on the receiving surface, not between every row or content group. A local overlay commonly uses `lg`; changing it to `xl` changes visual separation, not paint order or modality.

### Placement and behavior

Anchor local help to its source and reserve window-level placement for window-level tasks. Keep the editor visually primary during everyday work. Transparency and blur are optional materials, not prerequisites for elevation. Use the owning modal host or dialog service for blocking behavior; neither a shadow nor a dark rectangle implements it.

## Product scenarios

Use the following relationships to shorten the path from finding something to acting on it.

### Navigate without losing the editor

When a developer selects a file in Explorer or checks Terminal output, both regions remain part of the working layout. Keep them beside the editor rather than presenting each as a floating card. This makes repeated navigation predictable and preserves space for code.

Use `sideBar.background`, `editor.background`, and `panel.background` for their actual regions. Preserve resize sashes and the active editor's focus indicator. A settings group inside an editor needs spacing or a separator, not the shadow of a hover.

### Inspect a symbol in place

A developer checking a type or diagnostic should still recognize the code that triggered it. Place the hover near that symbol, avoid obscuring the relevant text where possible, and let the existing hover controller handle repositioning and dismissal.

Reuse the hover's `editorHoverWidget.background`, `editorHoverWidget.foreground`, `editorHoverWidget.border`, and shared `lg` shadow. The menu and hover can use the same shadow because both are local overlays; their controllers, not larger shadows, determine which is on top. Keep content hoverable and dismissible; don't require precise pointer movement through a gap to reach its actions.

### Jump to another file or command

Quick Open and the Command Palette briefly move attention from the current file to a workspace-wide choice. Their window-level placement and stronger `xl` shadow distinguish them from local help without moving the editor underneath.

Reuse Quick Input. Keep keyboard navigation, filtering, Escape, and focus restoration intact. Don't dim the entire workspace merely to make a picker feel important. Its temporary focus ownership isn't a substitute for a blocking confirmation.

### Resolve a decision before continuing

When closing an unsaved file requires a decision, a dialog deliberately interrupts the flow. Use the existing dialog service so the decision, focus trap, accessible name, dismissal policy, and return focus stay together.

The custom dialog shell uses `xl`; the base component also has a themeable wrapper shadow. Native dialogs own their platform styling. Reuse the complete dialog rather than copying one layer of its styling. A background task completing is different: use a notification rather than borrowing a modal's interruption. Notification toasts use `lg` and don't require a modal backdrop.

## Relationship summaries

### Navigation relationship

Peer regions remain available together. The editor leads; navigation and tools support it without becoming independent floating layers.

### Inspection relationship

The overlay stays visually connected to the content it explains. The underlying document remains recognizable and in place.

### Picker relationship

One temporary choice surface sits above the workspace. Its shadow separates the choice from the work without suggesting a permanent layout region.

### Decision relationship

The dialog and backdrop signal an unavailable underlying task. This relationship requires modal behavior, not just modal styling.

## Construction studies

### Surface construction study

Surface schematic: 1 pairs the overlay's fill and text; 2 defines its boundary and shape; 3 separates it from the receiving surface. Only the outer overlay casts a shadow. The contained group belongs to the same surface. The geometry is illustrative, not a popup layout specification.

### Overlay hosting study

Clipping schematic: both overlays extend beyond a scroll container. Raising the descendant's z-index cannot release it from that clipping. Use the owner's supported overlay host so the surface can remain visible without removing necessary scrolling. Within a modal, preserve that modal's ownership and supported child-host path.

### Shadow comparison study

The samples keep the same size, fill, and shape so only the shadow changes. They compare the existing recipes, not four prescribed component styles or four z-index levels. Choose a component by its purpose before inspecting its shadow.

## Shadow scale

Reuse the `--vscode-shadow-*` CSS scale defined in [workbench styles](../../../src/vs/workbench/browser/media/style.css). These are CSS shadow recipes, not distances, z-index values, or theme-color IDs.

The ramp is already shared; don't create another elevation scale for a feature. Its centered, soft shadows are workbench CSS values, not a theme-dependent lighting model. Surface colors and contours must carry the relationship when the shadow is subtle. The smaller steps don't establish a rule that ordinary controls or every card must cast shadows.

### Existing surface treatments

These are implemented treatments, not a requirement to make every surface look identical.

| Surface | Existing treatment | Reuse |
| --- | --- | --- |
| Custom menus and submenus | `lg`, menu colors, component-owned border and corners; a theme-color shadow fallback outside the workbench ramp | [Menu styling](../../../src/vs/base/browser/ui/menu/menu.ts) and [default styles](../../../src/vs/platform/theme/browser/defaultStyles.ts) |
| Editor and workbench hovers | `lg` with hover colors; their existing corner geometry differs | [Editor hover](../../../src/vs/editor/contrib/hover/browser/hover.css), [workbench hover](../../../src/vs/platform/hover/browser/hover.css) |
| Custom select dropdowns | `lg`; native selects remain platform-owned | [SelectBox styles](../../../src/vs/base/browser/ui/selectBox/selectBoxCustom.css) |
| Quick Input | `xl`, Quick Input colors and its own focus lifecycle | [Quick Input styles](../../../src/vs/platform/quickinput/browser/media/quickInput.css) |
| Custom dialogs | `xl` on the dialog plus a separate wrapper shadow using `dialogShadow` from `widget.shadow` | [Dialog styles](../../../src/vs/base/browser/ui/dialog/dialog.css), [style application](../../../src/vs/base/browser/ui/dialog/dialog.ts) |
| Notification toasts | `lg` on the list container; existing notification geometry | [Toast styles](../../../src/vs/workbench/browser/parts/notifications/media/notificationsToasts.css) |
| Modal editors | `xl` on their wrapper, editor fill and a blocking backdrop | [Modal editor styles](../../../src/vs/workbench/browser/parts/editor/media/modalEditorPart.css) |
| Workbench parts | `md` is used by title/activity bars; separate directional depth and active-tab recipes also exist | [Title bar](../../../src/vs/workbench/browser/parts/titlebar/media/titlebarpart.css), [activity bar](../../../src/vs/workbench/browser/parts/activitybar/media/activitybarpart.css), [shared recipes](../../../src/vs/workbench/browser/media/style.css) |

Reuse the owning component before normalizing a difference. The ramp is shared, but shadow ownership, theme fallbacks, corners, and high-contrast suppression are not uniform across all consumers. For a new composition, let one outer surface own the shadow; don't add another shadow to the wrapper, body, and list inside it. Changes to an existing shared component need checks of its normal, high-contrast, native, and embedded uses rather than a feature-local override.

### Small shadow

Subtle workbench separation. This step is suppressed by the workbench shadow preference and Modern UI's flat-part treatment. Don't use it for an overlay that must retain separation.

### Medium shadow

Used by workbench chrome such as title and activity bars. It is not a prescribed card level. Don't introduce a raised surface solely to use every step of the ramp.

### Large shadow

Local floating surfaces: editor hovers, menus, custom select dropdowns, and notification toasts. Keep the component's own surface colors and border.

### Extra-large shadow

Used by Quick Input, custom-dialog shells, and modal-editor wrappers. A shadow doesn't make a surface modal; its interaction contract does.

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

Prefer the existing component or service over a hand-built overlay. Its positioning, keyboard behavior, and lifecycle matter as much as its CSS.

| Need | Owner | Preserve |
| --- | --- | --- |
| Explain a symbol or control | Existing editor hover controller or [IHoverService](../../../src/vs/platform/hover/browser/hover.ts) | Anchoring, keyboard entry, dismissal, and related-hover lifecycle |
| Offer a short set of actions | [IContextMenuService](../../../src/vs/platform/contextview/browser/contextView.ts) | Submenu navigation, cancellation, action handoff, and focus return |
| Search for a file or command | [Quick Input](../../../src/vs/platform/quickinput/common/quickInput.ts) | Filtering, selection, acceptance, Escape, and focus return |
| Ask for a blocking decision | [IDialogService](../../../src/vs/platform/dialogs/common/dialogs.ts) | Serialized dialogs, platform choice, accessible naming, and modality |
| Report nonblocking progress or status | [INotificationService](../../../src/vs/platform/notification/common/notification.ts) | Existing timing, action, focus, and notification-center behavior |
| Host a genuinely new anchored surface | [IContextViewService](../../../src/vs/platform/contextview/browser/contextView.ts) | Owner/container, layout, render disposal, and close lifecycle; the delegate still owns appropriate content and keyboard behavior |

### Keep one task in front

- **Replace competing popups.** Opening an unrelated picker or menu should end the previous temporary task, not leave a trail of surfaces to dismiss. Keep the current selection or draft in the owning feature if it must survive. The shared [context view](../../../src/vs/base/browser/ui/contextview/contextview.ts) replaces its visible delegate; the [hover service](../../../src/vs/platform/hover/browser/hoverService.ts) hides hovers when a context menu opens.
- **Keep child surfaces subordinate.** A submenu or help hover inside an active surface may be necessary. Anchor it to that parent, preserve the parent while entering the child, and close descendants when the parent closes. Escape should dismiss the active child first and return to its trigger, without accidentally closing the whole task. Use the existing menu or hover lifecycle. The hover service bounds nesting; that safety limit is not a target for feature design.
- **Avoid modal-over-modal workflows.** Put validation and recoverable errors in the current dialog. Move a longer task to an editor or replace the current step instead of opening a second custom modal. The [dialog service](../../../src/vs/workbench/services/dialogs/common/dialogService.ts) queues requests, and the [browser handler](../../../src/vs/workbench/browser/parts/dialogs/dialog.web.contribution.ts) and [desktop handler](../../../src/vs/workbench/electron-browser/parts/dialogs/dialog.contribution.ts) process them one at a time. Don't await a queued dialog from content that prevents the current dialog from closing.
- **Allow necessary confirmation, not arbitrary nesting.** Closing a dirty modal editor can require an existing save confirmation. That is a decision about leaving the current task, not permission to build a multi-dialog wizard. Use the owning editor/dialog services and verify focus returns to the editor on cancellation.

For example, a context-menu action that needs confirmation should hand off to the dialog after the menu is dismissed. A configuration error in that dialog should be shown there, not in another modal. Choosing a value from a select inside it is a subordinate interaction, not a second blocking task.

### Stack within the owner

Visual lift, paint order, and modality are separate choices. Changing a shadow does not change hit testing; raising z-index does not trap focus; `aria-modal` does not disable background controls.

Start with the existing overlay host. The [z-index registry](../../../src/vs/platform/layout/browser/zIndexRegistry.ts) defines named relative layers, but it does not own every current surface. Context views, Quick Input, dialogs, notifications, and modal editors also have host- or CSS-owned ordering. Do not copy their numeric values into a feature or treat the registry as a complete global stack.

For a genuinely new registered layer, use `registerZIndex` within the appropriate existing band rather than another magic number. For a child overlay, use the owner's supported hosting API instead. An ancestor's overflow, transform, opacity, or stacking context can trap or clip an ordinary descendant; a larger z-index cannot escape it. A browser top-layer popover follows different paint ordering from ordinary CSS stacking.

Where a context view must remain owned by a modal or shadow-root container, use the supported `hostAsPopover` path with that owner when appropriate. The context-view host manages top-layer presentation, focus return, key isolation, outside-pointer dismissal, and fixed-position fallback. Don't portal interactive content to an arbitrary document body and then patch the focus trap to find it.

Keep the trigger and relevant content visible near viewport edges. Use the host's layout and repositioning behavior; constrain and scroll the overlay's content rather than clipping actions or adding nested page-sized scroll regions. Close or reposition when the anchor disappears. A native menu or dialog is platform-owned and cannot be reordered with web CSS.

### Compose only what is missing

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

## High contrast

Preserve the relationship when shadows are weak or absent. In dark themes, overlapping fills can merge; in high contrast, a clear contour is more useful than a soft shadow. Check the actual surface, text, boundary, and focus colors together.

In high-contrast themes, use explicit, theme-aware boundaries rather than relying on a soft shadow. New surfaces should remove decorative shadows and retain a solid contour. Existing components may provide different high-contrast treatments; preserve their accessibility styling. Keep a focus indicator distinct from the surface boundary.

Pair the component's background and foreground, including text, links, icons, selection, and focus. Don't assume higher always means lighter, force white into an overlay, or substitute a generic raised fill for a component customization key. Check the final composited colors, not just token names; transparent user overrides and material layers can expose content underneath.

`workbench.shadows: false` removes part-level depth, active-tab shadows, and `sm`; it deliberately preserves floating overlays using `lg` and `xl`. Modern UI also flattens part-level shadows. Neither should be described as a global no-shadows mode.

Scroll shadows are a separate affordance: `scrollbar.shadow` and component-specific sticky-scroll shadows indicate content passing under an edge. Show them when content is actually occluded, not as permanent lift on every header.

### Keyboard and assistive technology

An ordinary tooltip should not steal focus. An interactive hover needs a supported keyboard entry and exit. Preserve the service's focused-hover behavior, including any focus cycling used for accessibility, without declaring the background modal.

For a modal, move focus into the task, keep Tab and Shift+Tab inside the active modal and its supported child surfaces, and prevent interaction with the background. Give the surface an accessible name and a clear exit. Preserve the owner's cancellation policy; a click on the backdrop is not a universal cancel action. Restore focus to the trigger, or a logical continuation if that trigger no longer exists.

Test a child dropdown or submenu while the parent is open. Focus must remain visibly associated with the active surface, and a single Escape must not propagate into several dismissals. Shadow, dimming, size, and animation do not communicate these semantics to assistive technology.

### Keep depth inexpensive

Prefer a static shared shadow on one surface over layered blur effects on every descendant. Don't animate shadow blur, spread, or a large backdrop on hover or scroll. If an entrance needs motion, use the owning component's [motion contract](../../../src/vs/platform/theme/common/motion/motion.design.md), preserve reduced motion, and keep geometry and hit targets stable.

Mount temporary content only while needed. Dispose listeners, observers, and child surfaces when their owner closes; don't leave an invisible full-window layer intercepting input. Reuse host layout instead of introducing per-frame geometry polling or repeated synchronous measurements during scrolling. Measure the actual scrolling, resizing, and opening scenario before adding compositing hints such as `will-change`.

### Check before shipping

- Name the task, owner, receiving surface, and reason to overlap. If spacing or a border explains the grouping, don't add lift.
- Trace the actual host, shadow owner, color pair, border, and close path before editing styles. Check whether a wrapper already casts a shadow.
- Verify light, dark, high-contrast dark, and high-contrast light themes, including customized backgrounds and borders.
- With part shadows turned off, confirm overlays still separate and docked regions don't regain decorative shadows.
- Check zoom, narrow windows, viewport edges, and scroll containers. Keep content and controls reachable; don't crop the shadow or hide the triggering context unnecessarily.
- Open a sibling popup, enter a child popup, cancel it, and close its parent. Verify keyboard entry, visible focus, Escape where supported, and return focus without stale surfaces.
- Exercise any modal-editor confirmation and native/custom dialog path the change touches. Don't assume an abstract example covers native behavior.
- Provide an accessible name and appropriate roles through the existing component. Neither a shadow nor a backdrop communicates modality to assistive technology.
- Use hover and selection styling for interaction states. Don't lift every row on hover. Check opening, scrolling, and resize responsiveness; reduced motion must preserve the same task and exit.

## Source contracts

- [Workbench shadow ramp and preference overrides](../../../src/vs/workbench/browser/media/style.css)
- [Widget shadow and border colors](../../../src/vs/platform/theme/common/colors/editorColors.ts)
- [Semantic surface colors](../../../src/vs/platform/theme/common/colors/semanticColors.ts)
- [Radius and stroke tokens](../../../src/vs/platform/theme/common/sizes/baseSizes.ts)
- [Editor hover styles](../../../src/vs/editor/contrib/hover/browser/hover.css)
- [Quick Input styles](../../../src/vs/platform/quickinput/browser/media/quickInput.css)
- [Custom-dialog styles](../../../src/vs/base/browser/ui/dialog/dialog.css)
- [Menu styling](../../../src/vs/base/browser/ui/menu/menu.ts)
- [Notification toast styles](../../../src/vs/workbench/browser/parts/notifications/media/notificationsToasts.css)
- [Modern UI part-shadow treatment](../../../src/vs/workbench/contrib/modernUI/browser/media/shadows.css)
- [Shared widget styles](../../../src/vs/platform/theme/browser/defaultStyles.ts)
- [Context view hosting and lifecycle](../../../src/vs/platform/contextview/browser/contextViewService.ts)
- [Context view positioning and popover implementation](../../../src/vs/base/browser/ui/contextview/contextview.ts)
- [Hover nesting and dismissal](../../../src/vs/platform/hover/browser/hoverService.ts)
- [Named stacking layers](../../../src/vs/platform/layout/browser/zIndexRegistry.ts)
- [Dialog queue](../../../src/vs/workbench/common/dialogs.ts)
- [Modal editor host](../../../src/vs/workbench/browser/parts/editor/modalEditorPart.ts)
