# LaTeX Language Features - Agent Instructions

## Mission

**Reuse and adapt** existing code from `latex-workshop` extension (`vscode/resources/extensions/latex-workshop/`) to `latex-language-features` extension (`vscode/extensions/latex-language-features/`) by **wrapping it in a client-server architecture** that works in **both web and Electron**.

**DO NOT rewrite from scratch** - maximize code reuse from the existing extension.

## Critical Requirements

1. **Reuse Existing Code**: Copy and adapt code from `latex-workshop` instead of rewriting
2. **Client-Server Wrapper**: Wrap existing code in client-server architecture
3. **Web + Electron Compatible**: Adapt code to work in browser AND desktop
4. **Piece-by-Piece Migration**: Migrate one feature at a time, reusing its code
5. **Minimal Changes**: Make only necessary adaptations for architecture and compatibility

## ⚠️ CRITICAL: Dual Entry Point Registration

**This extension has TWO entry points that MUST be kept in sync:**

| File | Platform | Used When |
|------|----------|-----------|
| `src/extension.ts` | Desktop/Electron | Running in VS Code desktop |
| `src/extension.browser.ts` | Web/Browser | Running in vscode.dev or web version |

### ALWAYS update BOTH files when:
- Adding new imports
- Registering new providers (completion, folding, hover, etc.)
- Registering new commands
- Adding subscriptions to context

### Example - Adding a new provider:

```typescript
// 1. Add import to BOTH files:
// extension.ts AND extension.browser.ts
import { registerNewProvider } from './newFeature';

// 2. Add registration to BOTH files:
// extension.ts AND extension.browser.ts
const disposables = registerNewProvider(context);
disposables.forEach(d => context.subscriptions.push(d));
logger.info('New Provider registered'); // or console.log for browser
```

### Build commands:
```bash
# Desktop version
npm run compile

# Web version (MUST run after adding new features!)
npm run compile-web
```

**⛔ FAILURE TO UPDATE BOTH FILES WILL RESULT IN FEATURES WORKING IN DESKTOP BUT NOT WEB (or vice versa)!**

## Architecture Pattern

### Structure
```
latex-language-features/
├── client/
│   ├── src/
│   │   ├── node/clientMain.ts      # Electron entry
│   │   ├── browser/clientMain.ts    # Web entry
│   │   └── [feature code]
│   └── tsconfig.json
├── server/
│   ├── src/
│   │   ├── node/serverMain.ts       # Node.js server
│   │   ├── browser/serverMain.ts    # Web Worker server
│   │   └── [feature code]
│   └── tsconfig.json
└── package.json
```

### Entry Points (package.json)
- `"main"`: `./client/out/node/clientMain` (Electron)
- `"browser"`: `./client/dist/browser/clientMain` (Web)

## Migration Strategy: Reuse First, Adapt Second

### 1. Locate and Copy Source Code
- **Find source files** in `latex-workshop/extension/out/src/` (compiled JS) or source TypeScript if available
- **Copy entire modules** to appropriate location in `latex-language-features`
- **Preserve structure**: Keep similar directory structure when possible
- **Copy dependencies**: Include utility files, types, and helpers

### 2. Identify Reusable Components

**Directly Reusable (copy as-is or with minimal changes):**
- Parsing logic (AST, tokenization)
- Data structures and types
- Utility functions (string manipulation, path helpers)
- Configuration schemas
- Data files (JSON, snippets)

**Needs Adaptation (wrap or refactor):**
- VS Code API calls (vscode.* → connection.* or client adapters)
- File system operations (fs → vscode.workspace.fs or LSP)
- Process execution (child_process → platform abstraction)
- Extension context usage

### 3. Create Client-Server Wrapper

**Strategy**: Wrap existing code with LSP client-server layer, don't rewrite the core logic.

**Node.js Server** (`server/src/node/serverMain.ts`):
```typescript
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';
import { LaTeXWorkshopFeature } from './latex-workshop-feature'; // Reused code

const connection = createConnection(ProposedFeatures.all);

// Wrap existing feature with LSP interface
const feature = new LaTeXWorkshopFeature(connection);

connection.onRequest('latex/build', async (params) => {
    // Delegate to existing code
    return await feature.build(params.uri);
});

connection.listen();
```

