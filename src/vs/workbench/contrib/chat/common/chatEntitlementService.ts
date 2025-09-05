/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import product from '../../../../platform/product/common/product.js';
import { Barrier } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IRequestContext } from '../../../../base/parts/request/common/request.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { asText, IRequestService } from '../../../../platform/request/common/request.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService, TelemetryLevel } from '../../../../platform/telemetry/common/telemetry.js';
import { AuthenticationSession, AuthenticationSessionAccount, IAuthenticationExtensionsService, IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { EnablementState, IWorkbenchExtensionEnablementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IExtension, IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { ChatContextKeys } from './chatContextKeys.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { URI } from '../../../../base/common/uri.js';
import Severity from '../../../../base/common/severity.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { isWeb } from '../../../../base/common/platform.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { Mutable } from '../../../../base/common/types.js';
import { distinct } from '../../../../base/common/arrays.js';

export const IChatEntitlementService = createDecorator<IChatEntitlementService>('chatEntitlementService');

export enum ChatEntitlement {
	/** Signed out */
	Unknown = 1,
	/** Signed in but not yet resolved */
	Unresolved,
	/** Signed in and entitled to Free */
	Available,
	/** Signed in but not entitled to Free */
	Unavailable,
	/** Signed-up to Free */
	Free,
	/** Signed-up to Pro */
	Pro,
	/** Signed-up to Pro Plus */
	ProPlus,
	/** Signed-up to Business */
	Business,
	/** Signed-up to Enterprise */
	Enterprise
}

export interface IChatSentiment {

	/**
	 * User has Chat installed.
	 */
	installed?: boolean;

	/**
	 * User signals no intent in using Chat.
	 *
	 * Note: in contrast to `disabled`, this should not only disable
	 * Chat but also hide all of its UI.
	 */
	hidden?: boolean;

	/**
	 * User signals intent to disable Chat.
	 *
	 * Note: in contrast to `hidden`, this should not hide
	 * Chat but but disable its functionality.
	 */
	disabled?: boolean;

	/**
	 * Chat is disabled due to missing workspace trust.
	 *
	 * Note: even though this disables Chat, we want to treat it
	 * different from the `disabled` state that is by explicit
	 * user choice.
	 */
	untrusted?: boolean;

	/**
	 * User signals intent to use Chat later.
	 */
	later?: boolean;
}

export interface IChatEntitlementService {

	_serviceBrand: undefined;

	readonly onDidChangeEntitlement: Event<void>;

	readonly entitlement: ChatEntitlement;

	readonly organisations: string[] | undefined;
	readonly isInternal: boolean;
	readonly sku: string | undefined;

	readonly onDidChangeQuotaExceeded: Event<void>;
	readonly onDidChangeQuotaRemaining: Event<void>;

	readonly quotas: IQuotas;

	update(token: CancellationToken): Promise<void>;

	readonly onDidChangeSentiment: Event<void>;

	readonly sentiment: IChatSentiment;
}

//#region Helper Functions

/**
 * Checks the chat entitlements to see if the user falls into the paid category
 * @param chatEntitlement The chat entitlement to check
 * @returns Whether or not they are a paid user
 */
export function isProUser(chatEntitlement: ChatEntitlement): boolean {
	return chatEntitlement === ChatEntitlement.Pro ||
		chatEntitlement === ChatEntitlement.ProPlus ||
		chatEntitlement === ChatEntitlement.Business ||
		chatEntitlement === ChatEntitlement.Enterprise;
}

//#region Service Implementation

const defaultChat = {
	extensionId: product.defaultChatAgent?.extensionId ?? '',
	chatExtensionId: product.defaultChatAgent?.chatExtensionId ?? '',
	upgradePlanUrl: product.defaultChatAgent?.upgradePlanUrl ?? '',
	provider: product.defaultChatAgent?.provider ?? { default: { id: '' }, enterprise: { id: '' } },
	providerUriSetting: product.defaultChatAgent?.providerUriSetting ?? '',
	providerScopes: product.defaultChatAgent?.providerScopes ?? [[]],
	entitlementUrl: product.defaultChatAgent?.entitlementUrl ?? '',
	entitlementSignupLimitedUrl: product.defaultChatAgent?.entitlementSignupLimitedUrl ?? '',
	completionsAdvancedSetting: product.defaultChatAgent?.completionsAdvancedSetting ?? '',
	chatQuotaExceededContext: product.defaultChatAgent?.chatQuotaExceededContext ?? '',
	completionsQuotaExceededContext: product.defaultChatAgent?.completionsQuotaExceededContext ?? ''
};

interface IChatQuotasAccessor {
	clearQuotas(): void;
	acceptQuotas(quotas: IQuotas): void;
}

export class ChatEntitlementService extends Disposable implements IChatEntitlementService {

	declare _serviceBrand: undefined;

	readonly context: Lazy<ChatEntitlementContext> | undefined;
	readonly requests: Lazy<ChatEntitlementRequests> | undefined;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IProductService productService: IProductService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super();

		this.chatQuotaExceededContextKey = ChatContextKeys.chatQuotaExceeded.bindTo(this.contextKeyService);
		this.completionsQuotaExceededContextKey = ChatContextKeys.completionsQuotaExceeded.bindTo(this.contextKeyService);

		this.onDidChangeEntitlement = Event.map(
			Event.filter(
				this.contextKeyService.onDidChangeContext, e => e.affectsSome(new Set([
					ChatContextKeys.Entitlement.planPro.key,
					ChatContextKeys.Entitlement.planBusiness.key,
					ChatContextKeys.Entitlement.planEnterprise.key,
					ChatContextKeys.Entitlement.planProPlus.key,
					ChatContextKeys.Entitlement.planFree.key,
					ChatContextKeys.Entitlement.canSignUp.key,
					ChatContextKeys.Entitlement.signedOut.key,
					ChatContextKeys.Entitlement.organisations.key,
					ChatContextKeys.Entitlement.internal.key,
					ChatContextKeys.Entitlement.sku.key
				])), this._store
			), () => { }, this._store
		);

		this.onDidChangeSentiment = Event.map(
			Event.filter(
				this.contextKeyService.onDidChangeContext, e => e.affectsSome(new Set([
					ChatContextKeys.Setup.hidden.key,
					ChatContextKeys.Setup.disabled.key,
					ChatContextKeys.Setup.untrusted.key,
					ChatContextKeys.Setup.installed.key,
					ChatContextKeys.Setup.later.key
				])), this._store
			), () => { }, this._store
		);

		if (
			!productService.defaultChatAgent ||	// needs product config
			(
				// TODO@bpasero remove this condition and 'serverlessWebEnabled' once Chat web support lands
				isWeb &&
				!environmentService.remoteAuthority &&
				!configurationService.getValue('chat.experimental.serverlessWebEnabled')
			)
		) {
			ChatContextKeys.Setup.hidden.bindTo(this.contextKeyService).set(true); // hide copilot UI
			return;
		}

		const context = this.context = new Lazy(() => this._register(instantiationService.createInstance(ChatEntitlementContext)));
		this.requests = new Lazy(() => this._register(instantiationService.createInstance(ChatEntitlementRequests, context.value, {
			clearQuotas: () => this.clearQuotas(),
			acceptQuotas: quotas => this.acceptQuotas(quotas)
		})));

		this.registerListeners();
	}

	//#region --- Entitlements

	readonly onDidChangeEntitlement: Event<void>;

	get entitlement(): ChatEntitlement {
		if (this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Entitlement.planPro.key) === true) {
			return ChatEntitlement.Pro;
		} else if (this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Entitlement.planBusiness.key) === true) {
			return ChatEntitlement.Business;
		} else if (this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Entitlement.planEnterprise.key) === true) {
			return ChatEntitlement.Enterprise;
		} else if (this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Entitlement.planProPlus.key) === true) {
			return ChatEntitlement.ProPlus;
		} else if (this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Entitlement.planFree.key) === true) {
			return ChatEntitlement.Free;
		} else if (this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Entitlement.canSignUp.key) === true) {
			return ChatEntitlement.Available;
		} else if (this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Entitlement.signedOut.key) === true) {
			return ChatEntitlement.Unknown;
		}

		return ChatEntitlement.Unresolved;
	}

	get isInternal(): boolean {
		return this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Entitlement.internal.key) === true;
	}

	get organisations(): string[] | undefined {
		return this.contextKeyService.getContextKeyValue<string[]>(ChatContextKeys.Entitlement.organisations.key);
	}

	get sku(): string | undefined {
		return this.contextKeyService.getContextKeyValue<string>(ChatContextKeys.Entitlement.sku.key);
	}

	//#endregion

	//#region --- Quotas

	private readonly _onDidChangeQuotaExceeded = this._register(new Emitter<void>());
	readonly onDidChangeQuotaExceeded = this._onDidChangeQuotaExceeded.event;

	private readonly _onDidChangeQuotaRemaining = this._register(new Emitter<void>());
	readonly onDidChangeQuotaRemaining = this._onDidChangeQuotaRemaining.event;

	private _quotas: IQuotas = {};
	get quotas() { return this._quotas; }

	private readonly chatQuotaExceededContextKey: IContextKey<boolean>;
	private readonly completionsQuotaExceededContextKey: IContextKey<boolean>;

	private ExtensionQuotaContextKeys = {
		chatQuotaExceeded: defaultChat.chatQuotaExceededContext,
		completionsQuotaExceeded: defaultChat.completionsQuotaExceededContext,
	};

	private registerListeners(): void {
		const quotaExceededSet = new Set([this.ExtensionQuotaContextKeys.chatQuotaExceeded, this.ExtensionQuotaContextKeys.completionsQuotaExceeded]);

		const cts = this._register(new MutableDisposable<CancellationTokenSource>());
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(quotaExceededSet)) {
				if (cts.value) {
					cts.value.cancel();
				}
				cts.value = new CancellationTokenSource();
				this.update(cts.value.token);
			}
		}));
	}

	acceptQuotas(quotas: IQuotas): void {
		const oldQuota = this._quotas;
		this._quotas = quotas;
		this.updateContextKeys();

		const { changed: chatChanged } = this.compareQuotas(oldQuota.chat, quotas.chat);
		const { changed: completionsChanged } = this.compareQuotas(oldQuota.completions, quotas.completions);
		const { changed: premiumChatChanged } = this.compareQuotas(oldQuota.premiumChat, quotas.premiumChat);

		if (chatChanged.exceeded || completionsChanged.exceeded || premiumChatChanged.exceeded) {
			this._onDidChangeQuotaExceeded.fire();
		}

		if (chatChanged.remaining || completionsChanged.remaining || premiumChatChanged.remaining) {
			this._onDidChangeQuotaRemaining.fire();
		}
	}

	private compareQuotas(oldQuota: IQuotaSnapshot | undefined, newQuota: IQuotaSnapshot | undefined): { changed: { exceeded: boolean; remaining: boolean } } {
		return {
			changed: {
				exceeded: (oldQuota?.percentRemaining === 0) !== (newQuota?.percentRemaining === 0),
				remaining: oldQuota?.percentRemaining !== newQuota?.percentRemaining
			}
		};
	}

	clearQuotas(): void {
		this.acceptQuotas({});
	}

	private updateContextKeys(): void {
		this.chatQuotaExceededContextKey.set(this._quotas.chat?.percentRemaining === 0);
		this.completionsQuotaExceededContextKey.set(this._quotas.completions?.percentRemaining === 0);
	}

	//#endregion

	//#region --- Sentiment

	readonly onDidChangeSentiment: Event<void>;

	get sentiment(): IChatSentiment {
		return {
			installed: this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Setup.installed.key) === true,
			hidden: this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Setup.hidden.key) === true,
			disabled: this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Setup.disabled.key) === true,
			untrusted: this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Setup.untrusted.key) === true,
			later: this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Setup.later.key) === true
		};
	}

	//#endregion

	async update(token: CancellationToken): Promise<void> {
		await this.requests?.value.forceResolveEntitlement(undefined, token);
	}
}

