# Typst Language Features - Agent Instructions

## Mission

**Incrementally migrate** language features from `tinymist` (the Typst LSP) to this extension, using **WebAssembly (WASM)** for an **offline-first** experience that works in **both web and Electron**.

**Reference repositories:**
- `../../../tinymist` - Official Typst LSP (Rust)
- `../latex-language-features` - Sister LaTeX extension (for feature parity)

**Last Updated:** December 11, 2025 (Updated: Snippets, Text Shortcuts, and Diagnostics implemented)

---

## 🚨 CRITICAL: Web-First Development Policy

### ⛔ MANDATORY: All Features MUST Work in Both Web AND Desktop

**This is a web-first extension.** The primary target is the browser/web version. Desktop is secondary.

| Priority | Platform | Requirement |
|----------|----------|-------------|
| 1️⃣ **PRIMARY** | Web/Browser | **MUST work** - this is the main deployment target |
| 2️⃣ Secondary | Desktop/Electron | Should work - but never at the expense of web |

### ❌ UNACCEPTABLE Approaches

- "This doesn't work in WASM/web, so I'll implement it for desktop only"
- "The npm package isn't compatible with webworker, so this feature is desktop-only"
- "I'll add a fallback message for web users saying the feature isn't available"
- Leaving web support as a "future enhancement" or "TODO"

### ✅ REQUIRED Approach

If a library or approach doesn't work in the browser:

1. **Find an alternative** - Search for browser-compatible packages or approaches
2. **Create manual loaders** - If a WASM package has bundler issues, manually load the WASM file using `fetch()` and `WebAssembly.instantiate()`
3. **Port the logic** - If no WASM exists, consider porting the core algorithm to TypeScript
4. **Build WASM yourself** - Compile Rust/C code to WASM if needed

### Before Implementing Any Feature

Ask yourself:
- [ ] Will this work in a browser/webworker environment?
- [ ] Does it require Node.js APIs? If so, find alternatives.
- [ ] Does the WASM package work with webpack's webworker target?
- [ ] Have I tested in BOTH `./scripts/code-web.sh` AND `./scripts/code.sh`?

---

## 📊 Feature Implementation Status

### Legend

- ✅ **Done** - Feature is working
- 🚧 **Partial** - Feature exists but incomplete
- ❌ **TODO** - Needs implementation
- ⏭️ **N/A** - Not applicable

### Current Progress

```
Implemented:     27 features (16%)
Partial:          3 features (2%)
Not Implemented: 134 features (82%)

Overall: ~19% complete
```

---

## 🔥 Phase 1: Essential Features (HIGH PRIORITY)

These features should be implemented first for a solid editing experience.

### 1.1 Core LSP Features

| Feature | Status | Tinymist Ref | Notes |
|---------|--------|--------------|-------|
| Syntax Highlighting | ✅ | `syntaxes/` | TextMate grammar from tinymist |
| Language Configuration | ✅ | `syntaxes/` | Brackets, comments |
| Document Symbols | ✅ | `document_symbol.rs` | Uses regex, tinymist uses parser |
| Completion Provider | 🚧 | `completion.rs` | Static only, needs context-aware |
| Hover Provider | 🚧 | `hover.rs` | Static only, needs rich docs |
| Math Hover Preview | ✅ | - | Uses WASM compiler |
| Document Formatting | ✅ | `tool/text.rs` | Uses typstyle WASM |
| Diagnostics | ✅ | `diagnostics.rs` | Via WASM compilation with `getDiagnostics()` API for proper line/column numbers |
| Code Folding | ✅ | `folding_range.rs` | Headings, functions, blocks (regex-based) |
| **Go to Definition** | ❌ | `goto_definition.rs` | Labels, functions, imports |
| **Signature Help** | ❌ | `signature_help.rs` | Function parameter popup |
| **Semantic Tokens** | ❌ | `semantic_tokens_full.rs` | Full syntax highlighting |

