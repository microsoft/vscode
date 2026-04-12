/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as dom from '../../../../../base/browser/dom.js';
import { BaseActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Event } from '../../../../../base/common/event.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable, DisposableStore, markAsSingleton, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import Severity from '../../../../../base/common/severity.js';
import { equalsIgnoreCase } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
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
import { IViewDescriptorService } from '../../../../common/views.js';
import { ChatEntitlement, IChatEntitlementService, isProUser } from '../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchExtensionEnablementService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { ExtensionUrlHandlerOverrideRegistry } from '../../../../services/extensions/browser/extensionUrlHandler.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatModeService } from '../../common/chatModes.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../common/constants.js';
import { CHAT_CATEGORY, CHAT_SETUP_ACTION_ID, CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID } from '../actions/chatActions.js';
import { ChatViewContainerId, IChatWidgetService } from '../chat.js';
import { chatViewsWelcomeRegistry } from '../viewsWelcome/chatViewsWelcome.js';
import { ChatSetupAnonymous } from './chatSetup.js';
import { ChatSetupController } from './chatSetupController.js';
import { GrowthSessionController, registerGrowthSession } from './chatSetupGrowthSession.js';
import { AICodeActionsHelper, AINewSymbolNamesProvider, ChatCodeActionsProvider, SetupAgent } from './chatSetupProviders.js';
import { ChatSetup } from './chatSetupRunner.js';
const defaultChat = {
    chatExtensionId: product.defaultChatAgent?.chatExtensionId ?? '',
    manageOveragesUrl: product.defaultChatAgent?.manageOverageUrl ?? '',
    upgradePlanUrl: product.defaultChatAgent?.upgradePlanUrl ?? '',
    completionsRefreshTokenCommand: product.defaultChatAgent?.completionsRefreshTokenCommand ?? '',
    chatRefreshTokenCommand: product.defaultChatAgent?.chatRefreshTokenCommand ?? '',
};
const SIGN_IN_TITLE_BAR_ACTION_ID = 'workbench.action.chat.signInIndicator';
let ChatSetupContribution = class ChatSetupContribution extends Disposable {
    static { this.ID = 'workbench.contrib.chatSetup'; }
    constructor(actionViewItemService, instantiationService, chatEntitlementService, logService, contextKeyService, extensionEnablementService, extensionsWorkbenchService, extensionService, environmentService, chatSessionsService, configurationService) {
        super();
        this.instantiationService = instantiationService;
        this.logService = logService;
        this.contextKeyService = contextKeyService;
        this.extensionEnablementService = extensionEnablementService;
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.extensionService = extensionService;
        this.environmentService = environmentService;
        this.chatSessionsService = chatSessionsService;
        this.configurationService = configurationService;
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
    registerSetupAgents(context, controller) {
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
                        disposables.add(SetupAgent.registerDefaultAgents(this.instantiationService, ChatAgentLocation.Terminal, ChatModeKind.Ask, context, controller).disposable);
                        disposables.add(SetupAgent.registerDefaultAgents(this.instantiationService, ChatAgentLocation.Notebook, ChatModeKind.Ask, context, controller).disposable);
                        disposables.add(SetupAgent.registerDefaultAgents(this.instantiationService, ChatAgentLocation.EditorInline, ChatModeKind.Ask, context, controller).disposable);
                    }
                    // Built-In Agent + Tool (unless completed, signed-in and enabled)
                    if ((!context.state.completed || context.state.entitlement === ChatEntitlement.Unknown || context.state.entitlement === ChatEntitlement.Unresolved) && !vscodeAgentDisposables.value) {
                        const disposables = vscodeAgentDisposables.value = new DisposableStore();
                        disposables.add(SetupAgent.registerBuiltInAgents(this.instantiationService, context, controller));
                    }
                }
                else {
                    defaultAgentDisposables.clear();
                    vscodeAgentDisposables.clear();
                }
                if (context.state.completed && !context.state.disabled) {
                    vscodeAgentDisposables.clear(); // we need to do this to prevent showing duplicate agent/tool entries in the list
                }
            }
            // Rename Provider
            {
                if (!context.state.completed && !context.state.hidden && !context.state.disabled) {
                    if (!renameProviderDisposables.value) {
                        renameProviderDisposables.value = AINewSymbolNamesProvider.registerProvider(this.instantiationService, context, controller);
                    }
                }
                else {
                    renameProviderDisposables.clear();
                }
            }
            // Code Actions Provider
            {
                if (!context.state.completed && !context.state.hidden && !context.state.disabled) {
                    if (!codeActionsProviderDisposables.value) {
                        codeActionsProviderDisposables.value = ChatCodeActionsProvider.registerProvider(this.instantiationService);
                    }
                }
                else {
                    codeActionsProviderDisposables.clear();
                }
            }
        };
        this._register(Event.runAndSubscribe(context.onDidChange, () => updateRegistration()));
    }
    registerGrowthSession(chatEntitlementService) {
        const growthSessionDisposables = markAsSingleton(new MutableDisposable());
        const updateGrowthSession = () => {
            const experimentEnabled = this.configurationService.getValue(ChatConfiguration.GrowthNotificationEnabled) === true;
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
                }
                else {
                    disposables.dispose();
                }
            }
            else if (!shouldShow) {
                growthSessionDisposables.clear();
            }
        };
        this._register(chatEntitlementService.onDidChangeSentiment(() => updateGrowthSession()));
        updateGrowthSession();
    }
    registerActions(context, requests, controller) {
        //#region Global Chat Setup Actions
        class ChatSetupTriggerAction extends Action2 {
            static { this.CHAT_SETUP_ACTION_LABEL = localize2('triggerChatSetup', "Use AI Features with Copilot for free..."); }
            constructor() {
                super({
                    id: CHAT_SETUP_ACTION_ID,
                    title: ChatSetupTriggerAction.CHAT_SETUP_ACTION_LABEL,
                    category: CHAT_CATEGORY,
                    f1: true,
                    precondition: ContextKeyExpr.or(ChatContextKeys.Setup.hidden, ChatContextKeys.Setup.disabled, ChatContextKeys.Setup.untrusted, ChatContextKeys.Setup.completed.negate(), ChatContextKeys.Entitlement.canSignUp)
                });
            }
            async run(accessor, mode, options) {
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
                    chatWidget?.input.setChatMode(mode);
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
        }
        class ChatSetupTriggerSupportAnonymousAction extends Action2 {
            constructor() {
                super({
                    id: CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID,
                    title: ChatSetupTriggerAction.CHAT_SETUP_ACTION_LABEL
                });
            }
            async run(accessor, options) {
                const commandService = accessor.get(ICommandService);
                const telemetryService = accessor.get(ITelemetryService);
                const chatEntitlementService = accessor.get(IChatEntitlementService);
                telemetryService.publicLog2('workbenchActionExecuted', { id: CHAT_SETUP_ACTION_ID, from: 'api' });
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
            async run(accessor) {
                const commandService = accessor.get(ICommandService);
                const telemetryService = accessor.get(ITelemetryService);
                telemetryService.publicLog2('workbenchActionExecuted', { id: CHAT_SETUP_ACTION_ID, from: 'api' });
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
            async run(accessor) {
                const commandService = accessor.get(ICommandService);
                const telemetryService = accessor.get(ITelemetryService);
                telemetryService.publicLog2('workbenchActionExecuted', { id: CHAT_SETUP_ACTION_ID, from: 'api' });
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
                        when: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.completed.negate(), ChatContextKeys.Entitlement.signedOut)
                    }
                });
            }
            async run(accessor) {
                const commandService = accessor.get(ICommandService);
                const telemetryService = accessor.get(ITelemetryService);
                telemetryService.publicLog2('workbenchActionExecuted', { id: CHAT_SETUP_ACTION_ID, from: 'accounts' });
                return commandService.executeCommand(CHAT_SETUP_ACTION_ID);
            }
        }
        class ChatSetupSignInTitleBarAction extends Action2 {
            static { this.ID = SIGN_IN_TITLE_BAR_ACTION_ID; }
            constructor() {
                super({
                    id: ChatSetupSignInTitleBarAction.ID,
                    title: localize('signInIndicatorTitleBarAction', 'Sign In'),
                    f1: false,
                    menu: [{
                            id: MenuId.TitleBarAdjacentCenter,
                            order: 0, // same position as the update button
                            when: ContextKeyExpr.and(IsWebContext.negate(), ContextKeyExpr.has(`config.${ChatConfiguration.SignInTitleBarEnabled}`), ChatContextKeys.Entitlement.signedOut, ChatContextKeys.Setup.hidden.negate(), ContextKeyExpr.has('updateTitleBar').negate()),
                        }]
                });
            }
            async run(accessor) {
                const commandService = accessor.get(ICommandService);
                const telemetryService = accessor.get(ITelemetryService);
                telemetryService.publicLog2('workbenchActionExecuted', { id: CHAT_SETUP_ACTION_ID, from: 'titlebar' });
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
                    precondition: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ContextKeyExpr.or(ChatContextKeys.Entitlement.canSignUp, ChatContextKeys.Entitlement.planFree)),
                    menu: {
                        id: MenuId.ChatTitleBarMenu,
                        group: 'a_first',
                        order: 1,
                        when: ContextKeyExpr.and(ChatContextKeys.Entitlement.planFree, ContextKeyExpr.or(ChatContextKeys.chatQuotaExceeded, ChatContextKeys.completionsQuotaExceeded))
                    }
                });
            }
            async run(accessor) {
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
            async onWindowFocus(focus, commandService) {
                if (focus) {
                    windowFocusListener.clear();
                    const entitlements = await requests.forceResolveEntitlement();
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
                    precondition: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ContextKeyExpr.or(ChatContextKeys.Entitlement.planPro, ChatContextKeys.Entitlement.planProPlus, ChatContextKeys.Entitlement.planEdu)),
                    menu: {
                        id: MenuId.ChatTitleBarMenu,
                        group: 'a_first',
                        order: 1,
                        when: ContextKeyExpr.and(ContextKeyExpr.or(ChatContextKeys.Entitlement.planPro, ChatContextKeys.Entitlement.planProPlus, ChatContextKeys.Entitlement.planEdu), ContextKeyExpr.or(ChatContextKeys.chatQuotaExceeded, ChatContextKeys.completionsQuotaExceeded))
                    }
                });
            }
            async run(accessor) {
                const openerService = accessor.get(IOpenerService);
                openerService.open(URI.parse(defaultChat.manageOveragesUrl));
            }
        }
        registerAction2(ChatSetupTriggerAction);
        registerAction2(ChatSetupTriggerForceSignInDialogAction);
        registerAction2(ChatSetupFromAccountsAction);
        registerAction2(ChatSetupSignInTitleBarAction);
        registerAction2(ChatSetupTriggerAnonymousWithoutDialogAction);
        registerAction2(ChatSetupTriggerSupportAnonymousAction);
        registerAction2(UpgradePlanAction);
        registerAction2(EnableOveragesAction);
        //#endregion
        //#region Editor Context Menu
        function registerGenerateCodeCommand(coreCommand, actualCommand) {
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
        const internalGenerateCodeContext = ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabled.negate(), ChatContextKeys.Setup.completed.negate());
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
            when: ContextKeyExpr.and(internalGenerateCodeContext, EditorContextKeys.readOnly.negate())
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
    registerSignInTitleBarEntry(actionViewItemService) {
        this._register(actionViewItemService.register(MenuId.TitleBarAdjacentCenter, SIGN_IN_TITLE_BAR_ACTION_ID, (action, options) => new SignInTitleBarEntry(action, options)));
    }
    registerUrlLinkHandler() {
        this._register(ExtensionUrlHandlerOverrideRegistry.registerHandler(this.instantiationService.createInstance(ChatSetupExtensionUrlHandler)));
    }
    async checkExtensionInstallation(context) {
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
        this._register(Event.runAndSubscribe(this.extensionsWorkbenchService.onChange, e => {
            if (e && !ExtensionIdentifier.equals(e.identifier.id, defaultChat.chatExtensionId)) {
                return; // unrelated event
            }
            const defaultChatExtension = this.extensionsWorkbenchService.local.find(value => ExtensionIdentifier.equals(value.identifier.id, defaultChat.chatExtensionId));
            const installed = !!defaultChatExtension?.local;
            let disabled;
            let untrusted = false;
            if (installed) {
                disabled = !this.extensionEnablementService.isEnabled(defaultChatExtension.local);
                if (disabled) {
                    const state = this.extensionEnablementService.getEnablementState(defaultChatExtension.local);
                    if (state === 0 /* EnablementState.DisabledByTrustRequirement */) {
                        disabled = false; // not disabled by user choice but
                        untrusted = true; // by missing workspace trust
                    }
                }
            }
            else {
                disabled = false;
            }
            context.update({ installed, disabled, untrusted });
        }));
    }
};
ChatSetupContribution = __decorate([
    __param(0, IActionViewItemService),
    __param(1, IInstantiationService),
    __param(2, IChatEntitlementService),
    __param(3, ILogService),
    __param(4, IContextKeyService),
    __param(5, IWorkbenchExtensionEnablementService),
    __param(6, IExtensionsWorkbenchService),
    __param(7, IExtensionService),
    __param(8, IEnvironmentService),
    __param(9, IChatSessionsService),
    __param(10, IConfigurationService)
], ChatSetupContribution);
export { ChatSetupContribution };
let ChatSetupExtensionUrlHandler = class ChatSetupExtensionUrlHandler {
    constructor(productService, commandService, telemetryService, chatModeService) {
        this.productService = productService;
        this.commandService = commandService;
        this.telemetryService = telemetryService;
        this.chatModeService = chatModeService;
    }
    canHandleURL(url) {
        return url.scheme === this.productService.urlProtocol && equalsIgnoreCase(url.authority, defaultChat.chatExtensionId);
    }
    async handleURL(url) {
        const params = new URLSearchParams(url.query);
        this.telemetryService.publicLog2('workbenchActionExecuted', { id: CHAT_SETUP_ACTION_ID, from: 'url', detail: params.get('referrer') ?? undefined });
        const agentParam = params.get('agent') ?? params.get('mode');
        const inputParam = params.get('prompt');
        if (!agentParam && !inputParam) {
            return false;
        }
        const agentId = agentParam ? this.resolveAgentId(agentParam) : undefined;
        await this.commandService.executeCommand(CHAT_SETUP_ACTION_ID, agentId, inputParam ? { inputValue: inputParam } : undefined);
        return true;
    }
    resolveAgentId(agentParam) {
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
};
ChatSetupExtensionUrlHandler = __decorate([
    __param(0, IProductService),
    __param(1, ICommandService),
    __param(2, ITelemetryService),
    __param(3, IChatModeService)
], ChatSetupExtensionUrlHandler);
let ChatTeardownContribution = class ChatTeardownContribution extends Disposable {
    static { this.ID = 'workbench.contrib.chatTeardown'; }
    constructor(chatEntitlementService, configurationService, extensionsWorkbenchService, extensionEnablementService, viewDescriptorService, layoutService) {
        super();
        this.configurationService = configurationService;
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.extensionEnablementService = extensionEnablementService;
        this.viewDescriptorService = viewDescriptorService;
        this.layoutService = layoutService;
        const context = chatEntitlementService.context?.value;
        if (!context) {
            return; // disabled
        }
        this.registerListeners();
        this.registerActions();
        this.handleChatDisabled(false);
    }
    handleChatDisabled(fromEvent) {
        const chatDisabled = this.configurationService.inspect(ChatConfiguration.AIDisabled);
        if (chatDisabled.value === true) {
            this.maybeEnableOrDisableExtension(typeof chatDisabled.workspaceValue === 'boolean' ? 11 /* EnablementState.DisabledWorkspace */ : 10 /* EnablementState.DisabledGlobally */);
            if (fromEvent) {
                this.maybeHideAuxiliaryBar();
            }
        }
        else if (chatDisabled.value === false && fromEvent /* do not enable extensions unless its an explicit settings change */) {
            this.maybeEnableOrDisableExtension(typeof chatDisabled.workspaceValue === 'boolean' ? 13 /* EnablementState.EnabledWorkspace */ : 12 /* EnablementState.EnabledGlobally */);
        }
    }
    async registerListeners() {
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
                this.configurationService.updateValue(ChatConfiguration.AIDisabled, false);
            }
        }));
    }
    async maybeEnableOrDisableExtension(state) {
        const defaultChatExtension = this.extensionsWorkbenchService.local.find(value => ExtensionIdentifier.equals(value.identifier.id, defaultChat.chatExtensionId));
        if (!defaultChatExtension) {
            return;
        }
        await this.extensionsWorkbenchService.setEnablement([defaultChatExtension], state);
        await this.extensionsWorkbenchService.updateRunningExtensions(state === 12 /* EnablementState.EnabledGlobally */ || state === 13 /* EnablementState.EnabledWorkspace */ ? localize('restartExtensionHost.reason.enable', "Enabling AI features") : localize('restartExtensionHost.reason.disable', "Disabling AI features"));
    }
    maybeHideAuxiliaryBar() {
        const activeContainers = this.viewDescriptorService.getViewContainersByLocation(2 /* ViewContainerLocation.AuxiliaryBar */).filter(container => this.viewDescriptorService.getViewContainerModel(container).activeViewDescriptors.length > 0);
        if ((activeContainers.length === 0) || // chat view is already gone but we know it was there before
            (activeContainers.length === 1 && activeContainers.at(0)?.id === ChatViewContainerId) // chat view is the only view which is going to go away
        ) {
            this.layoutService.setPartHidden(true, "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */); // hide if there are no views in the secondary sidebar
        }
    }
    registerActions() {
        class ChatSetupHideAction extends Action2 {
            static { this.ID = 'workbench.action.chat.hideSetup'; }
            static { this.TITLE = localize2('hideChatSetup', "Learn How to Hide AI Features"); }
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
                        when: ChatContextKeys.Setup.completed.negate()
                    }
                });
            }
            async run(accessor) {
                const preferencesService = accessor.get(IPreferencesService);
                preferencesService.openSettings({ jsonEditor: false, query: `@id:${ChatConfiguration.AIDisabled}` });
            }
        }
        registerAction2(ChatSetupHideAction);
    }
};
ChatTeardownContribution = __decorate([
    __param(0, IChatEntitlementService),
    __param(1, IConfigurationService),
    __param(2, IExtensionsWorkbenchService),
    __param(3, IWorkbenchExtensionEnablementService),
    __param(4, IViewDescriptorService),
    __param(5, IWorkbenchLayoutService)
], ChatTeardownContribution);
export { ChatTeardownContribution };
//#endregion
export function refreshTokens(commandService) {
    // ugly, but we need to signal to the extension that entitlements changed
    commandService.executeCommand(defaultChat.completionsRefreshTokenCommand);
    commandService.executeCommand(defaultChat.chatRefreshTokenCommand);
}
/**
 * Custom action view item that renders a "Sign In" button
 * in the title bar with prominent button styling.
 */
