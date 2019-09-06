# VS Code Smoke Test

Make sure you are on **Node v10.x**.

### Run

```bash
# Compile
cd test/smoke
yarn compile
cd ../..

# Dev
yarn smoketest

# Build
yarn smoketest --build PATH_TO_NEW_BUILD_PARENT_FOLDER --stable-build PATH_TO_LAST_STABLE_BUILD_PARENT_FOLDER

# Remote
yarn smoketest --build PATH_TO_NEW_BUILD_PARENT_FOLDER --remote
```

### Run for a release

You must always run the smoketest version which matches the release you are testing. So, if you want to run the smoketest for a release build (e.g. `release/1.22`), you need that version of the smoke tests too:

```bash
git checkout release/1.22
yarn
```

In addition to the new build to be released you will need the previous stable build so that the smoketest can test the data migration.
The recommended way to make these builds available for the smoketest is by downloading their archive version (\*.zip) and extracting
them into two folders. Pass the folder paths to the smoketest as follows:

```bash
yarn smoketest --build PATH_TO_NEW_RELEASE_PARENT_FOLDER --stable-build PATH_TO_LAST_STABLE_RELEASE_PARENT_FOLDER
```

### Debug

- `--verbose` logs all the low level driver calls made to Code;
- `-f PATTERN` filters the tests to be run. You can also use pretty much any mocha argument;
- `--screenshots SCREENSHOT_DIR` captures screenshots when tests fail.

### Develop

Start a watch task in `test/smoke`:

```bash
cd test/smoke
yarn watch
```

## Pitfalls

- Beware of workbench **state**. The tests within a single suite will share the same state.

- Beware of **singletons**. This evil can, and will, manifest itself under the form of FS paths, TCP ports, IPC handles. Whenever writing a test, or setting up more smoke test architecture, make sure it can run simultaneously with any other tests and even itself.	All test suites should be able to run many times in parallel.

- Beware of **focus**. **Never** depend on DOM elements having focus using `.focused` classes or `:focus` pseudo-classes, since they will lose that state as soon as another window appears on top of the running VS Code window. A safe approach which avoids this problem is to use the `waitForActiveElement` API. Many tests use this whenever they need to wait for a specific element to _have focus_.

- Beware of **timing**. You need to read from or write to the DOM... but is it the right time to do that? Can you 100% guarantee that that `input` box will be visible at that point in time? Or are you just hoping that it will be so? Hope is your worst enemy in UI tests. Example: just because you triggered Quick Open with `F1`, it doesn't mean that it's open and you can just start typing; you must first wait for the input element to be in the DOM as well as be the current active element.

- Beware of **waiting**. **Never** wait longer than a couple of seconds for anything, unless it's justified. Think of it as a human using Code. Would a human take 10 minutes to run through the Search viewlet smoke test? Then, the computer should even be faster. **Don't** use `setTimeout` just because. Think about what you should wait for in the DOM to be ready and wait for that instead.
