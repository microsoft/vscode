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
import { DeferredPromise } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { revive } from '../../../base/common/marshalling.js';
import { Schemas } from '../../../base/common/network.js';
import { escapeRegExpCharacters } from '../../../base/common/strings.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { URI } from '../../../base/common/uri.js';
import { Codicon } from '../../../base/common/codicons.js';
import { Range } from '../../../editor/common/core/range.js';
import { getWordAtText } from '../../../editor/common/core/wordHelper.js';
import { ILanguageFeaturesService } from '../../../editor/common/services/languageFeatures.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../../platform/uriIdentity/common/uriIdentity.js';
import { IChatWidgetService } from '../../contrib/chat/browser/chat.js';
import { AgentSessionProviders, getAgentSessionProvider } from '../../contrib/chat/browser/agentSessions/agentSessions.js';
import { AddDynamicVariableAction } from '../../contrib/chat/browser/attachments/chatDynamicVariables.js';
import { IChatAgentService } from '../../contrib/chat/common/participants/chatAgents.js';
import { IPromptsService, PromptsStorage } from '../../contrib/chat/common/promptSyntax/service/promptsService.js';
import { isValidPromptType } from '../../contrib/chat/common/promptSyntax/promptTypes.js';
import { ChatRequestAgentPart } from '../../contrib/chat/common/requestParser/chatParserTypes.js';
import { ChatRequestParser } from '../../contrib/chat/common/requestParser/chatRequestParser.js';
import { getDynamicVariablesForWidget, getSelectedToolAndToolSetsForWidget } from '../../contrib/chat/browser/attachments/chatVariables.js';
import { IChatService } from '../../contrib/chat/common/chatService/chatService.js';
import { ChatSessionOptionsMap, IChatSessionsService } from '../../contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation, ChatModeKind } from '../../contrib/chat/common/constants.js';
import { ILanguageModelToolsService } from '../../contrib/chat/common/tools/languageModelToolsService.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { IExtensionService } from '../../services/extensions/common/extensions.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { NotebookDto } from './mainThreadNotebookDto.js';
import { isUntitledChatSession } from '../../contrib/chat/common/model/chatUri.js';
import { ICustomizationHarnessService } from '../../contrib/chat/common/customizationHarnessService.js';
import { AICustomizationManagementSection, BUILTIN_STORAGE } from '../../contrib/chat/common/aiCustomizationWorkspaceService.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
export class MainThreadChatTask {
    get onDidAddProgress() { return this._onDidAddProgress.event; }
    constructor(content) {
        this.content = content;
        this.kind = 'progressTask';
        this.deferred = new DeferredPromise();
        this._onDidAddProgress = new Emitter();
        this.progress = [];
    }
    task() {
        return this.deferred.p;
    }
    isSettled() {
        return this.deferred.isSettled;
    }
    complete(v) {
        this.deferred.complete(v);
    }
    add(progress) {
        this.progress.push(progress);
        this._onDidAddProgress.fire(progress);
    }
    toJSON() {
        return {
            kind: 'progressTaskSerialized',
            content: this.content,
            progress: this.progress
        };
    }
}
let MainThreadChatAgents2 = class MainThreadChatAgents2 extends Disposable {
    constructor(extHostContext, _chatAgentService, _chatSessionService, _chatService, _languageFeaturesService, _chatWidgetService, _instantiationService, _logService, _extensionService, _uriIdentityService, _promptsService, _languageModelToolsService, _customizationHarnessService, _configurationService, _telemetryService) {
        super();
        this._chatAgentService = _chatAgentService;
        this._chatSessionService = _chatSessionService;
        this._chatService = _chatService;
        this._languageFeaturesService = _languageFeaturesService;
        this._chatWidgetService = _chatWidgetService;
        this._instantiationService = _instantiationService;
        this._logService = _logService;
        this._extensionService = _extensionService;
        this._uriIdentityService = _uriIdentityService;
        this._promptsService = _promptsService;
        this._languageModelToolsService = _languageModelToolsService;
        this._customizationHarnessService = _customizationHarnessService;
        this._configurationService = _configurationService;
        this._telemetryService = _telemetryService;
        this._agents = this._register(new DisposableMap());
        this._agentCompletionProviders = this._register(new DisposableMap());
        this._agentIdsToCompletionProviders = this._register(new DisposableMap);
        this._chatParticipantDetectionProviders = this._register(new DisposableMap());
        this._promptFileProviders = this._register(new DisposableMap());
        this._promptFileProviderEmitters = this._register(new DisposableMap());
        this._promptFileContentRegistrations = this._register(new DisposableMap());
        this._customizationProviders = this._register(new DisposableMap());
        this._customizationProviderEmitters = this._register(new DisposableMap());
        this._pendingProgress = new Map();
        this._activeTasks = new Map();
        this._unresolvedAnchors = new Map();
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatAgents2);
        // When the provider API kill-switch is toggled off, dispose all registered providers
        this._register(this._configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('chat.customizations.providerApi.enabled')) {
                if (!this._configurationService.getValue('chat.customizations.providerApi.enabled')) {
                    this._customizationProviders.clearAndDisposeAll();
                    this._customizationProviderEmitters.clearAndDisposeAll();
                }
            }
        }));
        this._register(this._chatService.onDidDisposeSession(e => {
            for (const resource of e.sessionResources) {
                this._proxy.$releaseSession(resource);
            }
        }));
        this._register(this._chatService.onDidPerformUserAction(e => {
            if (typeof e.agentId === 'string') {
                for (const [handle, agent] of this._agents) {
                    if (agent.id === e.agentId) {
                        if (e.action.kind === 'vote') {
                            this._proxy.$acceptFeedback(handle, e.result ?? {}, e.action);
                        }
                        else {
                            this._proxy.$acceptAction(handle, e.result || {}, e);
                        }
                        break;
                    }
                }
            }
        }));
        this._register(this._chatService.onDidReceiveQuestionCarouselAnswer(e => {
            this._proxy.$handleQuestionCarouselAnswer(e.requestId, e.resolveId, e.answers);
        }));
        this._register(this._chatWidgetService.onDidChangeFocusedSession(() => {
            this._acceptActiveChatSession(this._chatWidgetService.lastFocusedWidget);
        }));
        // Push the initial active session if there is already a focused widget
        this._acceptActiveChatSession(this._chatWidgetService.lastFocusedWidget);
        // Push custom agents to ext host
        void this._pushCustomAgents();
        this._register(this._promptsService.onDidChangeCustomAgents(() => {
            void this._pushCustomAgents();
        }));
        // Push instructions to ext host
        void this._pushInstructions();
        this._register(this._promptsService.onDidChangeInstructions(() => {
            void this._pushInstructions();
        }));
        // Push skills to ext host
        void this._pushSkills();
        this._register(this._promptsService.onDidChangeSkills(() => {
            void this._pushSkills();
        }));
    }
    _acceptActiveChatSession(widget) {
        const sessionResource = widget?.viewModel?.sessionResource;
        const isLocal = sessionResource && getAgentSessionProvider(sessionResource) === AgentSessionProviders.Local;
        this._proxy.$acceptActiveChatSession(isLocal ? sessionResource : undefined);
    }
    async _pushCustomAgents() {
        try {
            const customAgents = await this._promptsService.getCustomAgents(CancellationToken.None);
            const dtos = customAgents.map(agent => ({ uri: agent.uri }));
            this._proxy.$acceptCustomAgents(dtos);
        }
        catch (error) {
            this._logService.error('[chat] Failed to push custom agents to extension host', error);
        }
    }
    async _pushInstructions() {
        try {
            const instructions = await this._promptsService.getInstructionFiles(CancellationToken.None);
            const dtos = instructions.map(instruction => ({ uri: instruction.uri }));
            this._proxy.$acceptInstructions(dtos);
        }
        catch (error) {
            this._logService.error('[chat] Failed to push instructions to extension host', error);
        }
    }
    async _pushSkills() {
        try {
            const skills = await this._promptsService.findAgentSkills(CancellationToken.None) ?? [];
            const dtos = skills.map(skill => ({ uri: skill.uri }));
            this._proxy.$acceptSkills(dtos);
        }
        catch (error) {
            this._logService.error('[chat] Failed to push skills to extension host', error);
        }
    }
    $unregisterAgent(handle) {
        this._agents.deleteAndDispose(handle);
    }
    async $transferActiveChatSession(toWorkspace) {
        const widget = this._chatWidgetService.lastFocusedWidget;
        const model = widget?.viewModel?.model;
        if (!model) {
            this._logService.error(`MainThreadChat#$transferActiveChatSession: No active chat session found`);
            return;
        }
        await this._chatService.transferChatSession(model.sessionResource, URI.revive(toWorkspace));
    }
    async $registerAgent(handle, extension, id, metadata, dynamicProps) {
        await this._extensionService.whenInstalledExtensionsRegistered();
        const staticAgentRegistration = this._chatAgentService.getAgent(id, true);
        const chatSessionRegistration = this._chatSessionService.getAllChatSessionContributions().find(c => c.type === id || c.alternativeIds?.includes(id));
        if (!staticAgentRegistration && !chatSessionRegistration && !dynamicProps) {
            if (this._chatAgentService.getAgentsByName(id).length) {
                // Likely some extension authors will not adopt the new ID, so give a hint if they register a
                // participant by name instead of ID.
                throw new Error(`chatParticipant must be declared with an ID in package.json. The "id" property may be missing! "${id}"`);
            }
            throw new Error(`chatParticipant must be declared in package.json: ${id}`);
        }
        const impl = {
            invoke: async (request, progress, history, token) => {
                const chatSession = this._chatService.getSession(request.sessionResource);
                this._pendingProgress.set(request.requestId, { progress, chatSession });
                try {
                    const chatSessionResource = request.sessionResource;
                    const chatSessionContext = {
                        chatSessionResource,
                        isUntitled: isUntitledChatSession(chatSessionResource),
                        initialSessionOptions: ChatSessionOptionsMap.toStrValueArray(this._chatSessionService.getSessionOptions(chatSessionResource)),
                    };
                    const rpcResult = await this._proxy.$invokeAgent(handle, request, {
                        history,
                        chatSessionContext,
                    }, token);
                    if (rpcResult?.errorCallstack) {
                        this._telemetryService.publicLogError2('chatAgentError', {
                            callstack: rpcResult.errorCallstack,
                            msg: rpcResult.errorDetails?.message ?? '',
                            errorName: rpcResult.errorName ?? '',
                            agent: id,
                            agentExtensionId: extension.value,
                        });
                    }
                    // Strip telemetry-only field before returning to the model layer
                    if (rpcResult) {
                        const { errorCallstack: _, errorName: _2, ...result } = rpcResult;
                        return result;
                    }
                    return {};
                }
                finally {
                    this._pendingProgress.delete(request.requestId);
                }
            },
            setRequestTools: (requestId, tools) => {
                this._proxy.$setRequestTools(requestId, tools);
            },
            setYieldRequested: (requestId, value) => {
                this._proxy.$setYieldRequested(requestId, value);
            },
            provideFollowups: async (request, result, history, token) => {
                if (!this._agents.get(handle)?.hasFollowups) {
                    return [];
                }
                return this._proxy.$provideFollowups(request, handle, result, { history }, token);
            },
            provideChatTitle: (history, token) => {
                return this._proxy.$provideChatTitle(handle, history, token);
            },
            provideChatSummary: (history, token) => {
                return this._proxy.$provideChatSummary(handle, history, token);
            },
        };
        // Do not attempt to register migrated chatSession providers
        if (chatSessionRegistration?.alternativeIds?.includes(id)) {
            return;
        }
        let disposable;
        if (!staticAgentRegistration && dynamicProps) {
            const extensionDescription = this._extensionService.extensions.find(e => ExtensionIdentifier.equals(e.identifier, extension));
            disposable = this._chatAgentService.registerDynamicAgent({
                id,
                name: dynamicProps.name,
                description: dynamicProps.description,
                extensionId: extension,
                extensionVersion: extensionDescription?.version,
                extensionDisplayName: extensionDescription?.displayName ?? extension.value,
                extensionPublisherId: extensionDescription?.publisher ?? '',
                publisherDisplayName: dynamicProps.publisherName,
                fullName: dynamicProps.fullName,
                metadata: revive(metadata),
                slashCommands: [],
                disambiguation: [],
                locations: [ChatAgentLocation.Chat],
                modes: [ChatModeKind.Ask, ChatModeKind.Agent, ChatModeKind.Edit],
            }, impl);
        }
        else {
            disposable = this._chatAgentService.registerAgentImplementation(id, impl);
        }
        this._agents.set(handle, {
            id: id,
            extensionId: extension,
            dispose: () => disposable.dispose(),
            hasFollowups: metadata.hasFollowups
        });
    }
    async $updateAgent(handle, metadataUpdate) {
        await this._extensionService.whenInstalledExtensionsRegistered();
        const data = this._agents.get(handle);
        if (!data) {
            this._logService.error(`MainThreadChatAgents2#$updateAgent: No agent with handle ${handle} registered`);
            return;
        }
        data.hasFollowups = metadataUpdate.hasFollowups;
        this._chatAgentService.updateAgent(data.id, revive(metadataUpdate));
    }
    async $handleProgressChunk(requestId, chunks) {
        const pendingProgress = this._pendingProgress.get(requestId);
        if (!pendingProgress) {
            this._logService.warn(`MainThreadChatAgents2#$handleProgressChunk: No pending progress for requestId ${requestId}`);
            return;
        }
        const { progress, chatSession } = pendingProgress;
        const chatProgressParts = [];
        const response = chatSession?.getRequests().find(req => req.id === requestId)?.response;
        for (const item of chunks) {
            const [progress, responsePartHandle] = Array.isArray(item) ? item : [item];
            if (progress.kind === 'externalEdits') {
                if (chatSession?.editingSession && responsePartHandle !== undefined && response) {
                    const parts = progress.start
                        ? await chatSession.editingSession.startExternalEdits(response, responsePartHandle, revive(progress.resources), progress.undoStopId)
                        : await chatSession.editingSession.stopExternalEdits(response, responsePartHandle);
                    chatProgressParts.push(...parts);
                }
                continue;
            }
            if (progress.kind === 'beginToolInvocation') {
                // Begin a streaming tool invocation
                this._languageModelToolsService.beginToolCall({
                    toolCallId: progress.toolCallId,
                    toolId: progress.toolName,
                    chatRequestId: requestId,
                    sessionResource: chatSession?.sessionResource,
                    subagentInvocationId: progress.subagentInvocationId,
                });
                continue;
            }
            if (progress.kind === 'updateToolInvocation') {
                // Update the streaming data for an existing tool invocation
                this._languageModelToolsService.updateToolStream(progress.toolCallId, progress.streamData?.partialInput, CancellationToken.None);
                continue;
            }
            if (progress.kind === 'usage') {
                if (response) {
                    response.setUsage({
                        kind: 'usage',
                        promptTokens: progress.promptTokens,
                        completionTokens: progress.completionTokens,
                        outputBuffer: progress.outputBuffer,
                        promptTokenDetails: progress.promptTokenDetails
                    });
                }
                continue;
            }
            const revivedProgress = progress.kind === 'notebookEdit'
                ? ChatNotebookEdit.fromChatEdit(progress)
                : revive(progress);
            if (revivedProgress.kind === 'notebookEdit'
                || revivedProgress.kind === 'textEdit'
                || revivedProgress.kind === 'codeblockUri') {
                // make sure to use the canonical uri
                revivedProgress.uri = this._uriIdentityService.asCanonicalUri(revivedProgress.uri);
            }
            if (responsePartHandle !== undefined) {
                if (revivedProgress.kind === 'progressTask') {
                    const handle = responsePartHandle;
                    const responsePartId = `${requestId}_${handle}`;
                    const task = new MainThreadChatTask(revivedProgress.content);
                    this._activeTasks.set(responsePartId, task);
                    chatProgressParts.push(task);
                }
                else if (responsePartHandle !== undefined) {
                    const responsePartId = `${requestId}_${responsePartHandle}`;
                    const task = this._activeTasks.get(responsePartId);
                    switch (revivedProgress.kind) {
                        case 'progressTaskResult':
                            if (task && revivedProgress.content) {
                                task.complete(revivedProgress.content.value);
                                this._activeTasks.delete(responsePartId);
                            }
                            else {
                                task?.complete(undefined);
                            }
                            break;
                        case 'warning':
                        case 'reference':
                            task?.add(revivedProgress);
                            break;
                    }
                }
                continue;
            }
            if (revivedProgress.kind === 'inlineReference' && revivedProgress.resolveId) {
                if (!this._unresolvedAnchors.has(requestId)) {
                    this._unresolvedAnchors.set(requestId, new Map());
                }
                this._unresolvedAnchors.get(requestId)?.set(revivedProgress.resolveId, revivedProgress);
            }
            chatProgressParts.push(revivedProgress);
        }
        progress(chatProgressParts);
    }
    $handleAnchorResolve(requestId, handle, resolveAnchor) {
        const anchor = this._unresolvedAnchors.get(requestId)?.get(handle);
        if (!anchor) {
            return;
        }
        this._unresolvedAnchors.get(requestId)?.delete(handle);
        if (resolveAnchor) {
            const revivedAnchor = revive(resolveAnchor);
            anchor.inlineReference = revivedAnchor.inlineReference;
        }
    }
    $registerAgentCompletionsProvider(handle, id, triggerCharacters) {
        const provide = async (query, token) => {
            const completions = await this._proxy.$invokeCompletionProvider(handle, query, token);
            return completions.map((c) => ({ ...c, icon: c.icon ? ThemeIcon.fromId(c.icon) : undefined }));
        };
        this._agentIdsToCompletionProviders.set(id, this._chatAgentService.registerAgentCompletionProvider(id, provide));
        this._agentCompletionProviders.set(handle, this._languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
            _debugDisplayName: 'chatAgentCompletions:' + handle,
            triggerCharacters,
            provideCompletionItems: async (model, position, _context, token) => {
                const widget = this._chatWidgetService.getWidgetByInputUri(model.uri);
                if (!widget || !widget.viewModel) {
                    return;
                }
                const triggerCharsPart = triggerCharacters.map(c => escapeRegExpCharacters(c)).join('');
                const wordRegex = new RegExp(`[${triggerCharsPart}]\\S*`, 'g');
                const query = getWordAtText(position.column, wordRegex, model.getLineContent(position.lineNumber), 0)?.word ?? '';
                if (query && !triggerCharacters.some(c => query.startsWith(c))) {
                    return;
                }
                const parsedRequest = this._instantiationService.createInstance(ChatRequestParser).parseChatRequestWithReferences(getDynamicVariablesForWidget(widget), getSelectedToolAndToolSetsForWidget(widget), model.getValue()).parts;
                const agentPart = parsedRequest.find((part) => part instanceof ChatRequestAgentPart);
                const thisAgentId = this._agents.get(handle)?.id;
                if (agentPart?.agent.id !== thisAgentId) {
                    return;
                }
                const range = computeCompletionRanges(model, position, wordRegex);
                if (!range) {
                    return null;
                }
                const result = await provide(query, token);
                const variableItems = result.map(v => {
                    const insertText = v.insertText ?? (typeof v.label === 'string' ? v.label : v.label.label);
                    const rangeAfterInsert = new Range(range.insert.startLineNumber, range.insert.startColumn, range.insert.endLineNumber, range.insert.startColumn + insertText.length);
                    return {
                        label: v.label,
                        range,
                        insertText: insertText + ' ',
                        kind: 18 /* CompletionItemKind.Text */,
                        detail: v.detail,
                        documentation: v.documentation,
                        command: { id: AddDynamicVariableAction.ID, title: '', arguments: [{ id: v.id, widget, range: rangeAfterInsert, variableData: revive(v.value), command: v.command }] }
                    };
                });
                return {
                    suggestions: variableItems
                };
            }
        }));
    }
    $unregisterAgentCompletionsProvider(handle, id) {
        this._agentCompletionProviders.deleteAndDispose(handle);
        this._agentIdsToCompletionProviders.deleteAndDispose(id);
    }
    $registerChatParticipantDetectionProvider(handle) {
        this._chatParticipantDetectionProviders.set(handle, this._chatAgentService.registerChatParticipantDetectionProvider(handle, {
            provideParticipantDetection: async (request, history, options, token) => {
                return await this._proxy.$detectChatParticipant(handle, request, { history }, options, token);
            }
        }));
    }
    $unregisterChatParticipantDetectionProvider(handle) {
        this._chatParticipantDetectionProviders.deleteAndDispose(handle);
    }
    async $registerPromptFileProvider(handle, type, extensionId) {
        const extension = await this._extensionService.getExtension(extensionId.value);
        if (!extension) {
            this._logService.error(`[MainThreadChatAgents2] Could not find extension for prompt file provider: ${extensionId.value}`);
            return;
        }
        if (!isValidPromptType(type)) {
            this._logService.error(`[MainThreadChatAgents2] Invalid contribution type: ${type}`);
            return;
        }
        const emitter = new Emitter();
        this._promptFileProviderEmitters.set(handle, emitter);
        // Track content registrations for this provider so they can be disposed when provider is unregistered
        const contentRegistrations = new DisposableMap();
        this._promptFileContentRegistrations.set(handle, contentRegistrations);
        const disposable = this._promptsService.registerPromptFileProvider(extension, type, {
            onDidChangePromptFiles: emitter.event,
            providePromptFiles: async (context, token) => {
                const contributions = await this._proxy.$providePromptFiles(handle, type, context, token);
                if (!contributions) {
                    return undefined;
                }
                // Convert UriComponents to URI and register any inline content
                return contributions.map(c => {
                    return {
                        uri: URI.revive(c.uri),
                    };
                });
            }
        });
        this._promptFileProviders.set(handle, disposable);
    }
    $unregisterPromptFileProvider(handle) {
        this._promptFileProviders.deleteAndDispose(handle);
        this._promptFileProviderEmitters.deleteAndDispose(handle);
        this._promptFileContentRegistrations.deleteAndDispose(handle);
    }
    $onDidChangePromptFiles(handle) {
        const emitter = this._promptFileProviderEmitters.get(handle);
        if (emitter) {
            emitter.fire();
        }
    }
    async $registerChatSessionCustomizationProvider(handle, chatSessionType, metadata, extensionId) {
        if (!this._configurationService.getValue('chat.customizations.providerApi.enabled')) {
            this._logService.trace(`[MainThreadChatAgents2] Customization provider API is disabled, ignoring registration from ${extensionId.value}`);
            return;
        }
        const extension = await this._extensionService.getExtension(extensionId.value);
        if (!extension) {
            this._logService.error(`[MainThreadChatAgents2] Could not find extension for customization provider: ${extensionId.value}`);
            return;
        }
        const emitter = new Emitter();
        this._customizationProviderEmitters.set(handle, emitter);
        // Build the item provider that calls back to the ExtHost
        const itemProvider = {
            onDidChange: emitter.event,
            provideChatSessionCustomizations: async (token) => {
                const items = await this._proxy.$provideChatSessionCustomizations(handle, token);
                if (!items) {
                    return undefined;
                }
                return items.map((item) => ({
                    uri: URI.revive(item.uri),
                    type: item.type,
                    name: item.name,
                    description: item.description,
                    groupKey: item.groupKey,
                    badge: item.badge,
                    badgeTooltip: item.badgeTooltip,
                }));
            },
        };
        // Convert supportedTypes whitelist to hiddenSections blacklist.
        // Sections not in the supported list are hidden. When supportedTypes
        // is omitted, all sections are shown.
        const typeToSection = {
            'agent': AICustomizationManagementSection.Agents,
            'skill': AICustomizationManagementSection.Skills,
            'instructions': AICustomizationManagementSection.Instructions,
            'prompt': AICustomizationManagementSection.Prompts,
            'hook': AICustomizationManagementSection.Hooks,
            'plugins': AICustomizationManagementSection.Plugins,
        };
        let hiddenSections;
        if (metadata.supportedTypes) {
            const supportedSections = new Set();
            for (const t of metadata.supportedTypes) {
                const section = typeToSection[t];
                if (section) {
                    supportedSections.add(section);
                }
            }
            hiddenSections = Object.values(typeToSection).filter(section => !supportedSections.has(section));
        }
        const descriptor = {
            id: chatSessionType,
            label: metadata.label,
            icon: metadata.iconId ? ThemeIcon.fromId(metadata.iconId) : ThemeIcon.fromId(Codicon.extensions.id),
            hiddenSections,
            getStorageSourceFilter: () => ({
                // Extension-provided harnesses manage their own items via the provider,
                // so we show all sources for storage-filter-based flows.
                sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.plugin, PromptsStorage.extension, BUILTIN_STORAGE],
            }),
            itemProvider,
        };
        const registration = this._customizationHarnessService.registerExternalHarness(descriptor);
        this._customizationProviders.set(handle, registration);
    }
    $unregisterChatSessionCustomizationProvider(handle) {
        this._customizationProviders.deleteAndDispose(handle);
        this._customizationProviderEmitters.deleteAndDispose(handle);
    }
    $onDidChangeCustomizations(handle) {
        const emitter = this._customizationProviderEmitters.get(handle);
        if (emitter) {
            emitter.fire();
        }
    }
};
MainThreadChatAgents2 = __decorate([
    extHostNamedCustomer(MainContext.MainThreadChatAgents2),
    __param(1, IChatAgentService),
    __param(2, IChatSessionsService),
    __param(3, IChatService),
    __param(4, ILanguageFeaturesService),
    __param(5, IChatWidgetService),
    __param(6, IInstantiationService),
    __param(7, ILogService),
    __param(8, IExtensionService),
    __param(9, IUriIdentityService),
    __param(10, IPromptsService),
    __param(11, ILanguageModelToolsService),
    __param(12, ICustomizationHarnessService),
    __param(13, IConfigurationService),
    __param(14, ITelemetryService)
], MainThreadChatAgents2);
export { MainThreadChatAgents2 };
function computeCompletionRanges(model, position, reg) {
    const varWord = getWordAtText(position.column, reg, model.getLineContent(position.lineNumber), 0);
    if (!varWord && model.getWordUntilPosition(position).word) {
        // inside a "normal" word
        return;
    }
    let insert;
    let replace;
    if (!varWord) {
        insert = replace = Range.fromPositions(position);
    }
    else {
        insert = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, position.column);
        replace = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, varWord.endColumn);
    }
    return { insert, replace };
}
var ChatNotebookEdit;
(function (ChatNotebookEdit) {
    function fromChatEdit(part) {
        return {
            kind: 'notebookEdit',
            uri: URI.revive(part.uri),
            done: part.done,
            edits: part.edits.map(NotebookDto.fromCellEditOperationDto)
        };
    }
    ChatNotebookEdit.fromChatEdit = fromChatEdit;
})(ChatNotebookEdit || (ChatNotebookEdit = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZENoYXRBZ2VudHMyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9icm93c2VyL21haW5UaHJlYWRDaGF0QWdlbnRzMi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDaEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekUsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLCtCQUErQixDQUFDO0FBRS9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFlLE1BQU0sbUNBQW1DLENBQUM7QUFDM0YsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDOUQsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSw2QkFBNkIsQ0FBQztBQUNqRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFM0QsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUcxRSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUMvRixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN4RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsV0FBVyxF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