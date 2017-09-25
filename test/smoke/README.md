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

- Beware of **state**. The tests within a single suite will share the same state.

- Beware of **singletons**. This evil can, and will, manifest itself under the form of FS paths, TCP ports, IPC handles. Whenever writing a test, or setting up more smoke test architecture, make sure it can run simultaneously with any other tests and even itself.	All test suites should be able to run many times in parallel.

- Beware of **focus**. **Never** depend on DOM elements having focus using `.focused` classes or `:focus` pseudo-classes, since they will lose that state as soon as another window appears on top of the running VS Code window. A safe approach which avoids this problem is to use the `waitForActiveElement` API. Many tests use this whenever they need to wait for a specific element to _have focus_.

- Beware of **timing**. You need to read from or write to the DOM... yeah I know. But is it the right time to do that? Can you 100% promise that that `input` box will be visible and in the DOM at this point in time? Or are you just hoping that it will be so? Every time you want to interact with the DOM, be absolutely sure that you can. Eg. just because you triggered Quick Open, it doesn't mean that it's open; you must wait for the widget to be in the DOM and for its input field to be the active element.

- Beware of **waiting**. **Never** wait longer than a couple of seconds for anything, unless it's justified. Think of it as a human using Code. Would a human take 10 minutes to run through the Search viewlet smoke test? Then, the computer should even be faster. **Don't** use `setTimeout` just because. Think about what you should wait for in the DOM to be ready, then wait for that instead.