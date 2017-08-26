/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as fs from 'fs';
import * as platform from 'vs/base/common/platform';
import * as paths from 'vs/base/common/paths';
import { OpenContext } from 'vs/platform/windows/common/windows';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, IResolvedWorkspace } from 'vs/platform/workspaces/common/workspaces';

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

		// 1) window wins if it has a workspace opened
		if (windowOnFilePath && !!windowOnFilePath.openedWorkspace) {
			return windowOnFilePath;
		}

		// 2) window wins if it has a folder opened that is more specific than settings folder
		const folderWithCodeSettings = !reuseWindow && findFolderWithCodeSettings(filePath, userHome, codeSettingsFolder);
		if (windowOnFilePath && !(folderWithCodeSettings && folderWithCodeSettings.length > windowOnFilePath.openedFolderPath.length)) {
			return windowOnFilePath;
		}

		// 3) finally return path to folder with settings
		if (folderWithCodeSettings) {
			return folderWithCodeSettings;
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
		if (resolvedWorkspace && resolvedWorkspace.folders.some(folder => paths.isEqualOrParent(filePath, folder.path, !platform.isLinux /* ignorecase */))) {
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

function findFolderWithCodeSettings(filePath: string, userHome?: string, codeSettingsFolder?: string): string {
	let folder = path.dirname(paths.normalize(filePath, true));
	let homeFolder = userHome && paths.normalize(userHome, true);
	if (!platform.isLinux) {
		homeFolder = homeFolder && homeFolder.toLowerCase();
	}

	let previous = null;
	while (folder !== previous) {
		if (hasCodeSettings(folder, homeFolder, codeSettingsFolder)) {
			return folder;
		}

		previous = folder;
		folder = path.dirname(folder);
	}

	return null;
}

function hasCodeSettings(folder: string, normalizedUserHome?: string, codeSettingsFolder = '.vscode') {
	try {
		if ((platform.isLinux ? folder : folder.toLowerCase()) === normalizedUserHome) {
			return fs.statSync(path.join(folder, codeSettingsFolder, 'settings.json')).isFile(); // ~/.vscode/extensions is used for extensions
		}

		return fs.statSync(path.join(folder, codeSettingsFolder)).isDirectory();
	} catch (err) {
		// assume impossible to access
	}

	return false;
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