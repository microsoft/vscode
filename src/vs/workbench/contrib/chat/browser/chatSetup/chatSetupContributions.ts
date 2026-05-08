/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction, WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable, DisposableStore, markAsSingleton, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import Severity from '../../../../../base/common/severity.js';
import { equalsIgnoreCase } from '../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IsWebContext } from '../../../../../platform/contextkey/common/contextkeys.js';
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
import { InEditorZenModeContext } from '../../../../common/contextkeys.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { IExtension, IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../common/constants.js';
import { CHAT_CATEGORY, CHAT_SETUP_ACTION_ID, CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID } from '../actions/chatActions.js';
import { ChatViewContainerId, IChatWidget, IChatWidgetService } from '../chat.js';
import { chatViewsWelcomeRegistry } from '../viewsWelcome/chatViewsWelcome.js';
import { ChatSetupAnonymous, ChatSetupStrategy } from './chatSetup.js';
import { ChatSetupController } from './chatSetupController.js';
import { GrowthSessionController, registerGrowthSession } from './chatSetupGrowthSession.js';
import { AICodeActionsHelper, AINewSymbolNamesProvider, ChatCodeActionsProvider, SetupAgent } from './chatSetupProviders.js';
import { ChatSetup } from './chatSetupRunner.js';

const defaultChat = {
	chatExtensionId: product.defaultChatAgent?.chatExtensionId ?? '',
	manageOverageUrl: product.defaultChatAgent?.manageOverageUrl ?? '',
	upgradePlanUrl: product.defaultChatAgent?.upgradePlanUrl ?? '',
	chatRefreshTokenCommand: product.defaultChatAgent?.chatRefreshTokenCommand ?? '',
};

const SIGN_IN_TITLE_BAR_ACTION_ID = 'workbench.action.chat.signInIndicator';

