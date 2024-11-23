/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
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
import { timeout } from '../../../../base/common/async.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { CHAT_CATEGORY } from './actions/chatActions.js';
import { showChatView, ChatViewId } from './chat.js';
import { IChatAgentService } from '../common/chatAgents.js';
import { Event } from '../../../../base/common/event.js';
import product from '../../../../platform/product/common/product.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IChatViewsWelcomeContributionRegistry, ChatViewsWelcomeExtensions } from './viewsWelcome/chatViewsWelcome.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../common/views.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { getActiveElement } from '../../../../base/browser/dom.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';

const defaultChat = {
	extensionId: product.defaultChatAgent?.extensionId ?? '',
	name: product.defaultChatAgent?.name ?? '',
	icon: Codicon[product.defaultChatAgent?.icon as keyof typeof Codicon ?? 'commentDiscussion'],
	chatWelcomeTitle: product.defaultChatAgent?.chatWelcomeTitle ?? '',
	documentationUrl: product.defaultChatAgent?.documentationUrl ?? '',
	privacyStatementUrl: product.defaultChatAgent?.privacyStatementUrl ?? '',
	collectionDocumentationUrl: product.defaultChatAgent?.collectionDocumentationUrl ?? '',
	providerId: product.defaultChatAgent?.providerId ?? '',
	providerName: product.defaultChatAgent?.providerName ?? '',
	providerScopes: product.defaultChatAgent?.providerScopes ?? [],
	entitlementUrl: product.defaultChatAgent?.entitlementUrl ?? '',
	entitlementSkuKey: product.defaultChatAgent?.entitlementSkuKey ?? '',
	entitlementSku30DTrialValue: product.defaultChatAgent?.entitlementSku30DTrialValue ?? '',
	entitlementChatEnabled: product.defaultChatAgent?.entitlementChatEnabled ?? '',
	entitlementSkuAlternateUrl: product.defaultChatAgent?.entitlementSkuAlternateUrl ?? ''
};

type ChatSetupEntitlementEnablementClassification = {
	entitled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Flag indicating if the user is chat setup entitled' };
	trial: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Flag indicating if the user is subscribed to chat trial' };
	owner: 'bpasero';
	comment: 'Reporting if the user is chat setup entitled';
};

type ChatSetupEntitlementEnablementEvent = {
	entitled: boolean;
	trial: boolean;
};

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

interface IChatEntitlement {
	readonly chatEnabled?: boolean;
	readonly chatSku30DTrial?: boolean;
}

const UNKNOWN_CHAT_ENTITLEMENT: IChatEntitlement = {};

class ChatSetupContribution extends Disposable implements IWorkbenchContribution {

	private readonly chatSetupSignedInContextKey = ChatContextKeys.Setup.signedIn.bindTo(this.contextKeyService);
	private readonly chatSetupEntitledContextKey = ChatContextKeys.Setup.entitled.bindTo(this.contextKeyService);

	private readonly chatSetupState = this.instantiationService.createInstance(ChatSetupState);

	private resolvedEntitlement: IChatEntitlement | undefined = undefined;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IProductService private readonly productService: IProductService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		if (!this.productService.defaultChatAgent) {
			return;
		}

		this.registerChatWelcome();

		this.registerEntitlementListeners();
		this.registerAuthListeners();

