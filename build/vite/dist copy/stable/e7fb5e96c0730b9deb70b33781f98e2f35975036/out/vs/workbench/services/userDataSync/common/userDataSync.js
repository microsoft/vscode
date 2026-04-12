/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { localize, localize2 } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
export const IUserDataSyncWorkbenchService = createDecorator('IUserDataSyncWorkbenchService');
export function getSyncAreaLabel(source) {
    switch (source) {
        case "settings" /* SyncResource.Settings */: return localize('settings', "Settings");
        case "keybindings" /* SyncResource.Keybindings */: return localize('keybindings', "Keyboard Shortcuts");
        case "snippets" /* SyncResource.Snippets */: return localize('snippets', "Snippets");
        case "prompts" /* SyncResource.Prompts */: return localize('prompts', "Prompts and Instructions");
        case "tasks" /* SyncResource.Tasks */: return localize('tasks', "Tasks");
        case "mcp" /* SyncResource.Mcp */: return localize('mcp', "MCP Servers");
        case "extensions" /* SyncResource.Extensions */: return localize('extensions', "Extensions");
        case "globalState" /* SyncResource.GlobalState */: return localize('ui state label', "UI State");
        case "profiles" /* SyncResource.Profiles */: return localize('profiles', "Profiles");
        case "workspaceState" /* SyncResource.WorkspaceState */: return localize('workspace state label', "Workspace State");
    }
}
export var AccountStatus;
(function (AccountStatus) {
    AccountStatus["Uninitialized"] = "uninitialized";
    AccountStatus["Unavailable"] = "unavailable";
    AccountStatus["Available"] = "available";
})(AccountStatus || (AccountStatus = {}));
export const SYNC_TITLE = localize2('sync category', "Settings Sync");
export const SYNC_VIEW_ICON = registerIcon('settings-sync-view-icon', Codicon.sync, localize('syncViewIcon', 'View icon of the Settings Sync view.'));
// Contexts
export const CONTEXT_SYNC_STATE = new RawContextKey('syncStatus', "uninitialized" /* SyncStatus.Uninitialized */);
export const CONTEXT_SYNC_ENABLEMENT = new RawContextKey('syncEnabled', false);
export const CONTEXT_ACCOUNT_STATE = new RawContextKey('userDataSyncAccountStatus', "uninitialized" /* AccountStatus.Uninitialized */);
export const CONTEXT_ENABLE_ACTIVITY_VIEWS = new RawContextKey(`enableSyncActivityViews`, false);
export const CONTEXT_ENABLE_SYNC_CONFLICTS_VIEW = new RawContextKey(`enableSyncConflictsView`, false);
export const CONTEXT_HAS_CONFLICTS = new RawContextKey('hasConflicts', false);
// Commands
export const CONFIGURE_SYNC_COMMAND_ID = 'workbench.userDataSync.actions.configure';
export const SHOW_SYNC_LOG_COMMAND_ID = 'workbench.userDataSync.actions.showLog';
// VIEWS
export const SYNC_VIEW_CONTAINER_ID = 'workbench.view.sync';
export const SYNC_CONFLICTS_VIEW_ID = 'workbench.views.sync.conflicts';
export const DOWNLOAD_ACTIVITY_ACTION_DESCRIPTOR = {
    id: 'workbench.userDataSync.actions.downloadSyncActivity',
    title: localize2('download sync activity title', "Download Settings Sync Activity"),
    category: Categories.Developer,
    f1: true,
    precondition: ContextKeyExpr.and(CONTEXT_ACCOUNT_STATE.isEqualTo("available" /* AccountStatus.Available */), CONTEXT_SYNC_STATE.notEqualsTo("uninitialized" /* SyncStatus.Uninitialized */))
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFTeW5jLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUc3RixPQUFPLEVBQUUsY0FBYyxFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFekQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUVqRixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sOERBQThELENBQUM7QUFVMUYsTUFBTSxDQUFDLE1BQU0sNkJBQTZCLEdBQUcsZUFBZSxDQUFnQywrQkFBK0IsQ0FBQyxDQUFDO0FBK0I3SCxNQUFNLFVBQVUsZ0JBQWdCLENBQUMsTUFBb0I7SUFDcEQsUUFBUSxNQUFNLEVBQUUsQ0FBQztRQUNoQiwyQ0FBMEIsQ0FBQyxDQUFDLE9BQU8sUUFBUSxDQUFDLFVBQVUsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUNwRSxpREFBNkIsQ0FBQyxDQUFDLE9BQU8sUUFBUSxDQUFDLGFBQWEsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBQ3BGLDJDQUEwQixDQUFDLENBQUMsT0FBTyxRQUFRLENBQUMsVUFBVSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQ3BFLHlDQUF5QixDQUFDLENBQUMsT0FBTyxRQUFRLENBQUMsU0FBUyxFQUFFLDBCQUEwQixDQUFDLENBQUM7UUFDbEYscUNBQXVCLENBQUMsQ0FBQyxPQUFPLFFBQVEsQ0FBQyxPQUFP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