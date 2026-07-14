---
name: ux-css-layout
description: VS Code CSS conventions, file organization, class naming, standard sizes, SplitView/Grid layout, scrollable content, responsive layout, and text overflow/ellipsis patterns. Use when writing CSS, building layouts, or fixing text truncation issues.
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

> For `padding`/`margin`/`gap`, `border-radius`, `font-size`/`font-weight`,
> codicon size and border width, prefer the design-system **size tokens** over
> raw px — see [§10 Design-System Size Tokens](#10-design-system-size-tokens-spacing-radius-font-codicon-stroke).
> Canonical reference: `.github/instructions/design-tokens.instructions.md`
> (auto-injected for `src/vs/**/*.css`).


## 4. CSS Selector Quality

| Anti-pattern (flagged) | Correct pattern |
|------------------------|-----------------|
| ID selectors for styling (`#my-widget`) | Class selectors (`.my-widget`) |
| Overly specific selectors | Minimal specificity needed |
| Styles in the wrong file | Co-located with the component |
| Missing `min-width: 0` on flex children | Prevents truncation issues |
| Forgetting `pointer-events: none` on hidden overlays | Prevents click-through bugs |

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

## 8. Responsive Layout

VS Code does **not** use CSS media queries. Instead, it uses a **programmatic constraint-based layout system**:

- `IView.minimumSize` / `maximumSize` — views declare their size constraints.
- `SplitView` and `Grid` distribute space according to constraints and `LayoutPriority`.
- `ResizeObserver` is used for container-aware sizing (e.g., editor auto-layout).
- The window is treated as a fixed viewport; space is distributed via sash-based resizing.

When building a responsive component:
1. Set `minimumSize` / `maximumSize` appropriately.
2. Use `LayoutPriority.Low` for panels that should collapse first.
3. Use `snap: true` for panels that should snap closed when too small.
4. Fire `onDidChange` when your constraints change dynamically.

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

- **Never** let text clip without an ellipsis — if `overflow: hidden` is set, `text-overflow: ellipsis` must also be set.
- **Never** rely on a fixed pixel width for text that could be localized — localized strings vary in length.
- **Never** use `text-overflow: ellipsis` without `overflow: hidden` and `white-space: nowrap` — all three are required.
- **Never** forget `min-width: 0` on flex children that need to truncate.
- **Never** truncate text without providing a hover/tooltip for the full string.

---

## 10. Design-System Size Tokens (spacing, radius, font, codicon, stroke)

VS Code ships a design-system **size** ramp, registered in
`src/vs/platform/theme/common/sizes/baseSizes.ts` (agents font ramp in
`src/vs/sessions/common/sizes.ts`) and emitted as `--vscode-*` CSS variables.
When writing or editing CSS, prefer the token var over a raw px value wherever a
token exists. The full tables + rationale live in the auto-injected
`.github/instructions/design-tokens.instructions.md` (canonical source — keep
this section in sync with it). This section captures the **decision logic** for
deeper styling tasks.

> Every `--vscode-*` size var you reference must already exist in
> `build/lib/stylelint/vscode-known-variables.json` (`"sizes"` array,
> alphabetically sorted) or stylelint/hygiene fails. Adding a *new* token means
> adding it both in `baseSizes.ts` and that JSON file.

### Spacing — `padding`, `margin`, `gap`

Scale (px): `0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40` →
`--vscode-spacing-sizeNone`, `--vscode-spacing-size20` … `--vscode-spacing-size400`
(token number = px × 10, so `size200` = 20px).

**What matters is the value, not the token.** Adopting the `var()` is optional —
a raw px value is fine **as long as it lands on the scale**. What breaks rhythm is
an **off-scale** value (3, 5, 7, 14, 26px…). Snap off-scale values to the nearest
scale value, **ties round up** (`5px → 6px`, `3px → 4px`, `1px → 2px`,
`26px → 28px`). Each length of a shorthand is checked independently
(`0 5px → 0 6px`). Leave `auto`, `%`, `em`/`rem`, `var()`/`calc()` untouched.

### Corner radius — `border-radius`

| px | Variable | Use |
|----|----------|-----|
| 2  | `--vscode-cornerRadius-xSmall` | very compact elements |
| 4  | `--vscode-cornerRadius-small` | controls (buttons, inputs) |
| 6  | `--vscode-cornerRadius-medium` | base / inner surfaces |
| 8  | `--vscode-cornerRadius-large` | prominent / outer surfaces |
| 12 | `--vscode-cornerRadius-xLarge` | very prominent surfaces |
| 9999 | `--vscode-cornerRadius-circle` | fully rounded (pills, dots) |

**Snap map** for off-scale literals (ties round **up**):
`2→xSmall`, `3,4→small`, `5,6→medium`, `7,8→large`, `10,11,12→xLarge`,
`14,16,18,20→xLarge`, `999→circle`.

- **Pills** (radius ≈ half the element height — e.g. `28h`/`14r`, `36h`/`18r`,
  `22×22`/`11r`) → `--vscode-cornerRadius-circle`, **not** xLarge. The
  literal-nearest token would square them and lose the fully-rounded intent.
- **Leave untouched:** `50%`, `0`, `0px`, `inherit`, any `calc()`/`var()`.
  Preserve `!important`.

### Font size & weight

Generic UI ramp — pair a **size** token with a **weight** token (mirrors the
agents ramp; "Strong" = matching size token + `semiBold`, never a separate size):

| px | Size var | Weight |
|----|----------|--------|
| 26 | `--vscode-fontSize-heading1` | semiBold |
| 18 | `--vscode-fontSize-heading2` | semiBold |
| 13 | `--vscode-fontSize-heading3` | semiBold |
| 13 | `--vscode-fontSize-body1` | regular |
| 11 | `--vscode-fontSize-body2` | regular |
| 12 | `--vscode-fontSize-label1` | regular |
| 11 | `--vscode-fontSize-label2` | regular |
| 10 | `--vscode-fontSize-label3` | regular |

Generic weights: `--vscode-fontWeight-regular` (400),
`--vscode-fontWeight-semiBold` (600).

**Deprecated** — `--vscode-bodyFontSize` (13) → `--vscode-fontSize-body1`,
`--vscode-bodyFontSize-small` (12) → `--vscode-fontSize-label1`,
`--vscode-bodyFontSize-xSmall` (11) → `--vscode-fontSize-body2`.

Agents window (`src/vs/sessions/**`) ramp — identical values, `agents-`-prefixed:

| px | Size var | Weight |
|----|----------|--------|
| 26 | `--vscode-agents-fontSize-heading1` | semiBold |
| 18 | `--vscode-agents-fontSize-heading2` | semiBold |
| 13 | `--vscode-agents-fontSize-heading3` | semiBold |
| 13 | `--vscode-agents-fontSize-body1` | regular |
| 11 | `--vscode-agents-fontSize-body2` | regular |
| 12 | `--vscode-agents-fontSize-label1` | regular |
| 11 | `--vscode-agents-fontSize-label2` | regular |
| 10 | `--vscode-agents-fontSize-label3` | regular |

Both weight ramps are **two weights only**: `regular` (400) and
`semiBold` (600) — generic `--vscode-fontWeight-*`, agents
`--vscode-agents-fontWeight-*`.

- **No medium (500).** `font-weight: 500` is off the ramp — snap to `semiBold`.
  Likewise `700`/`bold` → round to the nearer of 400/600.
- **"Strong" is not a separate size.** "Body 1 Strong" = the matching
  `--vscode-fontSize-*` (or `--vscode-agents-fontSize-*`) size token + `semiBold`.
  Never add a strong *size*.
- `normal` ≡ 400 → `regular`. Leave `inherit`, `lighter`, `bolder`,
  `var()`/`calc()` untouched.

### Codicon size — icon `font-size`

Codicons are **only ever 16px or 12px** — never `14px` or any in-between value.

| px | Variable | Use |
|----|----------|-----|
| 16 | `--vscode-codiconFontSize` (base) | default icon size |
| 12 | `--vscode-codiconFontSize-compact` | dense/inline chrome |

**Compact-glyph convention:** when sizing an icon at the compact 12px size, also
swap the registered glyph to its `*Compact` variant (e.g. `Codicon.close` →
`Codicon.closeCompact`, `Codicon.add` → `Codicon.addCompact`). CSS `font-size`
alone only scales the icon — it does **not** change to the visually-optimized
compact glyph; that requires changing the registered icon (Action2 `icon:` /
`renderIcon`). **Only swap the glyph when no CSS selector targets the original
glyph class** (e.g. `.codicon-close`); selectors keyed on the glyph class
(`.codicon-add`, `.codicon-chevron-down`) break when the class becomes
`-compact`, so update those selectors too (or size via a glyph-independent
wrapper class like `.monaco-button`). Some icons (settings/sliders, agent, vm,
info, lock, plus) have **no** compact variant — keep the regular glyph at 12px.

### Stroke — border width

A **single** stroke thickness: `1px` → `--vscode-strokeThickness`. Applies to the
`border: 1px solid <color>` shorthand and `border-width: 1px`. Other widths have
no token — leave them.

```css
/* prefer */  border: var(--vscode-strokeThickness) solid var(--vscode-widget-border);
/* avoid  */  border: 1px solid var(--vscode-widget-border);
```

---

## Key Files

| Area | File |
|------|------|
| SplitView | `src/vs/base/browser/ui/splitview/splitview.ts` |
| Grid | `src/vs/base/browser/ui/grid/grid.ts` |
| Scrollbar | `src/vs/base/browser/ui/scrollbar/scrollableElement.ts` |
| Global workbench styles | `src/vs/workbench/browser/media/style.css` |
