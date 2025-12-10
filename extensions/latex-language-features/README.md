# LaTeX Language Features

A built-in VS Code extension providing LaTeX compilation, preview, and language features for DSpace.

## Features

- **LaTeX Compilation**: Compile LaTeX documents using WebAssembly (primary) or server-side compilation (fallback)
- **PDF Preview**: Preview compiled PDFs directly in VS Code
- **Auto-build**: Automatically build LaTeX documents on save or file change
- **Clean**: Remove LaTeX auxiliary files
- **SyncTeX**: Synchronize between source and PDF (planned)

## Compilation Modes

The extension supports three compilation modes:

1. **Auto** (default): Tries WebAssembly compilation first, falls back to server-side if WASM fails
2. **WASM**: Uses WebAssembly-based LaTeX compiler (browser-compatible)
3. **Server**: Uses server-side LaTeX tools (requires LaTeX installation or LaTeX Workshop extension)

## Configuration

### `latex.compilation.mode`
- Type: `string`
- Default: `"auto"`
- Options: `"auto"`, `"wasm"`, `"server"`
- Description: LaTeX compilation mode

### `latex.compilation.recipe`
- Type: `string`
- Default: `"pdflatex"`
- Options: `"pdflatex"`, `"latexmk"`, `"xelatex"`, `"lualatex"`
- Description: LaTeX compilation recipe. `pdflatex` works in both web and desktop contexts. `latexmk`, `xelatex`, and `lualatex` require server-side compilation (desktop only).

### `latex.compilation.autoBuild`
- Type: `string`
- Default: `"onSave"`
- Options: `"never"`, `"onSave"`, `"onFileChange"`
- Description: Automatically build LaTeX documents

### `latex.preview.viewer`
- Type: `string`
- Default: `"tab"`
- Options: `"tab"`, `"external"`
- Description: LaTeX preview viewer type

## Commands

- `latex.build`: Build the current LaTeX document
- `latex.preview`: Preview the compiled PDF
- `latex.clean`: Clean LaTeX auxiliary files
- `latex.sync`: SyncTeX: Sync from source to PDF

## Architecture

The extension is structured as follows:

- **Extension Entry Points**:
  - `extension.ts`: Node.js/Electron entry point
  - `extension.browser.ts`: Browser/Web entry point

- **Core Services**:
  - `latexService.ts`: Main service orchestrating compilation and preview
  - `wasmCompiler.ts`: WebAssembly-based LaTeX compiler
  - `serverCompiler.ts`: Server-side LaTeX compiler (uses LaTeX Workshop extension or system tools)
  - `previewManager.ts`: Manages PDF preview in webview panels

- **Commands**:
  - `buildCommand.ts`: Build command handler
  - `previewCommand.ts`: Preview command handler
  - `cleanCommand.ts`: Clean command handler
  - `syncCommand.ts`: SyncTeX command handler

## WebAssembly Compiler

The WebAssembly compiler is designed to work in browser environments. It uses a WASM-based LaTeX compiler (e.g., SwiftLaTeX) to compile LaTeX documents without requiring server-side tools.

**Status**: The WASM compiler integration is a placeholder and needs to be implemented with an actual WASM LaTeX compiler.

## Server-side Compiler

The server-side compiler uses system LaTeX tools directly:
- **System Tools**: Direct invocation of LaTeX tools (pdflatex, xelatex, lualatex, latexmk) - only available in Electron/Node.js environments
- Supports all recipes: `pdflatex`, `xelatex`, `lualatex`, `latexmk` (with bibtex support)
- Executes recipe steps sequentially (e.g., pdflatex → bibtex → pdflatex → pdflatex for latexmk)

## Development

### Building

```bash
cd vscode/extensions/latex-language-features
npm install
npm run compile
```

### Web Build

```bash
npm run compile-web
```

## References

- Based on [LaTeX Workshop](https://github.com/James-Yu/LaTeX-Workshop) extension
- Inspired by [VS Code LaTeX Preview](https://github.com/microsoft/vscode/compare/main...avizcaino:vscode:latex-preview)

