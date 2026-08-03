---
description: CSS best practices for selector performance and maintainable state styling. Use when writing or reviewing CSS.
applyTo: "**/*.css"
---

# CSS Best Practices

## Selectors

- Avoid `:has()` selectors. Because their result depends on descendant state, DOM mutations can invalidate styles on ancestors and cause expensive style recalculation, especially when selectors are broadly scoped. Instead, represent the state explicitly with a class or data attribute on the smallest container you own, and scope selectors to that marker. Add and remove the marker together with the state it represents.
