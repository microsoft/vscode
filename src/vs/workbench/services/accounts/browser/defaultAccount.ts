/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from '../../../../base/common/arrays.js';
import { Barrier, RunOnceScheduler, ThrottledDelayer, timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ICopilotTokenInfo, IDefaultAccount, IDefaultAccountAuthenticationProvider, IEntitlementsData, IPolicyData } from '../../../../base/common/defaultAccount.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { isWeb } from '../../../../base/common/platform.js';
import { IDefaultChatAgent } from '../../../../base/common/product.js';
import { isString, isUndefined, Mutable } from '../../../../base/common/types.js';
import { IRequestContext } from '../../../../base/parts/request/common/request.js';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IDefaultAccountProvider, IDefaultAccountService, ManagedSettingsFetchStatus } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { asJson, IRequestService, isClientError, isSuccess, readHeader, retryAfterFromHeaders } from '../../../../platform/request/common/request.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { AuthenticationSession, AuthenticationSessionAccount, IAuthenticationExtensionsService, IAuthenticationService } from '../../authentication/common/authentication.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { IHostService } from '../../host/browser/host.js';
import { adaptManagedSettings, IManagedSettingsResponse } from './managedSettings.js';

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
	readonly managedSettingsUrl: string;
}

export const DEFAULT_ACCOUNT_SIGN_IN_COMMAND = 'workbench.actions.accounts.signIn';

const enum DefaultAccountStatus {
	Uninitialized = 'uninitialized',
	Unavailable = 'unavailable',
	Available = 'available',
}

const CONTEXT_DEFAULT_ACCOUNT_STATE = new RawContextKey<string>('defaultAccountStatus', DefaultAccountStatus.Uninitialized);
const CACHED_POLICY_DATA_KEY = 'defaultAccount.cachedPolicyData';
const ACCOUNT_DATA_POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const MANAGED_SETTINGS_REQUEST_TIMEOUT_MS = 5000;

interface ITokenEntitlementsResponse {
	token: string;
}

interface IMcpRegistryProvider {
	readonly url: string;
	readonly registry_access: 'allow_all' | 'registry_only';
	readonly owner?: {
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
		managedSettingsUrl: defaultChatAgent.managedSettingsUrl,
	};
}

export class DefaultAccountService extends Disposable implements IDefaultAccountService {
	declare _serviceBrand: undefined;

	private defaultAccount: IDefaultAccount | null = null;
	get currentDefaultAccount(): IDefaultAccount | null { return this.defaultAccount; }
	get policyData(): IPolicyData | null { return this.defaultAccountProvider?.policyData ?? null; }
	get copilotTokenInfo(): ICopilotTokenInfo | null { return this.defaultAccountProvider?.copilotTokenInfo ?? null; }

	get managedSettingsFetchStatus(): ManagedSettingsFetchStatus { return this.defaultAccountProvider?.managedSettingsFetchStatus ?? null; }
	get managedSettingsFetchedAt(): number | null { return this.defaultAccountProvider?.managedSettingsFetchedAt ?? null; }

	private readonly initBarrier = new Barrier();

	private readonly _onDidChangeDefaultAccount = this._register(new Emitter<IDefaultAccount | null>());
	readonly onDidChangeDefaultAccount = this._onDidChangeDefaultAccount.event;

	private readonly _onDidChangePolicyData = this._register(new Emitter<IPolicyData | null>());
	readonly onDidChangePolicyData = this._onDidChangePolicyData.event;

