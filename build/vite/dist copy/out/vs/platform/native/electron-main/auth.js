/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { app } from 'electron';
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
import { IApplicationStorageMainService } from '../../storage/electron-main/storageMainService.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
export const IProxyAuthService = createDecorator('proxyAuthService');
let ProxyAuthService = class ProxyAuthService extends Disposable {
    constructor(logService, windowsMainService, encryptionMainService, applicationStorageMainService, configurationService, environmentMainService) {
        super();
        this.logService = logService;
        this.windowsMainService = windowsMainService;
        this.encryptionMainService = encryptionMainService;
        this.applicationStorageMainService = applicationStorageMainService;
        this.configurationService = configurationService;
        this.environmentMainService = environmentMainService;
        this.PROXY_CREDENTIALS_SERVICE_KEY = 'proxy-credentials://';
        this.pendingProxyResolves = new Map();
        this.currentDialog = undefined;
        this.cancelledAuthInfoHashes = new Set();
        this.sessionCredentials = new Map();
        this.registerListeners();
    }
    registerListeners() {
        const onLogin = Event.fromNodeEventEmitter(app, 'login', (event, _webContents, req, authInfo, callback) => ({ event, authInfo: { ...authInfo, attempt: req.firstAuthAttempt ? 1 : 2 }, callback }));
        this._register(onLogin(this.onLogin, this));
    }
    async lookupAuthorization(authInfo) {
        return this.onLogin({ authInfo });
    }
    async onLogin({ event, authInfo, callback }) {
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
        let credentials = undefined;
        let pendingProxyResolve = this.pendingProxyResolves.get(authInfoHash);
        if (!pendingProxyResolve) {
            this.logService.trace('auth#onLogin (proxy) - no pending proxy handling found, starting new');
            pendingProxyResolve = this.resolveProxyCredentials(authInfo, authInfoHash);
            this.pendingProxyResolves.set(authInfoHash, pendingProxyResolve);
            try {
                credentials = await pendingProxyResolve;
            }
            finally {
                this.pendingProxyResolves.delete(authInfoHash);
            }
        }
        else {
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
    async resolveProxyCredentials(authInfo, authInfoHash) {
        this.logService.trace('auth#resolveProxyCredentials (proxy) - enter');
        try {
            const credentials = await this.doResolveProxyCredentials(authInfo, authInfoHash);
            if (credentials) {
                this.logService.trace('auth#resolveProxyCredentials (proxy) - got credentials');
                return credentials;
            }
            else {
                this.logService.trace('auth#resolveProxyCredentials (proxy) - did not get credentials');
            }
        }
        finally {
            this.logService.trace('auth#resolveProxyCredentials (proxy) - exit');
        }
        return undefined;
    }
    async doResolveProxyCredentials(authInfo, authInfoHash) {
        this.logService.trace('auth#doResolveProxyCredentials - enter', authInfo);
        // For testing.
        if (this.environmentMainService.extensionTestsLocationURI) {
            try {
                const decodedRealm = Buffer.from(authInfo.realm, 'base64').toString('utf-8');
                if (decodedRealm.startsWith('{')) {
                    return JSON.parse(decodedRealm);
                }
            }
            catch {
                // ignore
            }
            return undefined;
        }
        // Reply with manually supplied credentials. Fail if they are wrong.
        const newHttpProxy = (this.configurationService.getValue('http.proxy') || '').trim()
            || (process.env['https_proxy'] || process.env['HTTPS_PROXY'] || process.env['http_proxy'] || process.env['HTTP_PROXY'] || '').trim()
            || undefined;
        if (newHttpProxy?.indexOf('@') !== -1) {
            const uri = URI.parse(newHttpProxy);
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
                }
                else {
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
        let storedUsername;
        let storedPassword;
        try {
            // Try to find stored credentials for the given auth info
            const encryptedValue = this.applicationStorageMainService.get(this.PROXY_CREDENTIALS_SERVICE_KEY + authInfoHash, -1 /* StorageScope.APPLICATION */);
            if (encryptedValue) {
                const credentials = JSON.parse(await this.encryptionMainService.decrypt(encryptedValue));
                storedUsername = credentials.username;
                storedPassword = credentials.password;
            }
        }
        catch (error) {
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
            if (this.currentDialog === currentDialog) {
                this.currentDialog = undefined;
            }
            return credentials;
        })();
        return currentDialog;
    }
    async showProxyCredentialsDialog(authInfo, authInfoHash, storedUsername, storedPassword) {
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
        const loginDialogCredentials = await new Promise(resolve => {
            const proxyAuthResponseHandler = async (event, channel, reply /* canceled */) => {
                if (channel === payload.replyChannel) {
                    this.logService.trace(`auth#doResolveProxyCredentials - exit - received credentials from window ${window.id}`);
                    window.win?.webContents.off('ipc-message', proxyAuthResponseHandler);
                    // We got credentials from the window
                    if (reply) {
                        const credentials = { username: reply.username, password: reply.password };
                        // Update stored credentials based on `remember` flag
                        try {
                            if (reply.remember) {
                                const encryptedSerializedCredentials = await this.encryptionMainService.encrypt(JSON.stringify(credentials));
                                this.applicationStorageMainService.store(this.PROXY_CREDENTIALS_SERVICE_KEY + authInfoHash, encryptedSerializedCredentials, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
                            }
                            else {
                                this.applicationStorageMainService.remove(this.PROXY_CREDENTIALS_SERVICE_KEY + authInfoHash, -1 /* StorageScope.APPLICATION */);
                            }
                        }
                        catch (error) {
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
};
ProxyAuthService = __decorate([
    __param(0, ILogService),
    __param(1, IWindowsMainService),
    __param(2, IEncryptionMainService),
    __param(3, IApplicationStorageMainService),
    __param(4, IConfigurationService),
    __param(5, IEnvironmentMainService)
], ProxyAuthService);
export { ProxyAuthService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL25hdGl2ZS9lbGVjdHJvbi1tYWluL2F1dGgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLEdBQUcsRUFBb0csTUFBTSxVQUFVLENBQUM7QUFDakksT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUM1RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNwRixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUN0RixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUNwRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDOUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBR3RELE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBWTdFLE1BQU0sQ0FBQyxNQUFNLGlCQUFpQixHQUFHLGVBQWUsQ0FBb0Isa0JBQWtCLENBQUMsQ0FBQztBQU1qRixJQUFNLGdCQUFnQixHQUF0QixNQUFNLGdCQUFpQixTQUFR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