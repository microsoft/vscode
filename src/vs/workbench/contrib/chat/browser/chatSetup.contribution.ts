/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, getActiveElement, setVisibility } from '../../../../base/browser/dom.js';
import { Button, ButtonWithDropdown } from '../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IAction, toAction } from '../../../../base/common/actions.js';
import { Barrier, timeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IRequestContext } from '../../../../base/parts/request/common/request.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { MarkdownRenderer } from '../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, IAction2Options, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import product from '../../../../platform/product/common/product.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { asText, IRequestService } from '../../../../platform/request/common/request.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../common/views.js';
import { IActivityService, ProgressBadge } from '../../../services/activity/common/activity.js';
import { AuthenticationSession, IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IWorkbenchExtensionEnablementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { IChatAgentService } from '../common/chatAgents.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { CHAT_CATEGORY } from './actions/chatActions.js';
import { ChatViewId, EditsViewId, ensureSideBarChatViewSize, IChatWidget, showChatView, showEditsView } from './chat.js';
import { CHAT_EDITING_SIDEBAR_PANEL_ID, CHAT_SIDEBAR_PANEL_ID } from './chatViewPane.js';
import './media/chatViewSetup.css';
import { ChatViewsWelcomeExtensions, IChatViewsWelcomeContributionRegistry } from './viewsWelcome/chatViewsWelcome.js';

const defaultChat = {
	extensionId: product.defaultChatAgent?.extensionId ?? '',
	chatExtensionId: product.defaultChatAgent?.chatExtensionId ?? '',
	documentationUrl: product.defaultChatAgent?.documentationUrl ?? '',
	termsStatementUrl: product.defaultChatAgent?.termsStatementUrl ?? '',
	privacyStatementUrl: product.defaultChatAgent?.privacyStatementUrl ?? '',
	skusDocumentationUrl: product.defaultChatAgent?.skusDocumentationUrl ?? '',
	providerId: product.defaultChatAgent?.providerId ?? '',
	providerName: product.defaultChatAgent?.providerName ?? '',
	providerScopes: product.defaultChatAgent?.providerScopes ?? [[]],
	entitlementUrl: product.defaultChatAgent?.entitlementUrl ?? '',
	entitlementSignupLimitedUrl: product.defaultChatAgent?.entitlementSignupLimitedUrl ?? '',
	managePlanUrl: product.defaultChatAgent?.managePlanUrl ?? '',
};

enum ChatEntitlement {
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

//#region Contribution

const TRIGGER_SETUP_COMMAND_ID = 'workbench.action.chat.triggerSetup';

class ChatSetupContribution extends Disposable implements IWorkbenchContribution {

	private readonly context = this._register(this.instantiationService.createInstance(ChatSetupContext));
	private readonly requests = this._register(this.instantiationService.createInstance(ChatSetupRequests, this.context));
	private readonly controller = new Lazy(() => this._register(this.instantiationService.createInstance(ChatSetupController, this.context, this.requests)));

	constructor(
		@IProductService private readonly productService: IProductService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		if (!this.productService.defaultChatAgent) {
			return;
		}

		this.registerChatWelcome();
		this.registerActions();
	}

	private registerChatWelcome(): void {
		Registry.as<IChatViewsWelcomeContributionRegistry>(ChatViewsWelcomeExtensions.ChatViewsWelcomeRegistry).register({
			title: localize('welcomeChat', "Welcome to Copilot"),
			when: ContextKeyExpr.and(
				ContextKeyExpr.has('config.chat.experimental.offerSetup'),
				ContextKeyExpr.or(
					ContextKeyExpr.and(
						ChatContextKeys.Setup.triggered,
						ChatContextKeys.Setup.installed.negate()
					),
					ContextKeyExpr.and(
						ChatContextKeys.Setup.canSignUp,
						ChatContextKeys.Setup.installed
					),
					ContextKeyExpr.and(
						ChatContextKeys.Setup.signedOut,
						ChatContextKeys.Setup.installed
					)
				)
			)!,
			icon: Codicon.copilot,
			content: disposables => disposables.add(this.instantiationService.createInstance(ChatSetupWelcomeContent, this.controller.value, this.context)).element,
		});
	}

	private registerActions(): void {
		const that = this;

		class ChatSetupTriggerAction extends Action2 {

			static readonly ID = TRIGGER_SETUP_COMMAND_ID;
			static readonly TITLE = localize2('triggerChatSetup', "Use AI Features with Copilot for Free...");

			constructor() {
				super({
					id: ChatSetupTriggerAction.ID,
					title: ChatSetupTriggerAction.TITLE,
					category: CHAT_CATEGORY,
					f1: true,
					precondition: ContextKeyExpr.and(
						ChatContextKeys.Setup.installed.negate(),
						ContextKeyExpr.or(
							ChatContextKeys.Setup.entitled,
							ContextKeyExpr.has('config.chat.experimental.offerSetup')
						)
					),
					menu: {
						id: MenuId.ChatCommandCenter,
						group: 'a_first',
						order: 1,
						when: ChatContextKeys.Setup.installed.negate()
					}
				});
			}

			override async run(accessor: ServicesAccessor): Promise<void> {
				const viewsService = accessor.get(IViewsService);
				const viewDescriptorService = accessor.get(IViewDescriptorService);
				const configurationService = accessor.get(IConfigurationService);
				const layoutService = accessor.get(IWorkbenchLayoutService);

				await that.context.update({ triggered: true });

				showCopilotView(viewsService);
				ensureSideBarChatViewSize(400, viewDescriptorService, layoutService);

				configurationService.updateValue('chat.commandCenter.enabled', true);
			}
		}

		class ChatSetupHideAction extends Action2 {

			static readonly ID = 'workbench.action.chat.hideSetup';
			static readonly TITLE = localize2('hideChatSetup', "Hide Copilot");

			constructor() {
				super({
					id: ChatSetupHideAction.ID,
					title: ChatSetupHideAction.TITLE,
					f1: true,
					category: CHAT_CATEGORY,
					precondition: ContextKeyExpr.and(
						ChatContextKeys.Setup.installed.negate(),
						ContextKeyExpr.or(
							ChatContextKeys.Setup.entitled,
							ContextKeyExpr.has('config.chat.experimental.offerSetup')
						)
					),
					menu: {
						id: MenuId.ChatCommandCenter,
						group: 'z_hide',
						order: 1,
						when: ChatContextKeys.Setup.installed.negate()
					}
				});
			}

			override async run(accessor: ServicesAccessor): Promise<void> {
				const viewsDescriptorService = accessor.get(IViewDescriptorService);
				const layoutService = accessor.get(IWorkbenchLayoutService);
				const configurationService = accessor.get(IConfigurationService);
				const dialogService = accessor.get(IDialogService);

				const { confirmed } = await dialogService.confirm({
					message: localize('hideChatSetupConfirm', "Are you sure you want to hide Copilot?"),
					detail: localize('hideChatSetupDetail', "You can restore Copilot by running the '{0}' command.", ChatSetupTriggerAction.TITLE.value),
					primaryButton: localize('hideChatSetupButton', "Hide Copilot")
				});

				if (!confirmed) {
					return;
				}

				await hideSetupView(viewsDescriptorService, layoutService);

				configurationService.updateValue('chat.commandCenter.enabled', false);
			}
		}

		async function hideSetupView(viewsDescriptorService: IViewDescriptorService, layoutService: IWorkbenchLayoutService): Promise<void> {
			const location = viewsDescriptorService.getViewLocationById(ChatViewId);

			await that.context.update({ triggered: false });

			if (location === ViewContainerLocation.AuxiliaryBar) {
				const activeContainers = viewsDescriptorService.getViewContainersByLocation(location).filter(container => viewsDescriptorService.getViewContainerModel(container).activeViewDescriptors.length > 0);
				if (activeContainers.length === 0) {
					layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART); // hide if there are no views in the secondary sidebar
				}
			}
		}

		const outOfFreeChatResponses = localize('out of free chat responses', "You've run out of free chat responses, but free code completions are still available as part of the Copilot Free plan.");
		const outOfCompletions = localize('out of completions', "You've run out of free code completions, but free chat responses are still available as part of the Copilot Free plan.");
		const outOfLimits = localize('out of limits', "You've reached the limits of the Copilot Free plan.");
		const limitReset = localize('limit reset', "Your limits will reset on {0}.", 'January 13, 2025 at 3:35 PM');
		const upgradeToPro = localize('upgradeToPro', "Here's what you can expect when upgrading to Copilot Pro:\n- Unlimited code completions\n- Unlimited chat interactions\n- 30 day free trial");

		abstract class AbstractShowLimitReachedDialogAction extends Action2 {

			constructor(private readonly message: string, desc: Readonly<IAction2Options>) {
				super(desc);
			}

			override async run(accessor: ServicesAccessor, ...args: any[]) {
				const commandService = accessor.get(ICommandService);

				await accessor.get(IDialogService).prompt({
					type: 'none',
					message: localize('limit reached', "Copilot Free"),
					cancelButton: {
						label: localize('dismiss', "Dismiss"),
						run: () => { /* noop */ }
					},
					buttons: [
						{
							label: localize('managePlan', "Upgrade to Copilot Pro"),
							run: () => commandService.executeCommand('workbench.action.chat.managePlan')
						},
					],
					custom: {
						closeOnLinkClick: true,
						icon: Codicon.copilot,
						markdownDetails: [
							{ markdown: new MarkdownString(`${this.message} ${limitReset}`, true) },
							{ markdown: new MarkdownString(upgradeToPro, true) }
						]
					}
				});
			}
		}

		class ShowOutOfFreeChatResponsesDialogAction extends AbstractShowLimitReachedDialogAction {
			constructor() {
				super(outOfFreeChatResponses, {
					id: 'workbench.action.chat.showOutOfFreeChatResponsesDialog',
					title: localize2('showLimitReachedDialog', "Show Out of Free Chat Responses Dialog"),
					// f1: true,
					category: CHAT_CATEGORY
				});
			}
		}

		class ShowOutOfCompletionsDialogAction extends AbstractShowLimitReachedDialogAction {
			constructor() {
				super(outOfCompletions, {
					id: 'workbench.action.chat.showOutOfCompletions',
					title: localize2('showOutOfCompletions', "Show Out of Completions Dialog"),
					// f1: true,
					category: CHAT_CATEGORY
				});
			}
		}

		class ShowOutOfLimitsDialogAction extends AbstractShowLimitReachedDialogAction {
			constructor() {
				super(outOfLimits, {
					id: 'workbench.action.chat.showOutOfLimits',
					title: localize2('showOutOfLimits', "Show Out of Limits Dialog"),
					// f1: true,
					category: CHAT_CATEGORY
				});
			}
		}

		registerAction2(ChatSetupTriggerAction);
		registerAction2(ChatSetupHideAction);
		registerAction2(ShowOutOfFreeChatResponsesDialogAction);
		registerAction2(ShowOutOfCompletionsDialogAction);
		registerAction2(ShowOutOfLimitsDialogAction);
	}
}

//#endregion

//#region Chat Setup Request Service

type EntitlementClassification = {
	entitlement: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Flag indicating the chat entitlement state' };
	quotaChat: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of chat completions available to the user' };
	quotaCompletions: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of chat completions available to the user' };
	owner: 'bpasero';
	comment: 'Reporting chat setup entitlements';
};

type EntitlementEvent = {
	entitlement: ChatEntitlement;
	quotaChat: number | undefined;
	quotaCompletions: number | undefined;
};

interface IEntitlementsResponse {
	readonly access_type_sku: string;
	readonly assigned_date: string;
	readonly can_signup_for_limited: boolean;
	readonly chat_enabled: boolean;
	readonly limited_user_quotas?: {
		readonly chat: number;
		readonly completions: number;
	};
	readonly limited_user_reset_date: string;
}

interface IQuotas {
	readonly chat?: number;
	readonly completions?: number;
	readonly resetDate?: string;
}

interface IChatEntitlements {
	readonly entitlement: ChatEntitlement;
	readonly quotas?: IQuotas;
}

class ChatSetupRequests extends Disposable {

	private state: IChatEntitlements = { entitlement: this.context.state.entitlement };

	private pendingResolveCts = new CancellationTokenSource();
	private didResolveEntitlements = false;

	constructor(
		private readonly context: ChatSetupContext,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@ILogService private readonly logService: ILogService,
		@IRequestService private readonly requestService: IRequestService,
	) {
		super();

		this.registerListeners();

		this.resolve();
	}

	private registerListeners(): void {
		this._register(this.authenticationService.onDidChangeDeclaredProviders(() => this.resolve()));

		this._register(this.authenticationService.onDidChangeSessions(e => {
			if (e.providerId === defaultChat.providerId) {
				this.resolve();
			}
		}));

		this._register(this.authenticationService.onDidRegisterAuthenticationProvider(e => {
			if (e.id === defaultChat.providerId) {
				this.resolve();
			}
		}));

		this._register(this.authenticationService.onDidUnregisterAuthenticationProvider(e => {
			if (e.id === defaultChat.providerId) {
				this.resolve();
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
		let state: IChatEntitlements | undefined = undefined;
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
		const sessions = await this.authenticationService.getSessions(defaultChat.providerId);
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

	private scopesMatch(scopes: ReadonlyArray<string>, expectedScopes: string[]): boolean {
		return scopes.length === expectedScopes.length && expectedScopes.every(scope => scopes.includes(scope));
	}

	private async resolveEntitlement(session: AuthenticationSession, token: CancellationToken): Promise<ChatEntitlement | undefined> {
		const entitlements = await this.doResolveEntitlement(session, token);
		if (typeof entitlements?.entitlement === 'number' && !token.isCancellationRequested) {
			this.didResolveEntitlements = true;
			this.update(entitlements);
		}

		return entitlements?.entitlement;
	}

	private async doResolveEntitlement(session: AuthenticationSession, token: CancellationToken): Promise<IChatEntitlements | undefined> {
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

		const responseText = await asText(response);
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

		const entitlements: IChatEntitlements = {
			entitlement,
			quotas: {
				chat: entitlementsResponse.limited_user_quotas?.chat,
				completions: entitlementsResponse.limited_user_quotas?.completions,
				resetDate: entitlementsResponse.limited_user_reset_date
			}
		};

		this.logService.trace(`[chat setup] entitlement: resolved to ${entitlements.entitlement}, quotas: ${JSON.stringify(entitlements.quotas)}`);
		this.telemetryService.publicLog2<EntitlementEvent, EntitlementClassification>('chatInstallEntitlement', {
			entitlement: entitlements.entitlement,
			quotaChat: entitlementsResponse.limited_user_quotas?.chat,
			quotaCompletions: entitlementsResponse.limited_user_quotas?.completions
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
				headers: {
					'Authorization': `Bearer ${session.accessToken}`
				}
			}, token);
		} catch (error) {
			this.logService.error(`[chat setup] request: error ${error}`);

			return undefined;
		}
	}

	private update(state: IChatEntitlements): void {
		this.state = state;

		this.context.update({ entitlement: this.state.entitlement });
	}

	async forceResolveEntitlement(session: AuthenticationSession): Promise<ChatEntitlement | undefined> {
		return this.resolveEntitlement(session, CancellationToken.None);
	}

	async signUpLimited(session: AuthenticationSession): Promise<boolean> {
		const body = {
			restricted_telemetry: 'disabled',
			public_code_suggestions: 'enabled'
		};

		const response = await this.request(defaultChat.entitlementSignupLimitedUrl, 'POST', body, session, CancellationToken.None);
		if (!response) {
			this.logService.error('[chat setup] sign-up: no response');
			return false;
		}

		if (response.res.statusCode && response.res.statusCode !== 200) {
			this.logService.error(`[chat setup] sign-up: unexpected status code ${response.res.statusCode}`);
			return false;
		}

		const responseText = await asText(response);
		if (!responseText) {
			this.logService.error('[chat setup] sign-up: response has no content');
			return false;
		}

		let parsedResult: { subscribed: boolean } | undefined = undefined;
		try {
			parsedResult = JSON.parse(responseText);
			this.logService.trace(`[chat setup] sign-up: response is ${responseText}`);
		} catch (err) {
			this.logService.error(`[chat setup] sign-up: error parsing response (${err})`);
		}

		const subscribed = Boolean(parsedResult?.subscribed);
		if (subscribed) {
			this.logService.trace('[chat setup] sign-up: successfully subscribed');
		} else {
			this.logService.error('[chat setup] sign-up: not subscribed');
		}

		if (subscribed) {
			this.update({ entitlement: ChatEntitlement.Limited });
		}

		return subscribed;
	}

	override dispose(): void {
		this.pendingResolveCts.dispose(true);

		super.dispose();
	}
}

//#endregion

//#region Setup Rendering

type InstallChatClassification = {
	owner: 'bpasero';
	comment: 'Provides insight into chat installation.';
	installResult: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the extension was installed successfully, cancelled or failed to install.' };
	signedIn: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the user did sign in prior to installing the extension.' };
};
type InstallChatEvent = {
	installResult: 'installed' | 'cancelled' | 'failedInstall' | 'failedNotSignedIn';
	signedIn: boolean;
};

enum ChatSetupStep {
	Initial = 1,
	SigningIn,
	Installing
}

class ChatSetupController extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _step = ChatSetupStep.Initial;
	get step(): ChatSetupStep {
		return this._step;
	}

	constructor(
		private readonly context: ChatSetupContext,
		private readonly requests: ChatSetupRequests,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IViewsService private readonly viewsService: IViewsService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IProductService private readonly productService: IProductService,
		@ILogService private readonly logService: ILogService,
		@IProgressService private readonly progressService: IProgressService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IActivityService private readonly activityService: IActivityService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.context.onDidChange(() => this._onDidChange.fire()));
	}

	private setStep(step: ChatSetupStep): void {
		if (this._step === step) {
			return;
		}

		this._step = step;
		this._onDidChange.fire();
	}

	async setup(): Promise<void> {
		const title = localize('setupChatProgress', "Getting Copilot ready...");
		const badge = this.activityService.showViewContainerActivity(isCopilotEditsViewActive(this.viewsService) ? CHAT_EDITING_SIDEBAR_PANEL_ID : CHAT_SIDEBAR_PANEL_ID, {
			badge: new ProgressBadge(() => title),
			priority: 100
		});

		try {
			await this.progressService.withProgress({
				location: ProgressLocation.Window,
				command: TRIGGER_SETUP_COMMAND_ID,
				title,
			}, () => this.doSetup());
		} finally {
			badge.dispose();
		}
	}

	private async doSetup(): Promise<void> {
		this.context.suspend();  // reduces flicker
		try {
			let session: AuthenticationSession | undefined;
			let entitlement: ChatEntitlement | undefined;

			// Entitlement Unknown: we need to sign-in user
			if (this.context.state.entitlement === ChatEntitlement.Unknown) {
				this.setStep(ChatSetupStep.SigningIn);
				const result = await this.signIn();
				if (!result.session) {
					return; // user cancelled
				}

				session = result.session;
				entitlement = result.entitlement;
			}

			if (!session) {
				session = (await this.authenticationService.getSessions(defaultChat.providerId)).at(0);
				if (!session) {
					return; // unexpected
				}
			}

			// Install
			this.setStep(ChatSetupStep.Installing);
			await this.install(session, entitlement ?? this.context.state.entitlement);
		} finally {
			this.setStep(ChatSetupStep.Initial);
			this.context.resume();
		}
	}

	private async signIn(): Promise<{ session: AuthenticationSession | undefined; entitlement: ChatEntitlement | undefined }> {
		let session: AuthenticationSession | undefined;
		let entitlement: ChatEntitlement | undefined;
		try {
			showCopilotView(this.viewsService);
			session = await this.authenticationService.createSession(defaultChat.providerId, defaultChat.providerScopes[0]);
			entitlement = await this.requests.forceResolveEntitlement(session);
		} catch (error) {
			// noop
		}

		if (!session) {
			this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: 'failedNotSignedIn', signedIn: false });
		}

		return { session, entitlement };
	}

	private async install(session: AuthenticationSession, entitlement: ChatEntitlement): Promise<void> {
		const signedIn = !!session;
		const activeElement = getActiveElement();

		let installResult: 'installed' | 'cancelled' | 'failedInstall' | undefined = undefined;
		const wasInstalled = this.context.state.installed;
		let didSignUp = false;
		try {
			showCopilotView(this.viewsService);

			if (entitlement !== ChatEntitlement.Limited && entitlement !== ChatEntitlement.Pro && entitlement !== ChatEntitlement.Unavailable) {
				didSignUp = await this.requests.signUpLimited(session);
			}

			await this.extensionsWorkbenchService.install(defaultChat.extensionId, {
				enable: true,
				isMachineScoped: false,
				installEverywhere: true,
				installPreReleaseVersion: this.productService.quality !== 'stable'
			}, isCopilotEditsViewActive(this.viewsService) ? EditsViewId : ChatViewId);

			installResult = 'installed';
		} catch (error) {
			this.logService.error(`[chat setup] install: error ${error}`);

			installResult = isCancellationError(error) ? 'cancelled' : 'failedInstall';
		} finally {
			if (wasInstalled && didSignUp) {
				this.commandService.executeCommand('github.copilot.refreshToken'); // ugly, but we need to signal to the extension that sign-up happened
			}

			if (installResult === 'installed') {
				await Promise.race([
					timeout(5000), 												// helps prevent flicker with sign-in welcome view
					Event.toPromise(this.chatAgentService.onDidChangeAgents)	// https://github.com/microsoft/vscode-copilot/issues/9274
				]);
			}
		}

		this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult, signedIn });

		if (activeElement === getActiveElement()) {
			(await showCopilotView(this.viewsService))?.focusInput();
		}
	}
}

