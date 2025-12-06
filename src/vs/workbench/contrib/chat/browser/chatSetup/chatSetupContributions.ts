/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable, DisposableStore, markAsSingleton, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import Severity from '../../../../../base/common/severity.js';
import { equalsIgnoreCase } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IMarkerService } from '../../../../../platform/markers/common/markers.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import product from '../../../../../platform/product/common/product.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../common/views.js';
import { ChatEntitlement, ChatEntitlementContext, ChatEntitlementRequests, ChatEntitlementService, IChatEntitlementService, isProUser } from '../../../../services/chat/common/chatEntitlementService.js';
import { EnablementState, IWorkbenchExtensionEnablementService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { ExtensionUrlHandlerOverrideRegistry, IExtensionUrlHandlerOverride } from '../../../../services/extensions/browser/extensionUrlHandler.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { IExtension, IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IChatModeService } from '../../common/chatModes.js';
import { ChatAgentLocation, ChatModeKind } from '../../common/constants.js';
import { CHAT_CATEGORY, CHAT_SETUP_ACTION_ID, CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID } from '../actions/chatActions.js';
import { AGENT_SESSIONS_VIEW_CONTAINER_ID } from '../agentSessions/agentSessions.js';
import { ChatViewContainerId, IChatWidgetService } from '../chat.js';
import { chatViewsWelcomeRegistry } from '../viewsWelcome/chatViewsWelcome.js';
import { ChatSetupAnonymous } from './chatSetup.js';
import { ChatSetupController } from './chatSetupController.js';
import { AICodeActionsHelper, AINewSymbolNamesProvider, ChatCodeActionsProvider, SetupAgent } from './chatSetupProviders.js';
import { ChatSetup } from './chatSetupRunner.js';

const defaultChat = {
	chatExtensionId: product.defaultChatAgent?.chatExtensionId ?? '',
	manageOveragesUrl: product.defaultChatAgent?.manageOverageUrl ?? '',
	upgradePlanUrl: product.defaultChatAgent?.upgradePlanUrl ?? '',
	completionsRefreshTokenCommand: product.defaultChatAgent?.completionsRefreshTokenCommand ?? '',
	chatRefreshTokenCommand: product.defaultChatAgent?.chatRefreshTokenCommand ?? '',
};

export class ChatSetupContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatSetup';

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatEntitlementService chatEntitlementService: ChatEntitlementService,
		@ILogService private readonly logService: ILogService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
	) {
		super();

		const context = chatEntitlementService.context?.value;
		const requests = chatEntitlementService.requests?.value;
		if (!context || !requests) {
			return; // disabled
		}

		const controller = new Lazy(() => this._register(this.instantiationService.createInstance(ChatSetupController, context, requests)));

		this.registerSetupAgents(context, controller);
		this.registerActions(context, requests, controller);
		this.registerUrlLinkHandler();
		this.checkExtensionInstallation(context);
	}

	private registerSetupAgents(context: ChatEntitlementContext, controller: Lazy<ChatSetupController>): void {
		const defaultAgentDisposables = markAsSingleton(new MutableDisposable()); // prevents flicker on window reload
		const vscodeAgentDisposables = markAsSingleton(new MutableDisposable());

		const renameProviderDisposables = markAsSingleton(new MutableDisposable());
		const codeActionsProviderDisposables = markAsSingleton(new MutableDisposable());

		const updateRegistration = () => {

			// Agent + Tools
			{
				if (!context.state.hidden && !context.state.disabled) {

					// Default Agents (always, even if installed to allow for speedy requests right on startup)
					if (!defaultAgentDisposables.value) {
						const disposables = defaultAgentDisposables.value = new DisposableStore();

						// Panel Agents
						const panelAgentDisposables = disposables.add(new DisposableStore());
						for (const mode of [ChatModeKind.Ask, ChatModeKind.Edit, ChatModeKind.Agent]) {
							const { agent, disposable } = SetupAgent.registerDefaultAgents(this.instantiationService, ChatAgentLocation.Chat, mode, context, controller);
							panelAgentDisposables.add(disposable);
							panelAgentDisposables.add(agent.onUnresolvableError(() => {
								const panelAgentHasGuidance = chatViewsWelcomeRegistry.get().some(descriptor => this.contextKeyService.contextMatchesRules(descriptor.when));
								if (panelAgentHasGuidance) {
									// An unresolvable error from our agent registrations means that
									// Chat is unhealthy for some reason. We clear our panel
									// registration to give Chat a chance to show a custom message
									// to the user from the views and stop pretending as if there was
									// a functional agent.
									this.logService.error('[chat setup] Unresolvable error from Chat agent registration, clearing registration.');
									panelAgentDisposables.dispose();
								}
							}));
						}

						// Inline Agents
						disposables.add(SetupAgent.registerDefaultAgents(this.instantiationService, ChatAgentLocation.Terminal, undefined, context, controller).disposable);
						disposables.add(SetupAgent.registerDefaultAgents(this.instantiationService, ChatAgentLocation.Notebook, undefined, context, controller).disposable);
						disposables.add(SetupAgent.registerDefaultAgents(this.instantiationService, ChatAgentLocation.EditorInline, undefined, context, controller).disposable);
					}

					// Built-In Agent + Tool (unless installed, signed-in and enabled)
					if ((!context.state.installed || context.state.entitlement === ChatEntitlement.Unknown || context.state.entitlement === ChatEntitlement.Unresolved) && !vscodeAgentDisposables.value) {
						const disposables = vscodeAgentDisposables.value = new DisposableStore();
						disposables.add(SetupAgent.registerBuiltInAgents(this.instantiationService, context, controller));
					}
				} else {
					defaultAgentDisposables.clear();
					vscodeAgentDisposables.clear();
				}

				if (context.state.installed && !context.state.disabled) {
					vscodeAgentDisposables.clear(); // we need to do this to prevent showing duplicate agent/tool entries in the list
				}
			}

			// Rename Provider
			{
				if (!context.state.installed && !context.state.hidden && !context.state.disabled) {
					if (!renameProviderDisposables.value) {
						renameProviderDisposables.value = AINewSymbolNamesProvider.registerProvider(this.instantiationService, context, controller);
					}
				} else {
					renameProviderDisposables.clear();
				}
			}

			// Code Actions Provider
			{
				if (!context.state.installed && !context.state.hidden && !context.state.disabled) {
					if (!codeActionsProviderDisposables.value) {
						codeActionsProviderDisposables.value = ChatCodeActionsProvider.registerProvider(this.instantiationService);
					}
				} else {
					codeActionsProviderDisposables.clear();
				}
			}
		};

		this._register(Event.runAndSubscribe(context.onDidChange, () => updateRegistration()));
	}

	private registerActions(context: ChatEntitlementContext, requests: ChatEntitlementRequests, controller: Lazy<ChatSetupController>): void {

		//#region Global Chat Setup Actions

		class ChatSetupTriggerAction extends Action2 {

			static CHAT_SETUP_ACTION_LABEL = localize2('triggerChatSetup', "Use AI Features with Copilot for free...");

			constructor() {
				super({
					id: CHAT_SETUP_ACTION_ID,
					title: ChatSetupTriggerAction.CHAT_SETUP_ACTION_LABEL,
					category: CHAT_CATEGORY,
					f1: true,
					precondition: ContextKeyExpr.or(
						ChatContextKeys.Setup.hidden,
						ChatContextKeys.Setup.disabled,
						ChatContextKeys.Setup.untrusted,
						ChatContextKeys.Setup.installed.negate(),
						ChatContextKeys.Entitlement.canSignUp
					)
				});
			}

			override async run(accessor: ServicesAccessor, mode?: ChatModeKind | string, options?: { forceSignInDialog?: boolean; additionalScopes?: readonly string[]; forceAnonymous?: ChatSetupAnonymous; inputValue?: string }): Promise<boolean> {
				const widgetService = accessor.get(IChatWidgetService);
				const instantiationService = accessor.get(IInstantiationService);
				const dialogService = accessor.get(IDialogService);
				const commandService = accessor.get(ICommandService);
				const lifecycleService = accessor.get(ILifecycleService);
				const configurationService = accessor.get(IConfigurationService);

				await context.update({ hidden: false });
				configurationService.updateValue(ChatTeardownContribution.CHAT_DISABLED_CONFIGURATION_KEY, false);

				if (mode) {
					const chatWidget = await widgetService.revealWidget();
					chatWidget?.input.setChatMode(mode);
				}

				if (options?.inputValue) {
					const chatWidget = await widgetService.revealWidget();
					chatWidget?.setInput(options.inputValue);
				}

				const setup = ChatSetup.getInstance(instantiationService, context, controller);
				const { success } = await setup.run(options);
				if (success === false && !lifecycleService.willShutdown) {
					const { confirmed } = await dialogService.confirm({
						type: Severity.Error,
						message: localize('setupErrorDialog', "Chat setup failed. Would you like to try again?"),
						primaryButton: localize('retry', "Retry"),
					});

					if (confirmed) {
						return Boolean(await commandService.executeCommand(CHAT_SETUP_ACTION_ID, mode, options));
					}
				}

				return Boolean(success);
			}
		}

		class ChatSetupTriggerSupportAnonymousAction extends Action2 {

			constructor() {
				super({
					id: CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID,
					title: ChatSetupTriggerAction.CHAT_SETUP_ACTION_LABEL
				});
			}

			override async run(accessor: ServicesAccessor): Promise<unknown> {
				const commandService = accessor.get(ICommandService);
				const telemetryService = accessor.get(ITelemetryService);
				const chatEntitlementService = accessor.get(IChatEntitlementService);

				telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: CHAT_SETUP_ACTION_ID, from: 'api' });

				return commandService.executeCommand(CHAT_SETUP_ACTION_ID, undefined, {
					forceAnonymous: chatEntitlementService.anonymous ? ChatSetupAnonymous.EnabledWithDialog : undefined
				});
			}
		}

		class ChatSetupTriggerForceSignInDialogAction extends Action2 {

			constructor() {
				super({
					id: 'workbench.action.chat.triggerSetupForceSignIn',
					title: localize2('forceSignIn', "Sign in to use AI features")
				});
			}

			override async run(accessor: ServicesAccessor): Promise<unknown> {
				const commandService = accessor.get(ICommandService);
				const telemetryService = accessor.get(ITelemetryService);

				telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: CHAT_SETUP_ACTION_ID, from: 'api' });

				return commandService.executeCommand(CHAT_SETUP_ACTION_ID, undefined, { forceSignInDialog: true });
			}
		}

		class ChatSetupTriggerAnonymousWithoutDialogAction extends Action2 {

			constructor() {
				super({
					id: 'workbench.action.chat.triggerSetupAnonymousWithoutDialog',
					title: ChatSetupTriggerAction.CHAT_SETUP_ACTION_LABEL
				});
			}

			override async run(accessor: ServicesAccessor): Promise<unknown> {
				const commandService = accessor.get(ICommandService);
				const telemetryService = accessor.get(ITelemetryService);

				telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: CHAT_SETUP_ACTION_ID, from: 'api' });

				return commandService.executeCommand(CHAT_SETUP_ACTION_ID, undefined, { forceAnonymous: ChatSetupAnonymous.EnabledWithoutDialog });
			}
		}

		class ChatSetupFromAccountsAction extends Action2 {

			constructor() {
				super({
					id: 'workbench.action.chat.triggerSetupFromAccounts',
					title: localize2('triggerChatSetupFromAccounts', "Sign in to use AI features..."),
					menu: {
						id: MenuId.AccountsContext,
						group: '2_copilot',
						when: ContextKeyExpr.and(
							ChatContextKeys.Setup.hidden.negate(),
							ChatContextKeys.Setup.installed.negate(),
							ChatContextKeys.Entitlement.signedOut
						)
					}
				});
			}

			override async run(accessor: ServicesAccessor): Promise<void> {
				const commandService = accessor.get(ICommandService);
				const telemetryService = accessor.get(ITelemetryService);

				telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: CHAT_SETUP_ACTION_ID, from: 'accounts' });

				return commandService.executeCommand(CHAT_SETUP_ACTION_ID);
			}
		}

		const windowFocusListener = this._register(new MutableDisposable());
		class UpgradePlanAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.chat.upgradePlan',
					title: localize2('managePlan', "Upgrade to GitHub Copilot Pro"),
					category: localize2('chat.category', 'Chat'),
					f1: true,
					precondition: ContextKeyExpr.and(
						ChatContextKeys.Setup.hidden.negate(),
						ContextKeyExpr.or(
							ChatContextKeys.Entitlement.canSignUp,
							ChatContextKeys.Entitlement.planFree
						)
					),
					menu: {
						id: MenuId.ChatTitleBarMenu,
						group: 'a_first',
						order: 1,
						when: ContextKeyExpr.and(
							ChatContextKeys.Entitlement.planFree,
							ContextKeyExpr.or(
								ChatContextKeys.chatQuotaExceeded,
								ChatContextKeys.completionsQuotaExceeded
							)
						)
					}
				});
			}

			override async run(accessor: ServicesAccessor): Promise<void> {
				const openerService = accessor.get(IOpenerService);
				const hostService = accessor.get(IHostService);
				const commandService = accessor.get(ICommandService);

				openerService.open(URI.parse(defaultChat.upgradePlanUrl));

				const entitlement = context.state.entitlement;
				if (!isProUser(entitlement)) {
					// If the user is not yet Pro, we listen to window focus to refresh the token
					// when the user has come back to the window assuming the user signed up.
					windowFocusListener.value = hostService.onDidChangeFocus(focus => this.onWindowFocus(focus, commandService));
				}
			}

			private async onWindowFocus(focus: boolean, commandService: ICommandService): Promise<void> {
				if (focus) {
					windowFocusListener.clear();

					const entitlements = await requests.forceResolveEntitlement(undefined);
					if (entitlements?.entitlement && isProUser(entitlements?.entitlement)) {
						refreshTokens(commandService);
					}
				}
			}
		}

		class EnableOveragesAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.chat.manageOverages',
					title: localize2('manageOverages', "Manage GitHub Copilot Overages"),
					category: localize2('chat.category', 'Chat'),
					f1: true,
					precondition: ContextKeyExpr.and(
						ChatContextKeys.Setup.hidden.negate(),
						ContextKeyExpr.or(
							ChatContextKeys.Entitlement.planPro,
							ChatContextKeys.Entitlement.planProPlus,
						)
					),
					menu: {
						id: MenuId.ChatTitleBarMenu,
						group: 'a_first',
						order: 1,
						when: ContextKeyExpr.and(
							ContextKeyExpr.or(
								ChatContextKeys.Entitlement.planPro,
								ChatContextKeys.Entitlement.planProPlus,
							),
							ContextKeyExpr.or(
								ChatContextKeys.chatQuotaExceeded,
								ChatContextKeys.completionsQuotaExceeded
							)
						)
					}
				});
			}

			override async run(accessor: ServicesAccessor): Promise<void> {
				const openerService = accessor.get(IOpenerService);
				openerService.open(URI.parse(defaultChat.manageOveragesUrl));
			}
		}

		registerAction2(ChatSetupTriggerAction);
		registerAction2(ChatSetupTriggerForceSignInDialogAction);
		registerAction2(ChatSetupFromAccountsAction);
		registerAction2(ChatSetupTriggerAnonymousWithoutDialogAction);
		registerAction2(ChatSetupTriggerSupportAnonymousAction);
		registerAction2(UpgradePlanAction);
		registerAction2(EnableOveragesAction);

		//#endregion

		//#region Editor Context Menu

		function registerGenerateCodeCommand(coreCommand: 'chat.internal.explain' | 'chat.internal.fix' | 'chat.internal.review' | 'chat.internal.generateDocs' | 'chat.internal.generateTests', actualCommand: string): void {

			CommandsRegistry.registerCommand(coreCommand, async accessor => {
				const commandService = accessor.get(ICommandService);
				const codeEditorService = accessor.get(ICodeEditorService);
				const markerService = accessor.get(IMarkerService);

				switch (coreCommand) {
					case 'chat.internal.explain':
					case 'chat.internal.fix': {
						const textEditor = codeEditorService.getActiveCodeEditor();
						const uri = textEditor?.getModel()?.uri;
						const range = textEditor?.getSelection();
						if (!uri || !range) {
							return;
						}

						const markers = AICodeActionsHelper.warningOrErrorMarkersAtRange(markerService, uri, range);

						const actualCommand = coreCommand === 'chat.internal.explain'
							? AICodeActionsHelper.explainMarkers(markers)
							: AICodeActionsHelper.fixMarkers(markers, range);

						await commandService.executeCommand(actualCommand.id, ...(actualCommand.arguments ?? []));

						break;
					}
					case 'chat.internal.review':
					case 'chat.internal.generateDocs':
					case 'chat.internal.generateTests': {
						const result = await commandService.executeCommand(CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID);
						if (result) {
							await commandService.executeCommand(actualCommand);
						}
					}
				}
			});
		}
		registerGenerateCodeCommand('chat.internal.explain', 'github.copilot.chat.explain');
		registerGenerateCodeCommand('chat.internal.fix', 'github.copilot.chat.fix');
		registerGenerateCodeCommand('chat.internal.review', 'github.copilot.chat.review');
		registerGenerateCodeCommand('chat.internal.generateDocs', 'github.copilot.chat.generateDocs');
		registerGenerateCodeCommand('chat.internal.generateTests', 'github.copilot.chat.generateTests');

		const internalGenerateCodeContext = ContextKeyExpr.and(
			ChatContextKeys.Setup.hidden.negate(),
			ChatContextKeys.Setup.disabled.negate(),
			ChatContextKeys.Setup.installed.negate(),
		);

		MenuRegistry.appendMenuItem(MenuId.EditorContext, {
			command: {
				id: 'chat.internal.explain',
				title: localize('explain', "Explain"),
			},
			group: '1_chat',
			order: 4,
			when: internalGenerateCodeContext
		});

		MenuRegistry.appendMenuItem(MenuId.ChatTextEditorMenu, {
			command: {
				id: 'chat.internal.fix',
				title: localize('fix', "Fix"),
			},
			group: '1_action',
			order: 1,
			when: ContextKeyExpr.and(
				internalGenerateCodeContext,
				EditorContextKeys.readOnly.negate()
			)
		});

		MenuRegistry.appendMenuItem(MenuId.ChatTextEditorMenu, {
			command: {
				id: 'chat.internal.review',
				title: localize('review', "Code Review"),
			},
			group: '1_action',
			order: 2,
			when: internalGenerateCodeContext
		});

		MenuRegistry.appendMenuItem(MenuId.ChatTextEditorMenu, {
			command: {
				id: 'chat.internal.generateDocs',
				title: localize('generateDocs', "Generate Docs"),
			},
			group: '2_generate',
			order: 1,
			when: ContextKeyExpr.and(
				internalGenerateCodeContext,
				EditorContextKeys.readOnly.negate()
			)
		});

		MenuRegistry.appendMenuItem(MenuId.ChatTextEditorMenu, {
			command: {
				id: 'chat.internal.generateTests',
				title: localize('generateTests', "Generate Tests"),
			},
			group: '2_generate',
			order: 2,
			when: ContextKeyExpr.and(
				internalGenerateCodeContext,
				EditorContextKeys.readOnly.negate()
			)
		});
	}

	private registerUrlLinkHandler(): void {
		this._register(ExtensionUrlHandlerOverrideRegistry.registerHandler(this.instantiationService.createInstance(ChatSetupExtensionUrlHandler)));
	}

	private async checkExtensionInstallation(context: ChatEntitlementContext): Promise<void> {

		// When developing extensions, await registration and then check
		if (this.environmentService.isExtensionDevelopment) {
			await this.extensionService.whenInstalledExtensionsRegistered();
			if (this.extensionService.extensions.find(ext => ExtensionIdentifier.equals(ext.identifier, defaultChat.chatExtensionId))) {
				context.update({ installed: true, disabled: false, untrusted: false });
				return;
			}
		}

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

			context.update({ installed, disabled, untrusted });
		}));
	}
}

