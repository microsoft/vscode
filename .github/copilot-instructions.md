# ResonanceIDE – AI Coding Agent Instructions

> **Audience:** AI coding agents (GitHub Copilot, Copilot Chat, autonomous refactoring agents)
> **Scope:** This repository is a fork of VS Code used to build **ResonanceIDE**, a stripped-down, white-labeled, AI-first IDE.
> **Primary Goal:** Achieve a minimal, maintainable VS Code fork by **reusing proven implementations from VSCodium wherever possible**, while preserving upstream mergeability.

---

## 1. Canonical References (Order of Authority)

When implementing, modifying, or removing functionality, always reason in this order:

1. **VSCodium reference implementation** (local folder: `/vscodium/`, gitignored)
2. **Upstream VS Code OSS**
3. **ResonanceIDE-specific requirements in this repo**

> ⚠️ **Important:**
> VSCodium is intentionally present as a _local, non-versioned reference_.
> It represents **known-good solutions** for:
>
> - telemetry removal
> - branding removal
> - marketplace rewiring
> - update/experiments disabling

---

## 2. Codebase Architecture Overview

### Root Folders

- `src/` – Main TypeScript source code with unit tests in `src/vs/*/test/` folders
- `build/` – Build scripts and CI/CD tools
- `extensions/` – Built-in extensions that ship with VS Code
- `test/` – Integration tests and test infrastructure
- `scripts/` – Development and build scripts
- `resources/` – Static resources (icons, themes, etc.)
- `out/` – Compiled JavaScript output (generated during build)

### Core Architecture (`src/` folder)

| Path                         | Purpose                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| `src/vs/base/`               | Foundation utilities and cross-platform abstractions                                         |
| `src/vs/platform/`           | Platform services and dependency injection infrastructure                                    |
| `src/vs/editor/`             | Text editor implementation with language services, syntax highlighting, and editing features |
| `src/vs/workbench/`          | Main application workbench for web and desktop                                               |
| `src/vs/workbench/browser/`  | Core workbench UI components (parts, layout, actions)                                        |
| `src/vs/workbench/services/` | Service implementations                                                                      |
| `src/vs/workbench/contrib/`  | Feature contributions (git, debug, search, terminal, etc.)                                   |
| `src/vs/workbench/api/`      | Extension host and VS Code API implementation                                                |
| `src/vs/code/`               | Electron main process specific implementation                                                |
| `src/vs/server/`             | Server specific implementation                                                               |

### Architectural Principles

- **Layered architecture** – from `base`, `platform`, `editor`, to `workbench`
- **Dependency injection** – Services are injected through constructor parameters
- **Contribution model** – Features contribute to registries and extension points
- **Cross-platform compatibility** – Abstractions separate platform-specific code

### Built-in Extensions (`extensions/` folder)

The `extensions/` directory contains first-party extensions that ship with VS Code:

- **Language support** – `typescript-language-features/`, `html-language-features/`, `css-language-features/`, etc.
- **Core features** – `git/`, `debug-auto-launch/`, `emmet/`, `markdown-language-features/`
- **Themes** – `theme-*` folders for default color themes
- **Development tools** – `extension-editing/`, `vscode-api-tests/`

Each extension follows the standard VS Code extension structure with `package.json`, TypeScript sources, and contribution points.

### Key Product Config Paths

| Purpose                     | Location                                       |
| --------------------------- | ---------------------------------------------- |
| Build-time template         | `product.json` / `product.*.json` in repo root |
| ResonanceIDE product config | `build/ResonanceIDE.product.json`              |

---

## 3. Mandatory Pre-Action Review (Token-Saving Rule)

Before writing _any_ new code related to:

- telemetry
- branding / product.json
- Microsoft services
- marketplace configuration
- update mechanisms
- experiments / A/B testing
- MS account / auth / cloud hooks

### You MUST do the following:

1. **Search the `vscodium/` folder first**
2. Identify:
   - relevant files
   - configuration keys
   - build-time overrides
   - no-op services or guards
3. Decide using this decision tree:

```
IF VSCodium implementation fully satisfies ResonanceIDE needs:
    → Copy it verbatim (preferred)
ELSE IF VSCodium implementation is 80–95% sufficient:
    → Copy it, then minimally adapt
ELSE:
    → Implement custom logic, but document why VSCodium could not be reused
```

> ❌ Do NOT re-implement something VSCodium already solved
> ❌ Do NOT invent new abstractions when a copied one works
> ✅ Prefer copying + light adaptation over originality

This rule exists to:

- reduce token usage
- reduce architectural drift
- improve upstream merge survivability

---

## 4. Philosophy: "Disable Before Delete"

When stripping VS Code functionality:

1. **Prefer configuration or feature flags**
2. Then prefer **build-time exclusion**
3. Only **delete code** as a last resort

Rationale:

- upstream merges are easier
- diffs stay small
- future re-enablement is possible

---

## 5. Product & Branding Rules

- The product is named **ResonanceIDE**
- There must be **zero** visible references to:
  - "Visual Studio Code"
  - "VS Code"
  - Microsoft branding
