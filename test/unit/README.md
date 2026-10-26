# Unit Tests

## Run (inside Electron)

    ./scripts/test.[sh|bat]

All unit tests are run inside a Electron renderer environment which access to DOM and Nodejs api. This is the closest to the environment in which VS Code itself ships. Notes:

- use the `--dev` to see an electron window with dev tools which allows for debugging
- to run only a subset of tests use the `--run` or `--glob` options
- use `--rerun-failed-files <count>` to rerun failures, each time in a fresh window, up to `<count>` more times. Every rerun runs only the tests that did not pass yet, and the suite of a failed hook, by full title. A failure only counts as passed when the rerun ran and passed it, so a test whose title changes from run to run, or that depends on other tests of its file, still fails the run. With more than 50 failures, or a `--grep` of the form `/pattern/flags`, a rerun runs their whole test files instead. The run passes when every failure passes in a later attempt, and those failures are reported as flaky tests. Pull request CI uses `--rerun-failed-files 2`. Failures are not rerun when a failure does not belong to a test file, and a rerun with such a failure does not count
- use `npm run watch` to automatically compile changes

For instance, `./scripts/test.sh --debug --glob **/extHost*.test.js` runs all tests from `extHost`-files and enables you to debug them.

## Run (inside browser)

    npm run test-browser -- --browser webkit --browser chromium

Unit tests from layers `common` and `browser` are run inside `chromium`, `webkit`, and (soon'ish) `firefox` (using playwright). This complements our electron-based unit test runner and adds more coverage of supported platforms. Notes:

- these tests are part of the continuous build, that means you might have test failures that only happen with webkit on _windows_ or _chromium_ on linux
- you can run these tests locally via `npm run test-browser -- --browser chromium --browser webkit`
- to debug, open `<vscode>/test/unit/browser/renderer.html` inside a browser and use the `?m=<amd_module>`-query to specify what AMD module to load, e.g `file:///Users/jrieken/Code/vscode/test/unit/browser/renderer.html?m=vs/base/test/common/strings.test` runs all tests from `strings.test.ts`
- to run only a subset of tests use the `--run` or `--glob` options
- test module import failures abort the run with a nonzero exit code, even when `--grep` would exclude the module's tests
- if no test progress is reported for 5 minutes (e.g. the page is frozen), the run aborts and prints the in-flight test, whether the page still responds, and the browser processes' CPU usage; on macOS it also writes native stack samples to `.build/logs/browser-unit-stall`. Use `--stall-timeout <seconds>` to change the limit or `--stall-timeout 0` to disable it (it is always disabled with `--debug`)
- use `--rerun-failed-files <count>` to rerun failures up to `<count>` more times, each time in a freshly launched browser, as with the Electron runner: only the failed tests (the suite of a failed hook), or their whole test files when there are too many failures. Each browser reruns its own failures. A failure only counts as passed when its test (or a test of its hook's suite) actually passes with the same suite ancestry in the same test file; skipped or renamed tests and ambiguous duplicate test or suite paths do not count. Failures that passed on a rerun are reported as flaky tests. Pull request CI uses `--rerun-failed-files 2`. Reruns are disabled with `--debug`

**Note**: you can enable verbose logging of playwright library by setting a `DEBUG` environment variable before running the tests (https://playwright.dev/docs/debug#verbose-api-logs)

## Run (with node)

    npm run test-node -- --run src/vs/editor/test/browser/controller/cursor.test.ts

The default test timeout is 5 seconds locally and 30 seconds in CI, matching the Electron runner. CI is detected through `BUILD_ARTIFACTSTAGINGDIRECTORY` or `GITHUB_WORKSPACE`.

Use `--timeout <ms>` (or `-t <ms>`) to override the default, or `--timeout 0` to disable timeouts. Explicit suite and test timeouts still take precedence.

    npm run test-node -- --timeout 10000 --run src/vs/base/test/common/async.test.ts

Use `--grep <pattern>` to run only the tests whose full title matches `<pattern>`. The runner's own loader and unexpected-error checks still run regardless of the filter.

Use `--rerun-failed-files <count>` to rerun failures, each time in a fresh process, up to `<count>` more times, as with the Electron runner: only the failed tests (the suite of a failed hook), or their whole test files when there are too many failures. Pull request CI uses `--rerun-failed-files 2`. Failures of the runner's own checks, such as unexpected errors, do not belong to a test file and are not rerun, but every rerun runs these checks again. Full-suite retries retain the Loader check, so stderr written while reloading a failed file also fails the run.

A rerun must exit normally with an exit code matching its reported results. A startup failure, signal, or inconsistent exit code fails the run, even if the rerun wrote a passing report.

## Run only the tests a change can affect

All three runners accept `--runList=<file>`: a file listing test files (such as `src/vs/base/test/common/strings.test.ts`), one per line. A runner given a list runs the tests it would run by default, but only from the listed files, so the same list works for every runner. `scripts/test-integration.sh` and `scripts/test-agent-host-e2e.sh` accept it too, for the node.js integration tests and the Agent Host E2E suites. In pull requests, the macOS and Windows unit test jobs run the files that [ripple](../../build/ripple/README.md) selects for the change, and their Electron jobs the selected integration tests; Linux runs every unit and integration test. To do the same locally for the commits of your branch and your uncommitted changes (`git stash create` saves the working tree as a commit without changing anything; `git add` new files first):

    head=$(git stash create)
    build/ripple/target/release/ripple affected --config build/ripple/vscode.jsonc --base "$(git merge-base origin/main HEAD)" --head "${head:-HEAD}" > .build/affected-tests.txt
    ./scripts/test.sh --runList=.build/affected-tests.txt

## Coverage

The following command will create a `coverage` folder in the `.build` folder at the root of the workspace:

### OS X and Linux

    ./scripts/test.sh --coverage

### Windows

    scripts\test --coverage
