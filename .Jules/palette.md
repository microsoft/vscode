## 2024-05-18 - Hover Action Focus Styles
**Learning:** Hover widgets use an interactive `action-container` element for status bar actions (like code links or quick actions). These elements have `tabindex="0"` allowing them to receive keyboard focus, but they lack visual focus indicators. This means users navigating via keyboard can't see which action is currently focused within a hover.
**Action:** When creating interactive elements inside hovers or popups, ensure they have explicit `:focus` or `:focus-visible` styles using `var(--vscode-focusBorder)` to maintain accessibility.

## 2024-04-22 - Missing focus-visible states on core interactive elements
**Learning:** The base UI components like `Button` (`src/vs/base/browser/ui/button/button.css`) define focus states using `:focus`, but they are missing `outline` property for `:focus` and explicit styling using `:focus-visible` pseudoclass with `outline: 1px solid var(--vscode-focusBorder)`. Some places use outline-offset without defining the outline itself, or missing outline color entirely.
**Action:** When working on interactive UI components, ensure that `:focus-visible` or `:focus` states explicitly include the outline style using `outline: 1px solid var(--vscode-focusBorder)` to maintain accessibility for keyboard navigation.
## 2026-04-30 - Custom Button Keyboard Navigation
**Learning:** Custom interactive UI elements (like `<a>` or `<div>`) with `role="button"` created using internal DOM helpers (e.g., `DOM.$()` or `h()`) must explicitly be given a `tabindex: '0'` attribute. Otherwise, they are completely skipped by keyboard navigation, breaking accessibility for a core interaction pattern.
**Action:** When adding or modifying custom button elements, always ensure they have `tabindex: 0` and an `aria-label` (if icon-only) to guarantee they are reachable and readable by all users.