//#endregion

//#region Chat Entitlement Request Service

type EntitlementClassification = {
	tid: { classification: 'EndUserPseudonymizedInformation'; purpose: 'BusinessInsight'; comment: 'The anonymized analytics id returned by the service'; endpoint: 'GoogleAnalyticsId' };
	entitlement: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Flag indicating the chat entitlement state' };
	quotaChat: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of chat requests available to the user' };
	quotaPremiumChat: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of premium chat requests available to the user' };
	quotaCompletions: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of code completions available to the user' };
	quotaResetDate: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The date the quota will reset' };
	owner: 'bpasero';
	comment: 'Reporting chat entitlements';
};

type EntitlementEvent = {
	entitlement: ChatEntitlement;
	tid: string;
	quotaChat: number | undefined;
	quotaPremiumChat: number | undefined;
	quotaCompletions: number | undefined;
	quotaResetDate: string | undefined;
};

interface IQuotaSnapshotResponse {
	readonly entitlement: number;
	readonly overage_count: number;
	readonly overage_permitted: boolean;
	readonly percent_remaining: number;
	readonly remaining: number;
	readonly unlimited: boolean;
}

interface ILegacyQuotaSnapshotResponse {
	readonly limited_user_quotas?: {
		readonly chat: number;
		readonly completions: number;
	};
	readonly monthly_quotas?: {
		readonly chat: number;
		readonly completions: number;
	};
}

