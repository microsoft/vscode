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

### Disposal During Async Work

Code that continues after an `await` as if its object were still alive is a recurring source of leaks. A disposable that is added to a disposed store is never disposed, and the leak, or the warning it logs, often fails a later test instead of the one that caused it.

- After an `await`, register with `this._registerOrDispose(x)` when nothing else follows. Otherwise re-check disposal before registering anything or causing other side effects, and dispose what was created, for example `if (this._store.isDisposed) { result.dispose(); return; }`.
- When you add or change async initialization or disposal, test it with `interruptAtEveryStep` from `src/vs/base/test/common/interruptAtEveryStep.ts`. It reruns the operation and disposes or cancels it after each step, and reports the step after which something leaked or an unexpected error occurred. Pass `step: 'macrotask'` when the operation waits on timers or I/O.
- When you fix such a bug, look for the same shape nearby, such as other awaits in the same method or class. The lint rule `local/code-no-register-after-await` reports registrations after an `await` that skip the check. Files that already did this are listed in `.eslint-allowed-register-after-await-files`; remove the file from that list to see its reports.

```typescript
test('init does not leak when disposed at any step', () => interruptAtEveryStep(store => {
  const storage = store.add(new InMemoryStorageMain(logService, fileService));
  return { promise: storage.init(), interrupt: () => storage.dispose() };
}));
```

### Best Practices

- Minimize assertions per test — prefer one `assert.deepStrictEqual` snapshot over many fine-grained assertions
- Don't add tests to the wrong suite — find the relevant `suite` block
- Follow existing patterns (`describe`/`test` or `suite`/`test`) consistently within a file
- Don't stub globals (e.g., `(mainWindow as any).X = ...`) — make dependencies injectable instead
- Before restarting or disposing a fixture, await background work whose completion the test asserts; an awaited mutation may only schedule discovery or publication. Prefer a passive completion signal when reading the result could itself initiate the work being tested.

### Snapshot Testing

Use `assertSnapshot` for Jest-like snapshot tests. Snapshots are written to a `__snapshots__` directory beside the test file on first run — verify the output is correct, then subsequent runs compare against it.