**Browser Server** (`server/src/browser/serverMain.ts`):
```typescript
import { createConnection, BrowserMessageReader, BrowserMessageWriter } from 'vscode-languageserver/browser';
import { LaTeXWorkshopFeature } from './latex-workshop-feature'; // Same reused code

const reader = new BrowserMessageReader(self);
const writer = new BrowserMessageWriter(self);
const connection = createConnection(reader, writer);

// Same wrapper pattern
const feature = new LaTeXWorkshopFeature(connection);
// ... same handlers

connection.listen();
```

### 4. Adapt VS Code API Calls

**Pattern for adapting vscode.* API:**

```typescript
// Original code (latex-workshop):
import * as vscode from 'vscode';
const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri);
const config = vscode.workspace.getConfiguration('latex-workshop');

// Adapted for server:
import { Connection } from 'vscode-languageserver';
const doc = connection.documents.get(uri);
const config = await connection.workspace.getConfiguration({ section: 'latex' });

// Adapted for client:
import * as vscode from 'vscode';
const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri);
const config = vscode.workspace.getConfiguration('latex');
```

### 5. Create Adapter Layer

Instead of rewriting, create adapters that translate between old and new APIs:

```typescript
// server/src/adapters/vscodeAdapter.ts
// Adapts vscode.* API to LSP connection API
export class VSCodeAdapter {
    constructor(private connection: Connection) {}

    async getTextDocument(uri: string) {
        return this.connection.documents.get(uri);
    }

    async getConfiguration(section: string) {
        return await this.connection.workspace.getConfiguration({ section });
    }

    // ... more adapters
}

// Then in reused code:
// Replace: vscode.workspace.getTextDocument()
// With: adapter.getTextDocument()
```

### 6. Platform Abstraction for Node.js-Only Code

**For code using fs, child_process, etc.:**

```typescript
// Copy existing implementation to server/src/node/
import { LaTeXCompiler } from '../../latex-workshop/compile'; // Reused code

// Create browser version that uses WASM or delegates
// server/src/browser/compiler.ts
export class BrowserLaTeXCompiler {
    // Use WASM or call Node server if available
    async compile(uri: string) {
        // Browser-compatible implementation
    }
}

// Platform abstraction
export function createCompiler(platform: 'node' | 'browser') {
    if (platform === 'node') {
        return new LaTeXCompiler(); // Reused code
    } else {
        return new BrowserLaTeXCompiler();
    }
}
```

## Web Compatibility Rules

### ❌ DO NOT USE in browser code:
- `fs`, `path`, `child_process` modules
- `process.env`, `__dirname`, `__filename`
- Node.js-specific globals

### ✅ USE INSTEAD:
- `vscode.workspace.fs` for file operations
- `vscode-uri` for URI handling
- Web Workers for background processing
- Browser-compatible APIs

## ⚠️ CRITICAL: Common Web Compatibility Pitfalls

These issues cause features to work in desktop but FAIL in production web:

### 1. Document Identification

**❌ WRONG - Uses `fileName` which is empty/unreliable in web:**
```typescript
const filePath = document.fileName;
await refreshCache(document.fileName);
```

**✅ CORRECT - Uses URI which works in all environments:**
```typescript
const docId = document.uri.toString();
await refreshCache(document.uri.toString());
// Or for non-file schemes, use document content directly:
if (document.uri.scheme !== 'file') {
    await refreshCacheFromDocument(document);
}
```

### 2. URI Scheme Restrictions

**❌ WRONG - Restricts to specific schemes, blocks web URIs:**
```typescript
const ALLOWED_SCHEMES = ['file', 'untitled', 'vscode-vfs'];
if (!ALLOWED_SCHEMES.includes(document.uri.scheme)) {
    return []; // Blocks web schemes like 'https', 'github', etc.
}
```

