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
var SetupAgent_1, AINewSymbolNamesProvider_1, ChatCodeActionsProvider_1;
import { raceTimeout, timeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import product from '../../../../../platform/product/common/product.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { nullExtensionDescription } from '../../../../services/extensions/common/extensions.js';
import { ILanguageModelToolsService, ToolDataSource } from '../../common/tools/languageModelToolsService.js';
import { IChatAgentService } from '../../common/participants/chatAgents.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { ChatRequestModel } from '../../common/model/chatModel.js';
import { ChatMode } from '../../common/chatModes.js';
import { ChatRequestAgentPart, ChatRequestToolPart } from '../../common/requestParser/chatParserTypes.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../common/constants.js';
import { ILanguageModelsService } from '../../common/languageModels.js';
import { CHAT_OPEN_ACTION_ID, CHAT_SETUP_ACTION_ID } from '../actions/chatActions.js';
import { ChatViewId, IChatWidgetService } from '../chat.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { CodeActionKind } from '../../../../../editor/contrib/codeAction/common/types.js';
import { ACTION_START as INLINE_CHAT_START } from '../../../inlineChat/common/inlineChat.js';
import { IMarkerService, MarkerSeverity } from '../../../../../platform/markers/common/markers.js';
import { ChatGlobalPerfMark, markChatGlobal } from '../../common/chatPerf.js';
import { ChatSetupAnonymous, ChatSetupStep, maybeEnableAuthExtension, refreshTokens } from './chatSetup.js';
import { ChatSetup } from './chatSetupRunner.js';
import { chatViewsWelcomeRegistry } from '../viewsWelcome/chatViewsWelcome.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
const defaultChat = {
    extensionId: product.defaultChatAgent?.extensionId ?? '',
    chatExtensionId: product.defaultChatAgent?.chatExtensionId ?? '',
    provider: product.defaultChatAgent?.provider ?? { default: { id: '', name: '' }, enterprise: { id: '', name: '' }, apple: { id: '', name: '' }, google: { id: '', name: '' } },
    outputChannelId: product.defaultChatAgent?.chatExtensionOutputId ?? '',
    outputExtensionStateCommand: product.defaultChatAgent?.chatExtensionOutputExtensionStateCommand ?? '',
};
const ToolsAgentContextKey = ContextKeyExpr.and(ContextKeyExpr.equals(`config.${ChatConfiguration.AgentEnabled}`, true), ContextKeyExpr.not(`previewFeaturesDisabled`) // Set by extension
);
let SetupAgent = class SetupAgent extends Disposable {
    static { SetupAgent_1 = this; }
    static registerDefaultAgents(instantiationService, location, mode, context, controller) {
        return instantiationService.invokeFunction(accessor => {
            const chatAgentService = accessor.get(IChatAgentService);
            let description;
            if (mode === ChatModeKind.Ask) {
                description = ChatMode.Ask.description.get();
            }
            else if (mode === ChatModeKind.Edit) {
                description = ChatMode.Edit.description.get();
            }
            else {
                description = ChatMode.Agent.description.get();
            }
            let id;
            switch (location) {
                case ChatAgentLocation.Chat:
                    if (mode === ChatModeKind.Ask) {
                        id = 'setup.chat';
                    }
                    else if (mode === ChatModeKind.Edit) {
                        id = 'setup.edits';
                    }
                    else {
                        id = 'setup.agent';
                    }
                    break;
                case ChatAgentLocation.Terminal:
                    id = 'setup.terminal';
                    break;
                case ChatAgentLocation.EditorInline:
                    id = 'setup.editor';
                    break;
                case ChatAgentLocation.Notebook:
                    id = 'setup.notebook';
                    break;
            }
            return SetupAgent_1.doRegisterAgent(instantiationService, chatAgentService, id, `${defaultChat.provider.default.name} Copilot` /* Do NOT change, this hides the username altogether in Chat */, true, description, location, mode, context, controller);
        });
    }
    static registerBuiltInAgents(instantiationService, context, controller) {
        return instantiationService.invokeFunction(accessor => {
            const chatAgentService = accessor.get(IChatAgentService);
            const disposables = new DisposableStore();
            // Register VSCode agent
            const { disposable: vscodeDisposable } = SetupAgent_1.doRegisterAgent(instantiationService, chatAgentService, 'setup.vscode', 'vscode', false, localize2('vscodeAgentDescription', "Ask questions about VS Code").value, ChatAgentLocation.Chat, ChatModeKind.Agent, context, controller);
            disposables.add(vscodeDisposable);
            // Register workspace agent
            const { disposable: workspaceDisposable } = SetupAgent_1.doRegisterAgent(instantiationService, chatAgentService, 'setup.workspace', 'workspace', false, localize2('workspaceAgentDescription', "Ask about your workspace").value, ChatAgentLocation.Chat, ChatModeKind.Agent, context, controller);
            disposables.add(workspaceDisposable);
            // Register terminal agent
            const { disposable: terminalDisposable } = SetupAgent_1.doRegisterAgent(instantiationService, chatAgentService, 'setup.terminal.agent', 'terminal', false, localize2('terminalAgentDescription', "Ask how to do something in the terminal").value, ChatAgentLocation.Chat, ChatModeKind.Agent, context, controller);
            disposables.add(terminalDisposable);
            // Register tools
            disposables.add(SetupTool.registerTool(instantiationService, {
                id: 'setup_tools_createNewWorkspace',
                source: ToolDataSource.Internal,
                icon: Codicon.newFolder,
                displayName: localize('setupToolDisplayName', "New Workspace"),
                modelDescription: 'Scaffold a new workspace in VS Code',
                userDescription: localize('setupToolsDescription', "Scaffold a new workspace in VS Code"),
                canBeReferencedInPrompt: true,
                toolReferenceName: 'new',
                when: ContextKeyExpr.true(),
            }));
            return disposables;
        });
    }
    static doRegisterAgent(instantiationService, chatAgentService, id, name, isDefault, description, location, mode, context, controller) {
        const disposables = new DisposableStore();
        disposables.add(chatAgentService.registerAgent(id, {
            id,
            name,
            isDefault,
            isCore: true,
            modes: [mode],
            when: mode === ChatModeKind.Agent ? ToolsAgentContextKey?.serialize() : undefined,
            slashCommands: [],
            disambiguation: [],
            locations: [location],
            metadata: { helpTextPrefix: SetupAgent_1.SETUP_NEEDED_MESSAGE },
            description,
            extensionId: nullExtensionDescription.identifier,
            extensionVersion: undefined,
            extensionDisplayName: nullExtensionDescription.name,
            extensionPublisherId: nullExtensionDescription.publisher
        }));
        const agent = disposables.add(instantiationService.createInstance(SetupAgent_1, context, controller, location));
        disposables.add(chatAgentService.registerAgentImplementation(id, agent));
        if (mode === ChatModeKind.Agent) {
            chatAgentService.updateAgent(id, { themeIcon: Codicon.tools });
        }
        return { agent, disposable: disposables };
    }
    static { this.SETUP_NEEDED_MESSAGE = new MarkdownString(localize('settingUpCopilotNeeded', "You need to set up GitHub Copilot and be signed in to use Chat.")); }
    static { this.TRUST_NEEDED_MESSAGE = new MarkdownString(localize('trustNeeded', "You need to trust this workspace to use Chat.")); }
    static { this.CHAT_RETRY_COMMAND_ID = 'workbench.action.chat.retrySetup'; }
    static { this.CHAT_SHOW_OUTPUT_COMMAND_ID = 'workbench.action.chat.showOutput'; }
    constructor(context, controller, location, instantiationService, logService, telemetryService, environmentService, workspaceTrustManagementService, chatEntitlementService, viewsService, contextKeyService, outputService, extensionsWorkbenchService, commandService) {
        super();
        this.context = context;
        this.controller = controller;
        this.location = location;
        this.instantiationService = instantiationService;
        this.logService = logService;
        this.telemetryService = telemetryService;
        this.environmentService = environmentService;
        this.workspaceTrustManagementService = workspaceTrustManagementService;
        this.chatEntitlementService = chatEntitlementService;
        this.viewsService = viewsService;
        this.contextKeyService = contextKeyService;
        this.outputService = outputService;
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.commandService = commandService;
        this._onUnresolvableError = this._register(new Emitter());
        this.onUnresolvableError = this._onUnresolvableError.event;
        this.pendingForwardedRequests = new ResourceMap();
        this.registerCommands();
    }
    registerCommands() {
        // Retry chat command
        this._register(CommandsRegistry.registerCommand(SetupAgent_1.CHAT_RETRY_COMMAND_ID, async (accessor, sessionResource) => {
            const hostService = accessor.get(IHostService);
            const chatWidgetService = accessor.get(IChatWidgetService);
            const widget = chatWidgetService.getWidgetBySessionResource(sessionResource);
            await widget?.clear();
            hostService.reload();
        }));
        // Show output command: execute extension state command if available, then show output channel
        this._register(CommandsRegistry.registerCommand(SetupAgent_1.CHAT_SHOW_OUTPUT_COMMAND_ID, async (accessor) => {
            const commandService = accessor.get(ICommandService);
            if (defaultChat.outputExtensionStateCommand) {
                // Command invocation may fail or is blocked by the extension activating
                // so we just don't wait and timeout after a certain time, logging the error if it fails or times out.
                raceTimeout(commandService.executeCommand(defaultChat.outputExtensionStateCommand), 5000, () => this.logService.info('[chat setup] Timed out executing extension state command')).then(undefined, error => {
                    this.logService.info('[chat setup] Failed to execute extension state command', error);
                });
            }
            if (defaultChat.outputChannelId) {
                await commandService.executeCommand(`workbench.action.output.show.${defaultChat.outputChannelId}`);
            }
        }));
    }
    async invoke(request, progress) {
        return this.instantiationService.invokeFunction(async (accessor /* using accessor for lazy loading */) => {
            const chatService = accessor.get(IChatService);
            const languageModelsService = accessor.get(ILanguageModelsService);
            const chatWidgetService = accessor.get(IChatWidgetService);
            const chatAgentService = accessor.get(IChatAgentService);
            const languageModelToolsService = accessor.get(ILanguageModelToolsService);
            const defaultAccountService = accessor.get(IDefaultAccountService);
            return this.doInvoke(request, part => progress([part]), chatService, languageModelsService, chatWidgetService, chatAgentService, languageModelToolsService, defaultAccountService);
        });
    }
    async doInvoke(request, progress, chatService, languageModelsService, chatWidgetService, chatAgentService, languageModelToolsService, defaultAccountService) {
        if (!this.context.state.completed || // Setup not completed
            this.context.state.disabled || // Extension disabled: run setup to enable
            this.context.state.untrusted || // Workspace untrusted: run setup to ask for trust
            this.context.state.entitlement === ChatEntitlement.Available || // Entitlement available: run setup to sign up
            (this.context.state.entitlement === ChatEntitlement.Unknown && // Entitlement unknown: run setup to sign in / sign up
                !this.chatEntitlementService.anonymous // unless anonymous access is enabled
            )) {
            return this.doInvokeWithSetup(request, progress, chatService, languageModelsService, chatWidgetService, chatAgentService, languageModelToolsService, defaultAccountService);
        }
        return this.doInvokeWithoutSetup(request, progress, chatService, languageModelsService, chatWidgetService, chatAgentService, languageModelToolsService);
    }
    async doInvokeWithoutSetup(request, progress, chatService, languageModelsService, chatWidgetService, chatAgentService, languageModelToolsService) {
        const requestModel = chatWidgetService.getWidgetBySessionResource(request.sessionResource)?.viewModel?.model.getRequests().at(-1);
        if (!requestModel) {
            this.logService.error('[chat setup] Request model not found, cannot redispatch request.');
            return {}; // this should not happen
        }
        progress({
            kind: 'progressMessage',
            content: new MarkdownString(localize('waitingChat', "Getting chat ready")),
            shimmer: true,
        });
        await this.forwardRequestToChat(requestModel, progress, chatService, languageModelsService, chatAgentService, chatWidgetService, languageModelToolsService);
        return {};
    }
    async forwardRequestToChat(requestModel, progress, chatService, languageModelsService, chatAgentService, chatWidgetService, languageModelToolsService) {
        try {
            await this.doForwardRequestToChat(requestModel, progress, chatService, languageModelsService, chatAgentService, chatWidgetService, languageModelToolsService);
        }
        catch (error) {
            this.logService.error('[chat setup] Failed to forward request to chat', error);
            progress({
                kind: 'warning',
                content: new MarkdownString(localize('copilotUnavailableWarning', "Failed to get a response. Please try again."))
            });
        }
    }
    async doForwardRequestToChat(requestModel, progress, chatService, languageModelsService, chatAgentService, chatWidgetService, languageModelToolsService) {
        if (this.pendingForwardedRequests.has(requestModel.session.sessionResource)) {
            throw new Error('Request already in progress');
        }
        const forwardRequest = this.doForwardRequestToChatWhenReady(requestModel, progress, chatService, languageModelsService, chatAgentService, chatWidgetService, languageModelToolsService);
        this.pendingForwardedRequests.set(requestModel.session.sessionResource, forwardRequest);
        try {
            await forwardRequest;
        }
        finally {
            this.pendingForwardedRequests.delete(requestModel.session.sessionResource);
        }
    }
    async doForwardRequestToChatWhenReady(requestModel, progress, chatService, languageModelsService, chatAgentService, chatWidgetService, languageModelToolsService) {
        // Ensure auth extension is enabled before waiting for chat readiness.
        // This must run before the readiness event listeners are set up because
        // updateRunningExtensions restarts all extension hosts.
        const authExtensionReEnabled = await maybeEnableAuthExtension(this.extensionsWorkbenchService, this.logService);
        if (authExtensionReEnabled) {
            refreshTokens(this.commandService);
        }
        const widget = chatWidgetService.getWidgetBySessionResource(requestModel.session.sessionResource);
        const modeInfo = widget?.input.currentModeInfo;
        // We need a signal to know when we can resend the request to
        // Chat. Waiting for the registration of the agent is not
        // enough, we also need a language/tools model to be available.
        let agentActivated = false;
        let agentReady = false;
        let languageModelReady = false;
        let toolsModelReady = false;
        markChatGlobal(ChatGlobalPerfMark.WillWaitForActivation);
        const whenAgentActivated = this.whenAgentActivated(chatService).then(() => agentActivated = true);
        const whenAgentReady = this.whenAgentReady(chatAgentService, modeInfo?.kind)?.then(() => agentReady = true);
        if (!whenAgentReady) {
            agentReady = true;
        }
        const whenLanguageModelReady = this.whenLanguageModelReady(languageModelsService, requestModel.modelId)?.then(() => languageModelReady = true);
        if (!whenLanguageModelReady) {
            languageModelReady = true;
        }
        const whenToolsModelReady = this.whenToolsModelReady(languageModelToolsService, requestModel)?.then(() => toolsModelReady = true);
        if (!whenToolsModelReady) {
            toolsModelReady = true;
        }
        if (whenLanguageModelReady instanceof Promise || whenAgentReady instanceof Promise || whenToolsModelReady instanceof Promise) {
            const timeoutHandle = setTimeout(() => {
                progress({
                    kind: 'progressMessage',
                    content: new MarkdownString(localize('waitingChat2', "Chat is almost ready")),
                    shimmer: true,
                });
            }, 10000);
            const disposables = new DisposableStore();
            disposables.add(toDisposable(() => clearTimeout(timeoutHandle)));
            try {
                const allReady = Promise.allSettled([
                    whenAgentActivated,
                    whenAgentReady,
                    whenLanguageModelReady,
                    whenToolsModelReady
                ]);
                const ready = await Promise.race([
                    timeout(this.environmentService.remoteAuthority ? 60000 /* increase for remote scenarios */ : 20000).then(() => 'timedout'),
                    this.whenPanelAgentHasGuidance(disposables).then(() => 'panelGuidance'),
                    allReady
                ]);
                if (ready === 'panelGuidance') {
                    const warningMessage = localize('chatTookLongWarningExtension', "Please try again.");
                    progress({
                        kind: 'markdownContent',
                        content: new MarkdownString(warningMessage)
                    });
                    // This means Chat is unhealthy and we cannot retry the
                    // request. Signal this to the outside via an event.
                    this._onUnresolvableError.fire();
                    return;
                }
                if (ready === 'timedout') {
                    let warningMessage;
                    if (this.chatEntitlementService.anonymous) {
                        warningMessage = localize('chatTookLongWarningAnonymous', "Chat took too long to get ready. Please ensure that the extension `{0}` is installed and enabled. Click restart to try again if this issue persists.", defaultChat.chatExtensionId);
                    }
                    else {
                        warningMessage = localize('chatTookLongWarning', "Chat took too long to get ready. Please ensure you are signed in to {0} and that the extension `{1}` is installed and enabled. Click restart to try again if this issue persists.", defaultChat.provider.default.name, defaultChat.chatExtensionId);
                    }
                    const diagnosticInfo = this.computeDiagnosticInfo(agentActivated, agentReady, languageModelReady, toolsModelReady, requestModel, languageModelsService, chatAgentService, modeInfo);
                    this.logService.warn(`[chat setup] ${warningMessage}`, diagnosticInfo);
                    this.telemetryService.publicLog2('chatSetup.timeout', diagnosticInfo);
                    progress({
                        kind: 'warning',
                        content: new MarkdownString(warningMessage)
                    });
                    if (defaultChat.outputChannelId && this.outputService.getChannelDescriptor(defaultChat.outputChannelId)) {
                        progress({
                            kind: 'command',
                            command: {
                                id: SetupAgent_1.CHAT_SHOW_OUTPUT_COMMAND_ID,
                                title: localize('showCopilotChatDetails', "Show Details")
                            }
                        });
                    }
                    else {
                        this.logService.warn(defaultChat.outputChannelId
                            ? `[chat setup] No output channel found for id '${defaultChat.outputChannelId}' to show details about chat setup timeout. Please ensure the ${defaultChat.chatExtensionId} extension is activated.`
                            : '[chat setup] No output channel provided via product.json to show details about chat setup timeout.');
                        progress({
                            kind: 'command',
                            command: {
                                id: SetupAgent_1.CHAT_RETRY_COMMAND_ID,
                                title: localize('retryChat', "Restart"),
                                arguments: [requestModel.session.sessionResource]
                            }
                        });
                    }
                    // Wait for all readiness signals and log/send
                    // telemetry about recovery after the timeout.
                    await allReady;
                    const recoveryDiagnosticInfo = this.computeDiagnosticInfo(agentActivated, agentReady, languageModelReady, toolsModelReady, requestModel, languageModelsService, chatAgentService, modeInfo);
                    this.logService.info('[chat setup] Chat setup timeout recovered', recoveryDiagnosticInfo);
                    this.telemetryService.publicLog2('chatSetup.timeoutRecovery', recoveryDiagnosticInfo);
                }
            }
            finally {
                disposables.dispose();
            }
        }
        markChatGlobal(ChatGlobalPerfMark.DidWaitForActivation);
        await chatService.resendRequest(requestModel, {
            ...widget?.getModeRequestOptions(),
            modeInfo,
            userSelectedModelId: widget?.input.currentLanguageModel
        });
    }
    async whenPanelAgentHasGuidance(disposables) {
        const panelAgentHasGuidance = () => chatViewsWelcomeRegistry.get().some(descriptor => this.contextKeyService.contextMatchesRules(descriptor.when));
        if (panelAgentHasGuidance()) {
            return;
        }
        return new Promise(resolve => {
            let descriptorKeys = new Set();
            const updateDescriptorKeys = () => {
                const descriptors = chatViewsWelcomeRegistry.get();
                descriptorKeys = new Set(descriptors.flatMap(d => d.when.keys()));
            };
            updateDescriptorKeys();
            const onDidChangeRegistry = Event.map(chatViewsWelcomeRegistry.onDidChange, () => 'registry');
            const onDidChangeRelevantContext = Event.map(Event.filter(this.contextKeyService.onDidChangeContext, e => e.affectsSome(descriptorKeys)), () => 'context');
            disposables.add(Event.any(onDidChangeRegistry, onDidChangeRelevantContext)(source => {
                if (source === 'registry') {
                    updateDescriptorKeys();
                }
                if (panelAgentHasGuidance()) {
                    resolve();
                }
            }));
        });
    }
    whenLanguageModelReady(languageModelsService, modelId) {
        const hasModelForRequest = () => {
            if (modelId) {
                return !!languageModelsService.lookupLanguageModel(modelId);
            }
            for (const id of languageModelsService.getLanguageModelIds()) {
                const model = languageModelsService.lookupLanguageModel(id);
                if (model?.isDefaultForLocation[ChatAgentLocation.Chat]) {
                    return true;
                }
            }
            return false;
        };
        if (hasModelForRequest()) {
            return;
        }
        return Event.toPromise(Event.filter(languageModelsService.onDidChangeLanguageModels, () => hasModelForRequest()));
    }
    whenToolsModelReady(languageModelToolsService, requestModel) {
        const needsToolsModel = requestModel.message.parts.some(part => part instanceof ChatRequestToolPart);
        if (!needsToolsModel) {
            return; // No tools in this request, no need to check
        }
        // check that tools other than setup. and internal tools are registered.
        for (const tool of languageModelToolsService.getAllToolsIncludingDisabled()) {
            if (tool.id.startsWith('copilot_')) {
                return; // we have tools!
            }
        }
        return Event.toPromise(Event.filter(languageModelToolsService.onDidChangeTools, () => {
            for (const tool of languageModelToolsService.getAllToolsIncludingDisabled()) {
                if (tool.id.startsWith('copilot_')) {
                    return true; // we have tools!
                }
            }
            return false; // no external tools found
        }));
    }
    whenAgentReady(chatAgentService, mode) {
        const defaultAgent = chatAgentService.getDefaultAgent(this.location, mode);
        if (defaultAgent && !defaultAgent.isCore) {
            return; // we have a default agent from an extension!
        }
        return Event.toPromise(Event.filter(chatAgentService.onDidChangeAgents, () => {
            const defaultAgent = chatAgentService.getDefaultAgent(this.location, mode);
            return Boolean(defaultAgent && !defaultAgent.isCore);
        }));
    }
    async whenAgentActivated(chatService) {
        try {
            await chatService.activateDefaultAgent(this.location);
        }
        catch (error) {
            this.logService.error(error);
        }
    }
    computeDiagnosticInfo(agentActivated, agentReady, languageModelReady, toolsModelReady, requestModel, languageModelsService, chatAgentService, modeInfo) {
        const languageModelIds = languageModelsService.getLanguageModelIds();
        let languageModelDefaultCount = 0;
        for (const id of languageModelIds) {
            const model = languageModelsService.lookupLanguageModel(id);
            if (model?.isDefaultForLocation[ChatAgentLocation.Chat]) {
                languageModelDefaultCount++;
            }
        }
        const defaultAgent = chatAgentService.getDefaultAgent(this.location, modeInfo?.kind);
        const contributedDefaultAgent = chatAgentService.getContributedDefaultAgent(this.location);
        const chatViewPane = this.viewsService.getActiveViewWithId(ChatViewId);
        const matchingWelcomeView = chatViewPane?.getMatchingWelcomeView();
        return {
            agentActivated,
            agentReady,
            agentHasDefault: !!defaultAgent,
            agentDefaultIsCore: defaultAgent?.isCore ?? false,
            agentHasContributedDefault: !!contributedDefaultAgent,
            agentContributedDefaultIsCore: contributedDefaultAgent?.isCore ?? false,
            agentActivatedCount: chatAgentService.getActivatedAgents().length,
            agentLocation: this.location,
            agentModeKind: modeInfo?.kind ?? '',
            languageModelReady,
            languageModelCount: languageModelIds.length,
            languageModelDefaultCount,
            languageModelHasRequestedModel: !!requestModel.modelId,
            toolsModelReady,
            isRemote: !!this.environmentService.remoteAuthority,
            isAnonymous: this.chatEntitlementService.anonymous,
            matchingWelcomeViewWhen: matchingWelcomeView?.when.serialize() ?? (chatViewPane ? 'noWelcomeView' : 'noChatViewPane'),
        };
    }
    async doInvokeWithSetup(request, progress, chatService, languageModelsService, chatWidgetService, chatAgentService, languageModelToolsService, defaultAccountService) {
        this.telemetryService.publicLog2('workbenchActionExecuted', { id: CHAT_SETUP_ACTION_ID, from: 'chat' });
        const widget = chatWidgetService.getWidgetBySessionResource(request.sessionResource);
        const requestModel = widget?.viewModel?.model.getRequests().at(-1);
        const setupListener = Event.runAndSubscribe(this.controller.value.onDidChange, (() => {
            switch (this.controller.value.step) {
                case ChatSetupStep.SigningIn:
                    progress({
                        kind: 'progressMessage',
                        content: new MarkdownString(localize('setupChatSignIn2', "Signing in to {0}", defaultAccountService.getDefaultAccountAuthenticationProvider().name)),
                        shimmer: true,
                    });
                    break;
                case ChatSetupStep.Installing:
                    progress({
                        kind: 'progressMessage',
                        content: new MarkdownString(localize('installingChat', "Getting chat ready")),
                        shimmer: true,
                    });
                    break;
            }
        }));
        let result = undefined;
        try {
            result = await ChatSetup.getInstance(this.instantiationService, this.context, this.controller).run({
                disableChatViewReveal: true, // we are already in a chat context
                forceAnonymous: this.chatEntitlementService.anonymous ? ChatSetupAnonymous.EnabledWithoutDialog : undefined // only enable anonymous selectively
            });
        }
        catch (error) {
            this.logService.error(`[chat setup] Error during setup: ${toErrorMessage(error)}`);
        }
        finally {
            setupListener.dispose();
        }
        // User has agreed to run the setup
        if (typeof result?.success === 'boolean') {
            if (result.success) {
                if (result.dialogSkipped) {
                    await widget?.clear(); // make room for the Chat welcome experience
                }
                else if (requestModel) {
                    let newRequest = this.replaceAgentInRequestModel(requestModel, chatAgentService); // Replace agent part with the actual Chat agent...
                    newRequest = this.replaceToolInRequestModel(newRequest); // ...then replace any tool parts with the actual Chat tools
                    await this.forwardRequestToChat(newRequest, progress, chatService, languageModelsService, chatAgentService, chatWidgetService, languageModelToolsService);
                }
            }
            else {
                progress({
                    kind: 'warning',
                    content: new MarkdownString(localize('chatSetupError', "Chat setup failed."))
                });
            }
        }
        // User has cancelled the setup
        else {
            progress({
                kind: 'markdownContent',
                content: this.workspaceTrustManagementService.isWorkspaceTrusted() ? SetupAgent_1.SETUP_NEEDED_MESSAGE : SetupAgent_1.TRUST_NEEDED_MESSAGE
            });
        }
        return {};
    }
    replaceAgentInRequestModel(requestModel, chatAgentService) {
        const agentPart = requestModel.message.parts.find((r) => r instanceof ChatRequestAgentPart);
        if (!agentPart) {
            return requestModel;
        }
        const agentId = agentPart.agent.id.replace(/setup\./, `${defaultChat.extensionId}.`.toLowerCase());
        const githubAgent = chatAgentService.getAgent(agentId);
        if (!githubAgent) {
            return requestModel;
        }
        const newAgentPart = new ChatRequestAgentPart(agentPart.range, agentPart.editorRange, githubAgent);
        return new ChatRequestModel({
            session: requestModel.session,
            message: {
                parts: requestModel.message.parts.map(part => {
                    if (part instanceof ChatRequestAgentPart) {
                        return newAgentPart;
                    }
                    return part;
                }),
                text: requestModel.message.text
            },
            variableData: requestModel.variableData,
            timestamp: Date.now(),
            attempt: requestModel.attempt,
            modeInfo: requestModel.modeInfo,
            confirmation: requestModel.confirmation,
            locationData: requestModel.locationData,
            attachedContext: requestModel.attachedContext,
            isCompleteAddedRequest: requestModel.isCompleteAddedRequest,
        });
    }
    replaceToolInRequestModel(requestModel) {
        const toolPart = requestModel.message.parts.find((r) => r instanceof ChatRequestToolPart);
        if (!toolPart) {
            return requestModel;
        }
        const toolId = toolPart.toolId.replace(/setup.tools\./, `copilot_`.toLowerCase());
        const newToolPart = new ChatRequestToolPart(toolPart.range, toolPart.editorRange, toolPart.toolName, toolId, toolPart.displayName, toolPart.icon);
        const chatRequestToolEntry = {
            id: toolId,
            name: 'new',
            range: toolPart.range,
            kind: 'tool',
            value: undefined
        };
        const variableData = {
            variables: [chatRequestToolEntry]
        };
        return new ChatRequestModel({
            session: requestModel.session,
            message: {
                parts: requestModel.message.parts.map(part => {
                    if (part instanceof ChatRequestToolPart) {
                        return newToolPart;
                    }
                    return part;
                }),
                text: requestModel.message.text
            },
            variableData: variableData,
            timestamp: Date.now(),
            attempt: requestModel.attempt,
            modeInfo: requestModel.modeInfo,
            confirmation: requestModel.confirmation,
            locationData: requestModel.locationData,
            attachedContext: [chatRequestToolEntry],
            isCompleteAddedRequest: requestModel.isCompleteAddedRequest,
        });
    }
};
SetupAgent = SetupAgent_1 = __decorate([
    __param(3, IInstantiationService),
    __param(4, ILogService),
    __param(5, ITelemetryService),
    __param(6, IWorkbenchEnvironmentService),
    __param(7, IWorkspaceTrustManagementService),
    __param(8, IChatEntitlementService),
    __param(9, IViewsService),
    __param(10, IContextKeyService),
    __param(11, IOutputService),
    __param(12, IExtensionsWorkbenchService),
    __param(13, ICommandService)
], SetupAgent);
export { SetupAgent };
export class SetupTool {
    static registerTool(instantiationService, toolData) {
        return instantiationService.invokeFunction(accessor => {
            const toolService = accessor.get(ILanguageModelToolsService);
            const tool = instantiationService.createInstance(SetupTool);
            return toolService.registerTool(toolData, tool);
        });
    }
    async invoke(invocation, countTokens, progress, token) {
        const result = {
            content: [
                {
                    kind: 'text',
                    value: ''
                }
            ]
        };
        return result;
    }
    async prepareToolInvocation(parameters, token) {
        return undefined;
    }
}
let AINewSymbolNamesProvider = AINewSymbolNamesProvider_1 = class AINewSymbolNamesProvider {
    static registerProvider(instantiationService, context, controller) {
        return instantiationService.invokeFunction(accessor => {
            const languageFeaturesService = accessor.get(ILanguageFeaturesService);
            const provider = instantiationService.createInstance(AINewSymbolNamesProvider_1, context, controller);
            return languageFeaturesService.newSymbolNamesProvider.register('*', provider);
        });
    }
    constructor(context, controller, instantiationService, chatEntitlementService) {
        this.context = context;
        this.controller = controller;
        this.instantiationService = instantiationService;
        this.chatEntitlementService = chatEntitlementService;
    }
    async provideNewSymbolNames(model, range, triggerKind, token) {
        await this.instantiationService.invokeFunction(accessor => {
            return ChatSetup.getInstance(this.instantiationService, this.context, this.controller).run({
                forceAnonymous: this.chatEntitlementService.anonymous ? ChatSetupAnonymous.EnabledWithDialog : undefined
            });
        });
        return [];
    }
};
AINewSymbolNamesProvider = AINewSymbolNamesProvider_1 = __decorate([
    __param(2, IInstantiationService),
    __param(3, IChatEntitlementService)
], AINewSymbolNamesProvider);
export { AINewSymbolNamesProvider };
let ChatCodeActionsProvider = ChatCodeActionsProvider_1 = class ChatCodeActionsProvider {
    static registerProvider(instantiationService) {
        return instantiationService.invokeFunction(accessor => {
            const languageFeaturesService = accessor.get(ILanguageFeaturesService);
            const provider = instantiationService.createInstance(ChatCodeActionsProvider_1);
            return languageFeaturesService.codeActionProvider.register('*', provider);
        });
    }
    constructor(markerService) {
        this.markerService = markerService;
    }
    async provideCodeActions(model, range) {
        const actions = [];
        // "Generate" if the line is whitespace only
        // "Modify" if there is a selection
        let generateOrModifyTitle;
        let generateOrModifyCommand;
        if (range.isEmpty()) {
            const textAtLine = model.getLineContent(range.startLineNumber);
            if (/^\s*$/.test(textAtLine)) {
                generateOrModifyTitle = localize('generate', "Generate");
                generateOrModifyCommand = AICodeActionsHelper.generate(range);
            }
        }
        else {
            const textInSelection = model.getValueInRange(range);
            if (!/^\s*$/.test(textInSelection)) {
                generateOrModifyTitle = localize('modify', "Modify");
                generateOrModifyCommand = AICodeActionsHelper.modify(range);
            }
        }
        if (generateOrModifyTitle && generateOrModifyCommand) {
            actions.push({
                kind: CodeActionKind.RefactorRewrite.append('copilot').value,
                isAI: true,
                title: generateOrModifyTitle,
                command: generateOrModifyCommand,
            });
        }
        const markers = AICodeActionsHelper.warningOrErrorMarkersAtRange(this.markerService, model.uri, range);
        if (markers.length > 0) {
            // "Fix" if there are diagnostics in the range
            actions.push({
                kind: CodeActionKind.QuickFix.append('copilot').value,
                isAI: true,
                diagnostics: markers,
                title: localize('fix', "Fix"),
                command: AICodeActionsHelper.fixMarkers(markers, range)
            });
            // "Explain" if there are diagnostics in the range
            actions.push({
                kind: CodeActionKind.QuickFix.append('explain').append('copilot').value,
                isAI: true,
                diagnostics: markers,
                title: localize('explain', "Explain"),
                command: AICodeActionsHelper.explainMarkers(markers)
            });
        }
        return {
            actions,
            dispose() { }
        };
    }
};
ChatCodeActionsProvider = ChatCodeActionsProvider_1 = __decorate([
    __param(0, IMarkerService)
], ChatCodeActionsProvider);
export { ChatCodeActionsProvider };
export class AICodeActionsHelper {
    static warningOrErrorMarkersAtRange(markerService, resource, range) {
        return markerService
            .read({ resource, severities: MarkerSeverity.Error | MarkerSeverity.Warning })
            .filter(marker => range.startLineNumber <= marker.endLineNumber && range.endLineNumber >= marker.startLineNumber);
    }
    static modify(range) {
        return {
            id: INLINE_CHAT_START,
            title: localize('modify', "Modify"),
            arguments: [
                {
                    initialSelection: this.rangeToSelection(range),
                    initialRange: range,
                    position: range.getStartPosition()
                }
            ]
        };
    }
    static generate(range) {
        return {
            id: INLINE_CHAT_START,
            title: localize('generate', "Generate"),
            arguments: [
                {
                    initialSelection: this.rangeToSelection(range),
                    initialRange: range,
                    position: range.getStartPosition()
                }
            ]
        };
    }
    static rangeToSelection(range) {
        return new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
    }
    static explainMarkers(markers) {
        return {
            id: CHAT_OPEN_ACTION_ID,
            title: localize('explain', "Explain"),
            arguments: [
                {
                    query: `@workspace /explain ${markers.map(marker => marker.message).join(', ')}`,
                    isPartialQuery: true
                }
            ]
        };
    }
    static fixMarkers(markers, range) {
        return {
            id: INLINE_CHAT_START,
            title: localize('fix', "Fix"),
            arguments: [
                {
                    message: `/fix ${markers.map(marker => marker.message).join(', ')}`,
                    initialSelection: this.rangeToSelection(range),
                    initialRange: range,
                    position: range.getStartPosition()
                }
            ]
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFNldHVwUHJvdmlkZXJzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRTZXR1cC9jaGF0U2V0dXBQcm92aWRlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxXQUFXLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFM0UsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUUzRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBZSxZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUVqSCxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVELE9BQU8sRUFBRSxjQUFjLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM3RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDeEUsT0FBTyxPQUFPLE1BQU0sbURBQW1ELENBQUM7QUFDeEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDMUYsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDOUcsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDN0csT0FBTyxF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