- All branding changes must route through:
  - `product.json` (or build-time equivalent)
  - resource/icon overrides

> If VSCodium already handles a branding change, copy it.

### Key product.json Keys

| Key                                        | Purpose                                      |
| ------------------------------------------ | -------------------------------------------- |
| `nameShort`, `nameLong`, `applicationName` | Product identity                             |
| `dataFolderName`                           | User data directory (`.aide-ide`)            |
| `extensionsGallery`                        | Marketplace configuration (Open VSX)         |
| `updateUrl`, `updateUrlFallback`           | Update endpoints (disabled for ResonanceIDE) |
| `experimentsUrl`, `crashReporter`          | Microsoft services (remove/null)             |
| `aiConfig`, `msftsuite`                    | MS AI fields (remove)                        |

---

## 6. Telemetry & Network Guarantees

ResonanceIDE must guarantee:

- No Microsoft telemetry
- No experiment fetches
- No MS authentication calls
- No background network traffic to Microsoft domains when idle

### Domains to Block/Avoid

- `*.visualstudio.com`
- `*.vscode-unpkg.net`
- `*.applicationinsights.io`
- `*.microsoft.com` (telemetry endpoints)
- `*.experiments.microsoft.com`
- `login.live.com`
- `microsoftonline.com`
- `vscode-sync.trafficmanager.net`

### Rules for agents:

- Telemetry services may exist **only as no-op implementations**
- Network calls must be:
  - explicitly visible
  - attributable
  - auditable

### Relevant Settings Keys

| Setting                         | Purpose                       |
| ------------------------------- | ----------------------------- |
| `telemetry.telemetryLevel`      | Runtime telemetry control     |
| `telemetry.enableTelemetry`     | Legacy telemetry setting      |
| `telemetry.enableCrashReporter` | Legacy crash reporter setting |

---

## 7. Extension Compatibility Is Sacred

- The VS Code **extension host must remain intact**
- Public VS Code extension APIs must not be broken
- Removing a _built-in extension_ is allowed
- Modifying the extension host runtime is **not**

> If in doubt, preserve compatibility.

---

## 8. AI Integration Boundaries

This repo **does not implement AI logic directly**.

Instead:

- Provide **ports / interfaces only**
- Implement AI behavior via:
  - built-in ResonanceIDE extensions (e.g., `extensions/ResonanceIDE-core`)
  - external services (LiteLLM, Ollama)
- No direct OpenAI / Anthropic / Gemini calls in core VS Code code

Think **Hexagonal Architecture**:

- Core editor = domain
- AI = adapters

### ResonanceIDE AI Configuration Keys

| Setting                           | Type                                | Purpose              |
| --------------------------------- | ----------------------------------- | -------------------- |
| `ResonanceIDE.ai.backend`         | enum: `litellm`, `ollama`, `custom` | AI backend selection |
| `ResonanceIDE.ai.litellm.baseUrl` | string                              | LiteLLM endpoint     |
| `ResonanceIDE.ai.litellm.apiKey`  | string                              | LiteLLM API key      |
| `ResonanceIDE.ai.ollama.baseUrl`  | string                              | Ollama endpoint      |
| `ResonanceIDE.ai.model.default`   | string                              | Default model        |

### AiClientPort Interface

```typescript
interface AiClientPort {
	complete(params: CompletionParams): Promise<CompletionResult>;
	chat(params: ChatParams): Promise<ChatResult>;
	edit(params: EditParams): Promise<EditResult>;
	toolCall(params: ToolCallParams): Promise<ToolCallResult>;
}
```

---

## 9. Minimalism Rule

Every feature must justify its existence.

Before adding or keeping code, ask:

- Is this required for a minimal, modern code editor?
- Is this required for extension compatibility?
- Is this required for ResonanceIDE's AI-first vision?

If the answer is "no" to all three → it is a removal candidate.

### Must-Keep Features

- File explorer, search, editor tabs, problems, outline
- SCM (Git) core view
- Debug basics (launch, breakpoints, debug console)
- Integrated terminal
- Settings UI
- Extension marketplace (Open VSX or custom)

### Removal Candidates

- Walkthroughs / welcome page modules
- Remote tunneling, Live Share, MS-specific clouds
- Notebooks (unless needed)
- Built-in AI/Copilot experiences (replacing with our own)
- Microsoft accounts, GitHub auth, Azure integrations
- Settings Sync (MS backend)

---

## 10. Validating TypeScript Changes

**MANDATORY:** Always check the `VS Code - Build` watch task output for compilation errors before running ANY script or declaring work complete, then fix all compilation errors before moving forward.

- **NEVER** run tests if there are compilation errors
- **NEVER** use `npm run compile` to compile TypeScript files; use the watch task instead

### TypeScript Compilation Steps

1. Monitor the `VS Code - Build` task outputs for real-time compilation errors as you make changes
2. This task runs `Core - Build` and `Ext - Build` to incrementally compile VS Code TypeScript sources and built-in extensions
3. Start the task if it's not already running in the background

### TypeScript Validation Steps

- Use `scripts/test.sh` (or `scripts\test.bat` on Windows) for unit tests
  - Add `--grep <pattern>` to filter tests
