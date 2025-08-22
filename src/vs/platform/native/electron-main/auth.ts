/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { app, AuthenticationResponseDetails, AuthInfo as ElectronAuthInfo, Event as ElectronEvent, WebContents } from 'electron';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { hash } from '../../../base/common/hash.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEncryptionMainService } from '../../encryption/common/encryptionService.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { AuthInfo, Credentials } from '../../request/common/request.js';
import { StorageScope, StorageTarget } from '../../storage/common/storage.js';
import { IApplicationStorageMainService } from '../../storage/electron-main/storageMainService.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';

interface ElectronAuthenticationResponseDetails extends AuthenticationResponseDetails {
	firstAuthAttempt?: boolean; // https://github.com/electron/electron/blob/84a42a050e7d45225e69df5bd2d2bf9f1037ea41/shell/browser/login_handler.cc#L70
}

type LoginEvent = {
	event?: ElectronEvent;
	authInfo: AuthInfo;
	callback?: (username?: string, password?: string) => void;
};

export const IProxyAuthService = createDecorator<IProxyAuthService>('proxyAuthService');

export interface IProxyAuthService {
	lookupAuthorization(authInfo: AuthInfo): Promise<Credentials | undefined>;
}

export class ProxyAuthService extends Disposable implements IProxyAuthService {

	declare readonly _serviceBrand: undefined;

	private readonly PROXY_CREDENTIALS_SERVICE_KEY = 'proxy-credentials://';

	private pendingProxyResolves = new Map<string, Promise<Credentials | undefined>>();
	private currentDialog: Promise<Credentials | undefined> | undefined = undefined;

	private cancelledAuthInfoHashes = new Set<string>();

	private sessionCredentials = new Map<string, Credentials | undefined>();

	constructor(
		@ILogService private readonly logService: ILogService,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@IEncryptionMainService private readonly encryptionMainService: IEncryptionMainService,
		@IApplicationStorageMainService private readonly applicationStorageMainService: IApplicationStorageMainService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService,
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		const onLogin = Event.fromNodeEventEmitter<LoginEvent>(app, 'login', (event: ElectronEvent, _webContents: WebContents, req: ElectronAuthenticationResponseDetails, authInfo: ElectronAuthInfo, callback) => ({ event, authInfo: { ...authInfo, attempt: req.firstAuthAttempt ? 1 : 2 }, callback } satisfies LoginEvent));
		this._register(onLogin(this.onLogin, this));
	}

	async lookupAuthorization(authInfo: AuthInfo): Promise<Credentials | undefined> {
		return this.onLogin({ authInfo });
	}

	private async onLogin({ event, authInfo, callback }: LoginEvent): Promise<Credentials | undefined> {
		if (!authInfo.isProxy) {
			return; // only for proxy
		}

		// Signal we handle this event on our own, otherwise
		// Electron will ignore our provided credentials.
		event?.preventDefault();

		// Compute a hash over the authentication info to be used
		// with the credentials store to return the right credentials
		// given the properties of the auth request
		// (see https://github.com/microsoft/vscode/issues/109497)
		const authInfoHash = String(hash({ scheme: authInfo.scheme, host: authInfo.host, port: authInfo.port }));

		let credentials: Credentials | undefined = undefined;
		let pendingProxyResolve = this.pendingProxyResolves.get(authInfoHash);
		if (!pendingProxyResolve) {
			this.logService.trace('auth#onLogin (proxy) - no pending proxy handling found, starting new');

			pendingProxyResolve = this.resolveProxyCredentials(authInfo, authInfoHash);
			this.pendingProxyResolves.set(authInfoHash, pendingProxyResolve);
			try {
				credentials = await pendingProxyResolve;
			} finally {
				this.pendingProxyResolves.delete(authInfoHash);
			}
		} else {
			this.logService.trace('auth#onLogin (proxy) - pending proxy handling found');

			credentials = await pendingProxyResolve;
		}

		// According to Electron docs, it is fine to call back without
		// username or password to signal that the authentication was handled
		// by us, even though without having credentials received:
		//
		// > If `callback` is called without a username or password, the authentication
		// > request will be cancelled and the authentication error will be returned to the
		// > page.
		callback?.(credentials?.username, credentials?.password);
		return credentials;
	}

