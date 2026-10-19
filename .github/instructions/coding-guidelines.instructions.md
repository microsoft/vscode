---
description: VS Code coding guidelines — naming, style, types, strings, and code quality rules. Reference when writing or reviewing code.
applyTo: src/vs/**
---

# Coding Guidelines

Canonical reference: https://github.com/microsoft/vscode/wiki/Coding-Guidelines

Also see the [Source Code Organization](https://github.com/microsoft/vscode/wiki/Source-Code-Organization) wiki page.

## Indentation

Use tabs, not spaces.

## Naming

- PascalCase for types and enum values
- camelCase for functions, methods, properties, and local variables
- Use whole words when possible

## Types

- Do not export types or functions unless shared across multiple components
- Do not introduce new types or values to the global namespace

## Comments

- Use JSDoc style comments for functions, interfaces, enums, and classes
- Do not write large comments in the middle of a method or comments that explain a single line. If a line or block needs a paragraph of explanation to be understood, treat that as a signal that the code itself is unclear: extract a well-named function, introduce an explanatory variable, or simplify the logic instead. Keep any remaining inline comment to a brief note.
- **Default to NO comment.** Add one only when the code cannot be made self-explanatory by naming. Code that is obvious from its identifiers must not be commented.
- **Hard limits** (treat as rules, not suggestions):
  - JSDoc on a function/interface/property: at most 1–2 short sentences. Do not enumerate every branch/feature, restate the signature, list what it does NOT do, or explain parameters that are obvious from their names/types.
  - Inline comment inside a method body: at most 1 line, and only for a genuine workaround/hack, a non-obvious ordering constraint, or a surprising side effect. Never narrate the next statement (e.g. `// Expand the variable`, `// loop over args`).
- Before writing any comment longer than one line, stop and either delete it or shorten it to a single line. A multi-line block comment inside a method body is almost always wrong.

## Strings

- `"double quotes"` for user-visible strings that need localization
- `'single quotes'` for everything else
- All user-visible strings must be externalized via `nls.localize()` — no string concatenation, use `{0}` placeholders

## UI Labels

- Title case for command labels, buttons, and menu items (each major word capitalized)
- Don't capitalize prepositions of four or fewer letters unless first or last word
- Sentence case for view titles/headings (only first word capitalized), no trailing period

## Style

- Arrow functions over anonymous function expressions
- Only parenthesize arrow parameters when necessary: `x => x + x` not `(x) => x + x`
- Always surround loop and conditional bodies with curly braces
- Open curly braces on the same line
- No surrounding whitespace in parenthesized constructs
- Prefer `export function x(…) {…}` over `export const x = (…) => {…}` at top-level scope (better stack traces)

## Code Quality

- Include Microsoft copyright header in all files
- Prefer `async`/`await` over `Promise.then()`
- Localize all user-facing messages
- Prefer named regex capture groups over numbered ones
- Do not use `any` or `unknown` unless absolutely necessary
- Register disposables immediately after creation — use `DisposableStore`, `MutableDisposable`, or `this._register()`
- Declare service dependencies in constructors via DI — never access services through `IInstantiationService` elsewhere. In particular, do **not** lazily resolve a service with `this.instantiationService.invokeFunction(accessor => accessor.get(ISomeService))`; add `@ISomeService` as a constructor parameter instead. If a constructor cycle prevents direct injection, break the cycle (e.g. pass the dependency into an `init()`/wiring method from the orchestrator, or relocate the call) rather than reaching through `invokeFunction`/`accessor.get`.
- Use `IEditorService` to open editors, not `IEditorGroupsService.activeGroup.openEditor`
- Avoid `bind()`/`call()`/`apply()` solely for `this` — prefer arrow functions
- Avoid events for control flow between components — prefer direct method calls
