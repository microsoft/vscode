/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isUNC, toSlashes } from '../../../base/common/extpath.js';
import * as json from '../../../base/common/json.js';
import * as jsonEdit from '../../../base/common/jsonEdit.js';
import { normalizeDriveLetter } from '../../../base/common/labels.js';
import { Schemas } from '../../../base/common/network.js';
import { isAbsolute, posix } from '../../../base/common/path.js';
import { isLinux, isMacintosh, isWindows } from '../../../base/common/platform.js';
import { isEqualAuthority } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { getRemoteAuthority } from '../../remote/common/remoteHosts.js';
import { WorkspaceFolder } from '../../workspace/common/workspace.js';
export const IWorkspacesService = createDecorator('workspacesService');
export function isRecentWorkspace(curr) {
    return curr.hasOwnProperty('workspace');
}
export function isRecentFolder(curr) {
    return curr.hasOwnProperty('folderUri');
}
export function isRecentFile(curr) {
    return curr.hasOwnProperty('fileUri');
}
//#endregion
//#region Workspace File Utilities
export function isStoredWorkspaceFolder(obj) {
    return isRawFileWorkspaceFolder(obj) || isRawUriWorkspaceFolder(obj);
}
function isRawFileWorkspaceFolder(obj) {
    const candidate = obj;
    return typeof candidate?.path === 'string' && (!candidate.name || typeof candidate.name === 'string');
}
function isRawUriWorkspaceFolder(obj) {
    const candidate = obj;
    return typeof candidate?.uri === 'string' && (!candidate.name || typeof candidate.name === 'string');
}
/**
 * Given a folder URI and the workspace config folder, computes the `IStoredWorkspaceFolder`
 * using a relative or absolute path or a uri.
 * Undefined is returned if the `folderURI` and the `targetConfigFolderURI` don't have the
 * same schema or authority.
 *
 * @param folderURI a workspace folder
 * @param forceAbsolute if set, keep the path absolute
 * @param folderName a workspace name
 * @param targetConfigFolderURI the folder where the workspace is living in
 */
export function getStoredWorkspaceFolder(folderURI, forceAbsolute, folderName, targetConfigFolderURI, extUri) {
    // Scheme mismatch: use full absolute URI as `uri`
    if (folderURI.scheme !== targetConfigFolderURI.scheme) {
        return { name: folderName, uri: folderURI.toString(true) };
    }
    // Always prefer a relative path if possible unless
    // prevented to make the workspace file shareable
    // with other users
    let folderPath = !forceAbsolute ? extUri.relativePath(targetConfigFolderURI, folderURI) : undefined;
    if (folderPath !== undefined) {
        if (folderPath.length === 0) {
            folderPath = '.';
        }
        else {
            if (isWindows) {
                folderPath = massagePathForWindows(folderPath);
            }
        }
    }
    // We could not resolve a relative path
    else {
        // Local file: use `fsPath`
        if (folderURI.scheme === Schemas.file) {
            folderPath = folderURI.fsPath;
            if (isWindows) {
                folderPath = massagePathForWindows(folderPath);
            }
        }
        // Different authority: use full absolute URI
        else if (!extUri.isEqualAuthority(folderURI.authority, targetConfigFolderURI.authority)) {
            return { name: folderName, uri: folderURI.toString(true) };
        }
        // Non-local file: use `path` of URI
        else {
            folderPath = folderURI.path;
        }
    }
    return { name: folderName, path: folderPath };
}
function massagePathForWindows(folderPath) {
    // Drive letter should be upper case
    folderPath = normalizeDriveLetter(folderPath);
    // Always prefer slash over backslash unless
    // we deal with UNC paths where backslash is
    // mandatory.
    if (!isUNC(folderPath)) {
        folderPath = toSlashes(folderPath);
    }
    return folderPath;
}
export function toWorkspaceFolders(configuredFolders, workspaceConfigFile, extUri) {
    const result = [];
    const seen = new Set();
    const relativeTo = extUri.dirname(workspaceConfigFile);
    for (const configuredFolder of configuredFolders) {
        let uri = undefined;
        if (isRawFileWorkspaceFolder(configuredFolder)) {
            if (configuredFolder.path) {
                uri = extUri.resolvePath(relativeTo, configuredFolder.path);
            }
        }
        else if (isRawUriWorkspaceFolder(configuredFolder)) {
            try {
                uri = URI.parse(configuredFolder.uri);
                if (uri.path[0] !== posix.sep) {
                    uri = uri.with({ path: posix.sep + uri.path }); // this makes sure all workspace folder are absolute
                }
            }
            catch (e) {
                console.warn(e); // ignore
            }
        }
        if (uri) {
            // remove duplicates
            const comparisonKey = extUri.getComparisonKey(uri);
            if (!seen.has(comparisonKey)) {
                seen.add(comparisonKey);
                const name = configuredFolder.name || extUri.basenameOrAuthority(uri);
                result.push(new WorkspaceFolder({ uri, name, index: result.length }, configuredFolder));
            }
        }
    }
    return result;
}
/**
 * Rewrites the content of a workspace file to be saved at a new location.
 * Throws an exception if file is not a valid workspace file
 */
