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
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import * as nls from '../../../nls.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { IAuthenticationService, IAuthenticationExtensionsService, isAuthenticationWwwAuthenticateRequest } from '../../services/authentication/common/authentication.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { IDialogService } from '../../../platform/dialogs/common/dialogs.js';
import Severity from '../../../base/common/severity.js';
import { INotificationService } from '../../../platform/notification/common/notification.js';
import { IExtensionService } from '../../services/extensions/common/extensions.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { Emitter } from '../../../base/common/event.js';
import { IAuthenticationAccessService } from '../../services/authentication/browser/authenticationAccessService.js';
import { IAuthenticationUsageService } from '../../services/authentication/browser/authenticationUsageService.js';
import { getAuthenticationProviderActivationEvent } from '../../services/authentication/browser/authenticationService.js';
import { URI } from '../../../base/common/uri.js';
import { IOpenerService } from '../../../platform/opener/common/opener.js';
import { CancellationError } from '../../../base/common/errors.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IURLService } from '../../../platform/url/common/url.js';
import { DeferredPromise, raceTimeout } from '../../../base/common/async.js';
import { IDynamicAuthenticationProviderStorageService } from '../../services/authentication/common/dynamicAuthenticationProviderStorage.js';
import { IClipboardService } from '../../../platform/clipboard/common/clipboardService.js';
import { IQuickInputService } from '../../../platform/quickinput/common/quickInput.js';
import { IProductService } from '../../../platform/product/common/productService.js';
class MainThreadAuthenticationProvider extends Disposable {
    constructor(_proxy, id, label, supportsMultipleAccounts, authorizationServers, resourceServer, onDidChangeSessionsEmitter) {
        super();
        this._proxy = _proxy;
        this.id = id;
        this.label = label;
        this.supportsMultipleAccounts = supportsMultipleAccounts;
        this.authorizationServers = authorizationServers;
        this.resourceServer = resourceServer;
        this.onDidChangeSessions = onDidChangeSessionsEmitter.event;
    }
    async getSessions(scopes, options) {
        return this._proxy.$getSessions(this.id, scopes, options);
    }
    createSession(scopes, options) {
        return this._proxy.$createSession(this.id, scopes, options);
    }
    async removeSession(sessionId) {
        await this._proxy.$removeSession(this.id, sessionId);
    }
}
class MainThreadAuthenticationProviderWithChallenges extends MainThreadAuthenticationProvider {
    constructor(proxy, id, label, supportsMultipleAccounts, authorizationServers, resourceServer, onDidChangeSessionsEmitter) {
        super(proxy, id, label, supportsMultipleAccounts, authorizationServers, resourceServer, onDidChangeSessionsEmitter);
    }
    getSessionsFromChallenges(constraint, options) {
        return this._proxy.$getSessionsFromChallenges(this.id, constraint, options);
    }
    createSessionFromChallenges(constraint, options) {
        return this._proxy.$createSessionFromChallenges(this.id, constraint, options);
    }
}
let MainThreadAuthentication = class MainThreadAuthentication extends Disposable {
    constructor(extHostContext, productService, authenticationService, authenticationExtensionsService, authenticationAccessService, authenticationUsageService, dialogService, notificationService, extensionService, telemetryService, openerService, logService, urlService, dynamicAuthProviderStorageService, clipboardService, quickInputService) {
        super();
        this.productService = productService;
        this.authenticationService = authenticationService;
        this.authenticationExtensionsService = authenticationExtensionsService;
        this.authenticationAccessService = authenticationAccessService;
        this.authenticationUsageService = authenticationUsageService;
        this.dialogService = dialogService;
        this.notificationService = notificationService;
        this.extensionService = extensionService;
        this.telemetryService = telemetryService;
        this.openerService = openerService;
        this.logService = logService;
        this.urlService = urlService;
        this.dynamicAuthProviderStorageService = dynamicAuthProviderStorageService;
        this.clipboardService = clipboardService;
        this.quickInputService = quickInputService;
        this._registrations = this._register(new DisposableMap());
        this._sentProviderUsageEvents = new Set();
        this._suppressUnregisterEvent = false;
        // TODO@TylerLeonhardt this is a temporary addition to telemetry to understand what extensions are overriding the client id.
        // We can use this telemetry to reach out to these extension authors and let them know that they many need configuration changes
        // due to the adoption of the Microsoft broker.
        // Remove this in a few iterations.
        this._sentClientIdUsageEvents = new Set();
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostAuthentication);
        this._register(this.authenticationService.onDidChangeSessions(e => this._proxy.$onDidChangeAuthenticationSessions(e.providerId, e.label)));
        this._register(this.authenticationService.onDidUnregisterAuthenticationProvider(e => {
            if (!this._suppressUnregisterEvent) {
                this._proxy.$onDidUnregisterAuthenticationProvider(e.id);
            }
        }));
        this._register(this.authenticationExtensionsService.onDidChangeAccountPreference(e => {
            const providerInfo = this.authenticationService.getProvider(e.providerId);
            this._proxy.$onDidChangeAuthenticationSessions(providerInfo.id, providerInfo.label, e.extensionIds);
        }));
        // Listen for dynamic authentication provider token changes
        this._register(this.dynamicAuthProviderStorageService.onDidChangeTokens(e => {
            this._proxy.$onDidChangeDynamicAuthProviderTokens(e.authProviderId, e.clientId, e.tokens);
        }));
        this._register(authenticationService.registerAuthenticationProviderHostDelegate({
            // Prefer Node.js extension hosts when they're available. No CORS issues etc.
            priority: extHostContext.extensionHostKind === 2 /* ExtensionHostKind.LocalWebWorker */ ? 0 : 1,
            create: async (authorizationServer, serverMetadata, resource) => {
                // Auth Provider Id is a combination of the authorization server and the resource, if provided.
                const authProviderId = resource ? `${authorizationServer.toString(true)} ${resource.resource}` : authorizationServer.toString(true);
                const clientDetails = await this.dynamicAuthProviderStorageService.getClientRegistration(authProviderId);
                let clientId = clientDetails?.clientId;
                const clientSecret = clientDetails?.clientSecret;
                let initialTokens = undefined;
                if (clientId) {
                    initialTokens = await this.dynamicAuthProviderStorageService.getSessionsForDynamicAuthProvider(authProviderId, clientId);
                    // If we don't already have a client id, check if the server supports the Client Id Metadata flow (see docs on the property)
                    // and add the "client id" if so.
                }
                else if (serverMetadata.client_id_metadata_document_supported) {
                    clientId = this.productService.authClientIdMetadataUrl;
                }
                return await this._proxy.$registerDynamicAuthProvider(authorizationServer, serverMetadata, resource, clientId, clientSecret, initialTokens);
            }
        }));
    }
    async $registerAuthenticationProvider({ id, label, supportsMultipleAccounts, resourceServer, supportedAuthorizationServers, supportsChallenges }) {
        if (!this.authenticationService.declaredProviders.find(p => p.id === id)) {
            // If telemetry shows that this is not happening much, we can instead throw an error here.
            this.logService.warn(`Authentication provider ${id} was not declared in the Extension Manifest.`);
            this.telemetryService.publicLog2('authentication.providerNotDeclared', { id });
        }
        const emitter = new Emitter();
        this._registrations.set(id, emitter);
        const supportedAuthorizationServerUris = (supportedAuthorizationServers ?? []).map(i => URI.revive(i));
        const provider = supportsChallenges
            ? new MainThreadAuthenticationProviderWithChallenges(this._proxy, id, label, supportsMultipleAccounts, supportedAuthorizationServerUris, resourceServer ? URI.revive(resourceServer) : undefined, emitter)
            : new MainThreadAuthenticationProvider(this._proxy, id, label, supportsMultipleAccounts, supportedAuthorizationServerUris, resourceServer ? URI.revive(resourceServer) : undefined, emitter);
        this.authenticationService.registerAuthenticationProvider(id, provider);
    }
    async $unregisterAuthenticationProvider(id) {
        this._registrations.deleteAndDispose(id);
        // The ext host side already unregisters the provider, so we can suppress the event here.
        this._suppressUnregisterEvent = true;
        try {
            this.authenticationService.unregisterAuthenticationProvider(id);
        }
        finally {
            this._suppressUnregisterEvent = false;
        }
    }
    async $ensureProvider(id) {
        if (!this.authenticationService.isAuthenticationProviderRegistered(id)) {
            return await this.extensionService.activateByEvent(getAuthenticationProviderActivationEvent(id), 1 /* ActivationKind.Immediate */);
        }
    }
    async $sendDidChangeSessions(providerId, event) {
        const obj = this._registrations.get(providerId);
        if (obj instanceof Emitter) {
            obj.fire(event);
        }
    }
    $removeSession(providerId, sessionId) {
        return this.authenticationService.removeSession(providerId, sessionId);
    }
    async $waitForUriHandler(expectedUri) {
        const deferredPromise = new DeferredPromise();
        const disposable = this.urlService.registerHandler({
            handleURL: async (uri) => {
                if (uri.scheme !== expectedUri.scheme || uri.authority !== expectedUri.authority || uri.path !== expectedUri.path) {
                    return false;
                }
                deferredPromise.complete(uri);
                disposable.dispose();
                return true;
            }
        });
        const result = await raceTimeout(deferredPromise.p, 5 * 60 * 1000); // 5 minutes
        if (!result) {
            throw new Error('Timed out waiting for URI handler');
        }
        return await deferredPromise.p;
    }
    $showContinueNotification(message) {
        const yes = nls.localize('yes', "Yes");
        const no = nls.localize('no', "No");
        const deferredPromise = new DeferredPromise();
        let result = false;
        const handle = this.notificationService.prompt(Severity.Warning, message, [{
                label: yes,
                run: () => result = true
            }, {
                label: no,
                run: () => result = false
            }]);
        const disposable = handle.onDidClose(() => {
            deferredPromise.complete(result);
            disposable.dispose();
        });
        return deferredPromise.p;
    }
    async $registerDynamicAuthenticationProvider(details) {
        await this.$registerAuthenticationProvider({
            id: details.id,
            label: details.label,
            supportsMultipleAccounts: true,
            supportedAuthorizationServers: [details.authorizationServer],
            resourceServer: details.resourceServer,
        });
        await this.dynamicAuthProviderStorageService.storeClientRegistration(details.id, URI.revive(details.authorizationServer).toString(true), details.clientId, details.clientSecret, details.label);
    }
    async $setSessionsForDynamicAuthProvider(authProviderId, clientId, sessions) {
        await this.dynamicAuthProviderStorageService.setSessionsForDynamicAuthProvider(authProviderId, clientId, sessions);
    }
    async $sendDidChangeDynamicProviderInfo({ providerId, clientId, authorizationServer, label, clientSecret }) {
        this.logService.info(`Client ID for authentication provider ${providerId} changed to ${clientId}`);
        const existing = this.dynamicAuthProviderStorageService.getInteractedProviders().find(p => p.providerId === providerId);
        if (!existing) {
            throw new Error(`Dynamic authentication provider ${providerId} not found. Has it been registered?`);
        }
        // Store client credentials together
        await this.dynamicAuthProviderStorageService.storeClientRegistration(providerId || existing.providerId, authorizationServer ? URI.revive(authorizationServer).toString(true) : existing.authorizationServer, clientId || existing.clientId, clientSecret, label || existing.label);
    }
    async loginPrompt(provider, extensionName, recreatingSession, options) {
        let message;
        // Check if the provider has a custom confirmation message
        const customMessage = provider.confirmation?.(extensionName, recreatingSession);
        if (customMessage) {
            message = customMessage;
        }
        else {
            message = recreatingSession
                ? nls.localize('confirmRelogin', "The extension '{0}' wants you to sign in again using {1}.", extensionName, provider.label)
                : nls.localize('confirmLogin', "The extension '{0}' wants to sign in using {1}.", extensionName, provider.label);
        }
        const buttons = [
            {
                label: nls.localize({ key: 'allow', comment: ['&& denotes a mnemonic'] }, "&&Allow"),
                run() {
                    return true;
                },
            }
        ];
        if (options?.learnMore) {
            buttons.push({
                label: nls.localize('learnMore', "Learn more"),
                run: async () => {
                    const result = this.loginPrompt(provider, extensionName, recreatingSession, options);
                    await this.openerService.open(URI.revive(options.learnMore), { allowCommands: true });
                    return await result;
                }
            });
        }
        const { result } = await this.dialogService.prompt({
            type: Severity.Info,
            message,
            buttons,
            detail: options?.detail,
            cancelButton: true,
        });
        return result ?? false;
    }
    async continueWithIncorrectAccountPrompt(chosenAccountLabel, requestedAccountLabel) {
        const result = await this.dialogService.prompt({
            message: nls.localize('incorrectAccount', "Incorrect account detected"),
            detail: nls.localize('incorrectAccountDetail', "The chosen account, {0}, does not match the requested account, {1}.", chosenAccountLabel, requestedAccountLabel),
            type: Severity.Warning,
            cancelButton: true,
            buttons: [
                {
                    label: nls.localize('keep', 'Keep {0}', chosenAccountLabel),
                    run: () => chosenAccountLabel
                },
                {
                    label: nls.localize('loginWith', 'Login with {0}', requestedAccountLabel),
                    run: () => requestedAccountLabel
                }
            ],
        });
        if (!result.result) {
            throw new CancellationError();
        }
        return result.result === chosenAccountLabel;
    }
    async doGetSession(providerId, scopeListOrRequest, extensionId, extensionName, options) {
        const authorizationServer = URI.revive(options.authorizationServer);
        const sessions = await this.authenticationService.getSessions(providerId, scopeListOrRequest, { account: options.account, authorizationServer }, true);
        const provider = this.authenticationService.getProvider(providerId);
        // Error cases
        if (options.forceNewSession && options.createIfNone) {
            throw new Error('Invalid combination of options. Please remove one of the following: forceNewSession, createIfNone');
        }
        if (options.forceNewSession && options.silent) {
            throw new Error('Invalid combination of options. Please remove one of the following: forceNewSession, silent');
        }
        if (options.createIfNone && options.silent) {
            throw new Error('Invalid combination of options. Please remove one of the following: createIfNone, silent');
        }
        if (options.clearSessionPreference) {
            // Clearing the session preference is usually paired with createIfNone, so just remove the preference and
            // defer to the rest of the logic in this function to choose the session.
            this.authenticationExtensionsService.removeAccountPreference(extensionId, providerId);
        }
        const matchingAccountPreferenceSession = 
        // If an account was passed in, that takes precedence over the account preference
        options.account
            // We only support one session per account per set of scopes so grab the first one here
            ? sessions[0]
            : this._getAccountPreference(extensionId, providerId, sessions);
        // Check if the sessions we have are valid
        if (!options.forceNewSession && sessions.length) {
            // If we have an existing session preference, use that. If not, we'll return any valid session at the end of this function.
            if (matchingAccountPreferenceSession && this.authenticationAccessService.isAccessAllowed(providerId, matchingAccountPreferenceSession.account.label, extensionId)) {
                return matchingAccountPreferenceSession;
            }
            // If we only have one account for a single auth provider, lets just check if it's allowed and return it if it is.
            if (!provider.supportsMultipleAccounts && this.authenticationAccessService.isAccessAllowed(providerId, sessions[0].account.label, extensionId)) {
                return sessions[0];
            }
        }
        // We may need to prompt because we don't have a valid session
        // modal flows
        if (options.createIfNone || options.forceNewSession) {
            let uiOptions;
            if (typeof options.forceNewSession === 'object') {
                uiOptions = options.forceNewSession;
            }
            else if (typeof options.createIfNone === 'object') {
                uiOptions = options.createIfNone;
            }
            // We only want to show the "recreating session" prompt if we are using forceNewSession & there are sessions
            // that we will be "forcing through".
            const recreatingSession = !!(options.forceNewSession && sessions.length);
            const isAllowed = await this.loginPrompt(provider, extensionName, recreatingSession, uiOptions);
            if (!isAllowed) {
                throw new Error('User did not consent to login.');
            }
            let session;
            if (sessions?.length && !options.forceNewSession) {
                session = provider.supportsMultipleAccounts && !options.account
                    ? await this.authenticationExtensionsService.selectSession(providerId, extensionId, extensionName, scopeListOrRequest, sessions)
                    : sessions[0];
            }
            else {
                const accountToCreate = options.account ?? matchingAccountPreferenceSession?.account;
                do {
                    session = await this.authenticationService.createSession(providerId, scopeListOrRequest, {
                        activateImmediate: true,
                        account: accountToCreate,
                        authorizationServer
                    });
                } while (accountToCreate
                    && accountToCreate.label !== session.account.label
                    && !await this.continueWithIncorrectAccountPrompt(session.account.label, accountToCreate.label));
            }
            this.authenticationAccessService.updateAllowedExtensions(providerId, session.account.label, [{ id: extensionId, name: extensionName, allowed: true }]);
            this.authenticationExtensionsService.updateNewSessionRequests(providerId, [session]);
            this.authenticationExtensionsService.updateAccountPreference(extensionId, providerId, session.account);
            return session;
        }
        // For the silent flows, if we don't have a session that matches the account preference, we can return any valid session if there is only one to choose from.
        if (!matchingAccountPreferenceSession) {
            const validSessions = sessions.filter(session => this.authenticationAccessService.isAccessAllowed(providerId, session.account.label, extensionId));
            if (validSessions.length === 1) {
                return validSessions[0];
            }
        }
        // passive flows (silent or default)
        if (!options.silent) {
            // If there is a potential session, but the extension doesn't have access to it, use the "grant access" flow,
            // otherwise request a new one.
            sessions.length
                ? this.authenticationExtensionsService.requestSessionAccess(providerId, extensionId, extensionName, scopeListOrRequest, sessions)
                : await this.authenticationExtensionsService.requestNewSession(providerId, scopeListOrRequest, extensionId, extensionName);
        }
        return undefined;
    }
    async $getSession(providerId, scopeListOrRequest, extensionId, extensionName, options) {
        const scopes = isAuthenticationWwwAuthenticateRequest(scopeListOrRequest) ? scopeListOrRequest.fallbackScopes : scopeListOrRequest;
        if (scopes) {
            this.sendClientIdUsageTelemetry(extensionId, providerId, scopes);
        }
        const session = await this.doGetSession(providerId, scopeListOrRequest, extensionId, extensionName, options);
        if (session) {
            this.sendProviderUsageTelemetry(extensionId, providerId);
            this.authenticationUsageService.addAccountUsage(providerId, session.account.label, session.scopes, extensionId, extensionName);
        }
        return session;
    }
    async $getAccounts(providerId) {
        const accounts = await this.authenticationService.getAccounts(providerId);
        return accounts;
    }
    sendClientIdUsageTelemetry(extensionId, providerId, scopes) {
        const containsVSCodeClientIdScope = scopes.some(scope => scope.startsWith('VSCODE_CLIENT_ID:'));
        const key = `${extensionId}|${providerId}|${containsVSCodeClientIdScope}`;
        if (this._sentClientIdUsageEvents.has(key)) {
            return;
        }
        this._sentClientIdUsageEvents.add(key);
        if (containsVSCodeClientIdScope) {
            this.telemetryService.publicLog2('authentication.clientIdUsage', { extensionId });
        }
    }
    sendProviderUsageTelemetry(extensionId, providerId) {
        const key = `${extensionId}|${providerId}`;
        if (this._sentProviderUsageEvents.has(key)) {
            return;
        }
        this._sentProviderUsageEvents.add(key);
        this.telemetryService.publicLog2('authentication.providerUsage', { providerId, extensionId });
    }
    //#region Account Preferences
    // TODO@TylerLeonhardt: Update this after a few iterations to no longer fallback to the session preference
    _getAccountPreference(extensionId, providerId, sessions) {
        if (sessions.length === 0) {
            return undefined;
        }
        const accountNamePreference = this.authenticationExtensionsService.getAccountPreference(extensionId, providerId);
        if (accountNamePreference) {
            const session = sessions.find(session => session.account.label === accountNamePreference);
            return session;
        }
        return undefined;
    }
    //#endregion
    async $showDeviceCodeModal(userCode, verificationUri) {
        const { result } = await this.dialogService.prompt({
            type: Severity.Info,
            message: nls.localize('deviceCodeTitle', "Device Code Authentication"),
            detail: nls.localize('deviceCodeDetail', "Your code: {0}\n\nTo complete authentication, navigate to {1} and enter the code above.", userCode, verificationUri),
            buttons: [
                {
                    label: nls.localize('copyAndContinue', "Copy & Continue"),
                    run: () => true
                }
            ],
            cancelButton: true
        });
        if (result) {
            // Open verification URI
            try {
                await this.clipboardService.writeText(userCode);
                return await this.openerService.open(URI.parse(verificationUri));
            }
            catch (error) {
                this.notificationService.error(nls.localize('failedToOpenUri', "Failed to open {0}", verificationUri));
            }
        }
        return false;
    }
    async $promptForClientRegistration(authorizationServerUrl) {
        const redirectUrls = 'http://127.0.0.1:33418\nhttps://vscode.dev/redirect';
        // Show modal dialog first to explain the situation and get user consent
        const result = await this.dialogService.prompt({
            type: Severity.Info,
            message: nls.localize('dcrNotSupported', "Dynamic Client Registration not supported"),
            detail: nls.localize('dcrNotSupportedDetail', "The authorization server '{0}' does not support automatic client registration. Do you want to proceed by manually providing a client registration (client ID)?\n\nNote: When registering your OAuth application, make sure to include these redirect URIs:\n{1}", authorizationServerUrl, redirectUrls),
            buttons: [
                {
                    label: nls.localize('dcrCopyUrlsAndProceed', "Copy URIs & Proceed"),
                    run: async () => {
                        try {
                            await this.clipboardService.writeText(redirectUrls);
                        }
                        catch (error) {
                            this.notificationService.error(nls.localize('dcrFailedToCopy', "Failed to copy redirect URIs to clipboard."));
                        }
                        return true;
                    }
                },
            ],
            cancelButton: {
                label: nls.localize('cancel', "Cancel"),
                run: () => false
            }
        });
        if (!result) {
            return undefined;
        }
        const sharedTitle = nls.localize('addClientRegistrationDetails', "Add Client Registration Details");
        const clientId = await this.quickInputService.input({
            title: sharedTitle,
            prompt: nls.localize('clientIdPrompt', "Enter an existing client ID that has been registered with the following redirect URIs: http://127.0.0.1:33418, https://vscode.dev/redirect"),
            placeHolder: nls.localize('clientIdPlaceholder', "OAuth client ID (azye39d...)"),
            ignoreFocusLost: true,
            validateInput: async (value) => {
                if (!value || value.trim().length === 0) {
                    return nls.localize('clientIdRequired', "Client ID is required");
                }
                return undefined;
            }
        });
        if (!clientId || clientId.trim().length === 0) {
            return undefined;
        }
        const clientSecret = await this.quickInputService.input({
            title: sharedTitle,
            prompt: nls.localize('clientSecretPrompt', "(optional) Enter an existing client secret associated with the client id '{0}' or leave this field blank", clientId),
            placeHolder: nls.localize('clientSecretPlaceholder', "OAuth client secret (wer32o50f...) or leave it blank"),
            password: true,
            ignoreFocusLost: true
        });
        return {
            clientId: clientId.trim(),
            clientSecret: clientSecret?.trim() || undefined
        };
    }
};
MainThreadAuthentication = __decorate([
    extHostNamedCustomer(MainContext.MainThreadAuthentication),
    __param(1, IProductService),
    __param(2, IAuthenticationService),
    __param(3, IAuthenticationExtensionsService),
    __param(4, IAuthenticationAccessService),
    __param(5, IAuthenticationUsageService),
    __param(6, IDialogService),
    __param(7, INotificationService),
    __param(8, IExtensionService),
    __param(9, ITelemetryService),
    __param(10, IOpenerService),
    __param(11, ILogService),
    __param(12, IURLService),
    __param(13, IDynamicAuthenticationProviderStorageService),
    __param(14, IClipboardService),
    __param(15, IQuickInputService)
], MainThreadAuthentication);
export { MainThreadAuthentication };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZEF1dGhlbnRpY2F0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9icm93c2VyL21haW5UaHJlYWRBdXRoZW50aWNhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzlFLE9BQU8sS0FBSyxHQUFHLE1BQU0saUJBQWlCLENBQUM7QUFDdkMsT0FBTyxFQUFFLG9CQUFvQixFQUFtQixNQUFNLHNEQUFzRCxDQUFDO0FBQzdHLE9BQU8sRUFBcUYsc0JBQXNCLEVBQUUsZ0NBQWdDLEVBQXVFLHNDQUFzQyxFQUFvRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3BZLE9BQU8sRUFBOEIsY0FBYyxFQUF5RixXQUFXLEVBQWlDLE1BQU0sK0JBQStCLENBQUM7QUFDOU4sT0FBTyxFQUFFLGNBQWMsRUFBaUIsTUFBTSw2Q0FBNkMsQ0FBQztBQUM1RixPQUFPLFFBQVEsTUFBTSxrQ0FBa0MsQ0FBQztBQUN4RCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM3RixPQUFPLEVBQWtCLGlCQUFpQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDbkcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDcEYsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLHNFQUFzRSxDQUFDO0FBQ3BILE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQ2xILE9BQU8sRUFBRSx3Q0FBd0MsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBQzFILE9BQU8sRUFBRSxHQUFHLEVBQWlC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