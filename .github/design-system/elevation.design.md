# Elevation

## Introduction

Use elevation to show which surface owns the next action while keeping the underlying work recognizable. Choose a working relationship before styling depth; visual lift does not determine paint order or modality.

## Surface hierarchy

Apply [Elevation is encoded](../skills/design-philosophy/SKILL.md#5-elevation-is-encoded-not-eyeballed) by choosing the least intrusive relationship that supports the task:

| Relationship | Purpose | VS Code example | Visual treatment |
| --- | --- | --- | --- |
| Beside the work | Keep navigation and supporting tools available | Explorer, editor groups, Terminal | Distinct layout regions; spacing, surface fills, and separators before shadows |
| Inside a surface | Group related content without implying another window | Settings sections, an expanded details region | Spacing or a quiet boundary; no default lift |
| Above the work | Offer temporary information or an action without rearranging the workspace | Hover, context menu, Command Palette, notification toast | Component-owned fill and boundary, with an overlay shadow |
| Blocking the work | Protect a decision that must be resolved first | Save changes confirmation | Dialog, modal backdrop, and managed focus |

These roles are not numeric z-index levels. Selection or importance alone does not justify another surface.

### Choose the working context

Use an editor for content people read, edit, compare, or revisit. Use a docked view or panel for tools needed alongside it.

A temporary overlay fits when briefly covering the work costs less than leaving it. Keep local help near its trigger; use Quick Input for workspace-wide choices.

Move sustained reading, multistep tasks, and repeated comparisons to an editor or view instead of adding popups.

The [modal editor](../../src/vs/workbench/browser/parts/editor/modalEditorPart.ts) is a temporary, constrained editor host, not a confirmation dialog or new document type. Preserve its close and move-to-editor behavior where supported.

Reuse that host when the feature needs it. An ordinary editor over a dimmed rectangle does not implement its contract.

## What makes elevation

Depth is a combination of cues. A shadow alone cannot explain ownership, interactivity, or whether the underlying task is available.

### Fill and foreground

Pair the component's background and foreground so underlying text does not show through. Higher does not always mean lighter; accent color communicates action or state.

### Boundary and shape

Preserve the component's border and radius. In high contrast, a solid contour must separate the surface without a shadow; contained groups need no additional floating frame.

### Shadow and receiving surface

Let the outer overlapping surface own the shared shadow. Rows and contained groups do not need independent lift.

### Placement and behavior

Anchor local help to its source and reserve window-level placement for window-level tasks. Use the owning modal host or dialog service for blocking behavior.

Transparency and blur are optional materials, not prerequisites for elevation.

## Product scenarios

Use the following relationships to shorten the path from finding something to acting on it.

### Navigate without losing the editor

Keep Explorer and Terminal beside the editor for repeated navigation and checking output. Separate floating cards would compete with the working layout.

Use `sideBar.background`, `editor.background`, and `panel.background` for their actual regions. Preserve resize sashes and the active editor's focus indicator.

### Inspect a symbol in place

Place a hover near the symbol it explains, avoiding relevant code where possible. Let the existing controller handle repositioning and dismissal.

Reuse `editorHoverWidget.background`, `editorHoverWidget.foreground`, `editorHoverWidget.border`, and the shared `lg` shadow. Keep content hoverable and dismissible without requiring precise pointer movement across a gap.

### Jump to another file or command

Quick Open and the Command Palette use window-level placement and an `xl` shadow for a workspace-wide choice. The editor remains in place underneath.

Reuse Quick Input with its keyboard navigation, filtering, Escape, and focus restoration. Do not dim the workspace merely to emphasize a picker.

### Resolve a decision before continuing

Use the dialog service for decisions such as closing an unsaved file. It keeps focus trapping, accessible naming, dismissal policy, and return focus together.

Reuse the complete dialog, not one styling layer. Native dialogs retain platform styling; a completed background task normally needs a notification, not modal interruption.

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

The numbered cues pair fill and text, define the boundary, and separate the overlay from its receiving surface. Only the outer overlay casts a shadow.

The contained group belongs to that surface. This geometry is illustrative, not a popup layout specification.

### Overlay hosting study

Both overlays extend beyond a scroll container; raising the descendant's z-index cannot escape its clipping. The supported overlay host keeps content visible without removing necessary scrolling.

A modal's child surface must retain that modal's ownership.

### Shadow comparison study

Only the shadow changes; size, fill, and shape stay fixed. These recipes are not four prescribed component styles or z-index levels.

## Shadow scale

Reuse the `--vscode-shadow-*` scale in [workbench styles](../../src/vs/workbench/browser/media/style.css). These CSS recipes are not distances, z-index values, or theme-color IDs.

Do not create a feature-specific elevation scale or treat the ramp as a theme-dependent lighting model. Colors and contours must carry separation when shadows are subtle.

### Existing surface treatments

These are implemented treatments, not a requirement to make every surface look identical.

| Surface | Existing treatment | Reuse |
| --- | --- | --- |
| Custom menus and submenus | `lg`, menu colors and geometry; theme-color shadow fallback outside the workbench ramp | [Menu styling](../../src/vs/base/browser/ui/menu/menu.ts) and [default styles](../../src/vs/platform/theme/browser/defaultStyles.ts) |
| Editor and workbench hovers | `lg` with hover colors; their existing corner geometry differs | [Editor hover](../../src/vs/editor/contrib/hover/browser/hover.css), [workbench hover](../../src/vs/platform/hover/browser/hover.css) |
| Custom select dropdowns | `lg`; native selects remain platform-owned | [SelectBox styles](../../src/vs/base/browser/ui/selectBox/selectBoxCustom.css) |
| Quick Input | `xl`, Quick Input colors and its own focus lifecycle | [Quick Input styles](../../src/vs/platform/quickinput/browser/media/quickInput.css) |
| Custom dialogs | `xl` on the dialog plus a separate wrapper shadow using `dialogShadow` from `widget.shadow` | [Dialog styles](../../src/vs/base/browser/ui/dialog/dialog.css), [style application](../../src/vs/base/browser/ui/dialog/dialog.ts) |
| Notification toasts | `lg` on the list container; existing notification geometry | [Toast styles](../../src/vs/workbench/browser/parts/notifications/media/notificationsToasts.css) |
| Modal editors | `xl` on their wrapper, editor fill and a blocking backdrop | [Modal editor styles](../../src/vs/workbench/browser/parts/editor/media/modalEditorPart.css) |
| Workbench parts | `md` is used by title/activity bars; separate directional depth and active-tab recipes also exist | [Title bar](../../src/vs/workbench/browser/parts/titlebar/media/titlebarpart.css), [activity bar](../../src/vs/workbench/browser/parts/activitybar/media/activitybarpart.css), [shared recipes](../../src/vs/workbench/browser/media/style.css) |

Preserve component-owned differences in shadow ownership, theme fallbacks, corners, and high-contrast suppression. Shared-component changes need checks of normal, high-contrast, native, and embedded uses.

### Small shadow

Subtle workbench separation, suppressed by the shadow preference and Modern UI's flat-part treatment. Do not use it for overlays that must retain separation.

### Medium shadow

Workbench chrome such as title and activity bars. This is not a prescribed card level.

### Large shadow

Local floating surfaces: editor hovers, menus, custom select dropdowns, and notification toasts. Keep the component's own surface colors and border.

### Extra-large shadow

Used by Quick Input, custom-dialog shells, and modal-editor wrappers. A shadow doesn't make a surface modal; its interaction contract does.

## Elevation by role

Choose radius by [surface family](../skills/design-philosophy/SKILL.md#elevation-tiers), not shadow size. Preserve existing component geometry, including notification containers, instead of forcing a universal radius.

## Implementation

Prefer the existing component or service over a hand-built overlay. Its positioning, keyboard behavior, and lifecycle matter as much as its CSS.

| Need | Owner | Preserve |
| --- | --- | --- |
| Explain a symbol or control | Existing editor hover controller or [IHoverService](../../src/vs/platform/hover/browser/hover.ts) | Anchoring, keyboard entry, dismissal, and related-hover lifecycle |
| Offer a short set of actions | [IContextMenuService](../../src/vs/platform/contextview/browser/contextView.ts) | Submenu navigation, cancellation, action handoff, and focus return |
| Search for a file or command | [Quick Input](../../src/vs/platform/quickinput/common/quickInput.ts) | Filtering, selection, acceptance, Escape, and focus return |
| Ask for a blocking decision | [IDialogService](../../src/vs/platform/dialogs/common/dialogs.ts) | Serialized dialogs, platform choice, accessible naming, and modality |
| Report nonblocking progress or status | [INotificationService](../../src/vs/platform/notification/common/notification.ts) | Existing timing, action, focus, and notification-center behavior |
| Host a genuinely new anchored surface | [IContextViewService](../../src/vs/platform/contextview/browser/contextView.ts) | Owner/container, layout, render disposal, and close lifecycle; the delegate still owns appropriate content and keyboard behavior |

### Keep one task in front

- Replace unrelated popups rather than leaving a trail to dismiss. Keep any surviving selection or draft in the owning feature.
- Anchor necessary child surfaces to their parent and close descendants when it closes. Escape dismisses the active child first and returns to its trigger.
- Keep validation and recoverable errors in the current dialog. Replace a step or move longer work to an editor instead of stacking custom modals.
- Preserve existing save confirmation when leaving a dirty modal editor. Verify cancellation returns focus to the editor.

The [context view](../../src/vs/base/browser/ui/contextview/contextview.ts) replaces its delegate; [hover services](../../src/vs/platform/hover/browser/hoverService.ts) coordinate nesting and menu dismissal. Their safety limits are not design targets.

The [dialog service](../../src/vs/workbench/services/dialogs/common/dialogService.ts) queues requests for serial handling. Do not await a queued dialog from content that prevents the current one closing.

A menu action needing confirmation hands off after the menu closes. A select inside that dialog is a subordinate interaction, not another blocking task.

### Stack within the owner

Use the existing host to preserve paint order, interaction, and focus together. Neither z-index nor `aria-modal` alone prevents background interaction.

The [z-index registry](../../src/vs/platform/layout/browser/zIndexRegistry.ts) defines named relative layers, not a complete global stack. Context views, Quick Input, dialogs, notifications, and modal editors also retain host- or CSS-owned ordering.

Use `registerZIndex` in an existing band for a genuinely new registered layer. Use the owner's hosting API for child overlays instead of copying numeric layers.

Ancestor overflow and stacking contexts can clip or trap ordinary descendants; higher z-index cannot escape them. Browser top-layer popovers follow different paint ordering.

Where appropriate, use `hostAsPopover` with the owning modal or shadow-root container. The host manages top-layer presentation, focus return, key isolation, outside-pointer dismissal, and fixed-position fallback.

Do not portal content to an arbitrary body and patch the focus trap afterward.

Use host layout near viewport edges; constrain and scroll content rather than clipping actions. Close or reposition when the anchor disappears.

Native menus and dialogs remain platform-owned; web CSS cannot reorder them.

### Compose only what is missing

For a genuinely new local inspection surface, compose existing tokens as below. This is not a replacement for the hover controller or a global utility:

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

`widget.shadow` is a themeable color, not a complete `box-shadow` value; `widget.border` supplies a generic high-contrast boundary. Prefer the component's specific style contract.

Generic content can use `color.background.canvas` and `color.background.raised` with compatible text. These roles do not replace editor, menu, or picker customization keys.

## High contrast

Preserve separation when shadows are weak or absent. Check the composited surface, text, boundary, and focus colors together.

New high-contrast surfaces should remove decorative shadows and retain a solid contour. Preserve existing components' accessibility styling and keep focus distinct from the surface boundary.

Check text, links, icons, and selection against actual backgrounds, including transparent user overrides. Follow [color guidance](./colors.design.md#preserve-component-contracts) for component contracts and rendered contrast.

`workbench.shadows: false` removes part-level depth, active-tab shadows, and `sm`, while preserving floating overlays using `lg` and `xl`. Modern UI also flattens part shadows.

Neither treatment is a global no-shadows mode. Scroll shadows indicate occluded content, not permanent lift on every header.

### Keyboard and assistive technology

Ordinary tooltips must not steal focus. Interactive hovers need supported keyboard entry and exit, including the service's accessibility focus cycling, without making the background modal.

For modals, move focus into the task and prevent background interaction. Keep Tab and Shift+Tab within the active modal and supported child surfaces.

Provide an accessible name and clear exit. Preserve cancellation policy; clicking the backdrop is not a universal cancel action.

Restore focus to the trigger or a logical continuation when it no longer exists. Test child popups for visible focus and Escape without multiple dismissals.

Use the [accessibility workflow](../skills/accessibility/SKILL.md) for semantics and keyboard behavior. Shadow and dimming cannot communicate modality to assistive technology.

### Keep depth inexpensive

Prefer one static shadow over layered descendant blur. Do not animate shadow blur, spread, or large backdrops on hover or scroll.

Use the component's [motion contract](./motion.design.md) for entrances, reduced motion, and rendering cost.

Mount temporary content only while needed; dispose listeners, observers, and child surfaces when their owner closes. No invisible full-window layer should intercept input afterward.

Reuse host layout instead of per-frame polling or repeated synchronous scroll measurements. Measure opening, resizing, and scrolling before adding `will-change`.

### Check before shipping

- The surface supports a named task with the least intrusive relationship.
- The owning component supplies one coherent fill, boundary, shadow, and close path.
- Separation and focus remain clear across all four theme types and customized colors.
- Turning off part shadows preserves overlay separation without restoring decorative part shadows.
- Zoom, narrow windows, scrolling, and viewport edges leave triggers and actions reachable.
- Sibling and child popups preserve keyboard entry, visible focus, dismissal order, and return focus.
- Touched modal-editor confirmations and native/custom dialogs preserve their actual ownership and cancellation behavior.
- Opening, scrolling, resizing, and reduced motion preserve the task without stale rendering or input-blocking layers.

## Source contracts

- [Workbench shadow ramp and preference overrides](../../src/vs/workbench/browser/media/style.css)
- [Widget shadow and border colors](../../src/vs/platform/theme/common/colors/editorColors.ts)
- [Semantic surface colors](../../src/vs/platform/theme/common/colors/semanticColors.ts)
- [Radius and stroke tokens](../../src/vs/platform/theme/common/sizes/baseSizes.ts)
- [Editor hover styles](../../src/vs/editor/contrib/hover/browser/hover.css)
- [Quick Input styles](../../src/vs/platform/quickinput/browser/media/quickInput.css)
- [Custom-dialog styles](../../src/vs/base/browser/ui/dialog/dialog.css)
- [Menu styling](../../src/vs/base/browser/ui/menu/menu.ts)
- [Notification toast styles](../../src/vs/workbench/browser/parts/notifications/media/notificationsToasts.css)
- [Modern UI part-shadow treatment](../../src/vs/workbench/contrib/modernUI/browser/media/shadows.css)
- [Shared widget styles](../../src/vs/platform/theme/browser/defaultStyles.ts)
- [Context view hosting and lifecycle](../../src/vs/platform/contextview/browser/contextViewService.ts)
- [Context view positioning and popover implementation](../../src/vs/base/browser/ui/contextview/contextview.ts)
- [Hover nesting and dismissal](../../src/vs/platform/hover/browser/hoverService.ts)
- [Named stacking layers](../../src/vs/platform/layout/browser/zIndexRegistry.ts)
- [Dialog queue](../../src/vs/workbench/common/dialogs.ts)
- [Modal editor host](../../src/vs/workbench/browser/parts/editor/modalEditorPart.ts)
