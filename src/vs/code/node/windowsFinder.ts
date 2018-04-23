/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as platform from 'vs/base/common/platform';
import * as paths from 'vs/base/common/paths';
import { OpenContext } from 'vs/platform/windows/common/windows';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, IResolvedWorkspace } from 'vs/platform/workspaces/common/workspaces';
import { Schemas } from 'vs/base/common/network';

export interface ISimpleWindow {
	openedWorkspace?: IWorkspaceIdentifier;
	openedFolderPath?: string;
	openedFilePath?: string;
	extensionDevelopmentPath?: string;
	lastFocusTime: number;
}

export interface IBestWindowOrFolderOptions<W extends ISimpleWindow> {
	windows: W[];
	newWindow: boolean;
	reuseWindow: boolean;
	context: OpenContext;
	filePath?: string;
	userHome?: string;
	codeSettingsFolder?: string;
	workspaceResolver: (workspace: IWorkspaceIdentifier) => IResolvedWorkspace;
}

export function findBestWindowOrFolderForFile<W extends ISimpleWindow>({ windows, newWindow, reuseWindow, context, filePath, userHome, codeSettingsFolder, workspaceResolver }: IBestWindowOrFolderOptions<W>): W | string {
	if (!newWindow && filePath && (context === OpenContext.DESKTOP || context === OpenContext.CLI || context === OpenContext.DOCK)) {
		const windowOnFilePath = findWindowOnFilePath(windows, filePath, workspaceResolver);
		if (windowOnFilePath) {
			return windowOnFilePath;
		}
	}

	return !newWindow ? getLastActiveWindow(windows) : null;
}

function findWindowOnFilePath<W extends ISimpleWindow>(windows: W[], filePath: string, workspaceResolver: (workspace: IWorkspaceIdentifier) => IResolvedWorkspace): W {

	// First check for windows with workspaces that have a parent folder of the provided path opened
	const workspaceWindows = windows.filter(window => !!window.openedWorkspace);
	for (let i = 0; i < workspaceWindows.length; i++) {
		const window = workspaceWindows[i];
		const resolvedWorkspace = workspaceResolver(window.openedWorkspace);
		if (resolvedWorkspace && resolvedWorkspace.folders.some(folder => folder.uri.scheme === Schemas.file && paths.isEqualOrParent(filePath, folder.uri.fsPath, !platform.isLinux /* ignorecase */))) {
			return window;
		}
	}

	// Then go with single folder windows that are parent of the provided file path
	const singleFolderWindowsOnFilePath = windows.filter(window => typeof window.openedFolderPath === 'string' && paths.isEqualOrParent(filePath, window.openedFolderPath, !platform.isLinux /* ignorecase */));
	if (singleFolderWindowsOnFilePath.length) {
		return singleFolderWindowsOnFilePath.sort((a, b) => -(a.openedFolderPath.length - b.openedFolderPath.length))[0];
	}

	return null;
}

export function getLastActiveWindow<W extends ISimpleWindow>(windows: W[]): W {
	const lastFocusedDate = Math.max.apply(Math, windows.map(window => window.lastFocusTime));

	return windows.filter(window => window.lastFocusTime === lastFocusedDate)[0];
}

export function findWindowOnWorkspace<W extends ISimpleWindow>(windows: W[], workspace: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier)): W {
	return windows.filter(window => {

		// match on folder
		if (isSingleFolderWorkspaceIdentifier(workspace)) {
			if (typeof window.openedFolderPath === 'string' && (paths.isEqual(window.openedFolderPath, workspace, !platform.isLinux /* ignorecase */))) {
				return true;
			}
		}

		// match on workspace
		else {
			if (window.openedWorkspace && window.openedWorkspace.id === workspace.id) {
				return true;
			}
		}

		return false;
	})[0];
}

export function findWindowOnExtensionDevelopmentPath<W extends ISimpleWindow>(windows: W[], extensionDevelopmentPath: string): W {
	return windows.filter(window => {

		// match on extension development path
		if (paths.isEqual(window.extensionDevelopmentPath, extensionDevelopmentPath, !platform.isLinux /* ignorecase */)) {
			return true;
		}

		return false;
	})[0];
}

export function findWindowOnWorkspaceOrFolderPath<W extends ISimpleWindow>(windows: W[], path: string): W {
	return windows.filter(window => {

		// check for workspace config path
		if (window.openedWorkspace && paths.isEqual(window.openedWorkspace.configPath, path, !platform.isLinux /* ignorecase */)) {
			return true;
		}

		// check for folder path
		if (window.openedFolderPath && paths.isEqual(window.openedFolderPath, path, !platform.isLinux /* ignorecase */)) {
			return true;
		}

		return false;
	})[0];
}