### 1.2 Snippets (✅ Done)

Created `snippets/typst.json` with 15 snippets:

| Snippet | Trigger | Output |
|---------|---------|--------|
| Document setup | `doc` | `#set document(...)\n#set page(...)` |
| Figure | `fig` | `#figure(image(""), caption: [])` |
| Table | `tab` | `#table(columns: (), ...)` |
| Math block | `$$` | `$ ... $` |
| Code block | `raw` | `` ```lang ... ``` `` |
| List | `list` | `- item\n- item` |
| Numbered list | `enum` | `+ item\n+ item` |
| Heading 1 | `h1` | `= Heading` |
| Heading 2 | `h2` | `== Heading` |
| Heading 3 | `h3` | `=== Heading` |
| Bold | `bold` | `*text*` |
| Italic | `italic` | `_text_` |
| Link | `link` | `[text](url)` |
| Label | `label` | `<label>` |
| Reference | `ref` | `@label` |

### 1.3 Text Shortcuts (✅ Done)

Implemented in `src/features/textCommands.ts`:

| Shortcut | Action | Keybinding | Notes |
|----------|--------|------------|-------|
| Bold | Wrap with `*text*` | `Cmd+B` / `Ctrl+B` | Toggles bold, detects existing formatting |
| Italic | Wrap with `_text_` | `Cmd+I` / `Ctrl+I` | Toggles italic, detects existing formatting |
| Underline | Wrap with `#underline[text]` | `Cmd+U` / `Ctrl+U` | Toggles underline, detects existing formatting |

All shortcuts work in both web and desktop, with smart detection of existing formatting to toggle on/off.

### 1.4 Reference Completion (❌ TODO)

- Complete `@label` with document labels
- Complete `#bibliography()` citations
- Complete file paths in `#include()`, `#image()`

---

## 📝 Phase 2: Enhanced Editing (MEDIUM PRIORITY)

### 2.1 Navigation & Selection

| Feature | Status | Tinymist Ref | Notes |
|---------|--------|--------------|-------|
| Selection Range | ❌ | `selection_range.rs` | Smart selection expansion |
| Find References | ❌ | `references.rs` | Find all usages |
| Document Highlight | ❌ | `document_highlight.rs` | Highlight same symbols |
| Document Link | ❌ | `document_link.rs` | Clickable links |

### 2.2 Refactoring

| Feature | Status | Tinymist Ref | Notes |
|---------|--------|--------------|-------|
| Rename Symbol | ❌ | `rename.rs` | Rename across files |
| Prepare Rename | ❌ | `prepare_rename.rs` | Validate before rename |
| Code Actions | ❌ | `code_action.rs` | Quick fixes |

### 2.3 Editing Commands

| Command | Status | Notes |
|---------|--------|-------|
| Promote Section | ❌ | `= Heading` → `== Heading` |
| Demote Section | ❌ | `== Heading` → `= Heading` |
| Select Section | ❌ | Select heading + content |
| Wrap with Function | ❌ | Wrap selection with `#func[]` |
| Go to Matching Pair | ❌ | Jump between `{` and `}` |
| Smart Enter | ❌ | Continue comments, lists |

### 2.4 Hover Enhancements

| Feature | Status | Notes |
|---------|--------|-------|
| Reference Hover | ❌ | Preview `@label` content |
| Image Hover | ❌ | Preview `#image()` |
| Inlay Hints | ❌ | Parameter names, types |

---

## 🚀 Phase 3: Advanced Features (LOWER PRIORITY)

### 3.1 Export & Preview

| Feature | Status | Tinymist Ref | Notes |
|---------|--------|--------------|-------|
| Preview | ✅ | `typst-preview/` | Side-by-side |
| Export PDF | ✅ | - | Via WASM |
| Export PNG | ❌ | - | Page images |
| Export SVG | ❌ | - | Vector export |
| Export HTML | ❌ | - | HTML output |
| Source ↔ Preview Sync | ❌ | `jump.rs` | Bidirectional click |
| Scroll Sync | ❌ | - | Sync scroll position |