	private async resolveProxyCredentials(authInfo: AuthInfo, authInfoHash: string): Promise<Credentials | undefined> {
		this.logService.trace('auth#resolveProxyCredentials (proxy) - enter');

		try {
			const credentials = await this.doResolveProxyCredentials(authInfo, authInfoHash);
			if (credentials) {
				this.logService.trace('auth#resolveProxyCredentials (proxy) - got credentials');

				return credentials;
			} else {
				this.logService.trace('auth#resolveProxyCredentials (proxy) - did not get credentials');
			}
		} finally {
			this.logService.trace('auth#resolveProxyCredentials (proxy) - exit');
		}

		return undefined;
	}

	private async doResolveProxyCredentials(authInfo: AuthInfo, authInfoHash: string): Promise<Credentials | undefined> {
		this.logService.trace('auth#doResolveProxyCredentials - enter', authInfo);

		// For testing.
		if (this.environmentMainService.extensionTestsLocationURI) {
			try {
				const decodedRealm = Buffer.from(authInfo.realm, 'base64').toString('utf-8');
				if (decodedRealm.startsWith('{')) {
					return JSON.parse(decodedRealm);
				}
			} catch {
				// ignore
			}
			return undefined;
		}

		// Reply with manually supplied credentials. Fail if they are wrong.
		const newHttpProxy = (this.configurationService.getValue<string>('http.proxy') || '').trim()
			|| (process.env['https_proxy'] || process.env['HTTPS_PROXY'] || process.env['http_proxy'] || process.env['HTTP_PROXY'] || '').trim()
			|| undefined;

		if (newHttpProxy?.indexOf('@') !== -1) {
			const uri = URI.parse(newHttpProxy!);
			const i = uri.authority.indexOf('@');
			if (i !== -1) {
				if (authInfo.attempt > 1) {
					this.logService.trace('auth#doResolveProxyCredentials (proxy) - exit - ignoring previously used config/envvar credentials');
					return undefined; // We tried already, let the user handle it.
				}
				this.logService.trace('auth#doResolveProxyCredentials (proxy) - exit - found config/envvar credentials to use');
				const credentials = uri.authority.substring(0, i);
				const j = credentials.indexOf(':');
				if (j !== -1) {
					return {
						username: credentials.substring(0, j),
						password: credentials.substring(j + 1)
					};
				} else {
					return {
						username: credentials,
						password: ''
					};
				}
			}
		}

		// Reply with session credentials unless we used them already.
		// In that case we need to show a login dialog again because
		// they seem invalid.
		const sessionCredentials = authInfo.attempt === 1 && this.sessionCredentials.get(authInfoHash);
		if (sessionCredentials) {
			this.logService.trace('auth#doResolveProxyCredentials (proxy) - exit - found session credentials to use');

			const { username, password } = sessionCredentials;
			return { username, password };
		}

		let storedUsername: string | undefined;
		let storedPassword: string | undefined;
		try {
			// Try to find stored credentials for the given auth info
			const encryptedValue = this.applicationStorageMainService.get(this.PROXY_CREDENTIALS_SERVICE_KEY + authInfoHash, StorageScope.APPLICATION);
			if (encryptedValue) {
				const credentials: Credentials = JSON.parse(await this.encryptionMainService.decrypt(encryptedValue));
				storedUsername = credentials.username;
				storedPassword = credentials.password;
			}
		} catch (error) {
			this.logService.error(error); // handle errors by asking user for login via dialog
		}

		// Reply with stored credentials unless we used them already.
		// In that case we need to show a login dialog again because
		// they seem invalid.
		if (authInfo.attempt === 1 && typeof storedUsername === 'string' && typeof storedPassword === 'string') {
			this.logService.trace('auth#doResolveProxyCredentials (proxy) - exit - found stored credentials to use');

			this.sessionCredentials.set(authInfoHash, { username: storedUsername, password: storedPassword });
			return { username: storedUsername, password: storedPassword };
		}

		const previousDialog = this.currentDialog;
		const currentDialog = this.currentDialog = (async () => {
			await previousDialog;
			const credentials = await this.showProxyCredentialsDialog(authInfo, authInfoHash, storedUsername, storedPassword);
			if (this.currentDialog === currentDialog!) {
				this.currentDialog = undefined;
			}
			return credentials;
		})();
		return currentDialog;
	}

