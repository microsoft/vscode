/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getZoomLevel, setZoomFactor, setZoomLevel } from 'vs/base/browser/browser';
import { getWindows } from 'vs/base/browser/dom';
import { mainWindow } from 'vs/base/browser/window';
import { ISandboxGlobals, ipcRenderer, webFrame } from 'vs/base/parts/sandbox/electron-sandbox/globals';
import { zoomLevelToZoomFactor } from 'vs/platform/window/common/window';

/**
 * Apply a zoom level to the window. Also sets it in our in-memory
 * browser helper so that it can be accessed in non-electron layers.
 */
export function applyZoom(zoomLevel: number): void {
	for (const { window } of getWindows()) {
		getGlobals(window)?.webFrame?.setZoomLevel(zoomLevel);
	}
	setZoomFactor(zoomLevelToZoomFactor(zoomLevel));
	setZoomLevel(zoomLevel);
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

export function zoomIn(): void {
	applyZoom(getZoomLevel() + 1);
}

export function zoomOut(): void {
	applyZoom(getZoomLevel() - 1);
}