		this.checkExtensionInstallation();
	}

	private registerChatWelcome(): void {
		const header = localize('setupHeader', "{0} is your AI pair programmer.", defaultChat.name);
		const footer = localize({ key: 'setupFooter', comment: ['{Locked="]({0})"}'] }, "By proceeding you agree to our [privacy statement]({0}).", defaultChat.privacyStatementUrl);

		// Setup: Triggered (signed-out)
		Registry.as<IChatViewsWelcomeContributionRegistry>(ChatViewsWelcomeExtensions.ChatViewsWelcomeRegistry).register({
			title: defaultChat.chatWelcomeTitle,
			when: ContextKeyExpr.and(
				ChatContextKeys.Setup.triggered,
				ChatContextKeys.Setup.signedIn.negate(),
				ChatContextKeys.Setup.signingIn.negate(),
				ChatContextKeys.Setup.installing.negate(),
				ChatContextKeys.Setup.installed.negate()
			)!,
			icon: defaultChat.icon,
			content: new MarkdownString([
				header,
				`[${localize('signInAndSetup', "Sign in to use {0}", defaultChat.name)}](command:${ChatSetupSignInAndInstallChatAction.ID})`,
				footer,
				`[${localize('learnMore', "Learn More")}](${defaultChat.documentationUrl})`,
			].join('\n\n'), { isTrusted: true }),
		});

		// Setup: Triggered (signed-in)
		Registry.as<IChatViewsWelcomeContributionRegistry>(ChatViewsWelcomeExtensions.ChatViewsWelcomeRegistry).register({
			title: defaultChat.chatWelcomeTitle,
			when: ContextKeyExpr.and(
				ChatContextKeys.Setup.triggered,
				ChatContextKeys.Setup.signedIn,
				ChatContextKeys.Setup.signingIn.negate(),
				ChatContextKeys.Setup.installing.negate(),
				ChatContextKeys.Setup.installed.negate()
			)!,
			icon: defaultChat.icon,
			content: new MarkdownString([
				header,
				`[${localize('setup', "Install {0}", defaultChat.name)}](command:${ChatSetupInstallAction.ID})`,
				footer,
				`[${localize('learnMore', "Learn More")}](${defaultChat.documentationUrl})`,
			].join('\n\n'), { isTrusted: true })
		});

		// Setup: Signing-in
		Registry.as<IChatViewsWelcomeContributionRegistry>(ChatViewsWelcomeExtensions.ChatViewsWelcomeRegistry).register({
			title: defaultChat.chatWelcomeTitle,
			when: ContextKeyExpr.and(
				ChatContextKeys.Setup.signingIn,
				ChatContextKeys.Setup.installed.negate()
			)!,
			icon: defaultChat.icon,
			disableFirstLinkToButton: true,
			content: new MarkdownString([
				header,
				localize('setupChatSigningIn', "$(loading~spin) Signing in to {0}...", defaultChat.providerName),
				footer,
				`[${localize('learnMore', "Learn More")}](${defaultChat.documentationUrl})`,
			].join('\n\n'), { isTrusted: true, supportThemeIcons: true }),
		});

		// Setup: Installing
		Registry.as<IChatViewsWelcomeContributionRegistry>(ChatViewsWelcomeExtensions.ChatViewsWelcomeRegistry).register({
			title: defaultChat.chatWelcomeTitle,
			when: ChatContextKeys.Setup.installing,
			icon: defaultChat.icon,
			disableFirstLinkToButton: true,
			content: new MarkdownString([
				header,
				localize('setupChatInstalling', "$(loading~spin) Setting up Chat for you..."),
				footer,
				`[${localize('learnMore', "Learn More")}](${defaultChat.documentationUrl})`,
			].join('\n\n'), { isTrusted: true, supportThemeIcons: true }),
		});
	}

	private registerEntitlementListeners(): void {
		this._register(this.extensionService.onDidChangeExtensions(result => {
			for (const extension of result.removed) {
				if (ExtensionIdentifier.equals(defaultChat.extensionId, extension.identifier)) {
					this.chatSetupState.update({ chatInstalled: false });
					break;
				}
			}

			for (const extension of result.added) {
				if (ExtensionIdentifier.equals(defaultChat.extensionId, extension.identifier)) {
					this.chatSetupState.update({ chatInstalled: true });
					break;
				}
			}
		}));

		this._register(this.authenticationService.onDidChangeSessions(e => {
			if (e.providerId === defaultChat.providerId) {
				if (e.event.added?.length) {
					this.resolveEntitlement(e.event.added[0]);
				} else if (e.event.removed?.length) {
					this.chatSetupEntitledContextKey.set(false);
				}
			}
		}));

		this._register(this.authenticationService.onDidRegisterAuthenticationProvider(async e => {
			if (e.id === defaultChat.providerId) {
				this.resolveEntitlement((await this.authenticationService.getSessions(e.id))[0]);
			}
		}));
	}

	private registerAuthListeners(): void {
		const hasProviderSessions = async () => {
			const sessions = await this.authenticationService.getSessions(defaultChat.providerId);
			return sessions.length > 0;
		};

		const handleDeclaredAuthProviders = async () => {
			if (this.authenticationService.declaredProviders.find(p => p.id === defaultChat.providerId)) {
				this.chatSetupSignedInContextKey.set(await hasProviderSessions());
			}
		};
		this._register(this.authenticationService.onDidChangeDeclaredProviders(handleDeclaredAuthProviders));
		this._register(this.authenticationService.onDidRegisterAuthenticationProvider(handleDeclaredAuthProviders));

		handleDeclaredAuthProviders();

		this._register(this.authenticationService.onDidChangeSessions(async ({ providerId }) => {
			if (providerId === defaultChat.providerId) {
				this.chatSetupSignedInContextKey.set(await hasProviderSessions());
			}
		}));
	}

	private async resolveEntitlement(session: AuthenticationSession | undefined): Promise<void> {
		if (!session) {
			return;
		}

		const entitlement = await this.doResolveEntitlement(session);
		this.chatSetupEntitledContextKey.set(!!entitlement.chatEnabled);
	}

	private async doResolveEntitlement(session: AuthenticationSession): Promise<IChatEntitlement> {
		if (this.resolvedEntitlement) {
			return this.resolvedEntitlement;
		}

		const cts = new CancellationTokenSource();
		this._register(toDisposable(() => cts.dispose(true)));

		const context = await this.instantiationService.invokeFunction(accessor => ChatSetupRequestHelper.request(accessor, defaultChat.entitlementUrl, 'GET', session, cts.token));
		if (!context) {
			return UNKNOWN_CHAT_ENTITLEMENT;
		}

		if (context.res.statusCode && context.res.statusCode !== 200) {
			return UNKNOWN_CHAT_ENTITLEMENT;
		}

		const result = await asText(context);
		if (!result) {
			return UNKNOWN_CHAT_ENTITLEMENT;
		}

		let parsedResult: any;
		try {
			parsedResult = JSON.parse(result);
		} catch (err) {
			return UNKNOWN_CHAT_ENTITLEMENT;
		}

		this.resolvedEntitlement = {
			chatEnabled: Boolean(parsedResult[defaultChat.entitlementChatEnabled]),
			chatSku30DTrial: parsedResult[defaultChat.entitlementSkuKey] === defaultChat.entitlementSku30DTrialValue
		};

		this.telemetryService.publicLog2<ChatSetupEntitlementEnablementEvent, ChatSetupEntitlementEnablementClassification>('chatInstallEntitlement', {
			entitled: !!this.resolvedEntitlement.chatEnabled,
			trial: !!this.resolvedEntitlement.chatSku30DTrial
		});

		return this.resolvedEntitlement;
	}

	private async checkExtensionInstallation(): Promise<void> {
		const extensions = await this.extensionManagementService.getInstalled();

		const chatInstalled = !!extensions.find(value => ExtensionIdentifier.equals(value.identifier.id, defaultChat.extensionId));
		this.chatSetupState.update({ chatInstalled });
	}
}

