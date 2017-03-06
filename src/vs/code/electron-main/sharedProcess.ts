/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assign } from 'vs/base/common/objects';
import { memoize } from 'vs/base/common/decorators';
import { ParsedArgs } from 'vs/platform/environment/common/environment';
import { TPromise } from 'vs/base/common/winjs.base';
import { BrowserWindow, ipcMain } from 'electron';

export interface ISharedProcessInitData {
	args: ParsedArgs;
}

export class SharedProcess {

	private window: Electron.BrowserWindow;

	@memoize
	get onReady(): TPromise<void> {
		this.window = new BrowserWindow({ show: false });
		const config = assign({ appRoot: this.appRoot, nodeCachedDataDir: this.nodeCachedDataDir });

		const url = `${require.toUrl('vs/code/electron-browser/sharedProcess.html')}?config=${encodeURIComponent(JSON.stringify(config))}`;
		this.window.loadURL(url);

		// Prevent the window from dying
		this.window.on('close', e => {
			if (this.window.isVisible()) {
				e.preventDefault();
				this.window.hide();
			}
		});

		return new TPromise<void>((c, e) => {
			ipcMain.once('handshake', ({ sender }) => {
				sender.send('handshake', this.initData);
				c(null);
			});
		});
	}

	constructor(
		private initData: ISharedProcessInitData,
		private appRoot: string,
		private nodeCachedDataDir: string
	) { }

	toggle(): void {
		if (this.window.isVisible()) {
			this.hide();
		} else {
			this.show();
		}
	}

	show(): void {
		this.window.show();
		this.window.webContents.openDevTools();
	}

	hide(): void {
		this.window.webContents.closeDevTools();
		this.window.hide();
	}

	dispose(): void {
		if (this.window) {
			this.window.close();
			this.window = null;
		}
	}
}
