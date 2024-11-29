/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatViewSetup.css';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ITelemetryService, TelemetryLevel } from '../../../../platform/telemetry/common/telemetry.js';
import { AuthenticationSession, IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IRequestService, asText } from '../../../../platform/request/common/request.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IRequestContext } from '../../../../base/parts/request/common/request.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { showChatView, ChatViewId, showEditsView, IChatWidget, EditsViewId } from './chat.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import product from '../../../../platform/product/common/product.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IChatViewsWelcomeContributionRegistry, ChatViewsWelcomeExtensions } from './viewsWelcome/chatViewsWelcome.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../common/views.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { $, addDisposableListener, EventType, getActiveElement, setVisibility } from '../../../../base/browser/dom.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { defaultButtonStyles, defaultCheckboxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { MarkdownRenderer } from '../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { Barrier, timeout } from '../../../../base/common/async.js';
import { IChatAgentService } from '../common/chatAgents.js';
import { IActivityService, ProgressBadge } from '../../../services/activity/common/activity.js';
import { CHAT_EDITING_SIDEBAR_PANEL_ID, CHAT_SIDEBAR_PANEL_ID } from './chatViewPane.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { CHAT_CATEGORY } from './actions/chatActions.js';

const defaultChat = {
	extensionId: product.defaultChatAgent?.extensionId ?? '',
	chatExtensionId: product.defaultChatAgent?.chatExtensionId ?? '',
	name: product.defaultChatAgent?.name ?? '',
	icon: Codicon[product.defaultChatAgent?.icon as keyof typeof Codicon ?? 'commentDiscussion'],
	chatWelcomeTitle: product.defaultChatAgent?.chatWelcomeTitle ?? '',
	documentationUrl: product.defaultChatAgent?.documentationUrl ?? '',
	privacyStatementUrl: product.defaultChatAgent?.privacyStatementUrl ?? '',
	skusDocumentationUrl: product.defaultChatAgent?.skusDocumentationUrl ?? '',
	publicCodeMatchesUrl: product.defaultChatAgent?.publicCodeMatchesUrl ?? '',
	providerId: product.defaultChatAgent?.providerId ?? '',
	providerName: product.defaultChatAgent?.providerName ?? '',
	providerScopes: product.defaultChatAgent?.providerScopes ?? [[]],
	entitlementUrl: product.defaultChatAgent?.entitlementUrl ?? '',
	entitlementChatEnabled: product.defaultChatAgent?.entitlementChatEnabled ?? '',
	entitlementSignupLimitedUrl: product.defaultChatAgent?.entitlementSignupLimitedUrl ?? '',
	entitlementCanSignupLimited: product.defaultChatAgent?.entitlementCanSignupLimited ?? '',
	entitlementSkuType: product.defaultChatAgent?.entitlementSkuType ?? '',
	entitlementSkuTypeLimited: product.defaultChatAgent?.entitlementSkuTypeLimited ?? '',
	entitlementSkuTypeLimitedName: product.defaultChatAgent?.entitlementSkuTypeLimitedName ?? ''
};

enum ChatEntitlement {
	/** Signed out */
	Unknown = 1,
	/** Signed in but not yet resolved if Sign-up possible */
	Unresolved,
	/** Signed in and entitled to Sign-up */
	Available,
	/** Signed in but not entitled to Sign-up */
	Unavailable
}

//#region Contribution

class ChatSetupContribution extends Disposable implements IWorkbenchContribution {

	private readonly chatSetupContext = this._register(this.instantiationService.createInstance(ChatSetupContext));
	private readonly entitlementsResolver = this._register(this.instantiationService.createInstance(ChatSetupEntitlementResolver, this.chatSetupContext));
	private readonly chatSetupController = this._register(this.instantiationService.createInstance(ChatSetupController, this.entitlementsResolver, this.chatSetupContext));

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
			title: defaultChat.chatWelcomeTitle,
			when: ContextKeyExpr.or(
				ContextKeyExpr.and(
					ChatContextKeys.Setup.triggered,
					ChatContextKeys.Setup.installed.negate()
				)!,
				ContextKeyExpr.and(
					ChatContextKeys.Setup.canSignUp,
					ChatContextKeys.Setup.installed
				)!
			)!,
			icon: defaultChat.icon,
			content: disposables => disposables.add(this.instantiationService.createInstance(ChatSetupWelcomeContent, this.chatSetupController)).element,
		});
	}

	private registerActions(): void {
		const that = this;

		class ChatSetupTriggerAction extends Action2 {

			static readonly ID = TRIGGER_SETUP_COMMAND_ID;
			static readonly TITLE = localize2('triggerChatSetup', "Use AI features with {0}...", defaultChat.name);

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

				await that.chatSetupContext.update({ triggered: true });

				showCopilotView(viewsService);

				const location = viewDescriptorService.getViewLocationById(ChatViewId);
				if (location !== ViewContainerLocation.Panel) {
					const viewPart = location === ViewContainerLocation.Sidebar ? Parts.SIDEBAR_PART : Parts.AUXILIARYBAR_PART;
					const partSize = layoutService.getSize(viewPart);
					if (partSize.width < 350) {
						layoutService.setSize(viewPart, { width: 350, height: partSize.height });
					}
				}

				configurationService.updateValue('chat.commandCenter.enabled', true);
			}
		}

		class ChatSetupHideAction extends Action2 {

			static readonly ID = 'workbench.action.chat.hideSetup';
			static readonly TITLE = localize2('hideChatSetup', "Hide {0}", defaultChat.name);

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
					message: localize('hideChatSetupConfirm', "Are you sure you want to hide {0}?", defaultChat.name),
					detail: localize('hideChatSetupDetail', "You can restore it by running the '{0}' command.", ChatSetupTriggerAction.TITLE.value),
					primaryButton: localize('hideChatSetupButton', "Hide {0}", defaultChat.name)
				});

				if (!confirmed) {
					return;
				}

				const location = viewsDescriptorService.getViewLocationById(ChatViewId);

				await that.chatSetupContext.update({ triggered: false });

				if (location === ViewContainerLocation.AuxiliaryBar) {
					const activeContainers = viewsDescriptorService.getViewContainersByLocation(location).filter(container => viewsDescriptorService.getViewContainerModel(container).activeViewDescriptors.length > 0);
					if (activeContainers.length === 0) {
						layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART); // hide if there are no views in the secondary sidebar
					}
				}

				configurationService.updateValue('chat.commandCenter.enabled', false);
			}
		}

		registerAction2(ChatSetupTriggerAction);
		registerAction2(ChatSetupHideAction);
	}
}

