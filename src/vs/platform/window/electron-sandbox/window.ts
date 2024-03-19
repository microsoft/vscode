/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getZoomLevel, setZoomFactor, setZoomLevel } from 'vs/base/browser/browser';
import { getActiveWindow, getWindows } from 'vs/base/browser/dom';
import { mainWindow } from 'vs/base/browser/window';
import { ISandboxGlobals, ipcRenderer, webFrame } from 'vs/base/parts/sandbox/electron-sandbox/globals';
import { zoomLevelToZoomFactor } from 'vs/platform/window/common/window';

export enum ApplyZoomTarget {
	ACTIVE_WINDOW = 1,
	ALL_WINDOWS
}

export const MAX_ZOOM_LEVEL = 8;
export const MIN_ZOOM_LEVEL = -8;

/**
 * Apply a zoom level to the window. Also sets it in our in-memory
 * browser helper so that it can be accessed in non-electron layers.
 */
export function applyZoom(zoomLevel: number, target: ApplyZoomTarget | Window): void {
	zoomLevel = Math.min(Math.max(zoomLevel, MIN_ZOOM_LEVEL), MAX_ZOOM_LEVEL); // cap zoom levels between -8 and 8

	const targetWindows: Window[] = [];
	if (target === ApplyZoomTarget.ACTIVE_WINDOW) {
		targetWindows.push(getActiveWindow());
	} else if (target === ApplyZoomTarget.ALL_WINDOWS) {
		targetWindows.push(...Array.from(getWindows()).map(({ window }) => window));
	} else {
		targetWindows.push(target);
	}

	for (const targetWindow of targetWindows) {
		getGlobals(targetWindow)?.webFrame?.setZoomLevel(zoomLevel);
		setZoomFactor(zoomLevelToZoomFactor(zoomLevel), targetWindow);
		setZoomLevel(zoomLevel, targetWindow);
	}
}

function getGlobals(win: Window): ISandboxGlobals | undefined {
	if (win === mainWindow) {
		// main window
		return { ipcRenderer, webFrame };
	} else {
		// auxiliary window
		const auxiliaryWindow = win as unknown as { vscode: ISandboxGlobals };
		if (auxiliaryWindow?.vscode?.ipcRenderer && auxiliaryWindow?.vscode?.webFrame) {
			return auxiliaryWindow.vscode;
		}
	}

	return undefined;
}

export function zoomIn(target: ApplyZoomTarget | Window): void {
	applyZoom(getZoomLevel(typeof target === 'number' ? getActiveWindow() : target) + 1, target);
}

export function zoomOut(target: ApplyZoomTarget | Window): void {
	applyZoom(getZoomLevel(typeof target === 'number' ? getActiveWindow() : target) - 1, target);
}