class ChatSetupWelcomeContent extends Disposable {

	readonly element = $('.chat-setup-view');

	constructor(
		private readonly controller: ChatSetupController,
		private readonly context: ChatSetupContext,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super();

		this.create();
	}

	private create(): void {
		const markdown = this._register(this.instantiationService.createInstance(MarkdownRenderer, {}));

		// Header
		{
			const header = localize({ key: 'setupHeader', comment: ['{Locked="[Copilot]({0})"}'] }, "[Copilot]({0} 'Copilot') is your AI pair programmer.", this.context.state.installed ? 'command:github.copilot.open.walkthrough' : defaultChat.documentationUrl);
			this.element.appendChild($('p')).appendChild(this._register(markdown.render(new MarkdownString(header, { isTrusted: true }))).element);

			const features = this.element.appendChild($('div.chat-features-container'));
			this.element.appendChild(features);

			const featureChatContainer = features.appendChild($('div.chat-feature-container'));
			featureChatContainer.appendChild(renderIcon(Codicon.code));

			const featureChatLabel = featureChatContainer.appendChild($('span'));
			featureChatLabel.textContent = localize('featureChat', "Code faster with completions and Inline Chat");

			const featureEditsContainer = features.appendChild($('div.chat-feature-container'));
			featureEditsContainer.appendChild(renderIcon(Codicon.editSession));

			const featureEditsLabel = featureEditsContainer.appendChild($('span'));
			featureEditsLabel.textContent = localize('featureEdits', "Build features and resolve bugs with Copilot Edits");

			const featureExploreContainer = features.appendChild($('div.chat-feature-container'));
			featureExploreContainer.appendChild(renderIcon(Codicon.commentDiscussion));

			const featureExploreLabel = featureExploreContainer.appendChild($('span'));
			featureExploreLabel.textContent = localize('featureExplore', "Explore your codebase with chat");
		}

		// Limited SKU
		const limitedSkuHeader = localize({ key: 'limitedSkuHeader', comment: ['{Locked="[]({0})"}'] }, "$(sparkle-filled) We now offer [Copilot for free]({0}).", defaultChat.skusDocumentationUrl);
		const limitedSkuHeaderContainer = this.element.appendChild($('p'));
		limitedSkuHeaderContainer.appendChild(this._register(markdown.render(new MarkdownString(limitedSkuHeader, { isTrusted: true, supportThemeIcons: true }))).element);

		// Terms
		const terms = localize({ key: 'termsLabel', comment: ['{Locked="["}', '{Locked="]({0})"}', '{Locked="]({1})"}'] }, "By continuing, you agree to our [Terms]({0}) and [Privacy Policy]({1}).", defaultChat.termsStatementUrl, defaultChat.privacyStatementUrl);
		this.element.appendChild($('p')).appendChild(this._register(markdown.render(new MarkdownString(terms, { isTrusted: true }))).element);

		// Setup Button
		const actions: IAction[] = [];
		if (this.context.state.installed) {
			actions.push(toAction({ id: 'chatSetup.signInGh', label: localize('signInGh', "Sign in with a GitHub.com Account"), run: () => this.commandService.executeCommand('github.copilotChat.signIn') }));
			actions.push(toAction({ id: 'chatSetup.signInGhe', label: localize('signInGhe', "Sign in with a GHE.com Account"), run: () => this.commandService.executeCommand('github.copilotChat.signInGHE') }));
		}
		const buttonContainer = this.element.appendChild($('p'));
		const button = this._register(actions.length === 0 ? new Button(buttonContainer, {
			supportIcons: true,
			...defaultButtonStyles
		}) : new ButtonWithDropdown(buttonContainer, {
			actions,
			addPrimaryActionToDropdown: false,
			contextMenuProvider: this.contextMenuService,
			supportIcons: true,
			...defaultButtonStyles
		}));
		this._register(button.onDidClick(() => this.controller.setup()));

		// Update based on model state
		this._register(Event.runAndSubscribe(this.controller.onDidChange, () => this.update(limitedSkuHeaderContainer, button)));
	}

