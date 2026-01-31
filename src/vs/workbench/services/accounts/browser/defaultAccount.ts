/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { AuthenticationSession, AuthenticationSessionAccount, IAuthenticationExtensionsService, IAuthenticationService } from '../../authentication/common/authentication.js';
import { asJson, IRequestService } from '../../../../platform/request/common/request.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Barrier, RunOnceScheduler, ThrottledDelayer, timeout } from '../../../../base/common/async.js';
import { IHostService } from '../../host/browser/host.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { IDefaultAccount, IDefaultAccountAuthenticationProvider, IEntitlementsData, IPolicyData } from '../../../../base/common/defaultAccount.js';
import { isString, Mutable } from '../../../../base/common/types.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { isWeb } from '../../../../base/common/platform.js';
import { IDefaultAccountProvider, IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { distinct } from '../../../../base/common/arrays.js';
import { equals } from '../../../../base/common/objects.js';
import { IDefaultChatAgent } from '../../../../base/common/product.js';
import { IRequestContext } from '../../../../base/parts/request/common/request.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

interface IDefaultAccountConfig {
	readonly preferredExtensions: string[];
	readonly authenticationProvider: {
		readonly default: {
			readonly id: string;
			readonly name: string;
		};
		readonly enterprise: {
			readonly id: string;
			readonly name: string;
		};
		readonly enterpriseProviderConfig: string;
		readonly enterpriseProviderUriSetting: string;
		readonly scopes: string[][];
	};
	readonly tokenEntitlementUrl: string;
	readonly entitlementUrl: string;
	readonly mcpRegistryDataUrl: string;
}

export const DEFAULT_ACCOUNT_SIGN_IN_COMMAND = 'workbench.actions.accounts.signIn';

const enum DefaultAccountStatus {
	Uninitialized = 'uninitialized',
	Unavailable = 'unavailable',
	Available = 'available',
}

const CONTEXT_DEFAULT_ACCOUNT_STATE = new RawContextKey<string>('defaultAccountStatus', DefaultAccountStatus.Uninitialized);
const CACHED_POLICY_DATA_KEY = 'defaultAccount.cachedPolicyData';
const ACCOUNT_DATA_POLL_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

interface ITokenEntitlementsResponse {
	token: string;
}

interface IMcpRegistryProvider {
	readonly url: string;
	readonly registry_access: 'allow_all' | 'registry_only';
	readonly owner: {
		readonly login: string;
		readonly id: number;
		readonly type: string;
		readonly parent_login: string | null;
		readonly priority: number;
	};
}

interface IMcpRegistryResponse {
	readonly mcp_registries: ReadonlyArray<IMcpRegistryProvider>;
}

function toDefaultAccountConfig(defaultChatAgent: IDefaultChatAgent): IDefaultAccountConfig {
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

export class DefaultAccountService extends Disposable implements IDefaultAccountService {
	declare _serviceBrand: undefined;

	private defaultAccount: IDefaultAccount | null = null;
	get policyData(): IPolicyData | null { return this.defaultAccountProvider?.policyData ?? null; }

	private readonly initBarrier = new Barrier();

	private readonly _onDidChangeDefaultAccount = this._register(new Emitter<IDefaultAccount | null>());
	readonly onDidChangeDefaultAccount = this._onDidChangeDefaultAccount.event;

	private readonly _onDidChangePolicyData = this._register(new Emitter<IPolicyData | null>());
	readonly onDidChangePolicyData = this._onDidChangePolicyData.event;

	private readonly defaultAccountConfig: IDefaultAccountConfig;
	private defaultAccountProvider: IDefaultAccountProvider | null = null;

	constructor(
		@IProductService productService: IProductService,
	) {
		super();
		this.defaultAccountConfig = toDefaultAccountConfig(productService.defaultChatAgent);
	}

	async getDefaultAccount(): Promise<IDefaultAccount | null> {
		await this.initBarrier.wait();
		return this.defaultAccount;
	}

	getDefaultAccountAuthenticationProvider(): IDefaultAccountAuthenticationProvider {
		if (this.defaultAccountProvider) {
			return this.defaultAccountProvider.getDefaultAccountAuthenticationProvider();
		}
		return {
			...this.defaultAccountConfig.authenticationProvider.default,
			enterprise: false
		};
	}

	setDefaultAccountProvider(provider: IDefaultAccountProvider): void {
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
		});
	}

	async refresh(): Promise<IDefaultAccount | null> {
		await this.initBarrier.wait();

		const account = await this.defaultAccountProvider?.refresh();
		this.setDefaultAccount(account ?? null);
		return this.defaultAccount;
	}

	async signIn(options?: { additionalScopes?: readonly string[];[key: string]: unknown }): Promise<IDefaultAccount | null> {
		await this.initBarrier.wait();
		return this.defaultAccountProvider?.signIn(options) ?? null;
	}

	private setDefaultAccount(account: IDefaultAccount | null): void {
		if (equals(this.defaultAccount, account)) {
			return;
		}
		this.defaultAccount = account;
		this._onDidChangeDefaultAccount.fire(this.defaultAccount);
	}
}

