## 2024-05-18 - Hover Action Focus Styles
**Learning:** Hover widgets use an interactive `action-container` element for status bar actions (like code links or quick actions). These elements have `tabindex="0"` allowing them to receive keyboard focus, but they lack visual focus indicators. This means users navigating via keyboard can't see which action is currently focused within a hover.
**Action:** When creating interactive elements inside hovers or popups, ensure they have explicit `:focus` or `:focus-visible` styles using `var(--vscode-focusBorder)` to maintain accessibility.