	private readonly _onDidChangeCopilotTokenInfo = this._register(new Emitter<ICopilotTokenInfo | null>());
	readonly onDidChangeCopilotTokenInfo = this._onDidChangeCopilotTokenInfo.event;

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
			this._register(provider.onDidChangeCopilotTokenInfo(tokenInfo => this._onDidChangeCopilotTokenInfo.fire(tokenInfo)));
		});
	}

	async refresh(options?: { forceRefresh?: boolean }): Promise<IDefaultAccount | null> {
		await this.initBarrier.wait();

		const account = await this.defaultAccountProvider?.refresh(options);
		this.setDefaultAccount(account ?? null);
		return this.defaultAccount;
	}

	async signIn(options?: { additionalScopes?: readonly string[];[key: string]: unknown }): Promise<IDefaultAccount | null> {
		await this.initBarrier.wait();
		return this.defaultAccountProvider?.signIn(options) ?? null;
	}

	async signOut(): Promise<void> {
		await this.initBarrier.wait();
		await this.defaultAccountProvider?.signOut();
	}

	resolveGitHubUrl(path: string): string {
		if (this.defaultAccountProvider) {
			return this.defaultAccountProvider.resolveGitHubUrl(path);
		}

		return `https://github.com/${path}`;
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
	readonly entitlementsFetchedAt?: number;
	readonly tokenEntitlementsFetchedAt?: number;
	readonly mcpRegistryDataFetchedAt?: number;
	readonly managedSettingsFetchedAt?: number;
}

interface ICachedAccountData {
	readonly accountPolicyData: IAccountPolicyData;
	readonly copilotTokenInfo?: ICopilotTokenInfo;
}

interface IDefaultAccountData {
	accountId: string;
	defaultAccount: IDefaultAccount;
	policyData: IAccountPolicyData | null;
	copilotTokenInfo: ICopilotTokenInfo | null;
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

type ManagedSettingsFetchTelemetry = {
	outcome: string;
	rateLimitBackoffActive: boolean;
};

type ManagedSettingsFetchTelemetryClassification = {
	owner: 'joshspicer';
	comment: 'Outcome of a fetch against the enterprise managed_settings endpoint. Used to detect endpoint regressions and abnormal failure rates in the wild.';
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'High-level outcome: a numeric HTTP status (`status:NNN`), or one of `ok` / `no-response` / `parse-error`.' };
	rateLimitBackoffActive: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'True when the request was short-circuited because a prior rate-limit Retry-After window was still active.' };
};

class DefaultAccountProvider extends Disposable implements IDefaultAccountProvider {

	private _defaultAccount: IDefaultAccountData | null = null;
	get defaultAccount(): IDefaultAccount | null { return this._defaultAccount?.defaultAccount ?? null; }

	private _policyData: IAccountPolicyData | null = null;
	get policyData(): IPolicyData | null { return this._policyData?.policyData ?? null; }

	private _copilotTokenInfo: ICopilotTokenInfo | null = null;
	get copilotTokenInfo(): ICopilotTokenInfo | null { return this._copilotTokenInfo; }

	private _managedSettingsFetchStatus: ManagedSettingsFetchStatus = null;
	get managedSettingsFetchStatus(): ManagedSettingsFetchStatus { return this._managedSettingsFetchStatus; }
	get managedSettingsFetchedAt(): number | null { return this._policyData?.managedSettingsFetchedAt ?? null; }

	private readonly _onDidChangeDefaultAccount = this._register(new Emitter<IDefaultAccount | null>());
	readonly onDidChangeDefaultAccount = this._onDidChangeDefaultAccount.event;

	private readonly _onDidChangePolicyData = this._register(new Emitter<IPolicyData | null>());
	readonly onDidChangePolicyData = this._onDidChangePolicyData.event;

	private readonly _onDidChangeCopilotTokenInfo = this._register(new Emitter<ICopilotTokenInfo | null>());
	readonly onDidChangeCopilotTokenInfo = this._onDidChangeCopilotTokenInfo.event;