	private async showProxyCredentialsDialog(authInfo: AuthInfo, authInfoHash: string, storedUsername: string | undefined, storedPassword: string | undefined): Promise<Credentials | undefined> {
		if (this.cancelledAuthInfoHashes.has(authInfoHash)) {
			this.logService.trace('auth#doResolveProxyCredentials (proxy) - exit - login dialog was cancelled before, not showing again');

			return undefined;
		}

		// Find suitable window to show dialog: prefer to show it in the
		// active window because any other network request will wait on
		// the credentials and we want the user to present the dialog.
		const window = this.windowsMainService.getFocusedWindow() || this.windowsMainService.getLastActiveWindow();
		if (!window) {
			this.logService.trace('auth#doResolveProxyCredentials (proxy) - exit - no opened window found to show dialog in');

			return undefined; // unexpected
		}

		this.logService.trace(`auth#doResolveProxyCredentials (proxy) - asking window ${window.id} to handle proxy login`);

		// Open proxy dialog
		const sessionCredentials = this.sessionCredentials.get(authInfoHash);
		const payload = {
			authInfo,
			username: sessionCredentials?.username ?? storedUsername, // prefer to show already used username (if any) over stored
			password: sessionCredentials?.password ?? storedPassword, // prefer to show already used password (if any) over stored
			replyChannel: `vscode:proxyAuthResponse:${generateUuid()}`
		};
		window.sendWhenReady('vscode:openProxyAuthenticationDialog', CancellationToken.None, payload);

		// Handle reply
		const loginDialogCredentials = await new Promise<Credentials | undefined>(resolve => {
			const proxyAuthResponseHandler = async (event: ElectronEvent, channel: string, reply: Credentials & { remember: boolean } | undefined /* canceled */) => {
				if (channel === payload.replyChannel) {
					this.logService.trace(`auth#doResolveProxyCredentials - exit - received credentials from window ${window.id}`);
					window.win?.webContents.off('ipc-message', proxyAuthResponseHandler);

					// We got credentials from the window
					if (reply) {
						const credentials: Credentials = { username: reply.username, password: reply.password };

						// Update stored credentials based on `remember` flag
						try {
							if (reply.remember) {
								const encryptedSerializedCredentials = await this.encryptionMainService.encrypt(JSON.stringify(credentials));
								this.applicationStorageMainService.store(
									this.PROXY_CREDENTIALS_SERVICE_KEY + authInfoHash,
									encryptedSerializedCredentials,
									StorageScope.APPLICATION,
									// Always store in machine scope because we do not want these values to be synced
									StorageTarget.MACHINE
								);
							} else {
								this.applicationStorageMainService.remove(this.PROXY_CREDENTIALS_SERVICE_KEY + authInfoHash, StorageScope.APPLICATION);
							}
						} catch (error) {
							this.logService.error(error); // handle gracefully
						}

						resolve({ username: credentials.username, password: credentials.password });
					}

					// We did not get any credentials from the window (e.g. cancelled)
					else {
						this.cancelledAuthInfoHashes.add(authInfoHash);
						resolve(undefined);
					}
				}
			};

			window.win?.webContents.on('ipc-message', proxyAuthResponseHandler);
		});

		// Remember credentials for the session in case
		// the credentials are wrong and we show the dialog
		// again
		this.sessionCredentials.set(authInfoHash, loginDialogCredentials);

		return loginDialogCredentials;
	}
}
