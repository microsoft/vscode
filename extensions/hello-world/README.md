# Hello World Extension

A simple "Hello World" extension for Visual Studio Code that demonstrates the basic structure and functionality of a VS Code extension.

## Features

This extension provides a single command that displays a "Hello World" message.

## Commands

- `Hello World` - Shows an information message with "Hello World from VS Code!"

## Usage

1. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Type "Hello World" and select the command
3. A message will appear showing "Hello World from VS Code!"

## Extension Structure

- `package.json` - Extension manifest with metadata and contributions
- `src/extension.ts` - Main extension code with activate/deactivate functions
- `tsconfig.json` - TypeScript configuration
- `out/` - Compiled JavaScript output

## Development

This extension is built using TypeScript and follows VS Code extension development best practices:

- Uses the VS Code Extension API
- Registers commands through the `contributes.commands` section
- Activates on command execution via `activationEvents`
- Properly manages subscriptions for cleanup

## Build

The extension is compiled using TypeScript:

```bash
npx tsc
```

The compiled output is placed in the `out/` directory.