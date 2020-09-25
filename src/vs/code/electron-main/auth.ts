/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Disposable } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';
import { FileAccess } from 'vs/base/common/network';
import { BrowserWindow, BrowserWindowConstructorOptions, app, AuthInfo, WebContents, Event as ElectronEvent } from 'electron';

type LoginEvent = {
	event: ElectronEvent;
	webContents: WebContents;
	req: Request;
	authInfo: AuthInfo;
	cb: (username: string, password: string) => void;
};

type Credentials = {
	username: string;
	password: string;
};

export class ProxyAuthHandler extends Disposable {

	declare readonly _serviceBrand: undefined;

	private retryCount = 0;

	constructor() {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		const onLogin = Event.fromNodeEventEmitter<LoginEvent>(app, 'login', (event, webContents, req, authInfo, cb) => ({ event, webContents, req, authInfo, cb }));
		this._register(onLogin(this.onLogin, this));
	}

	private onLogin({ event, authInfo, cb }: LoginEvent): void {
		if (!authInfo.isProxy) {
			return;
		}

		if (this.retryCount++ > 1) {
			return;
		}

		event.preventDefault();

		const opts: BrowserWindowConstructorOptions = {
			alwaysOnTop: true,
			skipTaskbar: true,
			resizable: false,
			width: 450,
			height: 225,
			show: true,
			title: 'VS Code',
			webPreferences: {
				preload: FileAccess.asFileUri('vs/base/parts/sandbox/electron-browser/preload.js', require).fsPath,
				sandbox: true,
				contextIsolation: true,
				enableWebSQL: false,
				enableRemoteModule: false,
				spellcheck: false,
				devTools: false
			}
		};

		const focusedWindow = BrowserWindow.getFocusedWindow();
		if (focusedWindow) {
			opts.parent = focusedWindow;
			opts.modal = true;
		}

		const win = new BrowserWindow(opts);
		const windowUrl = FileAccess.asBrowserUri('vs/code/electron-sandbox/proxy/auth.html', require);
		const proxyUrl = `${authInfo.host}:${authInfo.port}`;
		const title = localize('authRequire', "Proxy Authentication Required");
		const message = localize('proxyauth', "The proxy {0} requires authentication.", proxyUrl);

		const onWindowClose = () => cb('', '');
		win.on('close', onWindowClose);

		win.setMenu(null);
		win.webContents.on('did-finish-load', () => {
			const data = { title, message };
			win.webContents.send('vscode:openProxyAuthDialog', data);
		});
		win.webContents.on('ipc-message', (event, channel, credentials: Credentials) => {
			if (channel === 'vscode:proxyAuthResponse') {
				const { username, password } = credentials;
				cb(username, password);
				win.removeListener('close', onWindowClose);
				win.close();
			}
		});
		win.loadURL(windowUrl.toString(true));
	}
}
