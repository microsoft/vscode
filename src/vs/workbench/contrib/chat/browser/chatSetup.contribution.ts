/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatViewSetup.css';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
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
import { showChatView, ChatViewId } from './chat.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import product from '../../../../platform/product/common/product.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IChatViewsWelcomeContributionRegistry, ChatViewsWelcomeExtensions } from './viewsWelcome/chatViewsWelcome.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../common/views.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { $, addDisposableListener, EventType, getActiveElement, setVisibility } from '../../../../base/browser/dom.js';
import { ILogService, LogLevel } from '../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { defaultButtonStyles, defaultCheckboxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { MarkdownRenderer } from '../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';

const defaultChat = {
	extensionId: product.defaultChatAgent?.extensionId ?? '',
	name: product.defaultChatAgent?.name ?? '',
	icon: Codicon[product.defaultChatAgent?.icon as keyof typeof Codicon ?? 'commentDiscussion'],
	chatWelcomeTitle: product.defaultChatAgent?.chatWelcomeTitle ?? '',
	documentationUrl: product.defaultChatAgent?.documentationUrl ?? '',
	privacyStatementUrl: product.defaultChatAgent?.privacyStatementUrl ?? '',
	collectionDocumentationUrl: product.defaultChatAgent?.collectionDocumentationUrl ?? '',
	skusDocumentationUrl: product.defaultChatAgent?.skusDocumentationUrl ?? '',
	providerId: product.defaultChatAgent?.providerId ?? '',
	providerName: product.defaultChatAgent?.providerName ?? '',
	providerScopes: product.defaultChatAgent?.providerScopes ?? [[]],
	entitlementUrl: product.defaultChatAgent?.entitlementUrl ?? '',
	entitlementChatEnabled: product.defaultChatAgent?.entitlementChatEnabled ?? '',
	entitlementSkuLimitedUrl: product.defaultChatAgent?.entitlementSkuLimitedUrl ?? '',
	entitlementSkuLimitedEnabled: product.defaultChatAgent?.entitlementSkuLimitedEnabled ?? ''
};

enum ChatEntitlement {
	/** Signed out */
	Unknown = 1,
	/** Not yet resolved */
	Unresolved,
	/** Signed in and entitled to Sign-up */
	Available,
	/** Signed in but not entitled to Sign-up */
	Unavailable
}

//#region Contribution

class ChatSetupContribution extends Disposable implements IWorkbenchContribution {

	private readonly chatSetupState = this.instantiationService.createInstance(ChatSetupState);
	private readonly entitlementsResolver = this._register(this.instantiationService.createInstance(ChatSetupEntitlementResolver));

	constructor(
		@IProductService private readonly productService: IProductService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExtensionService private readonly extensionService: IExtensionService,
	) {
		super();

		if (!this.productService.defaultChatAgent) {
			return;
		}

		this.registerChatWelcome();

		this.checkExtensionInstallation();
	}

	private registerChatWelcome(): void {
		Registry.as<IChatViewsWelcomeContributionRegistry>(ChatViewsWelcomeExtensions.ChatViewsWelcomeRegistry).register({
			title: defaultChat.chatWelcomeTitle,
			when: ContextKeyExpr.and(
				ChatContextKeys.Setup.triggered,
				ChatContextKeys.Setup.installed.negate()
			)!,
			icon: defaultChat.icon,
			content: () => ChatSetupWelcomeContent.getInstance(this.instantiationService, this.entitlementsResolver).element,
		});
	}

	private async checkExtensionInstallation(): Promise<void> {
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

		const extensions = await this.extensionManagementService.getInstalled();

		const chatInstalled = !!extensions.find(value => ExtensionIdentifier.equals(value.identifier.id, defaultChat.extensionId));
		this.chatSetupState.update({ chatInstalled });
	}
}

//#endregion

//#region Entitlements Resolver

type ChatSetupEntitlementClassification = {
	entitled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Flag indicating if the user is chat setup entitled' };
	entitlement: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Flag indicating the chat entitlement state' };
	owner: 'bpasero';
	comment: 'Reporting chat setup entitlements';
};