//#endregion

//#region Entitlements Resolver

type ChatSetupEntitlementClassification = {
	entitlement: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Flag indicating the chat entitlement state' };
	entitled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Flag indicating if the user is chat setup entitled' };
	limited: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Flag indicating if the user is chat setup limited' };
	owner: 'bpasero';
	comment: 'Reporting chat setup entitlements';
};

type ChatSetupEntitlementEvent = {
	entitlement: ChatEntitlement;
	entitled: boolean;
	limited: boolean;
};

interface IResolvedEntitlements {
	readonly entitlement: ChatEntitlement;
	readonly entitled: boolean;
	readonly limited: boolean;
}

const TRIGGER_SETUP_COMMAND_ID = 'workbench.action.chat.triggerSetup';

class ChatSetupEntitlementResolver extends Disposable {

	private _entitlement = ChatEntitlement.Unknown;
	get entitlement() { return this._entitlement; }

	private readonly _onDidChangeEntitlement = this._register(new Emitter<ChatEntitlement>());
	readonly onDidChangeEntitlement = this._onDidChangeEntitlement.event;

	private pendingResolveCts = new CancellationTokenSource();
	private resolvedEntitlements: IResolvedEntitlements | undefined = undefined;

	private entitlementsUpdateBarrier: Barrier | undefined = undefined;

