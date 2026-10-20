# ripple

A content-addressed change impact engine for this repository, written in Rust on top of [oxc](https://oxc.rs). Given two commits, it computes which tests (and which product entry points) a change can affect, at the level of individual declarations, in about a second.

It is a prototype for running far fewer CI minutes on pull requests: instead of running every suite on every push on three operating systems, CI asks ripple what the change can affect and runs only that.

## In pull request CI

The `Detect Changes` job of [pr.yml](../../.github/workflows/pr.yml) runs `ripple plan --base HEAD^1 --head HEAD --lists .build/unit-test-plan` on the pull request's merge commit, uploads the lists as the `unit-test-plan` artifact and writes a summary to the job page. Linux runs every unit test on every push; the macOS and Windows unit test jobs download the artifact and pass each runner's list to the test runner with `--runList`. They run every unit test when planning fails (its steps never fail the job), when the artifact cannot be downloaded, when the change reaches outside the module graph (the test runners and launchers, the transpile and install pipeline, the npm scripts and job definitions the unit test jobs run, compiler options, runtime versions), or when it affects more than half of the unit test work. The binary is cached by its sources; [pr-ripple.yml](../../.github/workflows/pr-ripple.yml) builds it on `main` when they change, and checks daily that the cache still exists.

## How it works

1. **Snapshot.** ripple reads the tree of a commit straight from the git object database (`git ls-tree`, parallel `git cat-file --batch` workers), so it can analyze any commit without a checkout. Analysis results are cached by blob id, so every file version is parsed once.
2. **Analyze** each `src/**/*.ts` module with oxc (parser + semantic analysis) into facts:
   - Runtime declarations (functions, classes, variables, enums, namespaces) plus a module initializer node holding the statements that run on load. TypeScript-only declarations (interfaces, type aliases, overloads, `declare`) have no runtime node.
   - A content hash per declaration over its tokens, skipping comments, whitespace and TypeScript-only syntax (type annotations, `as`, `!`, `implements`, ...). A type-only or comment-only change changes no hash. The hash also covers the declaration's syntax tree (node kinds in source order), so the same tokens parsed differently, as with automatic semicolon insertion after `return`, hash differently.
   - Value-level references between declarations, resolved through imports and re-export chains. Imports only used as types are elided like the compiler does, so they never create runtime edges.
   - Export nodes: one node per exported name, whose content is what the name is bound to. Consumers depend on the export nodes along their import's resolution chain, so retargeting an export or re-export selects them although no declaration changed.
   - Evaluation order: the top-level statements whose load-time code has effects or reads mutable module state (`let`/`var`), in source order. Mutable module state also depends on the load-time code that writes it.
   - Members as separate nodes: enum members, `const` object literal properties, namespace exports and static class members are reached through explicit `X.member` references; instance methods are gated by name (see below).
   - Load-time effects: a declaration is pinned to its module initializer only if loading it has effects outside the module (calling an import or unknown global, or an impure local function, found by a small fixpoint over local functions). Methods of local values, pure globals and dead `if (CONST_FALSE)` blocks do not count.
   - Path strings (`'vs/...'`, fixture folders), dynamic imports, `require`, and ambient inputs injected by the test runners (`globalThis._VSCODE_PRODUCT_JSON`, `_VSCODE_PACKAGE_JSON`).
3. **Link** all modules into one graph (about 160k nodes and 500k edges for the repository), with npm packages and ambient inputs as nodes of their own. The whole tree analyzes in about 0.5 s and links in about 0.1 s on an 18-core machine.
4. **Select.** Changed nodes are the declarations whose hash changed between the two snapshots, plus:
   - npm packages whose resolved version changed, from a field-level diff of `package.json` and a reverse-dependency closure over `package-lock.json`;
   - files under folders that tests read by path (fixtures);
   - module initializers that start loading a module with global load-time effects they did not load before.

   A reverse traversal gives the candidate tests; each candidate is then confirmed by a forward traversal that only enters an instance method once the traversal has seen its name used (`x.send()`, `{ send } = x`, `'send'`). This keeps a test that merely constructs a large service from depending on every one of its methods.

## Commands

```bash
cargo build --release

# Graph statistics for a commit
./target/release/ripple stats --rev HEAD

# Test files a change can affect (one per line)
./target/release/ripple affected --base origin/main --head HEAD

# JSON plan for CI: the unit test files to run per test runner. `--lists <dir>` also writes
# plan.json and one <runner>.txt list per runner with selected files; on GitHub Actions it
# writes the output `select` and a job summary. `--max-share` (default 0.5) sets when to run
# everything instead.
./target/release/ripple plan --base origin/main --head HEAD --lists .build/unit-test-plan

# Replay main's first-parent history and compare selection strategies
./target/release/ripple replay --since 2026-10-06 --until origin/main --out replay.jsonl --hubs 1

# Replay real pull request push sequences (TSV: run id, head sha, pull request key, created at)
# and count the unit tests each push must run when results are cached by test key
./target/release/ripple pushes --file pushes.tsv --out pushes.jsonl

# Culprit finding: the main commits in a range whose changes can affect a failing test
./target/release/ripple blame --test src/vs/.../foo.test.ts --since <last green> --until <first red>
```

All commands accept `--repo <path>`. oxc requires Rust 1.97 or newer; `rust-toolchain.toml` pins the version CI uses.

## Test keys and OS sensitivity

- **Test keys.** The key of a test file hashes every node in its name-gated forward closure: declaration hashes, asset blobs, npm package versions from the lockfile, ambient inputs, directories it reads, and the test toolchain (runners, transpiler, compiler options, runtime versions). A test whose key already passed does not need to run again, wherever the result came from.
- **OS sensitivity.** A declaration is OS-dependent if its own code uses Node.js OS modules (`fs`, `path`, `os`, `child_process`, ...), the repository's platform/path/process modules, `process.*`, OS-dependent properties such as `fsPath`, or lives in Electron main-process code. A change is OS-sensitive if a changed declaration is, or it touches shell scripts, built-in extensions or packages with platform-specific binaries. On recent history this flags about 60% of pushes, so it is reported, not used as a gate; the narrower "OS-critical" categories (native packages, extensions, scripts, Electron main) flag about 8% of commits.

## Validation

- **Replay of 1,007 merged pull requests** (first-parent commits on `main`, Oct 6 to 20, 2026), share of unit test work each one selects (weighted by test count, run-everything triggers counted as 100%):

  | Selection | Mean | Median | p90 | Selects nothing |
  | --- | --- | --- | --- | --- |
  | Today: everything | 100% | 100% | 100% | 0% |
  | File-level imports, including types | 19.2% | 6.8% | 60.6% | 14.6% |
  | File-level runtime loads | 10.7% | 2.6% | 35.5% | 14.6% |
  | **ripple, declaration-level** | **7.1%** | **1.7%** | **19.8%** | **15.2%** |

  Only 4 of the 1,007 commits needed everything (test runner and transpiler changes). Entry points reached a change in: editor (Monaco) 6.9%, extension host 6.9%, agent host 34%, server 38%, workbench 51% of commits.
- **Recall on real CI failures.** 75 pull request runs with failing Linux unit test jobs (Oct 17 to 20): the failing test files were taken from the job logs and checked against what ripple selects for the pull request's own change. Of 36 failures caused by the pull request, ripple selected 34. The two misses were tests that only passed because other test files had leaked registrations into a global registry earlier in the same process; the pull request (a test-only change) stopped the leak. Two further Linux-only misses were timing flakes unrelated to their change. A test failing on 31 unrelated branches at the same time (a broken `main`) was correctly not attributed to those pull requests.
- **Real push sequences.** 2,184 pushes of 904 pull requests (Oct 13 to 19), share of unit test work per push: selection alone 11.6% mean (2.4% median); with results cached by test key across a pull request's pushes 6.5% mean (0.8% median), and 24% of pushes run no unit tests at all.
- **Culprit finding.** On Oct 19, `main` broke through a semantic conflict between two pull requests that each passed the full matrix (#342479, then #342104). `ripple blame` over the 55 commits merged that day returned 4 candidates in 18 seconds, including both halves of the conflict.

## Known limits

- Static selection cannot see dependencies through shared mutable global state between test files (registries populated by one test and read by another), dynamic property access with computed names, or files read with computed paths. A full run in the merge queue (or after merge) is the safety net, and an isolation sweep that runs each test file alone finds tests relying on such leaks.
- Changes outside the module graph that the unit test jobs depend on select everything: the test runners and launchers (`test/unit/`, `scripts/test.sh`, `scripts/test.bat`, `product.json`), the transpile and install pipeline (`build/gulpfile.ts`, `build/lib/esbuild.ts`, `build/next/`, `build/npm/`), the npm scripts the jobs run, the unit test job definitions, compiler options, and the Electron and Node versions.
- Selected test files that no longer exist (deleted or renamed tests) are dropped from the plan; their surviving dependents are still found through the base snapshot.
- Smoke tests and extension host suites are selected per entry point, not per test; coverage maps from nightly runs would make them as precise as unit tests.
