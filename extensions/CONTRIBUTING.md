# Contributing to Built-In Extensions

This directory contains built-in extensions that ship with VS Code.

## Basic Structure

A typical TypeScript-based built-in extension has the following structure:

- `package.json`: extension manifest.
- `src/`: Main directory for TypeScript source code.
- `tsconfig.json`: primary TypeScript config. This should inherit from `tsconfig.base.json`.
- `esbuild.mts`: esbuild build script used for production builds.
- `.vscodeignore`: Ignore file list. You can copy this from an existing extension.

TypeScript-based extensions have the following output structure:

- `out`: Output directory for development builds
- `dist`: Output directory for production builds.


## Enabling an Extension in the Browser

By default extensions will only target desktop. To enable an extension in browsers as well:

- Add a `"browser"` entry in `package.json` pointing to the browser bundle (for example `"./dist/browser/extension"`).
- Add `tsconfig.browser.json` that typechecks only browser-safe sources.
- Add an `esbuild.browser.mts` file. This should set `platform: 'browser'`.

Make sure the browser build of the extension only uses browser-safe APIs. If an extension needs different behavior between desktop and web, you can create distinct entrypoints for each target:

- `src/extension.ts`: Desktop entrypoint.
- `src/extension.browser.ts`: Browser entrypoint. Make sure `esbuild.browser.mts` builds this and that `tsconfig.browser.json` targets it.

## Shared dependencies

A subset of runtime dependencies is shared across all built-in extensions and shipped once in the product under `extensions/node_modules/`, instead of being bundled into every extension that uses them. The single source of truth for which packages are shared and which version is shipped is the `dependencies` block in [extensions/package.json](./package.json).

When you change a dependency that is also listed in `extensions/package.json`:

- Bump the version range in `extensions/package.json` (and run `npm install` in `extensions/`).
- Update every consumer extension's `package.json` to a range that is satisfied by the new shared version.
- Run `npm install` in each affected extension to refresh its lockfile.

The `extensions/postinstall.mjs` script validates this at install time: if any consumer extension declares a range that the shared copy does not satisfy, the install fails with a list of the offending entries. This catches the silent runtime failure that would otherwise happen (npm would install a private copy at the consumer's version, but esbuild marks the package as external and the runtime would resolve to the wrong major from the shared location).

The list of packages externalized by the shared esbuild config in [extensions/esbuild-extension-common.mts](./esbuild-extension-common.mts) is generated automatically from `extensions/package.json`, so you don't need to touch the esbuild config when adding or removing a shared package.