	constructor(
		private readonly chatSetupContext: ChatSetupContext,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
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
		if (session) {
			this.update(this.resolvedEntitlements ?? { entitlement: ChatEntitlement.Unresolved, limited: false, entitled: false });
		} else {
			this.resolvedEntitlements = undefined; // reset resolved entitlement when there is no session
			this.update({ entitlement: ChatEntitlement.Unknown, limited: false, entitled: false });
		}

		if (session && typeof this.resolvedEntitlements === 'undefined') {
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
		const resolvedEntitlements = await this.doResolveEntitlement(session, token);
		if (typeof resolvedEntitlements?.entitlement === 'number' && !token.isCancellationRequested) {
			this.resolvedEntitlements = resolvedEntitlements;
			this.update(resolvedEntitlements);
		}

		return resolvedEntitlements?.entitlement;
	}

	private async doResolveEntitlement(session: AuthenticationSession, token: CancellationToken): Promise<IResolvedEntitlements | undefined> {
		if (token.isCancellationRequested) {
			return undefined;
		}

		const response = await this.instantiationService.invokeFunction(accessor => ChatSetupRequestHelper.request(accessor, defaultChat.entitlementUrl, 'GET', undefined, session, token));
		if (token.isCancellationRequested) {
			return undefined;
		}

		if (!response) {
			this.logService.trace('[chat setup] entitlement: no response');
			return { entitlement: ChatEntitlement.Unresolved, limited: false, entitled: false };
		}

		if (response.res.statusCode && response.res.statusCode !== 200) {
			this.logService.trace(`[chat setup] entitlement: unexpected status code ${response.res.statusCode}`);
			return { entitlement: ChatEntitlement.Unresolved, limited: false, entitled: false };
		}

		const responseText = await asText(response);
		if (token.isCancellationRequested) {
			return undefined;
		}

		if (!responseText) {
			this.logService.trace('[chat setup] entitlement: response has no content');
			return { entitlement: ChatEntitlement.Unresolved, limited: false, entitled: false };
		}

		let parsedResult: any;
		try {
			parsedResult = JSON.parse(responseText);
			this.logService.trace(`[chat setup] entitlement: parsed result is ${JSON.stringify(parsedResult)}`);
		} catch (err) {
			this.logService.trace(`[chat setup] entitlement: error parsing response (${err})`);
			return { entitlement: ChatEntitlement.Unresolved, limited: false, entitled: false };
		}

		const result = {
			entitlement: Boolean(parsedResult[defaultChat.entitlementCanSignupLimited]) ? ChatEntitlement.Available : ChatEntitlement.Unavailable,
			entitled: Boolean(parsedResult[defaultChat.entitlementChatEnabled]),
			limited: Boolean(parsedResult[defaultChat.entitlementSkuType] === defaultChat.entitlementSkuTypeLimited)
		};

		this.logService.trace(`[chat setup] entitlement: resolved to ${result.entitlement}, entitled: ${result.entitled}, limited: ${result.limited}`);
		this.telemetryService.publicLog2<ChatSetupEntitlementEvent, ChatSetupEntitlementClassification>('chatInstallEntitlement', result);

		return result;
	}

	private async update({ entitlement: newEntitlement, limited, entitled }: IResolvedEntitlements): Promise<void> {
		await this.entitlementsUpdateBarrier?.wait();

		const oldEntitlement = this._entitlement;
		this._entitlement = newEntitlement;

		this.chatSetupContext.update({
			signedOut: newEntitlement === ChatEntitlement.Unknown,
			canSignUp: newEntitlement === ChatEntitlement.Available,
			limited,
			entitled
		});

		if (oldEntitlement !== this._entitlement) {
			this._onDidChangeEntitlement.fire(this._entitlement);
		}
	}

	async forceResolveEntitlement(session: AuthenticationSession): Promise<ChatEntitlement | undefined> {
		return this.resolveEntitlement(session, CancellationToken.None);
	}

	suspend(): void {
		this.entitlementsUpdateBarrier = new Barrier();
	}

	resume(): void {
		this.entitlementsUpdateBarrier?.open();
		this.entitlementsUpdateBarrier = undefined;
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

	get entitlement(): ChatEntitlement {
		return this.entitlementResolver.entitlement;
	}

	get canSignUpLimited(): boolean {
		return this.entitlement === ChatEntitlement.Available || // user can sign up for limited
			this.entitlement === ChatEntitlement.Unresolved;	 // user unresolved, play safe and allow
	}

	constructor(
		private readonly entitlementResolver: ChatSetupEntitlementResolver,
		private readonly chatSetupContext: ChatSetupContext,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
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
		this._register(this.entitlementResolver.onDidChangeEntitlement(() => this._onDidChange.fire()));
	}

	setStep(step: ChatSetupStep): void {
		if (this._step === step) {
			return;
		}

		this._step = step;
		this._onDidChange.fire();
	}

	async setup(enableTelemetry: boolean, enableDetection: boolean): Promise<void> {
		const title = localize('setupChatProgress', "Getting {0} ready...", defaultChat.name);
		const badge = this.activityService.showViewContainerActivity(isCopilotEditsViewActive(this.viewsService) ? CHAT_EDITING_SIDEBAR_PANEL_ID : CHAT_SIDEBAR_PANEL_ID, {
			badge: new ProgressBadge(() => title),
			priority: 100
		});

		try {
			await this.progressService.withProgress({
				location: ProgressLocation.Window,
				command: TRIGGER_SETUP_COMMAND_ID,
				title,
			}, () => this.doSetup(enableTelemetry, enableDetection));
		} finally {
			badge.dispose();
		}
	}

	private async doSetup(enableTelemetry: boolean, enableDetection: boolean): Promise<void> {
		try {
			let session: AuthenticationSession | undefined;

			// Entitlement Unknown: we need to sign-in user
			if (this.entitlement === ChatEntitlement.Unknown) {
				this.setStep(ChatSetupStep.SigningIn);
				session = await this.signIn();
				if (!session) {
					return; // user cancelled
				}

				const entitlement = await this.entitlementResolver.forceResolveEntitlement(session);
				if (entitlement !== ChatEntitlement.Unavailable) {
					return; // we cannot proceed with automated install because user needs to sign-up in a second step
				}
			}

			// Entitlement known: proceed with installation
			if (!session) {
				session = (await this.authenticationService.getSessions(defaultChat.providerId)).at(0);
				if (!session) {
					return; // unexpected
				}
			}
			this.setStep(ChatSetupStep.Installing);
			await this.install(session, enableTelemetry, enableDetection);
		} finally {
			this.setStep(ChatSetupStep.Initial);
		}
	}

	private async signIn(): Promise<AuthenticationSession | undefined> {
		let session: AuthenticationSession | undefined;
		try {
			showCopilotView(this.viewsService);
			session = await this.authenticationService.createSession(defaultChat.providerId, defaultChat.providerScopes[0]);
		} catch (error) {
			// noop
		}

		if (!session) {
			this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: 'failedNotSignedIn', signedIn: false });
		}

		return session;
	}