class SignInTitleBarEntry extends BaseActionViewItem {
    constructor(action, options) {
        super(undefined, action, options);
    }
    render(container) {
        super.render(container);
        container.setAttribute('role', 'button');
        container.setAttribute('aria-label', this.action.label);
        const content = dom.append(container, dom.$('.update-indicator.prominent'));
        this.label = dom.append(content, dom.$('.indicator-label'));
        this.label.textContent = this.action.label;
    }
    updateLabel() {
        if (this.label) {
            this.label.textContent = this.action.label;
        }
        if (this.element) {
            this.element.setAttribute('aria-label', this.action.label);
        }
    }
    updateEnabled() {
        if (this.element) {
            this.element.classList.toggle('disabled', !this.action.enabled);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFNldHVwQ29udHJpYnV0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0U2V0dXAvY2hhdFNldHVwQ29udHJpYnV0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9DQUFvQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxrQkFBa0IsRUFBOEIsTUFBTSw2REFBNkQsQ0FBQztBQUU3SCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUQsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFILE9BQU8sUUFBUSxNQUFNLHdDQUF3QyxDQUFDO0FBQzlELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRXpFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUV4RCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUNqRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN0RixPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVELE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQzFHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBRSxlQUFlLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNuSCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsZUFBZSxFQUFFLE1B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