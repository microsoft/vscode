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

### Integration tests

Integration tests (files ending in `.integrationTest.ts` or located in `extensions/`) are **not run** by `scripts/test.sh`. Use `scripts/test-integration.sh` (or `scripts/test-integration.bat`) instead. See the `integration-tests` skill for details.

### Compilation requirement

Tests run against compiled JavaScript output. Ensure the `VS Code - Build` watch task is running or that compilation has completed before running tests. Test failures caused by stale output are a common pitfall.