export class ChatSetupContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatSetup';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatEntitlementService chatEntitlementService: ChatEntitlementService,
		@ILogService private readonly logService: ILogService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		const context = chatEntitlementService.context?.value;
		const requests = chatEntitlementService.requests?.value;
		if (!context || !requests) {
			return; // disabled
		}

		const controller = new Lazy(() => this._register(this.instantiationService.createInstance(ChatSetupController, context, requests)));

		this.registerSetupAgents(context, controller);
		this.registerGrowthSession(chatEntitlementService);
		this.registerActions(context, requests, controller);
		this.registerSignInTitleBarEntry(actionViewItemService);
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
				if (!context.state.hidden && !context.state.disabledInWorkspace) {

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
						disposables.add(SetupAgent.registerDefaultAgents(this.instantiationService, ChatAgentLocation.Terminal, ChatModeKind.Ask, context, controller).disposable);
						disposables.add(SetupAgent.registerDefaultAgents(this.instantiationService, ChatAgentLocation.Notebook, ChatModeKind.Ask, context, controller).disposable);
						disposables.add(SetupAgent.registerDefaultAgents(this.instantiationService, ChatAgentLocation.EditorInline, ChatModeKind.Ask, context, controller).disposable);
					}

					// Built-In Agent + Tool (unless completed, signed-in and enabled)
					if ((!context.state.completed || context.state.entitlement === ChatEntitlement.Unknown || context.state.entitlement === ChatEntitlement.Unresolved) && !vscodeAgentDisposables.value) {
						const disposables = vscodeAgentDisposables.value = new DisposableStore();
						disposables.add(SetupAgent.registerBuiltInAgents(this.instantiationService, context, controller));
					}
				} else {
					defaultAgentDisposables.clear();
					vscodeAgentDisposables.clear();
				}

				if (context.state.completed) {
					vscodeAgentDisposables.clear(); // we need to do this to prevent showing duplicate agent/tool entries in the list
				}
			}

			// Rename Provider
			{
				if (!context.state.completed && !context.state.hidden && !context.state.disabledInWorkspace) {
					if (!renameProviderDisposables.value) {
						renameProviderDisposables.value = AINewSymbolNamesProvider.registerProvider(this.instantiationService, context, controller);
					}
				} else {
					renameProviderDisposables.clear();
				}
			}

			// Code Actions Provider
			{
				if (!context.state.completed && !context.state.hidden && !context.state.disabledInWorkspace) {
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

	private registerGrowthSession(chatEntitlementService: ChatEntitlementService): void {
		const growthSessionDisposables = markAsSingleton(new MutableDisposable());

		const updateGrowthSession = () => {
			const experimentEnabled = this.configurationService.getValue<boolean>(ChatConfiguration.GrowthNotificationEnabled) === true;
			// Show for users who don't have completed the Chat setup yet.
			// Additional conditions (e.g., anonymous, entitlement) can be layered here.
			const shouldShow = experimentEnabled && !chatEntitlementService.sentiment.completed;
			if (shouldShow && !growthSessionDisposables.value) {
				const disposables = new DisposableStore();
				const controller = disposables.add(this.instantiationService.createInstance(GrowthSessionController));
				if (!controller.isDismissed) {
					disposables.add(registerGrowthSession(this.chatSessionsService, controller));
					// Fully unregister when dismissed to prevent cached session from
					// appearing during filtered model updates from other providers.
					disposables.add(controller.onDidDismiss(() => {
						growthSessionDisposables.clear();
					}));
					growthSessionDisposables.value = disposables;
				} else {
					disposables.dispose();
				}
			} else if (!shouldShow) {
				growthSessionDisposables.clear();
			}
		};

		this._register(chatEntitlementService.onDidChangeSentiment(() => updateGrowthSession()));
		updateGrowthSession();
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
						ChatContextKeys.Setup.disabledInWorkspace,
						ChatContextKeys.Setup.untrusted,
						ChatContextKeys.Setup.completed.negate(),
						ChatContextKeys.Entitlement.canSignUp
					)
				});
			}

			override async run(accessor: ServicesAccessor, mode?: ChatModeKind | string, options?: { forceSignInDialog?: boolean; additionalScopes?: readonly string[]; forceAnonymous?: ChatSetupAnonymous; inputValue?: string; dialogIcon?: ThemeIcon; dialogTitle?: string; setupStrategy?: ChatSetupStrategy; disableCloseButton?: boolean; onSignInStarted?: () => void }): Promise<boolean> {
				const widgetService = accessor.get(IChatWidgetService);
				const instantiationService = accessor.get(IInstantiationService);
				const dialogService = accessor.get(IDialogService);
				const commandService = accessor.get(ICommandService);
				const lifecycleService = accessor.get(ILifecycleService);
				const configurationService = accessor.get(IConfigurationService);

				await context.update({ hidden: false });
				configurationService.updateValue(ChatConfiguration.AIDisabled, false);

				if (mode) {
					const chatWidget = await widgetService.revealWidget();
					if (chatWidget) {
						const resolvedMode = this.resolveAgentId(mode, chatWidget);
						if (resolvedMode) {
							chatWidget.input.setChatMode(resolvedMode);
						}
					}
				}

				if (options?.inputValue) {
					const chatWidget = await widgetService.revealWidget();
					chatWidget?.input.showScrollbarUntilAccept();
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

			private resolveAgentId(agentParam: string, chatWidget: IChatWidget): string | undefined {
				const modes = chatWidget.input.currentChatModesObs.get();
				const foundAgent = modes.findModeById(agentParam);
				if (foundAgent) {
					return foundAgent.id;
				}
				const allAgents = [...modes.builtin, ...modes.custom];
				const nameLower = agentParam.toLowerCase();
				const agentByName = allAgents.find(agent => agent.name.get().toLowerCase() === nameLower);
				return agentByName?.id;
			}
		}

		class ChatSetupTriggerSupportAnonymousAction extends Action2 {

			constructor() {
				super({
					id: CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID,
					title: ChatSetupTriggerAction.CHAT_SETUP_ACTION_LABEL
				});
			}

			override async run(accessor: ServicesAccessor, options?: { dialogIcon?: ThemeIcon; dialogTitle?: string; setupStrategy?: ChatSetupStrategy }): Promise<unknown> {
				const commandService = accessor.get(ICommandService);
				const telemetryService = accessor.get(ITelemetryService);
				const chatEntitlementService = accessor.get(IChatEntitlementService);

				telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: CHAT_SETUP_ACTION_ID, from: 'api' });

				return commandService.executeCommand(CHAT_SETUP_ACTION_ID, undefined, {
					forceAnonymous: chatEntitlementService.anonymous ? ChatSetupAnonymous.EnabledWithDialog : undefined,
					...options
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
							ChatContextKeys.Setup.disabledInWorkspace.negate(),
							ChatContextKeys.Setup.completed.negate(),
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

		class ChatSetupSignInTitleBarAction extends Action2 {

			static readonly ID = SIGN_IN_TITLE_BAR_ACTION_ID;

			constructor() {
				super({
					id: ChatSetupSignInTitleBarAction.ID,
					title: localize('signInIndicatorTitleBarAction', 'Sign In'),
					f1: false,
					menu: [{
						id: MenuId.TitleBarAdjacentCenter,
						order: 0, // same position as the update button
						when: ContextKeyExpr.and(
							IsWebContext.negate(),

							ChatContextKeys.Entitlement.signedOut,
							ChatContextKeys.Setup.hidden.negate(),
							ChatContextKeys.Setup.disabledInWorkspace.negate(),
							ContextKeyExpr.has('updateTitleBar').negate(),
							InEditorZenModeContext.negate(),
						),
					}]
				});
			}

			override async run(accessor: ServicesAccessor): Promise<void> {
				const commandService = accessor.get(ICommandService);
				const telemetryService = accessor.get(ITelemetryService);

				telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: CHAT_SETUP_ACTION_ID, from: 'titlebar' });

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
						ChatContextKeys.Setup.disabledInWorkspace.negate(),
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
				const telemetryService = accessor.get(ITelemetryService);

				telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: 'workbench.action.chat.upgradePlan', from: 'command' });
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

					const entitlements = await requests.forceResolveEntitlement();
					if (entitlements?.entitlement && isProUser(entitlements?.entitlement)) {
						refreshTokens(commandService);
					}
				}
			}
		}

		class ManageAdditionalSpendAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.chat.manageAdditionalSpend',
					title: localize2('manageAdditionalSpend', "Manage GitHub Copilot Additional Spend"),
					category: localize2('chat.category', 'Chat'),
					f1: true,
					precondition: ContextKeyExpr.and(
						ChatContextKeys.Setup.hidden.negate(),
						ChatContextKeys.Setup.disabledInWorkspace.negate(),
						ContextKeyExpr.or(
							ChatContextKeys.Entitlement.planPro,
							ChatContextKeys.Entitlement.planProPlus,
							ChatContextKeys.Entitlement.planMax,
							ChatContextKeys.Entitlement.planEdu,
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
								ChatContextKeys.Entitlement.planMax,
								ChatContextKeys.Entitlement.planEdu,
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
				const telemetryService = accessor.get(ITelemetryService);
				telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: 'workbench.action.chat.manageAdditionalSpend', from: 'command' });
				openerService.open(URI.parse(defaultChat.manageOverageUrl));
			}
		}

		registerAction2(ChatSetupTriggerAction);
		registerAction2(ChatSetupTriggerForceSignInDialogAction);
		registerAction2(ChatSetupFromAccountsAction);
		registerAction2(ChatSetupSignInTitleBarAction);
		registerAction2(ChatSetupTriggerAnonymousWithoutDialogAction);
		registerAction2(ChatSetupTriggerSupportAnonymousAction);
		registerAction2(UpgradePlanAction);
		registerAction2(ManageAdditionalSpendAction);

		//#endregion

		//#region Editor Context Menu

		function registerGenerateCodeCommand(coreCommand: 'chat.internal.explain' | 'chat.internal.fix' | 'chat.internal.review' | 'chat.internal.codeReview.run', actualCommand: string): void {

			CommandsRegistry.registerCommand(coreCommand, async (accessor, ...args) => {
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
					case 'chat.internal.review': {
						const result = await commandService.executeCommand(CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID);
						if (result) {
							await commandService.executeCommand(actualCommand);
						}
						break;
					}
					case 'chat.internal.codeReview.run': {
						return commandService.executeCommand(actualCommand, ...args);
					}
				}
			});
		}
		registerGenerateCodeCommand('chat.internal.explain', 'github.copilot.chat.explain');
		registerGenerateCodeCommand('chat.internal.fix', 'github.copilot.chat.fix');
		registerGenerateCodeCommand('chat.internal.review', 'github.copilot.chat.review');
		registerGenerateCodeCommand('chat.internal.codeReview.run', 'github.copilot.chat.codeReview.run');

		const internalGenerateCodeContext = ContextKeyExpr.and(
			ChatContextKeys.Setup.hidden.negate(),
			ChatContextKeys.Setup.disabledInWorkspace.negate(),
			ChatContextKeys.Setup.completed.negate(),
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

		MenuRegistry.appendMenuItem(MenuId.EditorContext, {
			command: {
				id: 'chat.internal.fix',
				title: localize('fix', "Fix"),
			},
			group: '1_chat',
			order: 5,
			when: ContextKeyExpr.and(
				internalGenerateCodeContext,
				EditorContextKeys.readOnly.negate()
			)
		});

		MenuRegistry.appendMenuItem(MenuId.EditorContext, {
			command: {
				id: 'chat.internal.review',
				title: localize('review', "Code Review"),
			},
			group: '1_chat',
			order: 6,
			when: internalGenerateCodeContext
		});

	}

	private registerSignInTitleBarEntry(actionViewItemService: IActionViewItemService): void {
		this._register(actionViewItemService.register(
			MenuId.TitleBarAdjacentCenter,
			SIGN_IN_TITLE_BAR_ACTION_ID,
			(action, options) => new SignInTitleBarEntry(action, options)
		));
	}

	private registerUrlLinkHandler(): void {
		this._register(ExtensionUrlHandlerOverrideRegistry.registerHandler(this.instantiationService.createInstance(ChatSetupExtensionUrlHandler)));
	}

	private async checkExtensionInstallation(context: ChatEntitlementContext): Promise<void> {

		// When developing extensions, await registration and then check
		if (this.environmentService.isExtensionDevelopment) {
			await this.extensionService.whenInstalledExtensionsRegistered();
			if (this.extensionService.extensions.find(ext => ExtensionIdentifier.equals(ext.identifier, defaultChat.chatExtensionId))) {
				context.update({ installed: true, disabled: false, untrusted: false, disabledInWorkspace: false });
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
			let disabledInWorkspace = false;
			if (installed) {
				disabled = !this.extensionEnablementService.isEnabled(defaultChatExtension.local);
				if (disabled) {
					const state = this.extensionEnablementService.getEnablementState(defaultChatExtension.local);
					if (state === EnablementState.DisabledByTrustRequirement) {
						disabled = false; // not disabled by user choice but
						untrusted = true; // by missing workspace trust
					} else if (state === EnablementState.DisabledWorkspace) {
						disabledInWorkspace = true; // disabled at workspace level
					}
				}
			} else {
				disabled = false;
			}

			context.update({ installed, disabled, untrusted, disabledInWorkspace });
		}));
	}
}

