/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow } from 'electron';

/**
 * Checks if the current network connection is metered (e.g., mobile data, tethered connection, or data saver enabled).
 * @returns A promise that resolves to true if the connection is metered, false otherwise.
 */
export async function isMeteredConnection(): Promise<boolean> {
	try {
		for (const window of BrowserWindow.getAllWindows()) {
			if (!window.isDestroyed() && window.webContents) {
				return await window.webContents.ipc.invoke('vscode:isMeteredConnection');
			}
		}
	} finally {
		return false;
	}
}