	private async install(session: AuthenticationSession, enableTelemetry: boolean, enableDetection: boolean): Promise<void> {
		const signedIn = !!session;
		const activeElement = getActiveElement();

		let installResult: 'installed' | 'cancelled' | 'failedInstall' | undefined = undefined;
		const wasInstalled = this.chatSetupContext.getContext().installed;
		let didSignUp = false;
		try {
			showCopilotView(this.viewsService);

			this.chatSetupContext.suspend(); 	// reduces
			this.entitlementResolver.suspend(); // flicker

			if (this.canSignUpLimited) {
				didSignUp = await this.signUpLimited(session, enableTelemetry, enableDetection);
			} else {
				this.logService.trace('[chat setup] install: not signing up to limited SKU');
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

			this.chatSetupContext.resume();
			this.entitlementResolver.resume();
		}

		this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult, signedIn });

		if (activeElement === getActiveElement()) {
			(await showCopilotView(this.viewsService))?.focusInput();
		}
	}

	private async signUpLimited(session: AuthenticationSession, enableTelemetry: boolean, enableDetection: boolean): Promise<boolean> {
		const body = {
			restricted_telemetry: enableTelemetry ? 'enabled' : 'disabled',
			public_code_suggestions: enableDetection ? 'enabled' : 'disabled'
		};
		this.logService.trace(`[chat setup] sign-up: options ${JSON.stringify(body)}`);

		const response = await this.instantiationService.invokeFunction(accessor => ChatSetupRequestHelper.request(accessor, defaultChat.entitlementSignupLimitedUrl, 'POST', body, session, CancellationToken.None));
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

		this.chatSetupContext.update({ signedOut: false, entitled: false, limited: subscribed, canSignUp: !subscribed });

		return subscribed;
	}
}

