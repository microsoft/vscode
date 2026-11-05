# Workspace editing

The workspace editing service handles transitions from an empty window or a single folder to a multi-root workspace, and transitions to a newly saved workspace file. Adding a folder to an existing multi-root workspace updates its folder configuration without entering a new workspace.

See [Workspace transitions](WORKSPACE_TRANSITIONS.md) for native migration ordering, extension-host lifecycle, and reload cancellation behavior.

## Tests

The [native workspace editing tests](test/electron-browser/workspaceEditingService.test.ts) cover transition lifecycle behavior; the initialization suite in the [configuration service tests](../configuration/test/browser/configurationService.test.ts) covers folder-change participant ordering. Use the [unit test guide](../../../../../test/unit/README.md) to run these suites. Remote-SSH integration requires separate verification with the extension and a remote host.