type ChatSetupEntitlementEvent = {
	entitled: boolean;
	entitlement: ChatEntitlement;
};

class ChatSetupEntitlementResolver extends Disposable {

	private _entitlement = ChatEntitlement.Unknown;
	get entitlement() { return this._entitlement; }

	private readonly _onDidChangeEntitlement = this._register(new Emitter<ChatEntitlement>());
	readonly onDidChangeEntitlement = this._onDidChangeEntitlement.event;

	private readonly chatSetupEntitledContextKey = ChatContextKeys.Setup.entitled.bindTo(this.contextKeyService);

	private resolvedEntitlement: ChatEntitlement | undefined = undefined;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.registerEntitlementListeners();
		this.registerAuthListeners();

		this.handleDeclaredAuthProviders();
	}

	private registerEntitlementListeners(): void {
		this._register(this.authenticationService.onDidChangeSessions(e => {
			if (e.providerId === defaultChat.providerId) {
				if (e.event.added?.length) {
					this.resolveEntitlement(e.event.added.at(0));
				} else if (e.event.removed?.length) {
					this.resolvedEntitlement = undefined;
					this.update(this.toEntitlement(false));
				}
			}
		}));

		this._register(this.authenticationService.onDidRegisterAuthenticationProvider(async e => {
			if (e.id === defaultChat.providerId) {
				this.resolveEntitlement((await this.authenticationService.getSessions(e.id)).at(0));
			}
		}));
	}

	private registerAuthListeners(): void {
		this._register(this.authenticationService.onDidChangeDeclaredProviders(() => this.handleDeclaredAuthProviders()));
		this._register(this.authenticationService.onDidRegisterAuthenticationProvider(() => this.handleDeclaredAuthProviders()));

		this._register(this.authenticationService.onDidChangeSessions(async ({ providerId }) => {
			if (providerId === defaultChat.providerId) {
				this.update(this.toEntitlement(await this.hasProviderSessions()));
			}
		}));
	}

	private toEntitlement(hasSession: boolean, skuLimitedAvailable?: boolean): ChatEntitlement {
		if (!hasSession) {
			return ChatEntitlement.Unknown;
		}

		if (typeof this.resolvedEntitlement !== 'undefined') {
			return this.resolvedEntitlement;
		}

		if (typeof skuLimitedAvailable === 'boolean') {
			return skuLimitedAvailable ? ChatEntitlement.Available : ChatEntitlement.Unavailable;
		}

		return ChatEntitlement.Unresolved;
	}

	private async handleDeclaredAuthProviders(): Promise<void> {
		if (this.authenticationService.declaredProviders.find(provider => provider.id === defaultChat.providerId)) {
			this.update(this.toEntitlement(await this.hasProviderSessions()));
		}
	}

	private async hasProviderSessions(): Promise<boolean> {
		const sessions = await this.authenticationService.getSessions(defaultChat.providerId);
		for (const session of sessions) {
			for (const scopes of defaultChat.providerScopes) {
				if (this.scopesMatch(session.scopes, scopes)) {
					return true;
				}
			}
		}

		return false;
	}

	private scopesMatch(scopes: ReadonlyArray<string>, expectedScopes: string[]): boolean {
		return scopes.length === expectedScopes.length && expectedScopes.every(scope => scopes.includes(scope));
	}

	private async resolveEntitlement(session: AuthenticationSession | undefined): Promise<void> {
		if (!session) {
			return;
		}

		this.update(await this.doResolveEntitlement(session));
	}

	private async doResolveEntitlement(session: AuthenticationSession): Promise<ChatEntitlement> {
		if (this.resolvedEntitlement) {
			return this.resolvedEntitlement;
		}

		const cts = new CancellationTokenSource();
		this._register(toDisposable(() => cts.dispose(true)));

		const response = await this.instantiationService.invokeFunction(accessor => ChatSetupRequestHelper.request(accessor, defaultChat.entitlementUrl, 'GET', undefined, session, cts.token));
		if (!response) {
			this.logService.trace('[chat setup] entitlement: no response');
			return ChatEntitlement.Unresolved;
		}

		if (response.res.statusCode && response.res.statusCode !== 200) {
			this.logService.trace(`[chat setup] entitlement: unexpected status code ${response.res.statusCode}`);
			return ChatEntitlement.Unresolved;
		}

		const result = await asText(response);
		if (!result) {
			this.logService.trace('[chat setup] entitlement: response has no content');
			return ChatEntitlement.Unresolved;
		}

		let parsedResult: any;
		try {
			parsedResult = JSON.parse(result);
			this.logService.trace(`[chat setup] entitlement: parsed result is ${JSON.stringify(parsedResult)}`);
		} catch (err) {
			this.logService.trace(`[chat setup] entitlement: error parsing response (${err})`);
			return ChatEntitlement.Unresolved;
		}

		const entitled = Boolean(parsedResult[defaultChat.entitlementChatEnabled]);
		this.chatSetupEntitledContextKey.set(entitled);

		const skuLimitedAvailable = Boolean(parsedResult[defaultChat.entitlementSkuLimitedEnabled]);
		this.resolvedEntitlement = this.toEntitlement(entitled, skuLimitedAvailable);

		this.logService.trace(`[chat setup] entitlement: resolved to ${this.resolvedEntitlement}`);

		this.telemetryService.publicLog2<ChatSetupEntitlementEvent, ChatSetupEntitlementClassification>('chatInstallEntitlement', {
			entitled,
			entitlement: this.resolvedEntitlement
		});

		return this.resolvedEntitlement;
	}

	private update(newEntitlement: ChatEntitlement): void {
		const entitlement = this._entitlement;
		this._entitlement = newEntitlement;
		if (entitlement !== this._entitlement) {
			this._onDidChangeEntitlement.fire(this._entitlement);
		}
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

interface IChatSetupWelcomeContentOptions {
	readonly entitlement: ChatEntitlement;
	readonly onDidChangeEntitlement: Event<ChatEntitlement>;
}

class ChatSetupWelcomeContent extends Disposable {

	private static INSTANCE: ChatSetupWelcomeContent | undefined;
	static getInstance(instantiationService: IInstantiationService, options: IChatSetupWelcomeContentOptions): ChatSetupWelcomeContent {
		if (!ChatSetupWelcomeContent.INSTANCE) {
			ChatSetupWelcomeContent.INSTANCE = instantiationService.createInstance(ChatSetupWelcomeContent, options);
		}

		return ChatSetupWelcomeContent.INSTANCE;
	}

	readonly element = $('.chat-setup-view');

	constructor(
		private readonly options: IChatSetupWelcomeContentOptions,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IViewsService private readonly viewsService: IViewsService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IProductService private readonly productService: IProductService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.create();
	}

	private create(): void {
		const markdown = this._register(this.instantiationService.createInstance(MarkdownRenderer, {}));

		// Header
		this.element.appendChild($('p')).textContent = localize('setupHeader', "{0} is your AI pair programmer.", defaultChat.name);

		// SKU Limited Sign-up
		const skuHeader = localize({ key: 'skuHeader', comment: ['{Locked="]({0})"}'] }, "Setup will sign you up to {0} [limited access]({1}).", defaultChat.name, defaultChat.skusDocumentationUrl);
		const skuHeaderElement = this.element.appendChild($('p')).appendChild(this._register(markdown.render(new MarkdownString(skuHeader, { isTrusted: true }))).element);

		const telemetryLabel = localize('telemetryLabel', "Allow {0} to use my data, including Prompts, Suggestions, and Code Snippets, for product improvements", defaultChat.providerName);
		const { container: telemetryContainer, checkbox: telemetryCheckbox } = this.createCheckBox(telemetryLabel, this.telemetryService.telemetryLevel === TelemetryLevel.NONE ? false : false);

		const detectionLabel = localize('detectionLabel', "Allow suggestions matching public code");
		const { container: detectionContainer, checkbox: detectionCheckbox } = this.createCheckBox(detectionLabel, true);

		// Setup Button
		let setupRunning = false;

		const buttonRow = this.element.appendChild($('p'));

		const button = this._register(new Button(buttonRow, { ...defaultButtonStyles, supportIcons: true }));
		this.updateControls(button, [telemetryCheckbox, detectionCheckbox], false);

		this._register(button.onDidClick(async () => {
			setupRunning = true;
			this.updateControls(button, [telemetryCheckbox, detectionCheckbox], setupRunning);

			try {
				await this.setup(telemetryCheckbox?.checked, detectionCheckbox?.checked);
			} finally {
				setupRunning = false;
			}

			this.updateControls(button, [telemetryCheckbox, detectionCheckbox], setupRunning);
		}));

		// Footer
		const footer = localize({ key: 'privacyFooter', comment: ['{Locked="]({0})"}'] }, "By proceeding you agree to our [privacy statement]({0}). You can [learn more]({1}) about {2}.", defaultChat.privacyStatementUrl, defaultChat.documentationUrl, defaultChat.name);
		this.element.appendChild($('p')).appendChild(this._register(markdown.render(new MarkdownString(footer, { isTrusted: true }))).element);

		// Update based on entilement changes
		this._register(this.options.onDidChangeEntitlement(() => {
			if (setupRunning) {
				return; // do not change when setup running
			}
			setVisibility(this.options.entitlement !== ChatEntitlement.Unavailable, skuHeaderElement, telemetryContainer, detectionContainer);
			this.updateControls(button, [telemetryCheckbox, detectionCheckbox], setupRunning);
		}));
	}

	private createCheckBox(label: string, checked: boolean): { container: HTMLElement; checkbox: Checkbox } {
		const container = this.element.appendChild($('p'));
		const checkbox = this._register(new Checkbox(label, checked, defaultCheckboxStyles));
		container.appendChild(checkbox.domNode);

		const telemetryCheckboxLabelContainer = container.appendChild($('div'));
		telemetryCheckboxLabelContainer.textContent = label;
		this._register(addDisposableListener(telemetryCheckboxLabelContainer, EventType.CLICK, () => {
			if (checkbox?.enabled) {
				checkbox.checked = !checkbox.checked;
			}
		}));

		return { container, checkbox };
	}

	private updateControls(button: Button, checkboxes: Checkbox[], setupRunning: boolean): void {
		if (setupRunning) {
			button.enabled = false;
			button.label = localize('setupChatInstalling', "$(loading~spin) Completing Setup...");

			for (const checkbox of checkboxes) {
				checkbox.disable();
			}
		} else {
			button.enabled = true;
			button.label = this.options.entitlement === ChatEntitlement.Unknown ?
				localize('signInAndSetup', "Sign in and Complete Setup") :
				localize('setup', "Complete Setup");

			for (const checkbox of checkboxes) {
				checkbox.enable();
			}
		}
	}

	private async setup(enableTelemetry: boolean | undefined, enableDetection: boolean | undefined): Promise<boolean> {
		let session: AuthenticationSession | undefined;
		if (this.options.entitlement === ChatEntitlement.Unknown) {
			session = await this.signIn();
			if (!session) {
				return false; // user cancelled
			}
		}

		return this.install(session, enableTelemetry, enableDetection);
	}

	private async signIn(): Promise<AuthenticationSession | undefined> {
		let session: AuthenticationSession | undefined;
		try {
			showChatView(this.viewsService);
			session = await this.authenticationService.createSession(defaultChat.providerId, defaultChat.providerScopes[0]);
		} catch (error) {
			// noop
		}

		if (!session) {
			this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: 'failedNotSignedIn', signedIn: false });
		}

		return session;
	}

	private async install(session: AuthenticationSession | undefined, enableTelemetry: boolean | undefined, enableDetection: boolean | undefined): Promise<boolean> {
		const signedIn = !!session;
		const activeElement = getActiveElement();

		let installResult: 'installed' | 'cancelled' | 'failedInstall';
		try {
			showChatView(this.viewsService);

			if (this.options.entitlement !== ChatEntitlement.Unavailable) {
				const body = {
					public_code_suggestions: enableDetection ? 'enabled' : 'disabled',
					restricted_telemetry: enableTelemetry ? 'enabled' : 'disabled'
				};
				this.logService.trace(`[chat setup] install: signing up to limited SKU with ${JSON.stringify(body)}`);

				const response = await this.instantiationService.invokeFunction(accessor => ChatSetupRequestHelper.request(accessor, defaultChat.entitlementSkuLimitedUrl, 'POST', body, session, CancellationToken.None));
				if (response && this.logService.getLevel() === LogLevel.Trace) {
					this.logService.trace(`[chat setup] install: response from signing up to limited SKU ${JSON.stringify(await asText(response))}`);
				}
			} else {
				this.logService.trace('[chat setup] install: not signing up to limited SKU');
			}

			await this.extensionsWorkbenchService.install(defaultChat.extensionId, {
				enable: true,
				isMachineScoped: false,
				installPreReleaseVersion: this.productService.quality !== 'stable'
			}, ChatViewId);

			installResult = 'installed';
		} catch (error) {
			this.logService.trace(`[chat setup] install: error ${error}`);

			installResult = isCancellationError(error) ? 'cancelled' : 'failedInstall';
		}

		this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult, signedIn });

		if (activeElement === getActiveElement()) {
			(await showChatView(this.viewsService))?.focusInput();
		}

		return installResult === 'installed';
	}
}