interface IAccountPolicyData {
	readonly accountId: string;
	readonly policyData: IPolicyData;
}

interface IDefaultAccountData {
	defaultAccount: IDefaultAccount;
	policyData: IAccountPolicyData | null;
}

type DefaultAccountStatusTelemetry = {
	status: string;
	initial: boolean;
};

type DefaultAccountStatusTelemetryClassification = {
	owner: 'sandy081';
	comment: 'Log default account availability status';
	status: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Indicates whether default account is available or not.' };
	initial: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Indicates whether this is the initial status report.' };
};

class DefaultAccountProvider extends Disposable implements IDefaultAccountProvider {

	private _defaultAccount: IDefaultAccountData | null = null;
	get defaultAccount(): IDefaultAccount | null { return this._defaultAccount?.defaultAccount ?? null; }

	private _policyData: IAccountPolicyData | null = null;
	get policyData(): IPolicyData | null { return this._policyData?.policyData ?? null; }

	private readonly _onDidChangeDefaultAccount = this._register(new Emitter<IDefaultAccount | null>());
	readonly onDidChangeDefaultAccount = this._onDidChangeDefaultAccount.event;

	private readonly _onDidChangePolicyData = this._register(new Emitter<IPolicyData | null>());
	readonly onDidChangePolicyData = this._onDidChangePolicyData.event;

	private readonly accountStatusContext: IContextKey<string>;
	private initialized = false;
	private readonly initPromise: Promise<void>;
	private readonly updateThrottler = this._register(new ThrottledDelayer(100));
	private readonly accountDataPollScheduler = this._register(new RunOnceScheduler(() => this.updateDefaultAccount(), ACCOUNT_DATA_POLL_INTERVAL_MS));

	constructor(
		private readonly defaultAccountConfig: IDefaultAccountConfig,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IAuthenticationExtensionsService private readonly authenticationExtensionsService: IAuthenticationExtensionsService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IRequestService private readonly requestService: IRequestService,
		@ILogService private readonly logService: ILogService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IHostService private readonly hostService: IHostService,
	) {
		super();
		this.accountStatusContext = CONTEXT_DEFAULT_ACCOUNT_STATE.bindTo(contextKeyService);
		this._policyData = this.getCachedPolicyData();
		this.initPromise = this.init()
			.finally(() => {
				this.telemetryService.publicLog2<DefaultAccountStatusTelemetry, DefaultAccountStatusTelemetryClassification>('defaultaccount:status', { status: this.defaultAccount ? 'available' : 'unavailable', initial: true });
				this.initialized = true;
			});
	}

	private getCachedPolicyData(): IAccountPolicyData | null {
		const cached = this.storageService.get(CACHED_POLICY_DATA_KEY, StorageScope.APPLICATION);
		if (cached) {
			try {
				const { accountId, policyData } = JSON.parse(cached);
				if (accountId && policyData) {
					this.logService.debug('[DefaultAccount] Initializing with cached policy data');
					return { accountId, policyData };
				}
			} catch (error) {
				this.logService.error('[DefaultAccount] Failed to parse cached policy data', getErrorMessage(error));
			}
		}
		return null;
	}

