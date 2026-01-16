/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ipcRenderer } from '../../base/parts/sandbox/electron-browser/globals.js';
import { isMeteredConnection } from '../../base/common/networkConnection.js';

// Register IPC handler for metered connection checks
// This allows the main process to query the renderer for network information
// without using executeJavaScript injection
ipcRenderer.on('vscode:checkMeteredConnection', () => {
	try {
		const isMetered = isMeteredConnection();
		ipcRenderer.send('vscode:meteredConnectionResult', isMetered);
	} catch (error) {
		ipcRenderer.send('vscode:meteredConnectionResult', false);
	}
});