//#endregion

//#region Helpers

class ChatSetupRequestHelper {

	static async request(accessor: ServicesAccessor, url: string, type: 'GET', body: undefined, session: AuthenticationSession | undefined, token: CancellationToken): Promise<IRequestContext | undefined>;
	static async request(accessor: ServicesAccessor, url: string, type: 'POST', body: object, session: AuthenticationSession | undefined, token: CancellationToken): Promise<IRequestContext | undefined>;
	static async request(accessor: ServicesAccessor, url: string, type: 'GET' | 'POST', body: object | undefined, session: AuthenticationSession | undefined, token: CancellationToken): Promise<IRequestContext | undefined> {
		const requestService = accessor.get(IRequestService);
		const logService = accessor.get(ILogService);
		const authenticationService = accessor.get(IAuthenticationService);

		try {
			if (!session) {
				session = (await authenticationService.getSessions(defaultChat.providerId)).at(0);
			}

			if (!session) {
				throw new Error('ChatSetupRequestHelper: No session found for provider');
			}

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

class ChatSetupState {

	private static readonly CHAT_SETUP_TRIGGERD = 'chat.setupTriggered';
	private static readonly CHAT_EXTENSION_INSTALLED = 'chat.extensionInstalled';

	private readonly chatSetupTriggeredContext = ChatContextKeys.Setup.triggered.bindTo(this.contextKeyService);
	private readonly chatSetupInstalledContext = ChatContextKeys.Setup.installed.bindTo(this.contextKeyService);

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
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

//#endregion

//#region Actions

class ChatSetupTriggerAction extends Action2 {

	static readonly ID = 'workbench.action.chat.triggerSetup';
	static readonly TITLE = localize2('triggerChatSetup', "Setup {0}...", defaultChat.name);

	constructor() {
		super({
			id: ChatSetupTriggerAction.ID,
			title: ChatSetupTriggerAction.TITLE,
			f1: true,
			precondition: ChatContextKeys.Setup.installed.negate(),
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
			precondition: ChatContextKeys.Setup.installed.negate(),
			menu: {
				id: MenuId.ChatCommandCenter,
				group: 'a_first',
				order: 2,
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

//#endregion

registerAction2(ChatSetupTriggerAction);
registerAction2(ChatSetupHideAction);

registerWorkbenchContribution2('workbench.chat.setup', ChatSetupContribution, WorkbenchPhase.BlockRestore);
