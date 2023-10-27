/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getZoomLevel, setZoomFactor, setZoomLevel } from 'vs/base/browser/browser';
import { getWindows } from 'vs/base/browser/dom';
import { ipcRenderer, webFrame } from 'vs/base/parts/sandbox/electron-sandbox/globals';
import { zoomLevelToZoomFactor } from 'vs/platform/window/common/window';

interface IGlobals {
	readonly ipcRenderer: Pick<import('vs/base/parts/sandbox/electron-sandbox/electronTypes').IpcRenderer, 'send' | 'invoke'>;
	readonly webFrame: import('vs/base/parts/sandbox/electron-sandbox/electronTypes').WebFrame;
}

/**
 * Get the globals that are available in the given window. Since
 * this method supports auxiliary windows, only a subset of globals
 * is returned.
 */
export function getGlobals(win: Window): IGlobals | undefined {
	if (win === window) {
		return { ipcRenderer, webFrame };
	}

	const auxiliaryWindowCandidate = win as unknown as {
		vscode: {
			ipcRenderer: Pick<import('vs/base/parts/sandbox/electron-sandbox/electronTypes').IpcRenderer, 'send' | 'invoke'>;
			webFrame: import('vs/base/parts/sandbox/electron-sandbox/electronTypes').WebFrame;
		};
	};

	if (auxiliaryWindowCandidate?.vscode?.ipcRenderer && auxiliaryWindowCandidate?.vscode?.webFrame) {
		return auxiliaryWindowCandidate.vscode;
	}

	return undefined;
}

/**
 * Apply a zoom level to the window. Also sets it in our in-memory
 * browser helper so that it can be accessed in non-electron layers.
 */
export function applyZoom(zoomLevel: number): void {
	for (const window of getWindows()) {
		getGlobals(window)?.webFrame?.setZoomLevel(zoomLevel);
	}
	setZoomFactor(zoomLevelToZoomFactor(zoomLevel));
	setZoomLevel(zoomLevel);
}

export function zoomIn(): void {
	applyZoom(getZoomLevel() + 1);
}

export function zoomOut(): void {
	applyZoom(getZoomLevel() - 1);
}
