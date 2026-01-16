/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow } from 'electron';
import { validatedIpcMain } from '../../../base/parts/ipc/electron-main/ipcMain.js';

/**
 * Checks if the current network connection is metered (e.g., mobile data, tethered connection, or data saver enabled).
 * @returns A promise that resolves to true if the connection is metered, false otherwise.
 */
export async function isMeteredConnection(): Promise<boolean> {
	try {
		for (const window of BrowserWindow.getAllWindows()) {
			if (!window.isDestroyed() && window.webContents) {
				return new Promise<boolean>((resolve) => {
					const timeout = setTimeout(() => resolve(false), 1000);

					const listener = (_event: Electron.IpcMainEvent, isMetered: boolean) => {
						clearTimeout(timeout);
						validatedIpcMain.removeListener('vscode:meteredConnectionResult', listener);
						resolve(isMetered);
					};

					validatedIpcMain.on('vscode:meteredConnectionResult', listener);
					window.webContents.send('vscode:checkMeteredConnection');
				});
			}
		}
	} catch {
		return false;
	}
	return false;
}
