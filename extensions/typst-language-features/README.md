# Typst Language Features

Provides rich language support for [Typst](https://typst.app/) documents in VS Code.

## Features

- **Syntax Highlighting**: Full TextMate grammar for Typst syntax
- **IntelliSense**: Completions for keywords, functions, and symbols
- **Hover Information**: Documentation on hover for Typst elements
- **Document Outline**: Navigate your document structure in the outline view
- **Formatting**: Format your Typst documents (when WASM compiler is available)
- **Diagnostics**: Real-time error checking (when WASM compiler is available)

## Architecture

This extension is designed with an **offline-first** approach using WebAssembly (WASM):

- Works in both VS Code (Electron) and VS Code for Web
- Compiles Typst documents locally in the browser using WASM
- No external server required for basic functionality

## Commands

- `Typst: Preview Typst Document` - Open a live preview of the current document
- `Typst: Export to PDF` - Compile the current document to PDF

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `typst.compilation.mode` | `auto` | Compilation mode (auto, wasm) |
| `typst.preview.enabled` | `true` | Enable preview functionality |
| `typst.preview.refresh` | `onType` | When to refresh preview |
| `typst.formatting.enabled` | `true` | Enable document formatting |
| `typst.formatting.printWidth` | `120` | Maximum line width for formatting |
| `typst.validation.enabled` | `true` | Enable validation and diagnostics |
| `typst.hover.preview.enabled` | `true` | Enable hover preview |

## WASM Integration

The extension uses the [tinymist](https://github.com/Myriad-Dreamin/tinymist) library compiled to WebAssembly for:

- Syntax analysis
- Error detection
- Code completion
- Document formatting
- PDF generation

This allows full offline functionality without requiring any server or external tools.

## Development

### Building

```bash
# Compile for Node.js/Electron
npm run compile

# Compile for web/browser
npm run compile-web
```

### Watching

```bash
# Watch for Node.js/Electron
npm run watch

# Watch for web/browser
npm run watch-web
```

## Credits

- Based on [tinymist](https://github.com/Myriad-Dreamin/tinymist) language server
- Inspired by the original Typst VS Code extension
