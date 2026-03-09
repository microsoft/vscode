---
description: UX and UI guidelines for VS Code. Use when working on user-facing components, styling, or layout.
applyTo: '**/*.{tsx,jsx,css,less,scss,html,svg}'
---

# UX Guidelines

These guidelines summarize the best practices from VS Code's [UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/overview) for creating UI that integrates seamlessly with the native interface.

## Table of Contents

### Containers
1. [Activity Bar](https://code.visualstudio.com/api/ux-guidelines/activity-bar)
2. [Sidebars (Primary & Secondary)](https://code.visualstudio.com/api/ux-guidelines/sidebars)
3. [Editor Actions](https://code.visualstudio.com/api/ux-guidelines/editor-actions)
4. [Panel](https://code.visualstudio.com/api/ux-guidelines/panel)
5. [Status Bar](https://code.visualstudio.com/api/ux-guidelines/status-bar)

### Items
6. [Views](https://code.visualstudio.com/api/ux-guidelines/views)

### Common UI Elements
7. [Command Palette](https://code.visualstudio.com/api/ux-guidelines/command-palette)
8. [Quick Picks](https://code.visualstudio.com/api/ux-guidelines/quick-picks)
9. [Notifications](https://code.visualstudio.com/api/ux-guidelines/notifications)
10. [Webviews](https://code.visualstudio.com/api/ux-guidelines/webviews)
11. [Context Menus](https://code.visualstudio.com/api/ux-guidelines/context-menus)
12. [Walkthroughs](https://code.visualstudio.com/api/ux-guidelines/walkthroughs)
13. [Settings](https://code.visualstudio.com/api/ux-guidelines/settings)

---

## Design System

First, try to use existing components and styles. If you need to create custom styles, follow these guidelines.

### Color Tokens

Colors are registered via `registerColor()` in `src/vs/platform/theme/common/colorUtils.ts`. Definitions live in `src/vs/platform/theme/common/colors/`. Every color must specify four theme variants: `dark`, `light`, `hcDark`, `hcLight`.

```typescript
import { registerColor, transparent } from 'vs/platform/theme/common/colorUtils';

export const myWidgetBackground = registerColor('myWidget.background',
	{ dark: '#252526', light: '#F3F3F3', hcDark: '#000000', hcLight: '#FFFFFF' },
	nls.localize('myWidgetBackground', "Background color for my widget."));
```

**In CSS** — color IDs map to CSS variables with dots replaced by dashes (e.g., `editor.foreground` → `--vscode-editor-foreground`):

```css
.my-widget {
	color: var(--vscode-foreground);
	border: 1px solid var(--vscode-editorWidget-border);
	background: var(--vscode-editorWidget-background);
}
```

**In TypeScript** — use the helpers from `colorUtils.ts`:

```typescript
import { asCssVariable } from 'vs/platform/theme/common/colorUtils';

element.style.color = asCssVariable(foreground); // 'var(--vscode-foreground)'
```

A stylelint rule enforces only known variables are used — see `build/lib/stylelint/vscode-known-variables.json`.

### Sizes and Spacing

Sizes are registered via `registerSize()` in `src/vs/platform/theme/common/sizeUtils.ts` and become CSS variables:

- `--vscode-cornerRadius-small` (4px), `--vscode-cornerRadius-medium` (6px), `--vscode-cornerRadius-large` (8px)
- `--vscode-strokeThickness` (1px)
- `--vscode-bodyFontSize` (13px)

Shadows are available as:

- `--vscode-shadow-sm`, `--vscode-shadow-md`, `--vscode-shadow-lg`, `--vscode-shadow-xl`

Use a **4px grid** for spacing and layout to maintain alignment.

### Icons (Codicons)

Codicons are defined in `src/vs/base/common/codiconsLibrary.ts` (auto-generated from the codicon font) and extended with aliases in `src/vs/base/common/codicons.ts`.

**In TypeScript** — use `ThemeIcon` from `src/vs/base/common/themables.ts`:

```typescript
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';

ThemeIcon.asClassName(Codicon.add)       // 'codicon codicon-add'
ThemeIcon.asCSSSelector(Codicon.add)     // '.codicon.codicon-add'
```

**Register UI-specific icons** — Do NOT use raw `Codicon` references directly in product code. Instead, register a UI-specific icon that uses a codicon as its default:

```typescript
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';

export const widgetClose = registerIcon('widget-close', Codicon.close,
	localize('widgetClose', 'Icon for the close action in widgets.'));
```

### Reusable Widgets

Standard widgets live in `src/vs/base/browser/ui/`. Always prefer these over custom HTML:

| Widget | Location | Key class |
|--------|----------|-----------|
| Button | `button/` | `Button`, `ButtonWithDropdown`, `ButtonBar` |
| Toggle/Checkbox | `toggle/` | `Toggle`, `Checkbox` |
| InputBox | `inputbox/` | `InputBox` |
| SelectBox | `selectBox/` | `SelectBox` |
| CountBadge | `countBadge/` | `CountBadge` |
| ProgressBar | `progressbar/` | `ProgressBar` |
| List | `list/` | `List` |
| Tree | `tree/` | `ObjectTree`, `AsyncDataTree` |
| Toolbar | `toolbar/` | `ToolBar` |
| ActionBar | `actionbar/` | `ActionBar` |
| Dialog | `dialog/` | `Dialog` |
| Grid/SplitView | `grid/`, `splitview/` | `Grid`, `SplitView` |
| Sash | `sash/` | `Sash` |

**Instantiation** — Widgets extend `Disposable`, take a container `HTMLElement`, and accept a **styles object** from `src/vs/platform/theme/browser/defaultStyles.ts`:

```typescript
import { Button } from 'vs/base/browser/ui/button/button';
import { defaultButtonStyles } from 'vs/platform/theme/browser/defaultStyles';

const button = this._register(new Button(container, { ...defaultButtonStyles }));
button.label = 'Click Me';
this._register(button.onDidClick(() => { /* ... */ }));
```

Available default styles: `defaultButtonStyles`, `defaultInputBoxStyles`, `defaultToggleStyles`, `defaultCheckboxStyles`, `defaultCountBadgeStyles`, `defaultProgressBarStyles`, `defaultDialogStyles`, `defaultSelectBoxStyles`, `defaultBreadcrumbsWidgetStyles`, etc.

### Tooltips (IHoverService)

Do NOT use native `title` attributes. Use `IHoverService` from `src/vs/platform/hover/browser/hover.ts`.

```typescript
// Static tooltip — most common
this._hoverService.setupDelayedHover(element, () => ({
	content: 'Tooltip text',
}));

// Updateable tooltip
const hover = this._register(this._hoverService.setupManagedHover(
	this.hoverDelegate, element, 'Initial text'
));
hover.update('Updated text');
```

For widgets in `src/vs/base/browser/ui/` without DI access, use `getBaseLayerHoverDelegate()` from `src/vs/base/browser/ui/hover/hoverDelegate2.ts`.

### CSS Conventions

**Selector scoping** — All workbench styles must be scoped under `.monaco-workbench`. Editor styles use `.monaco-editor`:

```css
.monaco-workbench .my-widget {
	font-size: var(--vscode-bodyFontSize);
}
```

**High contrast themes** — Use `.hc-black` and `.hc-light` classes:

```css
.monaco-workbench.hc-black .my-widget,
.monaco-workbench.hc-light .my-widget {
	border-width: 2px;
}
```

**Reduced motion** — Always disable animations under `.monaco-reduce-motion`:

```css
.monaco-workbench.monaco-reduce-motion .my-widget {
	animation: none;
	transition: none;
}
```

**Platform-specific styles** — Use `.mac`, `.windows`, `.linux` classes when needed:

```css
.monaco-workbench.mac .my-widget { font-family: -apple-system, sans-serif; }
```

**File types** — VS Code uses plain `.css` files (not `.less`). Styles are co-located with their TypeScript widgets.

### Accessibility in CSS

**Focus rings** — All focusable elements get an outline using `--vscode-focusBorder`:

```css
.monaco-workbench .my-widget:focus {
	outline: 1px solid var(--vscode-focusBorder);
	outline-offset: -1px;
}
```

**Screen-reader-only content** — Use the `monaco-aria-container` pattern (absolute positioning, 1px clipped) for visually hidden text. ARIA live regions use `role="alert"` with `aria-atomic="true"` for alerts and `aria-live="polite"` for status messages.

**Color contrast** — All text/background combinations must meet WCAG 2.1 AA contrast ratios across all four theme variants (dark, light, hcDark, hcLight).