class ChatSetupWelcomeContent extends Disposable {

	readonly element = $('.chat-setup-view');

	constructor(
		private readonly controller: ChatSetupController,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

		this.create();
	}

	private create(): void {
		const markdown = this._register(this.instantiationService.createInstance(MarkdownRenderer, {}));

		// Header
		const header = localize({ key: 'setupHeader', comment: ['{Locked="[{0}]({1})"}'] }, "[{0}]({1}) is your AI pair programmer that provides code suggestions, edits across your project, and answers to your questions.", defaultChat.name, defaultChat.documentationUrl);
		this.element.appendChild($('p')).appendChild(this._register(markdown.render(new MarkdownString(header, { isTrusted: true }))).element);

		const limitedSkuHeader = localize({ key: 'limitedSkuHeader', comment: ['{Locked="[{0}]({1})"}'] }, "Enable powerful AI features for free with the [{0}]({1}) plan.", defaultChat.entitlementSkuTypeLimitedName, defaultChat.skusDocumentationUrl);
		const limitedSkuHeaderElement = this.element.appendChild($('p')).appendChild(this._register(markdown.render(new MarkdownString(limitedSkuHeader, { isTrusted: true }))).element);

		// Limited SKU Sign-up
		const telemetryLabel = localize('telemetryLabel', "Allow {0} to use my data, including prompts, suggestions, and code snippets, for product improvements", defaultChat.providerName);
		const { container: telemetryContainer, checkbox: telemetryCheckbox } = this.createCheckBox(telemetryLabel, this.telemetryService.telemetryLevel === TelemetryLevel.NONE ? false : true, markdown);

		const detectionLabel = localize('detectionLabel', "Allow code suggestions that [match public code]({0})", defaultChat.publicCodeMatchesUrl);
		const { container: detectionContainer, checkbox: detectionCheckbox } = this.createCheckBox(detectionLabel, true, markdown);

		// Terms
		const terms = localize({ key: 'termsLabel', comment: ['{Locked="["}', '{Locked="]({0})"}'] }, "By proceeding you agree to our [privacy statement]({0}).", defaultChat.privacyStatementUrl);
		this.element.appendChild($('p')).appendChild(this._register(markdown.render(new MarkdownString(terms, { isTrusted: true }))).element);

		// Setup Button
		const buttonRow = this.element.appendChild($('p'));
		const button = this._register(new Button(buttonRow, { ...defaultButtonStyles, supportIcons: true }));
		this._register(button.onDidClick(() => this.controller.setup(telemetryCheckbox.checked, detectionCheckbox.checked)));

		// Update based on model state
		this._register(Event.runAndSubscribe(this.controller.onDidChange, () => this.update(limitedSkuHeaderElement, [telemetryContainer, detectionContainer], [telemetryCheckbox, detectionCheckbox], button)));
	}

