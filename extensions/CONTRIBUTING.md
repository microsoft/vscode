# Contributing to Built-In Extensions

This directory contains built-in extensions that ship with VS Code.

## Basic Structure

A typical built-in extension has the following structure:

- `package.json`: extension manifest.
- `src/`: Main directory for source code
- `tsconfig.json`: primary TypeScript config. This should inherit from `tsconfig.base.json`.
- `esbuild.mts`: Esbuild build script used for production builds.
- `.vscodeignore`: Ignore file list. You can copy this from an existing extension.

Extensions have the following output structure:

- `out`: Output directory for development builds
- `dist`: Output directory for production builds.


## Browser enabling an extension

By default extensions will only target desktop. To enable an extension in browsers as well:

- Add a `"browser"` entry in `package.json` pointing to the browser bundle (for example `"./dist/browser/extension"`).
- Add `tsconfig.browser.json` that typechecks only browser-safe sources.
- Add a `esbuild.browser.mts` file. This should set `platform: 'browser'`.

Make sure the browser build of the extension only uses browser safe APIs. If an extension needs different behavior between desktop and web, you can create distinct entrypoints for each target:

- `src/extension.ts`: Desktop entrypoint.
- `src/extension.browser.ts`: Browser entrypoint. Make sure `esbuild.browser.mts` builds this and that `tsconfig.browser.json` targets it.