**✅ CORRECT - Accept all schemes since underlying APIs are scheme-agnostic:**
```typescript
// Remove scheme checks - vscode.workspace.fs and document.getText() work with any scheme
// The document selector already uses scheme: '*' which allows all schemes
```

### 3. Using `fsPath` Instead of `path`

**❌ WRONG - `fsPath` doesn't work correctly for non-file:// schemes:**
```typescript
const filePath = fileUri.fsPath; // Returns garbage for vscode-vfs://, https://, etc.
```

**✅ CORRECT - Use `path` property or `toString()`:**
```typescript
const filePath = fileUri.path;        // For display/comparison
const uriString = fileUri.toString(); // For cache keys and storage
```

### 4. Node.js `path` Module

**❌ WRONG - `path` module doesn't exist in browser:**
```typescript
import * as path from 'path';
const ext = path.extname(filePath);
const dir = path.dirname(filePath);
const full = path.join(dir, fileName);
```

**✅ CORRECT - Create URI-compatible utilities:**
```typescript
// Custom functions that work with both paths and URI strings
function getExtension(pathOrUri: string): string {
    const pathPart = pathOrUri.includes('://') ? pathOrUri.split('?')[0] : pathOrUri;
    const lastDot = pathPart.lastIndexOf('.');
    const lastSlash = Math.max(pathPart.lastIndexOf('/'), pathPart.lastIndexOf('\\'));
    return (lastDot > lastSlash && lastDot !== -1) ? pathPart.substring(lastDot) : '';
}

function getDirname(pathOrUri: string): string {
    if (pathOrUri.includes('://')) {
        const uri = vscode.Uri.parse(pathOrUri);
        const pathParts = uri.path.split('/').filter(p => p);
        pathParts.pop();
        return uri.with({ path: '/' + pathParts.join('/') }).toString();
    }
    const normalized = pathOrUri.replace(/\\/g, '/');
    const lastSlash = normalized.lastIndexOf('/');
    return lastSlash !== -1 ? normalized.substring(0, lastSlash) : '';
}

function joinPath(base: string, ...segments: string[]): string {
    if (base.includes('://')) {
        return vscode.Uri.joinPath(vscode.Uri.parse(base), ...segments).toString();
    }
    // Simple string-based join for file paths
    let result = base.replace(/\\/g, '/').replace(/\/$/, '');
    for (const segment of segments) {
        result += '/' + segment.replace(/^\//, '');
    }
    return result;
}
```

### 5. Hover Links for Navigation

**❌ WRONG - These approaches don't work reliably:**
```typescript
// Plain links don't work in web:
const link = `[Go to definition](${fileUri.toString()}#L${line})`;

// vscode.open fails with virtual schemes (vscode-local:, vscode-vfs:, etc.):
const args = encodeURIComponent(JSON.stringify([fileUri.toString()]));
const link = `[Go to definition](command:vscode.open?${args})`;

// editor.action.goToLocations fails because arguments need specific VS Code types:
const args = encodeURIComponent(JSON.stringify([uri, position, locations]));
const link = `[Go to definition](command:editor.action.goToLocations?${args})`;
```

**✅ CORRECT - Register a custom command that handles navigation:**
```typescript
// 1. Define command ID
export const GOTO_LOCATION_COMMAND = 'latex.gotoLocation';

// 2. Register the command in constructor or activation
vscode.commands.registerCommand(GOTO_LOCATION_COMMAND, async (uriString: string, line: number) => {
    try {
        const uri = vscode.Uri.parse(uriString);
        const position = new vscode.Position(line, 0);

        // Open document and reveal location - works in both desktop and web
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc, { preview: false });
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    } catch (error) {
        console.error('Failed to navigate:', error);
    }
});

