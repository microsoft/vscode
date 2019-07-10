/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';
import { Event } from 'vs/base/common/event';
import { BrowserWindow, app } from 'electron';

type LoginEvent = {
	event: Electron.Event;
	webContents: Electron.WebContents;
	req: Electron.Request;
	authInfo: Electron.AuthInfo;
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
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService
	) {
		const onLogin = Event.fromNodeEventEmitter<LoginEvent>(app, 'login', (event, webContents, req, authInfo, cb) => ({ event, webContents, req, authInfo, cb }));
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
			title: 'VS Code',
			webPreferences: {
				nodeIntegration: true,
				webviewTag: true
			}
		};

		const focusedWindow = this.windowsMainService.getFocusedWindow();

		if (focusedWindow) {
			opts.parent = focusedWindow.win;
			opts.modal = true;
		}

		const win = new BrowserWindow(opts);
		const config = {};
		const baseUrl = require.toUrl('vs/code/electron-browser/proxy/auth.html');
		const url = `${baseUrl}?config=${encodeURIComponent(JSON.stringify(config))}`;
		const proxyUrl = `${authInfo.host}:${authInfo.port}`;
		const title = localize('authRequire', "Proxy Authentication Required");
		const message = localize('proxyauth', "The proxy {0} requires authentication.", proxyUrl);
		const data = { title, message };
		const javascript = 'promptForCredentials(' + JSON.stringify(data) + ')';

		const onWindowClose = () => cb('', '');
		win.on('close', onWindowClose);

		win.setMenu(null);
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