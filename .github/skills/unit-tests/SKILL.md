---
name: unit-tests
description: Use when running unit tests in the VS Code repo. Covers the runTests tool, scripts/test.sh (macOS/Linux) and scripts/test.bat (Windows), and their supported arguments for filtering, globbing, and debugging tests.
---

# Running Unit Tests

## Preferred: Use the `runTests` tool

If the `runTests` tool is available, **prefer it** over running shell commands. It provides structured output with detailed pass/fail information and supports filtering by file and test name.

- Pass absolute paths to test files via the `files` parameter.
- Pass test names via the `testNames` parameter to filter which tests run.
- Set `mode="coverage"` to collect coverage.

The tool runs tests discovered by VS Code's registered test controllers; it does not compile the repository or invoke a shell test command. If discovery is unavailable, pending, or reports no executed tests, treat the request as unvalidated and use the repository's configured test command. Review per-file and test-name diagnostics for partially matched requests instead of repeatedly checking the same paths.

Example (conceptual): run tests in `src/vs/editor/test/common/model.test.ts` with test name filter `"should split lines"`.

## Fallback: Shell scripts

When the `runTests` tool is not available (e.g. in CLI environments), use the platform-appropriate script from the repo root:

- **macOS / Linux:** `./scripts/test.sh [options]`
- **Windows:** `.\scripts\test.bat [options]`

These scripts download Electron if needed and launch the Mocha test runner.

### Commonly used options

#### Bare file paths - Run tests from specific files

Pass source file paths directly as positional arguments. The test runner automatically treats bare `.ts`/`.js` positional arguments as `--run` values.

```bash
./scripts/test.sh src/vs/editor/test/common/model.test.ts
```

```bat
.\scripts\test.bat src\vs\editor\test\common\model.test.ts
```

Multiple files:

```bash
./scripts/test.sh src/vs/editor/test/common/model.test.ts src/vs/editor/test/common/range.test.ts
```

#### `--run <file>` - Run tests from a specific file (explicit form)

Accepts a **source file path** (starting with `src/`). The runner strips the `src/` prefix and the `.ts`/`.js` extension automatically to resolve the compiled module.

```bash
./scripts/test.sh --run src/vs/editor/test/common/model.test.ts
```

Multiple files can be specified by repeating `--run`:

```bash
./scripts/test.sh --run src/vs/editor/test/common/model.test.ts --run src/vs/editor/test/common/range.test.ts
```

#### `--grep <pattern>` (aliases: `-g`, `-f`) - Filter tests by name

Runs only tests whose full title matches the pattern (passed to Mocha's `--grep`).

```bash
./scripts/test.sh --grep "should split lines"
```

Combine with `--run` to filter tests within a specific file:

```bash
./scripts/test.sh --run src/vs/editor/test/common/model.test.ts --grep "should split lines"
```

#### `--runGlob <pattern>` (aliases: `--glob`, `--runGrep`) - Run tests matching a glob

Runs all test files matching a glob pattern against the compiled output directory. Useful for running all tests under a feature area.

```bash
./scripts/test.sh --runGlob "**/editor/test/**/*.test.js"
```

Note: the glob runs against compiled `.js` files in the output directory, not source `.ts` files.

#### `--coverage` - Generate a coverage report

```bash
./scripts/test.sh --run src/vs/editor/test/common/model.test.ts --coverage
```

#### `--timeout <ms>` - Set test timeout

Override the default Mocha timeout for long-running tests.

```bash
./scripts/test.sh --run src/vs/editor/test/common/model.test.ts --timeout 10000
```

#### `--workers <count>` - Run all test files in parallel processes

Spreads a run of **all** test files across `<count>` worker processes. The count is required, and capped at one worker per CPU and per 2 GB of memory, because every worker loads all test files. Every worker loads all test files and runs the files it claims, in the usual order. It is ignored, and the run uses a single window or process, with `--run`, `--runList`, `--runGlob`, bare file paths, `--grep`, `--coverage` or `--dev`. With `--rerun-failed-files`, the failures of all workers are rerun in a single window or process. When a worker fails, the runner prints the test files it ran, in order, to pass to `--run` to reproduce the failure. `npm run test-node` and `npm run test-browser` accept it as well; the browser runner starts its own browser in every worker, runs the browsers one at a time, and ignores it with `--debug`.

```bash
./scripts/test.sh --workers 4
npm run test-node -- --workers 4
npm run test-browser -- --browser chromium --workers 4
```

### Integration tests

Integration tests (files ending in `.integrationTest.ts` or located in `extensions/`) are **not run** by `scripts/test.sh`. Use `scripts/test-integration.sh` (or `scripts/test-integration.bat`) instead. See the `integration-tests` skill for details.

### Compilation requirement

Tests run against compiled JavaScript output. Reuse current output from an existing `VS Code - Build` task when available; otherwise refresh client output with `npm run build-fast -- --client-only` before running tests. This supports cold and incremental builds without a persistent watcher or extension builds. Use `npm run build-fast` when extension and Copilot outputs are also needed. Fast builds transpile rather than type-check, so run appropriate explicit type checks when warranted by the change. Do not rebuild between test selections when inputs have not changed. Test failures caused by stale output are a common pitfall.