	private async init(): Promise<void> {
		if (isWeb && !this.environmentService.remoteAuthority) {
			this.logService.debug('[DefaultAccount] Running in web without remote, skipping initialization');
			return;
		}

		try {
			await this.extensionService.whenInstalledExtensionsRegistered();
			this.logService.debug('[DefaultAccount] Installed extensions registered.');
		} catch (error) {
			this.logService.error('[DefaultAccount] Error while waiting for installed extensions to be registered', getErrorMessage(error));
		}

		this.logService.debug('[DefaultAccount] Starting initialization');
		await this.doUpdateDefaultAccount();
		this.logService.debug('[DefaultAccount] Initialization complete');

		this._register(this.onDidChangeDefaultAccount(account => {
			this.telemetryService.publicLog2<DefaultAccountStatusTelemetry, DefaultAccountStatusTelemetryClassification>('defaultaccount:status', { status: account ? 'available' : 'unavailable', initial: false });
		}));

		this._register(this.authenticationService.onDidChangeSessions(e => {
			const defaultAccountProvider = this.getDefaultAccountAuthenticationProvider();
			if (e.providerId !== defaultAccountProvider.id) {
				return;
			}
			if (this.defaultAccount && e.event.removed?.some(session => session.id === this.defaultAccount?.sessionId)) {
				this.setDefaultAccount(null);
			} else {
				this.logService.debug('[DefaultAccount] Sessions changed for default account provider, updating default account');
				this.updateDefaultAccount();
			}
		}));

		this._register(this.authenticationExtensionsService.onDidChangeAccountPreference(async e => {
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
			if (focused && this._defaultAccount) {
				// Update default account when window gets focused
				this.accountDataPollScheduler.cancel();
				this.logService.debug('[DefaultAccount] Window focused, updating default account');
				this.updateDefaultAccount();
			}
		}));
	}

	async refresh(): Promise<IDefaultAccount | null> {
		if (!this.initialized) {
			await this.initPromise;
			return this.defaultAccount;
		}

		this.logService.debug('[DefaultAccount] Refreshing default account');
		await this.updateDefaultAccount();
		return this.defaultAccount;
	}

	private async updateDefaultAccount(): Promise<void> {
		await this.updateThrottler.trigger(() => this.doUpdateDefaultAccount());
	}

	private async doUpdateDefaultAccount(): Promise<void> {
		try {
			const defaultAccount = await this.fetchDefaultAccount();
			this.setDefaultAccount(defaultAccount);
			this.scheduleAccountDataPoll();
		} catch (error) {
			this.logService.error('[DefaultAccount] Error while updating default account', getErrorMessage(error));
		}
	}

	private async fetchDefaultAccount(): Promise<IDefaultAccountData | null> {
		const defaultAccountProvider = this.getDefaultAccountAuthenticationProvider();
		this.logService.debug('[DefaultAccount] Default account provider ID:', defaultAccountProvider.id);

		const declaredProvider = this.authenticationService.declaredProviders.find(provider => provider.id === defaultAccountProvider.id);
		if (!declaredProvider) {
			this.logService.info(`[DefaultAccount] Authentication provider is not declared.`, defaultAccountProvider);
			return null;
		}

		return await this.getDefaultAccountForAuthenticationProvider(defaultAccountProvider);
	}

	private setDefaultAccount(account: IDefaultAccountData | null): void {
		if (equals(this._defaultAccount, account)) {
			return;
		}

		this.logService.trace('[DefaultAccount] Updating default account:', account);
		if (account) {
			this._defaultAccount = account;
			this.setPolicyData(account.policyData);
			this._onDidChangeDefaultAccount.fire(this._defaultAccount.defaultAccount);
			this.accountStatusContext.set(DefaultAccountStatus.Available);
			this.logService.debug('[DefaultAccount] Account status set to Available');
		} else {
			this._defaultAccount = null;
			this.setPolicyData(null);
			this._onDidChangeDefaultAccount.fire(null);
			this.accountDataPollScheduler.cancel();
			this.accountStatusContext.set(DefaultAccountStatus.Unavailable);
			this.logService.debug('[DefaultAccount] Account status set to Unavailable');
		}
	}

	private setPolicyData(accountPolicyData: IAccountPolicyData | null): void {
		if (equals(this._policyData, accountPolicyData)) {
			return;
		}
		this._policyData = accountPolicyData;
		this.cachePolicyData(accountPolicyData);
		this._onDidChangePolicyData.fire(this._policyData?.policyData ?? null);
	}

	private cachePolicyData(accountPolicyData: IAccountPolicyData | null): void {
		if (accountPolicyData) {
			this.logService.debug('[DefaultAccount] Caching policy data for account:', accountPolicyData.accountId);
			this.storageService.store(CACHED_POLICY_DATA_KEY, JSON.stringify(accountPolicyData), StorageScope.APPLICATION, StorageTarget.MACHINE);
		} else {
			this.logService.debug('[DefaultAccount] Removing cached policy data');
			this.storageService.remove(CACHED_POLICY_DATA_KEY, StorageScope.APPLICATION);
		}
	}

