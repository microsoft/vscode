# Workspace transitions

The workspace editing service handles transitions from an empty window or a single folder to a multi-root workspace, and transitions to a newly saved workspace file. Adding a folder to an existing multi-root workspace updates its folder configuration without entering a new workspace.

## Native window lifecycle

[`NativeWorkspaceEditingService.enterWorkspace`](electron-browser/workspaceEditingService.ts) preserves workspace settings, switches storage with data preservation, reinitializes working-copy backups, and waits for `onDidEnterWorkspace` migration participants before completing the transition.

For local windows, extension hosts stop before this migration and restart afterward with the new workspace identity and storage location. If stopping the extension hosts is declined, the transition aborts before migration begins.

For remote windows, extension hosts must remain running throughout migration. A local extension host can own the tunnel used to read remote user and folder configuration or migrate data. Stopping it before these operations can disconnect the filesystem they are awaiting and prevent the transition from reaching the window reload.

During configuration initialization, workspace-folder change participants, including trust decisions, settle before configuration, workbench-state, and folder-change notifications are published. This prevents a running extension host from receiving newly added folders before their trust decision has completed.

After migration, a remote window requests the normal window reload. Its shutdown lifecycle owns extension-host termination: shutdown participants that need the remote connection finish first, then the extension service ends the remote management connection before stopping the hosts. Reload confirmation, cancellation, and working-copy backup handling remain the responsibility of that lifecycle. The transition does not perform a separate extension-host stop or restart for remote windows.

The workspace migration precedes the reload request. Canceling that reload does not roll back the migration; the existing transition is not a transaction across workbench and extension-host state.

Preserve these ordering requirements when changing this service:

- Remote configuration reads and migration participants complete while the connection is available.
- Folder-change participants settle before configuration and workspace notifications reach running extensions.
- Workspace storage and working-copy backups migrate before the reload request.
- A failed remote migration does not preemptively terminate extension hosts or request a reload.
- Local windows retain their extension-host stop veto and stop/migrate/start sequence.

## Validation

The native service regression suite uses a remote filesystem provider whose connection becomes unavailable when extension hosts stop. It exercises transitions from empty and single-folder windows and checks that migration participants finish before reload, alongside local stop/restart, veto, and remote error behavior. The configuration initialization suite checks that a pending folder-change participant blocks configuration and workspace notifications.

After preparing the development dependencies and client output, run:

```sh
./scripts/test.sh --run src/vs/workbench/services/workspaces/test/electron-browser/workspaceEditingService.test.ts
./scripts/test.sh --run src/vs/workbench/services/configuration/test/browser/configurationService.test.ts --grep 'WorkspaceService - Initialization'
```

For a Remote-SSH integration check, use a disposable remote folder and an isolated VS Code profile. Add a second folder to a single-folder window, add a folder to an empty remote window, and save a workspace under a new name. Verify that each transition reconnects and displays the expected folders, preserves workspace settings and unsaved edits, and permits subsequent file operations. Also check a dirty notebook or custom editor and an active debug session to verify the normal reload confirmation and backup behavior. Service tests model connection loss; they do not replace this integration check with the Remote-SSH extension.

Related report: [microsoft/vscode-remote-release#10168](https://github.com/microsoft/vscode-remote-release/issues/10168).
