"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.Sequencer = exports.CachedPublicClientApplication = void 0;
const msal_node_1 = require("@azure/msal-node");
const msal_node_extensions_1 = require("@azure/msal-node-extensions");
const vscode_1 = require("vscode");
const async_1 = require("../common/async");
const cachePlugin_1 = require("../common/cachePlugin");
const loggerOptions_1 = require("../common/loggerOptions");
class CachedPublicClientApplication {
    _clientId;
    _secretStorage;
    _accountAccess;
    _logger;
    // Core properties
    _pca;
    _accounts = [];
    _sequencer = new Sequencer();
    _disposable;
    // Cache properties
    _secretStorageCachePlugin;
    // Broker properties
    isBrokerAvailable = false;
    //#region Events
    _onDidAccountsChangeEmitter = new vscode_1.EventEmitter;
    onDidAccountsChange = this._onDidAccountsChangeEmitter.event;
    _onDidRemoveLastAccountEmitter = new vscode_1.EventEmitter();
    onDidRemoveLastAccount = this._onDidRemoveLastAccountEmitter.event;
    //#endregion
    constructor(_clientId, _secretStorage, _accountAccess, _logger, telemetryReporter) {
        this._clientId = _clientId;
        this._secretStorage = _secretStorage;
        this._accountAccess = _accountAccess;
        this._logger = _logger;
        this._secretStorageCachePlugin = new cachePlugin_1.SecretStorageCachePlugin(this._secretStorage, 
        // Include the prefix as a differentiator to other secrets
        `pca:${this._clientId}`);
        const loggerOptions = new loggerOptions_1.MsalLoggerOptions(_logger, telemetryReporter);
        let broker;
        if (vscode_1.env.uiKind === vscode_1.UIKind.Web) {
            this._logger.info(`[${this._clientId}] Native Broker is not available in web UI`);
        }
        else if (vscode_1.workspace.getConfiguration('microsoft-authentication').get('implementation') === 'msal-no-broker') {
            this._logger.info(`[${this._clientId}] Native Broker disabled via settings`);
        }
        else {
            const nativeBrokerPlugin = new msal_node_extensions_1.NativeBrokerPlugin();
            this.isBrokerAvailable = nativeBrokerPlugin.isBrokerAvailable;
            this._logger.info(`[${this._clientId}] Native Broker enabled: ${this.isBrokerAvailable}`);
            if (this.isBrokerAvailable) {
                broker = { nativeBrokerPlugin };
            }
        }
        this._pca = new msal_node_1.PublicClientApplication({
            auth: { clientId: _clientId },
            system: {
                loggerOptions: {
                    correlationId: _clientId,
                    loggerCallback: (level, message, containsPii) => loggerOptions.loggerCallback(level, message, containsPii),
                    logLevel: msal_node_1.LogLevel.Trace,
                    // Enable PII logging since it will only go to the output channel
                    piiLoggingEnabled: true
                }
            },
            broker,
            cache: { cachePlugin: this._secretStorageCachePlugin }
        });
        this._disposable = vscode_1.Disposable.from(this._registerOnSecretStorageChanged(), this._onDidAccountsChangeEmitter, this._onDidRemoveLastAccountEmitter, this._secretStorageCachePlugin);
    }
    get accounts() { return this._accounts; }
    get clientId() { return this._clientId; }
    static async create(clientId, secretStorage, accountAccess, logger, telemetryReporter) {
        const app = new CachedPublicClientApplication(clientId, secretStorage, accountAccess, logger, telemetryReporter);
        await app.initialize();
        return app;
    }
    async initialize() {
        await this._sequencer.queue(() => this._update());
    }
    dispose() {
        this._disposable.dispose();
    }
    async acquireTokenSilent(request) {
        this._logger.debug(`[acquireTokenSilent] [${this._clientId}] [${request.authority}] [${request.scopes.join(' ')}] [${request.account.username}] starting...`);
        let result = await this._sequencer.queue(() => this._pca.acquireTokenSilent(request));
        this._logger.debug(`[acquireTokenSilent] [${this._clientId}] [${request.authority}] [${request.scopes.join(' ')}] [${request.account.username}] got result`);
        // Check expiration of id token and if it's 5min before expiration, force a refresh.
        // this is what MSAL does for access tokens already so we're just adding it for id tokens since we care about those.
        // NOTE: Once we stop depending on id tokens for some things we can remove all of this.
        const idTokenExpirationInSecs = result.idTokenClaims.exp;
        if (idTokenExpirationInSecs) {
            const fiveMinutesBefore = new Date((idTokenExpirationInSecs - 5 * 60) // subtract 5 minutes
                * 1000 // convert to milliseconds
            );
            if (fiveMinutesBefore < new Date()) {
                this._logger.debug(`[acquireTokenSilent] [${this._clientId}] [${request.authority}] [${request.scopes.join(' ')}] [${request.account.username}] id token is expired or about to expire. Forcing refresh...`);
                const newRequest = this.isBrokerAvailable
                    // HACK: Broker doesn't support forceRefresh so we need to pass in claims which will force a refresh
                    ? { ...request, claims: request.claims ?? '{ "id_token": {}}' }
                    : { ...request, forceRefresh: true };
                result = await this._sequencer.queue(() => this._pca.acquireTokenSilent(newRequest));
                this._logger.debug(`[acquireTokenSilent] [${this._clientId}] [${request.authority}] [${request.scopes.join(' ')}] [${request.account.username}] got forced result`);
            }
            const newIdTokenExpirationInSecs = result.idTokenClaims.exp;
            if (newIdTokenExpirationInSecs) {
                const fiveMinutesBefore = new Date((newIdTokenExpirationInSecs - 5 * 60) // subtract 5 minutes
                    * 1000 // convert to milliseconds
                );
                if (fiveMinutesBefore < new Date()) {
                    this._logger.error(`[acquireTokenSilent] [${this._clientId}] [${request.authority}] [${request.scopes.join(' ')}] [${request.account.username}] id token is still expired.`);
                    // HACK: Only for the Broker we try one more time with different claims to force a refresh. Why? We've seen the Broker caching tokens by the claims requested, thus
                    // there has been a situation where both tokens are expired.
                    if (this.isBrokerAvailable) {
                        this._logger.error(`[acquireTokenSilent] [${this._clientId}] [${request.authority}] [${request.scopes.join(' ')}] [${request.account.username}] forcing refresh with different claims...`);
                        const newRequest = { ...request, claims: request.claims ?? '{ "access_token": {}}' };
                        result = await this._sequencer.queue(() => this._pca.acquireTokenSilent(newRequest));
                        this._logger.debug(`[acquireTokenSilent] [${this._clientId}] [${request.authority}] [${request.scopes.join(' ')}] [${request.account.username}] got forced result with different claims`);
                        const newIdTokenExpirationInSecs = result.idTokenClaims.exp;
                        if (newIdTokenExpirationInSecs) {
                            const fiveMinutesBefore = new Date((newIdTokenExpirationInSecs - 5 * 60) // subtract 5 minutes
                                * 1000 // convert to milliseconds
                            );
                            if (fiveMinutesBefore < new Date()) {
                                this._logger.error(`[acquireTokenSilent] [${this._clientId}] [${request.authority}] [${request.scopes.join(' ')}] [${request.account.username}] id token is still expired.`);
                            }
                        }
                    }
                }
            }
        }
        if (!result.account) {
            this._logger.error(`[acquireTokenSilent] [${this._clientId}] [${request.authority}] [${request.scopes.join(' ')}] [${request.account.username}] no account found in result`);
        }
        else if (!result.fromCache && this._verifyIfUsingBroker(result)) {
            this._logger.debug(`[acquireTokenSilent] [${this._clientId}] [${request.authority}] [${request.scopes.join(' ')}] [${request.account.username}] firing event due to change`);
            this._onDidAccountsChangeEmitter.fire({ added: [], changed: [result.account], deleted: [] });
        }
        return result;
    }
    async acquireTokenInteractive(request) {
        this._logger.debug(`[acquireTokenInteractive] [${this._clientId}] [${request.authority}] [${request.scopes?.join(' ')}] loopbackClientOverride: ${request.loopbackClient ? 'true' : 'false'}`);
        return await vscode_1.window.withProgress({
            location: vscode_1.ProgressLocation.Notification,
            cancellable: true,
            title: vscode_1.l10n.t('Signing in to Microsoft...')
        }, (_process, token) => this._sequencer.queue(async () => {
            try {
                const result = await (0, async_1.raceCancellationAndTimeoutError)(this._pca.acquireTokenInteractive(request), token, 1000 * 60 * 5);
                if (this.isBrokerAvailable) {
                    await this._accountAccess.setAllowedAccess(result.account, true);
                }
                // Force an update so that the account cache is updated.
                // TODO:@TylerLeonhardt The problem is, we use the sequencer for
                // change events but we _don't_ use it for the accounts cache.
                // We should probably use it for the accounts cache as well.
                await this._update();
                return result;
            }
            catch (error) {
                this._logger.error(`[acquireTokenInteractive] [${this._clientId}] [${request.authority}] [${request.scopes?.join(' ')}] error: ${error}`);
                throw error;
            }
        }));
    }
    /**
     * Allows for passing in a refresh token to get a new access token. This is the migration scenario.
     * TODO: MSAL Migration. Remove this when we remove the old flow.
     * @param request a {@link RefreshTokenRequest} object that contains the refresh token and other parameters.
     * @returns an {@link AuthenticationResult} object that contains the result of the token acquisition operation.
     */
    async acquireTokenByRefreshToken(request) {
        this._logger.debug(`[acquireTokenByRefreshToken] [${this._clientId}] [${request.authority}] [${request.scopes.join(' ')}]`);
        const result = await this._sequencer.queue(async () => {
            const result = await this._pca.acquireTokenByRefreshToken(request);
            // Force an update so that the account cache is updated.
            // TODO:@TylerLeonhardt The problem is, we use the sequencer for
            // change events but we _don't_ use it for the accounts cache.
            // We should probably use it for the accounts cache as well.
            await this._update();
            return result;
        });
        if (result) {
            // this._setupRefresh(result);
            if (this.isBrokerAvailable && result.account) {
                await this._accountAccess.setAllowedAccess(result.account, true);
            }
        }
        return result;
    }
    async acquireTokenByDeviceCode(request) {
        this._logger.debug(`[acquireTokenByDeviceCode] [${this._clientId}] [${request.authority}] [${request.scopes.join(' ')}]`);
        const result = await this._sequencer.queue(async () => {
            const deferredPromise = new async_1.DeferredPromise();
            const result = await Promise.race([
                this._pca.acquireTokenByDeviceCode({
                    ...request,
                    deviceCodeCallback: (response) => void this._deviceCodeCallback(response, deferredPromise)
                }),
                deferredPromise.p
            ]);
            await deferredPromise.complete(result);
            // Force an update so that the account cache is updated.
            // TODO:@TylerLeonhardt The problem is, we use the sequencer for
            // change events but we _don't_ use it for the accounts cache.
            // We should probably use it for the accounts cache as well.
            await this._update();
            return result;
        });
        if (result) {
            if (this.isBrokerAvailable && result.account) {
                await this._accountAccess.setAllowedAccess(result.account, true);
            }
        }
        return result;
    }
    async _deviceCodeCallback(
    // MSAL doesn't expose this type...
    response, deferredPromise) {
        const button = vscode_1.l10n.t('Copy & Continue to Microsoft');
        const modalResult = await vscode_1.window.showInformationMessage(vscode_1.l10n.t({ message: 'Your Code: {0}', args: [response.userCode], comment: ['The {0} will be a code, e.g. 123-456'] }), {
            modal: true,
            detail: vscode_1.l10n.t('To finish authenticating, navigate to Microsoft and paste in the above one-time code.')
        }, button);
        if (modalResult !== button) {
            this._logger.debug(`[deviceCodeCallback] [${this._clientId}] User cancelled the device code flow.`);
            deferredPromise.cancel();
            return;
        }
        await vscode_1.env.clipboard.writeText(response.userCode);
        await vscode_1.env.openExternal(vscode_1.Uri.parse(response.verificationUri));
        await vscode_1.window.withProgress({
            location: vscode_1.ProgressLocation.Notification,
            cancellable: true,
            title: vscode_1.l10n.t({
                message: 'Open [{0}]({0}) in a new tab and paste your one-time code: {1}',
                args: [response.verificationUri, response.userCode],
                comment: [
                    'The [{0}]({0}) will be a url and the {1} will be a code, e.g. 123456',
                    '{Locked="[{0}]({0})"}'
                ]
            })
        }, async (_, token) => {
            const disposable = token.onCancellationRequested(() => {
                this._logger.debug(`[deviceCodeCallback] [${this._clientId}] Device code flow cancelled by user.`);
                deferredPromise.cancel();
            });
            try {
                await deferredPromise.p;
                this._logger.debug(`[deviceCodeCallback] [${this._clientId}] Device code flow completed successfully.`);
            }
            catch (error) {
                // Ignore errors here, they are handled at a higher scope
            }
            finally {
                disposable.dispose();
            }
        });
    }
    removeAccount(account) {
        if (this.isBrokerAvailable) {
            return this._accountAccess.setAllowedAccess(account, false);
        }
        return this._sequencer.queue(() => this._pca.getTokenCache().removeAccount(account));
    }
    _registerOnSecretStorageChanged() {
        if (this.isBrokerAvailable) {
            return this._accountAccess.onDidAccountAccessChange(() => this._sequencer.queue(() => this._update()));
        }
        return this._secretStorageCachePlugin.onDidChange(() => this._sequencer.queue(() => this._update()));
    }
    _lastSeen = new Map();
    _verifyIfUsingBroker(result) {
        // If we're not brokering, we don't need to verify the date
        // the cache check will be sufficient
        if (!result.fromNativeBroker) {
            return true;
        }
        // The nativeAccountId is what the broker uses to differenciate all
        // types of accounts. Even if the "account" is a duplicate of another because
        // it's actaully a guest account in another tenant.
        let key = result.account.nativeAccountId;
        if (!key) {
            this._logger.error(`[verifyIfUsingBroker] [${this._clientId}] [${result.account.username}] no nativeAccountId found. Using homeAccountId instead.`);
            key = result.account.homeAccountId;
        }
        const lastSeen = this._lastSeen.get(key);
        const lastTimeAuthed = result.account.idTokenClaims.iat;
        if (!lastSeen) {
            this._lastSeen.set(key, lastTimeAuthed);
            return true;
        }
        if (lastSeen === lastTimeAuthed) {
            return false;
        }
        this._lastSeen.set(key, lastTimeAuthed);
        return true;
    }
    async _update() {
        const before = this._accounts;
        this._logger.debug(`[update] [${this._clientId}] CachedPublicClientApplication update before: ${before.length}`);
        // Clear in-memory cache so we know we're getting account data from the SecretStorage
        this._pca.clearCache();
        let after = await this._pca.getAllAccounts();
        if (this.isBrokerAvailable) {
            after = after.filter(a => this._accountAccess.isAllowedAccess(a));
        }
        this._accounts = after;
        this._logger.debug(`[update] [${this._clientId}] CachedPublicClientApplication update after: ${after.length}`);
        const beforeSet = new Set(before.map(b => b.homeAccountId));
        const afterSet = new Set(after.map(a => a.homeAccountId));
        const added = after.filter(a => !beforeSet.has(a.homeAccountId));
        const deleted = before.filter(b => !afterSet.has(b.homeAccountId));
        if (added.length > 0 || deleted.length > 0) {
            this._onDidAccountsChangeEmitter.fire({ added, changed: [], deleted });
            this._logger.debug(`[update] [${this._clientId}] CachedPublicClientApplication accounts changed. added: ${added.length}, deleted: ${deleted.length}`);
            if (!after.length) {
                this._logger.debug(`[update] [${this._clientId}] CachedPublicClientApplication final account deleted. Firing event.`);
                this._onDidRemoveLastAccountEmitter.fire();
            }
        }
        this._logger.debug(`[update] [${this._clientId}] CachedPublicClientApplication update complete`);
    }
}
exports.CachedPublicClientApplication = CachedPublicClientApplication;
class Sequencer {
    current = Promise.resolve(null);
    queue(promiseTask) {
        return this.current = this.current.then(() => promiseTask(), () => promiseTask());
    }
}
exports.Sequencer = Sequencer;
//# sourceMappingURL=cachedPublicClientApplication.js.map