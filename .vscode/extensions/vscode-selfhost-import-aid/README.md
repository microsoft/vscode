# VS Code Selfhost Import Aid

VS Code Selfhost Import Aid provides TypeScript import path assistance for
contributors working in the [`microsoft/vscode`](https://github.com/microsoft/vscode)
repository.

## Features

### Import path completions

The extension indexes TypeScript files under `src/vs` and contributes completion
items inside TypeScript import specifiers. Completion items insert relative ESM
paths with `.js` file extensions, matching the import style used by the VS Code
source tree.

### ESM import quick fixes

When TypeScript reports an unresolved module diagnostic, the extension can offer
quick fixes for matching files in the VS Code source tree. The quick fix rewrites
the import specifier to the matching relative `.js` path.

The extension also contributes a source fix-all action for ESM import fixes when
multiple unresolved imports can be matched.

## Activation

VS Code Selfhost Import Aid activates only inside a VS Code source checkout. It
looks for `src/vscode-dts/vscode.d.ts` and indexes files under `src/vs`.

## Workspace Support

VS Code Selfhost Import Aid requires a trusted, non-virtual workspace with full
file system access. The extension reads TypeScript files from the workspace and
creates import edits for source files.

Virtual workspaces, such as GitHub Repositories and vscode.dev, do not provide
the full file system access this extension needs for indexing and import edits.

## Issues

VS Code Selfhost Import Aid is maintained in the VS Code repository. File issues
at <https://github.com/microsoft/vscode/issues>.