class ChatSetupRequestHelper {

	static async request(accessor: ServicesAccessor, url: string, type: 'GET' | 'POST', session: AuthenticationSession | undefined, token: CancellationToken): Promise<IRequestContext | undefined> {
		const requestService = accessor.get(IRequestService);
		const logService = accessor.get(ILogService);
		const authenticationService = accessor.get(IAuthenticationService);

		try {
			if (!session) {
				session = (await authenticationService.getSessions(defaultChat.providerId))[0];
			}

			if (!session) {
				throw new Error('ChatSetupRequestHelper: No session found for provider');
			}

			return await requestService.request({
				type,
				url,
				data: type === 'POST' ? JSON.stringify({}) : undefined,
				headers: {
					'Authorization': `Bearer ${session.accessToken}`
				}
			}, token);
		} catch (error) {
			logService.error(error);

			return undefined;
		}
	}
}

class ChatSetupState {

	private static readonly CHAT_SETUP_TRIGGERD = 'chat.setupTriggered';
	private static readonly CHAT_EXTENSION_INSTALLED = 'chat.extensionInstalled';

	private readonly chatSetupTriggeredContext = ChatContextKeys.Setup.triggered.bindTo(this.contextKeyService);
	private readonly chatSetupInstalledContext = ChatContextKeys.Setup.installed.bindTo(this.contextKeyService);

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService
	) {
		this.updateContext();
	}

	update(context: { triggered: boolean }): void;
	update(context: { chatInstalled?: boolean }): void;
	update(context: { triggered?: boolean; chatInstalled?: boolean }): void {
		if (typeof context.chatInstalled === 'boolean') {
			this.storageService.store(ChatSetupState.CHAT_EXTENSION_INSTALLED, context.chatInstalled, StorageScope.PROFILE, StorageTarget.MACHINE);
			this.storageService.store(ChatSetupState.CHAT_SETUP_TRIGGERD, true, StorageScope.PROFILE, StorageTarget.MACHINE); // allows to fallback to setup view if the extension is uninstalled
		}

		if (typeof context.triggered === 'boolean') {
			if (context.triggered) {
				this.storageService.store(ChatSetupState.CHAT_SETUP_TRIGGERD, true, StorageScope.PROFILE, StorageTarget.MACHINE);
			} else {
				this.storageService.remove(ChatSetupState.CHAT_SETUP_TRIGGERD, StorageScope.PROFILE);
			}
		}

		this.updateContext();
	}

	private updateContext(): void {
		const chatSetupTriggered = this.storageService.getBoolean(ChatSetupState.CHAT_SETUP_TRIGGERD, StorageScope.PROFILE, false);
		const chatInstalled = this.storageService.getBoolean(ChatSetupState.CHAT_EXTENSION_INSTALLED, StorageScope.PROFILE, false);

		const showChatSetup = chatSetupTriggered && !chatInstalled;
		if (showChatSetup) {
			// this is ugly but fixes flicker from a previous chat install
			this.storageService.remove('chat.welcomeMessageContent.panel', StorageScope.APPLICATION);
			this.storageService.remove('interactive.sessions', this.workspaceContextService.getWorkspace().folders.length ? StorageScope.WORKSPACE : StorageScope.APPLICATION);
		}

		this.chatSetupTriggeredContext.set(showChatSetup);
		this.chatSetupInstalledContext.set(chatInstalled);
	}
}

