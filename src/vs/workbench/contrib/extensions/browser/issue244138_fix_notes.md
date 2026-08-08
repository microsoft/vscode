# Fix Proposal for Issue #244138

## Problem Description
When an extension is disabled globally and enabled specifically for a workspace, the extension details view displays a "Disable" button dropdown containing both:
1. `Disable`
2. `Disable (Workspace)`

Expected behavior: The action should present only `Disable (Workspace)` directly without a dropdown, because the extension is already disabled globally.

## Cause & Solution
In `src/vs/workbench/contrib/extensions/browser/extensionsActions.ts`:
- Both `DisableGloballyAction` and `DisableForWorkspaceAction` currently check enablement state using `extensionEnablementService.isEnabled(extension)`.
- When an extension is enabled in workspace scope while globally disabled, `isEnabled(extension)` returns true for both contexts.
- Solution: Update `DisableGloballyAction` enablement condition so `DisableGloballyAction` is active only when `extensionEnablementService.isEnabledGlobally(extension)` is true. When globally disabled, `DisableGloballyAction` becomes inactive, leaving `DisableForWorkspaceAction` as the single primary action.
