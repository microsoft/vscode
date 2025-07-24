# Hello World Extension

A simple "Hello World" extension for Visual Studio Code that demonstrates basic extension structure and functionality.

## Features

This extension provides a single command that displays a "Hello World" message.

## Usage

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type "Hello World" and select the command
3. A message will appear saying "Hello World from VS Code!"

## Extension Structure

This extension demonstrates the basic structure of a VS Code extension:

- `package.json` - Extension manifest with metadata and contribution points
- `src/extension.ts` - Main extension code with activate/deactivate functions
- `tsconfig.json` - TypeScript configuration
- `out/` - Compiled JavaScript output (generated)

## Commands

- `helloWorld.sayHello` - Shows "Hello World" message

## Development

This extension is part of the VS Code repository and uses the VS Code API to demonstrate:

- Extension activation
- Command registration
- Information message display
- Proper cleanup on deactivation

## License

MIT - Same as VS Code