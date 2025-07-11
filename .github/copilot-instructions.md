# VS Code Copilot Instructions

## Project Overview

Visual Studio Code is built with a layered architecture using TypeScript, web APIs and Electron, combining web technologies with native app capabilities. The codebase is organized into key architectural layers:

### Core Architecture (`src/` folder)
- **`src/vs/base/`** - Foundation utilities and cross-platform abstractions
- **`src/vs/platform/`** - Platform services and dependency injection infrastructure
- **`src/vs/editor/`** - Text editor implementation with language services, syntax highlighting, and editing features
- **`src/vs/workbench/`** - Main application workbench for web and desktop
  - **`workbench/browser/`** - Core workbench UI components (parts, layout, actions)
  - **`workbench/services/`** - Service implementations
  - **`workbench/contrib/`** - Feature contributions (git, debug, search, terminal, etc.)
  - **`workbench/api/`** - Extension host and VS Code API implementation
- **`src/vs/code/`** - Electron main process specific implementation

#### Key Design Principles
- **Layered architecture** - Base → Platform → Editor → Workbench
- **Dependency injection** - Services are injected through constructor parameters
- **Contribution model** - Features contribute to registries and extension points
- **Cross-platform compatibility** - Abstractions separate platform-specific code

### Built-in Extensions (`extensions/` folder)
The `extensions/` directory contains first-party extensions that ship with VS Code:
- **Language support** - `typescript-language-features/`, `html-language-features/`, `css-language-features/`, etc.
- **Core features** - `git/`, `debug-auto-launch/`, `emmet/`, `markdown-language-features/`
- **Themes** - `theme-*` folders for default color themes
- **Development tools** - `extension-editing/`, `vscode-api-tests/`

Each extension follows the standard VS Code extension structure with `package.json`, TypeScript sources, and contribution points to extend the workbench through the Extension API.

## Coding Guidelines

### Indentation

We use tabs, not spaces.

### Naming Conventions

* Use PascalCase for `type` names
* Use PascalCase for `enum` values
* Use camelCase for `function` and `method` names
* Use camelCase for `property` names and `local variables`
* Use whole words in names when possible

### Types

* Do not export `types` or `functions` unless you need to share it across multiple components
* Do not introduce new `types` or `values` to the global namespace

### Comments

* Use JSDoc style comments for `functions`, `interfaces`, `enums`, and `classes`

### Strings

* Use "double quotes" for strings shown to the user that need to be externalized (localized)
* Use 'single quotes' otherwise
* All strings visible to the user need to be externalized

### UI labels
* Use title-style capitalization for command labels, buttons and menu items (each word is capitalized).
* Don't capitalize prepositions of four or fewer letters unless it's the first or last word (e.g. "in", "with", "for").

### Style

* Use arrow functions `=>` over anonymous function expressions
* Only surround arrow function parameters when necessary. For example, `(x) => x + x` is wrong but the following are correct:

```typescript
x => x + x
(x, y) => x + y
<T>(x: T, y: T) => x === y
```

* Always surround loop and conditional bodies with curly braces
* Open curly braces always go on the same line as whatever necessitates them
* Parenthesized constructs should have no surrounding whitespace. A single space follows commas, colons, and semicolons in those constructs. For example:

```typescript
for (let i = 0, n = str.length; i < 10; i++) {
    if (x < 10) {
        foo();
    }
}
function f(x: number, y: string): void { }
```

* Whenever possible, use in top-level scopes `export function x(…) {…}` instead of `export const x = (…) => {…}`. One advantage of using the `function` keyword is that the stack-trace shows a good name when debugging.
