---
name: ux-theming
description: VS Code theming, color tokens, composited surfaces, interaction-state precedence, and high-contrast support. Use when styling widgets, changing hover/focus/selection, or validating rendered theme states.
---

This skill covers color registration, CSS variable usage, widget style patterns, focus indicators, and high-contrast theme requirements.

---

## 1. Registering Colors

**File**: `src/vs/platform/theme/common/colorUtils.ts`

```typescript
export const myWidgetBackground = registerColor('myWidget.background',
    { light: '#ffffff', dark: '#252526', hcDark: Color.black, hcLight: Color.white },
    nls.localize('myWidgetBackground', "Background color of My Widget."));
```

**Rules**:
- Provide defaults for all four theme types: `light`, `dark`, `hcDark`, `hcLight`.
- HC themes must use solid colors (avoid transparency) and set explicit borders via `contrastBorder`.
- Use color transforms for derived colors: `transparent()`, `darken()`, `lighten()`, `oneOf()`.
- Reference existing colors when possible instead of hardcoding hex values.

## 2. Color Categories

| File | Colors |
|------|--------|
| `src/vs/platform/theme/common/colors/baseColors.ts` | `foreground`, `focusBorder`, `contrastBorder`, text links |
| `src/vs/platform/theme/common/colors/editorColors.ts` | Editor widgets, find match, errors/warnings |
| `src/vs/platform/theme/common/colors/inputColors.ts` | Input, toggle, validation |
| `src/vs/platform/theme/common/colors/listColors.ts` | List/tree selection, focus, hover, drop |
| `src/vs/platform/theme/common/colors/miscColors.ts` | Badge, scrollbar, progress bar, sash |
| `src/vs/workbench/common/theme.ts` | Tabs, sidebar, status bar, panels, editor groups, banner |

## 3. Using Colors in CSS

Colors are injected as CSS custom properties on `.monaco-workbench`:

```
Color ID: editor.background
CSS variable: --vscode-editor-background
Usage: var(--vscode-editor-background)
```

Conversion functions in `colorUtils.ts`:
- `asCssVariable(colorId)` → `'var(--vscode-editor-background)'`
- `asCssVariableName(colorId)` → `'--vscode-editor-background'`

**In CSS files**, reference directly:
```css
.my-widget {
    background-color: var(--vscode-editor-background);
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-contrastBorder);
}
```

Trace the rendered control before choosing a token or selector; custom editor overlays may not use native input pseudo-elements. Inspect inherited and nested styles as well as the component's own declarations.

### Contrast and Interaction States

- Treat foreground and background as a semantic pair. A background change requires checking text, placeholders, links, operable inactive icons, hover, selection, and focus against the final composited surface.
- Resolve defaults, opacity, and user overrides before measuring contrast. For example, an opaque icon color may meet contrast requirements while its translucent inactive variant does not.
- Normal-size text and placeholders need at least 4.5:1 contrast; visual information needed to identify controls and focus needs at least 3:1 against adjacent colors. Apply the relevant accessibility criteria rather than extending these thresholds to decorative or disabled content. Unselected but operable controls are not disabled.
- Check nested labels and descriptions in combined states; an explicit child foreground can defeat a correctly paired selection background.
- Choose tokens by semantic role, not their current hue. A chart accent is not automatically a warning-button background, and pairing it with a default button foreground does not establish contrast. Reuse an appropriate control palette or register a themeable foreground/background pair when the component has its own semantics.

### Composited Surfaces

A theme variable is not necessarily opaque. For a floating panel that must conceal underlying content, inspect the resolved alpha and all material layers rather than assuming a panel token or `var()` fallback guarantees occlusion. Use the owning theme/color helpers to derive an opaque semantic background where needed, preserve the intended glass treatment elsewhere, and verify switching content and floating/docked modes on the same instance.