- Use `scripts/test-integration.sh` (or `scripts\test-integration.bat` on Windows) for integration tests
  - Integration tests end with `.integrationTest.ts` or are in `/extensions/`
- Use `npm run valid-layers-check` to check for layering issues

---

## 11. Coding Guidelines

### Indentation

**Use tabs, not spaces.**

### Naming Conventions

| Type                           | Convention |
| ------------------------------ | ---------- |
| `type` names                   | PascalCase |
| `enum` values                  | PascalCase |
| `function` / `method` names    | camelCase  |
| `property` / `local variables` | camelCase  |

Use whole words in names when possible.

### Types

- Do not export `types` or `functions` unless you need to share them across multiple components
- Do not introduce new `types` or `values` to the global namespace

### Comments

- Use JSDoc style comments for `functions`, `interfaces`, `enums`, and `classes`

### Strings

| Context                         | Quote Style       |
| ------------------------------- | ----------------- |
| User-facing strings (localized) | `"double quotes"` |
| All other strings               | `'single quotes'` |

- All strings visible to the user need to be externalized using the `vs/nls` module
- Externalized strings must not use string concatenation. Use placeholders instead (`{0}`).

### UI Labels

- Use title-style capitalization for command labels, buttons, and menu items (each word is capitalized)
- Don't capitalize prepositions of four or fewer letters unless it's the first or last word (e.g., "in", "with", "for")

### Style

- Use arrow functions `=>` over anonymous function expressions
- Only surround arrow function parameters when necessary:

```typescript
// Wrong
(x) => x + x

// Correct
x => x + x
(x, y) => x + y
<T>(x: T, y: T) => x === y
```

- Always surround loop and conditional bodies with curly braces
- Open curly braces always go on the same line as whatever necessitates them
- Parenthesized constructs should have no surrounding whitespace:

```typescript
for (let i = 0, n = str.length; i < 10; i++) {
	if (x < 10) {
		foo();
	}
}
function f(x: number, y: string): void {}
```

- In top-level scopes, prefer `export function x(…) {…}` over `export const x = (…) => {…}` for better stack traces

### Code Quality

- All files must include Microsoft copyright header (inherited from upstream; maintain for mergeability)
- Prefer `async` and `await` over `Promise` and `then` calls
- All user-facing messages must be localized using `nls.localize()` method
- Don't add tests to the wrong test suite (e.g., adding to end of file instead of inside relevant suite)
- Look for existing test patterns before creating new structures
- Use `describe` and `test` consistently with existing patterns
- Prefer regex capture groups with names over numbered capture groups
- Clean up any temporary files, scripts, or helper files at the end of the task
- Never duplicate imports; always reuse existing imports if present
- Do not use `any` or `unknown` unless absolutely necessary; prefer proper types or interfaces

---

## 12. Finding Related Code

1. **Semantic search first**: Use file search for general concepts
2. **Grep for exact strings**: Use grep for error messages or specific function names
3. **Follow imports**: Check what files import the problematic module
4. **Check test files**: Often reveal usage patterns and expected behavior

---

## 13. Commit & Change Hygiene

When making changes:

- Prefer small, focused commits
- Clearly state:
  - what was copied from VSCodium
  - what was modified
  - why modification was necessary
- Avoid stylistic refactors unrelated to the task
- Guard new behaviors with `isResonanceIDE` feature flags when possible

### Maintain a Running CHANGELOG

Document:

- `product.json` changes
- Disabled built-in extensions
- Removed MS features
- Newly added ResonanceIDE ports/adapters

---

## 14. Build & Distribution

### Build Commands

```bash
# Platform builds
yarn gulp vscode-darwin-min      # macOS
yarn gulp vscode-win32-x64-min   # Windows
yarn gulp vscode-linux-x64-min   # Linux

# ResonanceIDE-specific (when wired)
yarn build:ResonanceIDE:darwin
yarn build:ResonanceIDE:win
yarn build:ResonanceIDE:linux
```

### Distribution Artifacts

| Platform | Format                       |
| -------- | ---------------------------- |
| macOS    | `.app` + `.dmg`              |
| Windows  | `setup.exe` / user installer |
| Linux    | `.deb`, `.rpm`, AppImage     |

---

## 15. Mental Model for Agents

Think of ResonanceIDE as:

> **VS Code OSS – Microsoft services – telemetry + AI ports + white labeling**

Not as:

- a new editor
- a full rewrite
- a custom runtime

Your job is **subtraction + careful reuse**, not invention.

---

## TL;DR for Agents

| Priority | Action                                 |
| -------- | -------------------------------------- |
| 1        | **Check VSCodium first**               |
| 2        | **Copy before coding**                 |
| 3        | **Disable before deleting**            |
| 4        | **Preserve extension compatibility**   |
| 5        | **Minimize diffs**                     |
| 6        | **Ports, not AI logic**                |
| 7        | **Small commits, clear intent**        |
| 8        | **Tabs, not spaces**                   |
| 9        | **Validate TypeScript before testing** |
| 10       | **Guard with `isResonanceIDE` flags**  |
