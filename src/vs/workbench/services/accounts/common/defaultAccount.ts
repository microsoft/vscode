/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { AuthenticationSession, IAuthenticationService } from '../../authentication/common/authentication.js';
import { asJson, IRequestService } from '../../../../platform/request/common/request.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { localize } from '../../../../nls.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { Barrier } from '../../../../base/common/async.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { IDefaultAccount } from '../../../../base/common/defaultAccount.js';
import { isString } from '../../../../base/common/types.js';

export const DEFAULT_ACCOUNT_SIGN_IN_COMMAND = 'workbench.actions.accounts.signIn';

const enum DefaultAccountStatus {
	Uninitialized = 'uninitialized',
	Unavailable = 'unavailable',
	Available = 'available',
}

const CONTEXT_DEFAULT_ACCOUNT_STATE = new RawContextKey<string>('defaultAccountStatus', DefaultAccountStatus.Uninitialized);

interface IChatEntitlementsResponse {
	readonly access_type_sku: string;
	readonly assigned_date: string;
	readonly can_signup_for_limited: boolean;
	readonly chat_enabled: boolean;
	readonly analytics_tracking_id: string;
	readonly limited_user_quotas?: {
		readonly chat: number;
		readonly completions: number;
	};
	readonly monthly_quotas?: {
		readonly chat: number;
		readonly completions: number;
	};
	readonly limited_user_reset_date: string;
}

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

export const IDefaultAccountService = createDecorator<IDefaultAccountService>('defaultAccountService');

export interface IDefaultAccountService {

	readonly _serviceBrand: undefined;

	readonly onDidChangeDefaultAccount: Event<IDefaultAccount | null>;

	getDefaultAccount(): Promise<IDefaultAccount | null>;
	setDefaultAccount(account: IDefaultAccount | null): void;
}

export class DefaultAccountService extends Disposable implements IDefaultAccountService {
	declare _serviceBrand: undefined;

	private _defaultAccount: IDefaultAccount | null | undefined = undefined;
	get defaultAccount(): IDefaultAccount | null { return this._defaultAccount ?? null; }

	private readonly initBarrier = new Barrier();

	private readonly _onDidChangeDefaultAccount = this._register(new Emitter<IDefaultAccount | null>());
	readonly onDidChangeDefaultAccount = this._onDidChangeDefaultAccount.event;

	async getDefaultAccount(): Promise<IDefaultAccount | null> {
		await this.initBarrier.wait();
		return this.defaultAccount;
	}

	setDefaultAccount(account: IDefaultAccount | null): void {
		const oldAccount = this._defaultAccount;
		this._defaultAccount = account;

		if (oldAccount !== this._defaultAccount) {
			this._onDidChangeDefaultAccount.fire(this._defaultAccount);
		}

		this.initBarrier.open();
	}

}

export class NullDefaultAccountService extends Disposable implements IDefaultAccountService {

	declare _serviceBrand: undefined;

	readonly onDidChangeDefaultAccount = Event.None;

	async getDefaultAccount(): Promise<IDefaultAccount | null> {
		return null;
	}

	setDefaultAccount(account: IDefaultAccount | null): void {
		// noop
	}

}

export class DefaultAccountManagementContribution extends Disposable implements IWorkbenchContribution {

	static ID = 'workbench.contributions.defaultAccountManagement';

	private defaultAccount: IDefaultAccount | null = null;
	private readonly accountStatusContext: IContextKey<string>;

	constructor(
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IProductService private readonly productService: IProductService,
		@IRequestService private readonly requestService: IRequestService,
		@ILogService private readonly logService: ILogService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this.accountStatusContext = CONTEXT_DEFAULT_ACCOUNT_STATE.bindTo(contextKeyService);
		this.initialize();
	}

