/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { IBackupMainService } from '../../backup/electron-main/backup.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { IWorkspacesHistoryMainService } from './workspacesHistoryMainService.js';
import { IWorkspacesManagementMainService } from './workspacesManagementMainService.js';
let WorkspacesMainService = class WorkspacesMainService {
    constructor(workspacesManagementMainService, windowsMainService, workspacesHistoryMainService, backupMainService) {
        this.workspacesManagementMainService = workspacesManagementMainService;
        this.windowsMainService = windowsMainService;
        this.workspacesHistoryMainService = workspacesHistoryMainService;
        this.backupMainService = backupMainService;
        this.onDidChangeRecentlyOpened = this.workspacesHistoryMainService.onDidChangeRecentlyOpened;
    }
    //#region Workspace Management
    async enterWorkspace(windowId, path) {
        const window = this.windowsMainService.getWindowById(windowId);
        if (window) {
            return this.workspacesManagementMainService.enterWorkspace(window, this.windowsMainService.getWindows(), path);
        }
        return undefined;
    }
    createUntitledWorkspace(windowId, folders, remoteAuthority) {
        return this.workspacesManagementMainService.createUntitledWorkspace(folders, remoteAuthority);
    }
    deleteUntitledWorkspace(windowId, workspace) {
        return this.workspacesManagementMainService.deleteUntitledWorkspace(workspace);
    }
    getWorkspaceIdentifier(windowId, workspacePath) {
        return this.workspacesManagementMainService.getWorkspaceIdentifier(workspacePath);
    }
    getRecentlyOpened(windowId) {
        return this.workspacesHistoryMainService.getRecentlyOpened();
    }
    addRecentlyOpened(windowId, recents) {
        return this.workspacesHistoryMainService.addRecentlyOpened(recents);
    }
    removeRecentlyOpened(windowId, paths) {
        return this.workspacesHistoryMainService.removeRecentlyOpened(paths);
    }
    clearRecentlyOpened(windowId) {
        return this.workspacesHistoryMainService.clearRecentlyOpened();
    }
    //#endregion
    //#region Dirty Workspaces
    async getDirtyWorkspaces() {
        return this.backupMainService.getDirtyWorkspaces();
    }
};
WorkspacesMainService = __decorate([
    __param(0, IWorkspacesManagementMainService),
    __param(1, IWindowsMainService),
    __param(2, IWorkspacesHistoryMainService),
    __param(3, IBackupMainService)
], WorkspacesMainService);
export { WorkspacesMainService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlc01haW5TZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vd29ya3NwYWNlcy9lbGVjdHJvbi1tYWluL3dvcmtzcGFjZXNNYWluU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUloRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMxRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUc3RSxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNsRixPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUlqRixJQUFNLHFCQUFxQixHQUEzQixNQUFNLHFCQUFxQjtJQUlqQyxZQUNvRCwrQkFBaUUsRUFDOUUsa0JBQXVDLEVBQzdCLDRCQUEyRCxFQUN0RSxpQkFBcUM7UUFIdkIsb0NBQStCLEdBQS9CLCtCQUErQixDQUFrQztRQUM5RSx1QkFBa0IsR0FBbEIsa0JBQWtCLENBQXFCO1FBQzdCLGlDQUE0QixHQUE1Qiw0QkFBNEIsQ0FBK0I7UUFDdEUsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFvQjtRQUUxRSxJQUFJLENBQUMseUJBQXlCLEdBQUcsSUFBSSxDQUFDLDRCQUE0QixDQUFDLHlCQUF5QixDQUFDO0lBQzlGLENBQUM7SUFFRCw4QkFBOEI7SUFFOUIsS0FBSyxDQUFDLGNBQWMsQ0FBQyxRQUFnQixFQUFFLElBQVM7UUFDL0MsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMvRCxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQ1osT0FBTyxJQUFJLENBQUMsK0JBQStCLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsa0JBQWtCLENBQUMsVUFBVSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDaEgsQ0FBQztRQUVELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFRCx1QkFBdUIsQ0FBQyxRQUFnQixFQUFFLE9BQXdDLEVBQUUsZUFBd0I7UUFDM0csT0FBTyxJQUFJLENBQUMsK0JBQStCLENBQUMsdUJBQXVCLENBQUMsT0FBTyxFQUFFLGVBQWUsQ0FBQyxDQUFDO0lBQy9GLENBQUM7SUFFRCx1QkFBdUIsQ0FBQyxRQUFnQixFQUFFLFNBQStCO1FBQ3hFLE9BQU8sSUFBSSxDQUFDLCtCQUErQixDQUFDLHVCQUF1QixDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ2hGLENBQUM7SUFFRCxzQkFBc0IsQ0FBQyxRQUFnQixFQUFFLGFBQWtCO1FBQzFELE9BQU8sSUFBSSxDQUFDLCtCQUErQixDQUFDLHNCQUFzQixDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQ25GLENBQUM7SUFRRCxpQkFBaUIsQ0FBQyxRQUFnQjtRQUNqQyxPQUFPLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO0lBQzlELENBQUM7SUFFRCxpQkFBaUIsQ0FBQyxRQUFnQixFQUFFLE9BQWtCO1FBQ3JELE9BQU8sSUFBSSxDQUFDLDRCQUE0QixDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3JFLENBQUM7SUFFRCxvQkFBb0IsQ0FBQyxRQUFnQixFQUFFLEtBQVk7UUFDbEQsT0FBTyxJQUFJLENBQUMsNEJBQTRCLENBQUMsb0JBQW9CLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDdEUsQ0FBQztJQUVELG1CQUFtQixDQUFDLFFBQWdCO1FBQ25DLE9BQU8sSUFBSSxDQUFDLDRCQUE0QixDQUFDLG1CQUFtQixFQUFFLENBQUM7SUFDaEUsQ0FBQztJQUVELFlBQVk7SUFHWiwwQkFBMEI7SUFFMUIsS0FBSyxDQUFDLGtCQUFrQjtRQUN2QixPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO0lBQ3BELENBQUM7Q0FHRCxDQUFBO0FBcEVZLHFCQUFxQjtJQUsvQixXQUFBLGdDQUFnQyxDQUFBO0lBQ2hDLFdBQUEsbUJBQW1CLENBQUE7SUFDbkIsV0FBQSw2QkFBNkIsQ0FBQTtJQUM3QixXQUFBLGtCQUFrQixDQUFBO0dBUlIscUJBQXFCLENBb0VqQyJ9