interface IEntitlementsResponse extends ILegacyQuotaSnapshotResponse {
	readonly access_type_sku: string;
	readonly assigned_date: string;
	readonly can_signup_for_limited: boolean;
	readonly chat_enabled: boolean;
	readonly copilot_plan: string;
	readonly organization_login_list: string[];
	readonly analytics_tracking_id: string;
	readonly limited_user_reset_date?: string; 	// for Copilot Free
	readonly quota_reset_date?: string; 		// for all other Copilot SKUs
	readonly quota_reset_date_utc?: string; 	// for all other Copilot SKUs (includes time)
	readonly quota_snapshots?: {
		chat?: IQuotaSnapshotResponse;
		completions?: IQuotaSnapshotResponse;
		premium_interactions?: IQuotaSnapshotResponse;
	};
}

interface IEntitlements {
	readonly entitlement: ChatEntitlement;
	readonly organisations?: string[];
	readonly sku?: string;
	readonly quotas?: IQuotas;
}

export interface IQuotaSnapshot {
	readonly total: number;
	readonly percentRemaining: number;

	readonly overageEnabled: boolean;
	readonly overageCount: number;

	readonly unlimited: boolean;
}

interface IQuotas {
	readonly resetDate?: string;
	readonly resetDateHasTime?: boolean;

	readonly chat?: IQuotaSnapshot;
	readonly completions?: IQuotaSnapshot;
	readonly premiumChat?: IQuotaSnapshot;
}

export class ChatEntitlementRequests extends Disposable {

	static providerId(configurationService: IConfigurationService): string {
		if (configurationService.getValue<string | undefined>(`${defaultChat.completionsAdvancedSetting}.authProvider`) === defaultChat.provider.enterprise.id) {
			return defaultChat.provider.enterprise.id;
		}

		return defaultChat.provider.default.id;
	}

	private state: IEntitlements;

	private pendingResolveCts = new CancellationTokenSource();
	private didResolveEntitlements = false;

	constructor(
		private readonly context: ChatEntitlementContext,
		private readonly chatQuotasAccessor: IChatQuotasAccessor,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@ILogService private readonly logService: ILogService,
		@IRequestService private readonly requestService: IRequestService,
		@IDialogService private readonly dialogService: IDialogService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAuthenticationExtensionsService private readonly authenticationExtensionsService: IAuthenticationExtensionsService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
	) {
		super();

		this.state = { entitlement: this.context.state.entitlement };

		this.registerListeners();

		this.resolve();
	}

