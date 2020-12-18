/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IWorkspaceIdentifier, IResolvedWorkspace } from 'vs/platform/workspaces/common/workspaces';
import { extUriBiasedIgnorePathCase } from 'vs/base/common/resources';
import { ICodeWindow } from 'vs/platform/windows/electron-main/windows';

export function findWindowOnFile(windows: ICodeWindow[], fileUri: URI, localWorkspaceResolver: (workspace: IWorkspaceIdentifier) => IResolvedWorkspace | null): ICodeWindow | undefined {

	// First check for windows with workspaces that have a parent folder of the provided path opened
	for (const window of windows) {
		const workspace = window.openedWorkspace;
		if (workspace) {
			const resolvedWorkspace = localWorkspaceResolver(workspace);

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
	const singleFolderWindowsOnFilePath = windows.filter(window => window.openedFolderUri && extUriBiasedIgnorePathCase.isEqualOrParent(fileUri, window.openedFolderUri));
	if (singleFolderWindowsOnFilePath.length) {
		return singleFolderWindowsOnFilePath.sort((windowA, windowB) => -(windowA.openedFolderUri!.path.length - windowB.openedFolderUri!.path.length))[0];
	}

	return undefined;
}

export function findWindowOnWorkspaceOrFolder(windows: ICodeWindow[], folderOrWorkspaceConfigUri: URI): ICodeWindow | undefined {

	for (const window of windows) {

		// check for workspace config path
		if (window.openedWorkspace && extUriBiasedIgnorePathCase.isEqual(window.openedWorkspace.configPath, folderOrWorkspaceConfigUri)) {
			return window;
		}

		// check for folder path
		if (window.openedFolderUri && extUriBiasedIgnorePathCase.isEqual(window.openedFolderUri, folderOrWorkspaceConfigUri)) {
			return window;
		}
	}

	return undefined;
}


export function findWindowOnExtensionDevelopmentPath(windows: ICodeWindow[], extensionDevelopmentPaths: string[]): ICodeWindow | undefined {

	const matches = (uriString: string): boolean => {
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