	private update(limitedSkuHeaderContainer: HTMLElement, button: Button | ButtonWithDropdown): void {
		let showLimitedSkuHeader: boolean;
		let buttonLabel: string;

		switch (this.context.state.entitlement) {
			case ChatEntitlement.Unknown:
				showLimitedSkuHeader = true;
				buttonLabel = this.context.state.registered ? localize('signUp', "Sign in to Use Copilot") : localize('signUpFree', "Sign in to Use Copilot for Free");
				break;
			case ChatEntitlement.Unresolved:
			case ChatEntitlement.Available:
			case ChatEntitlement.Limited:
				showLimitedSkuHeader = true;
				buttonLabel = this.context.state.registered ? localize('startUp', "Use Copilot") : localize('startUpLimited', "Use Copilot for Free");
				break;
			case ChatEntitlement.Pro:
			case ChatEntitlement.Unavailable:
				showLimitedSkuHeader = false;
				buttonLabel = localize('startUp', "Use Copilot");
				break;
		}

		switch (this.controller.step) {
			case ChatSetupStep.Initial:
				// do not override
				break;
			case ChatSetupStep.SigningIn:
				buttonLabel = localize('setupChatSignIn', "$(loading~spin) Signing in to {0}...", defaultChat.providerName);
				break;
			case ChatSetupStep.Installing:
				buttonLabel = localize('setupChatInstalling', "$(loading~spin) Getting Copilot Ready...");
				break;
		}

		setVisibility(showLimitedSkuHeader, limitedSkuHeaderContainer);

		button.label = buttonLabel;
		button.enabled = this.controller.step === ChatSetupStep.Initial;
	}
}