	private registerListeners(): void {
		this._register(this.authenticationService.onDidChangeDeclaredProviders(() => this.resolve()));

		this._register(this.authenticationService.onDidChangeSessions(e => {
			if (e.providerId === ChatEntitlementRequests.providerId(this.configurationService)) {
				this.resolve();
			}
		}));

		this._register(this.authenticationService.onDidRegisterAuthenticationProvider(e => {
			if (e.id === ChatEntitlementRequests.providerId(this.configurationService)) {
				this.resolve();
			}
		}));

		this._register(this.authenticationService.onDidUnregisterAuthenticationProvider(e => {
			if (e.id === ChatEntitlementRequests.providerId(this.configurationService)) {
				this.resolve();
			}
		}));

		this._register(this.context.onDidChange(() => {
			if (!this.context.state.installed || this.context.state.disabled || this.context.state.entitlement === ChatEntitlement.Unknown) {
				// When the extension is not installed, disabled or the user is not entitled
				// make sure to clear quotas so that any indicators are also gone
				this.state = { entitlement: this.state.entitlement, quotas: undefined };
				this.chatQuotasAccessor.clearQuotas();
			}
		}));
	}

	private async resolve(): Promise<void> {
		this.pendingResolveCts.dispose(true);
		const cts = this.pendingResolveCts = new CancellationTokenSource();

		const session = await this.findMatchingProviderSession(cts.token);
		if (cts.token.isCancellationRequested) {
			return;
		}

		// Immediately signal whether we have a session or not
		let state: IEntitlements | undefined = undefined;
		if (session) {
			// Do not overwrite any state we have already
			if (this.state.entitlement === ChatEntitlement.Unknown) {
				state = { entitlement: ChatEntitlement.Unresolved };
			}
		} else {
			this.didResolveEntitlements = false; // reset so that we resolve entitlements fresh when signed in again
			state = { entitlement: ChatEntitlement.Unknown };
		}
		if (state) {
			this.update(state);
		}

		if (session && !this.didResolveEntitlements) {
			// Afterwards resolve entitlement with a network request
			// but only unless it was not already resolved before.
			await this.resolveEntitlement(session, cts.token);
		}
	}

	private async findMatchingProviderSession(token: CancellationToken): Promise<AuthenticationSession[] | undefined> {
		const sessions = await this.doGetSessions(ChatEntitlementRequests.providerId(this.configurationService));
		if (token.isCancellationRequested) {
			return undefined;
		}

		const matchingSessions = new Set<AuthenticationSession>();
		for (const session of sessions) {
			for (const scopes of defaultChat.providerScopes) {
				if (this.includesScopes(session.scopes, scopes)) {
					matchingSessions.add(session);
				}
			}
		}

		// We intentionally want to return an array of matching sessions and
		// not just the first, because it is possible that a matching session
		// has an expired token. As such, we want to try them all until we
		// succeeded with the request.
		return matchingSessions.size > 0 ? Array.from(matchingSessions) : undefined;
	}

	private async doGetSessions(providerId: string): Promise<readonly AuthenticationSession[]> {
		const preferredAccountName = this.authenticationExtensionsService.getAccountPreference(defaultChat.chatExtensionId, providerId) ?? this.authenticationExtensionsService.getAccountPreference(defaultChat.extensionId, providerId);
		let preferredAccount: AuthenticationSessionAccount | undefined;
		for (const account of await this.authenticationService.getAccounts(providerId)) {
			if (account.label === preferredAccountName) {
				preferredAccount = account;
				break;
			}
		}

		try {
			return await this.authenticationService.getSessions(providerId, undefined, { account: preferredAccount });
		} catch (error) {
			// ignore - errors can throw if a provider is not registered
		}

		return [];
	}

	private includesScopes(scopes: ReadonlyArray<string>, expectedScopes: string[]): boolean {
		return expectedScopes.every(scope => scopes.includes(scope));
	}

	private async resolveEntitlement(sessions: AuthenticationSession[], token: CancellationToken): Promise<IEntitlements | undefined> {
		const entitlements = await this.doResolveEntitlement(sessions, token);
		if (typeof entitlements?.entitlement === 'number' && !token.isCancellationRequested) {
			this.didResolveEntitlements = true;
			this.update(entitlements);
		}

		return entitlements;
	}

