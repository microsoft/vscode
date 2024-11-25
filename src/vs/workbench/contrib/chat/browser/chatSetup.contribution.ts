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
	entitlementSignupLimitedUrl: product.defaultChatAgent?.entitlementSignupLimitedUrl ?? '',
	entitlementCanSignupLimited: product.defaultChatAgent?.entitlementCanSignupLimited ?? '',
	entitlementSkuType: product.defaultChatAgent?.entitlementSkuType ?? '',
	entitlementSkuTypeLimited: product.defaultChatAgent?.entitlementSkuTypeLimited ?? ''
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

	private readonly chatSetupContextKeys = this.instantiationService.createInstance(ChatSetupContextKeys);
	private readonly entitlementsResolver = this._register(this.instantiationService.createInstance(ChatSetupEntitlementResolver, this.chatSetupContextKeys));

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
					this.chatSetupContextKeys.update({ chatInstalled: false });
					break;
				}
			}

			for (const extension of result.added) {
				if (ExtensionIdentifier.equals(defaultChat.extensionId, extension.identifier)) {
					this.chatSetupContextKeys.update({ chatInstalled: true });
					break;
				}
			}
		}));

		const extensions = await this.extensionManagementService.getInstalled();

		const chatInstalled = !!extensions.find(value => ExtensionIdentifier.equals(value.identifier.id, defaultChat.extensionId));
		this.chatSetupContextKeys.update({ chatInstalled });
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

class ChatSetupEntitlementResolver extends Disposable {

	private _entitlement = ChatEntitlement.Unknown;
	get entitlement() { return this._entitlement; }

	private readonly _onDidChangeEntitlement = this._register(new Emitter<ChatEntitlement>());
	readonly onDidChangeEntitlement = this._onDidChangeEntitlement.event;

	private pendingResolveCts = new CancellationTokenSource();
	private resolvedEntitlement: ChatEntitlement | undefined = undefined;

	constructor(
		private readonly chatSetupContextKeys: ChatSetupContextKeys,
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
			this.update(this.resolvedEntitlement ?? ChatEntitlement.Unresolved);
		} else {
			this.resolvedEntitlement = undefined; // reset resolved entitlement when there is no session
			this.update(ChatEntitlement.Unknown);
		}

		if (session && typeof this.resolvedEntitlement === 'undefined') {
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
		const entitlement = await this.doResolveEntitlement(session, token);
		if (typeof entitlement === 'number' && !token.isCancellationRequested) {
			this.resolvedEntitlement = entitlement;
			this.update(entitlement);
		}

		return entitlement;
	}

	private async doResolveEntitlement(session: AuthenticationSession, token: CancellationToken): Promise<ChatEntitlement | undefined> {
		if (token.isCancellationRequested) {
			return undefined;
		}

		const response = await this.instantiationService.invokeFunction(accessor => ChatSetupRequestHelper.request(accessor, defaultChat.entitlementUrl, 'GET', undefined, session, token));
		if (token.isCancellationRequested) {
			return undefined;
		}

		if (!response) {
			this.logService.trace('[chat setup] entitlement: no response');
			return ChatEntitlement.Unresolved;
		}

		if (response.res.statusCode && response.res.statusCode !== 200) {
			this.logService.trace(`[chat setup] entitlement: unexpected status code ${response.res.statusCode}`);
			return ChatEntitlement.Unresolved;
		}

		const responseText = await asText(response);
		if (token.isCancellationRequested) {
			return undefined;
		}

		if (!responseText) {
			this.logService.trace('[chat setup] entitlement: response has no content');
			return ChatEntitlement.Unresolved;
		}

		let parsedResult: any;
		try {
			parsedResult = JSON.parse(responseText);
			this.logService.trace(`[chat setup] entitlement: parsed result is ${JSON.stringify(parsedResult)}`);
		} catch (err) {
			this.logService.trace(`[chat setup] entitlement: error parsing response (${err})`);
			return ChatEntitlement.Unresolved;
		}

		const result = {
			entitlement: Boolean(parsedResult[defaultChat.entitlementCanSignupLimited]) ? ChatEntitlement.Available : ChatEntitlement.Unavailable,
			entitled: Boolean(parsedResult[defaultChat.entitlementChatEnabled]),
			limited: Boolean(parsedResult[defaultChat.entitlementSkuType] === defaultChat.entitlementSkuTypeLimited)
		};

		this.chatSetupContextKeys.update({ entitled: result.entitled, limited: result.limited });

		this.logService.trace(`[chat setup] entitlement: resolved to ${result.entitlement}, entitled: ${result.entitled}, limited: ${result.limited}`);
		this.telemetryService.publicLog2<ChatSetupEntitlementEvent, ChatSetupEntitlementClassification>('chatInstallEntitlement', result);

		return result.entitlement;
	}

	private update(newEntitlement: ChatEntitlement): void {
		const entitlement = this._entitlement;
		this._entitlement = newEntitlement;
		if (entitlement !== this._entitlement) {
			this._onDidChangeEntitlement.fire(this._entitlement);
		}
	}