class ChatSetupTriggerAction extends Action2 {

	static readonly ID = 'workbench.action.chat.triggerSetup';
	static readonly TITLE = localize2('triggerChatSetup', "Trigger Chat Setup");

	constructor() {
		super({
			id: ChatSetupTriggerAction.ID,
			title: ChatSetupTriggerAction.TITLE
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const instantiationService = accessor.get(IInstantiationService);

		instantiationService.createInstance(ChatSetupState).update({ triggered: true });

		showChatView(viewsService);
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
			precondition: ContextKeyExpr.and(
				ChatContextKeys.Setup.triggered,
				ChatContextKeys.Setup.installed.negate()
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
		const viewsDescriptorService = accessor.get(IViewDescriptorService);
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const instantiationService = accessor.get(IInstantiationService);
		const configurationService = accessor.get(IConfigurationService);
		const dialogService = accessor.get(IDialogService);

		const { confirmed } = await dialogService.confirm({
			message: localize('hideChatSetupConfirm', "Are you sure you want to hide {0}?", defaultChat.name),
			detail: localize('hideChatSetupDetail', "You can restore chat controls from the 'chat.commandCenter.enabled' setting."),
			primaryButton: localize('hideChatSetup', "Hide {0}", defaultChat.name)
		});

		if (!confirmed) {
			return;
		}

		const location = viewsDescriptorService.getViewLocationById(ChatViewId);

		instantiationService.createInstance(ChatSetupState).update({ triggered: false });

		if (location === ViewContainerLocation.AuxiliaryBar) {
			const activeContainers = viewsDescriptorService.getViewContainersByLocation(location).filter(container => viewsDescriptorService.getViewContainerModel(container).activeViewDescriptors.length > 0);
			if (activeContainers.length === 0) {
				layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART); // hide if there are no views in the secondary sidebar
			}
		}

		configurationService.updateValue('chat.commandCenter.enabled', false);
	}
}

class ChatSetupInstallAction extends Action2 {

	static readonly ID = 'workbench.action.chat.install';
	static readonly TITLE = localize2('installChat', "Install {0}", defaultChat.name);

	constructor() {
		super({
			id: ChatSetupInstallAction.ID,
			title: ChatSetupInstallAction.TITLE,
			category: CHAT_CATEGORY,
			menu: {
				id: MenuId.ChatCommandCenter,
				group: 'a_first',
				order: 0,
				when: ContextKeyExpr.and(
					ChatContextKeys.Setup.signedIn,
					ChatContextKeys.Setup.installed.negate()
				)
			}
		});
	}

	override run(accessor: ServicesAccessor): Promise<void> {
		return ChatSetupInstallAction.install(accessor, undefined);
	}

	static async install(accessor: ServicesAccessor, session: AuthenticationSession | undefined) {
		const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
		const productService = accessor.get(IProductService);
		const telemetryService = accessor.get(ITelemetryService);
		const contextKeyService = accessor.get(IContextKeyService);
		const viewsService = accessor.get(IViewsService);
		const chatAgentService = accessor.get(IChatAgentService);
		const instantiationService = accessor.get(IInstantiationService);

		const signedIn = !!session;
		const setupInstallingContextKey = ChatContextKeys.Setup.installing.bindTo(contextKeyService);
		const activeElement = getActiveElement();

		let installResult: 'installed' | 'cancelled' | 'failedInstall';
		try {
			setupInstallingContextKey.set(true);
			showChatView(viewsService);

			await instantiationService.invokeFunction(accessor => ChatSetupRequestHelper.request(accessor, defaultChat.entitlementSkuAlternateUrl, 'POST', session, CancellationToken.None));

			await extensionsWorkbenchService.install(defaultChat.extensionId, {
				enable: true,
				isMachineScoped: false,
				installPreReleaseVersion: productService.quality !== 'stable'
			}, ChatViewId);

			installResult = 'installed';
		} catch (error) {
			installResult = isCancellationError(error) ? 'cancelled' : 'failedInstall';
		}

		telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult, signedIn });

		await Promise.race([timeout(5000), Event.toPromise(chatAgentService.onDidChangeAgents)]); // reduce flicker (https://github.com/microsoft/vscode-copilot/issues/9274)

		setupInstallingContextKey.reset();

		if (activeElement === getActiveElement()) {
			(await showChatView(viewsService))?.focusInput();
		}
	}
}