class ChatSetupExtensionUrlHandler implements IExtensionUrlHandlerOverride {
	constructor(
		@IProductService private readonly productService: IProductService,
		@ICommandService private readonly commandService: ICommandService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IChatModeService private readonly chatModeService: IChatModeService,
	) { }

	canHandleURL(url: URI): boolean {
		return url.scheme === this.productService.urlProtocol && equalsIgnoreCase(url.authority, defaultChat.chatExtensionId);
	}

	async handleURL(url: URI): Promise<boolean> {
		const params = new URLSearchParams(url.query);
		this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: CHAT_SETUP_ACTION_ID, from: 'url', detail: params.get('referrer') ?? undefined });

		const agentParam = params.get('agent') ?? params.get('mode');
		const inputParam = params.get('prompt');
		if (!agentParam && !inputParam) {
			return false;
		}

		const agentId = agentParam ? this.resolveAgentId(agentParam) : undefined;
		await this.commandService.executeCommand(CHAT_SETUP_ACTION_ID, agentId, inputParam ? { inputValue: inputParam } : undefined);
		return true;
	}

	private resolveAgentId(agentParam: string): string | undefined {
		const agents = this.chatModeService.getModes();
		const allAgents = [...agents.builtin, ...agents.custom];

		const foundAgent = allAgents.find(agent => agent.id === agentParam);
		if (foundAgent) {
			return foundAgent.id;
		}

		const nameLower = agentParam.toLowerCase();
		const agentByName = allAgents.find(agent => agent.name.get().toLowerCase() === nameLower);
		return agentByName?.id;
	}
}

