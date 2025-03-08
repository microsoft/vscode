/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import product from '../../../../platform/product/common/product.js';
import { Barrier } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IRequestContext } from '../../../../base/parts/request/common/request.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { asText, IRequestService } from '../../../../platform/request/common/request.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService, TelemetryLevel } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { AuthenticationSession, IAuthenticationExtensionsService, IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IWorkbenchExtensionEnablementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IExtension, IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { ChatContextKeys } from './chatContextKeys.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { URI } from '../../../../base/common/uri.js';
import Severity from '../../../../base/common/severity.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { isWeb } from '../../../../base/common/platform.js';

export const IChatEntitlementService = createDecorator<IChatEntitlementService>('chatEntitlementService');

export enum ChatEntitlement {
	/** Signed out */
	Unknown = 1,
	/** Signed in but not yet resolved */
	Unresolved,
	/** Signed in and entitled to Limited */
	Available,
	/** Signed in but not entitled to Limited */
	Unavailable,
	/** Signed-up to Limited */
	Limited,
	/** Signed-up to Pro */
	Pro
}

export interface IChatQuotas {
	readonly chatQuotaExceeded: boolean;
	readonly completionsQuotaExceeded: boolean;
	readonly quotaResetDate: Date | undefined;

	readonly chatTotal?: number;
	readonly completionsTotal?: number;

	readonly chatRemaining?: number;
	readonly completionsRemaining?: number;
}

export interface IChatEntitlementService {

	_serviceBrand: undefined;

	readonly onDidChangeEntitlement: Event<void>;

	readonly entitlement: ChatEntitlement;

	readonly onDidChangeQuotaExceeded: Event<void>;
	readonly onDidChangeQuotaRemaining: Event<void>;

	readonly quotas: IChatQuotas;

	update(token: CancellationToken): Promise<void>;
}

//#region Service Implementation

const defaultChat = {
	extensionId: product.defaultChatAgent?.extensionId ?? '',
	chatExtensionId: product.defaultChatAgent?.chatExtensionId ?? '',
	upgradePlanUrl: product.defaultChatAgent?.upgradePlanUrl ?? '',
	providerId: product.defaultChatAgent?.providerId ?? '',
	enterpriseProviderId: product.defaultChatAgent?.enterpriseProviderId ?? '',
	providerScopes: product.defaultChatAgent?.providerScopes ?? [[]],
	entitlementUrl: product.defaultChatAgent?.entitlementUrl ?? '',
	entitlementSignupLimitedUrl: product.defaultChatAgent?.entitlementSignupLimitedUrl ?? '',
	completionsAdvancedSetting: product.defaultChatAgent?.completionsAdvancedSetting ?? '',
	chatQuotaExceededContext: product.defaultChatAgent?.chatQuotaExceededContext ?? '',
	completionsQuotaExceededContext: product.defaultChatAgent?.completionsQuotaExceededContext ?? ''
};

interface IChatQuotasAccessor {
	clearQuotas(): void;
	acceptQuotas(quotas: IChatQuotas): void;
}

export class ChatEntitlementService extends Disposable implements IChatEntitlementService {

	declare _serviceBrand: undefined;

	readonly context: Lazy<ChatSetupContext> | undefined;
	readonly requests: Lazy<ChatSetupRequests> | undefined;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IProductService productService: IProductService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();

		if (
			!productService.defaultChatAgent ||				// needs product config
			(isWeb && !environmentService.remoteAuthority)	// only enabled locally or a remote backend
		) {
			return;
		}

		const context = this.context = new Lazy(() => this._register(instantiationService.createInstance(ChatSetupContext)));
		this.requests = new Lazy(() => this._register(instantiationService.createInstance(ChatSetupRequests, context.value, {
			clearQuotas: () => this.clearQuotas(),
			acceptQuotas: quotas => this.acceptQuotas(quotas)
		})));

		this.registerListeners();
	}

	//#region --- Entitlements

	readonly onDidChangeEntitlement = Event.map(
		Event.filter(
			this.contextKeyService.onDidChangeContext, e => e.affectsSome(new Set([
				ChatContextKeys.Setup.pro.key,
				ChatContextKeys.Setup.limited.key,
				ChatContextKeys.Setup.canSignUp.key,
				ChatContextKeys.Setup.signedOut.key
			])), this._store
		), () => { }, this._store
	);

	get entitlement(): ChatEntitlement {
		if (this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Setup.pro.key) === true) {
			return ChatEntitlement.Pro;
		} else if (this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Setup.limited.key) === true) {
			return ChatEntitlement.Limited;
		} else if (this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Setup.canSignUp.key) === true) {
			return ChatEntitlement.Available;
		} else if (this.contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.Setup.signedOut.key) === true) {
			return ChatEntitlement.Unknown;
		}

		return ChatEntitlement.Unresolved;
	}

	//#endregion

	//#region --- Quotas

	private readonly _onDidChangeQuotaExceeded = this._register(new Emitter<void>());
	readonly onDidChangeQuotaExceeded = this._onDidChangeQuotaExceeded.event;

	private readonly _onDidChangeQuotaRemaining = this._register(new Emitter<void>());
	readonly onDidChangeQuotaRemaining = this._onDidChangeQuotaRemaining.event;

	private _quotas: IChatQuotas = { chatQuotaExceeded: false, completionsQuotaExceeded: false, quotaResetDate: undefined };
	get quotas() { return this._quotas; }

	private readonly chatQuotaExceededContextKey = ChatContextKeys.chatQuotaExceeded.bindTo(this.contextKeyService);
	private readonly completionsQuotaExceededContextKey = ChatContextKeys.completionsQuotaExceeded.bindTo(this.contextKeyService);

	private ExtensionQuotaContextKeys = {
		chatQuotaExceeded: defaultChat.chatQuotaExceededContext,
		completionsQuotaExceeded: defaultChat.completionsQuotaExceededContext,
	};

	private registerListeners(): void {
		const chatQuotaExceededSet = new Set([this.ExtensionQuotaContextKeys.chatQuotaExceeded]);
		const completionsQuotaExceededSet = new Set([this.ExtensionQuotaContextKeys.completionsQuotaExceeded]);

		this._register(this.contextKeyService.onDidChangeContext(e => {
			let changed = false;
			if (e.affectsSome(chatQuotaExceededSet)) {
				const newChatQuotaExceeded = this.contextKeyService.getContextKeyValue<boolean>(this.ExtensionQuotaContextKeys.chatQuotaExceeded);
				if (typeof newChatQuotaExceeded === 'boolean' && newChatQuotaExceeded !== this._quotas.chatQuotaExceeded) {
					this._quotas = {
						...this._quotas,
						chatQuotaExceeded: newChatQuotaExceeded,
					};
					changed = true;
				}
			}

			if (e.affectsSome(completionsQuotaExceededSet)) {
				const newCompletionsQuotaExceeded = this.contextKeyService.getContextKeyValue<boolean>(this.ExtensionQuotaContextKeys.completionsQuotaExceeded);
				if (typeof newCompletionsQuotaExceeded === 'boolean' && newCompletionsQuotaExceeded !== this._quotas.completionsQuotaExceeded) {
					this._quotas = {
						...this._quotas,
						completionsQuotaExceeded: newCompletionsQuotaExceeded,
					};
					changed = true;
				}
			}

			if (changed) {
				this.updateContextKeys();
				this._onDidChangeQuotaExceeded.fire();
			}
		}));
	}

	acceptQuotas(quotas: IChatQuotas): void {
		const oldQuota = this._quotas;
		this._quotas = quotas;
		this.updateContextKeys();

		if (
			oldQuota.chatQuotaExceeded !== this._quotas.chatQuotaExceeded ||
			oldQuota.completionsQuotaExceeded !== this._quotas.completionsQuotaExceeded
		) {
			this._onDidChangeQuotaExceeded.fire();
		}

		if (
			oldQuota.chatRemaining !== this._quotas.chatRemaining ||
			oldQuota.completionsRemaining !== this._quotas.completionsRemaining
		) {
			this._onDidChangeQuotaRemaining.fire();
		}
	}

	clearQuotas(): void {
		if (this.quotas.chatQuotaExceeded || this.quotas.completionsQuotaExceeded) {
			this.acceptQuotas({ chatQuotaExceeded: false, completionsQuotaExceeded: false, quotaResetDate: undefined });
		}
	}

	private updateContextKeys(): void {
		this.chatQuotaExceededContextKey.set(this._quotas.chatQuotaExceeded);
		this.completionsQuotaExceededContextKey.set(this._quotas.completionsQuotaExceeded);
	}

	//#endregion

	async update(token: CancellationToken): Promise<void> {
		await this.requests?.value.forceResolveEntitlement(undefined, token);
	}
}

