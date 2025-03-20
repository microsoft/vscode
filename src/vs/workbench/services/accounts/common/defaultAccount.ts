/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { AuthenticationProviderInformation, IAuthenticationService } from '../../authentication/common/authentication.js';
import { asJson, IRequestService } from '../../../../platform/request/common/request.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { localize } from '../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Barrier } from '../../../../base/common/async.js';

const enum DefaultAccountStatus {
	Uninitialized = 'uninitialized',
	Unavailable = 'unavailable',
	Available = 'available',
}

const CONTEXT_DEFAULT_ACCOUNT_STATE = new RawContextKey<string>('defaultAccountStatus', DefaultAccountStatus.Uninitialized);

export interface IDefaultAccount {
	readonly sessionId: string;
	readonly sessionAccountLabel: string;
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

interface IEntitlementsResponse {
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

export const IDefaultAccountService = createDecorator<IDefaultAccountService>('defaultAccountService');

export interface IDefaultAccountService {

	readonly _serviceBrand: undefined;

	readonly onDidChangeDefaultAccount: Event<IDefaultAccount | null>;

	getDefaultAccount(): Promise<IDefaultAccount | null>;
	setDefaultAccount(account: IDefaultAccount | null): void;
}

export class DefaultAccountService extends Disposable implements IDefaultAccountService {
	declare _serviceBrand: undefined;

	private defaultAccount: IDefaultAccount | null | undefined = undefined;
	private readonly initBarrier = new Barrier();

	private readonly _onDidChangeDefaultAccount = this._register(new Emitter<IDefaultAccount | null>());
	readonly onDidChangeDefaultAccount = this._onDidChangeDefaultAccount.event;

	private readonly accountStatusContext: IContextKey<string>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this.accountStatusContext = CONTEXT_DEFAULT_ACCOUNT_STATE.bindTo(contextKeyService);
	}

	async getDefaultAccount(): Promise<IDefaultAccount | null> {
		await this.initBarrier.wait();
		return this.defaultAccount ?? null;
	}

	setDefaultAccount(account: IDefaultAccount | null): void {
		const oldAccount = this.defaultAccount;
		this.defaultAccount = account;

		if (this.defaultAccount) {
			this.accountStatusContext.set(DefaultAccountStatus.Available);
		} else {
			this.accountStatusContext.set(DefaultAccountStatus.Unavailable);
		}

		if (oldAccount !== this.defaultAccount) {
			this._onDidChangeDefaultAccount.fire(this.defaultAccount);
		}

		this.initBarrier.open();
	}

}

export class DefaultAccountManagementContribution extends Disposable implements IWorkbenchContribution {

	private defaultAccount: IDefaultAccount | null = null;
	private readonly _onDidChangeDefaultAccount = this._register(new Emitter<IDefaultAccount | null>());
	readonly onDidChangeDefaultAccount = this._onDidChangeDefaultAccount.event;


	constructor(
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IProductService private readonly productService: IProductService,
		@IRequestService private readonly requestService: IRequestService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.initialize();
	}

	private async initialize(): Promise<void> {
		if (!this.productService.defaultAccount) {
			return;
		}

		const { authenticationProvider, entitlementUrl } = this.productService.defaultAccount;
		await this.extensionService.whenInstalledExtensionsRegistered();

		const declaredProvider = this.authenticationService.declaredProviders.find(provider => provider.id === authenticationProvider.id);
		if (!declaredProvider) {
			this.logService.info(`Default account authentication provider ${authenticationProvider} is not declared.`);
			return;
		}

		this.registerSignInAction(declaredProvider, authenticationProvider.scopes);
		this.defaultAccountService.setDefaultAccount(await this.getDefaultAccountFromAuthenticatedSessions(authenticationProvider.id, authenticationProvider.scopes, entitlementUrl));

		this.authenticationService.onDidChangeSessions(async e => {
			if (e.providerId !== authenticationProvider.id) {
				return;
			}

			if (this.defaultAccount && e.event.removed?.some(session => session.id === this.defaultAccount?.sessionId)) {
				this.defaultAccountService.setDefaultAccount(null);
				return;
			}

			this.defaultAccountService.setDefaultAccount(await this.getDefaultAccountFromAuthenticatedSessions(authenticationProvider.id, authenticationProvider.scopes, entitlementUrl));
		});

	}

	private async getDefaultAccountFromAuthenticatedSessions(id: string, scopes: string[], entitlementUrl: string): Promise<IDefaultAccount | null> {
		const sessions = await this.authenticationService.getSessions(id, scopes, undefined, true);
		if (sessions.length === 0) {
			return null;
		}

		const context = await this.requestService.request({
			type: 'GET',
			url: entitlementUrl,
			disableCache: true,
			headers: {
				'Authorization': `Bearer ${sessions[0].accessToken}`
			}
		}, CancellationToken.None);

		const data = await asJson<IEntitlementsResponse>(context);
		if (!data) {
			return null;
		}

		return {
			sessionId: sessions[0].id,
			sessionAccountLabel: sessions[0].account.label,
			...data,
		};
	}

	private registerSignInAction(authenticationProvider: AuthenticationProviderInformation, scopes: string[]): void {
		const that = this;
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.accounts.actions.signin',
					title: localize('sign in', "Sign in to {0}", authenticationProvider.label),
					menu: {
						id: MenuId.AccountsContext,
						when: CONTEXT_DEFAULT_ACCOUNT_STATE.isEqualTo(DefaultAccountStatus.Unavailable),
						group: '0_signin',
					}
				});
			}
			run(): Promise<any> {
				return that.authenticationService.createSession(authenticationProvider.id, scopes);
			}
		}));
	}

}

registerWorkbenchContribution2('workbench.contributions.defaultAccountManagement', DefaultAccountManagementContribution, WorkbenchPhase.AfterRestored);
registerSingleton(IDefaultAccountService, DefaultAccountService, InstantiationType.Delayed);
