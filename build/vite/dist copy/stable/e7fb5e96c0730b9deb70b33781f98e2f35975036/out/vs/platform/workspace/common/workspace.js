/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../nls.js';
import { basename, extname } from '../../../base/common/path.js';
import { TernarySearchTree } from '../../../base/common/ternarySearchTree.js';
import { extname as resourceExtname, basenameOrAuthority, joinPath, extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Schemas } from '../../../base/common/network.js';
export const IWorkspaceContextService = createDecorator('contextService');
export function isSingleFolderWorkspaceIdentifier(obj) {
    const singleFolderIdentifier = obj;
    return typeof singleFolderIdentifier?.id === 'string' && URI.isUri(singleFolderIdentifier.uri);
}
export function isEmptyWorkspaceIdentifier(obj) {
    const emptyWorkspaceIdentifier = obj;
    return typeof emptyWorkspaceIdentifier?.id === 'string'
        && !isSingleFolderWorkspaceIdentifier(obj)
        && !isWorkspaceIdentifier(obj);
}
export const EXTENSION_DEVELOPMENT_EMPTY_WINDOW_WORKSPACE = { id: 'ext-dev' };
export const UNKNOWN_EMPTY_WINDOW_WORKSPACE = { id: 'empty-window' };
export function toWorkspaceIdentifier(arg0, isExtensionDevelopment) {
    // Empty workspace
    if (typeof arg0 === 'string' || typeof arg0 === 'undefined') {
        // With a backupPath, the basename is the empty workspace identifier
        if (typeof arg0 === 'string') {
            return {
                id: basename(arg0)
            };
        }
        // Extension development empty windows have backups disabled
        // so we return a constant workspace identifier for extension
        // authors to allow to restore their workspace state even then.
        if (isExtensionDevelopment) {
            return EXTENSION_DEVELOPMENT_EMPTY_WINDOW_WORKSPACE;
        }
        return UNKNOWN_EMPTY_WINDOW_WORKSPACE;
    }
    // Multi root
    const workspace = arg0;
    if (workspace.configuration) {
        return {
            id: workspace.id,
            configPath: workspace.configuration
        };
    }
    // Single folder
    if (workspace.folders.length === 1) {
        return {
            id: workspace.id,
            uri: workspace.folders[0].uri
        };
    }
    // Empty window
    return {
        id: workspace.id
    };
}
export function isWorkspaceIdentifier(obj) {
    const workspaceIdentifier = obj;
    return typeof workspaceIdentifier?.id === 'string' && URI.isUri(workspaceIdentifier.configPath);
}
export function reviveIdentifier(identifier) {
    // Single Folder
    const singleFolderIdentifierCandidate = identifier;
    if (singleFolderIdentifierCandidate?.uri) {
        return { id: singleFolderIdentifierCandidate.id, uri: URI.revive(singleFolderIdentifierCandidate.uri) };
    }
    // Multi folder
    const workspaceIdentifierCandidate = identifier;
    if (workspaceIdentifierCandidate?.configPath) {
        return { id: workspaceIdentifierCandidate.id, configPath: URI.revive(workspaceIdentifierCandidate.configPath) };
    }
    // Empty
    if (identifier?.id) {
        return { id: identifier.id };
    }
    return undefined;
}
export var WorkbenchState;
(function (WorkbenchState) {
    WorkbenchState[WorkbenchState["EMPTY"] = 1] = "EMPTY";
    WorkbenchState[WorkbenchState["FOLDER"] = 2] = "FOLDER";
    WorkbenchState[WorkbenchState["WORKSPACE"] = 3] = "WORKSPACE";
})(WorkbenchState || (WorkbenchState = {}));
export function isWorkspace(thing) {
    const candidate = thing;
    return !!(candidate && typeof candidate === 'object'
        && typeof candidate.id === 'string'
        && Array.isArray(candidate.folders));
}
export function isWorkspaceFolder(thing) {
    const candidate = thing;
    return !!(candidate && typeof candidate === 'object'
        && URI.isUri(candidate.uri)
        && typeof candidate.name === 'string'
        && typeof candidate.toResource === 'function');
}
export class Workspace {
    get folders() { return this._folders; }
    set folders(folders) {
        this._folders = folders;
        this.updateFoldersMap();
    }
    constructor(_id, folders, _transient, _configuration, ignorePathCasing) {
        this._id = _id;
        this._transient = _transient;
        this._configuration = _configuration;
        this.ignorePathCasing = ignorePathCasing;
        this.foldersMap = TernarySearchTree.forUris(this.ignorePathCasing, () => true);
        this.folders = folders;
    }
    update(workspace) {
        this._id = workspace.id;
        this._configuration = workspace.configuration;
        this._transient = workspace.transient;
        this.ignorePathCasing = workspace.ignorePathCasing;
        this.folders = workspace.folders;
    }
    get id() {
        return this._id;
    }
    get transient() {
        return this._transient;
    }
    get configuration() {
        return this._configuration;
    }
    set configuration(configuration) {
        this._configuration = configuration;
    }
    getFolder(resource) {
        if (!resource) {
            return null;
        }
        return this.foldersMap.findSubstr(resource) || null;
    }
    updateFoldersMap() {
        this.foldersMap = TernarySearchTree.forUris(this.ignorePathCasing, () => true);
        for (const folder of this.folders) {
            this.foldersMap.set(folder.uri, folder);
        }
    }
    toJSON() {
        return { id: this.id, folders: this.folders, transient: this.transient, configuration: this.configuration };
    }
}
export class WorkspaceFolder {
    constructor(data, 
    /**
     * Provides access to the original metadata for this workspace
     * folder. This can be different from the metadata provided in
     * this class:
     * - raw paths can be relative
     * - raw paths are not normalized
     */
    raw) {
        this.raw = raw;
        this.uri = data.uri;
        this.index = data.index;
        this.name = data.name;
    }
    toResource(relativePath) {
        return joinPath(this.uri, relativePath);
    }
    toJSON() {
        return { uri: this.uri, name: this.name, index: this.index };
    }
}
export function toWorkspaceFolder(resource) {
    return new WorkspaceFolder({ uri: resource, index: 0, name: basenameOrAuthority(resource) }, { uri: resource.toString() });
}
export const WORKSPACE_EXTENSION = 'code-workspace';
export const WORKSPACE_SUFFIX = `.${WORKSPACE_EXTENSION}`;
export const WORKSPACE_FILTER = [{ name: localize('codeWorkspace', "Code Workspace"), extensions: [WORKSPACE_EXTENSION] }];
export const UNTITLED_WORKSPACE_NAME = 'workspace.json';
export function isUntitledWorkspace(path, environmentService) {
    return extUriBiasedIgnorePathCase.isEqualOrParent(path, environmentService.untitledWorkspacesHome);
}
export function isTemporaryWorkspace(arg1) {
    let path;
    if (URI.isUri(arg1)) {
        path = arg1;
    }
    else {
        path = arg1.configuration;
    }
    return path?.scheme === Schemas.tmp;
}
export const STANDALONE_EDITOR_WORKSPACE_ID = '4064f6ec-cb38-4ad0-af64-ee6467e63c82';
export function isStandaloneEditorWorkspace(workspace) {
    return workspace.id === STANDALONE_EDITOR_WORKSPACE_ID;
}
export function isSavedWorkspace(path, environmentService) {
    return !isUntitledWorkspace(path, environmentService) && !isTemporaryWorkspace(path);
}
export function hasWorkspaceFileExtension(path) {
    const ext = (typeof path === 'string') ? extname(path) : resourceExtname(path);
    return ext === WORKSPACE_SUFFIX;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBRTNDLE9BQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDakUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDOUUsT0FBTyxFQUFFLE9BQU8sSUFBSSxlQUFlLEVBQUUsbUJBQW1CLEVBQUUsUUFBUSxFQUFFLDBCQUEwQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDMUksT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSw2QkFBNkIsQ0FBQztBQUNqRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFOUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRTFELE1BQU0sQ0FBQyxNQUFNLHdCQUF3QixHQUFHLGVBQWUsQ0FBMkIsZ0JBQWdCLENBQUMsQ0FBQztBQThIcEcsTUFBTSxVQUFVLGlDQUFpQyxDQUFDLEdBQVk7SUFDN0QsTUFBTSxzQkFBc0IsR0FBRyxHQUFtRCxDQUFDO0lBRW5GLE9BQU8sT0FBTyxzQkFBc0IsRUFBRSxFQUFFLEtBQUssUUFBUSxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsc0JBQXNCLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDaEcsQ0FBQztBQUVELE1BQU0sVUFBVSwwQkFBMEIsQ0FBQyxHQUFZO0lBQ3RELE1BQU0sd0JBQXdCLEdBQUcsR0FBNEMsQ0FBQztJQUM5RSxPQUFPLE9BQU8sd0JBQXdCLEVBQUUsRUFBRSxLQUFLLFFBQVE7V0FDbkQsQ0FBQyxpQ0FB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