export function rewriteWorkspaceFileForNewLocation(rawWorkspaceContents, configPathURI, isFromUntitledWorkspace, targetConfigPathURI, extUri) {
    const storedWorkspace = doParseStoredWorkspace(configPathURI, rawWorkspaceContents);
    const sourceConfigFolder = extUri.dirname(configPathURI);
    const targetConfigFolder = extUri.dirname(targetConfigPathURI);
    const rewrittenFolders = [];
    for (const folder of storedWorkspace.folders) {
        const folderURI = isRawFileWorkspaceFolder(folder) ? extUri.resolvePath(sourceConfigFolder, folder.path) : URI.parse(folder.uri);
        let absolute;
        if (isFromUntitledWorkspace) {
            absolute = false; // if it was an untitled workspace, try to make paths relative
        }
        else {
            absolute = !isRawFileWorkspaceFolder(folder) || isAbsolute(folder.path); // for existing workspaces, preserve whether a path was absolute or relative
        }
        rewrittenFolders.push(getStoredWorkspaceFolder(folderURI, absolute, folder.name, targetConfigFolder, extUri));
    }
    // Preserve as much of the existing workspace as possible by using jsonEdit
    // and only changing the folders portion.
    const formattingOptions = { insertSpaces: false, tabSize: 4, eol: (isLinux || isMacintosh) ? '\n' : '\r\n' };
    const edits = jsonEdit.setProperty(rawWorkspaceContents, ['folders'], rewrittenFolders, formattingOptions);
    let newContent = jsonEdit.applyEdits(rawWorkspaceContents, edits);
    if (isEqualAuthority(storedWorkspace.remoteAuthority, getRemoteAuthority(targetConfigPathURI))) {
        // unsaved remote workspaces have the remoteAuthority set. Remove it when no longer nexessary.
        newContent = jsonEdit.applyEdits(newContent, jsonEdit.removeProperty(newContent, ['remoteAuthority'], formattingOptions));
    }
    return newContent;
}
function doParseStoredWorkspace(path, contents) {
    // Parse workspace file
    const storedWorkspace = json.parse(contents); // use fault tolerant parser
    // Filter out folders which do not have a path or uri set
    if (storedWorkspace && Array.isArray(storedWorkspace.folders)) {
        storedWorkspace.folders = storedWorkspace.folders.filter(folder => isStoredWorkspaceFolder(folder));
    }
    else {
        throw new Error(`${path} looks like an invalid workspace file.`);
    }
    return storedWorkspace;
}
function isSerializedRecentWorkspace(data) {
    const candidate = data;
    return typeof candidate?.workspace === 'object' && typeof candidate.workspace.id === 'string' && typeof candidate.workspace.configPath === 'string';
}
function isSerializedRecentFolder(data) {
    const candidate = data;
    return typeof candidate?.folderUri === 'string';
}
function isSerializedRecentFile(data) {
    const candidate = data;
    return typeof candidate?.fileUri === 'string';
}
export function restoreRecentlyOpened(data, logService) {
    const result = { workspaces: [], files: [] };
    if (data) {
        const restoreGracefully = function (entries, onEntry) {
            for (let i = 0; i < entries.length; i++) {
                try {
                    onEntry(entries[i], i);
                }
                catch (e) {
                    logService.warn(`Error restoring recent entry ${JSON.stringify(entries[i])}: ${e.toString()}. Skip entry.`);
                }
            }
        };
        const storedRecents = data;
        if (Array.isArray(storedRecents.entries)) {
            restoreGracefully(storedRecents.entries, entry => {
                const label = entry.label;
                const remoteAuthority = entry.remoteAuthority;
                if (isSerializedRecentWorkspace(entry)) {
                    result.workspaces.push({ label, remoteAuthority, workspace: { id: entry.workspace.id, configPath: URI.parse(entry.workspace.configPath) } });
                }
                else if (isSerializedRecentFolder(entry)) {
                    result.workspaces.push({ label, remoteAuthority, folderUri: URI.parse(entry.folderUri) });
                }
                else if (isSerializedRecentFile(entry)) {
                    result.files.push({ label, remoteAuthority, fileUri: URI.parse(entry.fileUri) });
                }
            });
        }
    }
    return result;
}
export function toStoreData(recents) {
    const serialized = { entries: [] };
    const storeLabel = (label, uri) => {
        // Only store the label if it is provided
        // and only if it differs from the path
        // This gives us a chance to render the
        // path better, e.g. use `~` for home.
        return label && label !== uri.fsPath && label !== uri.path;
    };
    for (const recent of recents.workspaces) {
        if (isRecentFolder(recent)) {
            serialized.entries.push({
                folderUri: recent.folderUri.toString(),
                label: storeLabel(recent.label, recent.folderUri) ? recent.label : undefined,
                remoteAuthority: recent.remoteAuthority
            });
        }
        else {
            serialized.entries.push({
                workspace: {
                    id: recent.workspace.id,
                    configPath: recent.workspace.configPath.toString()
                },
                label: storeLabel(recent.label, recent.workspace.configPath) ? recent.label : undefined,
                remoteAuthority: recent.remoteAuthority
            });
        }
    }
    for (const recent of recents.files) {
        serialized.entries.push({
            fileUri: recent.fileUri.toString(),
            label: storeLabel(recent.label, recent.fileUri) ? recent.label : undefined,
            remoteAuthority: recent.remoteAuthority
        });
    }
    return serialized;
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3dvcmtzcGFjZXMvY29tbW9uL3dvcmtzcGFjZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNuRSxPQUFPLEtBQUssSUFBSSxNQUFNLDhCQUE4QixDQUFDO0FBQ3JELE9BQU8sS0FBSyxRQUFRLE1BQU0sa0NBQWtDLENBQUM7QUFFN0QsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDdEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDakUsT0FBTyxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbkYsT0FBTyxFQUFXLGdCQUFnQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDOUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBRWxELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUU5RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN4RSxPQUFPLEVBQXlGLGVBQWUsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRTdKLE1BQU0sQ0FBQyxNQUFNLGtCQUFrQixHQUFHLGVBQWUsQ0FBcUIsbUJBQW1CLENBQUMsQ0FBQztBQWtEM0YsTUFBTSxVQUFVLGlCQUFpQixDQUFDLElBQWE7SUFDOUMsT0FBTyxJQUFJLENBQUMsY0FBYyxDQUFDLFdBQVcsQ0FBQyxDQUFDO0FBQ3pDLENBQUM7QUFFRCxNQUFN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