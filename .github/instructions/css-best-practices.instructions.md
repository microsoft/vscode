---
description: CSS best practices for selector performance and maintainable state styling. Use when writing or reviewing CSS.
applyTo: "**/*.css"
---

# CSS Best Practices

## Selectors

- Avoid `:has()` selectors. Because their result depends on descendant state, DOM mutations can invalidate styles on ancestors and cause expensive style recalculation, especially when selectors are broadly scoped. Instead, represent the state explicitly with a class or data attribute on the smallest container you own, and scope selectors to that marker. Add and remove the marker together with the state it represents.
- Never match the `class` attribute by substring (`[class*="…"]`, `[class^="…"]`, `[class$="…"]`). A single such selector anywhere in the workbench stylesheet defeats Blink's per-class invalidation: every `classList` change then forces a style recalculation for that element, even when no rule references the class that changed. Measured on a 3.7k-node workbench, the ten `[class*="monaco-decoration-itemColor"]` selectors in the Modern UI tab styles alone made a full style recalculation 2.4x slower. When a class carries a generated suffix, have the code that applies it also set a stable marker class (see `DECORATION_LABEL_COLOR_CLASS`) and match that instead.
