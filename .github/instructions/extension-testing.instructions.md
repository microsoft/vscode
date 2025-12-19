---
description: Guidelines for writing and running extension tests in VS Code
applyTo: extensions/**
---

# Extension Testing Guidelines

## Test Location and Structure

Extension tests live within each extension's `src/test/` directory. Follow patterns from `extensions/vscode-api-tests/` as the canonical example.

## Running Extension Tests

```bash
# Run specific extension tests
npm run test-extension -- -l <extension-name>

# Run all API tests (integration)
./scripts/test-integration.sh

# Run with debugging
./scripts/test-integration.sh  # then attach debugger
```

## Writing Tests

### Basic Test Structure
```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Feature Name', () => {
    suiteSetup(async () => {
        // One-time setup before all tests
    });

    suiteTeardown(async () => {
        // Cleanup after all tests
    });

    test('should perform expected behavior', async () => {
        // Arrange
        const doc = await vscode.workspace.openTextDocument({
            content: 'test',
            language: 'plaintext'
        });

        // Act
        const editor = await vscode.window.showTextDocument(doc);

        // Assert
        assert.strictEqual(editor.document.getText(), 'test');
    });
});
```

### Common Testing Patterns

#### Working with Documents
```typescript
// Create a new document
const doc = await vscode.workspace.openTextDocument({ content: '', language: 'typescript' });
const editor = await vscode.window.showTextDocument(doc);

// Edit document
await editor.edit(builder => {
    builder.insert(new vscode.Position(0, 0), 'new content');
});
```

#### Testing Commands
```typescript
await vscode.commands.executeCommand('myExtension.myCommand');
```

#### Testing with Workspace Files
Use `testWorkspace/` directory within your extension for test fixtures.

#### Async/Await and Timeouts
```typescript
// Wait for something with timeout
async function waitFor<T>(fn: () => T | undefined, timeout = 5000): Promise<T> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const result = fn();
        if (result !== undefined) return result;
        await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('Timeout waiting for condition');
}
```

## Test Configuration

### package.json Setup
```json
{
    "scripts": {
        "test": "node ./out/test/runTest.js"
    },
    "devDependencies": {
        "@types/mocha": "^10.0.10",
        "@vscode/test-electron": "^2.3.0"
    }
}
```

## Debugging Tests

1. Use launch configurations in `.vscode/launch.json`
2. Set `"extensionTestsPath"` to your test output directory
3. Breakpoints work in TypeScript source when source maps are enabled

## Best Practices

1. **Isolate tests**: Each test should be independent
2. **Clean up**: Close editors and delete temporary files in `teardown`
3. **Use `strictEqual`**: Prefer `assert.strictEqual` over `assert.equal`
4. **Async handling**: Always `await` async operations
5. **Timeout handling**: Increase timeouts for slow operations
6. **Avoid flakiness**: Don't depend on timing; use explicit waits

## Common Pitfalls

- **Not waiting for activation**: Extensions may need time to activate
- **File system state**: Tests may fail if previous test left files open
- **Parallel execution**: Tests run sequentially; don't assume parallel
- **Platform differences**: Test on multiple platforms when possible
