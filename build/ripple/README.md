# ripple

A content-addressed change impact engine for TypeScript repositories, written in Rust on top of [oxc](https://oxc.rs). Given two commits, it computes which test files a change can affect, at the level of individual declarations, in about a second.

It is a prototype for running far fewer CI minutes on pull requests: instead of running every suite on every push on three operating systems, CI asks ripple what the change can affect and runs only that.

## In pull request CI

The `Detect Changes` job of [pr.yml](../../.github/workflows/pr.yml) runs `ripple plan --config build/ripple/vscode.jsonc --base HEAD^1 --head HEAD --out-dir .build/unit-test-plan` on the pull request's merge commit, uploads the plan as the `unit-test-plan` artifact and writes a summary to the job page. Linux runs every unit test on every push; the macOS and Windows unit test jobs download the artifact and pass its `unit.txt` to each test runner with `--runList`. Each runner runs the tests it would run by default, but only from the listed files (see [test/unit/README.md](../../test/unit/README.md)), so ripple needs no knowledge of the runners. They run every unit test when planning fails (its steps never fail the job), when the artifact cannot be downloaded, when the change touches a file that every unit test depends on (`runEverything` in the configuration), or when it affects more than half of the unit test work. The binary is cached by its sources; [pr-ripple.yml](../../.github/workflows/pr-ripple.yml) builds it on `main` when they change, and checks daily that the cache still exists.

## Configuration

The Rust code knows TypeScript, JavaScript, npm and git, and nothing about this repository. Everything repository-specific is in [vscode.jsonc](vscode.jsonc), which every command reads with `--config`:

- `modules`: the files to analyze (`src/**/*.ts`); every other file is an opaque node.
- `pathAliases`: non-relative specifiers that name repository files (`vs/` is `src/vs/`).
- `tests`: the unit and integration test files.
- `runEverything`: files outside the module graph that every unit test depends on, such as the test runners, the transpile pipeline, compiler options, runtime versions and the unit test job definitions, by the reason the plan reports. Changes to ripple or its configuration also run everything.
- `packages`: npm packages that build or run every test (`toolchain`), npm scripts the unit test jobs run (`testScripts`), and `package.json` fields no test reads (`ignoredFields`).
- `injectedGlobals`: files the test runners expose as globals (`globalThis._VSCODE_PRODUCT_JSON` is `product.json`).
- `pure` and `implicitMethods`: the repository's conventions that refine the analysis: functions and objects whose calls have no side effects (`localize`, `URI`), and methods called without naming them (`dispose`).

The configuration is strict: unknown fields are errors. Glob patterns use `*` within a path segment and `**` across segments, and patterns starting with `!` exclude.

## How it works

1. **Snapshot.** ripple reads the tree of a commit straight from the git object database (`git ls-tree`, parallel `git cat-file --batch` workers), so it can analyze any commit without a checkout. Analysis results are cached by blob id, so every file version is parsed once.
2. **Analyze** each module with oxc (parser + semantic analysis) into facts:
   - Runtime declarations (functions, classes, variables, enums, namespaces) plus a module initializer node holding the statements that run on load. TypeScript-only declarations (interfaces, type aliases, overloads, `declare`) have no runtime node.
   - A content hash per declaration over its tokens, skipping comments, whitespace and TypeScript-only syntax (type annotations, `as`, `!`, `implements`, ...). A type-only or comment-only change changes no hash. The hash also covers the declaration's syntax tree (node kinds in source order), so the same tokens parsed differently, as with automatic semicolon insertion after `return`, hash differently.
   - Value-level references between declarations, resolved through imports and re-export chains. Imports only used as types are elided like the compiler does, so they never create runtime edges.
   - Export nodes: one node per exported name, whose content is what the name is bound to. Consumers depend on the export nodes along their import's resolution chain, so retargeting an export or re-export selects them although no declaration changed.
   - Evaluation order: the top-level statements whose load-time code has effects or reads mutable module state (`let`/`var`), in source order. Mutable module state also depends on the load-time code that writes it.
   - Members as separate nodes: enum members, `const` object literal properties, namespace exports and static class members are reached through explicit `X.member` references; instance methods are gated by name (see below). A static or object literal member that uses `this` or `super` depends on the sibling that `this.name` names, or else on its class or object.
   - Load-time effects: a declaration is pinned to its module initializer only if loading it has effects outside the module (calling an import or unknown global, or an impure local function, found by a small fixpoint over local functions). Methods of local values, pure globals and functions, and dead `if (CONST_FALSE)` blocks do not count.
   - Path strings (relative or starting with a path alias, such as worker entry points and fixture folders), dynamic imports, `require`, and the globals the test runners inject.
3. **Link** all modules into one graph (about 160k nodes and 500k edges for this repository), with npm packages and injected globals as nodes of their own. The whole tree analyzes in about 0.5 s and links in about 0.1 s on an 18-core machine.
4. **Select.** Changed nodes are the declarations whose hash changed between the two snapshots, plus:
   - npm packages whose resolved version changed, from a field-level diff of `package.json` and a reverse-dependency closure over `package-lock.json`, and injected globals whose file changed;
   - files under folders that tests read by path (fixtures);
   - module initializers that start loading a module with global load-time effects they did not load before.

   A reverse traversal gives the candidate tests; each candidate is then confirmed by a forward traversal that only enters an instance method once the traversal has seen its name used (`x.send()`, `{ send } = x`, `'send'`). This keeps a test that merely constructs a large service from depending on every one of its methods.

## Commands

```bash
cargo build --release

# Graph statistics for a commit
./target/release/ripple stats --config vscode.jsonc --rev HEAD

# Test files the commits of your branch can affect, one per line. On stderr: the declarations each
# changed module changed, and a summary. Compare with the merge base: against origin/main itself,
# the commits main gained since your branch started would count as changes too.
./target/release/ripple affected --config vscode.jsonc --base "$(git merge-base origin/main HEAD)" --head HEAD

# The same, including uncommitted changes. `git stash create` saves the working tree as a commit
# without changing anything (tracked files only, so `git add` new ones first), and prints nothing
# when there are no changes.
head=$(git stash create)
./target/release/ripple affected --config vscode.jsonc --base "$(git merge-base origin/main HEAD)" --head "${head:-HEAD}"

# JSON plan for CI: the unit test files to run. `--out-dir <dir>` also writes plan.json and, when
# only the selected files should run, unit.txt; on GitHub Actions it writes the output `select`
# and a job summary. `--max-share` (default 0.5) sets when to run everything instead.
./target/release/ripple plan --config vscode.jsonc --base "$(git merge-base origin/main HEAD)" --head HEAD --out-dir ../../.build/unit-test-plan

# Replay first-parent history and compare selection strategies
./target/release/ripple replay --config vscode.jsonc --since 2026-10-06 --until origin/main --out replay.jsonl --hubs 1

# Culprit finding: the commits in a range whose changes can affect a failing test
./target/release/ripple blame --config vscode.jsonc --test src/vs/.../foo.test.ts --since <last green> --until <first red>
```

All commands accept `--repo <path>`. oxc requires Rust 1.97 or newer; `rust-toolchain.toml` pins the version CI uses.

Selection works per declaration, so what an edit selects depends on what it changes. Comments, formatting and types select nothing. A change to a function body selects the tests that can reach that function: changing `MoveCaretCommand.getEditOperations` selects only `moveCarretCommand.test.ts`, while changing the static `Position.isBefore`, which most of the editor uses, selects 836 test files (file-level analysis would select 1,077, or 1,531 counting type-only imports). A change to a file that every unit test depends on (`runEverything`) lists every test and prints the reason. `affected` lists unit and integration tests; `plan` lists the unit tests that macOS and Windows would run, and each test runner then runs the listed files it supports.

## Validation

- **Replay of 708 merged pull requests** (first-parent commits on `main`, Oct 13 to 20, 2026), share of unit test work each one selects (weighted by the number of tests in each file, run everything counted as 100%):

  | Selection | Mean | Median | p90 | Selects nothing |
  | --- | --- | --- | --- | --- |
  | Today: everything | 100% | 100% | 100% | 0% |
  | File-level imports, including types | 21.2% | 7.8% | 66.4% | 13.8% |
  | File-level runtime loads | 13.2% | 2.8% | 40.1% | 13.8% |
  | **ripple, declaration-level** | **9.0%** | **1.8%** | **23.9%** | **14.7%** |

  16 of the 708 commits needed everything: 12 changed the unit test job definitions, 2 the test runners, 1 the transpiler and 1 `.npmrc`.
- **Recall on real CI failures.** 75 pull request runs with failing Linux unit test jobs (Oct 17 to 20): the failing test files were taken from the job logs and checked against what ripple selects for the pull request's own change. Of 36 failures caused by the pull request, ripple selected 34. The two misses were tests that only passed because other test files had leaked registrations into a global registry earlier in the same process; the pull request (a test-only change) stopped the leak. Two further Linux-only misses were timing flakes unrelated to their change. A test failing on 31 unrelated branches at the same time (a broken `main`) was correctly not attributed to those pull requests.
- **Culprit finding.** On Oct 19, `main` broke through a semantic conflict between two pull requests that each passed the full matrix (#342479, then #342104). `ripple blame` over the 55 commits merged that day returned 4 candidates in 18 seconds, including both halves of the conflict.

## Known limits

- Static selection cannot see dependencies through shared mutable global state between test files (registries populated by one test and read by another), dynamic property access with computed names, or files read with computed paths. Linux running every unit test on every push, and the full matrix after merge, are the safety net; an isolation sweep that runs each test file alone finds tests relying on such leaks.
- Files outside the module graph are only as complete as `runEverything` in [vscode.jsonc](vscode.jsonc): a new file that every unit test depends on (a new launcher, a new transpile step) must be added there.
- Selected test files that no longer exist (deleted or renamed tests) are dropped from the plan; their surviving dependents are still found through the base snapshot.
- Only unit tests are selected. Integration, smoke and extension host suites run in full.
