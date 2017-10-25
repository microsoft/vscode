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

## Common Issues

### Certain keys don't appear in input boxes (eg: <kbd>Space</kbd>)

This is a **waiting** issue. Everytime you send keys to Code, you must be aware that the keybinding service can handle them. Even if you're sure that input box is focused.

Here's an example: when opening quick open, focus goes from its list to its input. We used to simply wait for the input to have focus and then send some text to be typed, like `Workbench: Show Editor`; yet, only `Workbench:ShowEditor` would be rendered in the input box. This happened due to the fact that the [`ListService` takes 50ms to unset the context key which indicates a list is focused](https://github.com/Microsoft/vscode/blob/c8dee4c016d3a3d475011106e04d8e394d9f138c/src/vs/platform/list/browser/listService.ts#L59). The fix was to [wait 50ms as well on the smoke test](https://github.com/Microsoft/vscode/blob/b82fa8dcb06bbf9c85c1502d0d43322e2e9d1a59/test/smoke/src/areas/quickopen/quickopen.ts#L65).

### I type in a Monaco editor instance, but the text doesn't appear to be there

This is a **waiting** issue. When you type in a Monaco editor instance, you're really typing in a `textarea`. The `textarea` is then polled for its contents, then the editor model gets updated and finally the editor view gets updated. It's a good idea to always wait for the text to appear rendered in the editor after you type in it.

### I type in a Monaco editor instance, but the text appears scrambled

This is an issue which is **not yet fixed**. Unfortunately this seems to happen whenever the CPU load of the system is high. Rerunning the test will often result in a successful outcome.