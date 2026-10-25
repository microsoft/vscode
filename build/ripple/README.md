# ripple

A content-addressed change impact engine for TypeScript repositories, written in Rust on top of [oxc](https://oxc.rs). Given two commits, it computes which test files a change can affect, at the level of individual declarations, in about a second.

It is a prototype for running far fewer CI minutes on pull requests: instead of running every suite on every push on three operating systems, CI asks ripple what the change can affect and runs only that.

## In pull request CI

The `Detect Changes` job of [pr.yml](../../.github/workflows/pr.yml) runs `ripple plan --config build/ripple/vscode.jsonc --base HEAD^1 --head HEAD --out-dir .build/unit-test-plan` on the pull request's merge commit, uploads the plan as the `unit-test-plan` artifact and writes a summary to the job page. Linux runs every unit test on every push; the macOS and Windows unit test jobs download the artifact and pass its `unit.txt` to each test runner with `--runList`. Each runner runs the tests it would run by default, but only from the listed files (see [test/unit/README.md](../../test/unit/README.md)), so ripple needs no knowledge of the runners. When the plan selects no file, those jobs are skipped instead of setting up to run nothing (the `selected-unit-tests` output of `Detect Changes`). They run every unit test when planning fails, when the artifact cannot be downloaded, or when the change touches a file that every unit test depends on (`runEverything` in the configuration); otherwise they run the selected files, however many. The planning steps never fail `Detect Changes`, which a broken ripple must not block. When ripple fails to build, pass its tests or plan, the `Ripple` check fails for pull requests that change `build/ripple`; it is skipped for the others, which show a warning. So does a module that ripple cannot parse, which disables selection. The binary is cached by its sources; [pr-ripple.yml](../../.github/workflows/pr-ripple.yml) builds it on `main` when they change, and checks daily that the cache still exists.

## Configuration

The Rust code knows TypeScript, JavaScript, npm and git, and nothing about this repository. Everything repository-specific is in [vscode.jsonc](vscode.jsonc), which every command reads with `--config`:

- `modules`: the files to analyze (`src/**/*.ts`); every other file is an opaque node.
- `pathAliases`: non-relative specifiers that name repository files (`vs/` is `src/vs/`).
- `tests`: the unit and integration test files, and the scripts that run the unit tests (`runners`).
- `runEverything`: files outside the module graph that every unit test depends on, such as the test runners, the transpile pipeline and its npm packages (`build/package*.json`), compiler options, runtime versions and the unit test job definitions, by the reason the plan reports. So do the scripts that the listed scripts load through relative imports, such as `build/lib/electronVersion.ts`, which `build/lib/electron.ts` loads. Changes to ripple or its configuration also run everything.
- `packages`: npm packages that build or run every test but that no `runEverything` script loads, such as a command line tool (`toolchain`: ripple finds the packages those scripts load itself), npm scripts the unit test jobs run (`testScripts`), and `package.json` fields no test reads (`ignoredFields`).
- `injectedGlobals`: files the test runners expose as globals (`globalThis._VSCODE_PRODUCT_JSON` is `product.json`).
- `pure`, `implicitMethods` and `moduleLoaders`: the repository's conventions that refine the analysis: functions and objects whose calls have no side effects (`localize`, `URI`), methods called without naming them (`dispose`), and functions that load the module or package their first argument names, like `require` (`importAMDNodeModule`).

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
   - Path strings: relative or starting with a path alias (worker entry points, fixture folders), or naming an existing repository file or folder from the root (such as a grammar a test reads, `'extensions/json/syntaxes/JSON.tmLanguage.json'`). Also dynamic imports, `require` and the configured module loaders, and the globals the test runners inject.
   - Test data folders: the folders next to test files that contain no module, such as `__snapshots__` and `fixtures`. Tests read them by a path they compute, so the folder's name appears in a string or template literal of the test, or of a module it loads: a snapshot helper's `'__snapshots__'`, or the `test-cases` of `` `${dir}${sep}test-cases${sep}${name}` ``. Those tests depend on the folder. No configuration names the folders.
   - Computed paths: a template literal whose static start names a folder reads the data files (not modules) of that folder that have the template's static start and end, such as the keyboard mapper's layouts and golden files through `` `vs/workbench/services/keybinding/test/node/${file}.js` `` and `` `vs/workbench/services/keybinding/test/node/${file}` ``, or the webview's `pre/index.html` through `` `vs/workbench/contrib/webview/browser/pre${uri.path}` ``. A name like `` `./file${i}.ts` `` names no data file and reads nothing. The folder must exist and be at least three levels deep, so `` `src/${name}` `` reads nothing.
3. **Link** all modules into one graph (about 160k nodes and 500k edges for this repository), with npm packages and injected globals as nodes of their own. The whole tree analyzes in about 0.5 s and links in about 0.1 s on an 18-core machine.
4. **Select.** Changed nodes are the declarations whose hash changed between the two snapshots, plus:
   - npm packages whose resolved version or install script permission (`allowScripts`) changed, from a field-level diff of `package.json` and `package-lock.json`, with the packages that depend on them according to the lockfile (also when only `package.json` changed), and injected globals whose file changed. A change to a package that a `runEverything` script loads, such as the test runners' web server, runs every unit test;
   - files under folders that tests read by path (fixtures), under a test data folder (snapshots), or that a computed path can name (golden files);
   - module initializers whose evaluation runs other modules with global load-time effects or npm packages, or the same ones in another order: the modules a module loads are evaluated depth-first in source order, each once, so loading a module directly that a later import loaded before moves its effects earlier.

   A module that does not parse has no dependencies, so it runs every unit test. So does a change that reaches what the test runners (`tests.runners`) use of the modules that they name by a path alias, such as `assertCleanState` of `'vs/workbench/test/common/utils'`, which the Electron renderer calls in every run, or the protocol handlers that the Electron main process serves tests with: tests cannot import these dependencies.

   A reverse traversal gives the candidate tests; each candidate is then confirmed by a forward traversal that only enters an instance method once the traversal has seen its name used (`x.send()`, `{ send } = x`, `'send'`). This keeps a test that merely constructs a large service from depending on every one of its methods. Code outside the analysis calls methods by names that the analyzed code may never use: Node.js streams call `_flush`, the DOM calls `connectedCallback`, an npm package calls the methods of its interfaces. So reaching a class reaches all of its methods when it extends or implements something that is not analyzed (a global, a Node.js module or an npm package), directly, through its analyzed superclasses, or through analyzed types that re-export one, alias it or extend it.

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
# and a job summary.
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
  | File-level imports, including types | 21.3% | 7.8% | 66.5% | 13.6% |
  | File-level runtime loads | 13.2% | 2.8% | 40.1% | 13.6% |
  | **ripple, declaration-level** | **9.0%** | **1.9%** | **24.1%** | **14.5%** |

  16 of the 708 commits needed everything: 12 changed the unit test job definitions, 2 the test runners, 1 the transpiler and 1 `.npmrc`.
- **Recall on real CI failures.** 75 pull request runs with failing Linux unit test jobs (Oct 17 to 20): the failing test files were taken from the job logs and checked against what ripple selects for the pull request's own change. Of 36 failures caused by the pull request, ripple selected 34. The two misses were tests that only passed because other test files had leaked registrations into a global registry earlier in the same process; the pull request (a test-only change) stopped the leak. Two further Linux-only misses were timing flakes unrelated to their change. A test failing on 31 unrelated branches at the same time (a broken `main`) was correctly not attributed to those pull requests.
- **Culprit finding.** On Oct 19, `main` broke through a semantic conflict between two pull requests that each passed the full matrix (#342479, then #342104). `ripple blame` over the 55 commits merged that day returned 4 candidates in 18 seconds, including both halves of the conflict.

## Known limits

- Static selection cannot see dependencies through shared mutable global state between test files (registries populated by one test and read by another, or by the modules that the test runners load), dynamic property access with computed names, files read with paths computed without a static folder (`join(dir, name)` with a `dir` from elsewhere, unless the folder's name appears in a string), or module state or a global mutated through an alias (`const list = state.items; list.push(x)`, `const proto = Array.prototype; proto.last = f`) or by a method of a local value whose members are not tracked. Linux running every unit test on every push, and the full matrix after merge, are the safety net; an isolation sweep that runs each test file alone finds tests relying on such leaks.
- Files outside the module graph are only as complete as `runEverything` in [vscode.jsonc](vscode.jsonc): a new file that every unit test depends on (a new launcher, a new transpile step) must be added there. ripple follows the relative imports of the listed scripts, but not the files they load by computed paths (`build/gulpfile.ts` loads the `gulpfile.*.ts` files through a glob).
- Moving a method changes nothing, although `Object.getOwnPropertyNames(C.prototype)` lists methods in source order. Methods are not enumerable, so only code that asks for own property names sees the order, and no test does. Counting the order would select the users of a class whenever a method moves: on 708 commits of `main`, 44 commits would select more tests.
- Methods that code outside the analysis calls are only found through `extends` and `implements`. An object that only matches the shape of a package's interface, without declaring it, keeps its methods gated by name.
- A computed path stands for every data file it can name, so a string that only looks like a path selects a few extra tests: the diffing fixture test displays file names as `` `./${name}` ``, so editing the diffing `README.md` selects it.
- Selected test files that no longer exist (deleted or renamed tests) are dropped from the plan; their surviving dependents are still found through the base snapshot.
- Only unit tests are selected. Integration, smoke and extension host suites run in full.
