---
description: VS Code best practices — reusing common UI primitives and patterns. Reference when writing or reviewing code.
applyTo: src/vs/**
---

# Best Practices

## Buttons & Actions

- Don't create a new class or custom CSS to render a button or action. Reuse the existing `Button` class (`vs/base/browser/ui/button/button.ts`) and the existing `Action` types (`vs/base/common/actions.ts`). This keeps theming, accessibility, and behavior consistent.
- Render actions inside a toolbar rather than by hand. Prefer `MenuWorkbenchToolBar` (`vs/platform/actions/browser/toolbar.ts`): give it a `MenuId` so actions can be contributed from anywhere (contributions, other components) without coupling.
- Use `WorkbenchToolBar` when you need explicit control over which actions render and where separators go.
- Never add a separator while rendering an action. Add separators with the existing `Separator` class.
- If a `MenuWorkbenchToolBar` lives in a widget/view that can be rendered multiple times at once, give the toolbar a scoped `IContextKeyService` which is scoped to the dom element of that widget/view and set the context keys per individual widget/view instance.