class ChatSetupSignInAndInstallChatAction extends Action2 {

	static readonly ID = 'workbench.action.chat.signInAndInstall';
	static readonly TITLE = localize2('signInAndInstallChat', "Sign in to use {0}", defaultChat.name);

	constructor() {
		super({
			id: ChatSetupSignInAndInstallChatAction.ID,
			title: ChatSetupSignInAndInstallChatAction.TITLE,
			category: CHAT_CATEGORY,
			menu: {
				id: MenuId.ChatCommandCenter,
				group: 'a_first',
				order: 0,
				when: ContextKeyExpr.and(
					ChatContextKeys.Setup.signedIn.negate(),
					ChatContextKeys.Setup.installed.negate()
				)
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const authenticationService = accessor.get(IAuthenticationService);
		const instantiationService = accessor.get(IInstantiationService);
		const telemetryService = accessor.get(ITelemetryService);
		const contextKeyService = accessor.get(IContextKeyService);
		const viewsService = accessor.get(IViewsService);

		const setupSigningInContextKey = ChatContextKeys.Setup.signingIn.bindTo(contextKeyService);

		let session: AuthenticationSession | undefined;
		try {
			setupSigningInContextKey.set(true);
			showChatView(viewsService);
			session = await authenticationService.createSession(defaultChat.providerId, defaultChat.providerScopes);
		} catch (error) {
			// noop
		} finally {
			setupSigningInContextKey.reset();
		}

		if (session) {
			instantiationService.invokeFunction(accessor => ChatSetupInstallAction.install(accessor, session));
		} else {
			telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: 'failedNotSignedIn', signedIn: false });
		}
	}
}

registerAction2(ChatSetupTriggerAction);
registerAction2(ChatSetupHideAction);
registerAction2(ChatSetupInstallAction);
registerAction2(ChatSetupSignInAndInstallChatAction);

registerWorkbenchContribution2('workbench.chat.setup', ChatSetupContribution, WorkbenchPhase.BlockRestore);
