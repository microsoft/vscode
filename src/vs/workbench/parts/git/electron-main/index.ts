/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


'use strict';

import env = require('vs/workbench/electron-main/env');
import events = require('vs/base/common/eventEmitter');
import platform = require('vs/base/common/platform');

import { ipcMain as ipc, BrowserWindow } from 'electron';

interface ICredentialsContext {
	id: number;
	host: string;
	command: string;
}

interface ICredentials {
	username: string;
	password: string;
}

interface ICredentialsResult {
	id: number;
	credentials: ICredentials;
}

interface IContext {
	credentials: ICredentials;
	window: Electron.BrowserWindow;
}

export function configure(bus: events.EventEmitter): void {
	var cache: { [id: string]: IContext } = Object.create(null);

	ipc.on('git:askpass', (event, result: ICredentialsResult) => {
		cache[result.id].credentials = result.credentials;
	});

	bus.addListener('git:askpass', (context: ICredentialsContext) => {
		var cachedResult = cache[context.id];

		if (typeof cachedResult !== 'undefined') {
			bus.emit('git:askpass:' + context.id, cachedResult.credentials);
			return;
		}

		if (context.command === 'fetch') {
			bus.emit('git:askpass:' + context.id, { id: context.id, credentials: { username: '', password: '' }});
			return;
		}

		var win = new BrowserWindow({
			alwaysOnTop: true,
			skipTaskbar: true,
			resizable: false,
			width: 450,
			height: platform.isWindows ? 280 : 260,
			show: true,
			title: env.product.nameLong
		});

		win.setMenuBarVisibility(false);

		cache[context.id] = {
			window: win,
			credentials: null
		};

		win.loadURL(require.toUrl('vs/workbench/parts/git/electron-main/index.html'));
		win.webContents.executeJavaScript('init(' + JSON.stringify(context) + ')');

		win.once('closed', () => {
			bus.emit('git:askpass:' + context.id, cache[context.id].credentials);

			setTimeout(function () {
				delete cache[context.id];
			}, 1000 * 10);
		});
	});
}
