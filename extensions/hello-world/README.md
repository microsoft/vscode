# Hello World Extension

A simple VS Code extension that demonstrates basic extension functionality and serves as a template for VS Code extension development within the VS Code repository.

## Features

- **Hello World Command**: Shows a simple "Hello World" message
- **Workspace Info Command**: Displays information about the current workspace
- **Keyboard Shortcut**: Use `Ctrl+Shift+H` (or `Cmd+Shift+H` on Mac) to trigger Hello World

## Commands

This extension contributes the following commands:

- `Hello: Hello World` - Shows a hello world message (also available via `Ctrl+Shift+H`/`Cmd+Shift+H`)
- `Hello: Show Workspace Info` - Shows workspace information

## Usage

### Via Command Palette
1. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Type "Hello" to see the available commands
3. Select either "Hello World" or "Show Workspace Info"

### Via Keyboard Shortcut
- Press `Ctrl+Shift+H` (or `Cmd+Shift+H` on Mac) to show the Hello World message

## Development

### Building the Extension

The extension can be built using the provided build scripts:

```bash
# On Unix/Linux/macOS
./build.sh

# On Windows
build.bat
```

### Testing in VS Code

1. Open VS Code in the repository root
2. Go to the Debug view (`Ctrl+Shift+D` / `Cmd+Shift+D`)
3. Select "Launch Hello World Extension" from the dropdown
4. Press `F5` to start debugging
5. In the Extension Development Host window, use the commands

### Extension Structure

```
hello-world/
├── src/
│   ├── extension.ts          # Main extension code
│   └── test/
│       └── extension.test.ts # Basic tests
├── out/                      # Compiled JavaScript output
├── media/                    # Extension assets
├── package.json              # Extension manifest
├── tsconfig.json            # TypeScript configuration
├── extension.webpack.config.js  # Webpack configuration
├── build.sh/.bat            # Build scripts
├── validate.js              # Validation script
├── README.md                # This file
├── CHANGELOG.md             # Change log
└── .vscodeignore           # Files to exclude from packaging
```

### Key Extension Concepts Demonstrated

- **Extension lifecycle**: Proper `activate()` and `deactivate()` functions
- **Command registration**: Using `vscode.commands.registerCommand()`
- **User interaction**: Showing messages with `vscode.window.showInformationMessage()`
- **Workspace access**: Reading workspace information via `vscode.workspace`
- **Keyboard shortcuts**: Contributing keybindings via `package.json`
- **TypeScript compilation**: Building extensions with TypeScript
- **Testing**: Basic extension test structure

## License

MIT