//#endregion

//#region Chat Setup Request Service

type EntitlementClassification = {
	tid: { classification: 'EndUserPseudonymizedInformation'; purpose: 'BusinessInsight'; comment: 'The anonymized analytics id returned by the service'; endpoint: 'GoogleAnalyticsId' };
	entitlement: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Flag indicating the chat entitlement state' };
	quotaChat: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of chat completions available to the user' };
	quotaCompletions: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of chat completions available to the user' };
	quotaResetDate: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The date the quota will reset' };
	owner: 'bpasero';
	comment: 'Reporting chat setup entitlements';
};

type EntitlementEvent = {
	entitlement: ChatEntitlement;
	tid: string;
	quotaChat: number | undefined;
	quotaCompletions: number | undefined;
	quotaResetDate: string | undefined;
};

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

interface IEntitlements {
	readonly entitlement: ChatEntitlement;
	readonly quotas?: IQuotas;
}

interface IQuotas {
	readonly chatTotal?: number;
	readonly completionsTotal?: number;

	readonly chatRemaining?: number;
	readonly completionsRemaining?: number;

	readonly resetDate?: string;
}

export class ChatSetupRequests extends Disposable {

	static providerId(configurationService: IConfigurationService): string {
		if (configurationService.getValue<string | undefined>(`${defaultChat.completionsAdvancedSetting}.authProvider`) === defaultChat.enterpriseProviderId) {
			return defaultChat.enterpriseProviderId;
		}

		return defaultChat.providerId;
	}