	private async doResolveEntitlement(sessions: AuthenticationSession[], token: CancellationToken): Promise<IEntitlements | undefined> {
		if (token.isCancellationRequested) {
			return undefined;
		}

		const response = await this.request(this.getEntitlementUrl(), 'GET', undefined, sessions, token);
		if (token.isCancellationRequested) {
			return undefined;
		}

		if (!response) {
			this.logService.trace('[chat entitlement]: no response');
			return { entitlement: ChatEntitlement.Unresolved };
		}

		if (response.res.statusCode && response.res.statusCode !== 200) {
			this.logService.trace(`[chat entitlement]: unexpected status code ${response.res.statusCode}`);
			return (
				response.res.statusCode === 401 || 	// oauth token being unavailable (expired/revoked)
				response.res.statusCode === 404		// missing scopes/permissions, service pretends the endpoint doesn't exist
			) ? { entitlement: ChatEntitlement.Unknown /* treat as signed out */ } : { entitlement: ChatEntitlement.Unresolved };
		}

		let responseText: string | null = null;
		try {
			responseText = await asText(response);
		} catch (error) {
			// ignore - handled below
		}
		if (token.isCancellationRequested) {
			return undefined;
		}

		if (!responseText) {
			this.logService.trace('[chat entitlement]: response has no content');
			return { entitlement: ChatEntitlement.Unresolved };
		}

		let entitlementsResponse: IEntitlementsResponse;
		try {
			entitlementsResponse = JSON.parse(responseText);
			this.logService.trace(`[chat entitlement]: parsed result is ${JSON.stringify(entitlementsResponse)}`);
		} catch (err) {
			this.logService.trace(`[chat entitlement]: error parsing response (${err})`);
			return { entitlement: ChatEntitlement.Unresolved };
		}

		let entitlement: ChatEntitlement;
		if (entitlementsResponse.access_type_sku === 'free_limited_copilot') {
			entitlement = ChatEntitlement.Free;
		} else if (entitlementsResponse.can_signup_for_limited) {
			entitlement = ChatEntitlement.Available;
		} else if (entitlementsResponse.copilot_plan === 'individual') {
			entitlement = ChatEntitlement.Pro;
		} else if (entitlementsResponse.copilot_plan === 'individual_pro') {
			entitlement = ChatEntitlement.ProPlus;
		} else if (entitlementsResponse.copilot_plan === 'business') {
			entitlement = ChatEntitlement.Business;
		} else if (entitlementsResponse.copilot_plan === 'enterprise') {
			entitlement = ChatEntitlement.Enterprise;
		} else if (entitlementsResponse.chat_enabled) {
			// This should never happen as we exhaustively list the plans above. But if a new plan is added in the future older clients won't break
			entitlement = ChatEntitlement.Pro;
		} else {
			entitlement = ChatEntitlement.Unavailable;
		}

		const entitlements: IEntitlements = {
			entitlement,
			organisations: entitlementsResponse.organization_login_list,
			quotas: this.toQuotas(entitlementsResponse),
			sku: entitlementsResponse.access_type_sku
		};

		this.logService.trace(`[chat entitlement]: resolved to ${entitlements.entitlement}, quotas: ${JSON.stringify(entitlements.quotas)}`);
		this.telemetryService.publicLog2<EntitlementEvent, EntitlementClassification>('chatInstallEntitlement', {
			entitlement: entitlements.entitlement,
			tid: entitlementsResponse.analytics_tracking_id,
			quotaChat: entitlementsResponse?.quota_snapshots?.chat?.remaining,
			quotaPremiumChat: entitlementsResponse?.quota_snapshots?.premium_interactions?.remaining,
			quotaCompletions: entitlementsResponse?.quota_snapshots?.completions?.remaining,
			quotaResetDate: entitlementsResponse.quota_reset_date_utc ?? entitlementsResponse.quota_reset_date ?? entitlementsResponse.limited_user_reset_date
		});

		return entitlements;
	}

	private getEntitlementUrl(): string {
		if (ChatEntitlementRequests.providerId(this.configurationService) === defaultChat.provider.enterprise.id) {
			try {
				const enterpriseUrl = new URL(this.configurationService.getValue(defaultChat.providerUriSetting));
				return `${enterpriseUrl.protocol}//api.${enterpriseUrl.hostname}${enterpriseUrl.port ? ':' + enterpriseUrl.port : ''}/copilot_internal/user`;
			} catch (error) {
				this.logService.error(error);
			}
		}

		return defaultChat.entitlementUrl;
	}

	private toQuotas(response: IEntitlementsResponse): IQuotas {
		const quotas: Mutable<IQuotas> = {
			resetDate: response.quota_reset_date_utc ?? response.quota_reset_date ?? response.limited_user_reset_date,
			resetDateHasTime: typeof response.quota_reset_date_utc === 'string',
		};

		// Legacy Free SKU Quota
		if (response.monthly_quotas?.chat && typeof response.limited_user_quotas?.chat === 'number') {
			quotas.chat = {
				total: response.monthly_quotas.chat,
				percentRemaining: Math.min(100, Math.max(0, (response.limited_user_quotas.chat / response.monthly_quotas.chat) * 100)),
				overageEnabled: false,
				overageCount: 0,
				unlimited: false
			};
		}

		if (response.monthly_quotas?.completions && typeof response.limited_user_quotas?.completions === 'number') {
			quotas.completions = {
				total: response.monthly_quotas.completions,
				percentRemaining: Math.min(100, Math.max(0, (response.limited_user_quotas.completions / response.monthly_quotas.completions) * 100)),
				overageEnabled: false,
				overageCount: 0,
				unlimited: false
			};
		}

		// New Quota Snapshot
		if (response.quota_snapshots) {
			for (const quotaType of ['chat', 'completions', 'premium_interactions'] as const) {
				const rawQuotaSnapshot = response.quota_snapshots[quotaType];
				if (!rawQuotaSnapshot) {
					continue;
				}
				const quotaSnapshot: IQuotaSnapshot = {
					total: rawQuotaSnapshot.entitlement,
					percentRemaining: Math.min(100, Math.max(0, rawQuotaSnapshot.percent_remaining)),
					overageEnabled: rawQuotaSnapshot.overage_permitted,
					overageCount: rawQuotaSnapshot.overage_count,
					unlimited: rawQuotaSnapshot.unlimited
				};

				switch (quotaType) {
					case 'chat':
						quotas.chat = quotaSnapshot;
						break;
					case 'completions':
						quotas.completions = quotaSnapshot;
						break;
					case 'premium_interactions':
						quotas.premiumChat = quotaSnapshot;
						break;
				}
			}
		}

		return quotas;
	}