// 3. Use the custom command in hover links
const args = encodeURIComponent(JSON.stringify([fileUri.toString(), line]));
const linkMarkdown = new vscode.MarkdownString(
    `[Go to definition](command:${GOTO_LOCATION_COMMAND}?${args})`
);
linkMarkdown.isTrusted = true; // Required for command URIs
```

**Why this works:** Custom commands receive plain JSON-parsed arguments (strings, numbers, objects) which we can then convert to proper VS Code types (`vscode.Uri.parse()`, `new vscode.Position()`, etc.) inside the handler.

### 6. File System Operations

**❌ WRONG - Using `vscode.Uri.file()` for all URIs:**
```typescript
const uri = vscode.Uri.file(filePath); // Only works for file:// scheme
```

**✅ CORRECT - Parse existing URIs, only use file() for actual file paths:**
```typescript
const uri = filePath.includes('://')
    ? vscode.Uri.parse(filePath)    // Already a URI string
    : vscode.Uri.file(filePath);    // Actual file path
```

### 7. Cache Keys

**❌ WRONG - Using file paths as cache keys:**
```typescript
const cache = new Map<string, CacheEntry>();
cache.set(document.fileName, entry); // fileName is unreliable in web
```

**✅ CORRECT - Using URI strings as cache keys:**
```typescript
const cache = new Map<string, CacheEntry>();
cache.set(document.uri.toString(), entry); // Works for all schemes
```

### Summary Table

| Pattern | Desktop | Web | Solution |
|---------|---------|-----|----------|
| `document.fileName` | ✅ | ❌ | Use `document.uri.toString()` |
| `uri.fsPath` | ✅ | ❌ | Use `uri.path` or `uri.toString()` |
| `path.dirname()` | ✅ | ❌ | Create custom `getDirname()` |
| `path.join()` | ✅ | ❌ | Use `vscode.Uri.joinPath()` or custom |
| `path.extname()` | ✅ | ❌ | Create custom `getExtension()` |
| `vscode.Uri.file()` | ✅ | ⚠️ | Use `vscode.Uri.parse()` for URI strings |
| Scheme restrictions | ✅ | ❌ | Remove or expand to include web schemes |
| Plain hover links | ✅ | ❌ | Use `command:vscode.open?...` |

### Testing Checklist for Web Compatibility

- [ ] Feature works with `file://` scheme (desktop)
- [ ] Feature works with `vscode-vfs://` scheme (web virtual file system)
- [ ] Feature works with `https://` scheme (if applicable)
- [ ] No `path` module imports in browser-bundled code
- [ ] No `fsPath` usage for non-file schemes
- [ ] URI strings used as cache keys instead of file paths
- [ ] Hover links use command URIs
- [ ] Document content read via `document.getText()` (not file system) when possible

## Code Reuse Patterns

### Pattern 1: Direct Copy with Minimal Changes

**When**: Pure logic, no VS Code API dependencies
```typescript
// Copy entire file from latex-workshop/extension/out/src/parse/parser.ts
// to latex-language-features/server/src/parse/parser.ts
// Change imports if needed, but keep logic intact
```

### Pattern 2: Wrap with Adapter

**When**: Uses vscode.* API that needs LSP translation
```typescript
// Original (latex-workshop):
class Feature {
    constructor(private context: vscode.ExtensionContext) {}
    async build(uri: vscode.Uri) {
        const doc = vscode.workspace.textDocuments.find(...);
        // ... existing logic
    }
}

// Adapted (latex-language-features):
class Feature {
    constructor(private adapter: VSCodeAdapter) {} // Adapter layer
    async build(uri: string) {
        const doc = await this.adapter.getTextDocument(uri);
        // ... same existing logic, minimal changes
    }
}
```

### Pattern 3: Extract and Adapt

**When**: Mixed concerns (UI + logic)
```typescript
// Extract pure logic from latex-workshop
// Keep in server/src/
// Create thin client wrapper that calls server via LSP
```

### Pattern 4: Platform-Specific Wrappers

**When**: Node.js-only code (fs, child_process)
```typescript
// Keep original in server/src/node/ (works as-is)
// Create browser version in server/src/browser/ that:
//   - Uses WASM for computation
//   - Delegates to Node server if available
//   - Uses Web APIs where possible
```

## Common Adaptations

### File Reading
```typescript
// Original (latex-workshop):
import * as fs from 'fs';
const content = fs.readFileSync(path, 'utf8');

// Reuse in Node server (keep as-is):
import * as fs from 'fs';
const content = fs.readFileSync(path, 'utf8');

// Adapt for browser server:
const response = await fetch(uri);
const content = await response.text();
```

