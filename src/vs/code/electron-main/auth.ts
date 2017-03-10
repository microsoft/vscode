/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IWindowsMainService } from 'vs/code/electron-main/windows';
import { fromEventEmitter } from 'vs/base/node/event';
import { BrowserWindow, app } from 'electron';

type LoginEvent = {
	event: Electron.Event;
	webContents: Electron.WebContents;
	req: Electron.LoginRequest;
	authInfo: Electron.LoginAuthInfo;
	cb: (username: string, password: string) => void;
};

export class AuthHandler {

	_serviceBrand: any;

	private disposables: IDisposable[] = [];

	constructor(
		@IWindowsMainService private windowsService: IWindowsMainService
	) {
		const onLogin = fromEventEmitter<LoginEvent>(app, 'login', (event, webContents, req, authInfo, cb) => ({ event, webContents, req, authInfo, cb }));
		onLogin(this.onLogin, this, this.disposables);
	}

	private onLogin({ event, authInfo, cb }: LoginEvent): void {
		const opts: any = {
			alwaysOnTop: true,
			skipTaskbar: true,
			resizable: false,
			width: 450,
			height: 260,
			show: true,
			title: localize('authRequired', "Authentication Required")
		};

		const focusedWindow = this.windowsService.getFocusedWindow();

		if (focusedWindow) {
			opts.parent = focusedWindow.win;
			opts.modal = true;
		}

		const win = new BrowserWindow(opts);

		const config = {};

		const baseUrl = require.toUrl('./auth.html');
		const url = `${baseUrl}?config=${encodeURIComponent(JSON.stringify(config))}`;
		win.loadURL(url);

		const proxyUrl = `${authInfo.host}:${authInfo.port}`;
		const message = localize('proxyauth', "The proxy {0} requires a username and password.", proxyUrl);

		event.preventDefault();
		win.webContents.executeJavaScript('promptForCredentials(' + JSON.stringify({ message }) + ')', true).then(({ username, password }: { username: string, password: string }) => {
			cb(username, password);
			win.close();
		});
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}