### 3.2 UI Components

| Feature | Status | Notes |
|---------|--------|-------|
| Word Count | ❌ | Status bar counter |
| Compile Status | ❌ | Status bar indicator |
| Symbol View | ❌ | Visual symbol browser |
| Font View | ❌ | Browse available fonts |
| Package View | ❌ | Package manager UI |
| Template Gallery | ❌ | Project templates |

### 3.3 Productivity

| Feature | Status | Notes |
|---------|--------|-------|
| Drag & Drop Images | ❌ | Insert `#image()` on drop |
| Paste Images | ❌ | Save and insert pasted images |
| Color Picker | ❌ | Visual color selection |

---

## 🔮 Phase 4: Power User Features (FUTURE)

| Feature | Status | Notes |
|---------|--------|-------|
| Debugger (DAP) | ❌ | Step-through debugging |
| Breakpoints | ❌ | Set breakpoints |
| Profiling | ❌ | Performance analysis |
| Code Coverage | ❌ | Test coverage |
| AST Viewer | ❌ | Debug tool |
| Slide Mode | ❌ | Presentation preview |

---

## 🏗️ Architecture

### WASM-First Approach

Unlike traditional LSP extensions that use a client-server architecture with IPC, this extension runs the language server **entirely in-browser** using WebAssembly:

```
┌─────────────────────────────────────────────────┐
│                   VS Code                        │
│  ┌─────────────────────────────────────────┐    │
│  │         Extension Host                   │    │
│  │  ┌─────────────────────────────────┐    │    │
│  │  │    typst-language-features      │    │    │
│  │  │  ┌─────────────────────────┐    │    │    │
│  │  │  │   TypeScript Layer      │    │    │    │
│  │  │  │   (typstService.ts)     │    │    │    │
│  │  │  └──────────┬──────────────┘    │    │    │
│  │  │             │                    │    │    │
│  │  │  ┌──────────▼──────────────┐    │    │    │
│  │  │  │   WASM Layer            │    │    │    │
│  │  │  │   typst-ts-web-compiler │    │    │    │
│  │  │  │   typst-ts-renderer     │    │    │    │
│  │  │  └─────────────────────────┘    │    │    │
│  │  └─────────────────────────────────┘    │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### Current Dependencies (WASM)

| Package | Purpose | Size |
|---------|---------|------|
| `@myriaddreamin/typst-ts-web-compiler` | Typst compiler (PDF, diagnostics) | ~21 MB |
| `@myriaddreamin/typst-ts-renderer` | SVG rendering for preview | ~1 MB |
| `@myriaddreamin/typst.ts` | High-level TypeScript API | - |
| `@typstyle/typstyle-wasm-bundler` | Code formatting | ~2 MB |

### File Structure

```
typst-language-features/
├── src/
│   ├── extension.ts              # Electron entry point
│   ├── extension.browser.ts      # Browser entry point
│   ├── typstService.ts           # Main service (WASM management, validation)
│   ├── wasm/
│   │   ├── index.ts              # WASM exports
│   │   ├── typstWasm.ts          # Typst compiler WASM loading (with getDiagnostics API)
│   │   └── typstyleWasm.ts       # Typstyle formatter WASM (manual loader)
│   └── features/
│       ├── completionProvider.ts  # Static completions
│       ├── hoverProvider.ts       # Static hover
│       ├── mathHoverProvider.ts   # Math preview hover
│       ├── documentSymbolProvider.ts # Regex-based symbols
│       ├── foldingProvider.ts       # Code folding (headings, blocks, functions)
│       ├── formattingProvider.ts  # Document formatting (typstyle WASM)
│       └── textCommands.ts        # Text formatting shortcuts (bold, italic, underline)
├── snippets/                      # ✅ Snippets implemented
│   └── typst.json                 # 15 Typst snippets
├── syntaxes/
│   ├── typst.tmLanguage.json     # TextMate grammar
│   ├── language-configuration.json
│   └── typst-markdown-injection.json
├── extension-browser.webpack.config.js  # Web build
├── extension.webpack.config.js          # Desktop build
└── package.json
```

---

## ⚠️ CRITICAL: Dual Entry Point Registration

**This extension has TWO entry points that MUST be kept in sync:**

| File | Platform | WASM Path |
|------|----------|-----------|
| `src/extension.ts` | Desktop/Electron | `['out', 'wasm']` |
| `src/extension.browser.ts` | Web/Browser | `['dist', 'browser', 'wasm']` |

### ALWAYS update BOTH files when:
- Adding new imports
- Registering new providers (completion, hover, etc.)
- Registering new commands
- Adding subscriptions to context
- Changing WASM initialization

**⛔ FAILURE TO UPDATE BOTH FILES WILL RESULT IN FEATURES WORKING IN DESKTOP BUT NOT WEB!**

---

## 📚 Reference: Tinymist LSP

The `tinymist` repository contains the reference implementation:

```
../../../tinymist/
├── crates/
│   ├── tinymist/              # Main LSP server
│   │   └── src/web.rs         # WASM bindings
│   ├── tinymist-query/        # Query engine (language features)
│   │   └── src/
│   │       ├── completion.rs
│   │       ├── hover.rs
│   │       ├── goto_definition.rs
│   │       ├── references.rs
│   │       ├── rename.rs
│   │       ├── folding_range.rs
│   │       ├── semantic_tokens_full.rs
│   │       ├── signature_help.rs
│   │       ├── document_symbol.rs
│   │       └── ...
│   └── typst-preview/         # Preview functionality
├── editors/vscode/            # Reference VS Code extension
│   ├── src/
│   └── package.json           # Commands, config reference
└── tools/typst-preview-frontend/
```

### Key Files to Study

| Feature | Tinymist Location |
|---------|-------------------|
| Completion | `tinymist-query/src/completion.rs` + `analysis/completion/` |
| Hover | `tinymist-query/src/hover.rs` |
| Go to Definition | `tinymist-query/src/goto_definition.rs` |
| Find References | `tinymist-query/src/references.rs` |
| Rename | `tinymist-query/src/rename.rs` |
| Code Folding | `tinymist-query/src/folding_range.rs` |
| Semantic Tokens | `tinymist-query/src/semantic_tokens_full.rs` |
| Signature Help | `tinymist-query/src/signature_help.rs` |
| Document Symbols | `tinymist-query/src/document_symbol.rs` |
| On Enter | `tinymist-query/src/on_enter.rs` |

---

## 🛠️ Adding New Features

### Example: Adding a New Provider

1. **Create the provider** in `src/features/`:

```typescript
// src/features/newProvider.ts
import * as vscode from 'vscode';

export class TypstNewProvider implements vscode.SomeProvider {
    provideSomething(document: vscode.TextDocument): vscode.Something[] {
        // Implementation
    }
}
```

2. **Register in BOTH entry points**:

```typescript
// src/extension.ts AND src/extension.browser.ts
import { TypstNewProvider } from './features/newProvider';

// In activate():
context.subscriptions.push(
    vscode.languages.registerSomeProvider(
        typstSelector,
        new TypstNewProvider()
    )
);
```

3. **Build both versions**:

```bash
npx gulp compile-extension:typst-language-features
npx gulp compile-web
```

### Example: Adding WASM-Based Feature

1. **Add method to typstWasm.ts**:

```typescript
export async function newWasmFeature(source: string): Promise<Result> {
    if (!typstInstance) {
        return { error: 'Not initialized' };
    }
    return await typstInstance.someMethod({ mainContent: source });
}
```

2. **Export from wasm/index.ts**:

```typescript
export { newWasmFeature } from './typstWasm';
```

3. **Use in typstService.ts or provider**:

```typescript
import { newWasmFeature } from './wasm';

