# Logos Testing Guide

This document describes the testing strategy, test types, and how to run tests for the Logos IDE.

## Overview

Logos uses a comprehensive testing approach with multiple levels:

- **Unit Tests** - Test individual functions and classes
- **Integration Tests** - Test component interactions
- **End-to-End Tests** - Test complete user workflows
- **Visual Regression Tests** - Ensure UI consistency

## Test Framework

All tests use [Vitest](https://vitest.dev/) as the test runner:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Test Organization

```
src/
├── chat/
│   ├── planning/
│   │   └── __tests__/
│   │       └── planning.e2e.test.ts
│   ├── modes/
│   │   └── __tests__/
│   │       └── modeSwitch.e2e.test.ts
│   ├── tools/
│   │   └── __tests__/
│   │       ├── terminalTools.test.ts
│   │       ├── gitTools.test.ts
│   │       └── fileTools.test.ts
│   └── telemetry/
│       └── __tests__/
│           └── telemetry.test.ts
└── vs/
    └── platform/
        └── **/*.test.ts
```

## Unit Tests

### Tool Tests

Each tool category has dedicated unit tests that mock VS Code APIs:

#### Terminal Tools (`terminalTools.test.ts`)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RunInTerminalTool, GetTerminalOutputTool } from '../terminal/terminalTools';

// Mock VS Code
vi.mock('vscode', () => ({
  window: {
    terminals: [],
    createTerminal: vi.fn(() => ({
      name: 'Test Terminal',
      sendText: vi.fn(),
    })),
  },
}));

describe('RunInTerminalTool', () => {
  it('should execute command in terminal', async () => {
    const tool = new RunInTerminalTool();
    const result = await tool.execute(
      { command: 'echo hello' },
      { mode: 'agent', sessionId: 'test', workspacePath: '/test' }
    );
    expect(result.success).toBe(true);
  });
});
```

#### Git Tools (`gitTools.test.ts`)

Tests for SCM operations:

- `GitStatusTool` - Get repository status
- `GitDiffTool` - Get file diffs
- `GitStageTool` - Stage files
- `GitCommitTool` - Create commits
- `GitBranchTool` - Branch operations
- `GitPushTool` - Push changes
- `GitPullTool` - Pull changes
- `GitLogTool` - View commit history

#### File Tools (`fileTools.test.ts`)

Tests for file system operations:

- `ReadFileTool` - Read file contents
- `WriteFileTool` - Write files
- `CreateFileTool` - Create new files
- `DeleteFileTool` - Delete files
- `ListDirectoryTool` - List directory contents
- `GrepTool` - Search file contents
- `FindFilesTool` - Find files by pattern

### Running Unit Tests

```bash
# Run all tool tests
npm test -- --filter="tools"

# Run specific test file
npm test -- src/chat/tools/__tests__/terminalTools.test.ts

# Run with verbose output
npm test -- --reporter=verbose
```

## End-to-End Tests

### Planning Workflow (`planning.e2e.test.ts`)

Tests the complete planning system workflow:

1. **Plan Creation**
   - Create plan with basic options
   - Create plan with items
   - Create plan from agent response
   - Link plan to session

2. **Plan Item Status Updates**
   - Update item to in_progress
   - Update item to completed
   - Mark plan complete when all items done
   - Emit events on status changes

3. **Plan Progress Tracking**
   - Calculate progress correctly
   - Handle empty plans

4. **Plan Serialization**
   - Serialize to markdown with YAML frontmatter
   - Parse from markdown
   - Handle invalid markdown

5. **Plan CRUD Operations**
   - Retrieve all plans
   - Update plan properties
   - Add items to existing plan
   - Delete plan
   - Handle non-existent plans

### Mode Switching (`modeSwitch.e2e.test.ts`)

Tests the mode system workflow:

1. **Default Configuration**
   - Initialize with Agent mode
   - All six default modes registered
   - Correct mode configurations

2. **Mode Switching**
   - Switch modes successfully
   - Track auto-switched modes
   - Skip switch when already in mode
   - Emit modeChange event
   - Reset active plan on switch

3. **Tool Permissions**
   - Allow all tools in Agent mode
   - Only read-only tools in Plan mode
   - Custom allowed tools in Debug mode
   - Custom allowed tools in Research mode

4. **Custom Mode Registration**
   - Register custom mode
   - Update existing mode configuration

5. **Auto Mode Detection**
   - Detect debug mode from error queries
   - Detect plan mode from planning queries
   - Detect research mode from research queries
   - Detect code-review mode from review queries
   - Detect ask mode from question queries

### Running E2E Tests

```bash
# Run all E2E tests
npm test -- --filter="e2e"

# Run planning E2E tests
npm test -- planning.e2e.test.ts

# Run mode switching E2E tests
npm test -- modeSwitch.e2e.test.ts
```

## Test Coverage

Generate coverage reports:

```bash
npm run test:coverage
```

Coverage thresholds are configured in `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'test/',
        '**/*.d.ts',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
  },
});
```

## Mocking Strategies

### VS Code API Mocking

Mock the entire `vscode` module:

```typescript
vi.mock('vscode', () => ({
  window: {
    terminals: [],
    activeTerminal: null,
    createTerminal: vi.fn(),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/test' } }],
    fs: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
    },
  },
  Uri: {
    file: vi.fn((path) => ({ fsPath: path })),
  },
  debug: {
    activeDebugSession: null,
    breakpoints: [],
    startDebugging: vi.fn(),
    stopDebugging: vi.fn(),
  },
  languages: {
    getDiagnostics: vi.fn(() => []),
  },
}));
```

### EventEmitter Mocking

For Node.js EventEmitter:

```typescript
vi.mock('events', () => ({
  EventEmitter: class {
    private listeners: Map<string, Function[]> = new Map();

    on(event: string, listener: Function) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      this.listeners.get(event)!.push(listener);
      return this;
    }

    emit(event: string, ...args: any[]) {
      const handlers = this.listeners.get(event);
      if (handlers) {
        handlers.forEach((h) => h(...args));
      }
      return true;
    }
  },
}));
```

### Singleton Reset

Reset singletons between tests:

```typescript
const resetSingletons = () => {
  // @ts-ignore - accessing private static for testing
  PlanningService['instance'] = undefined;
  ModeRegistry['instance'] = undefined;
  AriaToolRegistry['instance'] = undefined;
};

