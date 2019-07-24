/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as platform from 'vs/base/common/platform';
import * as extpath from 'vs/base/common/extpath';
import { OpenContext } from 'vs/platform/windows/common/windows';
import { IWorkspaceIdentifier, IResolvedWorkspace, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { URI } from 'vs/base/common/uri';
import { isEqual, isEqualOrParent } from 'vs/base/common/resources';

export interface ISimpleWindow {
	openedWorkspace?: IWorkspaceIdentifier;
	openedFolderUri?: URI;

	extensionDevelopmentPath?: string | string[];
	lastFocusTime: number;
}

export interface IBestWindowOrFolderOptions<W extends ISimpleWindow> {
	windows: W[];
	newWindow: boolean;
	context: OpenContext;
	fileUri?: URI;
	userHome?: string;
	codeSettingsFolder?: string;
	localWorkspaceResolver: (workspace: IWorkspaceIdentifier) => IResolvedWorkspace | null;
}

export function findBestWindowOrFolderForFile<W extends ISimpleWindow>({ windows, newWindow, context, fileUri, localWorkspaceResolver: workspaceResolver }: IBestWindowOrFolderOptions<W>): W | undefined {
	if (!newWindow && fileUri && (context === OpenContext.DESKTOP || context === OpenContext.CLI || context === OpenContext.DOCK)) {
		const windowOnFilePath = findWindowOnFilePath(windows, fileUri, workspaceResolver);
		if (windowOnFilePath) {
			return windowOnFilePath;
		}
	}
	return !newWindow ? getLastActiveWindow(windows) : undefined;
}

function findWindowOnFilePath<W extends ISimpleWindow>(windows: W[], fileUri: URI, localWorkspaceResolver: (workspace: IWorkspaceIdentifier) => IResolvedWorkspace | null): W | null {

	// First check for windows with workspaces that have a parent folder of the provided path opened
	for (const window of windows) {
		const workspace = window.openedWorkspace;
		if (workspace) {
			const resolvedWorkspace = localWorkspaceResolver(workspace);
			if (resolvedWorkspace) {
				// workspace could be resolved: It's in the local file system
				if (resolvedWorkspace.folders.some(folder => isEqualOrParent(fileUri, folder.uri))) {
					return window;
				}
			} else {
				// use the config path instead
				if (isEqualOrParent(fileUri, workspace.configPath)) {
					return window;
				}
			}
		}
	}

	// Then go with single folder windows that are parent of the provided file path
	const singleFolderWindowsOnFilePath = windows.filter(window => window.openedFolderUri && isEqualOrParent(fileUri, window.openedFolderUri));
	if (singleFolderWindowsOnFilePath.length) {
		return singleFolderWindowsOnFilePath.sort((a, b) => -(a.openedFolderUri!.path.length - b.openedFolderUri!.path.length))[0];
	}

	return null;
}

export function getLastActiveWindow<W extends ISimpleWindow>(windows: W[]): W | undefined {
	const lastFocusedDate = Math.max.apply(Math, windows.map(window => window.lastFocusTime));

	return windows.filter(window => window.lastFocusTime === lastFocusedDate)[0];
}

export function findWindowOnWorkspace<W extends ISimpleWindow>(windows: W[], workspace: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier)): W | null {
	if (isSingleFolderWorkspaceIdentifier(workspace)) {
		for (const window of windows) {
			// match on folder
			if (isSingleFolderWorkspaceIdentifier(workspace)) {
				if (window.openedFolderUri && isEqual(window.openedFolderUri, workspace)) {
					return window;
				}
			}
		}
	} else if (isWorkspaceIdentifier(workspace)) {
		for (const window of windows) {
			// match on workspace
			if (window.openedWorkspace && window.openedWorkspace.id === workspace.id) {
				return window;
			}
		}
	}
	return null;
}

export function findWindowOnExtensionDevelopmentPath<W extends ISimpleWindow>(windows: W[], extensionDevelopmentPath: string | string[]): W | null {

	const matches = (uriString: string): boolean => {
		if (Array.isArray(extensionDevelopmentPath)) {
			return extensionDevelopmentPath.some(p => extpath.isEqual(p, uriString, !platform.isLinux /* ignorecase */));
		} else if (extensionDevelopmentPath) {
			return extpath.isEqual(extensionDevelopmentPath, uriString, !platform.isLinux /* ignorecase */);
		}
		return false;
	};

	for (const window of windows) {
		// match on extension development path. The path can be one or more paths or uri strings, using paths.isEqual is not 100% correct but good enough

		if (window.extensionDevelopmentPath) {
			if (Array.isArray(window.extensionDevelopmentPath)) {
				if (window.extensionDevelopmentPath.some(p => matches(p))) {
					return window;
				}
			} else if (window.extensionDevelopmentPath) {
				if (matches(window.extensionDevelopmentPath)) {
					return window;
				}
			}
		}
	}

	return null;
}

export function findWindowOnWorkspaceOrFolderUri<W extends ISimpleWindow>(windows: W[], uri: URI | undefined): W | null {
	if (!uri) {
		return null;
	}
	for (const window of windows) {
		// check for workspace config path
		if (window.openedWorkspace && isEqual(window.openedWorkspace.configPath, uri)) {
			return window;
		}

		// check for folder path
		if (window.openedFolderUri && isEqual(window.openedFolderUri, uri)) {
			return window;
		}
	}
	return null;
}
