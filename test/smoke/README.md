# VS Code Smoke Test

## How to run

```
# Dev
npm run smoketest

# Specific build
npm run smoketest -- --build "path/to/code"

# Data Migration tests
npm run smoketest -- --build "path/to/code-insiders" --stable "path/to/code"
```

The script calls mocha, so all mocha arguments should work fine. For example, use `-f Git` to only run the `Git` tests.

By default, screenshots are not captured. To run tests with screenshots use the argument `--screenshots`.

## Pitfalls

- Beware of **state**. Invariably, your test suite will leave the workspace in a different state than the one it started
  with. Try to avoid these situations and strive to leave the workspace in the same state as before the test suite ran.

- Beware of **singletons**. This evil can manifest itself under the form of FS paths, TCP ports, IPC handles.
  Whenever writing a test, make sure it can run simultaneously with any other tests and even itself.
	All test suites should be able to run many times in parallel.

- Beware of **focus**. Never depend on DOM elements having focus using `.focused` classes or `:focus` pseudo-classes, since they will lose that state as soon as another window appears on top of the running VS Code window.
  A safe approach which avoids this problem is to use the `waitForActiveElement` API. Many tests use this whenever they need to wait for a specific element to _have focus_.