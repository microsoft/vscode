# Workspace transitions

In remote windows, [`NativeWorkspaceEditingService.enterWorkspace`](electron-browser/workspaceEditingService.ts) defers extension-host shutdown to the normal window reload. A local extension host can own the tunnel used by remote configuration reads and data migration, so this service must not stop the hosts before migration. Storage migration, backup reinitialization, and joined workspace-entry participants precede the reload request. The reload lifecycle owns connection termination, extension-host shutdown, confirmation, and backup handling.

In local windows, the service requests an extension-host stop before migration, aborts if `stopExtensionHosts` returns `false`, and requests a restart after migration. The extension service owns stop confirmation and veto handling.

During configuration initialization, [`WorkspaceService`](../configuration/browser/configurationService.ts) waits for registered folder-change participants to settle before publishing initialization's configuration and workspace notifications. This ordering also applies while extension hosts remain running during a remote transition.

Migration precedes the reload request. Canceling the reload does not roll back the migration; the transition is not transactional across workbench and extension-host state.
