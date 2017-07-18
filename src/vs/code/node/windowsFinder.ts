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
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier } from "vs/platform/workspaces/common/workspaces";

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
}

export function findBestWindowOrFolderForFile<W extends ISimpleWindow>({ windows, newWindow, reuseWindow, context, filePath, userHome, codeSettingsFolder }: IBestWindowOrFolderOptions<W>): W | string {
	if (!newWindow && filePath && (context === OpenContext.DESKTOP || context === OpenContext.CLI || context === OpenContext.DOCK)) {
		const windowOnFilePath = findWindowOnFilePath(windows, filePath);
		const folderWithCodeSettings = !reuseWindow && findFolderWithCodeSettings(filePath, userHome, codeSettingsFolder);

		// Return if we found a window that has the parent of the file path opened
		if (windowOnFilePath && !(folderWithCodeSettings && folderWithCodeSettings.length > windowOnFilePath.openedFolderPath.length)) {
			return windowOnFilePath;
		}

		// Return if we found a parent folder with a code settings folder inside
		if (folderWithCodeSettings) {
			return folderWithCodeSettings;
		}
	}

	return !newWindow ? getLastActiveWindow(windows) : null;
}

function findWindowOnFilePath<W extends ISimpleWindow>(windows: W[], filePath: string): W {

	// From all windows that have the parent of the file opened, return the window
	// that has the most specific folder opened ( = longest path wins)
	const windowsOnFilePath = windows.filter(window => typeof window.openedFolderPath === 'string' && paths.isEqualOrParent(filePath, window.openedFolderPath, !platform.isLinux /* ignorecase */));
	if (windowsOnFilePath.length) {
		return windowsOnFilePath.sort((a, b) => -(a.openedFolderPath.length - b.openedFolderPath.length))[0];
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
	if (windows.length) {
		const lastFocussedDate = Math.max.apply(Math, windows.map(w => w.lastFocusTime));
		const res = windows.filter(w => w.lastFocusTime === lastFocussedDate);
		if (res && res.length) {
			return res[0];
		}
	}

	return null;
}

export function findWindowOnWorkspace<W extends ISimpleWindow>(windows: W[], workspace: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier)): W {
	if (windows.length) {
		const res = windows.filter(w => {

			// match on folder
			if (isSingleFolderWorkspaceIdentifier(workspace)) {
				if (typeof w.openedFolderPath === 'string' && (paths.isEqual(w.openedFolderPath, workspace, !platform.isLinux /* ignorecase */))) {
					return true;
				}
			}

			// match on workspace
			else {
				if (w.openedWorkspace && w.openedWorkspace.id === workspace.id) {
					return true;
				}
			}


			return false;
		});

		if (res && res.length) {
			return res[0];
		}
	}

	return null;
}