	private scheduleAccountDataPoll(): void {
		if (!this._defaultAccount) {
			return;
		}
		this.accountDataPollScheduler.schedule(ACCOUNT_DATA_POLL_INTERVAL_MS);
	}

	private extractFromToken(token: string): Map<string, string> {
		const result = new Map<string, string>();
		const firstPart = token?.split(':')[0];
		const fields = firstPart?.split(';');
		for (const field of fields) {
			const [key, value] = field.split('=');
			result.set(key, value);
		}
		this.logService.debug(`[DefaultAccount] extractFromToken: ${JSON.stringify(Object.fromEntries(result))}`);
		return result;
	}

	private async getDefaultAccountForAuthenticationProvider(authenticationProvider: IDefaultAccountAuthenticationProvider): Promise<IDefaultAccountData | null> {
		try {
			this.logService.debug('[DefaultAccount] Getting Default Account from authenticated sessions for provider:', authenticationProvider.id);
			const sessions = await this.findMatchingProviderSession(authenticationProvider.id, this.defaultAccountConfig.authenticationProvider.scopes);

			if (!sessions?.length) {
				this.logService.debug('[DefaultAccount] No matching session found for provider:', authenticationProvider.id);
				return null;
			}

			return this.getDefaultAccountFromAuthenticatedSessions(authenticationProvider, sessions);
		} catch (error) {
			this.logService.error('[DefaultAccount] Failed to get default account for provider:', authenticationProvider.id, getErrorMessage(error));
			return null;
		}
	}

	private async getDefaultAccountFromAuthenticatedSessions(authenticationProvider: IDefaultAccountAuthenticationProvider, sessions: AuthenticationSession[]): Promise<IDefaultAccountData | null> {
		try {
			const accountId = sessions[0].account.id;
			const [entitlementsData, tokenEntitlementsData] = await Promise.all([
				this.getEntitlements(sessions),
				this.getTokenEntitlements(sessions),
			]);

			let policyData: Mutable<IPolicyData> | undefined = this._policyData?.accountId === accountId ? { ...this._policyData.policyData } : undefined;
			if (tokenEntitlementsData) {
				policyData = policyData ?? {};
				policyData.chat_agent_enabled = tokenEntitlementsData.chat_agent_enabled;
				policyData.chat_preview_features_enabled = tokenEntitlementsData.chat_preview_features_enabled;
				policyData.mcp = tokenEntitlementsData.mcp;
				if (policyData.mcp) {
					const mcpRegistryProvider = await this.getMcpRegistryProvider(sessions);
					if (mcpRegistryProvider) {
						policyData.mcpRegistryUrl = mcpRegistryProvider.url;
						policyData.mcpAccess = mcpRegistryProvider.registry_access;
					}
				}
			}

			const defaultAccount: IDefaultAccount = {
				authenticationProvider,
				sessionId: sessions[0].id,
				enterprise: authenticationProvider.enterprise || sessions[0].account.label.includes('_'),
				entitlementsData,
			};
			this.logService.debug('[DefaultAccount] Successfully created default account for provider:', authenticationProvider.id);
			return { defaultAccount, policyData: policyData ? { accountId, policyData } : null };
		} catch (error) {
			this.logService.error('[DefaultAccount] Failed to create default account for provider:', authenticationProvider.id, getErrorMessage(error));
			return null;
		}
	}

