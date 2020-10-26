/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';
import { app, AuthInfo, WebContents, Event as ElectronEvent } from 'electron';
import { ILogService } from 'vs/platform/log/common/log';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';
import { INativeHostMainService } from 'vs/platform/native/electron-main/nativeHostMainService';
import { IEncryptionMainService } from 'vs/platform/encryption/electron-main/encryptionMainService';
import { generateUuid } from 'vs/base/common/uuid';

type LoginEvent = {
	event: ElectronEvent;
	webContents: WebContents;
	authInfo: AuthInfo;
	cb: (username: string, password: string) => void;
};

type Credentials = {
	username: string;
	password: string;
};

export class ProxyAuthHandler2 extends Disposable {

	private static PROXY_CREDENTIALS_SERVICE_KEY = 'vscode.proxy-credentials';

	private pendingProxyHandler = false;
	private proxyDialogShown = false;
	private storedProxyCredentialsUsed = false;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@INativeHostMainService private readonly nativeHostMainService: INativeHostMainService,
		@IEncryptionMainService private readonly encryptionMainService: IEncryptionMainService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		const onLogin = Event.fromNodeEventEmitter<LoginEvent>(app, 'login', (event, webContents, req, authInfo, cb) => ({ event, webContents, req, authInfo, cb }));
		this._register(onLogin(this.onLogin, this));
	}

	private onLogin(event: LoginEvent): void {
		if (!event.authInfo.isProxy) {
			return; // only for proxy
		}

		if (this.pendingProxyHandler) {
			this.logService.trace('auth#onLogin (proxy) - exit - pending proxy handling found');

			return; // never more than once at the same time
		}

		if (this.proxyDialogShown) {
			this.logService.trace('auth#onLogin (proxy) - exit - proxy dialog already shown');

			return; // only one dialog per session at max
		}

		this.handleOnLogin(event);
	}

	private async handleOnLogin({ event, webContents, authInfo, cb }: LoginEvent): Promise<void> {
		this.logService.trace('auth#handleOnLogin (proxy) - enter');

		this.pendingProxyHandler = true;
		try {
			const credentials = await this.resolveProxyCredentials(event, webContents, authInfo);
			if (credentials) {
				this.logService.trace('auth#handleOnLogin (proxy) - got credentials');

				cb(credentials.username, credentials.password);
			} else {
				this.logService.trace('auth#handleOnLogin (proxy) - did not get credentials');
			}
		} finally {
			this.logService.trace('auth#handleOnLogin (proxy) - exit');

			this.pendingProxyHandler = false;
		}
	}

	private async resolveProxyCredentials(event: ElectronEvent, webContents: WebContents, authInfo: AuthInfo): Promise<Credentials | undefined> {
		this.logService.trace('auth#resolveProxyCredentials - enter');

		// Signal we handle this on our own
		event.preventDefault();

		// Find any previously stored credentials
		let username: string | undefined = undefined;
		let password: string | undefined = undefined;
		try {
			const encryptedSerializedProxyCredentials = await this.nativeHostMainService.getPassword(undefined, ProxyAuthHandler2.PROXY_CREDENTIALS_SERVICE_KEY, 'account');
			if (encryptedSerializedProxyCredentials) {
				const credentials: Credentials = JSON.parse(await this.encryptionMainService.decrypt(encryptedSerializedProxyCredentials));

				if (credentials.username && credentials.password) {
					username = credentials.username;
					password = credentials.password;
				}
			}
		} catch (error) {
			this.logService.error(error); // handle errors by asking user for login via dialog
		}

		// Reply with stored credentials unless we used them already.
		// In that case we need to show a login dialog again because
		// they seem invalid.
		if (!this.storedProxyCredentialsUsed && username && password) {
			this.logService.trace('auth#resolveProxyCredentials (proxy) - exit - found stored credentials to use');
			this.storedProxyCredentialsUsed = true;

			return { username, password };
		}

		// Find suitable window to show dialog
		const window = this.windowsMainService.getWindowByWebContents(webContents) || this.windowsMainService.getLastActiveWindow();
		if (!window) {
			this.logService.trace('auth#resolveProxyCredentials (proxy) - exit - no opened window found to show dialog in');

			return undefined; // unexpected
		}

		this.logService.trace(`auth#resolveProxyCredentials (proxy) - asking window ${window.id} to handle proxy login`);

		// Open proxy dialog
		const payload = { authInfo, username, password, replyChannel: `vscode:proxyAuthResponse:${generateUuid()}` };
		window.sendWhenReady('vscode:openProxyAuthenticationDialog', payload);
		this.proxyDialogShown = true;

		// Handle reply
		return new Promise(resolve => {
			const proxyAuthResponseHandler = async (event: ElectronEvent, channel: string, reply: Credentials & { remember: boolean }) => {
				if (channel === payload.replyChannel) {
					this.logService.trace(`auth#resolveProxyCredentials - exit - received credentials from window ${window.id}`);
					webContents.off('ipc-message', proxyAuthResponseHandler);

					const credentials: Credentials = { username: reply.username, password: reply.password };

					// Update stored credentials based on `remember` flag
					try {
						if (reply.remember) {
							const encryptedSerializedCredentials = await this.encryptionMainService.encrypt(JSON.stringify(credentials));
							await this.nativeHostMainService.setPassword(undefined, ProxyAuthHandler2.PROXY_CREDENTIALS_SERVICE_KEY, 'account', encryptedSerializedCredentials);
						} else {
							await this.nativeHostMainService.deletePassword(undefined, ProxyAuthHandler2.PROXY_CREDENTIALS_SERVICE_KEY, 'account');
						}
					} catch (error) {
						this.logService.error(error); // handle gracefully
					}

					resolve({ username: credentials.username, password: credentials.password });
				}
			};

			webContents.on('ipc-message', proxyAuthResponseHandler);
		});
	}
}