	async forceResolveEntitlement(session: AuthenticationSession): Promise<ChatEntitlement | undefined> {
		return this.resolveEntitlement(session, CancellationToken.None);
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
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IViewsService private readonly viewsService: IViewsService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IProductService private readonly productService: IProductService,
		@ILogService private readonly logService: ILogService
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
			this.setStep(ChatSetupStep.Installing);
			await this.install(session, enableTelemetry, enableDetection);
		} finally {
			this.setStep(ChatSetupStep.Initial);
		}
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

	private async install(session: AuthenticationSession | undefined, enableTelemetry: boolean, enableDetection: boolean): Promise<void> {
		const signedIn = !!session;
		const activeElement = getActiveElement();

		let installResult: 'installed' | 'cancelled' | 'failedInstall';
		try {
			showChatView(this.viewsService);

			if (this.canSignUpLimited) {
				const body = {
					restricted_telemetry: enableTelemetry ? 'enabled' : 'disabled',
					public_code_suggestions: enableDetection ? 'enabled' : 'disabled'
				};
				this.logService.trace(`[chat setup] install: signing up to limited SKU with ${JSON.stringify(body)}`);

				const response = await this.instantiationService.invokeFunction(accessor => ChatSetupRequestHelper.request(accessor, defaultChat.entitlementSignupLimitedUrl, 'POST', body, session, CancellationToken.None));
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
	}
}

class ChatSetupWelcomeContent extends Disposable {

	private static INSTANCE: ChatSetupWelcomeContent | undefined;
	static getInstance(instantiationService: IInstantiationService, entitlementResolver: ChatSetupEntitlementResolver): ChatSetupWelcomeContent {
		if (!ChatSetupWelcomeContent.INSTANCE) {
			ChatSetupWelcomeContent.INSTANCE = instantiationService.createInstance(ChatSetupWelcomeContent, entitlementResolver);
		}

		return ChatSetupWelcomeContent.INSTANCE;
	}

	readonly element = $('.chat-setup-view');

	private readonly controller: ChatSetupController;

	constructor(
		entitlementResolver: ChatSetupEntitlementResolver,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

		this.controller = this._register(instantiationService.createInstance(ChatSetupController, entitlementResolver));

		this.create();
	}

	private create(): void {
		const markdown = this._register(this.instantiationService.createInstance(MarkdownRenderer, {}));

		// Header
		this.element.appendChild($('p')).textContent = localize('setupHeader', "{0} is your AI pair programmer.", defaultChat.name);

		// Limited SKU Sign-up
		const limitedSkuHeader = localize({ key: 'limitedSkuHeader', comment: ['{Locked="]({0})"}'] }, "Setup will sign you up to {0} [limited access]({1}).", defaultChat.name, defaultChat.skusDocumentationUrl);
		const limitedSkuHeaderElement = this.element.appendChild($('p')).appendChild(this._register(markdown.render(new MarkdownString(limitedSkuHeader, { isTrusted: true }))).element);

		const telemetryLabel = localize('telemetryLabel', "Allow {0} to use my data, including Prompts, Suggestions, and Code Snippets, for product improvements", defaultChat.providerName);
		const { container: telemetryContainer, checkbox: telemetryCheckbox } = this.createCheckBox(telemetryLabel, this.telemetryService.telemetryLevel === TelemetryLevel.NONE ? false : false);

		const detectionLabel = localize('detectionLabel', "Allow suggestions matching public code");
		const { container: detectionContainer, checkbox: detectionCheckbox } = this.createCheckBox(detectionLabel, true);

		// Setup Button
		const buttonRow = this.element.appendChild($('p'));
		const button = this._register(new Button(buttonRow, { ...defaultButtonStyles, supportIcons: true }));
		this._register(button.onDidClick(() => this.controller.setup(telemetryCheckbox.checked, detectionCheckbox.checked)));

		// Footer
		const footer = localize({ key: 'privacyFooter', comment: ['{Locked="]({0})"}'] }, "By proceeding you agree to our [privacy statement]({0}). You can [learn more]({1}) about {2}.", defaultChat.privacyStatementUrl, defaultChat.documentationUrl, defaultChat.name);
		this.element.appendChild($('p')).appendChild(this._register(markdown.render(new MarkdownString(footer, { isTrusted: true }))).element);

		// Update based on model state
		this._register(Event.runAndSubscribe(this.controller.onDidChange, () => this.update([limitedSkuHeaderElement, telemetryContainer, detectionContainer], [telemetryCheckbox, detectionCheckbox], button)));
	}

	private createCheckBox(label: string, checked: boolean): { container: HTMLElement; checkbox: Checkbox } {
		const container = this.element.appendChild($('p'));
		const checkbox = this._register(new Checkbox(label, checked, defaultCheckboxStyles));
		container.appendChild(checkbox.domNode);

		const checkboxLabel = container.appendChild($('div'));
		checkboxLabel.textContent = label;
		this._register(addDisposableListener(checkboxLabel, EventType.CLICK, () => {
			if (checkbox?.enabled) {
				checkbox.checked = !checkbox.checked;
			}
		}));

		return { container, checkbox };
	}

	private update(limitedContainers: HTMLElement[], limitedCheckboxes: Checkbox[], button: Button): void {
		switch (this.controller.step) {
			case ChatSetupStep.Initial:
				setVisibility(this.controller.canSignUpLimited, ...limitedContainers);

				for (const checkbox of limitedCheckboxes) {
					checkbox.enable();
				}

				button.enabled = true;
				button.label = this.controller.entitlement === ChatEntitlement.Unknown ?
					localize('signInToStartSetup', "Sign in to Start Setup") :
					localize('startSetup', "Complete Setup");
				break;
			case ChatSetupStep.SigningIn:
			case ChatSetupStep.Installing:
				for (const checkbox of limitedCheckboxes) {
					checkbox.disable();
				}

				button.enabled = false;
				button.label = this.controller.step === ChatSetupStep.SigningIn ?
					localize('setupChatSigningIn', "$(loading~spin) Signing in to {0}...", defaultChat.providerName) :
					localize('setupChatInstalling', "$(loading~spin) Completing Setup...");

				break;
		}
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

class ChatSetupContextKeys {

	private static readonly CHAT_SETUP_TRIGGERD = 'chat.setupTriggered';
	private static readonly CHAT_EXTENSION_INSTALLED = 'chat.extensionInstalled';

	private readonly chatSetupEntitledContextKey = ChatContextKeys.Setup.entitled.bindTo(this.contextKeyService);
	private readonly chatSetupLimitedContextKey = ChatContextKeys.Setup.limited.bindTo(this.contextKeyService);
	private readonly chatSetupTriggeredContext = ChatContextKeys.Setup.triggered.bindTo(this.contextKeyService);
	private readonly chatSetupInstalledContext = ChatContextKeys.Setup.installed.bindTo(this.contextKeyService);

	private chatSetupEntitled = false;
	private chatSetupLimited = false;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) {
		this.updateContext();
	}

	update(context: { chatInstalled: boolean }): void;
	update(context: { triggered: boolean }): void;
	update(context: { entitled: boolean; limited: boolean }): void;
	update(context: { triggered?: boolean; chatInstalled?: boolean; entitled?: boolean; limited?: boolean }): void {
		if (typeof context.chatInstalled === 'boolean') {
			this.storageService.store(ChatSetupContextKeys.CHAT_EXTENSION_INSTALLED, context.chatInstalled, StorageScope.PROFILE, StorageTarget.MACHINE);
			if (context.chatInstalled) {
				this.storageService.store(ChatSetupContextKeys.CHAT_SETUP_TRIGGERD, true, StorageScope.PROFILE, StorageTarget.MACHINE); // allows to fallback to setup view if the extension is uninstalled
			}
		}

		if (typeof context.triggered === 'boolean') {
			if (context.triggered) {
				this.storageService.store(ChatSetupContextKeys.CHAT_SETUP_TRIGGERD, true, StorageScope.PROFILE, StorageTarget.MACHINE);
			} else {
				this.storageService.remove(ChatSetupContextKeys.CHAT_SETUP_TRIGGERD, StorageScope.PROFILE);
			}
		}

		if (typeof context.entitled === 'boolean') {
			this.chatSetupEntitled = context.entitled;
		}

		if (typeof context.limited === 'boolean') {
			this.chatSetupLimited = context.limited;
		}

		this.updateContext();
	}

	private updateContext(): void {
		const chatSetupTriggered = this.storageService.getBoolean(ChatSetupContextKeys.CHAT_SETUP_TRIGGERD, StorageScope.PROFILE, false);
		const chatInstalled = this.storageService.getBoolean(ChatSetupContextKeys.CHAT_EXTENSION_INSTALLED, StorageScope.PROFILE, false);

		const showChatSetup = chatSetupTriggered && !chatInstalled;
		if (showChatSetup) {
			// this is ugly but fixes flicker from a previous chat install
			this.storageService.remove('chat.welcomeMessageContent.panel', StorageScope.APPLICATION);
			this.storageService.remove('interactive.sessions', this.workspaceContextService.getWorkspace().folders.length ? StorageScope.WORKSPACE : StorageScope.APPLICATION);
		}

		this.chatSetupTriggeredContext.set(showChatSetup);
		this.chatSetupInstalledContext.set(chatInstalled);
		this.chatSetupEntitledContextKey.set(this.chatSetupEntitled);
		this.chatSetupLimitedContextKey.set(this.chatSetupLimited);
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

		instantiationService.createInstance(ChatSetupContextKeys).update({ triggered: true });

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

		instantiationService.createInstance(ChatSetupContextKeys).update({ triggered: false });

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