//#endregion

//#region Context

function isCopilotEditsViewActive(viewsService: IViewsService): boolean {
	return viewsService.getFocusedView()?.id === EditsViewId;
}

function showCopilotView(viewsService: IViewsService): Promise<IChatWidget | undefined> {
	if (isCopilotEditsViewActive(viewsService)) {
		return showEditsView(viewsService);
	} else {
		return showChatView(viewsService);
	}
}

interface IChatSetupContextState {
	entitlement: ChatEntitlement;
	triggered?: boolean;
	installed?: boolean;
	registered?: boolean;
}

class ChatSetupContext extends Disposable {

	private static readonly CHAT_SETUP_CONTEXT_STORAGE_KEY = 'chat.setupContext';

	private readonly canSignUpContextKey = ChatContextKeys.Setup.canSignUp.bindTo(this.contextKeyService);
	private readonly signedOutContextKey = ChatContextKeys.Setup.signedOut.bindTo(this.contextKeyService);
	private readonly entitledContextKey = ChatContextKeys.Setup.entitled.bindTo(this.contextKeyService);
	private readonly limitedContextKey = ChatContextKeys.Setup.limited.bindTo(this.contextKeyService);
	private readonly triggeredContext = ChatContextKeys.Setup.triggered.bindTo(this.contextKeyService);
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
		@IExtensionService private readonly extensionService: IExtensionService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService
	) {
		super();

		this.checkExtensionInstallation();
		this.updateContext();
	}

	private async checkExtensionInstallation(): Promise<void> {
		this._register(this.extensionService.onDidChangeExtensions(result => {
			for (const extension of result.removed) {
				if (ExtensionIdentifier.equals(defaultChat.extensionId, extension.identifier)) {
					this.update({ installed: false });
					break;
				}
			}

			for (const extension of result.added) {
				if (ExtensionIdentifier.equals(defaultChat.extensionId, extension.identifier)) {
					this.update({ installed: true });
					break;
				}
			}
		}));

		const extensions = await this.extensionManagementService.getInstalled();
		const defaultChatExtension = extensions.find(value => ExtensionIdentifier.equals(value.identifier.id, defaultChat.extensionId));
		this.update({ installed: !!defaultChatExtension && this.extensionEnablementService.isEnabled(defaultChatExtension) });
	}

	update(context: { installed: boolean }): Promise<void>;
	update(context: { triggered: boolean }): Promise<void>;
	update(context: { entitlement: ChatEntitlement }): Promise<void>;
	update(context: { installed?: boolean; triggered?: boolean; entitlement?: ChatEntitlement }): Promise<void> {
		if (typeof context.installed === 'boolean') {
			this._state.installed = context.installed;

			if (context.installed) {
				context.triggered = true; // allows to fallback to setup view if the extension is uninstalled
			}
		}

		if (typeof context.triggered === 'boolean') {
			this._state.triggered = context.triggered;
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

		if (this._state.triggered && !this._state.installed) {
			// this is ugly but fixes flicker from a previous chat install
			this.storageService.remove('chat.welcomeMessageContent.panel', StorageScope.APPLICATION);
			this.storageService.remove('interactive.sessions', this.workspaceContextService.getWorkspace().folders.length ? StorageScope.WORKSPACE : StorageScope.APPLICATION);
		}

		let changed = false;
		changed = this.updateContextKey(this.signedOutContextKey, this._state.entitlement === ChatEntitlement.Unknown) || changed;
		changed = this.updateContextKey(this.canSignUpContextKey, this._state.entitlement === ChatEntitlement.Available) || changed;
		changed = this.updateContextKey(this.limitedContextKey, this._state.entitlement === ChatEntitlement.Limited) || changed;
		changed = this.updateContextKey(this.entitledContextKey, this._state.entitlement === ChatEntitlement.Pro) || changed;
		changed = this.updateContextKey(this.triggeredContext, !!this._state.triggered) || changed;
		changed = this.updateContextKey(this.installedContext, !!this._state.installed) || changed;

		if (changed) {
			this._onDidChange.fire();
		}
	}

	private updateContextKey(contextKey: IContextKey<boolean>, value: boolean): boolean {
		const current = contextKey.get();
		contextKey.set(value);

		return current !== value;
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

registerWorkbenchContribution2('workbench.chat.setup', ChatSetupContribution, WorkbenchPhase.BlockRestore);
