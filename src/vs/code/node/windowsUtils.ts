/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as fs from 'fs';
import * as platform from 'vs/base/common/platform';
import * as paths from 'vs/base/common/paths';
import { OpenContext } from 'vs/code/common/windows';
import { isEqualOrParent } from 'vs/platform/files/common/files';

/**
 * Exported subset of VSCodeWindow for testing.
 */
export interface ISimpleWindow {
	openedWorkspacePath: string;
	lastFocusTime: number;
}

/**
 * Exported for testing.
 */
export interface IBestWindowOrFolderOptions<SimpleWindow extends ISimpleWindow> {
	windows: SimpleWindow[];
	newWindow: boolean;
	reuseWindow: boolean;
	context: OpenContext;
	filePath?: string;
	userHome?: string;
	vscodeFolder?: string;
}

export function findBestWindowOrFolder<SimpleWindow extends ISimpleWindow>({ windows, newWindow, reuseWindow, context, filePath, userHome, vscodeFolder }: IBestWindowOrFolderOptions<SimpleWindow>): SimpleWindow | string {
	// OpenContext.DOCK implies newWindow unless overwritten by settings.
	const findBest = filePath && (context === OpenContext.DESKTOP || context === OpenContext.CLI || context === OpenContext.DOCK);
	const bestWindow = !newWindow && findBest && findBestWindow(windows, filePath);
	const bestFolder = !newWindow && !reuseWindow && findBest && findBestFolder(filePath, userHome, vscodeFolder);
	if (bestWindow && !(bestFolder && bestFolder.length > bestWindow.openedWorkspacePath.length)) {
		return bestWindow;
	} else if (bestFolder) {
		return bestFolder;
	}
	return !newWindow ? getLastActiveWindow(windows) : null;
}

function findBestWindow<WINDOW extends ISimpleWindow>(windows: WINDOW[], filePath: string): WINDOW {
	const containers = windows.filter(window => typeof window.openedWorkspacePath === 'string' && isEqualOrParent(filePath, window.openedWorkspacePath, !platform.isLinux /* ignorecase */));
	if (containers.length) {
		return containers.sort((a, b) => -(a.openedWorkspacePath.length - b.openedWorkspacePath.length))[0];
	}
	return null;
}

function findBestFolder(filePath: string, userHome?: string, vscodeFolder?: string): string {
	let folder = path.dirname(paths.normalize(filePath, true));
	let homeFolder = userHome && paths.normalize(userHome, true);
	if (!platform.isLinux) {
		homeFolder = homeFolder && homeFolder.toLowerCase();
	}
	let previous = null;
	try {
		while (folder !== previous) {
			if (isProjectFolder(folder, homeFolder, vscodeFolder)) {
				return folder;
			}
			previous = folder;
			folder = path.dirname(folder);
		}
	} catch (err) {
		// assume impossible to access
	}
	return null;
}

function isProjectFolder(folder: string, normalizedUserHome?: string, vscodeFolder = '.vscode') {
	try {
		if ((platform.isLinux ? folder : folder.toLowerCase()) === normalizedUserHome) {
			// ~/.vscode/extensions is used for extensions
			return fs.statSync(path.join(folder, vscodeFolder, 'settings.json')).isFile();
		} else {
			return fs.statSync(path.join(folder, vscodeFolder)).isDirectory();
		}
	} catch (err) {
		if (!(err && err.code === 'ENOENT')) {
			throw err;
		}
	}
	return false;
}

export function getLastActiveWindow<WINDOW extends ISimpleWindow>(windows: WINDOW[]): WINDOW {
	if (windows.length) {
		const lastFocussedDate = Math.max.apply(Math, windows.map(w => w.lastFocusTime));
		const res = windows.filter(w => w.lastFocusTime === lastFocussedDate);
		if (res && res.length) {
			return res[0];
		}
	}

	return null;
}