	private createCheckBox(label: string, checked: boolean, markdown: MarkdownRenderer): { container: HTMLElement; checkbox: Checkbox } {
		const container = this.element.appendChild($('p.checkbox-container'));
		const checkbox = this._register(new Checkbox(label, checked, defaultCheckboxStyles));
		container.appendChild(checkbox.domNode);

		const checkboxLabel = container.appendChild(this._register(markdown.render(new MarkdownString(label, { isTrusted: true, supportThemeIcons: true }), { inline: true, className: 'checkbox-label' })).element);
		this._register(addDisposableListener(checkboxLabel, EventType.CLICK, e => {
			if (checkbox?.enabled && (e.target as HTMLElement).tagName !== 'A') {
				checkbox.checked = !checkbox.checked;
				checkbox.focus();
			}
		}));

		return { container, checkbox };
	}

	private update(limitedSkuHeaderElement: HTMLElement, limitedCheckboxContainers: HTMLElement[], limitedCheckboxes: Checkbox[], button: Button): void {
		setVisibility(this.controller.canSignUpLimited || this.controller.entitlement === ChatEntitlement.Unknown, limitedSkuHeaderElement);
		setVisibility(this.controller.canSignUpLimited, ...limitedCheckboxContainers);

		switch (this.controller.step) {
			case ChatSetupStep.Initial:
				for (const checkbox of limitedCheckboxes) {
					checkbox.enable();
				}

				button.enabled = true;
				button.label = this.controller.canSignUpLimited ?
					localize('startSetupLimited', "Start Using {0}", defaultChat.entitlementSkuTypeLimitedName) : this.controller.entitlement === ChatEntitlement.Unknown ?
						localize('signInToStartSetup', "Sign in to Start") :
						localize('startSetupLimited', "Start Using {0}", defaultChat.name);
				break;
			case ChatSetupStep.SigningIn:
			case ChatSetupStep.Installing:
				for (const checkbox of limitedCheckboxes) {
					checkbox.disable();
				}

				button.enabled = false;
				button.label = this.controller.step === ChatSetupStep.SigningIn ?
					localize('setupChatSigningIn', "$(loading~spin) Signing in to {0}...", defaultChat.providerName) :
					localize('setupChatInstalling', "$(loading~spin) Getting {0} ready...", defaultChat.name);

				break;
		}
	}
}

//#endregion

//#region Helpers

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

class ChatSetupRequestHelper {

	static async request(accessor: ServicesAccessor, url: string, type: 'GET', body: undefined, session: AuthenticationSession, token: CancellationToken): Promise<IRequestContext | undefined>;
	static async request(accessor: ServicesAccessor, url: string, type: 'POST', body: object, session: AuthenticationSession, token: CancellationToken): Promise<IRequestContext | undefined>;
	static async request(accessor: ServicesAccessor, url: string, type: 'GET' | 'POST', body: object | undefined, session: AuthenticationSession, token: CancellationToken): Promise<IRequestContext | undefined> {
		const requestService = accessor.get(IRequestService);
		const logService = accessor.get(ILogService);

		try {
			return await requestService.request({
				type,
				url,
				data: type === 'POST' ? JSON.stringify(body) : undefined,
				headers: {
					'Authorization': `Bearer ${session.accessToken}`
				}
			}, token);
		} catch (error) {
			logService.error(`[chat setup] request: error ${error}`);

			return undefined;
		}
	}
}

class ChatSetupContext extends Disposable {

	private static readonly CHAT_SETUP_TRIGGERD = 'chat.setupTriggered';
	private static readonly CHAT_EXTENSION_INSTALLED = 'chat.extensionInstalled';

	private readonly canSignUpContextKey = ChatContextKeys.Setup.canSignUp.bindTo(this.contextKeyService);
	private readonly signedOutContextKey = ChatContextKeys.Setup.signedOut.bindTo(this.contextKeyService);
	private readonly entitledContextKey = ChatContextKeys.Setup.entitled.bindTo(this.contextKeyService);
	private readonly limitedContextKey = ChatContextKeys.Setup.limited.bindTo(this.contextKeyService);
	private readonly triggeredContext = ChatContextKeys.Setup.triggered.bindTo(this.contextKeyService);
	private readonly installedContext = ChatContextKeys.Setup.installed.bindTo(this.contextKeyService);