Keep material paint separate from interactive descendants. Border-box and padding-box alignment, clipping, and duplicated translucent strokes are covered by [rounded-surface geometry](../ux-css-layout/SKILL.md#rounded-surface-geometry).

## 4. Widget Styles Pattern

**File**: `src/vs/platform/theme/browser/defaultStyles.ts`

Every widget type has a default style object and an override factory:

```typescript
// Use defaults:
const button = new Button(container, defaultButtonStyles);

// Override specific colors:
const button = new Button(container, getButtonStyles({
    buttonBackground: myCustomBackgroundColor
}));
```

Available defaults: `defaultButtonStyles`, `defaultInputBoxStyles`, `defaultCheckboxStyles`, `defaultToggleStyles`, `defaultDialogStyles`, `defaultListStyles`, `defaultSelectBoxStyles`, `defaultMenuStyles`, `defaultProgressBarStyles`, `defaultCountBadgeStyles`, `defaultBreadcrumbsWidgetStyles`, `defaultKeybindingLabelStyles`, `defaultFindWidgetStyles`.

### Transient Theme Overrides

Use the owning theme service for temporary palettes so CSS variables and programmatic color consumers remain consistent. Keep overrides scoped to the intended window and preserve the base theme and user customizations.

Verify enabling, disabling, replacement, disposal, and theme changes, including stale asynchronous results. Clearing an override must restore the original colors without persisting generated values or changing another window's theme or startup colors.

## 5. Focus Indicators

Defined in `src/vs/workbench/browser/media/style.css`:

```css
.my-widget:focus-visible {
    outline-width: 1px;
    outline-style: solid;
    outline-offset: -1px;
    outline-color: var(--vscode-focusBorder);
}
```

**Rules**:
- Use `var(--vscode-focusBorder)` — never hardcode a focus color.
- Default `outline-offset: -1px` (inset). Exception: checkboxes use `2px`.
- Preserve the owning widget's keyboard-focus mechanism, including supported `.focus-visible` or `.synthetic-focus` classes. Pointer activation should not leave an unnecessary keyboard ring, but broad `:active` suppression must not erase the boundary during keyboard activation.
- Toggle selection, pointer hover, and keyboard focus are different states; do not use a dashed focus border as a universal toggle rule. Follow the [interaction-state contract](#high-contrast-interaction-state-contract).
- Check keyboard focus independently from selection and hover, including ordinary links without explicit `tabindex` and icon-only controls. Inspect computed outlines and pseudo-elements under production styles; token registration alone does not establish visibility.
- Preserve a clear focus boundary through clipping and modal wrappers. Resolve competing border/outline ownership rather than adding duplicate rings or removing focus visibility.

### Focus Trapping

Modal dialogs must trap focus within the dialog until dismissed. Use `dom.trackFocus()` and handle `Tab`/`Shift+Tab` cycling.

## 6. High Contrast Theme Rules

- **Always** provide `hcDark` and `hcLight` defaults when registering colors.
- HC surface backgrounds: use the registered HC defaults, commonly `Color.black` (hcDark) and `Color.white` (hcLight). Preserve component-specific selection and control palettes.
- HC borders: reference `contrastBorder` — it is `null` in normal themes, visible in HC.
- HC keyboard focus: use `focusBorder` or the owning list's focus token; reserve `contrastActiveBorder` for the interaction states below.
- In CSS, use `.hc-black` / `.hc-light` class selectors for HC-specific overrides:
  ```css
  .hc-black .my-widget { border: 1px solid var(--vscode-contrastBorder); }
  ```
- In TypeScript, check `isHighContrast(theme.type)` for runtime behavior changes.
- **Box shadows** must be removed or replaced in HC mode (shadows are invisible/distracting with high contrast borders):
  ```css
  .my-widget {
      box-shadow: 0 1px 3px var(--vscode-widget-shadow);
  }
  .monaco-workbench:is(.hc-black, .hc-light) .my-widget {
      box-shadow: none;
      border: 1px solid var(--vscode-contrastBorder);
  }
  ```

### High-Contrast Interaction-State Contract

Interaction boundaries communicate different semantics. Do not collapse hover, keyboard focus, selection, and persistent state into one generic rule.

| State | Boundary | Required behavior |
|---|---|---|
| Pointer hover | Dashed `contrastActiveBorder` | Apply only to the actionable element actually under the pointer. A `mouse-navigation` class plus a stale focused row is not sufficient. |
| Keyboard focus | Solid `focusBorder` or the owning list focus token | Must win over simultaneous hover and open/expanded/pressed state. Preserve the focus ring when the pointer remains over the control. |
| Open, expanded, or pressed | Solid `contrastActiveBorder` | Persistent state, not transient hover. Keep normal-theme hover fill separate so an expanded control can respond to the pointer without becoming dashed. |
| Selected or checked | The component's selection palette and semantic foreground | Hover must not replace the selected background while leaving the selected foreground behind. |
| Disabled | No hover or active boundary | Disabled styling remains owned by the component. A disabled control that intentionally remains keyboard-focusable still needs a focus indicator. |

Assign one boundary owner per interaction. A pseudo-element may paint an inset hover fill, but it must not also draw an outline when the component root owns the boundary. When a card contains independent actions, suppress the card boundary while a nested action is hovered, focused, or open. For virtualized trees, inspect both the `.monaco-list-row` and its painted child such as `.monaco-tl-row`; never clear the child focus ring when the outer row's outline is intentionally suppressed.

Native disclosure state is not exposed as `aria-expanded` on `<summary>`. Use `details[open] > summary` for visual state, or synchronize a component state class/ARIA attribute for a non-native disclosure. Exclude keyboard focus from persistent-state rules as well as hover rules; greater selector specificity can otherwise erase focus even when the focus rule comes later.

For a custom control whose expanded/pressed state uses ARIA, keep background and boundary selectors independent. This example preserves keyboard precedence in combined states:

```css
.control:not(.disabled, :disabled, [aria-disabled='true']):is(:hover, .hovered) {
	background-color: var(--vscode-list-hoverBackground);
}

.monaco-workbench:is(.hc-black, .hc-light) .control:not(.disabled, :disabled, [aria-disabled='true'], :focus-visible, .focus-visible, [aria-expanded='true'], [aria-pressed='true']):is(:hover, .hovered) {
	outline: var(--vscode-strokeThickness) dashed var(--vscode-contrastActiveBorder);
}

.monaco-workbench:is(.hc-black, .hc-light) .control:not(:disabled):is(:focus-visible, .focus-visible) {
	outline: var(--vscode-strokeThickness) solid var(--vscode-focusBorder);
}

.monaco-workbench:is(.hc-black, .hc-light) .control:not(.disabled, :disabled, [aria-disabled='true'], :focus-visible, .focus-visible):is([aria-expanded='true'], [aria-pressed='true']) {
	outline: var(--vscode-strokeThickness) solid var(--vscode-contrastActiveBorder);
}
```

For controls with a selected/checked palette, exclude that state from the generic hover fill or provide its correctly paired selected-hover colors. Keep independent status markers distinct as well: attention-required, pinned, selected, and focused states can coexist. Test their combined placement and semantic foregrounds rather than letting a new marker cover an existing one.

Validate a state matrix rather than isolated screenshots: rest, hover, keyboard focus, focus plus hover, open/expanded/pressed plus focus and hover, selected/checked plus hover, disabled plus hover, and nested-action focus/hover. Load all production styles that compete for the boundary and verify both HC Dark and HC Light, plus normal Dark/Light when selector exclusions can affect hover fills.

Test runtime theme changes and custom color overrides, including transitions where a previously defined token becomes absent. Clear stale inline colors or classes rather than leaving the previous theme's state behind. Render through production state-owning services so intentionally omitted decoration remains absent.

### Testing Rendered Interaction States

- A dispatched `mousemove` can update a widget's modality or logical focus without activating CSS `:hover`. Use real pointer input for interaction tests. A fixture may use the production-supported `.hovered` class, but it must assert the intended computed boundary before capturing a screenshot.
- Establish keyboard modality through the actual input path, then dispatch navigation from the focused item. An ancestor bubbling listener may never see keys consumed by an inner ActionBar; use capture only where the owner must observe the event before that handler. Test pointer-to-keyboard transitions with a stationary pointer.
- Do not assume `.focus()` or a synthetic key event makes `:focus-visible` true in every browser or Electron host. Control the fixture's supported focus state or drive actual keyboard input, isolate previous focus, and verify the state before asserting styles. Do not skip a failed focus assertion or weaken it to mere `activeElement` equality.
- When exact theme colors are the contract, load and assert those tokens. When preserving platform styling is the contract, assert a visible nonzero focus boundary instead of an unrelated hardcoded color. Include the relevant production stylesheet cascade in either case.
- Exercise both forced-focus and natural-focus fixture modes. Wait for a focus-triggered hover only when focus was actually requested. Check readiness, idle, and remount so an async tooltip is not captured accidentally or awaited forever.
- In missing-token tests, distinguish local removal from inherited values. If an ancestor supplies the property, use a scoped guaranteed-invalid value such as a self-reference to exercise `var()` fallback without changing global theme state. A fallback does not repair a defined value with the wrong CSS type.
- Hit-test the intended action region, allowing the hit element to be the control or one of its descendants, then activate it and assert the behavior or ARIA change. Exact root equality is brittle; CSS styling alone does not prove that labels, chevrons, or edge padding remain clickable.

## 7. No Hardcoded Visual Values

Reviewers will always flag hardcoded colors, shadows, sizes that should use theme tokens or CSS variables.

| Hardcoded (flagged) | Correct |
|---------------------|---------|
| `rgba(0, 0, 0, 0.12)` | `var(--vscode-widget-shadow)` or theme-aware variable |
| `#252526` | `var(--vscode-editor-background)` |
| `color: white` | `var(--vscode-button-foreground)` |
| `border: 1px solid #ccc` | `var(--vscode-editorWidget-border)` |
| `border: 1px solid …` (width) | `var(--vscode-strokeThickness)` for the 1px width |
| `border-radius: 6px` | `var(--vscode-cornerRadius-medium)` (radius ramp) |
| `padding: 8px 12px` (off-scale) | spacing ramp (`--vscode-spacing-size*`) |
| `font-size: 14px` (arbitrary) | size ramp (`--vscode-fontSize-*`) |
| `font-weight: 500` | `--vscode-fontWeight-semiBold` (no 500) |
| codicon `font-size: 14px` | `--vscode-codiconFontSize` (16) / `-compact` (12) |

**Rule:** If a value relates to color, shadow, or border — it must come from a CSS variable or registered color token. The only exception is `0` (zero) values and purely structural measurements like `100%`.

**Size, spacing, radius, font and stroke** values have their own design-system **size** tokens (and decision logic — snap maps, the pill→`circle` rule, and the compact-glyph convention). Those live in the **ux-css-layout** skill (§10 Design-System Size Tokens) and the auto-injected `.github/instructions/design-tokens.instructions.md`. Reach for those when a flag is about *how big / how round / how bold* something is rather than *what color*.

---

## Key Files

| Area | File |
|------|------|
| Color registration | `src/vs/platform/theme/common/colorUtils.ts` |
| Color registry (barrel) | `src/vs/platform/theme/common/colorRegistry.ts` |
| Base colors | `src/vs/platform/theme/common/colors/baseColors.ts` |
| Workbench colors | `src/vs/workbench/common/theme.ts` |
| Default widget styles | `src/vs/platform/theme/browser/defaultStyles.ts` |
| Global workbench styles | `src/vs/workbench/browser/media/style.css` |
