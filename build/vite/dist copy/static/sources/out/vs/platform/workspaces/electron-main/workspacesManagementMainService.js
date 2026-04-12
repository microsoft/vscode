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
import * as fs from 'fs';
import electron from 'electron';
import { Emitter } from '../../../base/common/event.js';
import { parse } from '../../../base/common/json.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { dirname, join } from '../../../base/common/path.js';
import { basename, extUriBiasedIgnorePathCase, joinPath, originalFSPath } from '../../../base/common/resources.js';
import { Promises } from '../../../base/node/pfs.js';
import { localize } from '../../../nls.js';
import { IBackupMainService } from '../../backup/electron-main/backup.js';
import { IDialogMainService } from '../../dialogs/electron-main/dialogMainService.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IUserDataProfilesMainService } from '../../userDataProfile/electron-main/userDataProfile.js';
import { findWindowOnWorkspaceOrFolder } from '../../windows/electron-main/windowsFinder.js';
import { isWorkspaceIdentifier, hasWorkspaceFileExtension, UNTITLED_WORKSPACE_NAME, isUntitledWorkspace } from '../../workspace/common/workspace.js';
import { getStoredWorkspaceFolder, isStoredWorkspaceFolder, toWorkspaceFolders } from '../common/workspaces.js';
import { getWorkspaceIdentifier } from '../node/workspaces.js';
export const IWorkspacesManagementMainService = createDecorator('workspacesManagementMainService');
let WorkspacesManagementMainService = class WorkspacesManagementMainService extends Disposable {
    constructor(environmentMainService, logService, userDataProfilesMainService, backupMainService, dialogMainService) {
        super();
        this.environmentMainService = environmentMainService;
        this.logService = logService;
        this.userDataProfilesMainService = userDataProfilesMainService;
        this.backupMainService = backupMainService;
        this.dialogMainService = dialogMainService;
        this._onDidDeleteUntitledWorkspace = this._register(new Emitter());
        this.onDidDeleteUntitledWorkspace = this._onDidDeleteUntitledWorkspace.event;
        this._onDidEnterWorkspace = this._register(new Emitter());
        this.onDidEnterWorkspace = this._onDidEnterWorkspace.event;
        this.untitledWorkspaces = [];
        this.untitledWorkspacesHome = this.environmentMainService.untitledWorkspacesHome;
    }
    async initialize() {
        // Reset
        this.untitledWorkspaces = [];
        // Resolve untitled workspaces
        try {
            const untitledWorkspacePaths = (await Promises.readdir(this.untitledWorkspacesHome.with({ scheme: Schemas.file }).fsPath)).map(folder => joinPath(this.untitledWorkspacesHome, folder, UNTITLED_WORKSPACE_NAME));
            for (const untitledWorkspacePath of untitledWorkspacePaths) {
                const workspace = getWorkspaceIdentifier(untitledWorkspacePath);
                const resolvedWorkspace = await this.resolveLocalWorkspace(untitledWorkspacePath);
                if (!resolvedWorkspace) {
                    await this.deleteUntitledWorkspace(workspace);
                }
                else {
                    this.untitledWorkspaces.push({ workspace, remoteAuthority: resolvedWorkspace.remoteAuthority });
                }
            }
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                this.logService.warn(`Unable to read folders in ${this.untitledWorkspacesHome} (${error}).`);
            }
        }
    }
    resolveLocalWorkspace(uri) {
        return this.doResolveLocalWorkspace(uri, path => fs.promises.readFile(path, 'utf8'));
    }
    doResolveLocalWorkspace(uri, contentsFn) {
        if (!this.isWorkspacePath(uri)) {
            return undefined; // does not look like a valid workspace config file
        }
        if (uri.scheme !== Schemas.file) {
            return undefined;
        }
        try {
            const contents = contentsFn(uri.fsPath);
            if (contents instanceof Promise) {
                return contents.then(value => this.doResolveWorkspace(uri, value), error => undefined /* invalid workspace */);
            }
            else {
                return this.doResolveWorkspace(uri, contents);
            }
        }
        catch {
            return undefined; // invalid workspace
        }
    }
    isWorkspacePath(uri) {
        return isUntitledWorkspace(uri, this.environmentMainService) || hasWorkspaceFileExtension(uri);
    }
    doResolveWorkspace(path, contents) {
        try {
            const workspace = this.doParseStoredWorkspace(path, contents);
            const workspaceIdentifier = getWorkspaceIdentifier(path);
            return {
                id: workspaceIdentifier.id,
                configPath: workspaceIdentifier.configPath,
                folders: toWorkspaceFolders(workspace.folders, workspaceIdentifier.configPath, extUriBiasedIgnorePathCase),
                remoteAuthority: workspace.remoteAuthority,
                transient: workspace.transient
            };
        }
        catch (error) {
            this.logService.warn(error.toString());
        }
        return undefined;
    }
    doParseStoredWorkspace(path, contents) {
        // Parse workspace file
        const storedWorkspace = parse(contents); // use fault tolerant parser
        // Filter out folders which do not have a path or uri set
        if (storedWorkspace && Array.isArray(storedWorkspace.folders)) {
            storedWorkspace.folders = storedWorkspace.folders.filter(folder => isStoredWorkspaceFolder(folder));
        }
        else {
            throw new Error(`${path.toString(true)} looks like an invalid workspace file.`);
        }
        return storedWorkspace;
    }
    async createUntitledWorkspace(folders, remoteAuthority) {
        const { workspace, storedWorkspace } = this.newUntitledWorkspace(folders, remoteAuthority);
        const configPath = workspace.configPath.fsPath;
        await fs.promises.mkdir(dirname(configPath), { recursive: true });
        await Promises.writeFile(configPath, JSON.stringify(storedWorkspace, null, '\t'));
        this.untitledWorkspaces.push({ workspace, remoteAuthority });
        return workspace;
    }
    newUntitledWorkspace(folders = [], remoteAuthority) {
        const randomId = (Date.now() + Math.round(Math.random() * 1000)).toString();
        const untitledWorkspaceConfigFolder = joinPath(this.untitledWorkspacesHome, randomId);
        const untitledWorkspaceConfigPath = joinPath(untitledWorkspaceConfigFolder, UNTITLED_WORKSPACE_NAME);
        const storedWorkspaceFolder = [];
        for (const folder of folders) {
            storedWorkspaceFolder.push(getStoredWorkspaceFolder(folder.uri, true, folder.name, untitledWorkspaceConfigFolder, extUriBiasedIgnorePathCase));
        }
        return {
            workspace: getWorkspaceIdentifier(untitledWorkspaceConfigPath),
            storedWorkspace: { folders: storedWorkspaceFolder, remoteAuthority }
        };
    }
    async getWorkspaceIdentifier(configPath) {
        return getWorkspaceIdentifier(configPath);
    }
    isUntitledWorkspace(workspace) {
        return isUntitledWorkspace(workspace.configPath, this.environmentMainService);
    }
    async deleteUntitledWorkspace(workspace) {
        if (!this.isUntitledWorkspace(workspace)) {
            return; // only supported for untitled workspaces
        }
        // Delete from disk
        await this.doDeleteUntitledWorkspace(workspace);
        // unset workspace from profiles
        this.userDataProfilesMainService.unsetWorkspace(workspace);
        // Event
        this._onDidDeleteUntitledWorkspace.fire(workspace);
    }
    async doDeleteUntitledWorkspace(workspace) {
        const configPath = originalFSPath(workspace.configPath);
        try {
            // Delete Workspace
            await Promises.rm(dirname(configPath));
            // Mark Workspace Storage to be deleted
            const workspaceStoragePath = join(this.environmentMainService.workspaceStorageHome.with({ scheme: Schemas.file }).fsPath, workspace.id);
            if (await Promises.exists(workspaceStoragePath)) {
                await Promises.writeFile(join(workspaceStoragePath, 'obsolete'), '');
            }
            // Remove from list
            this.untitledWorkspaces = this.untitledWorkspaces.filter(untitledWorkspace => untitledWorkspace.workspace.id !== workspace.id);
        }
        catch (error) {
            this.logService.warn(`Unable to delete untitled workspace ${configPath} (${error}).`);
        }
    }
    getUntitledWorkspaces() {
        return this.untitledWorkspaces;
    }
    async enterWorkspace(window, windows, path) {
        if (!window?.win || !window.isReady) {
            return undefined; // return early if the window is not ready or disposed
        }
        const isValid = await this.isValidTargetWorkspacePath(window, windows, path);
        if (!isValid) {
            return undefined; // return early if the workspace is not valid
        }
        const result = await this.doEnterWorkspace(window, getWorkspaceIdentifier(path));
        if (!result) {
            return undefined;
        }
        // Emit as event
        this._onDidEnterWorkspace.fire({ window, workspace: result.workspace });
        return result;
    }
    async isValidTargetWorkspacePath(window, windows, workspacePath) {
        if (!workspacePath) {
            return true;
        }
        if (isWorkspaceIdentifier(window.openedWorkspace) && extUriBiasedIgnorePathCase.isEqual(window.openedWorkspace.configPath, workspacePath)) {
            return false; // window is already opened on a workspace with that path
        }
        // Prevent overwriting a workspace that is currently opened in another window
        if (findWindowOnWorkspaceOrFolder(windows, workspacePath)) {
            await this.dialogMainService.showMessageBox({
                type: 'info',
                buttons: [localize({ key: 'ok', comment: ['&& denotes a mnemonic'] }, "&&OK")],
                message: localize('workspaceOpenedMessage', "Unable to save workspace '{0}'", basename(workspacePath)),
                detail: localize('workspaceOpenedDetail', "The workspace is already opened in another window. Please close that window first and then try again.")
            }, electron.BrowserWindow.getFocusedWindow() ?? undefined);
            return false;
        }
        return true; // OK
    }
    async doEnterWorkspace(window, workspace) {
        if (!window.config) {
            return undefined;
        }
        window.focus();
        // Register window for backups and migrate current backups over
        let backupPath;
        if (!window.config.extensionDevelopmentPath) {
            if (window.config.backupPath) {
                backupPath = await this.backupMainService.registerWorkspaceBackup({ workspace, remoteAuthority: window.remoteAuthority }, window.config.backupPath);
            }
            else {
                backupPath = this.backupMainService.registerWorkspaceBackup({ workspace, remoteAuthority: window.remoteAuthority });
            }
        }
        // if the window was opened on an untitled workspace, delete it.
        if (isWorkspaceIdentifier(window.openedWorkspace) && this.isUntitledWorkspace(window.openedWorkspace)) {
            await this.deleteUntitledWorkspace(window.openedWorkspace);
        }
        // Update window configuration properly based on transition to workspace
        window.config.workspace = workspace;
        window.config.backupPath = backupPath;
        return { workspace, backupPath };
    }
};
WorkspacesManagementMainService = __decorate([
    __param(0, IEnvironmentMainService),
    __param(1, ILogService),
    __param(2, IUserDataProfilesMainService),
    __param(3, IBackupMainService),
    __param(4, IDialogMainService)
], WorkspacesManagementMainService);
export { WorkspacesManagementMainService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3dvcmtzcGFjZXMvZWxlY3Ryb24tbWFpbi93b3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3pCLE9BQU8sUUFBUSxNQUFNLFVBQVUsQ0FBQztBQUNoQyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3JELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDMUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUM3RCxPQUFPLEVBQUUsUUFBUSxFQUFFLDBCQUEwQixFQUFFLFFBQVEsRUFBRSxjQUFjLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUVuSCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDckQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzNDLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDdEQsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFFdEcsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDN0YsT0FBTyxFQUFFLHFCQUFxQixFQUE0Qyx5QkFBeUIsRUFBRSx1QkFBdUIsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQy9MLE9BQU8sRUFBRSx3QkFBd0IsRUFBeUIsdUJBQXVCLEVBQWtHLGtCQUFrQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDdk8sT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFFL0QsTUFBTSxDQUFDLE1BQU0sZ0NBQWdDLEdBQUcsZUFBZSxDQUFtQyxpQ0FBaUMsQ0FBQyxDQUFDO0FBNEI5SCxJQUFNLCtCQUErQixHQUFyQyxNQUFNLCtCQUFnQyxTQUFRLFVBQVU7SUFjOUQsWUFDMEIsc0JBQWdFLEVBQzVFLFVBQXdDLEVBQ3ZCLDJCQUEwRSxFQUNwRixpQkFBc0QsRUFDdEQsaUJBQXNEO1FBRTFFLEtBQUssRUFBRSxDQUFDO1FBTmtDLDJCQUFzQixHQUF0QixzQkFBc0IsQ0FBeUI7UUFDM0QsZUFBVSxHQUFWLFVBQVUsQ0FBYTtRQUNOLGdDQUEyQixHQUEzQiwyQkFBMkIsQ0FBOEI7UUFDbkUsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFvQjtRQUNyQyxzQkFBaUIsR0FBakIsaUJBQWlCLENBQW9CO1FBZjFELGtDQUE2QixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQXdCLENBQUMsQ0FBQztRQUM1RixpQ0FBNEIsR0FBZ0MsSUFBSSxDQUFDLDZCQUE2QixDQUFDLEtBQUssQ0FBQztRQUU3Rix5QkFBb0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUEwQixDQUFDLENBQUM7UUFDckYsd0JBQW1CLEdBQWtDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLENBQUM7UUFJdEYsdUJBQWtCLEdBQTZCLEVBQUUsQ0FBQztRQVd6RCxJQUFJLENBQUMsc0JBQXNCLEdBQUcsSUFBSSxDQUFDLHNCQUFzQixDQUFDLHNCQUFzQixDQUFDO0lBQ2xGLENBQUM7SUFFRCxLQUFLLENBQUMsVUFBVTtRQUVmLFFBQVE7UUFDUixJQUFJLENBQUMsa0JBQWtCLEdBQUcsRUFBRSxDQUFDO1FBRTdCLDhCQUE4QjtRQUM5QixJQUFJLENBQUM7WUFDSixNQUFNLHNCQUFzQixHQUFHLENBQUMsTUFBTSxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLHNCQUFzQixFQUFFLE1BQU0sRUFBRSx1QkFBdUIsQ0FBQyxDQUFDLENBQUM7WUFDak4sS0FBSyxNQUFNLHFCQUFxQixJQUFJLHNCQUFzQixFQUFFLENBQUM7Z0JBQzVELE1BQU0sU0FBUyxHQUFHLHNCQUFzQixDQUFDLHFCQUFxQixDQUFDLENBQUM7Z0JBQ2hFLE1BQU0saUJBQWlCLEdBQUcsTUFBTSxJQUFJLENBQUMscUJBQXFCLENBQUMscUJBQXFCLENBQUMsQ0FBQztnQkFDbEYsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7b0JBQ3hCLE1BQU0sSUFBSSxDQUFDLHVCQUF1QixDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUMvQyxDQUFDO3FCQUFNLENBQUM7b0JBQ1AsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsaUJBQWlCLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQztnQkFDakcsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNoQixJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7Z0JBQzdCLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLDZCQUE2QixJQUFJLENBQUMsc0JBQXNCLEtBQUssS0FBSyxJQUFJLENBQUMsQ0FBQztZQUM5RixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxxQkFBcUIsQ0FBQyxHQUFRO1FBQzdCLE9BQU8sSUFBSSxDQUFDLHVCQUF1QixDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBQ3RGLENBQUM7SUFJTyx1QkFBdUIsQ0FBQyxHQUFRLEVBQUUsVUFBc0Q7UUFDL0YsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNoQyxPQUFPLFNBQVMsQ0FBQyxDQUFDLG1EQUFtRDtRQUN0RSxDQUFDO1FBRUQsSUFBSSxHQUFHLENBQUMsTUFBTSxLQUFLLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNqQyxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsSUFBSSxDQUFDO1lBQ0osTUFBTSxRQUFRLEdBQUcsVUFBVSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN4QyxJQUFJLFFBQVEsWUFBWSxPQUFPLEVBQUUsQ0FBQztnQkFDakMsT0FBTyxRQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsRUFBRSxLQUFLLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1lBQ2hILENBQUM7aUJBQU0sQ0FBQztnQkFDUCxPQUFPLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDL0MsQ0FBQztRQUNGLENBQUM7UUFBQyxNQUFNLENBQUM7WUFDUixPQUFPLFNBQVMsQ0FBQyxDQUFDLG9CQUFvQjtRQUN2QyxDQUFDO0lBQ0YsQ0FBQztJQUVPLGVBQWUsQ0FBQyxHQUFRO1FBQy9CLE9BQU8sbUJBQW1CLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ2hHLENBQUM7SUFFTyxrQkFBa0IsQ0FBQyxJQUFTLEVBQUUsUUFBZ0I7UUFDckQsSUFBSSxDQUFDO1lBQ0osTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLHNCQUFzQixDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsQ0FBQztZQUM5RCxNQUFNLG1CQUFtQixHQUFHLHNCQUFzQixDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3pELE9BQU87Z0JBQ04sRUFBRSxFQUFFLG1CQUFtQixDQUFDLEVBQUU7Z0JBQzFCLFVBQVUsRUFBRSxtQkFBbUIsQ0FBQyxVQUFVO2dCQUMxQyxPQUFPLEVBQUUsa0JBQWtCLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxtQkFBbUIsQ0FBQyxVQUFVLEVBQUUsMEJBQTBCLENBQUM7Z0JBQzFHLGVBQWUsRUFBRSxTQUFTLENBQUMsZUFBZTtnQkFDMUMsU0FBUyxFQUFFLFNBQVMsQ0FBQyxTQUFTO2FBQzlCLENBQUM7UUFDSCxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNoQixJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUN4QyxDQUFDO1FBRUQsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVPLHNCQUFzQixDQUFDLElBQVMsRUFBRSxRQUFnQjtRQUV6RCx1QkFBdUI7UUFDdkIsTUFBTSxlQUFlLEdBQXFCLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLDRCQUE0QjtRQUV2Rix5REFBeUQ7UUFDekQsSUFBSSxlQUFlLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUMvRCxlQUFlLENBQUMsT0FBTyxHQUFHLGVBQWUsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsdUJBQXVCLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUNyRyxDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sSUFBSSxLQUFLLENBQUMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO1FBQ2pGLENBQUM7UUFFRCxPQUFPLGVBQWUsQ0FBQztJQUN4QixDQUFDO0lBRUQsS0FBSyxDQUFDLHVCQUF1QixDQUFDLE9BQXdDLEVBQUUsZUFBd0I7UUFDL0YsTUFBTSxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsT0FBTyxFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBQzNGLE1BQU0sVUFBVSxHQUFHLFNBQVMsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDO1FBRS9DLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDbEUsTUFBTSxRQUFRLENBQUMsU0FBUyxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLGVBQWUsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUVsRixJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLEVBQUUsU0FBUyxFQUFFLGVBQWUsRUFBRSxDQUFDLENBQUM7UUFFN0QsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVPLG9CQUFvQixDQUFDLFVBQTBDLEVBQUUsRUFBRSxlQUF3QjtRQUNsRyxNQUFNLFFBQVEsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQzVFLE1BQU0sNkJBQTZCLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUN0RixNQUFNLDJCQUEyQixHQUFHLFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSx1QkFBdUIsQ0FBQyxDQUFDO1FBRXJHLE1BQU0scUJBQXFCLEdBQTZCLEVBQUUsQ0FBQztRQUUzRCxLQUFLLE1BQU0sTUFBTSxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQzlCLHFCQUFxQixDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxFQUFFLDZCQUE2QixFQUFFLDBCQUEwQixDQUFDLENBQUMsQ0FBQztRQUNoSixDQUFDO1FBRUQsT0FBTztZQUNOLFNBQVMsRUFBRSxzQkFBc0IsQ0FBQywyQkFBMkIsQ0FBQztZQUM5RCxlQUFlLEVBQUUsRUFBRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsZUFBZSxFQUFFO1NBQ3BFLENBQUM7SUFDSCxDQUFDO0lBRUQsS0FBSyxDQUFDLHNCQUFzQixDQUFDLFVBQWU7UUFDM0MsT0FBTyxzQkFBc0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUMzQyxDQUFDO0lBRUQsbUJBQW1CLENBQUMsU0FBK0I7UUFDbEQsT0FBTyxtQkFBbUIsQ0FBQyxTQUFTLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO0lBQy9FLENBQUM7SUFFRCxLQUFLLENBQUMsdUJBQXVCLENBQUMsU0FBK0I7UUFDNUQsSUFBSSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1lBQzFDLE9BQU8sQ0FBQyx5Q0FBeUM7UUFDbEQsQ0FBQztRQUVELG1CQUFtQjtRQUNuQixNQUFNLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUVoRCxnQ0FBZ0M7UUFDaEMsSUFBSSxDQUFDLDJCQUEyQixDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUUzRCxRQUFRO1FBQ1IsSUFBSSxDQUFDLDZCQUE2QixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUNwRCxDQUFDO0lBRU8sS0FBSyxDQUFDLHlCQUF5QixDQUFDLFNBQStCO1FBQ3RFLE1BQU0sVUFBVSxHQUFHLGNBQWMsQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDeEQsSUFBSSxDQUFDO1lBRUosbUJBQW1CO1lBQ25CLE1BQU0sUUFBUSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztZQUV2Qyx1Q0FBdUM7WUFDdkMsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3hJLElBQUksTUFBTSxRQUFRLENBQUMsTUFBTSxDQUFDLG9CQUFvQixDQUFDLEVBQUUsQ0FBQztnQkFDakQsTUFBTSxRQUFRLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxVQUFVLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUN0RSxDQUFDO1lBRUQsbUJBQW1CO1lBQ25CLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNoSSxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNoQixJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyx1Q0FBdUMsVUFBVSxLQUFLLEtBQUssSUFBSSxDQUFDLENBQUM7UUFDdkYsQ0FBQztJQUNGLENBQUM7SUFFRCxxQkFBcUI7UUFDcEIsT0FBTyxJQUFJLENBQUMsa0JBQWtCLENBQUM7SUFDaEMsQ0FBQztJQUVELEtBQUssQ0FBQyxjQUFjLENBQUMsTUFBbUIsRUFBRSxPQUFzQixFQUFFLElBQVM7UUFDMUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDckMsT0FBTyxTQUFTLENBQUMsQ0FBQyxzREFBc0Q7UUFDekUsQ0FBQztRQUVELE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLDBCQUEwQixDQUFDLE1BQU0sRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDN0UsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2QsT0FBTyxTQUFTLENBQUMsQ0FBQyw2Q0FBNkM7UUFDaEUsQ0FBQztRQUVELE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ2pGLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNiLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxnQkFBZ0I7UUFDaEIsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFFeEUsT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0lBRU8sS0FBSyxDQUFDLDBCQUEwQixDQUFDLE1BQW1CLEVBQUUsT0FBc0IsRUFBRSxhQUFtQjtRQUN4RyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDcEIsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBRUQsSUFBSSxxQkFBcUIsQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksMEJBQTBCLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsVUFBVSxFQUFFLGFBQWEsQ0FBQyxFQUFFLENBQUM7WUFDM0ksT0FBTyxLQUFLLENBQUMsQ0FBQyx5REFBeUQ7UUFDeEUsQ0FBQztRQUVELDZFQUE2RTtRQUM3RSxJQUFJLDZCQUE2QixDQUFDLE9BQU8sRUFBRSxhQUFhLENBQUMsRUFBRSxDQUFDO1lBQzNELE1BQU0sSUFBSSxDQUFDLGlCQUFpQixDQUFDLGNBQWMsQ0FBQztnQkFDM0MsSUFBSSxFQUFFLE1BQU07Z0JBQ1osT0FBTyxFQUFFLENBQUMsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQzlFLE9BQU8sRUFBRSxRQUFRLENBQUMsd0JBQXdCLEVBQUUsZ0NBQWdDLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxDQUFDO2dCQUN0RyxNQUFNLEVBQUUsUUFBUSxDQUFDLHVCQUF1QixFQUFFLHVHQUF1RyxDQUFDO2FBQ2xKLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLFNBQVMsQ0FBQyxDQUFDO1lBRTNELE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDLENBQUMsS0FBSztJQUNuQixDQUFDO0lBRU8sS0FBSyxDQUFDLGdCQUFnQixDQUFDLE1BQW1CLEVBQUUsU0FBK0I7UUFDbEYsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNwQixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBRWYsK0RBQStEO1FBQy9ELElBQUksVUFBOEIsQ0FBQztRQUNuQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO1lBQzdDLElBQUksTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDOUIsVUFBVSxHQUFHLE1BQU0sSUFBSSxDQUFDLGlCQUFpQixDQUFDLHVCQUF1QixDQUFDLEVBQUUsU0FBUyxFQUFFLGVBQWUsRUFBRSxNQUFNLENBQUMsZUFBZSxFQUFFLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNySixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsVUFBVSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsTUFBTSxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUM7WUFDckgsQ0FBQztRQUNGLENBQUM7UUFFRCxnRUFBZ0U7UUFDaEUsSUFBSSxxQkFBcUIsQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksSUFBSSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDO1lBQ3ZHLE1BQU0sSUFBSSxDQUFDLHVCQUF1QixDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUM1RCxDQUFDO1FBRUQsd0VBQXdFO1FBQ3hFLE1BQU0sQ0FBQyxNQUFNLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztRQUNwQyxNQUFNLENBQUMsTUFBTSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUM7UUFFdEMsT0FBTyxFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUUsQ0FBQztJQUNsQyxDQUFDO0NBQ0QsQ0FBQTtBQXZRWSwrQkFBK0I7SUFlekMsV0FBQSx1QkFBdUIsQ0FBQTtJQUN2QixXQUFBLFdBQVcsQ0FBQTtJQUNYLFdBQUEsNEJBQTRCLENBQUE7SUFDNUIsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLGtCQUFrQixDQUFBO0dBbkJSLCtCQUErQixDQXVRM0MifQ==