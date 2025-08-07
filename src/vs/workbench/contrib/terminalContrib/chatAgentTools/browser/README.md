# Command Re-routing System

This system provides a robust mechanism for re-routing terminal commands to more appropriate tools in VS Code's chat interface.

## Overview

Instead of executing certain commands in the terminal, the system can detect commands that would be better handled by dedicated tools and recommend those tools instead. This provides a more integrated experience and better error handling.

## Architecture

### CommandRoutingRegistry

The core of the system is the `CommandRoutingRegistry` which manages command routes:

```typescript
interface ICommandRoute {
    commands: RegExp[];              // Patterns that match commands
    toolId: string;                  // Tool to route to
    extractParameters: (commandLine: string, match: RegExpMatchArray) => any;
    priority?: number;               // Higher priority routes are checked first
}
```

### Built-in Routes

The system comes with several built-in routes:

- `cat <file>` → `ReadFileTool`
- `type <file>` → `ReadFileTool` (Windows)
- `mkdir <dir>` → `CreateDirectoryTool`
- `md <dir>` → `CreateDirectoryTool` (Windows)

### Integration Flow

1. User types a command like `cat file.txt`
2. `RunInTerminalTool.prepareToolInvocation()` calls `getRecommendedToolsOverRunInTerminal()`
3. This function checks the new command routing system first
4. If a route is found, it returns a recommendation message
5. The terminal command is not executed; instead the recommendation is shown
6. The user can then use the suggested tool or run the terminal command again

## Adding New Routes

To add a new command route:

```typescript
CommandRoutingRegistry.registerRoute({
    commands: [/^ls\s+(.*)$/],
    toolId: 'vscode_listFiles_internal',
    extractParameters: (commandLine: string, match: RegExpMatchArray) => {
        const path = match[1].trim() || '.';
        return { path };
    },
    priority: 100
});
```

## Tools

### ReadFileTool

Handles file reading operations that would normally use `cat` or `type`:

- Reads file contents through the IFileService
- Provides formatted output with syntax highlighting
- Handles errors gracefully

### CreateDirectoryTool

Handles directory creation operations that would normally use `mkdir` or `md`:

- Creates directories through the IFileService
- Provides confirmation messages
- Handles errors gracefully

## Backwards Compatibility

The system maintains full backwards compatibility:

- The existing tag-based python/jupyter routing still works
- If no route is found, commands fall back to normal terminal execution
- Users can still execute terminal commands after seeing recommendations

## Testing

The system includes comprehensive test coverage:

- Unit tests for CommandRoutingRegistry
- Unit tests for individual tools
- Integration tests for the complete workflow
- Tests for backwards compatibility

## Configuration

The system is enabled by default and integrates seamlessly with existing VS Code chat functionality. No additional configuration is required.