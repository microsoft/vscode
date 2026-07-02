# VS Code Selfhost Test Provider

VS Code Selfhost Test Provider adds Test Explorer integration for contributors
working in the [`microsoft/vscode`](https://github.com/microsoft/vscode)
repository.

## Features

### Test discovery

The extension discovers VS Code unit and integration tests from files matching
`src/vs/**/*.{test,integrationTest}.ts`. It parses test files and exposes suites
and test cases in the Testing view.

The provider watches the same test file pattern for create, change, and delete
events. It also updates the test tree from open TypeScript documents so edits in
the editor are reflected before files are saved.

### Run, debug, and coverage profiles

The extension contributes Test Explorer profiles for running and debugging VS
Code tests in Electron, Chrome, Firefox, and WebKit. Electron tests can also run
with coverage.

Runs use the VS Code repository test entry points and pass selected files or
test names to the test process. Debug runs use the workspace launch
configuration named `Attach to VS Code`.

### Snapshot and failure helpers

When a test failure includes snapshot output, the extension contributes an
inline **Update Snapshot** action that writes the actual output to the snapshot
file and invalidates the test result.

The extension also tracks recent failing and passing test states with the
current git state and exposes **Open Selfhost Failure Logs** to inspect the
stored failure log.

## Activation

VS Code Selfhost Test Provider activates only inside a VS Code source checkout.
It looks for `src/vscode-dts/vscode.d.ts`, so it should stay inactive in
unrelated workspaces.

## Workspace Support

VS Code Selfhost Test Provider requires a trusted, non-virtual workspace with
full file system access. The extension reads and watches test files, starts test
processes, updates snapshot files, reads git state, and writes failure logs.

Virtual workspaces, such as GitHub Repositories and vscode.dev, do not provide
the full file system and process access this extension needs.

## Issues

VS Code Selfhost Test Provider is maintained in the VS Code repository. File
issues at <https://github.com/microsoft/vscode/issues>.
