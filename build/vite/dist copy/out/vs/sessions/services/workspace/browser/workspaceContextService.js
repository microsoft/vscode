/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter, Event } from '../../../../base/common/event.js';
import { Queue } from '../../../../base/common/async.js';
import { removeTrailingPathSeparator } from '../../../../base/common/resources.js';
import { Workspace, WorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { getWorkspaceIdentifier } from '../../../../workbench/services/workspaces/browser/workspaces.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
export class SessionsWorkspaceContextService extends Disposable {
    constructor(workspaceIdentifier, uriIdentityService) {
        super();
        this.uriIdentityService = uriIdentityService;
        this.onDidChangeWorkbenchState = Event.None;
        this.onDidChangeWorkspaceName = Event.None;
        this.onDidEnterWorkspace = Event.None;
        this._onWillChangeWorkspaceFolders = new Emitter();
        this.onWillChangeWorkspaceFolders = this._onWillChangeWorkspaceFolders.event;
        this._onDidChangeWorkspaceFolders = this._register(new Emitter());
        this.onDidChangeWorkspaceFolders = this._onDidChangeWorkspaceFolders.event;
        this._updateFoldersQueue = this._register(new Queue());
        this.workspace = new Workspace(workspaceIdentifier.id, [], false, workspaceIdentifier.configPath, uri => uriIdentityService.extUri.ignorePathCasing(uri));
    }
    getCompleteWorkspace() {
        return Promise.resolve(this.workspace);
    }
    getWorkspace() {
        return this.workspace;
    }
    getWorkbenchState() {
        return 3 /* WorkbenchState.WORKSPACE */;
    }
    hasWorkspaceData() {
        return true;
    }
    getWorkspaceFolder(resource) {
        return this.workspace.getFolder(resource);
    }
    isInsideWorkspace(resource) {
        return !!this.getWorkspaceFolder(resource);
    }
    isCurrentWorkspace(workspaceIdOrFolder) {
        return false;
    }
    addFolders(foldersToAdd) {
        return this.doUpdateFolders(foldersToAdd, []);
    }
    removeFolders(foldersToRemove) {
        return this.doUpdateFolders([], foldersToRemove);
    }
    async updateFolders(index, deleteCount, foldersToAddCandidates) {
        const folders = this.workspace.folders;
        let foldersToDelete = [];
        if (typeof deleteCount === 'number') {
            foldersToDelete = folders.slice(index, index + deleteCount).map(folder => folder.uri);
        }
        let foldersToAdd = [];
        if (Array.isArray(foldersToAddCandidates)) {
            foldersToAdd = foldersToAddCandidates.map(folderToAdd => ({ uri: removeTrailingPathSeparator(folderToAdd.uri), name: folderToAdd.name }));
        }
        return this.doUpdateFolders(foldersToAdd, foldersToDelete, index);
    }
    async enterWorkspace(_path) { }
    async createAndEnterWorkspace(_folders, _path) { }
    async saveAndEnterWorkspace(_path) { }
    async copyWorkspaceSettings(_toWorkspace) { }
    async pickNewWorkspacePath() { return undefined; }
    doUpdateFolders(foldersToAdd, foldersToRemove, index) {
        return this._updateFoldersQueue.queue(() => this._doUpdateFolders(foldersToAdd, foldersToRemove, index));
    }
    async _doUpdateFolders(foldersToAdd, foldersToRemove, index) {
        if (foldersToAdd.length === 0 && foldersToRemove.length === 0) {
            return;
        }
        const currentFolders = this.workspace.folders;
        // Remove folders
        let newFolders = currentFolders.filter(folder => !foldersToRemove.some(toRemove => this.uriIdentityService.extUri.isEqual(folder.uri, toRemove)));
        // Add folders
        const foldersToAddWorkspaceFolders = foldersToAdd
            .filter(folderToAdd => !newFolders.some(existing => this.uriIdentityService.extUri.isEqual(existing.uri, folderToAdd.uri)))
            .map(folderToAdd => new WorkspaceFolder({ uri: folderToAdd.uri, name: folderToAdd.name || this.uriIdentityService.extUri.basenameOrAuthority(folderToAdd.uri), index: 0 }, { uri: folderToAdd.uri.toString() }));
        if (foldersToAddWorkspaceFolders.length > 0) {
            if (typeof index === 'number' && index >= 0 && index < newFolders.length) {
                newFolders = [...newFolders.slice(0, index), ...foldersToAddWorkspaceFolders, ...newFolders.slice(index)];
            }
            else {
                newFolders = [...newFolders, ...foldersToAddWorkspaceFolders];
            }
        }
        // Recompute indices
        newFolders = newFolders.map((f, i) => new WorkspaceFolder({ uri: f.uri, name: f.name, index: i }, f.raw));
        // Compute change event
        const added = newFolders.filter(folder => !currentFolders.some(existing => this.uriIdentityService.extUri.isEqual(existing.uri, folder.uri)));
        const removed = currentFolders.filter(folder => !newFolders.some(existing => this.uriIdentityService.extUri.isEqual(existing.uri, folder.uri)));
        const changed = [];
        const changes = { added, removed, changed };
        if (added.length === 0 && removed.length === 0) {
            return;
        }
        // Fire will change event
        const joinPromises = [];
        this._onWillChangeWorkspaceFolders.fire({
            changes,
            fromCache: false,
            join(promise) { joinPromises.push(promise); }
        });
        await Promise.allSettled(joinPromises);
        // Update workspace
        const workspaceIdentifier = getWorkspaceIdentifier(this.workspace.configuration);
        const workspace = new Workspace(workspaceIdentifier.id, newFolders, false, workspaceIdentifier.configPath, uri => this.uriIdentityService.extUri.ignorePathCasing(uri));
        this.workspace.update(workspace);
        // Fire did change event
        this._onDidChangeWorkspaceFolders.fire(changes);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlQ29udGV4dFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9zZXJ2aWNlcy93b3Jrc3BhY2UvYnJvd3Nlci93b3Jrc3BhY2VDb250ZXh0U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUduRixPQUFPLEVBQUUsU0FBUyxFQUFFLGVBQWUsRUFBa00sTUFBTSxvREFBb0QsQ0FBQztBQUVoUyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUV6RyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsTUFBTSxPQUFPLCtCQUFnQyxTQUFRLFVBQVU7SUFpQjlELFlBQ0MsbUJBQXlDLEVBQ3hCLGtCQUF1QztRQUV4RCxLQUFLLEVBQUUsQ0FBQztRQUZTLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBcUI7UUFmaEQsOEJBQXlCLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUN2Qyw2QkFBd0IsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ3RDLHdCQUFtQixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFFekIsa0NBQTZCLEdBQUcsSUFBSSxPQUFPLEVBQW9DLENBQUM7UUFDeEYsaUNBQTRCLEdBQUcsSUFBSSxDQUFDLDZCQUE2QixDQUFDLEtBQUssQ0FBQztRQUVoRSxpQ0FBNEIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFnQyxDQUFDLENBQUM7UUFDbkcsZ0NBQTJC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