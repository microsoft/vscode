---
description: VS Code test writing guidelines — unit tests, integration tests, snapshot tests, and clean teardown patterns. Reference when writing or updating tests.
applyTo: "{src/vs/**/test/**,src/vs/**/*.test.ts,src/vs/**/*.integrationTest.ts}"
---

# Writing Tests

Canonical reference: https://github.com/microsoft/vscode/wiki/Writing-Tests

## Test Types

| Type | File suffix | Location | Runs in |
|------|-------------|----------|---------|
| Unit tests | `.test.ts` | `src/vs/**/test/` | Browser, Electron, or Node.js (depends on layer) |
| Integration tests | `.integrationTest.ts` | `src/vs/**/test/` | Real external APIs |
| Extension tests | Standard extension test system | `extensions/*/` | Extension host |

## Running Tests

- **Unit tests:** `scripts/test.sh` (macOS/Linux) or `scripts/test.bat` (Windows)
  - Filter: `--grep <pattern>`
  - Glob: `--runGlob **/myFile.test.js`
- **Integration tests:** `scripts/test-integration.sh` or `scripts/test-integration.bat`
- **VS Code UI:** Use the [Selfhost Test Provider](https://marketplace.visualstudio.com/items?itemName=ms-vscode.vscode-selfhost-test-provider)

## Writing Unit Tests

Tests use Mocha's BDD interface (`suite`/`test`) with the `assert` module and `sinon` for mocks.

### Clean Teardown

Always use `ensureNoDisposablesAreLeakedInTestSuite()` to catch disposal leaks:

```typescript
suite('myTests', () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test('example', () => {
    const disposable = store.add(new MyDisposable());
    // ...
  });
});
```

Always call `sinon.restore()` in `teardown` to avoid leaking mocks.

### Best Practices

- Minimize assertions per test — prefer one `assert.deepStrictEqual` snapshot over many fine-grained assertions
- Don't add tests to the wrong suite — find the relevant `suite` block
- Follow existing patterns (`describe`/`test` or `suite`/`test`) consistently within a file
- Don't stub globals (e.g., `(mainWindow as any).X = ...`) — make dependencies injectable instead

### Snapshot Testing

Use `assertSnapshot` for Jest-like snapshot tests. Snapshots are written to a `__snapshots__` directory beside the test file on first run — verify the output is correct, then subsequent runs compare against it.
