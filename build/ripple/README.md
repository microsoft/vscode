# ripple

A content-addressed change impact engine for TypeScript repositories, written in Rust on top of [oxc](https://oxc.rs). Given two commits, it computes which test files a change can affect, at the level of individual declarations, in about a second.

It is a prototype for running far fewer CI minutes on pull requests: instead of running every suite on every push on three operating systems, CI asks ripple what the change can affect and runs only that.

An overview of the problem, how ripple works and how CI uses it, from [#342907](https://github.com/microsoft/vscode/pull/342907):

https://github.com/user-attachments/assets/354ed24f-ebe3-44bf-a60f-32bc0fcbbe0a

## In pull request CI

The `Detect Changes` job of [pr.yml](../../.github/workflows/pr.yml) runs `ripple plan --config build/ripple/vscode.jsonc --base HEAD^1 --head HEAD --out-dir .build/test-plan` on the pull request's merge commit, uploads the plan as the `test-plan` artifact and writes a summary to the job page. Linux runs every unit test on every push; the macOS and Windows unit test jobs download the artifact and pass its `unit.txt` to each test runner with `--runList`. Each runner runs the tests it would run by default, but only from the listed files (see [test/unit/README.md](../../test/unit/README.md)), so ripple needs no knowledge of the runners. When the plan selects no file, those jobs are skipped instead of setting up to run nothing (the `selected-unit-tests` output of `Detect Changes`). The Browser ones are also skipped when no selected file is a browser test, because the browser runner does not load the test files in `node`, `electron-browser`, `electron-main` and `electron-utility` folders (the `selected-browser-unit-tests` output; `BROWSER_EXCLUDED_FOLDERS` in the `Check ripple` step must match the `excludeGlob` of [test/unit/browser/index.js](../../test/unit/browser/index.js), which a test checks). The Electron ones load every test folder. They run every unit test when planning fails, when the artifact cannot be downloaded, or when the change touches a file that every unit test depends on (`runEverything` in the configuration); otherwise they run the selected files, however many. The integration tests work the same way: Linux runs every one on every push, while the macOS and Windows Electron jobs pass the plan's `integration.txt` with `--runList` to `scripts/test-integration.sh`, which runs the node.js integration tests, and to the Agent Host E2E runner. They skip either step (on Windows, the separate Agent Host E2E job) when the plan selects none of its files (the `selected-node-integration-tests` and `selected-agent-host-e2e` outputs), and run every integration test when the change touches a file that only the integration tests depend on (`runEveryIntegrationTest`). Agent Host E2E also still needs the changed files to pass the check of `.github/actions/detect-agent-host-e2e-changes`, as on Linux. When planning fails, the job summary says that every unit and integration test runs. The planning steps never fail `Detect Changes`, which a broken ripple must not block. When ripple fails to build, pass its tests or plan, the `Ripple` check fails for pull requests that change `build/ripple`; it is skipped for the others, which show a warning. So does a module that ripple cannot parse, which disables selection. The binary is cached by its sources; [pr-ripple.yml](../../.github/workflows/pr-ripple.yml) builds it on `main` when they change, and checks daily that the cache still exists.

## Configuration

The Rust code knows TypeScript, JavaScript, npm and git, and nothing about this repository. Everything repository-specific is in [vscode.jsonc](vscode.jsonc), which every command reads with `--config`:

- `modules`: the files to analyze (`src/**/*.ts`); every other file is an opaque node.
- `pathAliases`: non-relative specifiers that name repository files (`vs/` is `src/vs/`).
- `tests`: the unit and integration test files, and the scripts that run the unit tests (`runners`).
- `runEverything`: files outside the module graph that every unit test depends on, such as the test runners, the transpile pipeline and its npm packages (`build/package*.json`), compiler options, runtime versions and the unit test job definitions, by the reason the plan reports. Changing one runs every unit test, and every integration test, which the unit test runners run too. So do the scripts that the listed scripts load through relative imports, such as `build/lib/electronVersion.ts`, which `build/lib/electron.ts` loads. Changes to ripple or its configuration also run everything.
- `runEveryIntegrationTest`: the same for the files that only the integration tests depend on, such as the scripts that run them (`scripts/test-integration.sh`) and the Agent Host E2E runner: changing one runs every integration test, but no unit test. A file that a `runEverything` script loads runs everything, even when this group lists it. The group can also list modules that integration tests load by a path ripple cannot resolve, such as the `src/bootstrap-*.ts` files (see [Known limits](#known-limits)).
- `packages`: npm packages that build or run every test but that no `runEverything` script loads, such as a command line tool (`toolchain`: ripple finds the packages those scripts load itself), npm scripts the unit test jobs run (`testScripts`), and `package.json` fields no test reads (`ignoredFields`).
- `injectedGlobals`: files the test runners expose as globals (`globalThis._VSCODE_PRODUCT_JSON` is `product.json`).
- `pure`, `implicitMethods` and `moduleLoaders`: the repository's conventions that refine the analysis: functions and objects whose calls have no side effects (`localize`, `URI`), methods called without naming them (`dispose`), and functions that load the module or package their first argument names, like `require` (`importAMDNodeModule`).
- `platforms`: what makes a change platform-sensitive, for the [platform analysis](#platform-analysis): paths and signals for Windows (`win32`), macOS (`darwin`), every operating system but Linux (`nonLinux`) and the end-to-end suites (`e2e`), the signals that only count in changed test code (`testSignals`, outside the `testLayers`) or in selected tests (`selectedTestSignals`), how far a changed declaration can be from a signal (`depth`), and files analyzed only for signals (`modules`, the extensions, with their test code `moduleTests`).

The configuration is strict: unknown fields are errors. Glob patterns use `*` within a path segment and `**` across segments, and patterns starting with `!` exclude.

## How it works

1. **Snapshot.** ripple reads the tree of a commit straight from the git object database (`git ls-tree`, parallel `git cat-file --batch` workers), so it can analyze any commit without a checkout. Analysis results are cached by blob id, so every file version is parsed once.
2. **Analyze** each module with oxc (parser + semantic analysis) into facts:
   - Runtime declarations (functions, classes, variables, enums, namespaces) plus a module initializer node holding the statements that run on load. TypeScript-only declarations (interfaces, type aliases, overloads, `declare`) have no runtime node.
   - A content hash per declaration over its tokens, skipping comments, whitespace and TypeScript-only syntax (type annotations, `as`, `!`, `implements`, ...). A type-only or comment-only change changes no hash. The hash also covers the declaration's syntax tree (node kinds in source order), so the same tokens parsed differently, as with automatic semicolon insertion after `return`, hash differently.
   - Value-level references between declarations, resolved through imports and re-export chains. Imports only used as types are elided like the compiler does, so they never create runtime edges.
   - Export nodes: one node per exported name, whose content is what the name is bound to. Consumers depend on the export nodes along their import's resolution chain, so retargeting an export or re-export selects them although no declaration changed. A reference to a whole module (a dynamic import, `require`, a namespace import used as a value) depends on a node standing for the module's surface: its own nodes and what each of its exports is bound to, through re-exports (`export { x } from`, `export * from`, `export * as ns from`), so cycles of re-exports are cycles of the graph.
   - Evaluation order: the top-level statements, and the members, whose load-time code has effects, reads mutable module state (`let`/`var`) or reads module state that other load-time code changes, and that code, in source order.
   - Mutable module state depends on the load-time code that writes or mutates it: assignments and updates, property writes and `delete`, calls of methods that may mutate their receiver (any but known read-only ones such as `map` or `slice`), and values passed to calls. Writes in the functions, constructors and methods that load-time code calls count as writes of that code, and so do those of local functions passed to calls at load time (`[1].map(write)`). `Object` methods that change their argument (`Object.assign`, `Object.defineProperties`, `Object.freeze`, ...) write it. A write to the whole object is a write to each of its members, which code reaches directly (`config.mode`). A write to `X.member` is a write to that member.
   - Members as separate nodes: enum members, `const` object literal properties, namespace exports and static class members are reached through explicit `X.member` references; instance methods are gated by name (see below). The parent's hash records the order of its properties, enum members, namespace members and static fields, which decides enumeration and initialization order; moving methods changes nothing. Members with the same name, such as a getter and its setter, are one dependency. A spread or computed key can overwrite the object literal properties before it (`{ a: 1, ...overrides }`), so those stay with the object: reading one depends on all of it. A static or object literal member that uses `this` or `super` depends on the sibling that `this.name` names, or else on its class or object.
   - Load-time effects: a declaration is pinned to its module initializer only if loading it has effects outside the module: calling or constructing an import or unknown global, changing an import, a global or one of their members (assigning, updating or deleting it, or changing it with a method of `Object`), or calling an impure local function, constructor or member, found by a small fixpoint. Constructing a class runs its constructor, instance fields, superclass and the methods they call through `this`, not its other methods. Methods of local values without tracked members, pure globals and functions, and dead `if (CONST_FALSE)` blocks do not count. Changing a pure global does: calling `console.log` has no effect, but assigning it, `Error.stackTraceLimit` or `Array.prototype.last` changes what every module that uses them does. npm packages are not analyzed, so loading one counts as an effect.
   - Path strings: relative or starting with a path alias (worker entry points, fixture folders), or naming an existing repository file or folder from the root (such as a grammar a test reads, `'extensions/json/syntaxes/JSON.tmLanguage.json'`). A relative or path alias string that names a module depends on the module and what it loads, as an entry point does. No module specifier is a path from the root, so code reads the file that such a path names: it depends on the file's content, also when the file is a module, but not on what the module loads. The `'src/main.ts'` of a test's fake file tree does not reach everything that the main process starts. Also dynamic imports, `require` and the configured module loaders, and the globals the test runners inject.
   - Test data folders: the folders next to test files that contain no module, such as `__snapshots__` and `fixtures`. Tests read them by a path they compute, so the folder's name appears in a string or template literal of the test, or of a module it loads: a snapshot helper's `'__snapshots__'`, or the `test-cases` of `` `${dir}${sep}test-cases${sep}${name}` ``. Those tests depend on the folder. No configuration names the folders.
   - Computed paths: a template literal whose static start names a folder reads the data files (not modules) of that folder that have the template's static start and end, such as the keyboard mapper's layouts and golden files through `` `vs/workbench/services/keybinding/test/node/${file}.js` `` and `` `vs/workbench/services/keybinding/test/node/${file}` ``, or the webview's `pre/index.html` through `` `vs/workbench/contrib/webview/browser/pre${uri.path}` ``. A name like `` `./file${i}.ts` `` names no data file and reads nothing. The folder must exist and be at least three levels deep, so `` `src/${name}` `` reads nothing.
3. **Link** all modules into one graph (about 160k nodes and 500k edges for this repository), with npm packages and injected globals as nodes of their own. The whole tree analyzes in about 0.5 s and links in about 0.1 s on an 18-core machine.
4. **Select.** Changed nodes are the declarations whose hash changed between the two snapshots, plus:
   - npm packages whose resolved version or install script permission (`allowScripts`) changed, from a field-level diff of `package.json` and `package-lock.json`, with the packages that depend on them according to the lockfile (also when only `package.json` changed), and injected globals whose file changed. A change to a package that a `runEverything` script loads, such as the test runners' web server, runs every unit test (and one that only a `runEveryIntegrationTest` script loads, every integration test);
   - files that a path from the repository root names (grammars), under folders that tests read by path (fixtures), under a test data folder (snapshots), or that a computed path can name (golden files);
   - module initializers whose evaluation runs other modules with global load-time effects or npm packages, or the same ones in another order: the modules a module loads are evaluated depth-first in source order, each once, so loading a module directly that a later import loaded before moves its effects earlier.

   A module that does not parse has no dependencies, so it runs every unit test. So does a change that reaches what the test runners (`tests.runners`) use of the modules that they name by a path alias, such as `assertCleanState` of `'vs/workbench/test/common/utils'`, which the Electron renderer calls in every run, or the protocol handlers that the Electron main process serves tests with: tests cannot import these dependencies.

   A reverse traversal gives the candidate tests; each candidate is then confirmed by a forward traversal that only enters an instance method once the traversal has seen its name used (`x.send()`, `{ send } = x`, `'send'`). This keeps a test that merely constructs a large service from depending on every one of its methods. Code outside the analysis calls methods by names that the analyzed code may never use: Node.js streams call `_flush`, the DOM calls `connectedCallback`, an npm package calls the methods of its interfaces. So reaching a class reaches all of its methods when it extends or implements something that is not analyzed (a global, a Node.js module or an npm package), directly, through its analyzed superclasses, or through analyzed types that re-export one, alias it or extend it.

## Platform analysis

Linux runs every unit and integration test on every push. A change needs macOS and Windows only when it can behave differently there, which `ripple plan` decides for each operating system (`win32` and `darwin`) from `platforms` in the configuration, and writes to `platforms` in plan.json:

```json
"platforms": {
	"win32": {
		"unit": true, "e2e": false, "all": false, "share": 0.0571,
		"tests": ["src/vs/platform/agentHost/test/node/agentConfigurationService.test.ts", "..."],
		"extensions": [],
		"reasons": [
			{ "tier": "unit", "rule": "declaration", "group": "win32", "change": "src/vs/platform/agentHost/node/sessionPermissions.ts#SessionPermissionManager.prototype.getPathConfirmationOptions", "signal": "src/vs/base/common/path.ts#win32" },
			{ "tier": "unit", "rule": "changedTest", "group": "win32", "change": "src/vs/platform/agentHost/test/node/claudeAgent.test.ts#test 'dispose with parked permission unblocks SDK (Test 17)'", "signal": "src/vs/base/common/uri.ts#URI.file" }
		]
	},
	"darwin": { "unit": true, "e2e": false, "all": false, "share": 0.0548, "tests": ["..."], "extensions": [], "reasons": ["..."] }
}
```

That is the plan of a change to the Agent Host's permission rules (#345113): of the 948 unit test files it selects, Windows runs the 50 that reach changed code that branches on Windows or uses Windows paths, or whose changed test cases use paths, and `ripple why --platform win32 --test <file>` shows the path from each to its signal.

`unit` says whether the operating system runs its unit tier (unit tests, node.js integration tests, Agent Host E2E and extension tests): it does when there are `tests` to run (all of them with `all`), or changed `extensions` whose tests run there. `e2e` says whether it runs the end-to-end tier (smoke, remote and browser integration tests). `reasons` explains both, by rule:

| Rule | Plan | Applies when | Runs there |
| --- | --- | --- | --- |
| `runEverything` | | the change runs every test (`runEverything`, a parse error) | every test, both tiers |
| `path` | R1 | a changed file matches the `paths` of a group of the operating system, such as `**/win32/**` | every test that ripple selects |
| `package` | R3 | the version of a package that a signal names changed, such as `npm:@vscode/windows-*` | every test that ripple selects |
| `declaration` | R2, R3 | a changed declaration uses a signal at most `depth` edges away | the tests that depend on the declaration |
| `selectedTest` | R4 | a selected test uses a `selectedTestSignals` signal (by default `signals`) | that test |
| `changedTest` | R5 | changed test code, outside the `testLayers` that it excludes, uses a `testSignals` signal | that test file |
| `extension` | | changed code of a `modules` file uses a signal, or does not parse | the tests of its package |

The groups of an operating system are its own and `nonLinux`, which holds what behaves differently on every operating system but Linux, such as `process.platform` and `node:child_process`. `e2e` decides the end-to-end tier of both, from `paths` and `signals` (`declaration` and `package` work the same).

Signals are nodes of the graph, so the analysis works per declaration like selection, and `why` can explain it. A signal names a declaration (`src/vs/base/common/platform.ts#isWindows`, `src/vs/base/common/uri.ts#URI.file`), every declaration of a module (`src/vs/base/common/path.ts`), a Node.js module or its export (`node:child_process`, `node:fs#realpath`, which also matches `fs.promises.realpath`, through a named or a namespace import, and `fs/promises`), an npm package or its export (`npm:electron`, `npm:electron#systemPreferences`), a property of a global object that no local declaration shadows (`global:process.platform`), or a string literal in code, not in types (`literal:win32`). The analyzer records the signals that the configuration names; the nodes for Node.js modules, package exports, globals and literals are leaves that no change seeds, so they never change what `unit` and `integration` select. The signals of vscode.jsonc read the current operating system (`isWindows`, `OS`, `process.platform`). Naming one does not (`OperatingSystem.Windows`, `'win32'`): code that compares a value with one is tested on Linux with every value, and tests that pin one with it, such as `env: { OS: OperatingSystem.Windows }`, behave the same everywhere.

The initializer of a test file is all of its suites, so changing one test would make the whole file use what any test uses. For this analysis only, the analyzer splits the initializer into its test cases (the `test(...)` and `it(...)` statements, also as `test.skip` or `(isWindows ? test.skip : test)`), each with a hash of its own code and of the imports it uses, and the references of that code, of the code that decides whether it runs (the conditions and suite calls around it, such as `if (isWindows) { suite(...) }` or `(isWindows ? suite : suite.skip)(...)`) and of the suite's helper functions it calls. When the code outside the test cases (suite setup, helpers, those conditions) did not change, only the changed test cases count; adding a test case changes nothing else. When none changed, as when a file that the test reads by path changed, the whole initializer counts.

Extensions are not part of the module graph, which they would change: `modules` lists the files that the analysis reads on their own instead. A changed declaration of one that uses a signal (or a `testSignals` signal, in test code that `moduleTests` names, by test case like the tests of the graph), directly or through the declarations of its own file, runs the tests of its package (the closest folder with a `package.json`, such as `extensions/git`) there. Its imports of other files count by name (`extensions/git/src/util.ts#isWindows`), not by what those files use.

`ripple plan --out-dir` also writes the tests of each operating system to `win32.txt` and `darwin.txt`, unless it runs every test, and on GitHub Actions the outputs `win32-unit`, `win32-e2e`, `darwin-unit` and `darwin-e2e`, and a section of the job summary that explains each decision. CI does not read them yet: the macOS and Windows jobs still run the `unit.txt` and `integration.txt` of every change.

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

# JSON plan for CI: the unit and integration test files to run. `--out-dir <dir>` also writes
# plan.json and, when only the selected files should run, unit.txt and integration.txt, and the
# test files that each operating system runs (win32.txt and darwin.txt, see Platform analysis); on
# GitHub Actions it writes the outputs `select`, `win32-unit`, `win32-e2e`, `darwin-unit` and
# `darwin-e2e`, and a job summary.
./target/release/ripple plan --config vscode.jsonc --base "$(git merge-base origin/main HEAD)" --head HEAD --out-dir ../../.build/test-plan

# Replay first-parent history and compare selection strategies. `--platforms 1` adds how often each
# operating system runs its tiers, and which rules and signals make it.
./target/release/ripple replay --config vscode.jsonc --since 2026-10-06 --until origin/main --out replay.jsonl --hubs 1 --platforms 1

# Culprit finding: the commits in a range whose changes can affect a failing test
./target/release/ripple blame --config vscode.jsonc --test src/vs/.../foo.test.ts --since <last green> --until <first red>

# Why a change selects a test: a path from the test's code to what the change changed, through the
# declarations, whole modules, packages and globals in between
./target/release/ripple why --config vscode.jsonc --test src/vs/.../foo.test.ts --base "$(git merge-base origin/main HEAD)" --head HEAD

# Why a change runs tests on Windows (or macOS: darwin), and with --test, why it runs that test
# there: down to the signal that the changed code uses
./target/release/ripple why --config vscode.jsonc --platform win32 [--test src/vs/.../foo.test.ts] --base "$(git merge-base origin/main HEAD)" --head HEAD

# Recall of the platform analysis on labeled CI failures: whether each change runs the tier that
# failed on that operating system, and which rules alone catch which failures
./target/release/ripple eval --config vscode.jsonc --labels os-only-failures.json
```

All commands accept `--repo <path>`. oxc requires Rust 1.97 or newer; `rust-toolchain.toml` pins the version CI uses.

Selection works per declaration, so what an edit selects depends on what it changes. Comments, formatting and types select nothing, except in files that code reads by path. A change to a function body selects the tests that can reach that function: changing `MoveCaretCommand.getEditOperations` selects only `moveCarretCommand.test.ts`, while changing the static `Position.isBefore`, which most of the editor uses, selects 836 test files (file-level analysis would select 1,077, or 1,531 counting type-only imports). A change to a file that every unit test depends on (`runEverything`) lists every test and prints the reason; one that only the integration tests depend on (`runEveryIntegrationTest`) lists every integration test. `affected` lists unit and integration tests; `plan` lists the unit and integration tests that macOS and Windows would run, separately (`unit` and `integration` in plan.json), and each test runner then runs the listed files it supports.

## Validation

- **Replay of 708 merged pull requests** (first-parent commits on `main`, Oct 13 to 20, 2026), share of unit test work each one selects (weighted by the number of tests in each file, run everything counted as 100%):

  | Selection | Mean | Median | p90 | Selects nothing |
  | --- | --- | --- | --- | --- |
  | Today: everything | 100% | 100% | 100% | 0% |
  | File-level imports, including types | 21.5% | 8.0% | 66.4% | 12.6% |
  | File-level runtime loads | 13.2% | 2.9% | 40.0% | 12.6% |
  | **ripple, declaration-level** | **9.1%** | **2.0%** | **24.1%** | **13.4%** |

  16 of the 708 commits needed everything: 12 changed the unit test job definitions, 2 the test runners, 1 the transpiler and 1 `.npmrc`.
- **Recall on real CI failures.** 75 pull request runs with failing Linux unit test jobs (Oct 17 to 20): the failing test files were taken from the job logs and checked against what ripple selects for the pull request's own change. Of 36 failures caused by the pull request, ripple selected 34. The two misses were tests that only passed because other test files had leaked registrations into a global registry earlier in the same process; the pull request (a test-only change) stopped the leak. Two further Linux-only misses were timing flakes unrelated to their change. A test failing on 31 unrelated branches at the same time (a broken `main`) was correctly not attributed to those pull requests.
- **Culprit finding.** On Oct 19, `main` broke through a semantic conflict between two pull requests that each passed the full matrix (#342479, then #342104). `ripple blame` over the 55 commits merged that day returned 4 candidates in 18 seconds, including both halves of the conflict.

- **Platform analysis**, replaying 918 first-parent commits of Oct 20 to 29 (`replay --platforms 1`), and the 38 groups of macOS- and Windows-only CI failures that pull requests caused in Oct 9 to 29, labeled from job logs and fixes (`eval --labels`; 64 of their 70 failed jobs have both commits available):

  | | Unit tier runs | E2E tier runs | Recall: OS semantics | Recall: CI and runners |
  | --- | --- | --- | --- | --- |
  | Today | 100% | 100% | 21 of 21 | 4 of 4 |
  | `platforms` with every rule as first specified | 73.7% | 11.1% | 18 of 21 | 4 of 4 |
  | **`platforms` of vscode.jsonc** | **38.2%** | **11.1%** | **18 of 21** | **4 of 4** |

  The unit tier runs on Windows for 37.8% of the commits, on macOS for 30.3%. 7.0% of the commits run everything (`runEverything`); the rules run the unit tier for 33.6% of the others, and then Windows runs 2.3% of the unit test work on average (median 0.6%). OS semantics are path separators and drive letters (8 of 11 caught), process spawning and quoting (4 of 4), CRLF (2 of 2), file permissions, file identity, case-insensitive file systems and Electron window integration (1 of 1 each). The three misses are two tests in `browser/` layers that build POSIX paths (`testLayers` excludes them: changed tests in every layer would run the unit tier much more often) and a Copilot SDK update that only changed a data file. Failures from slower runners (6 groups) and browser engines (6) are not platform semantics; the rules catch 6 and 2 of them by chance. Two changes to the rules come from these numbers: selected tests that use a signal (`selectedTest`) ran the unit tier on their own for 30% of the commits and caught no failure that the other rules miss, so `selectedTestSignals` is empty; and the initializer of a test file counts by test case, which took the unit tier from 44.3% to 38.2% without losing a failure. The plan's selection does not change: `unit` and `integration` are the same on every replayed commit. The analysis takes 24 ms per commit.

## Known limits

- Static selection cannot see dependencies through shared mutable global state between test files (registries populated by one test and read by another, or by the modules that the test runners load), dynamic property access with computed names, files read with paths computed without a static folder (`join(dir, name)` with a `dir` from elsewhere, unless the folder's name appears in a string), or module state or a global mutated through an alias (`const list = state.items; list.push(x)`, `const proto = Array.prototype; proto.last = f`) or by a method of a local value whose members are not tracked. Linux running every unit test on every push, and the full matrix after merge, are the safety net; an isolation sweep that runs each test file alone finds tests relying on such leaks.
- Files outside the module graph are only as complete as `runEverything` and `runEveryIntegrationTest` in [vscode.jsonc](vscode.jsonc): a new file that every unit test depends on (a new launcher, a new transpile step), or that only the integration tests depend on, must be added there. ripple follows the relative imports of the listed scripts, but not the files they load by computed paths (`build/gulpfile.ts` loads the `gulpfile.*.ts` files through a glob).
- Modules named by a path relative to the output folder without a path alias are not found: `FileAccess.asFileUri('bootstrap-fork')` names `src/bootstrap-fork.ts`, which the code that starts the pty host, the file watcher and the Agent Host forks, and so do two integration tests (`ipc.cp` and `processes`). So [vscode.jsonc](vscode.jsonc) lists `src/bootstrap-*.ts` in `runEveryIntegrationTest`: changing one runs every integration test, but selects no unit test through that path. A `"bootstrap-": "src/bootstrap-"` path alias would select exactly the tests that reach this code, but `src/bootstrap-meta.ts` reads `package.json` with `require`, so every `package.json` change would then select them too: on 303 commits of `main`, 9 commits would select more unit tests, 3 of them `package.json`-only changes that would go from 3 to 16 test files.
- Moving a method changes nothing, although `Object.getOwnPropertyNames(C.prototype)` lists methods in source order. Methods are not enumerable, so only code that asks for own property names sees the order, and no test does. Counting the order would select the users of a class whenever a method moves: on 708 commits of `main`, 44 commits would select more tests.
- Methods that code outside the analysis calls are only found through `extends` and `implements`. An object that only matches the shape of a package's interface, without declaring it, keeps its methods gated by name.
- A string that only looks like a path selects a few extra tests. A computed path stands for every data file it can name: the diffing fixture test displays file names as `` `./${name}` ``, so editing the diffing `README.md` selects it. A path from the root reads its file: the fake tree of `githubFileSystemProvider.test.ts` lists `'src/main.ts'`, so every edit of `src/main.ts`, even of a comment, selects that test. A relative or path alias string that names a module stands for what the module loads, as an entry point does, also where it is only an expected value, such as `'vs/platform/agentHost/node/agentHostMain'` in `nodeAgentHostStarter.test.ts`.
- A path from the root never reaches what the module it names loads, so code that runs a module through a path computed from the repository root (`fork(join(root, 'src/worker.ts'))`) does not depend on that module's dependencies. The unit tests run the compiled modules in `out`, which is not in the repository, so no path from the root names one.
- Selected test files that no longer exist (deleted or renamed tests) are dropped from the plan; their surviving dependents are still found through the base snapshot.
- Only unit tests and integration tests (the node.js integration tests and the Agent Host E2E suites) are selected. The extension host, browser, remote and smoke suites run in full.
- The platform analysis only sees what code uses, not timing on slower runners, rendering or browser engines, or file locking. A signal that a test reaches through state that another test set up, or through `setup` code of its suite that did not change, does not count. Removed test code does not run, so it uses nothing. A test case is a `test(...)` or `it(...)` statement in the initializer of a test file: test cases that a helper function at the top level of the module defines, or that a loop creates, count as the code outside test cases, so changing one counts the whole initializer. Platform modules are analyzed one file at a time: what the files they import use does not count.
