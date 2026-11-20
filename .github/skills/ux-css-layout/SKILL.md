---
name: ux-css-layout
description: VS Code CSS conventions, SplitView/Grid layout, semantic sizes, rounded-surface geometry, clipping, scrollable content, and text overflow. Use when writing CSS, building layouts, or fixing corners, panel gaps, or text truncation.
---

This skill covers CSS file organization, naming, standard sizes, programmatic layout (SplitView, Grid, scrollable), responsive patterns, and text overflow handling.

---

## 1. File Organization

CSS files are **co-located** with their TypeScript components:

```
src/vs/base/browser/ui/button/
    button.ts
    button.css
src/vs/workbench/contrib/myFeature/browser/
    myFeature.ts
    media/
        myFeature.css
```

Import CSS directly in the TS file:
```typescript
import './media/myFeature.css';
// or for base widgets:
import './button.css';
```

Workbench-level global styles live in `src/vs/workbench/browser/media/`.

## 2. Class Naming

- **`monaco-` prefix** for all major components: `.monaco-workbench`, `.monaco-split-view2`, `.monaco-scrollable-element`
- **Modifier classes**: `.monaco-split-view2.vertical`, `.monaco-split-view2.horizontal`
- **State classes**: `.visible`, `.focused`, `.active`, `.highlight`
- Feature-specific classes use kebab-case without prefix: `.my-feature`, `.outline-pane`, `.welcome-view-content`

## 3. Standard Sizes

| Element | Size |
|---------|------|
| Part title height | 35px |
| Title padding (horizontal) | 8px |
| Title label inner padding | 12px |
| Action area padding | 5px |
| Action icon size | 16px |
| Body font-size | 13px (workbench), 11px (HTML body) |
| Line height | 1.4em |
| Validation message font-size | 12px (line-height: 17px) |

