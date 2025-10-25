# TODO Detection Service

## Overview

The TODO Detection Service is a core VS Code service that detects TODO comments in code files across all programming languages. It provides language-aware comment detection and serves as the foundation for the "Delegate to Agent" feature.

## Features

- **Multi-language Support**: Automatically detects TODO comments in any programming language using VS Code's language configuration service
- **Configurable Triggers**: Supports customizable trigger keywords (default: TODO, FIXME, BUG, HACK, NOTE, ISSUE)
- **Case Sensitivity**: Optional case-sensitive or case-insensitive matching
- **Comment Type Support**: Detects TODOs in both line comments (`//`, `#`) and block comments (`/* */`)

## Usage

### Service Interface

```typescript
interface ITodoDetectionService {
  /**
   * Detect TODO comment at a specific line
   */
  detectTodoAtLine(model: ITextModel, lineNumber: number): ITodoItem | undefined;

  /**
   * Detect all TODO comments in a file
   */
  detectAllTodos(model: ITextModel): ITodoItem[];

  /**
   * Check if a line contains a TODO comment
   */
  hasTodoAtLine(model: ITextModel, lineNumber: number): boolean;
}
```

### Example

```typescript
// Inject the service
constructor(
  @ITodoDetectionService private readonly todoDetectionService: ITodoDetectionService
) {}

// Use the service
const todo = this.todoDetectionService.detectTodoAtLine(model, 5);
if (todo) {
  console.log(`Found ${todo.trigger}: ${todo.text}`);
}
```

## Configuration

Users can configure TODO detection through VS Code settings:

```json
{
  "chat.delegation.enabled": true,
  "chat.delegation.triggers": ["TODO", "FIXME", "BUG", "HACK", "NOTE", "ISSUE"],
  "chat.delegation.showCodeLens": true,
  "chat.delegation.caseSensitive": false
}
```

## Architecture

### Service Registration

The TODO Detection Service is registered as a singleton in the workbench:

```typescript
registerSingleton(ITodoDetectionService, TodoDetectionService, InstantiationType.Delayed);
```

### Dependencies

- `IConfigurationService` - For reading user settings
- `ILanguageConfigurationService` - For language-aware comment detection

## Integration Points

### Code Actions

The `TodoCodeActionProvider` uses this service to show "Delegate to Agent" quick fixes on TODO comments.

### CodeLens

The `TodoCodeLensProvider` uses this service to display inline "Delegate to Agent" links above TODO comments.

### Chat Integration

The service powers the "Delegate to Agent" feature, allowing users to delegate TODO comments to any available chat agent (Copilot, Claude, etc.).

## Testing

Comprehensive unit tests are available in:
- `src/vs/workbench/services/todoDetection/test/browser/todoDetectionService.test.ts`

Run tests with:
```bash
npm run test -- --grep "TodoDetectionService"
```

## Future Enhancements

- Support for custom regex patterns
- Multi-line TODO comment detection
- TODO priority parsing
- Integration with task management systems
