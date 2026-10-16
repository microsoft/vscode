---
description: CSS best practices for selector performance and maintainable state styling. Use when writing or reviewing CSS.
applyTo: "**/*.css"
---

# CSS Best Practices

## Selectors

- Avoid `:has()` selectors. Because their result depends on descendant state, DOM mutations can invalidate styles on ancestors and cause expensive style recalculation, especially when selectors are broadly scoped. Instead, represent the state explicitly with a class or data attribute on the smallest container you own, and scope selectors to that marker. Add and remove the marker together with the state it represents.
- Never add a new match on the `class` attribute by substring (`[class*="…"]`, `[class^="…"]`, `[class$="…"]`). A single such selector anywhere in the workbench stylesheet defeats Blink's per-class invalidation: every `classList` change then forces a style recalculation for that element, even when no rule references the class that changed. Measured on a 3.7k-node workbench, the ten `[class*="monaco-decoration-itemColor"]` selectors in the Modern UI tab styles alone made a full style recalculation 2.4x slower. When a class carries a generated suffix, have the code that applies it also set a stable marker class (see `DECORATION_LABEL_COLOR_CLASS`) and match that instead. Existing `codicon-*` substring selectors are a grandfathered compatibility contract and must only be changed in a dedicated, separately validated codicon migration.

## Native Scrollbars

- Browser-native controls inside `.monaco-workbench`, including unstyled scrollbars, inherit the appropriate light or dark `color-scheme` from the workbench theme class. Do not add component-local scrollbar colors merely because a container uses `overflow: auto` or `overflow: scroll`.
- Component rules may customize scrollbar geometry or intentionally override a state, but color declarations must use the corresponding `--vscode-scrollbar*` theme variable or `transparent`.
- Do not set `scrollbar-color` on `.monaco-workbench` or another shared ancestor. In Chromium, a non-`auto` value suppresses `::-webkit-scrollbar-thumb:hover` and `:active` styling on descendant scrollbars.
- Standalone documents outside `.monaco-workbench`, such as webviews, cannot inherit the workbench color scheme and must provide their own appropriate `color-scheme` or theme-aware native scrollbar styling.
- Use `DomScrollableElement` when a surface needs VS Code's custom scrollbar behavior rather than a browser-native scrollbar.
