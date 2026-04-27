---
name: integration-tests
description: Use when running integration tests in the VS Code repo. Covers scripts/test-integration.sh (macOS/Linux) and scripts/test-integration.bat (Windows), their supported arguments for filtering, and the difference between node.js integration tests and extension host tests.
---

# Running Integration Tests

Integration tests in VS Code are split into two categories:

1. **Node.js integration tests** - files ending in `.integrationTest.ts` under `src/`. These run in Electron via the same Mocha runner as unit tests.
2. **Extension host tests** - tests embedded in built-in extensions under `extensions/` (API tests, Git tests, TypeScript tests, etc.). These launch a full VS Code instance with `--extensionDevelopmentPath`.

## Scripts

- **macOS / Linux:** `./scripts/test-integration.sh [options]`
- **Windows:** `.\scripts\test-integration.bat [options]`

When run **without filters**, both scripts execute all node.js integration tests followed by all extension host tests.

When run **with `--run` or `--runGlob`** (without `--suite`), only the node.js integration tests are run and the filter is applied. Extension host tests are skipped since these filters are node.js-specific.

When run **with `--grep` alone** (no `--run`, `--runGlob`, or `--suite`), all tests are run -- both node.js integration tests and all extension host suites -- with the grep pattern forwarded to every test runner.

When run **with `--suite`**, only the matching extension host test suites are run. Node.js integration tests are skipped. Combine `--suite` with `--grep` to filter individual tests within the selected suites.

## Options

### `--run <file>` - Run tests from a specific file

Accepts a **source file path** (starting with `src/`). Works identically to `scripts/test.sh --run`.

```bash
./scripts/test-integration.sh --run src/vs/workbench/services/search/test/browser/search.integrationTest.ts
```

### `--runGlob <pattern>` (aliases: `--glob`, `--runGrep`) - Select test files by path

Selects which test **files** to load by matching compiled `.js` file paths against a glob pattern. Overrides the default `**/*.integrationTest.js` glob. Only applies to node.js integration tests (extension host tests are skipped).

```bash
./scripts/test-integration.sh --runGlob "**/search/**/*.integrationTest.js"
```

### `--grep <pattern>` (aliases: `-g`, `-f`) - Filter test cases by name

Filters which **test cases** run by matching against their test titles (e.g. `describe`/`test` names). When used alone, the grep is applied to both node.js integration tests and all extension host suites. When combined with `--suite`, only the matched suites run with the grep.

```bash
./scripts/test-integration.sh --grep "TextSearchProvider"
```

### `--suite <pattern>` - Run specific extension host test suites

Runs only the extension host test suites whose name matches the pattern. Supports comma-separated values and shell glob patterns (on macOS/Linux). Node.js integration tests are skipped.

Available suite names: `api-folder`, `api-workspace`, `colorize`, `terminal-suggest`, `typescript`, `markdown`, `emmet`, `git`, `git-base`, `ipynb`, `notebook-renderers`, `configuration-editing`, `github-authentication`, `css`, `html`.

```bash
# Run only Git extension tests
./scripts/test-integration.sh --suite git

# Run API folder and workspace tests (glob, macOS/Linux only)
./scripts/test-integration.sh --suite 'api*'

# Run multiple specific suites
./scripts/test-integration.sh --suite 'git,emmet,typescript'

# Filter tests within a suite by name
./scripts/test-integration.sh --suite api-folder --grep 'should open'
```

### `--help`, `-h` - Show help

```bash
./scripts/test-integration.sh --help
```

### Other options

All other options (e.g. `--timeout`, `--coverage`, `--reporter`) are forwarded to the underlying `scripts/test.sh` runner for node.js integration tests. These extra options are **not** forwarded to extension host suites when using `--suite`.

## Examples

```bash
# Run all integration tests (node.js + extension host)
./scripts/test-integration.sh

# Run a single integration test file
./scripts/test-integration.sh --run src/vs/workbench/services/search/test/browser/search.integrationTest.ts

# Run integration tests matching a grep pattern
./scripts/test-integration.sh --grep "TextSearchProvider"

# Run integration tests under a specific area
./scripts/test-integration.sh --runGlob "**/workbench/**/*.integrationTest.js"

# Run only Git extension host tests
./scripts/test-integration.sh --suite git

# Run API folder + workspace extension tests (glob)
./scripts/test-integration.sh --suite 'api*'

# Run multiple extension test suites
./scripts/test-integration.sh --suite 'git,typescript,emmet'

# Grep for specific tests in the API folder suite
./scripts/test-integration.sh --suite api-folder --grep 'should open'

# Combine file and grep
./scripts/test-integration.sh --run src/vs/workbench/services/search/test/browser/search.integrationTest.ts --grep "should search"
```

## Compilation requirement

Tests run against compiled JavaScript output. Ensure the `VS Code - Build` watch task is running or that compilation has completed before running tests.

## Distinction from unit tests

- **Unit tests** (`.test.ts`) → use `scripts/test.sh` or the `runTests` tool
- **Integration tests** (`.integrationTest.ts` and extension tests) → use `scripts/test-integration.sh`

Do **not** mix these up: `scripts/test.sh` will not find integration test files unless you explicitly pass `--runGlob **/*.integrationTest.js`, and `scripts/test-integration.sh` is not intended for `.test.ts` files.