### Process Execution
```typescript
// Original (latex-workshop):
import { exec } from 'child_process';
exec('pdflatex file.tex', callback);

// Reuse in Node server (keep as-is):
import { exec } from 'child_process';
exec('pdflatex file.tex', callback);

// Adapt for browser (use WASM or delegate):
// Browser: Use WASM LaTeX compiler or call Node server
```

### Configuration
```typescript
// Original (latex-workshop):
const config = vscode.workspace.getConfiguration('latex-workshop');

// Adapt for client (similar):
const config = vscode.workspace.getConfiguration('latex');

// Adapt for server:
const config = await connection.workspace.getConfiguration({ section: 'latex' });
```

### Diagnostics
```typescript
// Original (latex-workshop):
diagnosticCollection.set(uri, diagnostics);

// Adapt for server:
connection.sendDiagnostics({ uri, diagnostics });
```

## Reference Extensions

Study these for patterns:
- `vscode/extensions/json-language-features/` - Full example
- `vscode/extensions/markdown-language-features/` - Good patterns
- `vscode/extensions/html-language-features/` - Another reference

## Quick Checklist

- [ ] Feature identified in `latex-workshop/extension/out/src/`
- [ ] Source code files located and understood
- [ ] Reusable code identified (logic, parsers, utilities)
- [ ] Code copied to appropriate location
- [ ] VS Code API calls adapted (vscode.* → LSP or adapter)
- [ ] Adapter layer created if needed
- [ ] Client wrapper created (calls server via LSP)
- [ ] Server wrapper created (Node + Browser)
- [ ] Platform-specific code abstracted (Node vs Browser)
- [ ] Configuration adapted
- [ ] Commands registered
- [ ] **⚠️ Provider registered in `extension.ts` (Desktop)**
- [ ] **⚠️ Provider registered in `extension.browser.ts` (Web)**
- [ ] **⚠️ No `path` module usage in browser code**
- [ ] **⚠️ No `fsPath` usage for non-file schemes**
- [ ] **⚠️ Using `document.uri.toString()` instead of `document.fileName`**
- [ ] **⚠️ No restrictive URI scheme checks**
- [ ] **⚠️ Hover links use `command:` URI scheme**
- [ ] Compiled with `npm run compile`
- [ ] Compiled with `npm run compile-web`
- [ ] Tested in Electron
- [ ] Tested in Web (vscode.dev or production)
- [ ] Feature parity verified between desktop and web

## Key Principles

1. **Reuse First**: Copy and adapt existing code, don't rewrite
2. **Minimal Changes**: Only modify what's necessary for architecture/compatibility
3. **Adapter Pattern**: Create adapters to translate APIs, not rewrite logic
4. **Separation of Concerns**: Wrap existing code in client-server, keep logic intact
5. **Platform Abstraction**: Abstract only Node.js-specific parts, reuse rest
6. **Type Safety**: Preserve existing types, add new ones only when needed
7. **Incremental Migration**: Migrate feature-by-feature, reusing each piece

## Code Reuse Priority

1. **High Priority (Copy directly)**:
   - Parsers and AST logic
   - Data structures and types
   - Utility functions
   - Configuration schemas
   - Data files (JSON, snippets)

2. **Medium Priority (Copy + Adapt)**:
   - Business logic with VS Code API calls
   - File operations (adapt to LSP)
   - Configuration access (adapt to LSP)

3. **Low Priority (Rewrite only if necessary)**:
   - Extension activation code
   - Command registration
   - UI-specific code (move to client)

## When in Doubt

1. **Check source first**: Look in `latex-workshop/extension/out/src/` for existing implementation
2. **Copy before adapting**: Get the code working first, then optimize
3. **Use adapters**: Don't rewrite, create translation layers
4. **Preserve logic**: Keep the core algorithms and data structures intact
5. **Test incrementally**: Verify each piece works before moving to next
6. **Reference extensions**: Check `json-language-features` for client-server patterns
7. **Reuse over rewrite**: Always prefer copying and adapting over creating from scratch