	private state: IEntitlements = { entitlement: this.context.state.entitlement };

	private pendingResolveCts = new CancellationTokenSource();
	private didResolveEntitlements = false;

	constructor(
		private readonly context: ChatSetupContext,
		private readonly chatQuotasAccessor: IChatQuotasAccessor,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@ILogService private readonly logService: ILogService,
		@IRequestService private readonly requestService: IRequestService,
		@IDialogService private readonly dialogService: IDialogService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAuthenticationExtensionsService private readonly authenticationExtensionsService: IAuthenticationExtensionsService,
	) {
		super();

		this.registerListeners();

		this.resolve();
	}

	private registerListeners(): void {
		this._register(this.authenticationService.onDidChangeDeclaredProviders(() => this.resolve()));

		this._register(this.authenticationService.onDidChangeSessions(e => {
			if (e.providerId === ChatSetupRequests.providerId(this.configurationService)) {
				this.resolve();
			}
		}));

		this._register(this.authenticationService.onDidRegisterAuthenticationProvider(e => {
			if (e.id === ChatSetupRequests.providerId(this.configurationService)) {
				this.resolve();
			}
		}));

		this._register(this.authenticationService.onDidUnregisterAuthenticationProvider(e => {
			if (e.id === ChatSetupRequests.providerId(this.configurationService)) {
				this.resolve();
			}
		}));

		this._register(this.context.onDidChange(() => {
			if (!this.context.state.installed || this.context.state.entitlement === ChatEntitlement.Unknown) {
				// When the extension is not installed or the user is not entitled
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

	private async findMatchingProviderSession(token: CancellationToken): Promise<AuthenticationSession | undefined> {
		const sessions = await this.doGetSessions(ChatSetupRequests.providerId(this.configurationService));
		if (token.isCancellationRequested) {
			return undefined;
		}

		for (const session of sessions) {
			for (const scopes of defaultChat.providerScopes) {
				if (this.scopesMatch(session.scopes, scopes)) {
					return session;
				}
			}
		}

		return undefined;
	}

	private async doGetSessions(providerId: string): Promise<readonly AuthenticationSession[]> {
		try {
			return await this.authenticationService.getSessions(providerId);
		} catch (error) {
			// ignore - errors can throw if a provider is not registered
		}

		return [];
	}

	private scopesMatch(scopes: ReadonlyArray<string>, expectedScopes: string[]): boolean {
		return scopes.length === expectedScopes.length && expectedScopes.every(scope => scopes.includes(scope));
	}

	private async resolveEntitlement(session: AuthenticationSession, token: CancellationToken): Promise<IEntitlements | undefined> {
		const entitlements = await this.doResolveEntitlement(session, token);
		if (typeof entitlements?.entitlement === 'number' && !token.isCancellationRequested) {
			this.didResolveEntitlements = true;
			this.update(entitlements);
		}

		return entitlements;
	}

	private async doResolveEntitlement(session: AuthenticationSession, token: CancellationToken): Promise<IEntitlements | undefined> {
		if (ChatSetupRequests.providerId(this.configurationService) === defaultChat.enterpriseProviderId) {
			this.logService.trace('[chat setup] entitlement: enterprise provider, assuming Pro');
			return { entitlement: ChatEntitlement.Pro };
		}

		if (token.isCancellationRequested) {
			return undefined;
		}

		const response = await this.request(defaultChat.entitlementUrl, 'GET', undefined, session, token);
		if (token.isCancellationRequested) {
			return undefined;
		}

		if (!response) {
			this.logService.trace('[chat setup] entitlement: no response');
			return { entitlement: ChatEntitlement.Unresolved };
		}

		if (response.res.statusCode && response.res.statusCode !== 200) {
			this.logService.trace(`[chat setup] entitlement: unexpected status code ${response.res.statusCode}`);
			return { entitlement: ChatEntitlement.Unresolved };
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
			this.logService.trace('[chat setup] entitlement: response has no content');
			return { entitlement: ChatEntitlement.Unresolved };
		}

		let entitlementsResponse: IEntitlementsResponse;
		try {
			entitlementsResponse = JSON.parse(responseText);
			this.logService.trace(`[chat setup] entitlement: parsed result is ${JSON.stringify(entitlementsResponse)}`);
		} catch (err) {
			this.logService.trace(`[chat setup] entitlement: error parsing response (${err})`);
			return { entitlement: ChatEntitlement.Unresolved };
		}

		let entitlement: ChatEntitlement;
		if (entitlementsResponse.access_type_sku === 'free_limited_copilot') {
			entitlement = ChatEntitlement.Limited;
		} else if (entitlementsResponse.can_signup_for_limited) {
			entitlement = ChatEntitlement.Available;
		} else if (entitlementsResponse.chat_enabled) {
			entitlement = ChatEntitlement.Pro;
		} else {
			entitlement = ChatEntitlement.Unavailable;
		}

		const chatRemaining = entitlementsResponse.limited_user_quotas?.chat;
		const completionsRemaining = entitlementsResponse.limited_user_quotas?.completions;

		const entitlements: IEntitlements = {
			entitlement,
			quotas: {
				chatTotal: entitlementsResponse.monthly_quotas?.chat,
				completionsTotal: entitlementsResponse.monthly_quotas?.completions,
				chatRemaining: typeof chatRemaining === 'number' ? Math.max(0, chatRemaining) : undefined,
				completionsRemaining: typeof completionsRemaining === 'number' ? Math.max(0, completionsRemaining) : undefined,
				resetDate: entitlementsResponse.limited_user_reset_date
			}
		};

		this.logService.trace(`[chat setup] entitlement: resolved to ${entitlements.entitlement}, quotas: ${JSON.stringify(entitlements.quotas)}`);
		this.telemetryService.publicLog2<EntitlementEvent, EntitlementClassification>('chatInstallEntitlement', {
			entitlement: entitlements.entitlement,
			tid: entitlementsResponse.analytics_tracking_id,
			quotaChat: entitlementsResponse.limited_user_quotas?.chat,
			quotaCompletions: entitlementsResponse.limited_user_quotas?.completions,
			quotaResetDate: entitlementsResponse.limited_user_reset_date
		});

		return entitlements;
	}

	private async request(url: string, type: 'GET', body: undefined, session: AuthenticationSession, token: CancellationToken): Promise<IRequestContext | undefined>;
	private async request(url: string, type: 'POST', body: object, session: AuthenticationSession, token: CancellationToken): Promise<IRequestContext | undefined>;
	private async request(url: string, type: 'GET' | 'POST', body: object | undefined, session: AuthenticationSession, token: CancellationToken): Promise<IRequestContext | undefined> {
		try {
			return await this.requestService.request({
				type,
				url,
				data: type === 'POST' ? JSON.stringify(body) : undefined,
				disableCache: true,
				headers: {
					'Authorization': `Bearer ${session.accessToken}`
				}
			}, token);
		} catch (error) {
			if (!token.isCancellationRequested) {
				this.logService.error(`[chat setup] request: error ${error}`);
			}

			return undefined;
		}
	}

	private update(state: IEntitlements): void {
		this.state = state;

		this.context.update({ entitlement: this.state.entitlement });

		if (state.quotas) {
			this.chatQuotasAccessor.acceptQuotas({
				chatQuotaExceeded: typeof state.quotas.chatRemaining === 'number' ? state.quotas.chatRemaining <= 0 : false,
				completionsQuotaExceeded: typeof state.quotas.completionsRemaining === 'number' ? state.quotas.completionsRemaining <= 0 : false,
				quotaResetDate: state.quotas.resetDate ? new Date(state.quotas.resetDate) : undefined,
				chatTotal: state.quotas.chatTotal,
				completionsTotal: state.quotas.completionsTotal,
				chatRemaining: state.quotas.chatRemaining,
				completionsRemaining: state.quotas.completionsRemaining
			});
		}
	}

	async forceResolveEntitlement(session: AuthenticationSession | undefined, token = CancellationToken.None): Promise<IEntitlements | undefined> {
		if (!session) {
			session = await this.findMatchingProviderSession(token);
		}

		if (!session) {
			return undefined;
		}

		return this.resolveEntitlement(session, token);
	}

	async signUpLimited(session: AuthenticationSession): Promise<true /* signed up */ | false /* already signed up */ | { errorCode: number } /* error */> {
		const body = {
			restricted_telemetry: this.telemetryService.telemetryLevel === TelemetryLevel.NONE ? 'disabled' : 'enabled',
			public_code_suggestions: 'enabled'
		};

		const response = await this.request(defaultChat.entitlementSignupLimitedUrl, 'POST', body, session, CancellationToken.None);
		if (!response) {
			const retry = await this.onUnknownSignUpError(localize('signUpNoResponseError', "No response received."), '[chat setup] sign-up: no response');
			return retry ? this.signUpLimited(session) : { errorCode: 1 };
		}

		if (response.res.statusCode && response.res.statusCode !== 200) {
			if (response.res.statusCode === 422) {
				try {
					const responseText = await asText(response);
					if (responseText) {
						const responseError: { message: string } = JSON.parse(responseText);
						if (typeof responseError.message === 'string' && responseError.message) {
							this.onUnprocessableSignUpError(`[chat setup] sign-up: unprocessable entity (${responseError.message})`, responseError.message);
							return { errorCode: response.res.statusCode };
						}
					}
				} catch (error) {
					// ignore - handled below
				}
			}
			const retry = await this.onUnknownSignUpError(localize('signUpUnexpectedStatusError', "Unexpected status code {0}.", response.res.statusCode), `[chat setup] sign-up: unexpected status code ${response.res.statusCode}`);
			return retry ? this.signUpLimited(session) : { errorCode: response.res.statusCode };
		}

		let responseText: string | null = null;
		try {
			responseText = await asText(response);
		} catch (error) {
			// ignore - handled below
		}

		if (!responseText) {
			const retry = await this.onUnknownSignUpError(localize('signUpNoResponseContentsError', "Response has no contents."), '[chat setup] sign-up: response has no content');
			return retry ? this.signUpLimited(session) : { errorCode: 2 };
		}

		let parsedResult: { subscribed: boolean } | undefined = undefined;
		try {
			parsedResult = JSON.parse(responseText);
			this.logService.trace(`[chat setup] sign-up: response is ${responseText}`);
		} catch (err) {
			const retry = await this.onUnknownSignUpError(localize('signUpInvalidResponseError', "Invalid response contents."), `[chat setup] sign-up: error parsing response (${err})`);
			return retry ? this.signUpLimited(session) : { errorCode: 3 };
		}

		// We have made it this far, so the user either did sign-up or was signed-up already.
		// That is, because the endpoint throws in all other case according to Patrick.
		this.update({ entitlement: ChatEntitlement.Limited });

		return Boolean(parsedResult?.subscribed);
	}

	private async onUnknownSignUpError(detail: string, logMessage: string): Promise<boolean> {
		this.logService.error(logMessage);

		const { confirmed } = await this.dialogService.confirm({
			type: Severity.Error,
			message: localize('unknownSignUpError', "An error occurred while signing up for Copilot Free. Would you like to try again?"),
			detail,
			primaryButton: localize('retry', "Retry")
		});

		return confirmed;
	}

	private onUnprocessableSignUpError(logMessage: string, logDetails: string): void {
		this.logService.error(logMessage);

		this.dialogService.prompt({
			type: Severity.Error,
			message: localize('unprocessableSignUpError', "An error occurred while signing up for Copilot Free."),
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

	async signIn() {
		const providerId = ChatSetupRequests.providerId(this.configurationService);
		const session = await this.authenticationService.createSession(providerId, defaultChat.providerScopes[0]);

		this.authenticationExtensionsService.updateAccountPreference(defaultChat.extensionId, providerId, session.account);
		this.authenticationExtensionsService.updateAccountPreference(defaultChat.chatExtensionId, providerId, session.account);

		const entitlements = await this.forceResolveEntitlement(session);

		return { session, entitlements };
	}

	override dispose(): void {
		this.pendingResolveCts.dispose(true);

		super.dispose();
	}
}

//#endregion

//#region Context

export interface IChatSetupContextState {
	entitlement: ChatEntitlement;
	hidden?: boolean;
	installed?: boolean;
	registered?: boolean;
}

export class ChatSetupContext extends Disposable {

	private static readonly CHAT_SETUP_CONTEXT_STORAGE_KEY = 'chat.setupContext';

	private readonly canSignUpContextKey = ChatContextKeys.Setup.canSignUp.bindTo(this.contextKeyService);
	private readonly signedOutContextKey = ChatContextKeys.Setup.signedOut.bindTo(this.contextKeyService);
	private readonly limitedContextKey = ChatContextKeys.Setup.limited.bindTo(this.contextKeyService);
	private readonly proContextKey = ChatContextKeys.Setup.pro.bindTo(this.contextKeyService);
	private readonly hiddenContext = ChatContextKeys.Setup.hidden.bindTo(this.contextKeyService);
	private readonly installedContext = ChatContextKeys.Setup.installed.bindTo(this.contextKeyService);

	private _state: IChatSetupContextState = this.storageService.getObject<IChatSetupContextState>(ChatSetupContext.CHAT_SETUP_CONTEXT_STORAGE_KEY, StorageScope.PROFILE) ?? { entitlement: ChatEntitlement.Unknown };
	private suspendedState: IChatSetupContextState | undefined = undefined;
	get state(): IChatSetupContextState {
		return this.suspendedState ?? this._state;
	}

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private updateBarrier: Barrier | undefined = undefined;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@ILogService private readonly logService: ILogService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
	) {
		super();

		this.checkExtensionInstallation();
		this.updateContextSync();
	}

	private async checkExtensionInstallation(): Promise<void> {

		// Await extensions to be ready to be queried
		await this.extensionsWorkbenchService.queryLocal();

		// Listen to change and process extensions once
		this._register(Event.runAndSubscribe<IExtension | undefined>(this.extensionsWorkbenchService.onChange, e => {
			if (e && !ExtensionIdentifier.equals(e.identifier.id, defaultChat.extensionId)) {
				return; // unrelated event
			}

			const defaultChatExtension = this.extensionsWorkbenchService.local.find(value => ExtensionIdentifier.equals(value.identifier.id, defaultChat.extensionId));
			this.update({ installed: !!defaultChatExtension?.local && this.extensionEnablementService.isEnabled(defaultChatExtension.local) });
		}));
	}

	update(context: { installed: boolean }): Promise<void>;
	update(context: { hidden: boolean }): Promise<void>;
	update(context: { entitlement: ChatEntitlement }): Promise<void>;
	update(context: { installed?: boolean; hidden?: boolean; entitlement?: ChatEntitlement }): Promise<void> {
		this.logService.trace(`[chat setup] update(): ${JSON.stringify(context)}`);

		if (typeof context.installed === 'boolean') {
			this._state.installed = context.installed;

			if (context.installed) {
				context.hidden = false; // allows to fallback to setup view if the extension is uninstalled
			}
		}

		if (typeof context.hidden === 'boolean') {
			this._state.hidden = context.hidden;
		}

		if (typeof context.entitlement === 'number') {
			this._state.entitlement = context.entitlement;

			if (this._state.entitlement === ChatEntitlement.Limited || this._state.entitlement === ChatEntitlement.Pro) {
				this._state.registered = true; // remember that the user did register to improve setup screen
			} else if (this._state.entitlement === ChatEntitlement.Available) {
				this._state.registered = false; // only restore when signed-in user can sign-up for limited
			}
		}

		this.storageService.store(ChatSetupContext.CHAT_SETUP_CONTEXT_STORAGE_KEY, this._state, StorageScope.PROFILE, StorageTarget.MACHINE);

		return this.updateContext();
	}

	private async updateContext(): Promise<void> {
		await this.updateBarrier?.wait();

		this.updateContextSync();
	}

	private updateContextSync(): void {
		this.logService.trace(`[chat setup] updateContext(): ${JSON.stringify(this._state)}`);

		if (!this._state.hidden && !this._state.installed) {
			// this is ugly but fixes flicker from a previous chat install
			this.storageService.remove('chat.welcomeMessageContent.panel', StorageScope.APPLICATION);
			this.storageService.remove('interactive.sessions', this.workspaceContextService.getWorkspace().folders.length ? StorageScope.WORKSPACE : StorageScope.APPLICATION);
		}

		this.signedOutContextKey.set(this._state.entitlement === ChatEntitlement.Unknown);
		this.canSignUpContextKey.set(this._state.entitlement === ChatEntitlement.Available);
		this.limitedContextKey.set(this._state.entitlement === ChatEntitlement.Limited);
		this.proContextKey.set(this._state.entitlement === ChatEntitlement.Pro);
		this.hiddenContext.set(!!this._state.hidden);
		this.installedContext.set(!!this._state.installed);

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
