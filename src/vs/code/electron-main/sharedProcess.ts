/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assign } from 'vs/base/common/objects';
import { ParsedArgs } from 'vs/platform/environment/common/environment';
import { TPromise } from 'vs/base/common/winjs.base';
import { BrowserWindow, ipcMain } from 'electron';

export interface ISharedProcessInitData {
	args: ParsedArgs;
}

export function spawnSharedProcess(initData: ISharedProcessInitData, appRoot: string, nodeCachedDataDir: string): TPromise<void> {
	const window = new BrowserWindow();
	const config = assign({ appRoot, nodeCachedDataDir });

	const url = `${require.toUrl('vs/code/electron-browser/sharedProcess.html')}?config=${encodeURIComponent(JSON.stringify(config))}`;
	window.loadURL(url);
	// window.webContents.openDevTools();
	window.hide();

	// Prevent the window from dying
	window.on('close', e => {
		if (window.isVisible()) {
			e.preventDefault();
			window.hide();
		}
	});

	return new TPromise<void>((c, e) => {
		ipcMain.once('handshake', ({ sender }) => {
			sender.send('handshake', initData);
			c(null);
		});
	});
}