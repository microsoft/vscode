/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';
import { fromEventEmitter } from 'vs/base/node/event';
import { BrowserWindow, app } from 'electron';

type LoginEvent = {
	event: Electron.Event;
	webContents: Electron.WebContents;
	req: Electron.LoginRequest;
	authInfo: Electron.LoginAuthInfo;
	cb: (username: string, password: string) => void;
};

type Credentials = {
	username: string;
	password: string;
};

export class ProxyAuthHandler {

	_serviceBrand: any;

	private retryCount = 0;
	private disposables: IDisposable[] = [];

	constructor(
		@IWindowsMainService private windowsService: IWindowsMainService
	) {
		const onLogin = fromEventEmitter<LoginEvent>(app, 'login', (event, webContents, req, authInfo, cb) => ({ event, webContents, req, authInfo, cb }));
		onLogin(this.onLogin, this, this.disposables);
	}

	private onLogin({ event, authInfo, cb }: LoginEvent): void {
		if (!authInfo.isProxy) {
			return;
		}

		if (this.retryCount++ > 1) {
			return;
		}

		event.preventDefault();

		const opts: any = {
			alwaysOnTop: true,
			skipTaskbar: true,
			resizable: false,
			width: 450,
			height: 220,
			show: true,
			title: 'VS Code'
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
		const proxyUrl = `${authInfo.host}:${authInfo.port}`;
		const title = localize('authRequire', "Proxy Authentication Required");
		const message = localize('proxyauth', "The proxy {0} requires authentication.", proxyUrl);
		const data = { title, message };
		const javascript = 'promptForCredentials(' + JSON.stringify(data) + ')';

		const onWindowClose = () => cb('', '');
		win.on('close', onWindowClose);

		win.loadURL(url);
		win.webContents.executeJavaScript(javascript, true).then(({ username, password }: Credentials) => {
			cb(username, password);
			win.removeListener('close', onWindowClose);
			win.close();
		});
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}