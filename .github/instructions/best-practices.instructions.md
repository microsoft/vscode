---
description: VS Code best practices — reusing common UI primitives and patterns. Reference when writing or reviewing code.
applyTo: src/vs/**
---

# Best Practices

## Buttons & Actions

- Don't create a new class or custom CSS to render a button or action. Reuse the existing `Button` class (`vs/base/browser/ui/button/button.ts`) and the existing `Action` types (`vs/base/common/actions.ts`). This keeps theming, accessibility, and behavior consistent.
- Render actions inside a toolbar rather than by hand. Prefer `MenuWorkbenchToolBar` (`vs/platform/actions/browser/toolbar.ts`): give it a `MenuId` so actions can be contributed from anywhere (contributions, other components) without coupling.
- Use `WorkbenchToolBar` when you need explicit control over which actions render and where separators go.
- Never add a separator while rendering an action. Add separators with the existing `Separator` class (`vs/base/common/actions.ts`).
- If a `MenuWorkbenchToolBar` lives in a widget/view that can be rendered multiple times at once, give the toolbar a scoped `IContextKeyService` which is scoped to the dom element of that widget/view and set the context keys per individual widget/view instance.

## Editor/Session Actions

- Don't assume the action runs on the active editor/session. An action (e.g. one contributed to some editor or session related toolbar) can be triggered for an editor/session that isn't active. The `run` method receives arguments describing the invocation context (such as the originating editor group or the originating session).
- Resolve editor action arguments with `resolveCommandsContext` (`vs/workbench/browser/parts/editor/editorCommandsContext.ts`) to get the correct editor(s) instead of reading `editorService.activeEditor`.
- Support multi-selection. The resolved editor actions context can contain several editors (e.g. multi-selected tabs).

## URI

- Don't hardcode URI scheme strings like `'file'`, `'untitled'`, or `'vscode-remote'`. Use the `Schemas` constants from `vs/base/common/network.ts` (e.g. `Schemas.file`, `Schemas.untitled`, `Schemas.vscodeRemote`).
- Don't compare URIs with `===` or `uri.toString()`. Use the comparison utilities from `vs/base/common/resources.ts`: `isEqual` for equality, `isEqualOrParent` for containment, and `getComparisonKey` when a URI is used as a map/set key. These handle path-case sensitivity and fragment/authority correctly. When you need explicit control over case sensitivity, use an `ExtUri` instance (`extUri`, `extUriIgnorePathCase`, or `extUriBiasedIgnorePathCase`) instead of the bound helpers.

## Resource Labels

- Don't set `{ supportIcons: true }` when creating a `ResourceLabel` (`vs/workbench/browser/labels.ts`). This option makes the label parse `$(codicon)` syntax in the name/description and is only needed when you want to render a codicon inline with the resource text. By default (without it), the label computes the proper file-icon CSS classes for the resource, which is what we almost always want. Note that those classes only render as icons when an ancestor DOM element enables file icons (see below); otherwise the label shows text only.
- To actually display file icons for resource labels in a tree/list, an ancestor container must have the `show-file-icons` class and be wired to the active file icon theme. Don't add the class by hand — call `createFileIconThemableTreeContainerScope` (`vs/workbench/contrib/files/browser/views/explorerView.ts`) on the container. It adds the required `show-file-icons` / `file-icon-themable-tree` classes and keeps `align-icons-and-twisties` / `hide-arrows` in sync with the file icon theme. Register the returned `IDisposable`. A common bug is placing a resource-label list/tree outside such a scoped container, which makes file icons silently disappear.

## Styling

- Avoid `getComputedStyle`. If a style value is needed in both CSS and TypeScript, prefer hardcoding the value in TypeScript and setting it directly on the DOM element (e.g. `element.style.width = '100px'`), or set a CSS custom property via `element.style.setProperty('--my-var', value)` when the value is needed across multiple CSS rules.
- Never anchor a `:has()` selector on `body` or another workbench-wide root (e.g. `body:has(.my-dialog) .context-view { … }`). A `:has()` on a global root forces the style engine to re-evaluate the selector against the whole document on nearly every DOM mutation, which degrades interaction smoothness across the entire workbench. It costs even in builds where the feature is disabled, because the CSS still ships. Instead, toggle a class on the specific container while the state is active and scope the rules to that class: add the class to `layoutService.activeContainer` when the state begins, remove it via a registered disposable when it ends, and write `.my-dialog-open .context-view { … }`. Capture the container reference once so the class is removed from the same element it was added to.

## Editor Decorations

- For editor highlights, use a regular editor decoration with an `inlineClassName` or `className` plus a CSS rule.
- `ICodeEditorService.registerDecorationType` / `setDecorationsByType` is reserved for the extension host API and should be avoided at all cost.
