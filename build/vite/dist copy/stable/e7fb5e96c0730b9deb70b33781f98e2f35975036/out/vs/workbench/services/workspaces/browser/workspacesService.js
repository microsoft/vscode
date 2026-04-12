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
var BrowserWorkspacesService_1;
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkspacesService, restoreRecentlyOpened, isRecentFile, isRecentFolder, toStoreData, getStoredWorkspaceFolder, isRecentWorkspace } from '../../../../platform/workspaces/common/workspaces.js';
import { Emitter } from '../../../../base/common/event.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { isTemporaryWorkspace, IWorkspaceContextService, WORKSPACE_EXTENSION } from '../../../../platform/workspace/common/workspace.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { getWorkspaceIdentifier } from './workspaces.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { joinPath } from '../../../../base/common/resources.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { Schemas } from '../../../../base/common/network.js';
let BrowserWorkspacesService = class BrowserWorkspacesService extends Disposable {
    static { BrowserWorkspacesService_1 = this; }
    static { this.RECENTLY_OPENED_KEY = 'recently.opened'; }
    constructor(storageService, contextService, logService, fileService, environmentService, uriIdentityService) {
        super();
        this.storageService = storageService;
        this.contextService = contextService;
        this.logService = logService;
        this.fileService = fileService;
        this.environmentService = environmentService;
        this.uriIdentityService = uriIdentityService;
        this._onRecentlyOpenedChange = this._register(new Emitter());
        this.onDidChangeRecentlyOpened = this._onRecentlyOpenedChange.event;
        // Opening a workspace should push it as most
        // recently used to the workspaces history
        this.addWorkspaceToRecentlyOpened();
        this.registerListeners();
    }
    registerListeners() {
        // Storage
        this._register(this.storageService.onDidChangeValue(-1 /* StorageScope.APPLICATION */, BrowserWorkspacesService_1.RECENTLY_OPENED_KEY, this._store)(() => this._onRecentlyOpenedChange.fire()));
        // Workspace
        this._register(this.contextService.onDidChangeWorkspaceFolders(e => this.onDidChangeWorkspaceFolders(e)));
    }
    onDidChangeWorkspaceFolders(e) {
        if (!isTemporaryWorkspace(this.contextService.getWorkspace())) {
            return;
        }
        // When in a temporary workspace, make sure to track folder changes
        // in the history so that these can later be restored.
        for (const folder of e.added) {
            this.addRecentlyOpened([{ folderUri: folder.uri }]);
        }
    }
    addWorkspaceToRecentlyOpened() {
        const workspace = this.contextService.getWorkspace();
        const remoteAuthority = this.environmentService.remoteAuthority;
        switch (this.contextService.getWorkbenchState()) {
            case 2 /* WorkbenchState.FOLDER */:
                this.addRecentlyOpened([{ folderUri: workspace.folders[0].uri, remoteAuthority }]);
                break;
            case 3 /* WorkbenchState.WORKSPACE */:
                this.addRecentlyOpened([{ workspace: { id: workspace.id, configPath: workspace.configuration }, remoteAuthority }]);
                break;
        }
    }
    //#region Workspaces History
    async getRecentlyOpened() {
        const recentlyOpenedRaw = this.storageService.get(BrowserWorkspacesService_1.RECENTLY_OPENED_KEY, -1 /* StorageScope.APPLICATION */);
        if (recentlyOpenedRaw) {
            const recentlyOpened = restoreRecentlyOpened(JSON.parse(recentlyOpenedRaw), this.logService);
            recentlyOpened.workspaces = recentlyOpened.workspaces.filter(recent => {
                // In web, unless we are in a temporary workspace, we cannot support
                // to switch to local folders because this would require a window
                // reload and local file access only works with explicit user gesture
                // from the current session.
                if (isRecentFolder(recent) && recent.folderUri.scheme === Schemas.file && !isTemporaryWorkspace(this.contextService.getWorkspace())) {
                    return false;
                }
                // Never offer temporary workspaces in the history
                if (isRecentWorkspace(recent) && isTemporaryWorkspace(recent.workspace.configPath)) {
                    return false;
                }
                return true;
            });
            return recentlyOpened;
        }
        return { workspaces: [], files: [] };
    }
    async addRecentlyOpened(recents) {
        const recentlyOpened = await this.getRecentlyOpened();
        for (const recent of recents) {
            if (isRecentFile(recent)) {
                this.doRemoveRecentlyOpened(recentlyOpened, [recent.fileUri]);
                recentlyOpened.files.unshift(recent);
            }
            else if (isRecentFolder(recent)) {
                this.doRemoveRecentlyOpened(recentlyOpened, [recent.folderUri]);
                recentlyOpened.workspaces.unshift(recent);
            }
            else {
                this.doRemoveRecentlyOpened(recentlyOpened, [recent.workspace.configPath]);
                recentlyOpened.workspaces.unshift(recent);
            }
        }
        return this.saveRecentlyOpened(recentlyOpened);
    }
    async removeRecentlyOpened(paths) {
        const recentlyOpened = await this.getRecentlyOpened();
        this.doRemoveRecentlyOpened(recentlyOpened, paths);
        return this.saveRecentlyOpened(recentlyOpened);
    }
    doRemoveRecentlyOpened(recentlyOpened, paths) {
        recentlyOpened.files = recentlyOpened.files.filter(file => {
            return !paths.some(path => path.toString() === file.fileUri.toString());
        });
        recentlyOpened.workspaces = recentlyOpened.workspaces.filter(workspace => {
            return !paths.some(path => path.toString() === (isRecentFolder(workspace) ? workspace.folderUri.toString() : workspace.workspace.configPath.toString()));
        });
    }
    async saveRecentlyOpened(data) {
        return this.storageService.store(BrowserWorkspacesService_1.RECENTLY_OPENED_KEY, JSON.stringify(toStoreData(data)), -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
    }
    async clearRecentlyOpened() {
        this.storageService.remove(BrowserWorkspacesService_1.RECENTLY_OPENED_KEY, -1 /* StorageScope.APPLICATION */);
    }
    //#endregion
    //#region Workspace Management
    async enterWorkspace(workspaceUri) {
        return { workspace: await this.getWorkspaceIdentifier(workspaceUri) };
    }
    async createUntitledWorkspace(folders, remoteAuthority) {
        const randomId = (Date.now() + Math.round(Math.random() * 1000)).toString();
        const newUntitledWorkspacePath = joinPath(this.environmentService.untitledWorkspacesHome, `Untitled-${randomId}.${WORKSPACE_EXTENSION}`);
        // Build array of workspace folders to store
        const storedWorkspaceFolder = [];
        if (folders) {
            for (const folder of folders) {
                storedWorkspaceFolder.push(getStoredWorkspaceFolder(folder.uri, true, folder.name, this.environmentService.untitledWorkspacesHome, this.uriIdentityService.extUri));
            }
        }
        // Store at untitled workspaces location
        const storedWorkspace = { folders: storedWorkspaceFolder, remoteAuthority };
        await this.fileService.writeFile(newUntitledWorkspacePath, VSBuffer.fromString(JSON.stringify(storedWorkspace, null, '\t')));
        return this.getWorkspaceIdentifier(newUntitledWorkspacePath);
    }
    async deleteUntitledWorkspace(workspace) {
        try {
            await this.fileService.del(workspace.configPath);
        }
        catch (error) {
            if (error.fileOperationResult !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                throw error; // re-throw any other error than file not found which is OK
            }
        }
    }
    async getWorkspaceIdentifier(workspaceUri) {
        return getWorkspaceIdentifier(workspaceUri);
    }
    //#endregion
    //#region Dirty Workspaces
    async getDirtyWorkspaces() {
        return []; // Currently not supported in web
    }
};
BrowserWorkspacesService = BrowserWorkspacesService_1 = __decorate([
    __param(0, IStorageService),
    __param(1, IWorkspaceContextService),
    __param(2, ILogService),
    __param(3, IFileService),
    __param(4, IWorkbenchEnvironmentService),
    __param(5, IUriIdentityService)
], BrowserWorkspacesService);
export { BrowserWorkspacesService };
registerSingleton(IWorkspacesService, BrowserWorkspacesService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlc1NlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvd29ya3NwYWNlcy9icm93c2VyL3dvcmtzcGFjZXNTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLGtCQUFrQixFQUF3RSxxQkFBcUIsRUFBVyxZQUFZLEVBQUUsY0FBYyxFQUFFLFdBQVcsRUFBMEIsd0JBQXdCLEVBQW9CLGlCQUFpQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFbFUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFDOUcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLHdCQUF3QixFQUFzRSxtQkFBbUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQzdNLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDekQsT0FBTyxFQUFFLFlBQVksRUFBMkMsTUFBTSw0Q0FBNEMsQ0FBQztBQUNuSCxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUM5RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBRTdGLE9BQU8s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