	private async initialize(): Promise<void> {
		this.logService.debug('[DefaultAccount] Starting initialization');

		if (!this.productService.defaultAccount) {
			this.logService.debug('[DefaultAccount] No default account configuration in product service, skipping initialization');
			return;
		}

		const defaultAccountProviderId = this.getDefaultAccountProviderId();
		this.logService.debug('[DefaultAccount] Default account provider ID:', defaultAccountProviderId);
		if (!defaultAccountProviderId) {
			return;
		}

		await this.extensionService.whenInstalledExtensionsRegistered();
		this.logService.debug('[DefaultAccount] Installed extensions registered.');

		const declaredProvider = this.authenticationService.declaredProviders.find(provider => provider.id === defaultAccountProviderId);
		if (!declaredProvider) {
			this.logService.info(`[DefaultAccount] Authentication provider is not declared.`, defaultAccountProviderId);
			return;
		}

		this.registerSignInAction(defaultAccountProviderId, this.productService.defaultAccount.authenticationProvider.scopes);
		this.setDefaultAccount(await this.getDefaultAccountFromAuthenticatedSessions(defaultAccountProviderId, this.productService.defaultAccount.authenticationProvider.scopes));

		this._register(this.authenticationService.onDidChangeSessions(async e => {
			if (e.providerId !== this.getDefaultAccountProviderId()) {
				return;
			}

			if (this.defaultAccount && e.event.removed?.some(session => session.id === this.defaultAccount?.sessionId)) {
				this.setDefaultAccount(null);
				return;
			}
			this.setDefaultAccount(await this.getDefaultAccountFromAuthenticatedSessions(defaultAccountProviderId, this.productService.defaultAccount!.authenticationProvider.scopes));
		}));

		this.logService.debug('[DefaultAccount] Initialization complete');
	}