	private async findMatchingProviderSession(authProviderId: string, allScopes: string[][]): Promise<AuthenticationSession[] | undefined> {
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

	private async getSessions(authProviderId: string): Promise<readonly AuthenticationSession[]> {
		for (let attempt = 1; attempt <= 3; attempt++) {
			try {
				let preferredAccount: AuthenticationSessionAccount | undefined;
				let preferredAccountName: string | undefined;
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
			} catch (error) {
				this.logService.warn(`[DefaultAccount] Attempt ${attempt} to get sessions failed:`, getErrorMessage(error));
				if (attempt === 3) {
					throw error;
				}
				await timeout(500);
			}
		}
		throw new Error('Unable to get sessions after multiple attempts');
	}

	private scopesMatch(scopes: ReadonlyArray<string>, expectedScopes: string[]): boolean {
		return expectedScopes.every(scope => scopes.includes(scope));
	}

	private async getTokenEntitlements(sessions: AuthenticationSession[]): Promise<Partial<IPolicyData> | undefined> {
		const tokenEntitlementsUrl = this.getTokenEntitlementUrl();
		if (!tokenEntitlementsUrl) {
			this.logService.debug('[DefaultAccount] No token entitlements URL found');
			return undefined;
		}

		this.logService.debug('[DefaultAccount] Fetching token entitlements from:', tokenEntitlementsUrl);
		const response = await this.request(tokenEntitlementsUrl, 'GET', undefined, sessions, CancellationToken.None);
		if (!response) {
			return undefined;
		}

		if (response.res.statusCode && response.res.statusCode !== 200) {
			this.logService.trace(`[DefaultAccount] unexpected status code ${response.res.statusCode} while fetching token entitlements`);
			return undefined;
		}

		try {
			const chatData = await asJson<ITokenEntitlementsResponse>(response);
			if (chatData) {
				const tokenMap = this.extractFromToken(chatData.token);
				return {
					// Editor preview features are disabled if the flag is present and set to 0
					chat_preview_features_enabled: tokenMap.get('editor_preview_features') !== '0',
					chat_agent_enabled: tokenMap.get('agent_mode') !== '0',
					// MCP is disabled if the flag is present and set to 0
					mcp: tokenMap.get('mcp') !== '0',
				};
			}
			this.logService.error('Failed to fetch token entitlements', 'No data returned');
		} catch (error) {
			this.logService.error('Failed to fetch token entitlements', getErrorMessage(error));
		}

		return undefined;
	}

	private async getEntitlements(sessions: AuthenticationSession[]): Promise<IEntitlementsData | undefined | null> {
		const entitlementUrl = this.getEntitlementUrl();
		if (!entitlementUrl) {
			this.logService.debug('[DefaultAccount] No chat entitlements URL found');
			return undefined;
		}

		this.logService.debug('[DefaultAccount] Fetching entitlements from:', entitlementUrl);
		const response = await this.request(entitlementUrl, 'GET', undefined, sessions, CancellationToken.None);
		if (!response) {
			return undefined;
		}

		if (response.res.statusCode && response.res.statusCode !== 200) {
			this.logService.trace(`[DefaultAccount] unexpected status code ${response.res.statusCode} while fetching entitlements`);
			return (
				response.res.statusCode === 401 || 	// oauth token being unavailable (expired/revoked)
				response.res.statusCode === 404		// missing scopes/permissions, service pretends the endpoint doesn't exist
			) ? null : undefined;
		}

		try {
			const data = await asJson<IEntitlementsData>(response);
			if (data) {
				return data;
			}
			this.logService.error('[DefaultAccount] Failed to fetch entitlements', 'No data returned');
		} catch (error) {
			this.logService.error('[DefaultAccount] Failed to fetch entitlements', getErrorMessage(error));
		}
		return undefined;
	}

	private async getMcpRegistryProvider(sessions: AuthenticationSession[]): Promise<IMcpRegistryProvider | undefined> {
		const mcpRegistryDataUrl = this.getMcpRegistryDataUrl();
		if (!mcpRegistryDataUrl) {
			this.logService.debug('[DefaultAccount] No MCP registry data URL found');
			return undefined;
		}

		this.logService.debug('[DefaultAccount] Fetching MCP registry data from:', mcpRegistryDataUrl);
		const response = await this.request(mcpRegistryDataUrl, 'GET', undefined, sessions, CancellationToken.None);
		if (!response) {
			return undefined;
		}

		if (response.res.statusCode && response.res.statusCode !== 200) {
			this.logService.trace(`[DefaultAccount] unexpected status code ${response.res.statusCode} while fetching MCP registry data`);
			return undefined;
		}

		try {
			const data = await asJson<IMcpRegistryResponse>(response);
			if (data) {
				this.logService.debug('Fetched MCP registry providers', data.mcp_registries);
				return data.mcp_registries[0];
			}
			this.logService.debug('Failed to fetch MCP registry providers', 'No data returned');
		} catch (error) {
			this.logService.error('Failed to fetch MCP registry providers', getErrorMessage(error));
		}
		return undefined;
	}

	private async request(url: string, type: 'GET', body: undefined, sessions: AuthenticationSession[], token: CancellationToken): Promise<IRequestContext | undefined>;
	private async request(url: string, type: 'POST', body: object, sessions: AuthenticationSession[], token: CancellationToken): Promise<IRequestContext | undefined>;
	private async request(url: string, type: 'GET' | 'POST', body: object | undefined, sessions: AuthenticationSession[], token: CancellationToken): Promise<IRequestContext | undefined> {
		let lastResponse: IRequestContext | undefined;

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
					}
				}, token);

				const status = response.res.statusCode;
				if (status && status !== 200) {
					lastResponse = response;
					continue; // try next session
				}

				return response;
			} catch (error) {
				if (!token.isCancellationRequested) {
					this.logService.error(`[chat entitlement] request: error ${error}`);
				}
			}
		}

		if (!lastResponse) {
			this.logService.trace('[DefaultAccount]: No response received for request', url);
			return undefined;
		}

		if (lastResponse.res.statusCode && lastResponse.res.statusCode !== 200) {
			this.logService.trace(`[DefaultAccount]: unexpected status code ${lastResponse.res.statusCode} for request`, url);
			return undefined;
		}

		return lastResponse;
	}

	private getEntitlementUrl(): string | undefined {
		if (this.getDefaultAccountAuthenticationProvider().enterprise) {
			try {
				const enterpriseUrl = this.getEnterpriseUrl();
				if (!enterpriseUrl) {
					return undefined;
				}
				return `${enterpriseUrl.protocol}//api.${enterpriseUrl.hostname}${enterpriseUrl.port ? ':' + enterpriseUrl.port : ''}/copilot_internal/user`;
			} catch (error) {
				this.logService.error(error);
			}
		}

		return this.defaultAccountConfig.entitlementUrl;
	}

	private getTokenEntitlementUrl(): string | undefined {
		if (this.getDefaultAccountAuthenticationProvider().enterprise) {
			try {
				const enterpriseUrl = this.getEnterpriseUrl();
				if (!enterpriseUrl) {
					return undefined;
				}
				return `${enterpriseUrl.protocol}//api.${enterpriseUrl.hostname}${enterpriseUrl.port ? ':' + enterpriseUrl.port : ''}/copilot_internal/v2/token`;
			} catch (error) {
				this.logService.error(error);
			}
		}

		return this.defaultAccountConfig.tokenEntitlementUrl;
	}

	private getMcpRegistryDataUrl(): string | undefined {
		if (this.getDefaultAccountAuthenticationProvider().enterprise) {
			try {
				const enterpriseUrl = this.getEnterpriseUrl();
				if (!enterpriseUrl) {
					return undefined;
				}
				return `${enterpriseUrl.protocol}//api.${enterpriseUrl.hostname}${enterpriseUrl.port ? ':' + enterpriseUrl.port : ''}/copilot/mcp_registry`;
			} catch (error) {
				this.logService.error(error);
			}
		}

		return this.defaultAccountConfig.mcpRegistryDataUrl;
	}

	getDefaultAccountAuthenticationProvider(): IDefaultAccountAuthenticationProvider {
		if (this.configurationService.getValue<string | undefined>(this.defaultAccountConfig.authenticationProvider.enterpriseProviderConfig) === this.defaultAccountConfig.authenticationProvider.enterprise.id) {
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

	private getEnterpriseUrl(): URL | undefined {
		const value = this.configurationService.getValue(this.defaultAccountConfig.authenticationProvider.enterpriseProviderUriSetting);
		if (!isString(value)) {
			return undefined;
		}
		return new URL(value);
	}

	async signIn(options?: { additionalScopes?: readonly string[];[key: string]: unknown }): Promise<IDefaultAccount | null> {
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

}

class DefaultAccountProviderContribution extends Disposable implements IWorkbenchContribution {

	static ID = 'workbench.contributions.defaultAccountProvider';

	constructor(
		@IProductService productService: IProductService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IDefaultAccountService defaultAccountService: IDefaultAccountService,
	) {
		super();
		const defaultAccountProvider = this._register(instantiationService.createInstance(DefaultAccountProvider, toDefaultAccountConfig(productService.defaultChatAgent)));
		defaultAccountService.setDefaultAccountProvider(defaultAccountProvider);
	}
}

registerWorkbenchContribution2(DefaultAccountProviderContribution.ID, DefaultAccountProviderContribution, WorkbenchPhase.BlockStartup);