export class ChatTeardownContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatTeardown';

	static readonly CHAT_DISABLED_CONFIGURATION_KEY = 'chat.disableAIFeatures';

	constructor(
		@IChatEntitlementService chatEntitlementService: ChatEntitlementService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super();

		const context = chatEntitlementService.context?.value;
		if (!context) {
			return; // disabled
		}

		this.registerListeners();
		this.registerActions();

		this.handleChatDisabled(false);
	}

	private handleChatDisabled(fromEvent: boolean): void {
		const chatDisabled = this.configurationService.inspect(ChatTeardownContribution.CHAT_DISABLED_CONFIGURATION_KEY);
		if (chatDisabled.value === true) {
			this.maybeEnableOrDisableExtension(typeof chatDisabled.workspaceValue === 'boolean' ? EnablementState.DisabledWorkspace : EnablementState.DisabledGlobally);
			if (fromEvent) {
				this.maybeHideAuxiliaryBar();
			}
		} else if (chatDisabled.value === false && fromEvent /* do not enable extensions unless its an explicit settings change */) {
			this.maybeEnableOrDisableExtension(typeof chatDisabled.workspaceValue === 'boolean' ? EnablementState.EnabledWorkspace : EnablementState.EnabledGlobally);
		}
	}

	private async registerListeners(): Promise<void> {

		// Configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (!e.affectsConfiguration(ChatTeardownContribution.CHAT_DISABLED_CONFIGURATION_KEY)) {
				return;
			}

			this.handleChatDisabled(true);
		}));

		// Extension installation
		await this.extensionsWorkbenchService.queryLocal();
		this._register(this.extensionsWorkbenchService.onChange(e => {
			if (e && !ExtensionIdentifier.equals(e.identifier.id, defaultChat.chatExtensionId)) {
				return; // unrelated event
			}

			const defaultChatExtension = this.extensionsWorkbenchService.local.find(value => ExtensionIdentifier.equals(value.identifier.id, defaultChat.chatExtensionId));
			if (defaultChatExtension?.local && this.extensionEnablementService.isEnabled(defaultChatExtension.local)) {
				this.configurationService.updateValue(ChatTeardownContribution.CHAT_DISABLED_CONFIGURATION_KEY, false);
			}
		}));
	}

	private async maybeEnableOrDisableExtension(state: EnablementState.EnabledGlobally | EnablementState.EnabledWorkspace | EnablementState.DisabledGlobally | EnablementState.DisabledWorkspace): Promise<void> {
		const defaultChatExtension = this.extensionsWorkbenchService.local.find(value => ExtensionIdentifier.equals(value.identifier.id, defaultChat.chatExtensionId));
		if (!defaultChatExtension) {
			return;
		}

		await this.extensionsWorkbenchService.setEnablement([defaultChatExtension], state);
		await this.extensionsWorkbenchService.updateRunningExtensions(state === EnablementState.EnabledGlobally || state === EnablementState.EnabledWorkspace ? localize('restartExtensionHost.reason.enable', "Enabling AI features") : localize('restartExtensionHost.reason.disable', "Disabling AI features"));
	}

	private maybeHideAuxiliaryBar(): void {
		const activeContainers = this.viewDescriptorService.getViewContainersByLocation(ViewContainerLocation.AuxiliaryBar).filter(
			container => this.viewDescriptorService.getViewContainerModel(container).activeViewDescriptors.length > 0
		);
		const hasChatView = activeContainers.some(container => container.id === ChatViewContainerId);
		const hasAgentSessionsView = activeContainers.some(container => container.id === AGENT_SESSIONS_VIEW_CONTAINER_ID);
		if (
			(activeContainers.length === 0) ||  										// chat view is already gone but we know it was there before
			(activeContainers.length === 1 && (hasChatView || hasAgentSessionsView)) || // chat view or agent sessions is the only view which is going to go away
			(activeContainers.length === 2 && hasChatView && hasAgentSessionsView) 		// both chat and agent sessions view are going to go away
		) {
			this.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART); // hide if there are no views in the secondary sidebar
		}
	}

	private registerActions(): void {

		class ChatSetupHideAction extends Action2 {

			static readonly ID = 'workbench.action.chat.hideSetup';
			static readonly TITLE = localize2('hideChatSetup', "Learn How to Hide AI Features");

			constructor() {
				super({
					id: ChatSetupHideAction.ID,
					title: ChatSetupHideAction.TITLE,
					f1: true,
					category: CHAT_CATEGORY,
					precondition: ChatContextKeys.Setup.hidden.negate(),
					menu: {
						id: MenuId.ChatTitleBarMenu,
						group: 'z_hide',
						order: 1,
						when: ChatContextKeys.Setup.installed.negate()
					}
				});
			}

			override async run(accessor: ServicesAccessor): Promise<void> {
				const preferencesService = accessor.get(IPreferencesService);

				preferencesService.openSettings({ jsonEditor: false, query: `@id:${ChatTeardownContribution.CHAT_DISABLED_CONFIGURATION_KEY}` });
			}
		}

		registerAction2(ChatSetupHideAction);
	}
}

//#endregion

export function refreshTokens(commandService: ICommandService): void {
	// ugly, but we need to signal to the extension that entitlements changed
	commandService.executeCommand(defaultChat.completionsRefreshTokenCommand);
	commandService.executeCommand(defaultChat.chatRefreshTokenCommand);
}