	private setDefaultAccount(account: IDefaultAccount | null): void {
		this.defaultAccount = account;
		this.defaultAccountService.setDefaultAccount(this.defaultAccount);
		if (this.defaultAccount) {
			this.accountStatusContext.set(DefaultAccountStatus.Available);
			this.logService.debug('[DefaultAccount] Account status set to Available');
		} else {
			this.accountStatusContext.set(DefaultAccountStatus.Unavailable);
			this.logService.debug('[DefaultAccount] Account status set to Unavailable');
		}
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

	private async getDefaultAccountFromAuthenticatedSessions(authProviderId: string, scopes: string[]): Promise<IDefaultAccount | null> {
		try {
			this.logService.debug('[DefaultAccount] Getting Default Account from authenticated sessions for provider:', authProviderId);
			const sessions = await this.authenticationService.getSessions(authProviderId, undefined, undefined, true);
			const session = sessions.find(s => this.scopesMatch(s.scopes, scopes));

			if (!session) {
				this.logService.debug('[DefaultAccount] No matching session found for provider:', authProviderId);
				return null;
			}

			const [chatEntitlements, tokenEntitlements] = await Promise.all([
				this.getChatEntitlements(session.accessToken),
				this.getTokenEntitlements(session.accessToken),
			]);

			const mcpRegistryProvider = tokenEntitlements.mcp ? await this.getMcpRegistryProvider(session.accessToken) : undefined;

			const account = {
				sessionId: session.id,
				enterprise: this.isEnterpriseAuthenticationProvider(authProviderId) || session.account.label.includes('_'),
				...chatEntitlements,
				...tokenEntitlements,
				mcpRegistryUrl: mcpRegistryProvider?.url,
				mcpAccess: mcpRegistryProvider?.registry_access,
			};
			this.logService.debug('[DefaultAccount] Successfully created default account for provider:', authProviderId);
			return account;
		} catch (error) {
			this.logService.error('[DefaultAccount] Failed to create default account for provider:', authProviderId, getErrorMessage(error));
			return null;
		}
	}

	private scopesMatch(scopes: ReadonlyArray<string>, expectedScopes: string[]): boolean {
		return scopes.length === expectedScopes.length && expectedScopes.every(scope => scopes.includes(scope));
	}

	private async getTokenEntitlements(accessToken: string): Promise<Partial<IDefaultAccount>> {
		const tokenEntitlementsUrl = this.getTokenEntitlementUrl();
		if (!tokenEntitlementsUrl) {
			this.logService.debug('[DefaultAccount] No token entitlements URL found');
			return {};
		}

		this.logService.debug('[DefaultAccount] Fetching token entitlements from:', tokenEntitlementsUrl);
		try {
			const chatContext = await this.requestService.request({
				type: 'GET',
				url: tokenEntitlementsUrl,
				disableCache: true,
				headers: {
					'Authorization': `Bearer ${accessToken}`
				}
			}, CancellationToken.None);

			const chatData = await asJson<ITokenEntitlementsResponse>(chatContext);
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

		return {};
	}

	private async getChatEntitlements(accessToken: string): Promise<Partial<IChatEntitlementsResponse>> {
		const chatEntitlementsUrl = this.getChatEntitlementUrl();
		if (!chatEntitlementsUrl) {
			this.logService.debug('[DefaultAccount] No chat entitlements URL found');
			return {};
		}

		this.logService.debug('[DefaultAccount] Fetching chat entitlements from:', chatEntitlementsUrl);
		try {
			const context = await this.requestService.request({
				type: 'GET',
				url: chatEntitlementsUrl,
				disableCache: true,
				headers: {
					'Authorization': `Bearer ${accessToken}`
				}
			}, CancellationToken.None);

			const data = await asJson<IChatEntitlementsResponse>(context);
			if (data) {
				return data;
			}
			this.logService.error('Failed to fetch entitlements', 'No data returned');
		} catch (error) {
			this.logService.error('Failed to fetch entitlements', getErrorMessage(error));
		}
		return {};
	}

	private async getMcpRegistryProvider(accessToken: string): Promise<IMcpRegistryProvider | undefined> {
		const mcpRegistryDataUrl = this.getMcpRegistryDataUrl();
		if (!mcpRegistryDataUrl) {
			this.logService.debug('[DefaultAccount] No MCP registry data URL found');
			return undefined;
		}

		try {
			const context = await this.requestService.request({
				type: 'GET',
				url: mcpRegistryDataUrl,
				disableCache: true,
				headers: {
					'Authorization': `Bearer ${accessToken}`
				}
			}, CancellationToken.None);

			const data = await asJson<IMcpRegistryResponse>(context);
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

	private getChatEntitlementUrl(): string | undefined {
		if (!this.productService.defaultAccount) {
			return undefined;
		}

		if (this.isEnterpriseAuthenticationProvider(this.getDefaultAccountProviderId())) {
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

		return this.productService.defaultAccount?.chatEntitlementUrl;
	}

	private getTokenEntitlementUrl(): string | undefined {
		if (!this.productService.defaultAccount) {
			return undefined;
		}

		if (this.isEnterpriseAuthenticationProvider(this.getDefaultAccountProviderId())) {
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

		return this.productService.defaultAccount?.tokenEntitlementUrl;
	}

	private getMcpRegistryDataUrl(): string | undefined {
		if (!this.productService.defaultAccount) {
			return undefined;
		}

		if (this.isEnterpriseAuthenticationProvider(this.getDefaultAccountProviderId())) {
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

		return this.productService.defaultAccount?.mcpRegistryDataUrl;
	}

	private getDefaultAccountProviderId(): string | undefined {
		if (this.productService.defaultAccount && this.configurationService.getValue<string | undefined>(this.productService.defaultAccount.authenticationProvider.enterpriseProviderConfig) === this.productService.defaultAccount?.authenticationProvider.enterpriseProviderId) {
			return this.productService.defaultAccount?.authenticationProvider.enterpriseProviderId;
		}
		return this.productService.defaultAccount?.authenticationProvider.id;
	}

	private isEnterpriseAuthenticationProvider(providerId: string | undefined): boolean {
		if (!providerId) {
			return false;
		}

		return providerId === this.productService.defaultAccount?.authenticationProvider.enterpriseProviderId;
	}

	private getEnterpriseUrl(): URL | undefined {
		if (!this.productService.defaultAccount) {
			return undefined;
		}
		const value = this.configurationService.getValue(this.productService.defaultAccount.authenticationProvider.enterpriseProviderUriSetting);
		if (!isString(value)) {
			return undefined;
		}
		return new URL(value);
	}

	private registerSignInAction(authProviderId: string, scopes: string[]): void {
		const that = this;
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: DEFAULT_ACCOUNT_SIGN_IN_COMMAND,
					title: localize('sign in', "Sign in"),
				});
			}
			run(): Promise<AuthenticationSession> {
				return that.authenticationService.createSession(authProviderId, scopes);
			}
		}));
	}

}
