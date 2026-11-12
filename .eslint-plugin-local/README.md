# Custom lint rules

We use a set of custom lint rules, which [oxlint](https://oxc.rs/docs/guide/usage/linter.html) runs with its ESLint-compatible plugin API, to enforce repo specific coding rules and styles. These custom rules are run in addition to many standard ESLint rules we enable in the project. Some example custom rules includes:

- Enforcing proper code layering
- Preventing checking in of `test.only(...)`
- Enforcing conventions in `vscode.d.ts`

Custom rules are mostly used for enforcing or banning certain coding patterns. We tend to leave stylistic choices up to area owners unless there's a good reason to enforce something project wide.

This doc provides a brief overview of how these rules are setup and how you can add a new one.

# Resources
- [Writing JS plugins for oxlint](https://oxc.rs/docs/guide/usage/linter/writing-js-plugins.html) — How oxlint runs ESLint-style rules, and which APIs it supports
- [ESLint rules](https://eslint.org/docs/latest/extend/custom-rules) — General documentation about writing eslint rules
- [TypeScript ASTs and eslint](https://typescript-eslint.io/blog/asts-and-typescript-eslint/) — Look at how ESLint works with TS programs
- [ESTree selectors](https://eslint.org/docs/latest/extend/selectors)  — Info about the selector syntax rules use to target specific nodes in an AST. Works similarly to css selectors.
- [TypeScript ESLint playground](https://typescript-eslint.io/play/#showAST=es) — Useful tool for figuring out the structure of TS programs and debugging custom rule selectors


# Custom Rule Configuration

Custom rules are defined in the `.eslint-plugin-local` folder. Each rule is defined in its own TypeScript file. These follow the naming convention:

- `code-RULE-NAME.ts` — General rules that apply to the entire repo.
- `vscode-dts-RULE-NAME.ts` — Rules that apply just to `vscode.d.ts`.

These rules are then enabled in the `eslint.config.js` file. This is the main eslint configuration for our repo. It defines a set of file scopes which rules should apply to files in those scopes.

For example, here's a configuration that enables the no `test.only` rule in all `*.test.ts` files in the VS Code repo:

```ts
{
    // Define which files these rules apply to
    files: [
        '**/*.test.ts'
    ],
    languageOptions: { parser: tseslint.parser, },
    plugins: {
        'local': pluginLocal,
    },
    rules: {
         // Enable the rule from .eslint-plugin-local/code-no-test-only.ts
        'local/code-no-test-only': 'error',
    }
}
```

# Creating a new custom rule
This walks through the steps to create a new lint rule (see [AGENTS.md](AGENTS.md) for how to keep it fast):

1. Create a new rule file under `.eslint-plugin-local`. Generally you should call it `code-YOUR-RULE-NAME.ts`, for example, `.eslint-plugin-local/code-no-not-null-assertions-on-undefined-values.ts`

2. In this file, add the rule. Here's a template:

    ```ts
    /*---------------------------------------------------------------------------------------------
    *  Copyright (c) Microsoft Corporation. All rights reserved.
    *  Licensed under the MIT License. See License.txt in the project root for license information.
    *--------------------------------------------------------------------------------------------*/

    import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';

    export default new class YourRuleName implements CreateRule {

        readonly meta: RuleMeta = {
            messages: {
                customMessageName: 'message text shown in errors/warnings',
            },
            schema: false,
        };

        create(context: Context): Visitor {
            return {
                [SELECTOR]: (node: ESTree.Node) => {
                    // Report errors if needed
                    return context.report({
                        node,
                        messageId: 'customMessageName'
                    });
                }
            };
        }
    };
    ```

    - Update the name of the class to match the name of your rule
    - Add message entries for any errors you want to report
    - Update `SELECTOR` with the [ESTree selector](https://eslint.org/docs/latest/extend/selectors) needed to target the nodes you are interested in. Use the [TypeScript ESLint playground](https://typescript-eslint.io/play/#showAST=es) to figure out which nodes you need and debug selectors

3. Register the rule in `eslint.config.js`

    Generally this is just turning on the rule in the rule list like so:

    ```js
    rules: {
         // Name should match file name
	'local/code-no-not-null-assertions-on-undefined-values': 'warn',
        ...
    }
    ```

Rules can also take custom arguments. For example, here's how we can pass arguments to a custom rule in the `eslint.config.js`:

```
rules: {
    'local/code-no-not-null-assertions-on-undefined-values': ['warn', { testsOk: true }],
    ...
}
```

In these cases make sure to update the `meta.schema` property on your rule with the JSON schema for the arguments. You can access these arguments using `context.options` in the rule `create` function

# Running the rules with oxlint

The rules run with [oxlint](https://oxc.rs/docs/guide/usage/linter.html): in CI, in the pre-commit hook, in the Copilot extension's `pnpm run lint`, in the editor with the recommended oxc extension (`oxc.oxc-vscode`), and in the rule tests, with oxlint's `RuleTester` (`oxlint/plugins-dev`). The rules use the ESLint-compatible plugin API of oxlint, with the types of `@oxlint/plugins` (import them with `import type`); no ESLint package is installed. `pnpm run oxlint` lints the full repository, the given files, or with `--changed-since <ref>` the files that changed since `ref`, and reports in ESLint's compact format.

There is one configuration: [oxlint.config.ts](../oxlint.config.ts) converts `eslint.config.js`, which keeps ESLint's flat configuration format (blocks of `files`, `ignores` and `rules`), when oxlint loads it (see `build/lib/oxlintConfig.ts`). oxlint implements ESLint's core rules and the `@typescript-eslint` and `jsdoc` rules natively, and loads the other plugins as JS plugins, which run on one thread per process; `build/oxlint.ts` therefore splits a full run into several processes by folder, and lints the extensions that use type information in a separate process with `--type-aware`. To check which rules apply to a file, tests use `getRepositoryFileRules` from `build/lib/oxlintConfig.ts`.

`compat/` has our implementations of the rules of third-party ESLint plugins that oxlint does not implement, under the names that `eslint.config.js` and the disable directives use. Each implements only the options that `eslint.config.js` uses, and reports what the original reported:

- `eslint-js/*`: ESLint's `no-restricted-syntax` and `no-buffer-constructor`.
- `ts-eslint-js/*`: typescript-eslint's `naming-convention` and `no-restricted-imports` (oxlint's own `no-restricted-imports` ignores the configured messages).
- `header/header`: `eslint-plugin-header`.
- `jsdoc-js/*`: the rules of `eslint-plugin-jsdoc` that oxlint does not implement (oxlint reserves `jsdoc` for its own).
- `@stylistic/*`: `semi`, `no-extra-semi`, `comma-dangle` and `member-delimiter-style`.

A rule of a plugin that oxlint cannot load fails the conversion, and a rule that oxlint does not know fails oxlint, so a rule never silently stops running. oxlint does not support configuring rules in comments (`/* eslint rule: "warn" */`).

## Agent host metadata boundary

`local/code-no-private-agent-host-meta-import` keeps `src/vs/platform/agentHost/common/meta/copilotd/` and `meta/vscode/` private. Feature code must import domain helpers and portable types from top-level `meta/*.ts` modules, even for type-only imports. Top-level modules can adapt either private implementation; each private implementation can import only its own private folder. Files under `test/` directories may import raw metadata for parsing/vector tests, and `build/agentHost/generateCopilotMetadata.ts` may access the generated schema.

The rule checks static imports, re-exports, import types, literal dynamic imports, and literal `require` calls, resolving relative paths and `vs/` aliases. Run its tests with `node --test .eslint-plugin-local/tests/code-no-private-agent-host-meta-import.test.ts`.

## Restricted import paths

`local/code-no-restricted-path-imports` reports imports whose resolved repository path matches one of its `paths` globs, with that entry's `message`. It resolves relative paths, absolute paths and `vs/` aliases before matching (with Windows path semantics on Windows, so drive letters and UNC host/share names compare case-insensitively), so non-canonical specifiers such as `./../..//sessions/x.js` are caught, and an unrelated folder with the same name is not. The rule checks static imports, re-exports, import types, `import x = require()`, and dynamic `import()` and `require()` calls whose argument is a string literal or a template literal without substitutions. Only an unbound (global) `require` is checked; a locally declared `require` is not. Node modules are ignored. Computed or variable dynamic imports, such as ``import(`../${name}.js`)``, can't be resolved statically and are not enforced. Use the ESLint configuration's `files` and `ignores` to choose the importing files.

It keeps `src/vs/workbench/contrib/chat/` from importing `src/vs/workbench/contrib/sessions/`, because Sessions depends on chat and never the reverse. Existing violations are listed in that configuration block's `ignores` and should be removed from the list once they are fixed ([#346756](https://github.com/microsoft/vscode/issues/346756)). Run its tests with `node --test .eslint-plugin-local/tests/code-no-restricted-path-imports.test.ts`.

## Restricted import zones

`local/code-no-restricted-zone-imports` replaces `import/no-restricted-paths` and takes the same options: `{ zones: [{ target, from, except?, message? }], basePath? }`. In a file that matches a zone's `target`, it reports each import whose resolved path matches one of the zone's `from` paths and none of its `except` paths, with `Unexpected path "<specifier>" imported in restricted zone.` followed by the zone's `message`. A path that contains glob characters is a minimatch glob, and extglobs such as `extensions/copilot/src/!(lib)/**` work; any other path matches itself and everything below it. As in `import/no-restricted-paths`, the exceptions of a glob are globs, and the exceptions of a directory are relative to that directory. Paths are relative to `basePath`, which defaults to the repository root rather than the current working directory, and are matched as `/`-separated repository-relative paths, so the rule behaves the same on Windows.

`import/no-restricted-paths` resolved imports through the filesystem, which can't resolve extensionless TypeScript imports, so it silently skipped most of them. This rule resolves relative specifiers by path arithmetic instead, without filesystem access. Bare specifiers, such as packages and tsconfig path aliases like Copilot's `vscode`, are not checked. The rule checks static imports and re-exports (including `import type`), `import x = require()`, and dynamic `import()` and `require()` calls whose argument is a string literal.

It enforces the rules between folders of `extensions/copilot/src` and `extensions/copilot/test`, such as `platform` not importing `extension`. Copilot's layers (`common`, `vscode`, `node`, `vscode-node`, `worker` and `vscode-worker`) are enforced by `local/code-layering`, the same rule that enforces VS Code's layers, configured with Copilot's extra layer names. `local/code-layering` looks for layer folders below the repository root only, so the name of the checkout doesn't matter, and it checks static imports, re-exports, `import x = require()`, and dynamic `import()` and `require()` calls whose argument is a string literal; run its tests with `node --test .eslint-plugin-local/tests/code-layering.test.ts`. The layering violations that already existed when it replaced `import/no-restricted-paths` are suppressed on their lines and should be fixed over time. Run its tests with `node --test .eslint-plugin-local/tests/code-no-restricted-zone-imports.test.ts`.

## PascalCase class names

`local/code-class-name-pascal-case` requires class names to be PascalCase as typescript-eslint defines it: the first character is not lowercase, and the name has no underscores. It replaces `@typescript-eslint/naming-convention` configured with `{ selector: 'class', format: ['PascalCase'] }`, with the same message, because that rule's general selector matching is expensive to run on every TypeScript file. Anonymous class expressions are not checked. The terminal contributions turn it off, because their full naming convention configuration (`ts-eslint-js/naming-convention`) already checks class names. Run its tests with `node --test .eslint-plugin-local/tests/code-class-name-pascal-case.test.ts`.


## Asynchronous production filesystem operations

`local/code-no-sync-fs` rejects synchronous Node filesystem calls in core and built-in extension production code, including `original-fs` and the synchronous `pfs` helpers. It follows named and namespace imports, local aliases, destructuring, literal `require`/dynamic imports, and `createRequire` bindings. Tests, development scripts, top-level `src/` bootstrap files, the Electron main entry point, the AMD loader, and the isolated desktop/server CLI and Git askpass entry points are excluded by the ESLint configuration.

The configuration also excludes the synchronous helper implementations in `pfs.ts` and designated core startup/shutdown files: `wait.ts`, `remoteExtensionHostAgentServer.ts`, `server.main.ts`, `extHostCLIServer.ts`, `extHostExtensionService.ts`, and `extHostStoragePaths.ts`. These are exact-file exclusions, not directory exclusions; production callers of synchronous `pfs` helpers remain checked.

**Do not disable this rule unless absolutely necessary.** Synchronous filesystem calls block the event loop and can stall unrelated work throughout the process. Use `fs/promises` or the existing asynchronous filesystem helpers; difficulty propagating `async` is not by itself a justification for disabling the rule.

Existing suppressions document audited legacy constraints and deferred work, not permission to add more synchronous calls. Outside the designated startup/shutdown exclusions, an unavoidable exception must be limited to the call site, with an explanatory `eslint-disable-next-line local/code-no-sync-fs -- ...` comment stating why asynchronous I/O cannot be used. Do not exempt additional runtime services. Deferred runtime conversions must identify the contract or ordering that needs review.

Justifications must explain the concrete failure or lifecycle constraint an async replacement would introduce, not merely describe the synchronous operation. Temporary migration TODOs must name the readiness, sequencing, or ownership change needed to remove the suppression; they do not establish that synchronous I/O is permanently required.

Run the rule and configuration tests with `node --test .eslint-plugin-local/tests/code-no-sync-fs.test.ts`. Custom rule tests also run in CI through `pnpm run test-build-scripts`.

(Written by Copilot)

## Adding fixes to custom rules
Fixes are a useful way to mechanically fix basic linting issues, such as auto inserting semicolons. These fixes typically work at the AST level, so they are a more reliable way to perform bulk fixes compared to find/replaces.

To add a fix for a custom rule:

1. On the `meta` for your rule, add `fixable: 'code'`

2. When reporting an error in the rule, also include a `fix`. This is a function that takes a `fixer` argument and returns one or more fixes.

See the [Double quoted to single quoted string conversion fix](https://github.com/microsoft/vscode/blob/b074375e1884ae01033967bf0bbceeaa4795354a/.eslint-plugin-local/code-no-unexternalized-strings.ts#L128) for an example. The ESLint docs also have [details on adding fixes and the fixer API](https://eslint.org/docs/latest/extend/custom-rules#applying-fixes).

The fixes can be run using `pnpm exec eslint --fix` in the VS Code repo.

## Tests nested inside tests

`local/code-no-nested-test` reports a `test(...)` or `suite(...)` declared inside the body of another test. Mocha only collects tests while a suite runs, so a test registered from within a running test is silently dropped and never runs. This is almost always a misplaced closing brace. Only Mocha's globals are checked: a local helper named `test` is ignored, and so is anything imported from `node:test`, which runs a nested test as a subtest. Run its tests with `node --test .eslint-plugin-local/tests/code-no-nested-test.test.ts`.

## Polling a timer in a loop

`local/code-no-timeout-polling-loop` reports loops in unit tests that wait for a state change by sleeping on a timer, for example `for (let i = 0; i < 100 && !done; i++) { await timeout(1); }`, `while (!done) { await new Promise(r => setTimeout(r, 5)); }`, or a fixed number of `await timeout(0)` ticks. Such a loop's time budget depends on timer clamping (about 4ms for nested timers in Electron) and machine load, so it is flaky on slow or oversubscribed machines. A bounded loop that runs out also continues silently with stale state, so the test fails later at an unrelated assertion. Await a signal for the state change instead: a `DeferredPromise`, `Event.toPromise(...)`, `waitForState(...)`, or the promise of the operation itself. For code driven by timers, use `runWithFakedTimers`.

Only loops that do nothing but wait are reported: the body consists solely of awaited sleeps (`timeout`, `sleep`, `delay`, `wait`, the awaited `setTimeout` of `timers/promises`, or a `new Promise` whose executor only resolves on a `setTimeout`), exit guards such as `if (done) { break; }`, and declarations or assignments of reads such as `const state = await db.read();`. Calls count as reads only by name (`get…`, `is…`, `has…`, `find`, `filter` and similar); any other call counts as work. Loops that do work between sleeps or before a `continue`, such as streaming mock data or a parameterized test, are not reported. Loops within a `runWithFakedTimers` callback, where time is virtual, are not reported either, unless the callback passes `useFakeTimers: false`. The rule is enabled for `src/vs/**/*.test.ts`. Files that already polled when it was introduced are listed in its `exclude` option and should be removed from the list once they are fixed. Run its tests with `node --test .eslint-plugin-local/tests/code-no-timeout-polling-loop.test.ts`.

## Prefer events and observables over callback dependencies

`local/code-prefer-event-or-observable` suggests an `Event` for notifications or an `IObservable` for changing values instead of accepting caller-owned behavior through a callback parameter. An injected service or a return value may fit other behavior better. The rule has no automatic fix because replacing a callback changes the API and its lifecycle.

The rule is opt-in. Enabling it checks class constructors and public methods by default, including parameter properties, optional and nullable callbacks, and inline function defaults. Public-method checks include implicit-public, static, abstract, and function-valued class properties, as well as interface/object-type method signatures. Private and protected methods are excluded. Use `['warn', { checkPublicMethods: false }]` to check only constructors.

Enable it for a chosen area in `eslint.config.js`, or use an ESLint directive in an individual file:

```js
{
	files: ['src/vs/workbench/contrib/myFeature/**/*.ts'],
	rules: {
		'local/code-prefer-event-or-observable': 'warn',
	},
}
```

For an individual file, add `/* eslint local/code-prefer-event-or-observable: "warn" */`.

Detection is syntax-only: it recognizes function types, callable object types, same-file callback type aliases and callable interfaces, and untyped parameters with inline function defaults. Imported callback aliases and inferred callback types are not resolved. Callback properties nested in options objects are outside its scope. `Event` and observable parameters remain valid, and ordinary callback call sites such as collection operators, Promise executors, and event/observable subscriptions are not inspected.

Run its tests with `node --test .eslint-plugin-local/tests/code-prefer-event-or-observable.test.ts`.
