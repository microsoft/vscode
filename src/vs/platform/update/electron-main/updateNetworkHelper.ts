/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow } from 'electron';

/**
 * Checks if the network connection is metered by invoking an IPC handler
 * in the first available renderer process.
 * @returns Promise<boolean> - true if connection is metered, false otherwise
 */
export async function isMeteredConnection(): Promise<boolean> {
	const windows = BrowserWindow.getAllWindows();

	// If no windows are open, we can't check the network status
	// Default to false (not metered) to avoid blocking updates unnecessarily
	if (windows.length === 0) {
		return false;
	}

	// Use the first window to check network status
	const window = windows[0];
	if (!window || window.isDestroyed() || !window.webContents) {
		return false;
	}

	try {
		// Query the renderer process via IPC
		const result = await window.webContents.executeJavaScript(`
			(function() {
				if (typeof window !== 'undefined' && window.vscodeWindowId !== undefined) {
					// Use the IPC channel to query network status
					return require('electron').ipcRenderer.invoke('vscode:isMeteredConnection');
				}
				return false;
			})()
		`);
		return result === true;
	} catch (error) {
		// If execution fails (e.g., window is not ready), default to false
		return false;
	}
}