	private canSignUp = false;
	private signedOut = false;
	private entitled = false;
	private limited = false;
	private triggered = this.storageService.getBoolean(ChatSetupContext.CHAT_SETUP_TRIGGERD, StorageScope.PROFILE, false);
	private installed = this.storageService.getBoolean(ChatSetupContext.CHAT_EXTENSION_INSTALLED, StorageScope.PROFILE, false);

	private contextKeyUpdateBarrier: Barrier | undefined = undefined;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService
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
		this.update({ installed: !!extensions.find(value => ExtensionIdentifier.equals(value.identifier.id, defaultChat.extensionId)) });
	}

	update(context: { installed: boolean }): Promise<void>;
	update(context: { triggered: boolean }): Promise<void>;
	update(context: { signedOut: boolean; limited: boolean; entitled: boolean; canSignUp: boolean }): Promise<void>;
	update(context: { installed?: boolean; triggered?: boolean; signedOut?: boolean; limited?: boolean; entitled?: boolean; canSignUp?: boolean }): Promise<void> {
		if (typeof context.installed === 'boolean') {
			this.installed = context.installed;
			this.storageService.store(ChatSetupContext.CHAT_EXTENSION_INSTALLED, context.installed, StorageScope.PROFILE, StorageTarget.MACHINE);

			if (context.installed) {
				context.triggered = true; // allows to fallback to setup view if the extension is uninstalled
			}
		}

		if (typeof context.triggered === 'boolean') {
			this.triggered = context.triggered;
			if (context.triggered) {
				this.storageService.store(ChatSetupContext.CHAT_SETUP_TRIGGERD, true, StorageScope.PROFILE, StorageTarget.MACHINE);
			} else {
				this.storageService.remove(ChatSetupContext.CHAT_SETUP_TRIGGERD, StorageScope.PROFILE);
			}
		}

		if (typeof context.signedOut === 'boolean') {
			this.signedOut = context.signedOut;
		}

		if (typeof context.canSignUp === 'boolean') {
			this.canSignUp = context.canSignUp;
		}

		if (typeof context.limited === 'boolean') {
			this.limited = context.limited;
		}

		if (typeof context.entitled === 'boolean') {
			this.entitled = context.entitled;
		}

		return this.updateContext();
	}

	private async updateContext(): Promise<void> {
		await this.contextKeyUpdateBarrier?.wait();

		const showChatSetup = this.triggered && !this.installed;
		if (showChatSetup) {
			// this is ugly but fixes flicker from a previous chat install
			this.storageService.remove('chat.welcomeMessageContent.panel', StorageScope.APPLICATION);
			this.storageService.remove('interactive.sessions', this.workspaceContextService.getWorkspace().folders.length ? StorageScope.WORKSPACE : StorageScope.APPLICATION);
		}

		this.canSignUpContextKey.set(this.canSignUp);
		this.signedOutContextKey.set(this.signedOut);
		this.triggeredContext.set(showChatSetup);
		this.installedContext.set(this.installed);
		this.limitedContextKey.set(this.limited);
		this.entitledContextKey.set(this.entitled);
	}

	getContext() {
		return {
			triggered: this.triggered,
			installed: this.installed,
			limited: this.limited,
			entitled: this.entitled,
			canSignUp: this.canSignUp
		};
	}

	suspend(): void {
		this.contextKeyUpdateBarrier = new Barrier();
	}

	resume(): void {
		this.contextKeyUpdateBarrier?.open();
		this.contextKeyUpdateBarrier = undefined;
	}
}

//#endregion

registerWorkbenchContribution2('workbench.chat.setup', ChatSetupContribution, WorkbenchPhase.BlockRestore);
