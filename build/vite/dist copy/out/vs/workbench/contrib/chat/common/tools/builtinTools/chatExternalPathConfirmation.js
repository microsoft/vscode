/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ResourceMap, ResourceSet } from '../../../../../../base/common/map.js';
import { dirname, extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { observableMemento } from '../../../../../../platform/observable/common/observableMemento.js';
const workspaceAllowlistMemento = observableMemento({
    key: 'chat.externalPath.workspaceAllowlist',
    defaultValue: [],
    toStorage: value => JSON.stringify(value),
    fromStorage: value => {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    },
});
/**
 * Confirmation contribution for read_file and list_dir tools that allows users to approve
 * accessing paths outside the workspace, with an option to allow all access
 * from a containing folder for the current chat session.
 */
export class ChatExternalPathConfirmationContribution {
    constructor(_getPathInfo, _labelService, _findGitRoot, storageService, _pickFolder) {
        this._getPathInfo = _getPathInfo;
        this._labelService = _labelService;
        this._findGitRoot = _findGitRoot;
        this._pickFolder = _pickFolder;
        this.canUseDefaultApprovals = false;
        this._sessionFolderAllowlist = new ResourceMap();
        /** Cache of path URI -> resolved git root URI (or null if not in a repo) */
        this._gitRootCache = new ResourceMap();
        if (storageService) {
            this._workspaceAllowlist = workspaceAllowlistMemento(1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */, storageService);
        }
    }
    dispose() {
        this._workspaceAllowlist?.dispose();
    }
    _getWorkspaceFolders() {
        if (!this._workspaceAllowlist) {
            return new ResourceSet();
        }
        const set = new ResourceSet();
        for (const s of this._workspaceAllowlist.get()) {
            try {
                set.add(URI.parse(s));
            }
            catch {
                // ignore malformed URIs
            }
        }
        return set;
    }
    _setWorkspaceFolders(folders) {
        if (!this._workspaceAllowlist) {
            return;
        }
        const uriStrings = [];
        for (const uri of folders) {
            uriStrings.push(uri.toString());
        }
        this._workspaceAllowlist.set(uriStrings, undefined);
    }
    getPreConfirmAction(ref) {
        const pathInfo = this._getPathInfo(ref);
        if (!pathInfo) {
            return undefined;
        }
        // Parse the file path to a URI
        let pathUri;
        try {
            pathUri = URI.file(pathInfo.path);
        }
        catch {
            return undefined;
        }
        // Check workspace-level allowlist
        const workspaceFolders = this._getWorkspaceFolders();
        for (const folderUri of workspaceFolders) {
            if (extUriBiasedIgnorePathCase.isEqualOrParent(pathUri, folderUri)) {
                return { type: 4 /* ToolConfirmKind.UserAction */ };
            }
        }
        // Check session-level allowlist
        if (ref.chatSessionResource) {
            const sessionFolders = this._sessionFolderAllowlist.get(ref.chatSessionResource);
            if (sessionFolders) {
                for (const folderUri of sessionFolders) {
                    if (extUriBiasedIgnorePathCase.isEqualOrParent(pathUri, folderUri)) {
                        return { type: 4 /* ToolConfirmKind.UserAction */ };
                    }
                }
            }
        }
        return undefined;
    }
    getPreConfirmActions(ref) {
        const pathInfo = this._getPathInfo(ref);
        if (!pathInfo || !ref.chatSessionResource) {
            return [];
        }
        // Parse the path to a URI
        let pathUri;
        try {
            pathUri = URI.file(pathInfo.path);
        }
        catch {
            return [];
        }
        // For directories, use the path itself; for files, use the parent directory
        const folderUri = pathInfo.isDirectory ? pathUri : dirname(pathUri);
        const sessionResource = ref.chatSessionResource;
        const actions = [
            {
                label: localize('allowFolderSession', 'Allow this folder in this session'),
                detail: localize('allowFolderSessionDetail', 'Allow reading files from this folder without further confirmation in this chat session'),
                select: async () => {
                    let folders = this._sessionFolderAllowlist.get(sessionResource);
                    if (!folders) {
                        folders = new ResourceSet();
                        this._sessionFolderAllowlist.set(sessionResource, folders);
                    }
                    folders.add(folderUri);
                    return true;
                }
            }
        ];
        // If a git root finder is available, offer to allow the entire repository
        if (this._findGitRoot) {
            const findGitRoot = this._findGitRoot;
            const gitRootCache = this._gitRootCache;
            const allowlist = this._sessionFolderAllowlist;
            // Check if we already know the git root for this path (or that there is none)
            const cached = gitRootCache.get(pathUri);
            if (cached === null) {
                // Previously resolved: not in a git repository, don't show the option
            }
            else if (cached) {
                // Previously resolved: show with the known repo path
                actions.push({
                    label: localize('allowRepoSession', 'Allow all files in this repository for this session'),
                    detail: localize('allowRepoSessionDetail', 'Allow reading files from {0}', cached.fsPath),
                    select: async () => {
                        let folders = allowlist.get(sessionResource);
                        if (!folders) {
                            folders = new ResourceSet();
                            allowlist.set(sessionResource, folders);
                        }
                        folders.add(cached);
                        return true;
                    }
                });
            }
            else {
                // Not yet resolved: show the option and resolve on selection
                actions.push({
                    label: localize('allowRepoSession', 'Allow all files in this repository for this session'),
                    detail: localize('allowRepoSessionDetailLookup', 'Looks up the containing git repository for this path'),
                    select: async () => {
                        const gitRootUri = await findGitRoot(pathUri);
                        gitRootCache.set(pathUri, gitRootUri ?? null);
                        let folders = allowlist.get(sessionResource);
                        if (!folders) {
                            folders = new ResourceSet();
                            allowlist.set(sessionResource, folders);
                        }
                        // If we found the git root, allow the entire repo; otherwise fall back to just this folder
                        folders.add(gitRootUri ?? folderUri);
                        return true;
                    }
                });
            }
        }
        return actions;
    }
    getManageActions() {
        const items = [];
        // Workspace-level entries (persisted)
        const workspaceFolders = this._getWorkspaceFolders();
        for (const folderUri of workspaceFolders) {
            items.push({
                label: this._labelService.getUriLabel(folderUri),
                description: localize('workspaceScope', "Workspace"),
                checked: true,
                onDidChangeChecked: (checked) => {
                    if (!checked) {
                        workspaceFolders.delete(folderUri);
                        this._setWorkspaceFolders(workspaceFolders);
                    }
                    else {
                        workspaceFolders.add(folderUri);
                        this._setWorkspaceFolders(workspaceFolders);
                    }
                },
            });
        }
        // Session-level entries (ephemeral)
        const allSessionFolders = new ResourceSet();
        for (const [, folders] of this._sessionFolderAllowlist) {
            for (const folder of folders) {
                allSessionFolders.add(folder);
            }
        }
        for (const folderUri of allSessionFolders) {
            const wasInSessions = [...this._sessionFolderAllowlist].filter(([, folders]) => folders.has(folderUri));
            items.push({
                label: this._labelService.getUriLabel(folderUri),
                description: localize('sessionScope', "Session"),
                checked: true,
                onDidChangeChecked: (checked) => {
                    if (!checked) {
                        for (const [, folders] of wasInSessions) {
                            folders.delete(folderUri);
                        }
                    }
                    else {
                        for (const [, folders] of wasInSessions) {
                            folders.add(folderUri);
                        }
                    }
                },
            });
        }
        // "Add Path..." option to add a new workspace-level folder
        if (this._pickFolder) {
            const pickFolder = this._pickFolder;
            items.push({
                pickable: false,
                label: localize('addPath', "Add Path..."),
                description: localize('addPathDescription', "Allow a folder in this workspace"),
                onDidOpen: async () => {
                    const uri = await pickFolder();
                    if (uri) {
                        const folders = this._getWorkspaceFolders();
                        folders.add(uri);
                        this._setWorkspaceFolders(folders);
                    }
                }
            });
        }
        return items;
    }
    reset() {
        this._sessionFolderAllowlist.clear();
        this._gitRootCache.clear();
        if (this._workspaceAllowlist) {
            this._workspaceAllowlist.set([], undefined);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEV4dGVybmFsUGF0aENvbmZpcm1hdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy9jaGF0RXh0ZXJuYWxQYXRoQ29uZmlybWF0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEYsT0FBTyxFQUFFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFcEQsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBVXpILE1BQU0seUJBQXlCLEdBQUcsaUJBQWlCLENBQW9CO0lBQ3RFLEdBQUcsRUFBRSxzQ0FBc0M7SUFDM0MsWUFBWSxFQUFFLEVBQUU7SUFDaEIsU0FBUyxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUM7SUFDekMsV0FBVyxFQUFFLEtBQUssQ0FBQyxFQUFFO1FBQ3BCLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDakMsT0FBTyxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQUM1QyxDQUFDO0NBQ0QsQ0FBQyxDQUFDO0FBT0g7Ozs7R0FJRztBQUNILE1BQU0sT0FBTyx3Q0FBd0M7SUFRcEQsWUFDa0IsWUFBdUYsRUFDdkYsYUFBNEIsRUFDNUIs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