> For `padding`/`margin`/`gap`, `border-radius`, `font-size`/`font-weight`, codicon size and border width, prefer the design-system **size tokens** over raw px — see [§10 Design-System Size Tokens](#10-design-system-size-tokens-spacing-radius-font-codicon-stroke). Canonical reference: `.github/instructions/design-tokens.instructions.md` (auto-injected for `src/vs/**/*.css`).


## 4. CSS Selector Quality

| Anti-pattern (flagged) | Correct pattern |
|------------------------|-----------------|
| ID selectors for styling (`#my-widget`) | Class selectors (`.my-widget`) |
| Overly specific selectors | Minimal specificity needed |
| Styles in the wrong file | Co-located with the component |
| Missing `min-width: 0` on flex children | Prevents truncation issues |
| Forgetting `pointer-events: none` on hidden overlays | Prevents click-through bugs |

### Never Add New `!important`

Do not introduce `!important` in new or modified CSS. When a declaration loses the cascade, inspect the competing selector and increase specificity with the smallest appropriate component, workbench, or state-class prefix instead. Existing `!important` declarations may be preserved and must not be removed mechanically during unrelated edits. Do not copy them, add new ones, or use them to avoid understanding selector ownership.

The narrow exception is shared focus/active-outline suppression, where `outline: 0 !important` is intentionally used to override native or global focus indicators and prevent flashing outlines during pointer activation. Keep this exception scoped to focus-indicator behavior; feature styling must still resolve cascade conflicts through selector specificity.

Represent semantic state explicitly rather than inferring it from incidental DOM order. For example, a content node ceasing to be `:last-child` does not prove a footer exists: completion widgets can append siblings and leave them mounted while hidden. Let the component that creates/removes the footer own its state class, and test unrelated trailing siblings.

## 5. SplitView Layout

**File**: `src/vs/base/browser/ui/splitview/splitview.ts`

For splitting views with draggable sashes (either horizontal or vertical):

```typescript
const splitView = new SplitView(container, {
    orientation: Orientation.VERTICAL,
    proportionalLayout: true,
    styles: { separatorBorder: asCssVariable(sashBorder) }
});

// Each view implements IView:
const myView: IView = {
    element: myDomNode,
    minimumSize: 100,
    maximumSize: Number.POSITIVE_INFINITY,
    onDidChange: Event.None,
    layout(size, offset) { /* resize content */ }
};

splitView.addView(myView, Sizing.Distribute);
```

Use `LayoutPriority.High` / `.Low` to control which views resize first when space is constrained. Use `snap: true` to allow views to snap closed.

## 6. Grid Layout

**File**: `src/vs/base/browser/ui/grid/grid.ts`

For 2D layouts (used by editor groups):
```typescript
const grid = new Grid(initialView);
grid.addView(newView, Sizing.Distribute, referenceView, Direction.Right);
```

## 7. Scrollable Content

Three classes for different needs:

| Class | When to Use |
|-------|-------------|
| `SmoothScrollableElement` | Animated scrolling (SplitView, ListView) |
| `DomScrollableElement` | Wrap existing DOM content (hovers, menus, breadcrumbs) |
| `ScrollableElement` | Basic single-direction scrollbar |

```typescript
const scrollable = new DomScrollableElement(contentNode, {
    horizontal: ScrollbarVisibility.Auto,
    vertical: ScrollbarVisibility.Auto
});
this._register(scrollable);
container.appendChild(scrollable.getDomNode());
scrollable.scanDomNode(); // call after content changes
```

Keep scroll handlers lightweight: batch layout reads before writes, coalesce duplicate measurements, and skip unchanged CSSOM writes. Cache numeric values rather than comparing rounded style strings. Validate both unchanged scrolling and resizing that changes appearance without changing the item count.

For content-sized lists and trees, distinguish logical item height from the complete scroll extent. Horizontal-scrollbar reservation can make `scrollHeight` larger than `contentHeight`; size a floating host from the extent it must actually display, with its own chrome accounted for separately. Test horizontal scrolling enabled and disabled.

Verify actual scrollbar dragging and pointer acquisition after changing margins or clipping. In maximized/fullscreen layouts, check screen-edge hit regions as well as visual placement; an inset control must not become unnecessarily difficult to acquire.

## 8. Responsive Layout

VS Code does **not** use CSS media queries. Instead, it uses a **programmatic constraint-based layout system**:

- `IView.minimumSize` / `maximumSize` — views declare their size constraints.
- `SplitView` and `Grid` distribute space according to constraints and `LayoutPriority`.
- `dom.DisposableResizeObserver` (not a raw `ResizeObserver`) is used for container-aware sizing (e.g., editor auto-layout).
- The window is treated as a fixed viewport; space is distributed via sash-based resizing.

When building a responsive component:
1. Set `minimumSize` / `maximumSize` appropriately.
2. Use `LayoutPriority.Low` for panels that should collapse first.
3. Use `snap: true` for panels that should snap closed when too small.
4. Fire `onDidChange` when your constraints change dynamically.

Validate layout at the boundaries where dimensions are consumed:

- Keep grid allocation, CSS margins/borders, and child-content dimensions consistent. Exercise the real `layout()` path and inspect both root bounds and dimensions passed to children; helper values and outer screenshots alone cannot prove content fits.
- Read current viewport and density state during layout rather than relying solely on constructor-selected behavior. Test transitions in both directions on the same instance, including collapse/expand and narrow/wide layouts, without shifting unrelated siblings.
- Use existing screen-aware sizing helpers and the target window's effective pixel ratio for fractional scaling. Zoom alone is not device pixel ratio. Check margins, borders, and gap symmetry in CSS coordinates and physical pixels instead of adding compensating pixels or arbitrary tolerances.
- Keep startup/restored geometry aligned with runtime layout, including missing-state fallbacks. Check affected visibility, density, and window variants, and preserve intentional exclusions such as modal or auxiliary surfaces.
- Keep inter-panel spacing separate from pane-internal padding, exterior gutters, and the frame's reserved stroke. Before changing a shared margin helper, inspect all consumers. Test zero, one-pixel, odd, and maximum supported gaps; small gaps cannot fund an unconditional inset on both sides.
- Resolve configurable geometry consistently for CSS, numeric grid layout, startup paint, and auxiliary/native content. Clearing a customization must restore inheritance. Preserve resolved appearance when stale saved bounds are discarded; invalid geometry does not necessarily invalidate the user's size preferences.
- Refresh derived sash endpoints and gripper placement after grid topology changes such as moving or aligning a panel, not only after a window resize. Check odd-gap centers, newly created sashes, and removal of stale state when returning to compact or gapless layouts.

### Floating and docked surfaces

- Capture the visible shared grid node's dimensions before hiding it, even when one of its logical children is already hidden. Verify resize, close/reopen, reload, and orientation changes, preserving separate width preferences where horizontal and stacked layouts intentionally differ.
- Derive detached-window frames from that window's own insets and visible layout, not mirrored main-window classes. Include main/detached combinations that disagree about visible editors or tab counts.
- Exercise hover-preview, pin/unpin, focus transfer into nested popups, deferred blur, and pointer exit through the production controller. A queued blur must not consume a newly started exit grace period. Use controlled timers to verify ordering instead of increasing delays, and restore docked sizing/padding when floating mode ends.

## 9. Text Overflow & Ellipsis

All text labels that can be truncated by a resizable container **must** use the ellipsis pattern. Clipped text without an ellipsis is a visual bug.

### Standard Ellipsis Pattern (CSS)

The three-property combo is required — all three must be present:

```css
.my-label {
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}
```

### Common Locations That Need Ellipsis

| Element | Why |
|---------|-----|
| Part title labels (`h2`, breadcrumbs) | Sidebar/panel can be resized narrower than the title |
| View pane header titles | View containers can be narrow |
| List/tree row labels | Rows have a fixed width from the list container |
| Tab labels (editor tabs) | Many tabs shrink to fit |
| Button labels in welcome views | Buttons have `max-width` constraints |
| Status bar items | Many items compete for horizontal space |
| Notification message text | Notification toast/center has fixed width |
| Tooltip/hover headings | Hovers have max-width |
| Dropdown/select items | Select boxes have bounded width |
| Badge text / descriptions | Auxiliary text in constrained columns |

### Flex Container Gotchas

Flex children default to `min-width: auto`, which **prevents** `text-overflow: ellipsis` from working because the flex item refuses to shrink below its content width. Fix this by setting `min-width: 0` on the flex child:

```css
/* WRONG — ellipsis will NOT trigger inside a flex container */
.flex-parent {
	display: flex;
}
.flex-parent > .label {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

/* CORRECT — add min-width: 0 so the flex item can shrink */
.flex-parent > .label {
	min-width: 0;          /* ← this is the fix */
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
```

This pattern is used throughout VS Code — for example, `.monaco-icon-label-container` sets `min-width: 0` and `flex: 1` to allow label text to truncate.

### Fixed vs Flexible Elements

When a row has both fixed-size elements (icons, action buttons) and flexible text:

```css
.row {
	display: flex;
	align-items: center;
}
.row > .icon {
	flex-shrink: 0;        /* icon never shrinks */
	width: 16px;
}
.row > .label {
	flex: 1;               /* label takes remaining space */
	min-width: 0;          /* allows shrinking below content width */
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.row > .actions {
	flex-shrink: 0;        /* action buttons never shrink */
}
```

This is the standard pattern for tree rows, list items, tab labels, and view pane headers.

### Hover for Full Text

When text is truncated with ellipsis, the **full text must be accessible** via hover tooltip. Use `IHoverService.setupDelayedHover()` with the full untruncated text so users can read it:

```typescript
this._register(this.hoverService.setupDelayedHover(labelElement, {
	content: fullLabelText,
}));
```

For `IconLabel` and list/tree renderers, this is handled automatically. For custom DOM, you must add it manually.

### Anti-Patterns (NEVER DO)

- **Never** let single-line text labels clip without an ellipsis. This rule applies to labels, not structural clipping containers or overflow masks.
- **Never** rely on a fixed pixel width for text that could be localized — localized strings vary in length.
- **Never** use `text-overflow: ellipsis` without `overflow: hidden` and `white-space: nowrap` — all three are required.
- **Never** forget `min-width: 0` on flex children that need to truncate.
- **Never** truncate text without providing a hover/tooltip for the full string.

### Clipping and Alignment

- Measure content items separately from adjacent actions and toolbars. Recalculate clipping when labels, status indicators, or actions change width, even if the viewport is unchanged.
- Check first/last and partially visible items with long labels and combined hover/focus/selection states. Masks must not cover actions or scroll hit targets. Recreated overflow edges must preserve the source edge's shape and border state, and clear stale state when clipping ends.
- Keep hover/focus geometry stable so controls do not jump under the pointer. Test state transitions on existing elements as well as fresh renders.
- Define which semantic value should align in compound badges or labels. Centering a variable-width string does not preserve the alignment of its trailing status; compare short and long compound values alongside single-value rows.

### Rounded-surface geometry

- Trace the painted perimeter through the production ancestors before changing a radius or overflow rule. Identify the owner of the frame stroke, content paint, material layer, connected cap, and overlays. A child can report the correct radius while an ancestor clips its outline or content paints over it.
- Match the reference boxes as well as the radius. A pseudo-element positioned inside a host border does not share the host's outer curve merely because it inherits `border-radius`. Use the appropriate border/padding-box geometry; for unequal or elliptical corners, prefer browser-resolved curves over a uniform subtraction.
- Do not repair an obscured corner by clipping the entire content subtree. Progress indicators and fixed completion widgets may intentionally escape it, and transforms or filters can change fixed-position containing blocks. Isolate decorative paint from interactive content and preserve overlay stacking and hit targets.
- Repainting an edge must not create a second, inset frame or double-paint a translucent stroke. Align the replacement paint to the original frame and verify the composited result at all exposed corners, including square corners. A computed radius or an overlay hit test alone cannot prove the perimeter is correct.
- Derive connected caps, clipping fallbacks, and nested frames from the owning surface's semantic radius and effective inset, not a generic default. Honor square/custom radii, asymmetric Activity Bar seams, footer presence, and native window overrides. Check both header and footer ancestors when the Activity Bar can move.
- Verify painted outlines and overlay interactions in the affected browser engines. Include short/narrow panes, retained hidden overlay siblings, footer add/remove, fractional scaling, and the relevant maximized/fullscreen/native-window states. Keep native-platform evidence distinct from a web-only reproduction.

---

## 10. Design-system size tokens

Use the shared foundations for design decisions: [spacing](../design-system/foundations/spacing.design.md), [shape](../design-system/foundations/shape.design.md), [typography](../design-system/foundations/typography.design.md), [icon size](../design-system/foundations/size.design.md), and [stroke](../design-system/foundations/stroke.design.md). Their registrations live in [baseSizes.ts](../../../src/vs/platform/theme/common/sizes/baseSizes.ts).

For CSS application, deprecated aliases, variable validation, and size-inventory generation, follow [design-token instructions](../../instructions/design-tokens.instructions.md). Do not keep a second token table in this layout workflow.

---

## Key Files

| Area | File |
|------|------|
| SplitView | `src/vs/base/browser/ui/splitview/splitview.ts` |
| Grid | `src/vs/base/browser/ui/grid/grid.ts` |
| Scrollbar | `src/vs/base/browser/ui/scrollbar/scrollableElement.ts` |
| Global workbench styles | `src/vs/workbench/browser/media/style.css` |