	private readonly accountStatusContext: IContextKey<string>;
	private initialized = false;
	private readonly initPromise: Promise<void>;
	private readonly updateThrottler = this._register(new ThrottledDelayer(100));
	private readonly accountDataPollScheduler = this._register(new RunOnceScheduler(() => this.refetchDefaultAccount(), ACCOUNT_DATA_POLL_INTERVAL_MS));

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
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
		this.accountStatusContext = CONTEXT_DEFAULT_ACCOUNT_STATE.bindTo(contextKeyService);
		const cachedAccountData = this.getCachedAccountData();
		this._policyData = cachedAccountData?.accountPolicyData ?? null;
		this._copilotTokenInfo = cachedAccountData?.copilotTokenInfo ?? null;
		this.initPromise = this.init()
			.finally(() => {
				this.telemetryService.publicLog2<DefaultAccountStatusTelemetry, DefaultAccountStatusTelemetryClassification>('defaultaccount:status', { status: this.defaultAccount ? 'available' : 'unavailable', initial: true });
				this.initialized = true;
			});
	}

	private getCachedAccountData(): ICachedAccountData | null {
		const cached = this.storageService.get(CACHED_POLICY_DATA_KEY, StorageScope.APPLICATION);
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
					const result: ICachedAccountData = { accountPolicyData: { accountId, policyData, tokenEntitlementsFetchedAt, mcpRegistryDataFetchedAt }, copilotTokenInfo };
					this.storageService.store(CACHED_POLICY_DATA_KEY, JSON.stringify(result), StorageScope.APPLICATION, StorageTarget.MACHINE);
					return result;
				}

				// New format
				const { accountPolicyData, copilotTokenInfo: wrappedCopilotTokenInfo } = parsed;
				if (accountPolicyData?.accountId && accountPolicyData?.policyData) {
					this.logService.debug('[DefaultAccount] Initializing with cached policy data');
					return { accountPolicyData, copilotTokenInfo: wrappedCopilotTokenInfo };
				}
			} catch (error) {
				this.logService.error('[DefaultAccount] Failed to parse cached policy data', getErrorMessage(error));
			}
		}
		return null;
	}

	private async init(): Promise<void> {
		// Skip initialization for classic web-no-remote (vscode.dev editor), but
		// still initialize for the agents web workbench (vscode.dev/agents) where
		// account state drives the title bar and the welcome walkthrough.
		if (isWeb && !this.environmentService.remoteAuthority && !this.environmentService.isSessionsWindow) {
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
			if (focused) {
				this.refetchDefaultAccount();
			}
		}));
	}

	async refresh(options?: { forceRefresh?: boolean }): Promise<IDefaultAccount | null> {
		if (!this.initialized) {
			await this.initPromise;
			return this.defaultAccount;
		}

		this.logService.debug('[DefaultAccount] Refreshing default account');

		await this.updateDefaultAccount(options);
		return this.defaultAccount;
	}

	private async refetchDefaultAccount(): Promise<void> {
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

	private async updateDefaultAccount(options?: { forceRefresh?: boolean }): Promise<void> {
		await this.updateThrottler.trigger(() => this.doUpdateDefaultAccount(options));
	}

	private async doUpdateDefaultAccount(options?: { forceRefresh?: boolean }): Promise<void> {
		try {
			const defaultAccount = await this.fetchDefaultAccount(options);
			this.setDefaultAccount(defaultAccount);
			this.scheduleAccountDataPoll();
		} catch (error) {
			this.logService.error('[DefaultAccount] Error while updating default account', getErrorMessage(error));
		}
	}

	private async fetchDefaultAccount(options?: { forceRefresh?: boolean }): Promise<IDefaultAccountData | null> {
		const defaultAccountProvider = this.getDefaultAccountAuthenticationProvider();
		this.logService.debug('[DefaultAccount] Default account provider ID:', defaultAccountProvider.id);

		const declaredProvider = this.authenticationService.declaredProviders.find(provider => provider.id === defaultAccountProvider.id);
		if (!declaredProvider) {
			this.logService.info(`[DefaultAccount] Authentication provider is not declared.`, defaultAccountProvider);
			return null;
		}

		return await this.getDefaultAccountForAuthenticationProvider(defaultAccountProvider, options);
	}

	private setDefaultAccount(account: IDefaultAccountData | null): void {
		if (equals(this._defaultAccount, account)) {
			return;
		}

		this.logService.trace('[DefaultAccount] Updating default account:', account);
		if (account) {
			this._defaultAccount = account;
			this.setCopilotTokenInfo(account.copilotTokenInfo);
			this.setPolicyData(account.policyData);
			this._onDidChangeDefaultAccount.fire(this._defaultAccount.defaultAccount);
			this.accountStatusContext.set(DefaultAccountStatus.Available);
			this.logService.debug('[DefaultAccount] Account status set to Available');
		} else {
			this._defaultAccount = null;
			this.setPolicyData(null);
			this.setCopilotTokenInfo(null);
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

	private setCopilotTokenInfo(copilotTokenInfo: ICopilotTokenInfo | null): void {
		if (equals(this._copilotTokenInfo, copilotTokenInfo)) {
			return;
		}
		this._copilotTokenInfo = copilotTokenInfo;
		this._onDidChangeCopilotTokenInfo.fire(this._copilotTokenInfo);
	}

	private cachePolicyData(accountPolicyData: IAccountPolicyData | null): void {
		if (accountPolicyData) {
			this.logService.debug('[DefaultAccount] Caching policy data for account:', accountPolicyData.accountId);
			const cachedAccountData: ICachedAccountData = {
				accountPolicyData,
				copilotTokenInfo: this._copilotTokenInfo ?? undefined,
			};
			this.storageService.store(CACHED_POLICY_DATA_KEY, JSON.stringify(cachedAccountData), StorageScope.APPLICATION, StorageTarget.MACHINE);
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

	private async getDefaultAccountForAuthenticationProvider(authenticationProvider: IDefaultAccountAuthenticationProvider, options?: { forceRefresh?: boolean }): Promise<IDefaultAccountData | null> {
		try {
			this.logService.debug('[DefaultAccount] Getting Default Account from authenticated sessions for provider:', authenticationProvider.id);
			const sessions = await this.findMatchingProviderSession(authenticationProvider.id, this.defaultAccountConfig.authenticationProvider.scopes);

			if (!sessions?.length) {
				this.logService.debug('[DefaultAccount] No matching session found for provider:', authenticationProvider.id);
				return null;
			}
			return this.getDefaultAccountFromAuthenticatedSessions(authenticationProvider, sessions, options);
		} catch (error) {
			this.logService.error('[DefaultAccount] Failed to get default account for provider:', authenticationProvider.id, getErrorMessage(error));
			return null;
		}
	}

	private async getDefaultAccountFromAuthenticatedSessions(authenticationProvider: IDefaultAccountAuthenticationProvider, sessions: AuthenticationSession[], options?: { forceRefresh?: boolean }): Promise<IDefaultAccountData | null> {
		try {
			const accountId = sessions[0].account.id;
			const accountPolicyData = this._policyData?.accountId === accountId ? this._policyData : undefined;

			const entitlementsResult = await this.getEntitlements(sessions, accountPolicyData, options);
			const entitlementsData = entitlementsResult?.data;
			const entitlementsFetchedAt = entitlementsResult?.fetchedAt;
			const [tokenEntitlementsResult, managedSettingsResult] = entitlementsData?.chat_enabled
				? await Promise.all([
					this.getTokenEntitlements(sessions, accountPolicyData, options),
					this.getManagedSettings(sessions, accountPolicyData, options),
				])
				: [undefined, undefined];

			const tokenEntitlementsFetchedAt: number | undefined = tokenEntitlementsResult?.fetchedAt;
			const managedSettingsFetchedAt: number | undefined = managedSettingsResult?.fetchedAt;
			let mcpRegistryDataFetchedAt: number | undefined;
			let policyData: Mutable<IPolicyData> | undefined = accountPolicyData?.policyData ? { ...accountPolicyData.policyData } : undefined;
			if (entitlementsData) {
				policyData = policyData ?? {};
				policyData.cloud_session_storage_enabled = entitlementsData.cloud_session_storage_enabled;
			}
			if (tokenEntitlementsResult?.data) {
				const tokenEntitlementsData = tokenEntitlementsResult.data;
				policyData = policyData ?? {};
				policyData.chat_agent_enabled = tokenEntitlementsData.policyData.chat_agent_enabled;
				policyData.chat_preview_features_enabled = tokenEntitlementsData.policyData.chat_preview_features_enabled;
				policyData.mcp = tokenEntitlementsData.policyData.mcp;
				if (policyData.mcp) {
					const mcpRegistryResult = await this.getMcpRegistryProvider(sessions, accountPolicyData, options);
					mcpRegistryDataFetchedAt = mcpRegistryResult?.fetchedAt;
					policyData.mcpRegistryUrl = mcpRegistryResult?.data?.url;
					policyData.mcpAccess = mcpRegistryResult?.data?.registry_access;
				} else {
					policyData.mcpRegistryUrl = undefined;
					policyData.mcpAccess = undefined;
				}
			}
			if (managedSettingsResult?.data) {
				policyData = { ...(policyData ?? {}), ...managedSettingsResult.data };
			}

			const defaultAccount: IDefaultAccount = {
				authenticationProvider,
				accountName: sessions[0].account.label,
				sessionId: sessions[0].id,
				enterprise: authenticationProvider.enterprise || sessions[0].account.label.includes('_'),
				entitlementsData,
			};
			this.logService.debug('[DefaultAccount] Successfully created default account for provider:', authenticationProvider.id);
			const accountPolicyResult: IAccountPolicyData | null = policyData || entitlementsFetchedAt
				? { accountId, policyData: policyData ?? {}, entitlementsFetchedAt, tokenEntitlementsFetchedAt, mcpRegistryDataFetchedAt, managedSettingsFetchedAt }
				: null;
			return {
				defaultAccount,
				accountId,
				policyData: accountPolicyResult,
				copilotTokenInfo: tokenEntitlementsResult?.data?.copilotTokenInfo ?? null,
			};
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

	private async getTokenEntitlements(sessions: AuthenticationSession[], accountPolicyData: IAccountPolicyData | undefined, options?: { forceRefresh?: boolean }): Promise<{ data: { policyData: Partial<IPolicyData>; copilotTokenInfo: ICopilotTokenInfo } | undefined; fetchedAt: number }> {
		if (!options?.forceRefresh && accountPolicyData?.tokenEntitlementsFetchedAt && !this.isDataStale(accountPolicyData.tokenEntitlementsFetchedAt)) {
			this.logService.debug('[DefaultAccount] Using last fetched token entitlements data');
			return { data: { policyData: accountPolicyData.policyData, copilotTokenInfo: this._copilotTokenInfo ?? {} }, fetchedAt: accountPolicyData.tokenEntitlementsFetchedAt };
		}
		const data = await this.requestTokenEntitlements(sessions);
		return { data, fetchedAt: Date.now() };
	}

	private async requestTokenEntitlements(sessions: AuthenticationSession[]): Promise<{ policyData: Partial<IPolicyData>; copilotTokenInfo: ICopilotTokenInfo } | undefined> {
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
			const chatData = await asJson<ITokenEntitlementsResponse>(response);
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
		} catch (error) {
			this.logService.error('Failed to fetch token entitlements', getErrorMessage(error));
		}

		return undefined;
	}

	private async getEntitlements(sessions: AuthenticationSession[], accountPolicyData: IAccountPolicyData | undefined, options?: { forceRefresh?: boolean }): Promise<{ data: IEntitlementsData | undefined | null; fetchedAt: number | undefined }> {
		const accountId = sessions[0].account.id;
		const existingData = this._defaultAccount?.accountId === accountId ? this._defaultAccount?.defaultAccount.entitlementsData : undefined;
		if (!options?.forceRefresh && existingData && accountPolicyData?.entitlementsFetchedAt && !this.isDataStale(accountPolicyData.entitlementsFetchedAt)) {
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
			const data = (
				response.res.statusCode === 401 || 	// oauth token being unavailable (expired/revoked)
				response.res.statusCode === 404		// missing scopes/permissions, service pretends the endpoint doesn't exist
			) ? null : undefined;
			return { data, fetchedAt: Date.now() };
		}

		try {
			const data = await asJson<IEntitlementsData>(response);
			if (data) {
				return { data, fetchedAt: Date.now() };
			}
			this.logService.error('[DefaultAccount] Failed to fetch entitlements', 'No data returned');
		} catch (error) {
			this.logService.error('[DefaultAccount] Failed to fetch entitlements', getErrorMessage(error));
		}
		return { data: undefined, fetchedAt: Date.now() };
	}

	private async getMcpRegistryProvider(sessions: AuthenticationSession[], accountPolicyData: IAccountPolicyData | undefined, options?: { forceRefresh?: boolean }): Promise<{ data: IMcpRegistryProvider | null; fetchedAt: number } | undefined> {
		if (!options?.forceRefresh && accountPolicyData?.mcpRegistryDataFetchedAt && !this.isDataStale(accountPolicyData.mcpRegistryDataFetchedAt)) {
			this.logService.debug('[DefaultAccount] Using last fetched MCP registry data');
			const data = accountPolicyData.policyData.mcpRegistryUrl && accountPolicyData.policyData.mcpAccess ? { url: accountPolicyData.policyData.mcpRegistryUrl, registry_access: accountPolicyData.policyData.mcpAccess } : null;
			return { data, fetchedAt: accountPolicyData.mcpRegistryDataFetchedAt };
		}
		const data = await this.requestMcpRegistryProvider(sessions);
		return !isUndefined(data) ? { data, fetchedAt: Date.now() } : undefined;
	}

	private async requestMcpRegistryProvider(sessions: AuthenticationSession[]): Promise<IMcpRegistryProvider | null | undefined> {
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
			const data = await asJson<IMcpRegistryResponse>(response);
			if (data) {
				this.logService.debug('Fetched MCP registry providers', data.mcp_registries);
				return data.mcp_registries[0] ?? null;
			}
			this.logService.debug('No MCP registry providers content found in response');
			return null;
		} catch (error) {
			this.logService.error('Failed to fetch MCP registry providers', getErrorMessage(error));
			return undefined;
		}
	}

	private async getManagedSettings(sessions: AuthenticationSession[], accountPolicyData: IAccountPolicyData | undefined, options?: { forceRefresh?: boolean }): Promise<{ data: Partial<IPolicyData> | undefined; fetchedAt: number }> {
		if (!options?.forceRefresh && accountPolicyData?.managedSettingsFetchedAt && !this.isDataStale(accountPolicyData.managedSettingsFetchedAt)) {
			this.logService.debug('[DefaultAccount] Using last fetched managed settings data');
			// Seed status so Policy Diagnostics reflects "applied" rather than
			// "not yet fetched" after a process restart that warm-starts from
			// the cached policy payload.
			this._managedSettingsFetchStatus = 'ok';
			return {
				data: {
					enabledPlugins: accountPolicyData.policyData.enabledPlugins,
					extraKnownMarketplaces: accountPolicyData.policyData.extraKnownMarketplaces,
					strictKnownMarketplaces: accountPolicyData.policyData.strictKnownMarketplaces,
				},
				fetchedAt: accountPolicyData.managedSettingsFetchedAt,
			};
		}
		const data = await this.requestManagedSettings(sessions);
		return { data, fetchedAt: Date.now() };
	}

	private async requestManagedSettings(sessions: AuthenticationSession[]): Promise<Partial<IPolicyData> | undefined> {
		const managedSettingsUrl = this.getManagedSettingsUrl();
		if (!managedSettingsUrl) {
			this.logService.debug('[DefaultAccount] No managed settings URL configured; skipping enterprise policy fetch');
			this._managedSettingsFetchStatus = 'no-url';
			return undefined;
		}

		this.logService.debug('[DefaultAccount] Fetching managed settings from:', managedSettingsUrl);
		const rateLimitBackoffActive = Date.now() < this._rateLimitBackoffUntil;
		const response = await this.request(managedSettingsUrl, 'GET', undefined, sessions, CancellationToken.None, 'defaultAccount.managedSettings', MANAGED_SETTINGS_REQUEST_TIMEOUT_MS);
		if (!response) {
			this.logService.debug('[DefaultAccount] Managed settings fetch returned no response (network error, all sessions rejected, or active rate-limit backoff); falling back to local-only policy');
			this.reportManagedSettingsOutcome('no-response', rateLimitBackoffActive);
			return undefined;
		}

		// Any non-2xx response means "fall back to local settings only and continue
		// operating normally" — silent fallback, no policy.
		if (!isSuccess(response)) {
			const status = response.res.statusCode ?? 0;
			this.logService.warn(`[DefaultAccount] Managed settings fetch returned non-success status ${status}; falling back to local-only policy`);
			this.reportManagedSettingsOutcome(status, rateLimitBackoffActive);
			return undefined;
		}

		try {
			const data = await asJson<IManagedSettingsResponse>(response);
			this.logService.trace('[DefaultAccount] Managed settings raw response:', JSON.stringify(data ?? null));
			const adapted = adaptManagedSettings(data ?? {}, msg => this.logService.warn(msg));
			// An empty response (`{}`) is a successful "no policy file present" signal.
			const pluginCount = adapted.enabledPlugins ? Object.keys(adapted.enabledPlugins).length : 0;
			const marketplaceCount = adapted.extraKnownMarketplaces?.length ?? 0;
			const strictSet = adapted.strictKnownMarketplaces !== undefined;
			if (pluginCount === 0 && marketplaceCount === 0 && !strictSet) {
				this.logService.debug('[DefaultAccount] Managed settings fetched (empty response — no enterprise policy file present)');
			} else {
				this.logService.info('[DefaultAccount] Managed settings applied');
				this.logService.trace('[DefaultAccount] Managed settings payload:', JSON.stringify(adapted));
			}
			this.reportManagedSettingsOutcome('ok', rateLimitBackoffActive);
			return adapted;
		} catch (error) {
			this.logService.error('[DefaultAccount] Failed to parse managed settings response', getErrorMessage(error));
			this.reportManagedSettingsOutcome('parse-error', rateLimitBackoffActive);
			return undefined;
		}
	}

	private reportManagedSettingsOutcome(status: Exclude<ManagedSettingsFetchStatus, null | 'no-url'>, rateLimitBackoffActive: boolean): void {
		this._managedSettingsFetchStatus = status;
		this.telemetryService.publicLog2<ManagedSettingsFetchTelemetry, ManagedSettingsFetchTelemetryClassification>('defaultaccount:managedSettings:fetch', {
			outcome: typeof status === 'number' ? `status:${status}` : status,
			rateLimitBackoffActive,
		});
	}

	/**
	 * Detects a rate-limited GitHub response. Mirrors the public-API check in
	 * `githubRepoFetcher.ts`:
	 * - Canonical `429 Too Many Requests`.
	 * - Primary quota exhaustion: `403` with `X-RateLimit-Remaining: 0`.
	 * - Secondary throttling: GitHub omits `X-RateLimit-Remaining` but sets
	 *   `Retry-After` (on a non-2xx response). We treat any non-success status
	 *   that carries `Retry-After` as a back-off signal.
	 */
	private isRateLimited(response: IRequestContext): boolean {
		const status = response.res.statusCode;
		if (status === 429) {
			return true;
		}
		if (status === 403 && readHeader(response.res.headers, 'x-ratelimit-remaining') === '0') {
			return true;
		}
		// Secondary rate limit: the server explicitly asks the client to wait,
		// regardless of which non-2xx code it returned with.
		if (!isSuccess(response) && readHeader(response.res.headers, 'retry-after') !== undefined) {
			return true;
		}
		return false;
	}

	private _rateLimitBackoffUntil = 0;

	private async request(url: string, type: 'GET', body: undefined, sessions: AuthenticationSession[], token: CancellationToken, callSite: string, requestTimeoutMs?: number): Promise<IRequestContext | undefined>;
	private async request(url: string, type: 'POST', body: object, sessions: AuthenticationSession[], token: CancellationToken, callSite: string, requestTimeoutMs?: number): Promise<IRequestContext | undefined>;
	private async request(url: string, type: 'GET' | 'POST', body: object | undefined, sessions: AuthenticationSession[], token: CancellationToken, callSite: string, requestTimeoutMs?: number): Promise<IRequestContext | undefined> {
		// Rate-limit backoff: when any prior `/copilot_internal/*` request was
		// throttled (429 or 403 + `X-RateLimit-Remaining: 0`), every subsequent
		// request is short-circuited until the parsed `Retry-After` elapses.
		// All endpoints called from here share the same host and bearer token,
		// so backing off the bucket as a whole avoids piling on a server that
		// has already asked us to slow down. See `githubRepoFetcher.ts` for the
		// public-API analogue.
		if (Date.now() < this._rateLimitBackoffUntil) {
			const remainingSec = Math.ceil((this._rateLimitBackoffUntil - Date.now()) / 1000);
			this.logService.debug(`[DefaultAccount] Skipping request to ${url} — rate-limit backoff active for ${remainingSec}s more`);
			return undefined;
		}

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
					timeout: requestTimeoutMs,
					headers: {
						'Authorization': `Bearer ${session.accessToken}`
					},
					callSite
				}, token);

				const status = response.res.statusCode;
				if (this.isRateLimited(response)) {
					const retryAfterSec = retryAfterFromHeaders(response.res.headers) ?? 60;
					this._rateLimitBackoffUntil = Date.now() + retryAfterSec * 1000;
					this.logService.warn(`[DefaultAccount] Rate limited by ${url} (status ${status}); backing off for ${retryAfterSec}s`);
					return response;
				}
				if (status === 401 || status === 404) {
					this.logService.debug(`[DefaultAccount] Received ${status} for URL ${url} with session ${session.id}, likely due to expired/revoked token or insufficient permissions.`, 'Trying next session if available.');
					lastResponse = response;
					continue; // try next session
				}

				return response;
			} catch (error) {
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

	private isDataStale(fetchedAt: number): boolean {
		return (Date.now() - fetchedAt) >= ACCOUNT_DATA_POLL_INTERVAL_MS;
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

	private getManagedSettingsUrl(): string | undefined {
		if (this.getDefaultAccountAuthenticationProvider().enterprise) {
			try {
				const enterpriseUrl = this.getEnterpriseUrl();
				if (!enterpriseUrl) {
					return undefined;
				}
				return `${enterpriseUrl.protocol}//api.${enterpriseUrl.hostname}${enterpriseUrl.port ? ':' + enterpriseUrl.port : ''}/copilot_internal/managed_settings`;
			} catch (error) {
				this.logService.error(error);
			}
		}

		return this.defaultAccountConfig.managedSettingsUrl;
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

	resolveGitHubUrl(path: string): string {
		if (this.getDefaultAccountAuthenticationProvider().enterprise) {
			try {
				const enterpriseUrl = this.getEnterpriseUrl();
				if (enterpriseUrl) {
					return `${enterpriseUrl.protocol}//${enterpriseUrl.host}/${path}`;
				}
			} catch {
				// fall through to default
			}
		}

		return `https://github.com/${path}`;
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

	async signOut(): Promise<void> {
		if (!this.defaultAccount) {
			return;
		}
		await this.commandService.executeCommand('_signOutOfAccount', { providerId: this.defaultAccount.authenticationProvider.id, accountLabel: this.defaultAccount.accountName });
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

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: DEFAULT_ACCOUNT_SIGN_IN_COMMAND,
			title: localize2('signIn', 'Sign In'),
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const defaultAccountService = accessor.get(IDefaultAccountService);
		await defaultAccountService.signIn();
	}
});

registerWorkbenchContribution2(DefaultAccountProviderContribution.ID, DefaultAccountProviderContribution, WorkbenchPhase.BlockStartup);