	private async request(url: string, type: 'GET', body: undefined, sessions: AuthenticationSession[], token: CancellationToken): Promise<IRequestContext | undefined>;
	private async request(url: string, type: 'POST', body: object, sessions: AuthenticationSession[], token: CancellationToken): Promise<IRequestContext | undefined>;
	private async request(url: string, type: 'GET' | 'POST', body: object | undefined, sessions: AuthenticationSession[], token: CancellationToken): Promise<IRequestContext | undefined> {
		let lastRequest: IRequestContext | undefined;

		for (const session of sessions) {
			if (token.isCancellationRequested) {
				return lastRequest;
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
					lastRequest = response;
					continue; // try next session
				}

				return response;
			} catch (error) {
				if (!token.isCancellationRequested) {
					this.logService.error(`[chat entitlement] request: error ${error}`);
				}
			}
		}

		return lastRequest;
	}

	private update(state: IEntitlements): void {
		this.state = state;

		this.context.update({ entitlement: this.state.entitlement, organisations: this.state.organisations, sku: this.state.sku });

		if (state.quotas) {
			this.chatQuotasAccessor.acceptQuotas(state.quotas);
		}
	}

	async forceResolveEntitlement(sessions: AuthenticationSession[] | undefined, token = CancellationToken.None): Promise<IEntitlements | undefined> {
		if (!sessions) {
			sessions = await this.findMatchingProviderSession(token);
		}

		if (!sessions || sessions.length === 0) {
			return undefined;
		}

		return this.resolveEntitlement(sessions, token);
	}

	async signUpFree(sessions: AuthenticationSession[]): Promise<true /* signed up */ | false /* already signed up */ | { errorCode: number } /* error */> {
		const body = {
			restricted_telemetry: this.telemetryService.telemetryLevel === TelemetryLevel.NONE ? 'disabled' : 'enabled',
			public_code_suggestions: 'enabled'
		};

		const response = await this.request(defaultChat.entitlementSignupLimitedUrl, 'POST', body, sessions, CancellationToken.None);
		if (!response) {
			const retry = await this.onUnknownSignUpError(localize('signUpNoResponseError', "No response received."), '[chat entitlement] sign-up: no response');
			return retry ? this.signUpFree(sessions) : { errorCode: 1 };
		}

		if (response.res.statusCode && response.res.statusCode !== 200) {
			if (response.res.statusCode === 422) {
				try {
					const responseText = await asText(response);
					if (responseText) {
						const responseError: { message: string } = JSON.parse(responseText);
						if (typeof responseError.message === 'string' && responseError.message) {
							this.onUnprocessableSignUpError(`[chat entitlement] sign-up: unprocessable entity (${responseError.message})`, responseError.message);
							return { errorCode: response.res.statusCode };
						}
					}
				} catch (error) {
					// ignore - handled below
				}
			}
			const retry = await this.onUnknownSignUpError(localize('signUpUnexpectedStatusError', "Unexpected status code {0}.", response.res.statusCode), `[chat entitlement] sign-up: unexpected status code ${response.res.statusCode}`);
			return retry ? this.signUpFree(sessions) : { errorCode: response.res.statusCode };
		}

		let responseText: string | null = null;
		try {
			responseText = await asText(response);
		} catch (error) {
			// ignore - handled below
		}

		if (!responseText) {
			const retry = await this.onUnknownSignUpError(localize('signUpNoResponseContentsError', "Response has no contents."), '[chat entitlement] sign-up: response has no content');
			return retry ? this.signUpFree(sessions) : { errorCode: 2 };
		}

		let parsedResult: { subscribed: boolean } | undefined = undefined;
		try {
			parsedResult = JSON.parse(responseText);
			this.logService.trace(`[chat entitlement] sign-up: response is ${responseText}`);
		} catch (err) {
			const retry = await this.onUnknownSignUpError(localize('signUpInvalidResponseError', "Invalid response contents."), `[chat entitlement] sign-up: error parsing response (${err})`);
			return retry ? this.signUpFree(sessions) : { errorCode: 3 };
		}

		// We have made it this far, so the user either did sign-up or was signed-up already.
		// That is, because the endpoint throws in all other case according to Patrick.
		this.update({ entitlement: ChatEntitlement.Free });

		return Boolean(parsedResult?.subscribed);
	}

	private async onUnknownSignUpError(detail: string, logMessage: string): Promise<boolean> {
		this.logService.error(logMessage);

		if (!this.lifecycleService.willShutdown) {
			const { confirmed } = await this.dialogService.confirm({
				type: Severity.Error,
				message: localize('unknownSignUpError', "An error occurred while signing up for the GitHub Copilot Free plan. Would you like to try again?"),
				detail,
				primaryButton: localize('retry', "Retry")
			});

			return confirmed;
		}

		return false;
	}

	private onUnprocessableSignUpError(logMessage: string, logDetails: string): void {
		this.logService.error(logMessage);

		if (!this.lifecycleService.willShutdown) {
			this.dialogService.prompt({
				type: Severity.Error,
				message: localize('unprocessableSignUpError', "An error occurred while signing up for the GitHub Copilot Free plan."),
				detail: logDetails,
				buttons: [
					{
						label: localize('ok', "OK"),
						run: () => { /* noop */ }
					},
					{
						label: localize('learnMore', "Learn More"),
						run: () => this.openerService.open(URI.parse(defaultChat.upgradePlanUrl))
					}
				]
			});
		}
	}

	async signIn(options?: { useSocialProvider?: string; additionalScopes?: readonly string[] }) {
		const providerId = ChatEntitlementRequests.providerId(this.configurationService);

		const scopes = options?.additionalScopes ? distinct([...defaultChat.providerScopes[0], ...options.additionalScopes]) : defaultChat.providerScopes[0];
		const session = await this.authenticationService.createSession(
			providerId,
			scopes,
			{
				extraAuthorizeParameters: { get_started_with: 'copilot-vscode' },
				provider: options?.useSocialProvider
			});

		this.authenticationExtensionsService.updateAccountPreference(defaultChat.extensionId, providerId, session.account);
		this.authenticationExtensionsService.updateAccountPreference(defaultChat.chatExtensionId, providerId, session.account);

		const entitlements = await this.forceResolveEntitlement([session]);

		return { session, entitlements };
	}

	override dispose(): void {
		this.pendingResolveCts.dispose(true);

		super.dispose();
	}
}