class ChatSetupExtensionUrlHandler implements IExtensionUrlHandlerOverride {
	constructor(
		@IProductService private readonly productService: IProductService,
		@ICommandService private readonly commandService: ICommandService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
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

		await this.commandService.executeCommand(CHAT_SETUP_ACTION_ID, agentParam, inputParam ? { inputValue: inputParam } : undefined);
		return true;
	}

}

export class ChatTeardownContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatTeardown';

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
		const chatDisabled = this.configurationService.inspect(ChatConfiguration.AIDisabled);
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
			if (!e.affectsConfiguration(ChatConfiguration.AIDisabled)) {
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
				if (defaultChatExtension.enablementState === EnablementState.EnabledWorkspace) {
					if (this.configurationService.inspect(ChatConfiguration.AIDisabled).workspaceValue === true) {
						this.configurationService.updateValue(ChatConfiguration.AIDisabled, false, ConfigurationTarget.WORKSPACE);
					}
				} else {
					this.configurationService.updateValue(ChatConfiguration.AIDisabled, false);
				}
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
		if (
			(activeContainers.length === 0) ||  													// chat view is already gone but we know it was there before
			(activeContainers.length === 1 && activeContainers.at(0)?.id === ChatViewContainerId) 	// chat view is the only view which is going to go away
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
					precondition: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
					menu: {
						id: MenuId.ChatTitleBarMenu,
						group: 'z_hide',
						order: 1,
						when: ChatContextKeys.Setup.completed.negate()
					}
				});
			}

			override async run(accessor: ServicesAccessor): Promise<void> {
				const preferencesService = accessor.get(IPreferencesService);

				preferencesService.openSettings({ jsonEditor: false, query: `@id:${ChatConfiguration.AIDisabled}` });
			}
		}

		registerAction2(ChatSetupHideAction);
	}
}

//#endregion

export function refreshTokens(commandService: ICommandService): void {
	// ugly, but we need to signal to the extension that entitlements changed
	commandService.executeCommand(defaultChat.chatRefreshTokenCommand);
}

/**
 * Custom action view item that renders a "Sign In" button
 * in the title bar with prominent button styling.
 */
class SignInTitleBarEntry extends BaseActionViewItem {

	private label: HTMLElement | undefined;

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions,
	) {
		super(undefined, action, options);
	}

	public override render(container: HTMLElement) {
		super.render(container);

		container.setAttribute('role', 'button');
		container.setAttribute('aria-label', this.action.label);

		const content = dom.append(container, dom.$('.update-indicator.prominent'));
		this.label = dom.append(content, dom.$('.indicator-label'));
		this.label.textContent = this.action.label;
	}

	protected override updateLabel(): void {
		if (this.label) {
			this.label.textContent = this.action.label;
		}
		if (this.element) {
			this.element.setAttribute('aria-label', this.action.label);
		}
	}

	protected override updateEnabled(): void {
		if (this.element) {
			this.element.classList.toggle('disabled', !this.action.enabled);
		}
	}
}
