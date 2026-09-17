# VS Code Extras

VS Code Extras provides small self-hosting utilities for contributors working in
the [`microsoft/vscode`](https://github.com/microsoft/vscode) repository.

## Features

### npm install state

The extension checks whether the workspace's npm dependencies match the
dependency files in the checkout. When dependencies are stale, it shows a
warning in the status bar:

```text
node_modules is stale - run npm i
```

Click the status bar item to run the repository's fast install command:

```sh
node build/npm/fast-install.ts --force
```

The warning tooltip can list changed dependency files since the last successful
install and can also report a Node.js version mismatch with an entry like
`Node.js version (... -> ...)`. For dependency files, click an entry in the
tooltip to open a diff between the content recorded at the last install and the
current workspace content.

## Activation

VS Code Extras activates only inside a VS Code source checkout. It looks for
`src/vscode-dts/vscode.d.ts`, so it should stay inactive in unrelated workspaces.

## Settings

This extension contributes the following setting:

- `vscode-extras.npmUpToDateFeature.enabled`: show a status bar warning when
  npm dependencies are out of date. This setting is enabled by default.

## Workspace Support

VS Code Extras requires a trusted workspace. The extension reads dependency
metadata from the workspace and runs repository scripts to inspect and install
dependencies.

VS Code Extras also requires a local workspace. Virtual workspaces, such as
GitHub Repositories and vscode.dev, do not provide the local scripts and npm
installation workflow that this extension uses.

## Issues

VS Code Extras is maintained in the VS Code repository. File issues at
<https://github.com/microsoft/vscode/issues>.