//#endregion

//#region Context

export interface IChatEntitlementContextState extends IChatSentiment {

	/**
	 * Users last known or resolved entitlement.
	 */
	entitlement: ChatEntitlement;

	/**
	 * User's last known or resolved raw SKU type.
	 */
	sku: string | undefined;

	/**
	 * User's last known or resolved organisations.
	 */
	organisations: string[] | undefined;

	/**
	 * User is or was a registered Chat user.
	 */
	registered?: boolean;
}

type ChatEntitlementClassification = {
	owner: 'bpasero';
	comment: 'Provides insight into chat entitlements.';
	chatHidden: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether chat is hidden or not.' };
	chatEntitlement: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The current chat entitlement of the user.' };
};
type ChatEntitlementEvent = {
	chatHidden: boolean;
	chatEntitlement: ChatEntitlement;
};

export class ChatEntitlementContext extends Disposable {

	private static readonly CHAT_ENTITLEMENT_CONTEXT_STORAGE_KEY = 'chat.setupContext';
	private static readonly CHAT_DISABLED_CONFIGURATION_KEY = 'chat.disableAIFeatures';

	private readonly canSignUpContextKey: IContextKey<boolean>;
	private readonly signedOutContextKey: IContextKey<boolean>;

	private readonly freeContextKey: IContextKey<boolean>;
	private readonly proContextKey: IContextKey<boolean>;
	private readonly proPlusContextKey: IContextKey<boolean>;
	private readonly businessContextKey: IContextKey<boolean>;
	private readonly enterpriseContextKey: IContextKey<boolean>;

	private readonly organisationsContextKey: IContextKey<string[] | undefined>;
	private readonly isInternalContextKey: IContextKey<boolean>;
	private readonly skuContextKey: IContextKey<string | undefined>;

	private readonly hiddenContext: IContextKey<boolean>;
	private readonly laterContext: IContextKey<boolean>;
	private readonly installedContext: IContextKey<boolean>;
	private readonly disabledContext: IContextKey<boolean>;
	private readonly untrustedContext: IContextKey<boolean>;