async doSomething(document: vscode.TextDocument) {
    const result = await newWasmFeature(document.getText());
    // Handle result
}
```

---

## 🌐 Web Compatibility Rules

### ❌ DO NOT USE in browser code:
- `fs`, `path`, `child_process` modules
- `process.env`, `__dirname`, `__filename`
- Node.js-specific globals
- `document.fileName` (use `document.uri.toString()`)
- `uri.fsPath` (use `uri.path` or `uri.toString()`)

### ✅ USE INSTEAD:
- `vscode.workspace.fs` for file operations
- `vscode.Uri.joinPath()` for path manipulation
- `document.uri.toString()` for document identification
- Web Workers for background processing
- WASM for computation

---

## 📦 WASM Loading Patterns

### Pattern 1: Package Works with Webpack (Ideal)

```typescript
const module = await import('some-wasm-package');
module.someFunction();
```

### Pattern 2: Manual WASM Loading (When Package Fails)

See `src/wasm/typstyleWasm.ts` for a complete example:

1. **Copy WASM file in webpack config**
2. **Alias the package to false**
3. **Create manual loader with fetch + WebAssembly.instantiate**
4. **Implement wasm-bindgen imports**

---

## 🧪 Testing

### Manual Testing

```bash
# Desktop version
cd vscode
./scripts/code.sh

# Web version (TEST THIS FIRST!)
./scripts/code-web.sh
```

### Test Checklist

- [ ] Extension activates on `.typ` file
- [ ] Syntax highlighting works
- [ ] Completions appear after `#`
- [ ] Hover shows documentation
- [ ] Document symbols show in outline
- [ ] Preview command works (`Cmd+K V`)
- [ ] Export PDF command works
- [ ] Diagnostics show for syntax errors
- [ ] Formatting works (`Shift+Alt+F`)
- [ ] **All above work in web version too**

---

## 📋 Quick Reference

### Build Commands

```bash
# Install dependencies
npm install

# Compile TypeScript (desktop)
npx gulp compile-extension:typst-language-features

# Compile for web (includes WASM bundling)
npx gulp compile-web

# Run hygiene checks
npm run precommit
```

### Key Files

| File | Purpose |
|------|---------|
| `typstService.ts` | Main service, WASM lifecycle |
| `wasm/typstWasm.ts` | Typst compiler WASM (uses getDiagnostics API for proper error locations) |
| `wasm/typstyleWasm.ts` | Typstyle formatter (manual loader) |
| `extension.ts` | Desktop entry point |
| `extension.browser.ts` | Web entry point (**test first!**) |
| `package.json` | Extension manifest |

### Fixing Formatting Issues

When pre-commit hook reports formatting errors:

```bash
cd vscode
node --input-type=module -e "import {format} from './build/lib/formatter.ts'; import fs from 'fs'; const content = fs.readFileSync('src/path/to/file.ts', 'utf8'); const formatted = format('src/path/to/file.ts', content); fs.writeFileSync('src/path/to/file.ts', formatted, 'utf8'); console.log('Formatted');"
```

---

## 🎯 When in Doubt

1. **Web MUST work**: If it doesn't work in web, the feature is NOT done
2. **Test web FIRST**: Always test `./scripts/code-web.sh` first
3. **Check tinymist**: Reference at `../../../tinymist/`
4. **Check latex-language-features**: Similar extension patterns
5. **Use static data first**: Implement with static data, upgrade to WASM later
6. **Keep entry points in sync**: Update both `extension.ts` and `extension.browser.ts`
7. **Manual WASM loading**: If a package fails, create manual loader (see `typstyleWasm.ts`)
