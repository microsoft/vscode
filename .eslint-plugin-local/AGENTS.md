# Writing lint rules

See [README.md](README.md) for how to add a rule. The rules here run in oxlint (CI, the pre-commit hook, `pnpm run oxlint`, the oxc editor extension and the rule tests, through oxlint's `RuleTester`), which loads them as JS plugins. They use oxlint's ESLint-compatible rule API with the types of `@oxlint/plugins`, imported with `import type`, and `eslint.config.js` configures them. Don't add a dependency on ESLint packages.

## Keep rules fast

oxlint runs all JS plugin rules of a process on one thread, and the rules run on every file, so a few microseconds per node add up to seconds per run. Profiles of a full run showed most of the JS time going to the patterns below, not to what the rules check.

- **Listen to rare node types, not selectors on common ones.** A complex selector (one with a descendant `A B`, child `A > B`, attribute `[...]` or pseudo-class part) is matched against every node of its last type, and a descendant selector walks all ancestors of each one. `'ImportDeclaration Literal'` runs on every literal in every file. Listen to `ImportDeclaration` and check `node.source`, or track enter/exit of the outer node with a counter. Plain node types (`CallExpression`, `Literal`) and `:exit` are cheap.
- **Ask for scope information last.** The first `context.sourceCode.getScope()` or `getDeclaredVariables()` in a file makes oxlint run the full scope analysis of that file. Check cheap syntactic conditions first (does the file import the module, does the callee have the right name), and resolve candidates in `Program:exit` only when they hold. The check must be a necessary condition for a report, never a heuristic.
- **Walk `node.parent` instead of calling `sourceCode.getAncestors()`**, which builds an array.
- **Read `node.loc` only to report.** oxlint computes locations on first access.
- **Do per-options work once.** Rule options are the same object for every file: compile regular expressions and minimatch patterns once, at module level or in a `WeakMap` keyed by the options, and cache results that depend only on the options and a string.
- **Do per-file work once, in `create()`.** Compute the file's relative path or layer there, not per import, and return `{}` when no check can apply to the file.
- **Don't read files per file or per node.** Cache at module level. If the content can change while the oxc language server runs in the editor, read it again before reporting.

## Measure and verify

- Profile one oxlint process (JS plugin rules run on its main thread), then look at the self time of the rule's functions and of oxlint's `esquery` and scope functions:
  `node --cpu-prof --cpu-prof-dir=/tmp/oxlint-profile node_modules/oxlint/bin/oxlint --format=json src`
- Compare timings with `node build/oxlint.ts --processes=1 <folder>`, before and after.
- Run the rule's tests: `node --test .eslint-plugin-local/tests/<rule>.test.ts`.
- For a change that must not change behavior, compare oxlint's full output before and after with every disable directive switched off. In a clean checkout of the base commit, and again in one of the change (for example two `git worktree`s), run:

  ```sh
  NAME=before  # or after
  git grep -lzE 'eslint-(disable|enable)' -- '*.ts' '*.tsx' '*.mts' '*.cts' '*.js' '*.mjs' '*.cjs' | xargs -0 perl -pi -e 's/eslint-(disable|enable)/eslint-x$1/g'
  node build/oxlint.ts | grep -E ': line [0-9]+, col' | sort > /tmp/oxlint-$NAME.txt
  git checkout -- .   # restores the directives, and discards all other uncommitted changes
  ```

  Then diff the two files. Both should list about ten thousand problems, and nothing should differ.
