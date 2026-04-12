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
import { distinct } from '../../../../base/common/arrays.js';
import { Barrier, RunOnceScheduler, ThrottledDelayer, timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { isWeb } from '../../../../base/common/platform.js';
import { isString, isUndefined } from '../../../../base/common/types.js';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { asJson, IRequestService, isClientError, isSuccess } from '../../../../platform/request/common/request.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IAuthenticationExtensionsService, IAuthenticationService } from '../../authentication/common/authentication.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { IHostService } from '../../host/browser/host.js';
export const DEFAULT_ACCOUNT_SIGN_IN_COMMAND = 'workbench.actions.accounts.signIn';
var DefaultAccountStatus;
(function (DefaultAccountStatus) {
    DefaultAccountStatus["Uninitialized"] = "uninitialized";
    DefaultAccountStatus["Unavailable"] = "unavailable";
    DefaultAccountStatus["Available"] = "available";
})(DefaultAccountStatus || (DefaultAccountStatus = {}));
const CONTEXT_DEFAULT_ACCOUNT_STATE = new RawContextKey('defaultAccountStatus', "uninitialized" /* DefaultAccountStatus.Uninitialized */);
const CACHED_POLICY_DATA_KEY = 'defaultAccount.cachedPolicyData';
const ACCOUNT_DATA_POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
function toDefaultAccountConfig(defaultChatAgent) {
    return {
        preferredExtensions: [
            defaultChatAgent.chatExtensionId,
            defaultChatAgent.extensionId,
        ],
        authenticationProvider: {
            default: {
                id: defaultChatAgent.provider.default.id,
                name: defaultChatAgent.provider.default.name,
            },
            enterprise: {
                id: defaultChatAgent.provider.enterprise.id,
                name: defaultChatAgent.provider.enterprise.name,
            },
            enterpriseProviderConfig: `${defaultChatAgent.completionsAdvancedSetting}.authProvider`,
            enterpriseProviderUriSetting: defaultChatAgent.providerUriSetting,
            scopes: defaultChatAgent.providerScopes,
        },
        entitlementUrl: defaultChatAgent.entitlementUrl,
        tokenEntitlementUrl: defaultChatAgent.tokenEntitlementUrl,
        mcpRegistryDataUrl: defaultChatAgent.mcpRegistryDataUrl,
    };
}
let DefaultAccountService = class DefaultAccountService extends Disposable {
    get policyData() { return this.defaultAccountProvider?.policyData ?? null; }
    get copilotTokenInfo() { return this.defaultAccountProvider?.copilotTokenInfo ?? null; }
    constructor(productService) {
        super();
        this.defaultAccount = null;
        this.initBarrier = new Barrier();
        this._onDidChangeDefaultAccount = this._register(new Emitter());
        this.onDidChangeDefaultAccount = this._onDidChangeDefaultAccount.event;
        this._onDidChangePolicyData = this._register(new Emitter());
        this.onDidChangePolicyData = this._onDidChangePolicyData.event;
        this._onDidChangeCopilotTokenInfo = this._register(new Emitter());
        this.onDidChangeCopilotTokenInfo = this._onDidChangeCopilotTokenInfo.event;
        this.defaultAccountProvider = null;
        this.defaultAccountConfig = toDefaultAccountConfig(productService.defaultChatAgent);
    }
    async getDefaultAccount() {
        await this.initBarrier.wait();
        return this.defaultAccount;
    }
    getDefaultAccountAuthenticationProvider() {
        if (this.defaultAccountProvider) {
            return this.defaultAccountProvider.getDefaultAccountAuthenticationProvider();
        }
        return {
            ...this.defaultAccountConfig.authenticationProvider.default,
            enterprise: false
        };
    }
    setDefaultAccountProvider(provider) {
        if (this.defaultAccountProvider) {
            throw new Error('Default account provider is already set');
        }
        this.defaultAccountProvider = provider;
        if (this.defaultAccountProvider.policyData) {
            this._onDidChangePolicyData.fire(this.defaultAccountProvider.policyData);
        }
        provider.refresh().then(account => {
            this.defaultAccount = account;
        }).finally(() => {
            this.initBarrier.open();
            this._register(provider.onDidChangeDefaultAccount(account => this.setDefaultAccount(account)));
            this._register(provider.onDidChangePolicyData(policyData => this._onDidChangePolicyData.fire(policyData)));
            this._register(provider.onDidChangeCopilotTokenInfo(tokenInfo => this._onDidChangeCopilotTokenInfo.fire(tokenInfo)));
        });
    }
    async refresh() {
        await this.initBarrier.wait();
        const account = await this.defaultAccountProvider?.refresh();
        this.setDefaultAccount(account ?? null);
        return this.defaultAccount;
    }
    async signIn(options) {
        await this.initBarrier.wait();
        return this.defaultAccountProvider?.signIn(options) ?? null;
    }
    async signOut() {
        await this.initBarrier.wait();
        await this.defaultAccountProvider?.signOut();
    }
    setDefaultAccount(account) {
        if (equals(this.defaultAccount, account)) {
            return;
        }
        this.defaultAccount = account;
        this._onDidChangeDefaultAccount.fire(this.defaultAccount);
    }
};
DefaultAccountService = __decorate([
    __param(0, IProductService)
], DefaultAccountService);
export { DefaultAccountService };
let DefaultAccountProvider = class DefaultAccountProvider extends Disposable {
    get defaultAccount() { return this._defaultAccount?.defaultAccount ?? null; }
    get policyData() { return this._policyData?.policyData ?? null; }
    get copilotTokenInfo() { return this._copilotTokenInfo; }
    constructor(defaultAccountConfig, configurationService, authenticationService, authenticationExtensionsService, telemetryService, extensionService, requestService, logService, environmentService, contextKeyService, storageService, hostService, commandService) {
        super();
        this.defaultAccountConfig = defaultAccountConfig;
        this.configurationService = configurationService;
        this.authenticationService = authenticationService;
        this.authenticationExtensionsService = authenticationExtensionsService;
        this.telemetryService = telemetryService;
        this.extensionService = extensionService;
        this.requestService = requestService;
        this.logService = logService;
        this.environmentService = environmentService;
        this.storageService = storageService;
        this.hostService = hostService;
        this.commandService = commandService;
        this._defaultAccount = null;
        this._policyData = null;
        this._copilotTokenInfo = null;
        this._onDidChangeDefaultAccount = this._register(new Emitter());
        this.onDidChangeDefaultAccount = this._onDidChangeDefaultAccount.event;
        this._onDidChangePolicyData = this._register(new Emitter());
        this.onDidChangePolicyData = this._onDidChangePolicyData.event;
        this._onDidChangeCopilotTokenInfo = this._register(new Emitter());
        this.onDidChangeCopilotTokenInfo = this._onDidChangeCopilotTokenInfo.event;
        this.initialized = false;
        this.updateThrottler = this._register(new ThrottledDelayer(100));
        this.accountDataPollScheduler = this._register(new RunOnceScheduler(() => this.refetchDefaultAccount(), ACCOUNT_DATA_POLL_INTERVAL_MS));
        this.accountStatusContext = CONTEXT_DEFAULT_ACCOUNT_STATE.bindTo(contextKeyService);
        const cachedAccountData = this.getCachedAccountData();
        this._policyData = cachedAccountData?.accountPolicyData ?? null;
        this._copilotTokenInfo = cachedAccountData?.copilotTokenInfo ?? null;
        this.initPromise = this.init()
            .finally(() => {
            this.telemetryService.publicLog2('defaultaccount:status', { status: this.defaultAccount ? 'available' : 'unavailable', initial: true });
            this.initialized = true;
        });
    }
    getCachedAccountData() {
        const cached = this.storageService.get(CACHED_POLICY_DATA_KEY, -1 /* StorageScope.APPLICATION */);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                // TODO: Remove old format migration after August 2026.
                // Previously, the cache stored a flat IAccountPolicyData shape
                // (e.g. { accountId, policyData, ... }). We now wrap it inside
                // ICachedAccountData ({ accountPolicyData, copilotTokenInfo }).
                // This branch migrates the old flat format to the new shape and
                // re-stores it so subsequent reads use the new format directly.
                const { accountId, policyData, tokenEntitlementsFetchedAt, mcpRegistryDataFetchedAt, copilotTokenInfo } = parsed;
                if (accountId && policyData) {
                    this.logService.debug('[DefaultAccount] Initializing with cached policy data (migrating old format)');
                    const result = { accountPolicyData: { accountId, policyData, tokenEntitlementsFetchedAt, mcpRegistryDataFetchedAt }, copilotTokenInfo };
                    this.storageService.store(CACHED_POLICY_DATA_KEY, JSON.stringify(result), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
                    return result;
                }
                // New format
                const { accountPolicyData, copilotTokenInfo: wrappedCopilotTokenInfo } = parsed;
                if (accountPolicyData?.accountId && accountPolicyData?.policyData) {
                    this.logService.debug('[DefaultAccount] Initializing with cached policy data');
                    return { accountPolicyData, copilotTokenInfo: wrappedCopilotTokenInfo };
                }
            }
            catch (error) {
                this.logService.error('[DefaultAccount] Failed to parse cached policy data', getErrorMessage(error));
            }
        }
        return null;
    }
    async init() {
        if (isWeb && !this.environmentService.remoteAuthority) {
            this.logService.debug('[DefaultAccount] Running in web without remote, skipping initialization');
            return;
        }
        try {
            await this.extensionService.whenInstalledExtensionsRegistered();
            this.logService.debug('[DefaultAccount] Installed extensions registered.');
        }
        catch (error) {
            this.logService.error('[DefaultAccount] Error while waiting for installed extensions to be registered', getErrorMessage(error));
        }
        this.logService.debug('[DefaultAccount] Starting initialization');
        await this.doUpdateDefaultAccount();
        this.logService.debug('[DefaultAccount] Initialization complete');
        this._register(this.onDidChangeDefaultAccount(account => {
            this.telemetryService.publicLog2('defaultaccount:status', { status: account ? 'available' : 'unavailable', initial: false });
        }));
        this._register(this.authenticationService.onDidChangeSessions(e => {
            const defaultAccountProvider = this.getDefaultAccountAuthenticationProvider();
            if (e.providerId !== defaultAccountProvider.id) {
                return;
            }
            if (this.defaultAccount && e.event.removed?.some(session => session.id === this.defaultAccount?.sessionId)) {
                this.setDefaultAccount(null);
            }
            else {
                this.logService.debug('[DefaultAccount] Sessions changed for default account provider, updating default account');
                this.updateDefaultAccount();
            }
        }));
        this._register(this.authenticationExtensionsService.onDidChangeAccountPreference(async (e) => {
            const defaultAccountProvider = this.getDefaultAccountAuthenticationProvider();
            if (e.providerId !== defaultAccountProvider.id) {
                return;
            }
            this.logService.debug('[DefaultAccount] Account preference changed for default account provider, updating default account');
            this.updateDefaultAccount();
        }));
        this._register(this.authenticationService.onDidRegisterAuthenticationProvider(e => {
            const defaultAccountProvider = this.getDefaultAccountAuthenticationProvider();
            if (e.id !== defaultAccountProvider.id) {
                return;
            }
            this.logService.debug('[DefaultAccount] Default account provider registered, updating default account');
            this.updateDefaultAccount();
        }));
        this._register(this.authenticationService.onDidUnregisterAuthenticationProvider(e => {
            const defaultAccountProvider = this.getDefaultAccountAuthenticationProvider();
            if (e.id !== defaultAccountProvider.id) {
                return;
            }
            this.logService.debug('[DefaultAccount] Default account provider unregistered, updating default account');
            this.updateDefaultAccount();
        }));
        this._register(this.hostService.onDidChangeFocus(focused => {
            if (focused) {
                this.refetchDefaultAccount();
            }
        }));
    }
    async refresh() {
        if (!this.initialized) {
            await this.initPromise;
            return this.defaultAccount;
        }
        this.logService.debug('[DefaultAccount] Refreshing default account');
        await this.updateDefaultAccount();
        return this.defaultAccount;
    }
    async refetchDefaultAccount() {
        if (this.accountDataPollScheduler.isScheduled()) {
            this.accountDataPollScheduler.cancel();
        }
        if (!this.hostService.hasFocus || !this._defaultAccount) {
            this.scheduleAccountDataPoll();
            this.logService.debug('[DefaultAccount] Skipping refetching default account. Host is not focused or default account is not set');
            return;
        }
        this.logService.debug('[DefaultAccount] Refetching default account');
        await this.updateDefaultAccount();
    }
    async updateDefaultAccount() {
        await this.updateThrottler.trigger(() => this.doUpdateDefaultAccount());
    }
    async doUpdateDefaultAccount() {
        try {
            const defaultAccount = await this.fetchDefaultAccount();
            this.setDefaultAccount(defaultAccount);
            this.scheduleAccountDataPoll();
        }
        catch (error) {
            this.logService.error('[DefaultAccount] Error while updating default account', getErrorMessage(error));
        }
    }
    async fetchDefaultAccount() {
        const defaultAccountProvider = this.getDefaultAccountAuthenticationProvider();
        this.logService.debug('[DefaultAccount] Default account provider ID:', defaultAccountProvider.id);
        const declaredProvider = this.authenticationService.declaredProviders.find(provider => provider.id === defaultAccountProvider.id);
        if (!declaredProvider) {
            this.logService.info(`[DefaultAccount] Authentication provider is not declared.`, defaultAccountProvider);
            return null;
        }
        return await this.getDefaultAccountForAuthenticationProvider(defaultAccountProvider);
    }
    setDefaultAccount(account) {
        if (equals(this._defaultAccount, account)) {
            return;
        }
        this.logService.trace('[DefaultAccount] Updating default account:', account);
        if (account) {
            this._defaultAccount = account;
            this.setCopilotTokenInfo(account.copilotTokenInfo);
            this.setPolicyData(account.policyData);
            this._onDidChangeDefaultAccount.fire(this._defaultAccount.defaultAccount);
            this.accountStatusContext.set("available" /* DefaultAccountStatus.Available */);
            this.logService.debug('[DefaultAccount] Account status set to Available');
        }
        else {
            this._defaultAccount = null;
            this.setPolicyData(null);
            this.setCopilotTokenInfo(null);
            this._onDidChangeDefaultAccount.fire(null);
            this.accountDataPollScheduler.cancel();
            this.accountStatusContext.set("unavailable" /* DefaultAccountStatus.Unavailable */);
            this.logService.debug('[DefaultAccount] Account status set to Unavailable');
        }
    }
    setPolicyData(accountPolicyData) {
        if (equals(this._policyData, accountPolicyData)) {
            return;
        }
        this._policyData = accountPolicyData;
        this.cachePolicyData(accountPolicyData);
        this._onDidChangePolicyData.fire(this._policyData?.policyData ?? null);
    }
    setCopilotTokenInfo(copilotTokenInfo) {
        if (equals(this._copilotTokenInfo, copilotTokenInfo)) {
            return;
        }
        this._copilotTokenInfo = copilotTokenInfo;
        this._onDidChangeCopilotTokenInfo.fire(this._copilotTokenInfo);
    }
    cachePolicyData(accountPolicyData) {
        if (accountPolicyData) {
            this.logService.debug('[DefaultAccount] Caching policy data for account:', accountPolicyData.accountId);
            const cachedAccountData = {
                accountPolicyData,
                copilotTokenInfo: this._copilotTokenInfo ?? undefined,
            };
            this.storageService.store(CACHED_POLICY_DATA_KEY, JSON.stringify(cachedAccountData), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        }
        else {
            this.logService.debug('[DefaultAccount] Removing cached policy data');
            this.storageService.remove(CACHED_POLICY_DATA_KEY, -1 /* StorageScope.APPLICATION */);
        }
    }
    scheduleAccountDataPoll() {
        if (!this._defaultAccount) {
            return;
        }
        this.accountDataPollScheduler.schedule(ACCOUNT_DATA_POLL_INTERVAL_MS);
    }
    extractFromToken(token) {
        const result = new Map();
        const firstPart = token?.split(':')[0];
        const fields = firstPart?.split(';');
        for (const field of fields) {
            const [key, value] = field.split('=');
            result.set(key, value);
        }
        this.logService.debug(`[DefaultAccount] extractFromToken: ${JSON.stringify(Object.fromEntries(result))}`);
        return result;
    }
    async getDefaultAccountForAuthenticationProvider(authenticationProvider) {
        try {
            this.logService.debug('[DefaultAccount] Getting Default Account from authenticated sessions for provider:', authenticationProvider.id);
            const sessions = await this.findMatchingProviderSession(authenticationProvider.id, this.defaultAccountConfig.authenticationProvider.scopes);
            if (!sessions?.length) {
                this.logService.debug('[DefaultAccount] No matching session found for provider:', authenticationProvider.id);
                return null;
            }
            return this.getDefaultAccountFromAuthenticatedSessions(authenticationProvider, sessions);
        }
        catch (error) {
            this.logService.error('[DefaultAccount] Failed to get default account for provider:', authenticationProvider.id, getErrorMessage(error));
            return null;
        }
    }
    async getDefaultAccountFromAuthenticatedSessions(authenticationProvider, sessions) {
        try {
            const accountId = sessions[0].account.id;
            const accountPolicyData = this._policyData?.accountId === accountId ? this._policyData : undefined;
            const entitlementsResult = await this.getEntitlements(sessions, accountPolicyData);
            const entitlementsData = entitlementsResult?.data;
            const entitlementsFetchedAt = entitlementsResult?.fetchedAt;
            const tokenEntitlementsResult = entitlementsData?.chat_enabled ? await this.getTokenEntitlements(sessions, accountPolicyData) : undefined;
            const tokenEntitlementsFetchedAt = tokenEntitlementsResult?.fetchedAt;
            let mcpRegistryDataFetchedAt;
            let policyData = accountPolicyData?.policyData ? { ...accountPolicyData.policyData } : undefined;
            if (tokenEntitlementsResult?.data) {
                const tokenEntitlementsData = tokenEntitlementsResult.data;
                policyData = policyData ?? {};
                policyData.chat_agent_enabled = tokenEntitlementsData.policyData.chat_agent_enabled;
                policyData.chat_preview_features_enabled = tokenEntitlementsData.policyData.chat_preview_features_enabled;
                policyData.mcp = tokenEntitlementsData.policyData.mcp;
                if (policyData.mcp) {
                    const mcpRegistryResult = await this.getMcpRegistryProvider(sessions, accountPolicyData);
                    mcpRegistryDataFetchedAt = mcpRegistryResult?.fetchedAt;
                    policyData.mcpRegistryUrl = mcpRegistryResult?.data?.url;
                    policyData.mcpAccess = mcpRegistryResult?.data?.registry_access;
                }
                else {
                    policyData.mcpRegistryUrl = undefined;
                    policyData.mcpAccess = undefined;
                }
            }
            const defaultAccount = {
                authenticationProvider,
                accountName: sessions[0].account.label,
                sessionId: sessions[0].id,
                enterprise: authenticationProvider.enterprise || sessions[0].account.label.includes('_'),
                entitlementsData,
            };
            this.logService.debug('[DefaultAccount] Successfully created default account for provider:', authenticationProvider.id);
            const accountPolicyResult = policyData || entitlementsFetchedAt
                ? { accountId, policyData: policyData ?? {}, entitlementsFetchedAt, tokenEntitlementsFetchedAt, mcpRegistryDataFetchedAt }
                : null;
            return {
                defaultAccount,
                accountId,
                policyData: accountPolicyResult,
                copilotTokenInfo: tokenEntitlementsResult?.data?.copilotTokenInfo ?? null,
            };
        }
        catch (error) {
            this.logService.error('[DefaultAccount] Failed to create default account for provider:', authenticationProvider.id, getErrorMessage(error));
            return null;
        }
    }
    async findMatchingProviderSession(authProviderId, allScopes) {
        const sessions = await this.getSessions(authProviderId);
        const matchingSessions = [];
        for (const session of sessions) {
            this.logService.debug('[DefaultAccount] Checking session with scopes', session.scopes);
            for (const scopes of allScopes) {
                if (this.scopesMatch(session.scopes, scopes)) {
                    matchingSessions.push(session);
                }
            }
        }
        return matchingSessions.length > 0 ? matchingSessions : undefined;
    }
    async getSessions(authProviderId) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                let preferredAccount;
                let preferredAccountName;
                for (const preferredExtension of this.defaultAccountConfig.preferredExtensions) {
                    preferredAccountName = this.authenticationExtensionsService.getAccountPreference(preferredExtension, authProviderId);
                    if (preferredAccountName) {
                        break;
                    }
                }
                for (const account of await this.authenticationService.getAccounts(authProviderId)) {
                    if (account.label === preferredAccountName) {
                        preferredAccount = account;
                        break;
                    }
                }
                return await this.authenticationService.getSessions(authProviderId, undefined, { account: preferredAccount }, true);
            }
            catch (error) {
                this.logService.warn(`[DefaultAccount] Attempt ${attempt} to get sessions failed:`, getErrorMessage(error));
                if (attempt === 3) {
                    throw error;
                }
                await timeout(500);
            }
        }
        throw new Error('Unable to get sessions after multiple attempts');
    }
    scopesMatch(scopes, expectedScopes) {
        return expectedScopes.every(scope => scopes.includes(scope));
    }
    async getTokenEntitlements(sessions, accountPolicyData) {
        if (accountPolicyData?.tokenEntitlementsFetchedAt && !this.isDataStale(accountPolicyData.tokenEntitlementsFetchedAt)) {
            this.logService.debug('[DefaultAccount] Using last fetched token entitlements data');
            return { data: { policyData: accountPolicyData.policyData, copilotTokenInfo: this._copilotTokenInfo ?? {} }, fetchedAt: accountPolicyData.tokenEntitlementsFetchedAt };
        }
        const data = await this.requestTokenEntitlements(sessions);
        return { data, fetchedAt: Date.now() };
    }
    async requestTokenEntitlements(sessions) {
        const tokenEntitlementsUrl = this.getTokenEntitlementUrl();
        if (!tokenEntitlementsUrl) {
            this.logService.debug('[DefaultAccount] No token entitlements URL found');
            return undefined;
        }
        this.logService.debug('[DefaultAccount] Fetching token entitlements from:', tokenEntitlementsUrl);
        const response = await this.request(tokenEntitlementsUrl, 'GET', undefined, sessions, CancellationToken.None, 'defaultAccount.tokenEntitlements');
        if (!response) {
            return undefined;
        }
        if (response.res.statusCode && response.res.statusCode !== 200) {
            this.logService.trace(`[DefaultAccount] unexpected status code ${response.res.statusCode} while fetching token entitlements`);
            return undefined;
        }
        try {
            const chatData = await asJson(response);
            if (chatData) {
                const tokenMap = this.extractFromToken(chatData.token);
                return {
                    policyData: {
                        // Editor preview features are disabled if the flag is present and set to 0
                        chat_preview_features_enabled: tokenMap.get('editor_preview_features') !== '0',
                        chat_agent_enabled: tokenMap.get('agent_mode') !== '0',
                        // MCP is only enabled if the flag is explicitly present and set to 1
                        mcp: tokenMap.get('mcp') === '1',
                    },
                    copilotTokenInfo: {
                        sn: tokenMap.get('sn'),
                        fcv1: tokenMap.get('fcv1'),
                    },
                };
            }
            this.logService.error('Failed to fetch token entitlements', 'No data returned');
        }
        catch (error) {
            this.logService.error('Failed to fetch token entitlements', getErrorMessage(error));
        }
        return undefined;
    }
    async getEntitlements(sessions, accountPolicyData) {
        const accountId = sessions[0].account.id;
        const existingData = this._defaultAccount?.accountId === accountId ? this._defaultAccount?.defaultAccount.entitlementsData : undefined;
        if (existingData && accountPolicyData?.entitlementsFetchedAt && !this.isDataStale(accountPolicyData.entitlementsFetchedAt)) {
            this.logService.debug('[DefaultAccount] Using last fetched entitlements data');
            return { data: existingData, fetchedAt: accountPolicyData.entitlementsFetchedAt };
        }
        const entitlementUrl = this.getEntitlementUrl();
        if (!entitlementUrl) {
            this.logService.debug('[DefaultAccount] No chat entitlements URL found');
            return { data: undefined, fetchedAt: undefined };
        }
        this.logService.debug('[DefaultAccount] Fetching entitlements from:', entitlementUrl);
        const response = await this.request(entitlementUrl, 'GET', undefined, sessions, CancellationToken.None, 'defaultAccount.entitlements');
        if (!response) {
            return { data: undefined, fetchedAt: Date.now() };
        }
        if (response.res.statusCode && response.res.statusCode !== 200) {
            this.logService.trace(`[DefaultAccount] unexpected status code ${response.res.statusCode} while fetching entitlements`);
            const data = (response.res.statusCode === 401 || // oauth token being unavailable (expired/revoked)
                response.res.statusCode === 404 // missing scopes/permissions, service pretends the endpoint doesn't exist
            ) ? null : undefined;
            return { data, fetchedAt: Date.now() };
        }
        try {
            const data = await asJson(response);
            if (data) {
                return { data, fetchedAt: Date.now() };
            }
            this.logService.error('[DefaultAccount] Failed to fetch entitlements', 'No data returned');
        }
        catch (error) {
            this.logService.error('[DefaultAccount] Failed to fetch entitlements', getErrorMessage(error));
        }
        return { data: undefined, fetchedAt: Date.now() };
    }
    async getMcpRegistryProvider(sessions, accountPolicyData) {
        if (accountPolicyData?.mcpRegistryDataFetchedAt && !this.isDataStale(accountPolicyData.mcpRegistryDataFetchedAt)) {
            this.logService.debug('[DefaultAccount] Using last fetched MCP registry data');
            const data = accountPolicyData.policyData.mcpRegistryUrl && accountPolicyData.policyData.mcpAccess ? { url: accountPolicyData.policyData.mcpRegistryUrl, registry_access: accountPolicyData.policyData.mcpAccess } : null;
            return { data, fetchedAt: accountPolicyData.mcpRegistryDataFetchedAt };
        }
        const data = await this.requestMcpRegistryProvider(sessions);
        return !isUndefined(data) ? { data, fetchedAt: Date.now() } : undefined;
    }
    async requestMcpRegistryProvider(sessions) {
        const mcpRegistryDataUrl = this.getMcpRegistryDataUrl();
        if (!mcpRegistryDataUrl) {
            this.logService.debug('[DefaultAccount] No MCP registry data URL found');
            return null;
        }
        this.logService.debug('[DefaultAccount] Fetching MCP registry data from:', mcpRegistryDataUrl);
        const response = await this.request(mcpRegistryDataUrl, 'GET', undefined, sessions, CancellationToken.None, 'defaultAccount.mcpRegistryProvider');
        if (!response) {
            return undefined;
        }
        if (!isSuccess(response)) {
            if (isClientError(response)) {
                this.logService.debug(`[DefaultAccount] Received ${response.res.statusCode} for MCP registry data, treating as no registry available.`);
                return null;
            }
            this.logService.debug(`[DefaultAccount] unexpected status code ${response.res.statusCode} while fetching MCP registry data`);
            return undefined;
        }
        try {
            const data = await asJson(response);
            if (data) {
                this.logService.debug('Fetched MCP registry providers', data.mcp_registries);
                return data.mcp_registries[0] ?? null;
            }
            this.logService.debug('No MCP registry providers content found in response');
            return null;
        }
        catch (error) {
            this.logService.error('Failed to fetch MCP registry providers', getErrorMessage(error));
            return undefined;
        }
    }
    async request(url, type, body, sessions, token, callSite) {
        let lastResponse;
        for (const session of sessions) {
            if (token.isCancellationRequested) {
                return lastResponse;
            }
            try {
                const response = await this.requestService.request({
                    type,
                    url,
                    data: type === 'POST' ? JSON.stringify(body) : undefined,
                    disableCache: true,
                    headers: {
                        'Authorization': `Bearer ${session.accessToken}`
                    },
                    callSite
                }, token);
                const status = response.res.statusCode;
                if (status === 401 || status === 404) {
                    this.logService.debug(`[DefaultAccount] Received ${status} for URL ${url} with session ${session.id}, likely due to expired/revoked token or insufficient permissions.`, 'Trying next session if available.');
                    lastResponse = response;
                    continue; // try next session
                }
                return response;
            }
            catch (error) {
                if (!token.isCancellationRequested) {
                    this.logService.error(`[DefaultAccount] request: error ${error}`, url);
                }
            }
        }
        if (!lastResponse) {
            this.logService.trace('[DefaultAccount]: No response received for request', url);
            return undefined;
        }
        return lastResponse;
    }
    isDataStale(fetchedAt) {
        return (Date.now() - fetchedAt) >= ACCOUNT_DATA_POLL_INTERVAL_MS;
    }
    getEntitlementUrl() {
        if (this.getDefaultAccountAuthenticationProvider().enterprise) {
            try {
                const enterpriseUrl = this.getEnterpriseUrl();
                if (!enterpriseUrl) {
                    return undefined;
                }
                return `${enterpriseUrl.protocol}//api.${enterpriseUrl.hostname}${enterpriseUrl.port ? ':' + enterpriseUrl.port : ''}/copilot_internal/user`;
            }
            catch (error) {
                this.logService.error(error);
            }
        }
        return this.defaultAccountConfig.entitlementUrl;
    }
    getTokenEntitlementUrl() {
        if (this.getDefaultAccountAuthenticationProvider().enterprise) {
            try {
                const enterpriseUrl = this.getEnterpriseUrl();
                if (!enterpriseUrl) {
                    return undefined;
                }
                return `${enterpriseUrl.protocol}//api.${enterpriseUrl.hostname}${enterpriseUrl.port ? ':' + enterpriseUrl.port : ''}/copilot_internal/v2/token`;
            }
            catch (error) {
                this.logService.error(error);
            }
        }
        return this.defaultAccountConfig.tokenEntitlementUrl;
    }
    getMcpRegistryDataUrl() {
        if (this.getDefaultAccountAuthenticationProvider().enterprise) {
            try {
                const enterpriseUrl = this.getEnterpriseUrl();
                if (!enterpriseUrl) {
                    return undefined;
                }
                return `${enterpriseUrl.protocol}//api.${enterpriseUrl.hostname}${enterpriseUrl.port ? ':' + enterpriseUrl.port : ''}/copilot/mcp_registry`;
            }
            catch (error) {
                this.logService.error(error);
            }
        }
        return this.defaultAccountConfig.mcpRegistryDataUrl;
    }
    getDefaultAccountAuthenticationProvider() {
        if (this.configurationService.getValue(this.defaultAccountConfig.authenticationProvider.enterpriseProviderConfig) === this.defaultAccountConfig.authenticationProvider.enterprise.id) {
            return {
                ...this.defaultAccountConfig.authenticationProvider.enterprise,
                enterprise: true
            };
        }
        return {
            ...this.defaultAccountConfig.authenticationProvider.default,
            enterprise: false
        };
    }
    getEnterpriseUrl() {
        const value = this.configurationService.getValue(this.defaultAccountConfig.authenticationProvider.enterpriseProviderUriSetting);
        if (!isString(value)) {
            return undefined;
        }
        return new URL(value);
    }
    async signIn(options) {
        const authProvider = this.getDefaultAccountAuthenticationProvider();
        if (!authProvider) {
            throw new Error('No default account provider configured');
        }
        const { additionalScopes, ...sessionOptions } = options ?? {};
        const defaultAccountScopes = this.defaultAccountConfig.authenticationProvider.scopes[0];
        const scopes = additionalScopes ? distinct([...defaultAccountScopes, ...additionalScopes]) : defaultAccountScopes;
        const session = await this.authenticationService.createSession(authProvider.id, scopes, sessionOptions);
        for (const preferredExtension of this.defaultAccountConfig.preferredExtensions) {
            this.authenticationExtensionsService.updateAccountPreference(preferredExtension, authProvider.id, session.account);
        }
        await this.updateDefaultAccount();
        return this.defaultAccount;
    }
    async signOut() {
        if (!this.defaultAccount) {
            return;
        }
        this.commandService.executeCommand('_signOutOfAccount', { providerId: this.defaultAccount.authenticationProvider.id, accountLabel: this.defaultAccount.accountName });
    }
};
DefaultAccountProvider = __decorate([
    __param(1, IConfigurationService),
    __param(2, IAuthenticationService),
    __param(3, IAuthenticationExtensionsService),
    __param(4, ITelemetryService),
    __param(5, IExtensionService),
    __param(6, IRequestService),
    __param(7, ILogService),
    __param(8, IWorkbenchEnvironmentService),
    __param(9, IContextKeyService),
    __param(10, IStorageService),
    __param(11, IHostService),
    __param(12, ICommandService)
], DefaultAccountProvider);
let DefaultAccountProviderContribution = class DefaultAccountProviderContribution extends Disposable {
    static { this.ID = 'workbench.contributions.defaultAccountProvider'; }
    constructor(productService, instantiationService, defaultAccountService) {
        super();
        const defaultAccountProvider = this._register(instantiationService.createInstance(DefaultAccountProvider, toDefaultAccountConfig(productService.defaultChatAgent)));
        defaultAccountService.setDefaultAccountProvider(defaultAccountProvider);
    }
};
DefaultAccountProviderContribution = __decorate([
    __param(0, IProductService),
    __param(1, IInstantiationService),
    __param(2, IDefaultAccountService)
], DefaultAccountProviderContribution);
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: DEFAULT_ACCOUNT_SIGN_IN_COMMAND,
            title: localize2('signIn', 'Sign In'),
        });
    }
    async run(accessor) {
        const defaultAccountService = accessor.get(IDefaultAccountService);
        await defaultAccountService.signIn();
    }
});
registerWorkbenchContribution2(DefaultAccountProviderContribution.ID, DefaultAccountProviderContribution, 1 /* WorkbenchPhase.BlockStartup */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVmYXVsdEFjY291bnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvYWNjb3VudHMvYnJvd3Nlci9kZWZhdWx0QWNjb3VudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxnQkFBZ0IsRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN4RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUU1RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDcEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDNUQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRTVELE9BQU8sRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFXLE1BQU0sa0NBQWtDLENBQUM7QUFFbEYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDMUYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBZSxrQkFBa0IsRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN0SCxPQUFPLEVBQTJC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