beforeEach(() => {
  resetSingletons();
});

afterEach(() => {
  resetSingletons();
});
```

## Writing New Tests

### Test File Naming

- Unit tests: `*.test.ts`
- E2E tests: `*.e2e.test.ts`
- Integration tests: `*.integration.test.ts`

### Test Structure

Follow the AAA pattern (Arrange, Act, Assert):

```typescript
describe('FeatureName', () => {
  describe('methodName', () => {
    it('should do specific thing when condition', () => {
      // Arrange
      const service = new MyService();
      const input = { key: 'value' };

      // Act
      const result = service.method(input);

      // Assert
      expect(result).toBe(expectedValue);
    });
  });
});
```

### Test Data Factories

Create factories for test data:

```typescript
function createTestPlan(overrides?: Partial<Plan>): Plan {
  return {
    id: 'test-plan-123',
    name: 'Test Plan',
    overview: 'Test overview',
    items: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isComplete: false,
    createdByMode: 'plan',
    ...overrides,
  };
}
```

## Continuous Integration

Tests run automatically on:

- Pull request creation
- Push to main branch
- Nightly scheduled runs

### GitHub Actions Configuration

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

## Debugging Tests

### VS Code Debug Configuration

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Tests",
  "program": "${workspaceFolder}/node_modules/vitest/vitest.mjs",
  "args": ["run", "--reporter=verbose"],
  "console": "integratedTerminal",
  "cwd": "${workspaceFolder}"
}
```

### Debug Single Test

```bash
# Run single test with inspector
node --inspect-brk node_modules/vitest/vitest.mjs run -t "test name"
```

## Best Practices

1. **Isolate tests** - Each test should be independent
2. **Mock external dependencies** - Don't rely on network or file system
3. **Use descriptive names** - Test names should describe behavior
4. **Test edge cases** - Include error conditions and boundaries
5. **Keep tests fast** - Mock slow operations
6. **Avoid test interdependence** - Reset state between tests
7. **Test public API** - Focus on observable behavior
8. **Use test data factories** - Create reusable test data
