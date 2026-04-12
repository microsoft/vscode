/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from '../../workspace/common/workspace.js';
export async function findWindowOnFile(windows, fileUri, localWorkspaceResolver) {
    // First check for windows with workspaces that have a parent folder of the provided path opened
    for (const window of windows) {
        const workspace = window.openedWorkspace;
        if (isWorkspaceIdentifier(workspace)) {
            const resolvedWorkspace = await localWorkspaceResolver(workspace);
            // resolved workspace: folders are known and can be compared with
            if (resolvedWorkspace) {
                if (resolvedWorkspace.folders.some(folder => extUriBiasedIgnorePathCase.isEqualOrParent(fileUri, folder.uri))) {
                    return window;
                }
            }
            // unresolved: can only compare with workspace location
            else {
                if (extUriBiasedIgnorePathCase.isEqualOrParent(fileUri, workspace.configPath)) {
                    return window;
                }
            }
        }
    }
    // Then go with single folder windows that are parent of the provided file path
    const singleFolderWindowsOnFilePath = windows.filter(window => isSingleFolderWorkspaceIdentifier(window.openedWorkspace) && extUriBiasedIgnorePathCase.isEqualOrParent(fileUri, window.openedWorkspace.uri));
    if (singleFolderWindowsOnFilePath.length) {
        return singleFolderWindowsOnFilePath.sort((windowA, windowB) => -(windowA.openedWorkspace.uri.path.length - windowB.openedWorkspace.uri.path.length))[0];
    }
    return undefined;
}
export function findWindowOnWorkspaceOrFolder(windows, folderOrWorkspaceConfigUri) {
    for (const window of windows) {
        // check for workspace config path
        if (isWorkspaceIdentifier(window.openedWorkspace) && extUriBiasedIgnorePathCase.isEqual(window.openedWorkspace.configPath, folderOrWorkspaceConfigUri)) {
            return window;
        }
        // check for folder path
        if (isSingleFolderWorkspaceIdentifier(window.openedWorkspace) && extUriBiasedIgnorePathCase.isEqual(window.openedWorkspace.uri, folderOrWorkspaceConfigUri)) {
            return window;
        }
    }
    return undefined;
}
export function findWindowOnExtensionDevelopmentPath(windows, extensionDevelopmentPaths) {
    const matches = (uriString) => {
        return extensionDevelopmentPaths.some(path => extUriBiasedIgnorePathCase.isEqual(URI.file(path), URI.file(uriString)));
    };
    for (const window of windows) {
        // match on extension development path. the path can be one or more paths
        // so we check if any of the paths match on any of the provided ones
        if (window.config?.extensionDevelopmentPath?.some(path => matches(path))) {
            return window;
        }
    }
    return undefined;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2luZG93c0ZpbmRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3dpbmRvd3MvZWxlY3Ryb24tbWFpbi93aW5kb3dzRmluZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUVsRCxPQUFPLEVBQXdELGlDQUFpQyxFQUFFLHFCQUFxQixFQUF3QixNQUFNLHFDQUFxQyxDQUFDO0FBRTNMLE1BQU0sQ0FBQyxLQUFLLFVBQVUsZ0JBQWdCLENBQUMsT0FBc0IsRUFBRSxPQUFZLEVBQUUsc0JBQW9HO0lBRWhMLGdHQUFnRztJQUNoRyxLQUFLLE1BQU0sTUFBTSxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQzlCLE1BQU0sU0FBUyxHQUFHLE1BQU0sQ0FBQyxlQUFlLENBQUM7UUFDekMsSUFBSSxxQkFBcUIsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1lBQ3RDLE1BQU0saUJBQWlCLEdBQUcsTUFBTSxzQkFBc0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUVsRSxpRUFBaUU7WUFDakUsSUFBSSxpQkFBaUIsRUFBRSxDQUFDO2dCQUN2QixJQUFJLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQywwQkFBMEIsQ0FBQyxlQUFlLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQy9HLE9BQU8sTUFBTSxDQUFDO2dCQUNmLENBQUM7WUFDRixDQUFDO1lBRUQsdURBQXVEO2lCQUNsRCxDQUFDO2dCQUNMLElBQUksMEJBQTBCLENBQUMsZUFBZSxDQUFDLE9BQU8sRUFBRSxTQUFTLENBQUMsVUFBVSxD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