	private _state: IChatEntitlementContextState;
	private suspendedState: IChatEntitlementContextState | undefined = undefined;
	get state(): IChatEntitlementContextState { return this.withConfiguration(this.suspendedState ?? this._state); }

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private updateBarrier: Barrier | undefined = undefined;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@ILogService private readonly logService: ILogService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) {
		super();

		this.canSignUpContextKey = ChatContextKeys.Entitlement.canSignUp.bindTo(contextKeyService);
		this.signedOutContextKey = ChatContextKeys.Entitlement.signedOut.bindTo(contextKeyService);
		this.freeContextKey = ChatContextKeys.Entitlement.planFree.bindTo(contextKeyService);
		this.proContextKey = ChatContextKeys.Entitlement.planPro.bindTo(contextKeyService);
		this.proPlusContextKey = ChatContextKeys.Entitlement.planProPlus.bindTo(contextKeyService);
		this.businessContextKey = ChatContextKeys.Entitlement.planBusiness.bindTo(contextKeyService);
		this.enterpriseContextKey = ChatContextKeys.Entitlement.planEnterprise.bindTo(contextKeyService);
		this.organisationsContextKey = ChatContextKeys.Entitlement.organisations.bindTo(contextKeyService);
		this.isInternalContextKey = ChatContextKeys.Entitlement.internal.bindTo(contextKeyService);
		this.skuContextKey = ChatContextKeys.Entitlement.sku.bindTo(contextKeyService);
		this.hiddenContext = ChatContextKeys.Setup.hidden.bindTo(contextKeyService);
		this.laterContext = ChatContextKeys.Setup.later.bindTo(contextKeyService);
		this.installedContext = ChatContextKeys.Setup.installed.bindTo(contextKeyService);
		this.disabledContext = ChatContextKeys.Setup.disabled.bindTo(contextKeyService);
		this.untrustedContext = ChatContextKeys.Setup.untrusted.bindTo(contextKeyService);

		this._state = this.storageService.getObject<IChatEntitlementContextState>(ChatEntitlementContext.CHAT_ENTITLEMENT_CONTEXT_STORAGE_KEY, StorageScope.PROFILE) ?? { entitlement: ChatEntitlement.Unknown, organisations: undefined, sku: undefined };

		this.checkExtensionInstallation();
		this.updateContextSync();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatEntitlementContext.CHAT_DISABLED_CONFIGURATION_KEY)) {
				this.updateContext();
			}
		}));
	}

	private withConfiguration(state: IChatEntitlementContextState): IChatEntitlementContextState {
		if (this.configurationService.getValue(ChatEntitlementContext.CHAT_DISABLED_CONFIGURATION_KEY) === true) {
			// Setting always wins: if AI is disabled, set `hidden: true`
			return { ...state, hidden: true };
		}

		return state;
	}

	private async checkExtensionInstallation(): Promise<void> {

		// Await extensions to be ready to be queried
		await this.extensionsWorkbenchService.queryLocal();

		// Listen to extensions change and process extensions once
		this._register(Event.runAndSubscribe<IExtension | undefined>(this.extensionsWorkbenchService.onChange, e => {
			if (e && !ExtensionIdentifier.equals(e.identifier.id, defaultChat.chatExtensionId)) {
				return; // unrelated event
			}

			const defaultChatExtension = this.extensionsWorkbenchService.local.find(value => ExtensionIdentifier.equals(value.identifier.id, defaultChat.chatExtensionId));
			const installed = !!defaultChatExtension?.local;

			let disabled: boolean;
			let untrusted = false;
			if (installed) {
				disabled = !this.extensionEnablementService.isEnabled(defaultChatExtension.local);
				if (disabled) {
					const state = this.extensionEnablementService.getEnablementState(defaultChatExtension.local);
					if (state === EnablementState.DisabledByTrustRequirement) {
						disabled = false; // not disabled by user choice but
						untrusted = true; // by missing workspace trust
					}
				}
			} else {
				disabled = false;
			}

			this.update({ installed, disabled, untrusted });
		}));
	}

	update(context: { installed: boolean; disabled: boolean; untrusted: boolean }): Promise<void>;
	update(context: { hidden: false }): Promise<void>; // legacy UI state from before we had a setting to hide, keep around to still support users who used this
	update(context: { later: boolean }): Promise<void>;
	update(context: { entitlement: ChatEntitlement; organisations: string[] | undefined; sku: string | undefined }): Promise<void>;
	async update(context: { installed?: boolean; disabled?: boolean; untrusted?: boolean; hidden?: false; later?: boolean; entitlement?: ChatEntitlement; organisations?: string[]; sku?: string }): Promise<void> {
		this.logService.trace(`[chat entitlement context] update(): ${JSON.stringify(context)}`);

		const oldState = JSON.stringify(this._state);

		if (typeof context.installed === 'boolean' && typeof context.disabled === 'boolean' && typeof context.untrusted === 'boolean') {
			this._state.installed = context.installed;
			this._state.disabled = context.disabled;
			this._state.untrusted = context.untrusted;

			if (context.installed && !context.disabled) {
				context.hidden = false; // treat this as a sign to make Chat visible again in case it is hidden
			}
		}

		if (typeof context.hidden === 'boolean') {
			this._state.hidden = context.hidden;
		}

		if (typeof context.later === 'boolean') {
			this._state.later = context.later;
		}

		if (typeof context.entitlement === 'number') {
			this._state.entitlement = context.entitlement;
			this._state.organisations = context.organisations;
			this._state.sku = context.sku;

			if (this._state.entitlement === ChatEntitlement.Free || isProUser(this._state.entitlement)) {
				this._state.registered = true;
			} else if (this._state.entitlement === ChatEntitlement.Available) {
				this._state.registered = false; // only reset when signed-in user can sign-up for free
			}
		}

		if (oldState === JSON.stringify(this._state)) {
			return; // state did not change
		}

		this.storageService.store(ChatEntitlementContext.CHAT_ENTITLEMENT_CONTEXT_STORAGE_KEY, {
			...this._state,
			later: undefined // do not persist this across restarts for now
		}, StorageScope.PROFILE, StorageTarget.MACHINE);

		return this.updateContext();
	}

	private async updateContext(): Promise<void> {
		await this.updateBarrier?.wait();

		this.updateContextSync();
	}

	private updateContextSync(): void {
		const state = this.withConfiguration(this._state);

		this.signedOutContextKey.set(state.entitlement === ChatEntitlement.Unknown);
		this.canSignUpContextKey.set(state.entitlement === ChatEntitlement.Available);

		this.freeContextKey.set(state.entitlement === ChatEntitlement.Free);
		this.proContextKey.set(state.entitlement === ChatEntitlement.Pro);
		this.proPlusContextKey.set(state.entitlement === ChatEntitlement.ProPlus);
		this.businessContextKey.set(state.entitlement === ChatEntitlement.Business);
		this.enterpriseContextKey.set(state.entitlement === ChatEntitlement.Enterprise);

		this.organisationsContextKey.set(state.organisations);
		this.isInternalContextKey.set(Boolean(state.organisations?.some(org => org === 'github' || org === 'microsoft')));
		this.skuContextKey.set(state.sku);

		this.hiddenContext.set(!!state.hidden);
		this.laterContext.set(!!state.later);
		this.installedContext.set(!!state.installed);
		this.disabledContext.set(!!state.disabled);
		this.untrustedContext.set(!!state.untrusted);

		this.logService.trace(`[chat entitlement context] updateContext(): ${JSON.stringify(state)}`);
		this.telemetryService.publicLog2<ChatEntitlementEvent, ChatEntitlementClassification>('chatEntitlements', {
			chatHidden: Boolean(state.hidden),
			chatEntitlement: state.entitlement
		});

		this._onDidChange.fire();
	}

	suspend(): void {
		this.suspendedState = { ...this._state };
		this.updateBarrier = new Barrier();
	}

	resume(): void {
		this.suspendedState = undefined;
		this.updateBarrier?.open();
		this.updateBarrier = undefined;
	}
}

//#endregion

