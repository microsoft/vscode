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
import { DeferredPromise, raceTimeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { BugIndicatingError, ErrorNoTelemetry } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { Disposable, DisposableResourceMap, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { revive } from '../../../../../base/common/marshalling.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun, derived, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { isDefined } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { Progress } from '../../../../../platform/progress/common/progress.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IChatDebugService } from '../chatDebugService.js';
import { IMcpService } from '../../../mcp/common/mcpTypes.js';
import { awaitStatsForSession } from '../chat.js';
import { ChatPerfMark, clearChatMarks, markChat } from '../chatPerf.js';
import { IChatAgentService } from '../participants/chatAgents.js';
import { chatEditingSessionIsReady } from '../editing/chatEditingService.js';
import { ChatModel, ChatRequestModel, normalizeSerializableChatData, toChatHistoryContent, updateRanges } from '../model/chatModel.js';
import { ChatModelStore } from '../model/chatModelStore.js';
import { chatAgentLeader, ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestSlashCommandPart, ChatRequestTextPart, chatSubcommandLeader, getPromptText } from '../requestParser/chatParserTypes.js';
import { ChatRequestParser } from '../requestParser/chatRequestParser.js';
import { ChatMcpServersStarting, ChatPendingRequestChangeEventName, ChatStopCancellationNoopEventName } from './chatService.js';
import { ChatRequestTelemetry, ChatServiceTelemetry } from './chatServiceTelemetry.js';
import { IChatSessionsService, localChatSessionType } from '../chatSessionsService.js';
import { ChatSessionStore } from '../model/chatSessionStore.js';
import { IChatSlashCommandService } from '../participants/chatSlashCommands.js';
import { IChatTransferService } from '../model/chatTransferService.js';
import { chatSessionResourceToId, getChatSessionType, isUntitledChatSession, LocalChatSessionUri } from '../model/chatUri.js';
import { IChatRequestVariableEntry } from '../attachments/chatVariableEntries.js';
import { ChatAgentLocation, ChatModeKind } from '../constants.js';
import { ILanguageModelsService } from '../languageModels.js';
import { ILanguageModelToolsService } from '../tools/languageModelToolsService.js';
import { ChatSessionOperationLog } from '../model/chatSessionOperationLog.js';
import { IPromptsService } from '../promptSyntax/service/promptsService.js';
import { AGENT_DEBUG_LOG_ENABLED_SETTING, AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING, TROUBLESHOOT_COMMAND_NAME, TROUBLESHOOT_SKILL_PATH, COPILOT_SKILL_URI_SCHEME } from '../promptSyntax/promptTypes.js';
import { mergeHooks } from '../promptSyntax/hookSchema.js';
import { findLast } from '../../../../../base/common/arraysFind.js';
import { ChatMode } from '../chatModes.js';
const serializedChatKey = 'interactive.sessions';
let CancellableRequest = class CancellableRequest {
    get yieldRequested() {
        return this._yieldRequested;
    }
    constructor(cancellationTokenSource, requestId, responseCompletePromise, sendOptions, toolsService) {
        this.cancellationTokenSource = cancellationTokenSource;
        this.requestId = requestId;
        this.responseCompletePromise = responseCompletePromise;
        this.sendOptions = sendOptions;
        this.toolsService = toolsService;
        this._yieldRequested = observableValue(this, false);
    }
    dispose() {
        if (this.requestId) {
            this.toolsService.cancelToolCallsForRequest(this.requestId);
        }
        this.cancellationTokenSource.dispose();
    }
    cancel() {
        if (this.requestId) {
            this.toolsService.cancelToolCallsForRequest(this.requestId);
        }
        this.cancellationTokenSource.cancel();
    }
    setYieldRequested() {
        this._yieldRequested.set(true, undefined);
    }
    resetYieldRequested() {
        this._yieldRequested.set(false, undefined);
    }
};
CancellableRequest = __decorate([
    __param(4, ILanguageModelToolsService)
], CancellableRequest);
let ChatService = class ChatService extends Disposable {
    get transferredSessionResource() {
        return this._transferredSessionResource;
    }
    get onDidCreateModel() { return this._sessionModels.onDidCreateModel; }
    /**
     * For test use only
     */
    setSaveModelsEnabled(enabled) {
        this._saveModelsEnabled = enabled;
    }
    /**
     * For test use only
     */
    waitForModelDisposals() {
        return this._sessionModels.waitForModelDisposals();
    }
    get isEmptyWindow() {
        const workspace = this.workspaceContextService.getWorkspace();
        return !workspace.configuration && workspace.folders.length === 0;
    }
    constructor(storageService, logService, telemetryService, extensionService, instantiationService, workspaceContextService, chatSlashCommandService, chatAgentService, configurationService, chatTransferService, chatSessionService, mcpService, promptsService, chatEntitlementService, languageModelsService, chatDebugService) {
        super();
        this.storageService = storageService;
        this.logService = logService;
        this.telemetryService = telemetryService;
        this.extensionService = extensionService;
        this.instantiationService = instantiationService;
        this.workspaceContextService = workspaceContextService;
        this.chatSlashCommandService = chatSlashCommandService;
        this.chatAgentService = chatAgentService;
        this.configurationService = configurationService;
        this.chatTransferService = chatTransferService;
        this.chatSessionService = chatSessionService;
        this.mcpService = mcpService;
        this.promptsService = promptsService;
        this.chatEntitlementService = chatEntitlementService;
        this.languageModelsService = languageModelsService;
        this.chatDebugService = chatDebugService;
        this._pendingRequests = this._register(new DisposableResourceMap());
        this._queuedRequestDeferreds = new Map();
        this._saveModelsEnabled = true;
        this._onDidSubmitRequest = this._register(new Emitter());
        this.onDidSubmitRequest = this._onDidSubmitRequest.event;
        this._onDidPerformUserAction = this._register(new Emitter());
        this.onDidPerformUserAction = this._onDidPerformUserAction.event;
        this._onDidReceiveQuestionCarouselAnswer = this._register(new Emitter());
        this.onDidReceiveQuestionCarouselAnswer = this._onDidReceiveQuestionCarouselAnswer.event;
        this._onDidDisposeSession = this._register(new Emitter());
        this.onDidDisposeSession = this._onDidDisposeSession.event;
        this._sessionFollowupCancelTokens = this._register(new DisposableResourceMap());
        this._sessionModels = this._register(instantiationService.createInstance(ChatModelStore, {
            createModel: (props) => this._startSession(props),
            willDisposeModel: async (model) => {
                const localSessionId = LocalChatSessionUri.parseLocalSessionId(model.sessionResource);
                if (localSessionId && this.shouldStoreSession(model)) {
                    // Always preserve sessions that have custom titles, even if empty
                    if (model.getRequests().length === 0 && !model.customTitle) {
                        await this._chatSessionStore.deleteSession(localSessionId);
                    }
                    else if (this._saveModelsEnabled) {
                        await this._chatSessionStore.storeSessions([model]);
                    }
                }
                else if (!localSessionId && model.getRequests().length > 0) {
                    await this._chatSessionStore.storeSessionsMetadataOnly([model]);
                }
            }
        }));
        this._register(this._sessionModels.onDidDisposeModel(model => {
            clearChatMarks(model.sessionResource);
            this.chatDebugService.endSession(model.sessionResource);
            this._onDidDisposeSession.fire({ sessionResources: [model.sessionResource], reason: 'cleared' });
        }));
        this._chatServiceTelemetry = this.instantiationService.createInstance(ChatServiceTelemetry);
        this._chatSessionStore = this._register(this.instantiationService.createInstance(ChatSessionStore));
        this._chatSessionStore.migrateDataIfNeeded(() => this.migrateData());
        const transferredData = this._chatSessionStore.getTransferredSessionData();
        if (transferredData) {
            this.trace('constructor', `Transferred session ${transferredData}`);
            this._transferredSessionResource = transferredData;
        }
        this.reviveSessionsWithEdits();
        this._register(storageService.onWillSaveState(() => this.saveState()));
        this.chatModels = derived(this, reader => [...this._sessionModels.observable.read(reader).values()]);
        this.requestInProgressObs = derived(reader => {
            const models = this._sessionModels.observable.read(reader).values();
            return Iterable.some(models, model => model.requestInProgress.read(reader));
        });
    }
    get editingSessions() {
        return [...this._sessionModels.values()].map(v => v.editingSession).filter(isDefined);
    }
    isEnabled(location) {
        return this.chatAgentService.getContributedDefaultAgent(location) !== undefined;
    }
    migrateData() {
        const sessionData = this.storageService.get(serializedChatKey, this.isEmptyWindow ? -1 /* StorageScope.APPLICATION */ : 1 /* StorageScope.WORKSPACE */, '');
        if (sessionData) {
            const persistedSessions = this.deserializeChats(sessionData);
            const countsForLog = Object.keys(persistedSessions).length;
            if (countsForLog > 0) {
                this.info('migrateData', `Restored ${countsForLog} persisted sessions`);
            }
            return persistedSessions;
        }
        return;
    }
    saveState() {
        if (!this._saveModelsEnabled) {
            return;
        }
        const liveLocalChats = Array.from(this._sessionModels.values())
            .filter(session => this.shouldStoreSession(session));
        this._chatSessionStore.storeSessions(liveLocalChats);
        const liveNonLocalChats = Array.from(this._sessionModels.values())
            .filter(session => !LocalChatSessionUri.parseLocalSessionId(session.sessionResource));
        this._chatSessionStore.storeSessionsMetadataOnly(liveNonLocalChats);
    }
    /**
     * Only persist local sessions from chat that are not imported.
     */
    shouldStoreSession(session) {
        if (!LocalChatSessionUri.parseLocalSessionId(session.sessionResource)) {
            return false;
        }
        return session.initialLocation === ChatAgentLocation.Chat && !session.isImported;
    }
    notifyUserAction(action) {
        this._chatServiceTelemetry.notifyUserAction(action);
        this._onDidPerformUserAction.fire(action);
        if (action.action.kind === 'chatEditingSessionAction') {
            const model = this._sessionModels.get(action.sessionResource);
            if (model) {
                model.notifyEditingAction(action.action);
            }
        }
    }
    notifyQuestionCarouselAnswer(requestId, resolveId, answers) {
        this._onDidReceiveQuestionCarouselAnswer.fire({ requestId, resolveId, answers });
    }
    async setChatSessionTitle(sessionResource, title) {
        const model = this._sessionModels.get(sessionResource);
        if (model) {
            model.setCustomTitle(title);
        }
        // Update the title in the file storage
        const localSessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
        if (localSessionId) {
            await this._chatSessionStore.setSessionTitle(localSessionId, title);
            // Trigger immediate save to ensure consistency
            this.saveState();
        }
    }
    trace(method, message) {
        if (message) {
            this.logService.trace(`ChatService#${method}: ${message}`);
        }
        else {
            this.logService.trace(`ChatService#${method}`);
        }
    }
    info(method, message) {
        if (message) {
            this.logService.info(`ChatService#${method}: ${message}`);
        }
        else {
            this.logService.info(`ChatService#${method}`);
        }
    }
    error(method, message) {
        this.logService.error(`ChatService#${method} ${message}`);
    }
    deserializeChats(sessionData) {
        try {
            const arrayOfSessions = revive(JSON.parse(sessionData)); // Revive serialized URIs in session data
            if (!Array.isArray(arrayOfSessions)) {
                throw new Error('Expected array');
            }
            const sessions = arrayOfSessions.reduce((acc, session) => {
                // Revive serialized markdown strings in response data
                for (const request of session.requests) {
                    if (Array.isArray(request.response)) {
                        request.response = request.response.map((response) => {
                            if (typeof response === 'string') {
                                return new MarkdownString(response);
                            }
                            return response;
                        });
                    }
                    else if (typeof request.response === 'string') {
                        request.response = [new MarkdownString(request.response)];
                    }
                }
                acc[session.sessionId] = normalizeSerializableChatData(session);
                return acc;
            }, {});
            return sessions;
        }
        catch (err) {
            this.error('deserializeChats', `Malformed session data: ${err}. [${sessionData.substring(0, 20)}${sessionData.length > 20 ? '...' : ''}]`);
            return {};
        }
    }
    /**
     * todo@connor4312 This will be cleaned up with the globalization of edits.
     */
    async reviveSessionsWithEdits() {
        const idx = await this._chatSessionStore.getIndex();
        await Promise.all(Object.values(idx).map(async (session) => {
            if (!session.hasPendingEdits) {
                return;
            }
            let sessionResource;
            // Non-local sessions store the full uri as the sessionId, so try parsing that first
            if (session.sessionId.includes(':')) {
                try {
                    sessionResource = URI.parse(session.sessionId, true);
                }
                catch {
                    // Noop
                }
            }
            sessionResource ??= LocalChatSessionUri.forSession(session.sessionId);
            const sessionRef = await this.acquireOrLoadSession(sessionResource, ChatAgentLocation.Chat, CancellationToken.None, 'ChatService#reviveSessionsWithEdits');
            if (sessionRef?.object.editingSession) {
                await chatEditingSessionIsReady(sessionRef.object.editingSession);
                // the session will hold a self-reference as long as there are modified files
                sessionRef.dispose();
            }
        }));
    }
    /**
     * Returns an array of chat details for all persisted chat sessions that have at least one request.
     * Chat sessions that have already been loaded into the chat view are excluded from the result.
     * Imported chat sessions are also excluded from the result.
     * TODO this is only used by the old "show chats" command which can be removed when the pre-agents view
     * options are removed.
     */
    async getLocalSessionHistory() {
        const liveSessionItems = await this.getLiveSessionItems();
        const historySessionItems = await this.getHistorySessionItems();
        return [...liveSessionItems, ...historySessionItems];
    }
    /**
     * Returns an array of chat details for all local live chat sessions.
     */
    async getLiveSessionItems() {
        return await Promise.all(Array.from(this._sessionModels.values())
            .filter(session => this.shouldBeInHistory(session))
            .map(chatModelToChatDetail));
    }
    /**
     * Returns an array of chat details for all local chat sessions in history (not currently loaded).
     */
    async getHistorySessionItems() {
        const index = await this._chatSessionStore.getIndex();
        return Object.values(index)
            .filter(entry => !entry.isExternal)
            .filter(entry => !this._sessionModels.has(LocalChatSessionUri.forSession(entry.sessionId)) && entry.initialLocation === ChatAgentLocation.Chat && !entry.isEmpty)
            .map((entry) => {
            const sessionResource = LocalChatSessionUri.forSession(entry.sessionId);
            return ({
                ...entry,
                sessionResource,
                isActive: this._sessionModels.has(sessionResource),
            });
        });
    }
    async getMetadataForSession(sessionResource) {
        const index = await this._chatSessionStore.getIndex();
        const metadata = index[sessionResource.toString()];
        if (metadata) {
            return {
                ...metadata,
                sessionResource,
                isActive: this._sessionModels.has(sessionResource),
            };
        }
        return undefined;
    }
    shouldBeInHistory(entry) {
        return !entry.isImported && !!LocalChatSessionUri.parseLocalSessionId(entry.sessionResource) && entry.initialLocation === ChatAgentLocation.Chat;
    }
    async removeHistoryEntry(sessionResource) {
        await this._chatSessionStore.deleteSession(this.toLocalSessionId(sessionResource));
        this._onDidDisposeSession.fire({ sessionResources: [sessionResource], reason: 'cleared' });
    }
    async clearAllHistoryEntries() {
        await this._chatSessionStore.clearAllSessions();
    }
    startNewLocalSession(location, options) {
        this.trace('startNewLocalSession');
        const sessionResource = LocalChatSessionUri.forSession(generateUuid());
        return this._sessionModels.acquireOrCreate({
            initialData: undefined,
            location,
            sessionResource,
            canUseTools: options?.canUseTools ?? true,
            disableBackgroundKeepAlive: options?.disableBackgroundKeepAlive
        }, options?.debugOwner ?? 'ChatService#startNewLocalSession');
    }
    _startSession(props) {
        const { initialData, location, sessionResource, canUseTools, transferEditingSession, disableBackgroundKeepAlive, inputState } = props;
        const model = this.instantiationService.createInstance(ChatModel, initialData, { initialLocation: location, canUseTools, resource: sessionResource, disableBackgroundKeepAlive, inputState });
        if (location === ChatAgentLocation.Chat) {
            model.startEditingSession(true, transferEditingSession);
        }
        this.initializeSession(model);
        return model;
    }
    initializeSession(model) {
        this.trace('initializeSession', `Initialize session ${model.sessionResource}`);
        // Activate the default extension provided agent but do not wait
        // for it to be ready so that the session can be used immediately
        // without having to wait for the agent to be ready.
        this.activateDefaultAgent(model.initialLocation).catch(e => this.logService.error(e));
    }
    async activateDefaultAgent(location) {
        await this.extensionService.whenInstalledExtensionsRegistered();
        const defaultAgentData = this.chatAgentService.getContributedDefaultAgent(location) ?? this.chatAgentService.getContributedDefaultAgent(ChatAgentLocation.Chat);
        if (!defaultAgentData) {
            throw new ErrorNoTelemetry('No default agent contributed');
        }
        // Await activation of the extension provided agent
        // Using `activateById` as workaround for the issue
        // https://github.com/microsoft/vscode/issues/250590
        if (!defaultAgentData.isCore) {
            await this.extensionService.activateById(defaultAgentData.extensionId, {
                activationEvent: `onChatParticipant:${defaultAgentData.id}`,
                extensionId: defaultAgentData.extensionId,
                startup: false
            });
        }
        const defaultAgent = this.chatAgentService.getActivatedAgents().find(agent => agent.id === defaultAgentData.id);
        if (!defaultAgent) {
            throw new ErrorNoTelemetry('No default agent registered');
        }
    }
    getSession(sessionResource) {
        return this._sessionModels.get(sessionResource);
    }
    acquireExistingSession(sessionResource, debugOwner) {
        return this._sessionModels.acquireExisting(sessionResource, debugOwner ?? 'ChatService#acquireExistingSession');
    }
    getChatModelReferenceDebugInfo() {
        return this._sessionModels.getReferenceDebugSnapshot();
    }
    async acquireOrRestoreLocalSession(sessionResource, debugOwner) {
        this.trace('acquireOrRestoreSession', `${sessionResource}`);
        const existingRef = this.acquireExistingSession(sessionResource, debugOwner);
        if (existingRef) {
            return existingRef;
        }
        let sessionData;
        if (isEqual(this.transferredSessionResource, sessionResource)) {
            this._transferredSessionResource = undefined;
            sessionData = await this._chatSessionStore.readTransferredSession(sessionResource);
        }
        else {
            const localSessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
            if (localSessionId) {
                sessionData = await this._chatSessionStore.readSession(localSessionId);
            }
        }
        if (!sessionData) {
            return undefined;
        }
        const sessionRef = this._sessionModels.acquireOrCreate({
            initialData: sessionData,
            location: sessionData.value.initialLocation ?? ChatAgentLocation.Chat,
            sessionResource,
            canUseTools: true,
        }, debugOwner ?? 'ChatService#acquireOrRestoreLocalSession');
        return sessionRef;
    }
    // There are some cases where this returns a real string. What happens if it doesn't?
    // This had titles restored from the index, so just return titles from index instead, sync.
    getSessionTitle(sessionResource) {
        const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
        if (!sessionId) {
            return undefined;
        }
        return this._sessionModels.get(sessionResource)?.title ??
            this._chatSessionStore.getMetadataForSessionSync(sessionResource)?.title;
    }
    loadSessionFromData(data, debugOwner) {
        const sessionId = data.sessionId ?? generateUuid();
        const sessionResource = LocalChatSessionUri.forSession(sessionId);
        return this._sessionModels.acquireOrCreate({
            initialData: { value: data, serializer: new ChatSessionOperationLog() },
            location: data.initialLocation ?? ChatAgentLocation.Chat,
            sessionResource,
            canUseTools: true,
        }, debugOwner ?? 'ChatService#loadSessionFromData');
    }
    async acquireOrLoadSession(sessionResource, location, token, debugOwner) {
        if (sessionResource.scheme === Schemas.vscodeLocalChatSession) {
            return this.acquireOrRestoreLocalSession(sessionResource, debugOwner);
        }
        else {
            return this.loadRemoteSession(sessionResource, location, token, debugOwner);
        }
    }
    async loadRemoteSession(sessionResource, location, token, debugOwner) {
        // Check if session already exists before resolving the provider,
        // so we can return a cached model even if the provider was unregistered.
        {
            const existingRef = this.acquireExistingSession(sessionResource, debugOwner);
            if (existingRef) {
                return existingRef;
            }
        }
        if (!await this.chatSessionService.canResolveChatSession(sessionResource.scheme)) {
            return undefined;
        }
        const providedSession = await this.chatSessionService.getOrCreateChatSession(sessionResource, token);
        // Make sure we haven't created this in the meantime
        {
            const existingRef = this.acquireExistingSession(sessionResource, debugOwner);
            if (existingRef) {
                providedSession.dispose();
                return existingRef;
            }
        }
        const chatSessionType = getChatSessionType(sessionResource);
        const modelId = findLast(providedSession.history.filter(m => m.type === 'request'), req => req.modelId)?.modelId;
        const agentUri = findLast(providedSession.history.filter(m => m.type === 'request'), req => req.modeInstructions?.uri)?.modeInstructions?.uri;
        const storedPermissionLevel = this._chatSessionStore.getMetadataForSessionSync(sessionResource)?.permissionLevel;
        let initialData = undefined;
        if ((modelId || agentUri)) {
            const mode = agentUri ? { kind: ChatModeKind.Agent, id: agentUri.toString() } : { kind: ChatModeKind.Agent, id: ChatMode.Agent.id };
            const modelMetadata = modelId ? this.languageModelsService.lookupLanguageModel(modelId) : undefined;
            const selectedModel = modelId && modelMetadata ? { identifier: modelId, metadata: modelMetadata } : undefined;
            // This is used to initialize the state of the chat input box, with the selected model, mode, etc
            initialData = {
                serializer: new ChatSessionOperationLog(),
                value: {
                    creationDate: Date.now(),
                    initialLocation: undefined,
                    customTitle: undefined,
                    requests: [],
                    responderUsername: '',
                    sessionId: '',
                    version: 3,
                    hasPendingEdits: undefined,
                    inputState: {
                        attachments: [],
                        contrib: {},
                        inputText: '',
                        mode,
                        selectedModel: selectedModel,
                        selections: [],
                        permissionLevel: storedPermissionLevel,
                    },
                    pendingRequests: undefined,
                    repoData: undefined
                }
            };
        }
        // Contributed sessions do not use UI tools
        const modelRef = this._sessionModels.acquireOrCreate({
            initialData,
            location,
            sessionResource: sessionResource,
            canUseTools: false,
            transferEditingSession: providedSession.transferredState?.editingSession,
            inputState: providedSession.transferredState?.inputState,
        }, debugOwner ?? 'ChatService#loadRemoteSession');
        // Restore permission level from metadata even when initialData was not constructed
        if (storedPermissionLevel && !initialData) {
            modelRef.object.inputModel.setState({ permissionLevel: storedPermissionLevel });
        }
        if (providedSession.title) {
            modelRef.object.setCustomTitle(providedSession.title);
        }
        const model = modelRef.object;
        const disposables = new DisposableStore();
        disposables.add(modelRef.object.onDidDispose(() => {
            disposables.dispose();
            providedSession.dispose();
        }));
        let lastRequest;
        for (const message of providedSession.history) {
            if (message.type === 'request') {
                if (lastRequest) {
                    lastRequest.response?.complete();
                }
                const requestText = message.prompt;
                const parsedRequest = {
                    text: requestText,
                    parts: [new ChatRequestTextPart(new OffsetRange(0, requestText.length), { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: requestText.length + 1 }, requestText)]
                };
                const agent = message.participant
                    ? this.chatAgentService.getAgent(message.participant) // TODO(jospicer): Remove and always hardcode?
                    : this.chatAgentService.getAgent(chatSessionType);
                const modeInfo = message.modeInstructions ? {
                    kind: ChatModeKind.Agent,
                    isBuiltin: message.modeInstructions.isBuiltin ?? false,
                    modeInstructions: message.modeInstructions,
                    modeId: 'custom',
                    applyCodeBlockSuggestionId: undefined,
                } : undefined;
                lastRequest = model.addRequest(parsedRequest, message.variableData ?? { variables: [] }, 0, // attempt
                modeInfo, agent, undefined, // slashCommand
                undefined, // confirmation
                undefined, // locationData
                undefined, // attachments
                false, // Do not treat as requests completed, else edit pills won't show.
                message.modelId, undefined, message.id);
            }
            else {
                // response
                if (lastRequest) {
                    for (const part of message.parts) {
                        model.acceptResponseProgress(lastRequest, part);
                    }
                }
            }
        }
        if (providedSession.isCompleteObs?.get()) {
            lastRequest?.response?.complete();
        }
        // Set up progress streaming and cancellation for contributed sessions.
        // This handles both the initial in-flight response (from session load)
        // and any subsequent server-initiated turns (e.g. consumed queued messages).
        const hasProgressStreaming = providedSession.progressObs && providedSession.interruptActiveResponseCallback;
        if (hasProgressStreaming) {
            let lastProgressLength = 0;
            const cancellationListener = disposables.add(new MutableDisposable());
            const createCancellationListener = (token) => {
                return token.onCancellationRequested(() => {
                    providedSession.interruptActiveResponseCallback?.().then(userConfirmedInterruption => {
                        if (!userConfirmedInterruption) {
                            // User cancelled the interruption
                            const newCancellationRequest = this.instantiationService.createInstance(CancellableRequest, new CancellationTokenSource(), undefined, undefined, undefined);
                            this._pendingRequests.set(model.sessionResource, newCancellationRequest);
                            this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: 'add', source: 'remoteSession', chatSessionId: chatSessionResourceToId(model.sessionResource) });
                            cancellationListener.value = createCancellationListener(newCancellationRequest.cancellationTokenSource.token);
                        }
                    });
                });
            };
            const ensureCancellationTracking = () => {
                if (!this._pendingRequests.has(model.sessionResource)) {
                    const cts = this.instantiationService.createInstance(CancellableRequest, new CancellationTokenSource(), undefined, undefined, undefined);
                    this._pendingRequests.set(model.sessionResource, cts);
                    this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: 'add', source: 'remoteSession', chatSessionId: chatSessionResourceToId(model.sessionResource) });
                    cancellationListener.value = createCancellationListener(cts.cancellationTokenSource.token);
                }
            };
            if (lastRequest) {
                const initialCancellationRequest = this.instantiationService.createInstance(CancellableRequest, new CancellationTokenSource(), undefined, undefined, undefined);
                this._pendingRequests.set(model.sessionResource, initialCancellationRequest);
                this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: 'add', source: 'remoteSession', chatSessionId: chatSessionResourceToId(model.sessionResource) });
                cancellationListener.value = createCancellationListener(initialCancellationRequest.cancellationTokenSource.token);
            }
            // Handle server-initiated requests (e.g. consumed queued messages).
            if (providedSession.onDidStartServerRequest) {
                disposables.add(providedSession.onDidStartServerRequest(({ prompt }) => {
                    // Complete any in-flight request
                    if (lastRequest?.response && !lastRequest.response.isComplete) {
                        lastRequest.response.complete();
                    }
                    // Create a new request in the model
                    const requestText = prompt;
                    const parsedRequest = {
                        text: requestText,
                        parts: [new ChatRequestTextPart(new OffsetRange(0, requestText.length), { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: requestText.length + 1 }, requestText)]
                    };
                    const agent = this.chatAgentService.getAgent(chatSessionType);
                    lastRequest = model.addRequest(parsedRequest, { variables: [] }, 0, undefined, agent);
                    // Reset progress tracking for the new turn
                    lastProgressLength = 0;
                    // Ensure cancellation tracking is active
                    ensureCancellationTracking();
                }));
            }
            // Single autorun that streams progress for whichever request is current.
            disposables.add(autorun(reader => {
                const progressArray = providedSession.progressObs?.read(reader) ?? [];
                const isComplete = providedSession.isCompleteObs?.read(reader) ?? false;
                // Process only new progress items
                if (lastRequest && progressArray.length > lastProgressLength) {
                    const newProgress = progressArray.slice(lastProgressLength);
                    for (const progress of newProgress) {
                        model?.acceptResponseProgress(lastRequest, progress);
                    }
                    lastProgressLength = progressArray.length;
                }
                // Handle completion
                if (isComplete && lastRequest) {
                    lastRequest.response?.complete();
                    cancellationListener.clear();
                }
            }));
        }
        else {
            this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: 'notCancelable', source: 'remoteSession', chatSessionId: chatSessionResourceToId(model.sessionResource) });
            if (lastRequest && model.editingSession) {
                // wait for timeline to load so that a 'changes' part is added when the response completes
                await chatEditingSessionIsReady(model.editingSession);
                lastRequest.response?.complete();
            }
        }
        return modelRef;
    }
    async resendRequest(request, options) {
        const model = this._sessionModels.get(request.session.sessionResource);
        if (!model && model !== request.session) {
            throw new Error(`Unknown session: ${request.session.sessionResource}`);
        }
        const cts = this._pendingRequests.get(request.session.sessionResource);
        if (cts) {
            this.trace('resendRequest', `Session ${request.session.sessionResource} already has a pending request, cancelling...`);
            cts.cancel();
        }
        const location = options?.location ?? model.initialLocation;
        const attempt = options?.attempt ?? 0;
        const enableCommandDetection = !options?.noCommandDetection;
        const defaultAgent = this.chatAgentService.getDefaultAgent(location, options?.modeInfo?.kind);
        model.removeRequest(request.id, 1 /* ChatRequestRemovalReason.Resend */);
        const resendOptions = {
            ...options,
            locationData: request.locationData,
            attachedContext: request.attachedContext,
        };
        await this._sendRequestAsync(model, model.sessionResource, request.message, attempt, enableCommandDetection, defaultAgent, location, resendOptions).responseCompletePromise;
    }
    queuePendingRequest(model, sessionResource, request, options) {
        const location = options.location ?? model.initialLocation;
        const parsedRequest = this.parseChatRequest(sessionResource, request, location, options);
        const requestModel = new ChatRequestModel({
            session: model,
            message: parsedRequest,
            variableData: { variables: options.attachedContext ?? [] },
            timestamp: Date.now(),
            modeInfo: options.modeInfo,
            locationData: options.locationData,
            attachedContext: options.attachedContext,
            modelId: options.userSelectedModelId,
            userSelectedTools: options.userSelectedTools?.get(),
            isSystemInitiated: options.isSystemInitiated,
            systemInitiatedLabel: options.systemInitiatedLabel,
        });
        const deferred = new DeferredPromise();
        this._queuedRequestDeferreds.set(requestModel.id, deferred);
        model.addPendingRequest(requestModel, options.queue ?? "queued" /* ChatRequestQueueKind.Queued */, { ...options, queue: undefined });
        if (options.queue === "steering" /* ChatRequestQueueKind.Steering */) {
            this.setYieldRequested(sessionResource);
        }
        this.trace('sendRequest', `Queued message for session ${sessionResource}`);
        return { kind: 'queued', deferred: deferred.p };
    }
    async sendRequest(sessionResource, request, options) {
        this.trace('sendRequest', `sessionResource: ${sessionResource.toString()}, message: ${request.substring(0, 20)}${request.length > 20 ? '[...]' : ''}}`);
        if (!request.trim() && !options?.slashCommand && !options?.agentId && !options?.agentIdSilent) {
            this.trace('sendRequest', 'Rejected empty message');
            return { kind: 'rejected', reason: 'Empty message' };
        }
        let model = this._sessionModels.get(sessionResource);
        if (!model) {
            throw new Error(`Unknown session: ${sessionResource}`);
        }
        let newSessionResource;
        // Workaround for the contributed chat sessions
        //
        // Internally blank widgets uses special sessions with an untitled- path. We do not want these leaking out
        // to the rest of code. Instead use `createNewChatSessionItem` to make sure the session gets properly initialized with a real resource before processing the first request.
        if (!model.hasRequests && isUntitledChatSession(sessionResource) && getChatSessionType(sessionResource) !== localChatSessionType) {
            const parsedRequest = this.parseChatRequest(sessionResource, request, options?.location ?? model.initialLocation, options);
            const commandPart = parsedRequest.parts.find((r) => r instanceof ChatRequestSlashCommandPart);
            const requestText = getPromptText(parsedRequest).message;
            // Capture session options before loading the remote session,
            // since the alias registration below may change the lookup.
            const initialSessionOptions = this.chatSessionService.getSessionOptions(sessionResource);
            const newItem = await this.chatSessionService.createNewChatSessionItem(getChatSessionType(sessionResource), { prompt: requestText, command: commandPart?.text, initialSessionOptions }, CancellationToken.None);
            if (newItem) {
                model = (await this.loadRemoteSession(newItem.resource, model.initialLocation, CancellationToken.None))?.object;
                if (!model) {
                    throw new Error(`Failed to load session for resource: ${newItem.resource}`);
                }
                // Register alias so session-option lookups work with the new resource
                this.chatSessionService.registerSessionResourceAlias(sessionResource, newItem.resource);
                // Update the new model's contributed session with initialSessionOptions
                // so that the agent receives them when invoked.
                if (initialSessionOptions) {
                    this.chatSessionService.updateSessionOptions(model.sessionResource, initialSessionOptions);
                }
                sessionResource = newItem.resource;
                newSessionResource = newItem.resource;
            }
        }
        const hasPendingRequest = this._pendingRequests.has(sessionResource);
        if (options?.queue) {
            const queued = this.queuePendingRequest(model, sessionResource, request, options);
            if (!options.pauseQueue) {
                this.processPendingRequests(sessionResource);
            }
            return queued;
        }
        else if (hasPendingRequest) {
            this.trace('sendRequest', `Session ${sessionResource} already has a pending request`);
            return { kind: 'rejected', reason: 'Request already in progress' };
        }
        const requests = model.getRequests();
        for (let i = requests.length - 1; i >= 0; i -= 1) {
            const request = requests[i];
            if (request.shouldBeRemovedOnSend) {
                if (request.shouldBeRemovedOnSend.afterUndoStop) {
                    request.response?.finalizeUndoState();
                }
                else {
                    await this.removeRequest(sessionResource, request.id);
                }
            }
        }
        const location = options?.location ?? model.initialLocation;
        const attempt = options?.attempt ?? 0;
        const defaultAgent = this.chatAgentService.getDefaultAgent(location, options?.modeInfo?.kind);
        const parsedRequest = this.parseChatRequest(sessionResource, request, location, options);
        const silentAgent = options?.agentIdSilent ? this.chatAgentService.getAgent(options.agentIdSilent) : undefined;
        const agent = silentAgent ?? parsedRequest.parts.find((r) => r instanceof ChatRequestAgentPart)?.agent ?? defaultAgent;
        const agentSlashCommandPart = parsedRequest.parts.find((r) => r instanceof ChatRequestAgentSubcommandPart);
        // This method is only returning whether the request was accepted - don't block on the actual request
        return {
            kind: 'sent',
            newSessionResource,
            data: {
                ...this._sendRequestAsync(model, sessionResource, parsedRequest, attempt, !options?.noCommandDetection, silentAgent ?? defaultAgent, location, options),
                agent,
                slashCommand: agentSlashCommandPart?.command,
            },
        };
    }
    parseChatRequest(sessionResource, request, location, options) {
        let parserContext = options?.parserContext;
        if (options?.agentId) {
            const agent = this.chatAgentService.getAgent(options.agentId);
            if (!agent) {
                throw new Error(`Unknown agent: ${options.agentId}`);
            }
            parserContext = { selectedAgent: agent, mode: options.modeInfo?.kind };
            const commandPart = options.slashCommand ? ` ${chatSubcommandLeader}${options.slashCommand}` : '';
            request = `${chatAgentLeader}${agent.name}${commandPart} ${request}`;
        }
        else if (options?.agentIdSilent && !parserContext?.forcedAgent) {
            // Resolve slash commandsin the context of locked participant so its subcommands take precedence over global
            // slash commands with the same name.
            const silentAgent = this.chatAgentService.getAgent(options.agentIdSilent);
            if (silentAgent) {
                parserContext = { ...parserContext, forcedAgent: silentAgent };
            }
        }
        const parsedRequest = this.instantiationService.createInstance(ChatRequestParser).parseChatRequest(sessionResource, request, location, parserContext);
        return parsedRequest;
    }
    refreshFollowupsCancellationToken(sessionResource) {
        this._sessionFollowupCancelTokens.get(sessionResource)?.cancel();
        const newTokenSource = new CancellationTokenSource();
        this._sessionFollowupCancelTokens.set(sessionResource, newTokenSource);
        return newTokenSource.token;
    }
    _sendRequestAsync(model, sessionResource, parsedRequest, attempt, enableCommandDetection, defaultAgent, location, options) {
        const followupsCancelToken = this.refreshFollowupsCancellationToken(sessionResource);
        let request;
        const agentPart = parsedRequest.parts.find((r) => r instanceof ChatRequestAgentPart);
        const agentSlashCommandPart = parsedRequest.parts.find((r) => r instanceof ChatRequestAgentSubcommandPart);
        const commandPart = parsedRequest.parts.find((r) => r instanceof ChatRequestSlashCommandPart);
        const requests = [...model.getRequests()];
        const requestTelemetry = this.instantiationService.createInstance(ChatRequestTelemetry, {
            agent: agentPart?.agent ?? defaultAgent,
            agentSlashCommandPart,
            commandPart,
            sessionResource: model.sessionResource,
            location: model.initialLocation,
            options,
            enableCommandDetection
        });
        let gotProgress = false;
        const requestType = commandPart ? 'slashCommand' : 'string';
        const responseCreated = new DeferredPromise();
        let responseCreatedComplete = false;
        function completeResponseCreated() {
            if (!responseCreatedComplete && request?.response) {
                responseCreated.complete(request.response);
                responseCreatedComplete = true;
            }
        }
        const store = new DisposableStore();
        const source = store.add(new CancellationTokenSource());
        const token = source.token;
        const sendRequestInternal = async () => {
            const progressCallback = (progress) => {
                if (token.isCancellationRequested) {
                    return;
                }
                if (!gotProgress) {
                    markChat(sessionResource, ChatPerfMark.FirstToken);
                }
                gotProgress = true;
                for (let i = 0; i < progress.length; i++) {
                    const isLast = i === progress.length - 1;
                    const progressItem = progress[i];
                    if (progressItem.kind === 'markdownContent') {
                        this.trace('sendRequest', `Provider returned progress for session ${model.sessionResource}, ${progressItem.content.value.length} chars`);
                    }
                    else {
                        this.trace('sendRequest', `Provider returned progress: ${JSON.stringify(progressItem)}`);
                    }
                    if (request) {
                        model.acceptResponseProgress(request, progressItem, !isLast);
                    }
                }
                completeResponseCreated();
            };
            let detectedAgent;
            let detectedCommand;
            // Gate /troubleshoot and the troubleshoot skill behind the feature flags
            {
                const debugLogEnabled = this.configurationService.getValue(AGENT_DEBUG_LOG_ENABLED_SETTING);
                const fileLoggingEnabled = this.configurationService.getValue(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING);
                if (!debugLogEnabled || !fileLoggingEnabled) {
                    const isTroubleshootCommand = agentSlashCommandPart?.command.name === TROUBLESHOOT_COMMAND_NAME;
                    const hasTroubleshootSkill = options?.attachedContext?.some(v => {
                        const uri = IChatRequestVariableEntry.toUri(v);
                        return uri && (uri.scheme === COPILOT_SKILL_URI_SCHEME || uri.path.includes(TROUBLESHOOT_SKILL_PATH));
                    });
                    if (isTroubleshootCommand || hasTroubleshootSkill) {
                        request = model.addRequest(parsedRequest, { variables: [] }, attempt, options?.modeInfo);
                        completeResponseCreated();
                        const missingSettings = [];
                        if (!debugLogEnabled) {
                            missingSettings.push('`' + AGENT_DEBUG_LOG_ENABLED_SETTING + '`');
                        }
                        if (!fileLoggingEnabled) {
                            missingSettings.push('`' + AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING + '`');
                        }
                        const settingsQuery = !debugLogEnabled && !fileLoggingEnabled
                            ? AGENT_DEBUG_LOG_ENABLED_SETTING
                            : !debugLogEnabled ? '@id:' + AGENT_DEBUG_LOG_ENABLED_SETTING : '@id:' + AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING;
                        const settingsArg = encodeURIComponent(JSON.stringify(settingsQuery));
                        model.acceptResponseProgress(request, {
                            kind: 'markdownContent',
                            content: new MarkdownString(localize('agentDebugLog.troubleshootDisabled', "The `{0}` skill requires the following settings to be enabled: {1}. After enabling, reload the window to apply. [Enable in Settings](command:workbench.action.openSettings?{2})", TROUBLESHOOT_COMMAND_NAME, missingSettings.join(', '), settingsArg), { isTrusted: { enabledCommands: ['workbench.action.openSettings'] } }),
                        });
                        model.setResponse(request, {});
                        request.response?.complete();
                        return;
                    }
                }
            }
            // Collect hooks from hook .json files
            let collectedHooks;
            let hasDisabledClaudeHooks = false;
            try {
                const hooksInfo = await this.promptsService.getHooks(token);
                if (hooksInfo) {
                    collectedHooks = hooksInfo.hooks;
                    hasDisabledClaudeHooks = hooksInfo.hasDisabledClaudeHooks;
                }
            }
            catch (error) {
                this.logService.warn('[ChatService] Failed to collect hooks:', error);
            }
            // Merge hooks from the selected custom agent's frontmatter (if any)
            const agentName = options?.modeInfo?.modeInstructions?.name;
            if (agentName) {
                try {
                    const agents = await this.promptsService.getCustomAgents(token);
                    const customAgent = agents.find(a => a.name === agentName);
                    if (customAgent?.hooks) {
                        collectedHooks = mergeHooks(collectedHooks, customAgent.hooks);
                    }
                }
                catch (error) {
                    this.logService.warn('[ChatService] Failed to collect agent hooks:', error);
                }
            }
            const stopWatch = new StopWatch(false);
            store.add(token.onCancellationRequested(() => {
                this.trace('sendRequest', `Request for session ${model.sessionResource} was cancelled`);
                if (!request) {
                    return;
                }
                requestTelemetry.complete({
                    timeToFirstProgress: undefined,
                    result: 'cancelled',
                    // Normally timings happen inside the EH around the actual provider. For cancellation we can measure how long the user waited before cancelling
                    totalTime: stopWatch.elapsed(),
                    requestType,
                    detectedAgent,
                    request,
                });
                model.cancelRequest(request);
            }));
            try {
                let rawResult;
                let agentOrCommandFollowups = undefined;
                if (agentPart || (defaultAgent && !commandPart)) {
                    const prepareChatAgentRequest = (agent, command, enableCommandDetection, chatRequest, isParticipantDetected) => {
                        const initVariableData = { variables: [] };
                        request = chatRequest ?? model.addRequest(parsedRequest, initVariableData, attempt, options?.modeInfo, agent, command, options?.confirmation, options?.locationData, options?.attachedContext, undefined, options?.userSelectedModelId, options?.userSelectedTools?.get(), undefined, options?.isSystemInitiated, options?.systemInitiatedLabel);
                        let variableData;
                        let message;
                        if (chatRequest) {
                            variableData = chatRequest.variableData;
                            message = getPromptText(request.message).message;
                        }
                        else {
                            variableData = { variables: this.prepareContext(request.attachedContext) };
                            model.updateRequest(request, variableData);
                            // Merge resolved variables (e.g. images from directories) for the
                            // agent request only - they are not stored on the request model.
                            if (options?.resolvedVariables?.length) {
                                variableData = { variables: [...variableData.variables, ...options.resolvedVariables] };
                            }
                            const promptTextResult = getPromptText(request.message);
                            variableData = updateRanges(variableData, promptTextResult.diff); // TODO bit of a hack
                            message = promptTextResult.message;
                        }
                        const agentRequest = {
                            sessionResource: model.sessionResource,
                            requestId: request.id,
                            agentId: agent.id,
                            message,
                            command: command?.name,
                            variables: variableData,
                            enableCommandDetection,
                            isParticipantDetected,
                            attempt,
                            location,
                            locationData: request.locationData,
                            acceptedConfirmationData: options?.acceptedConfirmationData,
                            rejectedConfirmationData: options?.rejectedConfirmationData,
                            userSelectedModelId: options?.userSelectedModelId,
                            modelConfiguration: options?.userSelectedModelId ? this.languageModelsService.getModelConfiguration(options.userSelectedModelId) : undefined,
                            userSelectedTools: options?.userSelectedTools?.get(),
                            modeInstructions: options?.modeInfo?.modeInstructions,
                            permissionLevel: options?.modeInfo?.permissionLevel,
                            editedFileEvents: request.editedFileEvents,
                            hooks: collectedHooks,
                            hasHooksEnabled: !!collectedHooks && Object.values(collectedHooks).some(arr => arr.length > 0),
                            isSystemInitiated: options?.isSystemInitiated,
                        };
                        let isInitialTools = true;
                        store.add(autorun(reader => {
                            const tools = options?.userSelectedTools?.read(reader);
                            if (isInitialTools) {
                                isInitialTools = false;
                                return;
                            }
                            if (tools && request) {
                                this.chatAgentService.setRequestTools(agent.id, request.id, tools);
                                // in case the request has not been sent out yet:
                                agentRequest.userSelectedTools = tools;
                            }
                        }));
                        return agentRequest;
                    };
                    if (this.configurationService.getValue('chat.detectParticipant.enabled') !== false &&
                        this.chatAgentService.hasChatParticipantDetectionProviders() &&
                        !agentPart &&
                        !commandPart &&
                        !agentSlashCommandPart &&
                        enableCommandDetection &&
                        (location !== ChatAgentLocation.EditorInline || !this.configurationService.getValue("inlineChat.enableV2" /* InlineChatConfigKeys.EnableV2 */)) &&
                        options?.modeInfo?.kind !== ChatModeKind.Agent &&
                        options?.modeInfo?.kind !== ChatModeKind.Edit &&
                        !options?.agentIdSilent) {
                        // We have no agent or command to scope history with, pass the full history to the participant detection provider
                        const defaultAgentHistory = this.getHistoryEntriesFromModel(requests, location, defaultAgent.id);
                        // Prepare the request object that we will send to the participant detection provider
                        const chatAgentRequest = prepareChatAgentRequest(defaultAgent, undefined, enableCommandDetection, undefined, false);
                        const result = await this.chatAgentService.detectAgentOrCommand(chatAgentRequest, defaultAgentHistory, { location }, token);
                        if (result && this.chatAgentService.getAgent(result.agent.id)?.locations?.includes(location)) {
                            // Update the response in the ChatModel to reflect the detected agent and command
                            request?.response?.setAgent(result.agent, result.command);
                            detectedAgent = result.agent;
                            detectedCommand = result.command;
                        }
                    }
                    const agent = (detectedAgent ?? agentPart?.agent ?? defaultAgent);
                    const command = detectedCommand ?? agentSlashCommandPart?.command;
                    await this.extensionService.activateByEvent(`onChatParticipant:${agent.id}`);
                    // Recompute history in case the agent or command changed
                    const history = this.getHistoryEntriesFromModel(requests, location, agent.id);
                    const requestProps = prepareChatAgentRequest(agent, command, enableCommandDetection, request /* Reuse the request object if we already created it for participant detection */, !!detectedAgent);
                    this.generateInitialChatTitleIfNeeded(model, requestProps, defaultAgent, token);
                    const pendingRequest = this._pendingRequests.get(sessionResource);
                    if (pendingRequest) {
                        store.add(autorun(reader => {
                            const yieldRequested = pendingRequest.yieldRequested.read(reader);
                            if (request) {
                                this.chatAgentService.setYieldRequested(agent.id, request.id, yieldRequested);
                            }
                        }));
                        pendingRequest.requestId ??= requestProps.requestId;
                        if (pendingRequest.requestId) {
                            this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: 'add', source: 'sendRequestId', requestId: pendingRequest.requestId, chatSessionId: chatSessionResourceToId(sessionResource) });
                        }
                    }
                    completeResponseCreated();
                    // Check for disabled Claude Code hooks and notify the user once per workspace.
                    // Only set the flag when actually showing the hint, so the setup agent flow
                    // (which may resend requests) doesn't consume the flag before the real request runs.
                    const disabledClaudeHooksDismissedKey = 'chat.disabledClaudeHooks.notification';
                    if (hasDisabledClaudeHooks && !this.storageService.getBoolean(disabledClaudeHooksDismissedKey, 1 /* StorageScope.WORKSPACE */)) {
                        this.storageService.store(disabledClaudeHooksDismissedKey, true, 1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */);
                        progressCallback([{ kind: 'disabledClaudeHooks' }]);
                    }
                    // MCP autostart: only run for native VS Code sessions (sidebar, new editors) but not for extension contributed sessions that have inputType set.
                    if (model.canUseTools) {
                        const autostartResult = new ChatMcpServersStarting(this.mcpService.autostart(token));
                        if (!autostartResult.isEmpty) {
                            progressCallback([autostartResult]);
                            await autostartResult.wait();
                        }
                    }
                    const agentResult = await this.chatAgentService.invokeAgent(agent.id, requestProps, progressCallback, history, token);
                    rawResult = agentResult;
                    agentOrCommandFollowups = this.chatAgentService.getFollowups(agent.id, requestProps, agentResult, history, followupsCancelToken);
                }
                else if (commandPart && this.chatSlashCommandService.hasCommand(commandPart.slashCommand.command)) {
                    if (commandPart.slashCommand.silent !== true) {
                        request = model.addRequest(parsedRequest, { variables: [] }, attempt, options?.modeInfo);
                        completeResponseCreated();
                    }
                    // contributed slash commands
                    // TODO: spell this out in the UI
                    const history = [];
                    for (const modelRequest of model.getRequests()) {
                        if (!modelRequest.response) {
                            continue;
                        }
                        history.push({ role: 1 /* ChatMessageRole.User */, content: [{ type: 'text', value: modelRequest.message.text }] });
                        history.push({ role: 2 /* ChatMessageRole.Assistant */, content: [{ type: 'text', value: modelRequest.response.response.toString() }] });
                    }
                    const message = parsedRequest.text;
                    const commandResult = await this.chatSlashCommandService.executeCommand(commandPart.slashCommand.command, message.substring(commandPart.slashCommand.command.length + 1).trimStart(), new Progress(p => {
                        progressCallback([p]);
                    }), history, location, model.sessionResource, token, options);
                    agentOrCommandFollowups = Promise.resolve(commandResult?.followUp);
                    rawResult = {};
                }
                else {
                    throw new Error(`Cannot handle request`);
                }
                if ((token.isCancellationRequested && !rawResult)) {
                    return;
                }
                else if (!request) {
                    // Silent slash command completed successfully — allow queued
                    // requests to proceed.
                    shouldProcessPending = !token.isCancellationRequested;
                    return;
                }
                else {
                    if (!rawResult) {
                        this.trace('sendRequest', `Provider returned no response for session ${model.sessionResource}`);
                        rawResult = { errorDetails: { message: localize('emptyResponse', "Provider returned null response") } };
                    }
                    const result = rawResult.errorDetails?.responseIsFiltered ? 'filtered' :
                        rawResult.errorDetails && gotProgress ? 'errorWithOutput' :
                            rawResult.errorDetails ? 'error' :
                                'success';
                    requestTelemetry.complete({
                        timeToFirstProgress: rawResult.timings?.firstProgress,
                        totalTime: rawResult.timings?.totalElapsed,
                        result,
                        requestType,
                        detectedAgent,
                        request,
                    });
                    model.setResponse(request, rawResult);
                    completeResponseCreated();
                    this.trace('sendRequest', `Provider returned response for session ${model.sessionResource}`);
                    if (rawResult.errorDetails?.isRateLimited) {
                        this.chatEntitlementService.markAnonymousRateLimited();
                    }
                    shouldProcessPending = !rawResult.errorDetails && !token.isCancellationRequested;
                    request.response?.complete();
                    if (agentOrCommandFollowups) {
                        agentOrCommandFollowups.then(followups => {
                            model.setFollowups(request, followups);
                            const commandForTelemetry = agentSlashCommandPart ? agentSlashCommandPart.command.name : commandPart?.slashCommand.command;
                            this._chatServiceTelemetry.retrievedFollowups(agentPart?.agent.id ?? '', commandForTelemetry, followups?.length ?? 0);
                        });
                    }
                }
            }
            catch (err) {
                this.logService.error(`Error while handling chat request: ${toErrorMessage(err, true)}`);
                if (request) {
                    requestTelemetry.complete({
                        timeToFirstProgress: undefined,
                        totalTime: undefined,
                        result: 'error',
                        requestType,
                        detectedAgent,
                        request,
                    });
                    const rawResult = { errorDetails: { message: err.message } };
                    model.setResponse(request, rawResult);
                    completeResponseCreated();
                    request.response?.complete();
                }
            }
            finally {
                store.dispose();
            }
        };
        let shouldProcessPending = false;
        const rawResponsePromise = sendRequestInternal();
        // Note- requestId is not known at this point, assigned later
        const cancellableRequest = this.instantiationService.createInstance(CancellableRequest, source, undefined, rawResponsePromise, options);
        this._pendingRequests.set(model.sessionResource, cancellableRequest);
        this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: 'add', source: 'sendRequest', chatSessionId: chatSessionResourceToId(model.sessionResource) });
        rawResponsePromise.finally(() => {
            markChat(sessionResource, ChatPerfMark.RequestComplete);
            clearChatMarks(sessionResource);
            if (this._pendingRequests.get(model.sessionResource) === cancellableRequest) {
                this._pendingRequests.deleteAndDispose(model.sessionResource);
                this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: 'remove', source: 'sendRequestComplete', requestId: cancellableRequest.requestId, chatSessionId: chatSessionResourceToId(model.sessionResource) });
            }
            // Process the next pending request from the queue if any
            if (shouldProcessPending) {
                this.processNextPendingRequest(model);
            }
        });
        if (options?.userSelectedModelId) {
            this.languageModelsService.addToRecentlyUsedList(options.userSelectedModelId);
        }
        this._onDidSubmitRequest.fire({ chatSessionResource: model.sessionResource, message: parsedRequest });
        return {
            responseCreatedPromise: responseCreated.p,
            responseCompletePromise: rawResponsePromise,
        };
    }
    processPendingRequests(sessionResource) {
        const model = this._sessionModels.get(sessionResource);
        if (model && !this._pendingRequests.has(sessionResource)) {
            this.processNextPendingRequest(model);
        }
    }
    /**
     * Returns true if the session is backed by an agent host server, which
     * controls queued-message dequeuing on the server side.
     */
    _isServerManagedQueue(sessionResource) {
        return sessionResource.scheme.startsWith('agent-host-');
    }
    /**
     * Process the next pending request from the model's queue, if any.
     * Called after a request completes to continue processing queued requests.
     * Multiple consecutive steering requests are combined into a single request.
     */
    processNextPendingRequest(model) {
        // Agent host sessions delegate queue management to the server.
        // The server dispatches SessionTurnStarted with queuedMessageId when
        // it consumes a queued message, so the client should not dequeue eagerly.
        if (this._isServerManagedQueue(model.sessionResource)) {
            return;
        }
        // Dequeue all consecutive steering requests and combine them into one
        const steeringRequests = model.dequeueAllSteeringRequests();
        // Then dequeue a single non-steering request if no steering was found
        const nextQueued = steeringRequests.length === 0 ? model.dequeuePendingRequest() : undefined;
        const allRequests = steeringRequests.length > 0 ? steeringRequests : (nextQueued ? [nextQueued] : []);
        if (allRequests.length === 0) {
            return;
        }
        this.trace('processNextPendingRequest', `Processing ${allRequests.length} queued request(s) for session ${model.sessionResource}`);
        // Collect and remove all deferreds
        const deferreds = [];
        for (const req of allRequests) {
            const deferred = this._queuedRequestDeferreds.get(req.request.id);
            this._queuedRequestDeferreds.delete(req.request.id);
            if (deferred) {
                deferreds.push(deferred);
            }
        }
        // Build send options from the first request, combining attachments from all
        const firstRequest = allRequests[0];
        const sendOptions = {
            ...firstRequest.sendOptions,
            attachedContext: allRequests.flatMap(req => req.request.variableData.variables.slice()),
        };
        const location = sendOptions.location ?? sendOptions.locationData?.type ?? model.initialLocation;
        const defaultAgent = this.chatAgentService.getDefaultAgent(location, sendOptions.modeInfo?.kind);
        if (!defaultAgent) {
            this.logService.warn('processNextPendingRequest', `No default agent for location ${location}`);
            for (const deferred of deferreds) {
                deferred.complete({ kind: 'rejected', reason: 'No default agent available' });
            }
            return;
        }
        // For multiple steering requests, combine texts and re-parse; otherwise use as-is
        let parsedRequest;
        try {
            if (allRequests.length > 1) {
                const combinedText = allRequests.map(req => req.request.message.text).join('\n\n');
                // message.text already includes agent/slash-command prefixes from the
                // original parse, so clear them to avoid double-prefixing.
                parsedRequest = this.parseChatRequest(model.sessionResource, combinedText, location, {
                    ...sendOptions,
                    agentId: undefined,
                    slashCommand: undefined,
                });
            }
            else {
                parsedRequest = firstRequest.request.message;
            }
        }
        catch (err) {
            this.logService.error('processNextPendingRequest: failed to parse combined chat request', err);
            const reason = toErrorMessage(err);
            for (const deferred of deferreds) {
                deferred.complete({ kind: 'rejected', reason });
            }
            return;
        }
        const silentAgent = sendOptions.agentIdSilent ? this.chatAgentService.getAgent(sendOptions.agentIdSilent) : undefined;
        const agent = silentAgent ?? parsedRequest.parts.find((r) => r instanceof ChatRequestAgentPart)?.agent ?? defaultAgent;
        const agentSlashCommandPart = parsedRequest.parts.find((r) => r instanceof ChatRequestAgentSubcommandPart);
        const responseState = this._sendRequestAsync(model, model.sessionResource, parsedRequest, firstRequest.request.attempt, !sendOptions.noCommandDetection, silentAgent ?? defaultAgent, location, sendOptions);
        const result = {
            kind: 'sent',
            data: {
                ...responseState,
                agent,
                slashCommand: agentSlashCommandPart?.command,
            },
        };
        for (const deferred of deferreds) {
            deferred.complete(result);
        }
    }
    generateInitialChatTitleIfNeeded(model, request, defaultAgent, token) {
        // Generate a title only for the first request, and only via the default agent.
        // Use a single-entry history based on the current request (no full chat history).
        if (model.getRequests().length !== 1 || model.customTitle) {
            return;
        }
        const singleEntryHistory = [{
                request,
                response: [],
                result: {}
            }];
        const generate = async () => {
            const title = await this.chatAgentService.getChatTitle(defaultAgent.id, singleEntryHistory, token);
            if (title && !model.customTitle) {
                model.setCustomTitle(title);
            }
        };
        void generate();
    }
    prepareContext(attachedContextVariables) {
        attachedContextVariables ??= [];
        // "reverse", high index first so that replacement is simple
        attachedContextVariables.sort((a, b) => {
            // If either range is undefined, sort it to the back
            if (!a.range && !b.range) {
                return 0; // Keep relative order if both ranges are undefined
            }
            if (!a.range) {
                return 1; // a goes after b
            }
            if (!b.range) {
                return -1; // a goes before b
            }
            return b.range.start - a.range.start;
        });
        return attachedContextVariables;
    }
    getHistoryEntriesFromModel(requests, location, forAgentId) {
        const history = [];
        const agent = this.chatAgentService.getAgent(forAgentId);
        for (const request of requests) {
            if (!request.response) {
                continue;
            }
            if (forAgentId !== request.response.agent?.id && !agent?.isDefault && !agent?.canAccessPreviousChatHistory) {
                // An agent only gets to see requests that were sent to this agent.
                // The default agent (the undefined case), or agents with 'canAccessPreviousChatHistory', get to see all of them.
                continue;
            }
            // Do not save to history inline completions
            if (location === ChatAgentLocation.EditorInline) {
                continue;
            }
            const promptTextResult = getPromptText(request.message);
            const historyRequest = {
                sessionResource: request.session.sessionResource,
                requestId: request.id,
                agentId: request.response.agent?.id ?? '',
                message: promptTextResult.message,
                command: request.response.slashCommand?.name,
                variables: updateRanges(request.variableData, promptTextResult.diff), // TODO bit of a hack
                location: ChatAgentLocation.Chat,
                editedFileEvents: request.editedFileEvents,
                modeInstructions: request.modeInfo?.modeInstructions,
            };
            history.push({ request: historyRequest, response: toChatHistoryContent(request.response.response.value), result: request.response.result ?? {} });
        }
        return history;
    }
    async removeRequest(sessionResource, requestId) {
        const model = this._sessionModels.get(sessionResource);
        if (!model) {
            throw new Error(`Unknown session: ${sessionResource}`);
        }
        const pendingRequest = this._pendingRequests.get(sessionResource);
        if (pendingRequest?.requestId === requestId) {
            pendingRequest.cancel();
            this._pendingRequests.deleteAndDispose(sessionResource);
            this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: 'remove', source: 'removeRequest', requestId, chatSessionId: chatSessionResourceToId(model.sessionResource) });
        }
        model.removeRequest(requestId);
    }
    async adoptRequest(sessionResource, request) {
        if (!(request instanceof ChatRequestModel)) {
            throw new TypeError('Can only adopt requests of type ChatRequestModel');
        }
        const target = this._sessionModels.get(sessionResource);
        if (!target) {
            throw new Error(`Unknown session: ${sessionResource}`);
        }
        const oldOwner = request.session;
        target.adoptRequest(request);
        if (request.response && !request.response.isComplete) {
            const cts = this._pendingRequests.deleteAndLeak(oldOwner.sessionResource);
            if (cts) {
                cts.requestId = request.id;
                this._pendingRequests.set(target.sessionResource, cts);
                this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: 'remove', source: 'adoptRequest', requestId: request.id, chatSessionId: chatSessionResourceToId(oldOwner.sessionResource) });
                this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: 'add', source: 'adoptRequest', requestId: request.id, chatSessionId: chatSessionResourceToId(target.sessionResource) });
            }
        }
    }
    async addCompleteRequest(sessionResource, message, variableData, attempt, response) {
        this.trace('addCompleteRequest', `message: ${message}`);
        const model = this._sessionModels.get(sessionResource);
        if (!model) {
            throw new Error(`Unknown session: ${sessionResource}`);
        }
        const parsedRequest = typeof message === 'string' ?
            this.instantiationService.createInstance(ChatRequestParser).parseChatRequest(sessionResource, message) :
            message;
        const request = model.addRequest(parsedRequest, variableData || { variables: [] }, attempt ?? 0, undefined, undefined, undefined, undefined, undefined, undefined, true);
        if (typeof response.message === 'string') {
            // TODO is this possible?
            model.acceptResponseProgress(request, { content: new MarkdownString(response.message), kind: 'markdownContent' });
        }
        else {
            for (const part of response.message) {
                model.acceptResponseProgress(request, part, true);
            }
        }
        model.setResponse(request, response.result || {});
        if (response.followups !== undefined) {
            model.setFollowups(request, response.followups);
        }
        request.response?.complete();
    }
    async cancelCurrentRequestForSession(sessionResource, source) {
        this.trace('cancelCurrentRequestForSession', `session: ${sessionResource}`);
        const pendingRequest = this._pendingRequests.get(sessionResource);
        if (!pendingRequest) {
            const model = this._sessionModels.get(sessionResource);
            const requestInProgress = model?.requestInProgress.get();
            const pendingRequestsCount = model?.getPendingRequests().length ?? 0;
            const lastRequest = model?.lastRequest;
            this.telemetryService.publicLog2(ChatStopCancellationNoopEventName, {
                source: source ?? 'chatService',
                reason: 'noPendingRequest',
                requestInProgress: requestInProgress === undefined ? 'unknown' : requestInProgress ? 'true' : 'false',
                pendingRequests: pendingRequestsCount,
                sessionScheme: sessionResource.scheme,
                lastRequestId: lastRequest?.id,
                chatSessionId: chatSessionResourceToId(sessionResource),
            });
            this.info('cancelCurrentRequestForSession', `No pending request was found for session ${sessionResource}. requestInProgress=${requestInProgress ?? 'unknown'}, pendingRequests=${pendingRequestsCount}`);
            return;
        }
        const responseCompletePromise = pendingRequest.responseCompletePromise;
        pendingRequest.cancel();
        this._pendingRequests.deleteAndDispose(sessionResource);
        this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: 'remove', source: source ?? 'cancelRequest', requestId: pendingRequest.requestId, chatSessionId: chatSessionResourceToId(sessionResource) });
        if (responseCompletePromise) {
            await raceTimeout(responseCompletePromise, 1000);
        }
    }
    setYieldRequested(sessionResource) {
        const pendingRequest = this._pendingRequests.get(sessionResource);
        if (pendingRequest) {
            pendingRequest.setYieldRequested();
        }
    }
    migrateRequests(originalResource, targetResource) {
        const model = this._sessionModels.get(originalResource);
        if (!model) {
            return;
        }
        const pendingRequests = [...model.getPendingRequests()];
        if (pendingRequests.length === 0) {
            return;
        }
        // Remove each remaining pending request from the original session
        for (const pending of pendingRequests) {
            this.removePendingRequest(originalResource, pending.request.id);
        }
        // Re-send remaining queued requests
        for (const pending of pendingRequests) {
            void this.sendRequest(targetResource, pending.request.message.text, {
                ...pending.sendOptions,
                queue: pending.kind,
            });
        }
    }
    removePendingRequest(sessionResource, requestId) {
        const model = this._sessionModels.get(sessionResource);
        if (model) {
            model.removePendingRequest(requestId);
            // If there are no more steering requests pending, reset yieldRequested on the active request
            const hasSteeringRequests = model.getPendingRequests().some(r => r.kind === "steering" /* ChatRequestQueueKind.Steering */);
            if (!hasSteeringRequests) {
                const pendingRequest = this._pendingRequests.get(sessionResource);
                pendingRequest?.resetYieldRequested();
            }
        }
        // Reject the deferred promise for the removed request
        const deferred = this._queuedRequestDeferreds.get(requestId);
        if (deferred) {
            deferred.complete({ kind: 'rejected', reason: 'Request was removed from queue' });
            this._queuedRequestDeferreds.delete(requestId);
        }
    }
    setPendingRequests(sessionResource, requests) {
        const model = this._sessionModels.get(sessionResource);
        if (model) {
            model.setPendingRequests(requests);
        }
    }
    hasSessions() {
        return this._chatSessionStore.hasSessions();
    }
    async transferChatSession(transferredSessionResource, toWorkspace) {
        if (!LocalChatSessionUri.isLocalSession(transferredSessionResource)) {
            throw new Error(`Can only transfer local chat sessions. Invalid session: ${transferredSessionResource}`);
        }
        const model = this._sessionModels.get(transferredSessionResource);
        if (!model) {
            throw new Error(`Failed to transfer session. Unknown session: ${transferredSessionResource}`);
        }
        if (model.initialLocation !== ChatAgentLocation.Chat) {
            throw new Error(`Can only transfer chat sessions located in the Chat view. Session ${transferredSessionResource} has location=${model.initialLocation}`);
        }
        await this._chatSessionStore.storeTransferSession({
            sessionResource: model.sessionResource,
            timestampInMilliseconds: Date.now(),
            toWorkspace: toWorkspace,
        }, model);
        this.chatTransferService.addWorkspaceToTransferred(toWorkspace);
        this.trace('transferChatSession', `Transferred session ${model.sessionResource} to workspace ${toWorkspace.toString()}`);
    }
    getChatStorageFolder() {
        return this._chatSessionStore.getChatStorageFolder();
    }
    logChatIndex() {
        this._chatSessionStore.logIndex();
    }
    setSessionTitle(sessionResource, title) {
        this._sessionModels.get(sessionResource)?.setCustomTitle(title);
    }
    appendProgress(request, progress) {
        const model = this._sessionModels.get(request.session.sessionResource);
        if (!(request instanceof ChatRequestModel)) {
            throw new BugIndicatingError('Can only append progress to requests of type ChatRequestModel');
        }
        model?.acceptResponseProgress(request, progress);
    }
    toLocalSessionId(sessionResource) {
        const localSessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
        if (!localSessionId) {
            throw new Error(`Invalid local chat session resource: ${sessionResource}`);
        }
        return localSessionId;
    }
};
ChatService = __decorate([
    __param(0, IStorageService),
    __param(1, ILogService),
    __param(2, ITelemetryService),
    __param(3, IExtensionService),
    __param(4, IInstantiationService),
    __param(5, IWorkspaceContextService),
    __param(6, IChatSlashCommandService),
    __param(7, IChatAgentService),
    __param(8, IConfigurationService),
    __param(9, IChatTransferService),
    __param(10, IChatSessionsService),
    __param(11, IMcpService),
    __param(12, IPromptsService),
    __param(13, IChatEntitlementService),
    __param(14, ILanguageModelsService),
    __param(15, IChatDebugService)
], ChatService);
export { ChatService };
export async function chatModelToChatDetail(model) {
    const title = model.title || localize('newChat', "New Chat");
    return {
        sessionResource: model.sessionResource,
        title,
        lastMessageDate: model.lastMessageDate,
        timing: model.timing,
        isActive: true,
        stats: await awaitStatsForSession(model),
        lastResponseState: model.lastRequest?.response?.state ?? 0 /* ResponseModelState.Pending */,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFNlcnZpY2VJbXBsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2VJbXBsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsV0FBVyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbkYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHVCQUF1QixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDeEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzVGLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDM0UsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQUUscUJBQXFCLEVBQUUsZUFBZSxFQUFlLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDN0ksT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBb0MsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDL0gsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDaEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDdEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDL0UsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxtREFBbUQsQ0FBQztBQUNqSCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUMxRixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNqRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN6RixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNyRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUUzRCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDOUQsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQ2xELE9BQU8sRUFBRSxZQUFZLEVBQUUsY0FBYyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQ3hFLE9BQU8sRUFBa0csaUJBQWlCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNsSyxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM3RSxPQUFPLEVBQUUsU0FBUyxFQUFFLGdCQUFnQixFQUEwUCw2QkFBNkIsRUFBRSxvQkFBb0IsRUFBRSxZQUFZLEVBQW9DLE1BQU0sdUJBQXVCLENBQUM7QUFDamEsT0FBTyxFQUFFLGNBQWMsRUFBc0IsTUFBTSw0QkFBNEIsQ0FBQztBQUNoRixPQUFPLEVBQUUsZUFBZSxFQUFFLG9CQUFvQixFQUFFLDhCQUE4QixFQUFFLDJCQUEyQixFQUFFLG1CQUFtQixFQUFFLG9CQUFvQixFQUFFLGFBQWEsRUFBc0IsTUFBTSxxQ0FBcUMsQ0FBQztBQUN2TyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsc0JBQXNCLEVBQXlFLGlDQUFpQyxFQUF5SixpQ0FBaUMsRUFBeVAsTUFBTSxrQkFBa0IsQ0FBQztBQUNybEIsT0FBTyxFQUFFLG9CQUFvQixFQUFFLG9CQUFvQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDdkYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLG9CQUFvQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDdkYsT0FBTyxFQUFFLGdCQUFnQixFQUE2QixNQUFNLDhCQUE4QixDQUFDO0FBQzNGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxrQkFBa0IsRUFBRSxxQkFBcUIsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQzlILE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUNsRSxPQUFPLEVBQWlDLHNCQUFzQixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDN0YsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDbkYsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSwrQkFBK0IsRUFBRSw0Q0FBNEMsRUFBRSx5QkFBeUIsRUFBRSx1QkFBdUIsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzdNLE9BQU8sRUFBb0IsVUFBVSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDN0UsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUUzQyxNQUFNLGlCQUFpQixHQUFHLHNCQUFzQixDQUFDO0FBRWpELElBQU0sa0JBQWtCLEdBQXhCLE1BQU0sa0JBQWtCO0lBR3ZCLElBQUksY0FBYztRQUNqQixPQUFPLElBQUksQ0FBQyxlQUFlLENBQUM7SUFDN0IsQ0FBQztJQUdELFlBQ2lCLHVCQUFnRCxFQUN6RCxTQUE2QixFQUNwQix1QkFBa0QsRUFDM0QsV0FBZ0QsRUFDM0IsWUFBeUQ7UUFKckUsNEJBQXVCLEdBQXZCLHVCQUF1QixDQUF5QjtRQUN6RCxjQUFTLEdBQVQsU0FBUyxDQUFvQjtRQUNwQiw0QkFBdUIsR0FBdkIsdUJBQXVCLENBQTJCO1FBQzNELGdCQUFXLEdBQVgsV0FBVyxDQUFxQztRQUNWLGlCQUFZLEdBQVosWUFBWSxDQUE0QjtRQVpyRSxvQkFBZSxHQUFpQyxlQUFlLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBYTFGLENBQUM7SUFFTCxPQUFPO1FBQ04sSUFBSSxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDcEIsSUFBSSxDQUFDLFlBQVksQ0FBQyx5QkFBeUIsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDN0QsQ0FBQztRQUNELElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUN4QyxDQUFDO0lBRUQsTUFBTTtRQUNMLElBQUksSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ3BCLElBQUksQ0FBQyxZQUFZLENBQUMseUJBQXlCLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzdELENBQUM7UUFFRCxJQUFJLENBQUMsdUJBQXVCLENBQUMsTUFBTSxFQUFFLENBQUM7SUFDdkMsQ0FBQztJQUVELGlCQUFpQjtRQUNoQixJQUFJLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDM0MsQ0FBQztJQUVELG1CQUFtQjtRQUNsQixJQUFJLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDNUMsQ0FBQztDQUNELENBQUE7QUF0Q0ssa0JBQWtCO0lBYXJCLFdBQUEsMEJBQTBCLENBQUE7R0FidkIsa0JBQWtCLENBc0N2QjtBQUVNLElBQU0sV0FBVyxHQUFqQixNQUFNLFdBQVksU0FBUSxVQUFVO0lBUzFDLElBQVcsMEJBQTBCO1FBQ3BDLE9BQU8sSUFBSSxDQUFDLDJCQUEyQixDQUFDO0lBQ3pDLENBQUM7SUFLRCxJQUFXLGdCQUFnQixLQUFLLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7SUFtQjlFOztPQUVHO0lBQ0gsb0JBQW9CLENBQUMsT0FBZ0I7UUFDcEMsSUFBSSxDQUFDLGtCQUFrQixHQUFHLE9BQU8sQ0FBQztJQUNuQyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxxQkFBcUI7UUFDcEIsT0FBTyxJQUFJLENBQUMsY0FBYyxDQUFDLHFCQUFxQixFQUFFLENBQUM7SUFDcEQsQ0FBQztJQUVELElBQVksYUFBYTtRQUN4QixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsdUJBQXVCLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDOUQsT0FBTyxDQUFDLFNBQVMsQ0FBQyxhQUFhLElBQUksU0FBUyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFFRCxZQUNrQixjQUFnRCxFQUNwRCxVQUF3QyxFQUNsQyxnQkFBb0QsRUFDcEQsZ0JBQW9ELEVBQ2hELG9CQUE0RCxFQUN6RCx1QkFBa0UsRUFDbEUsdUJBQWtFLEVBQ3pFLGdCQUFvRCxFQUNoRCxvQkFBNEQsRUFDN0QsbUJBQTBELEVBQzFELGtCQUF5RCxFQUNsRSxVQUF3QyxFQUNwQyxjQUFnRCxFQUN4QyxzQkFBZ0UsRUFDakUscUJBQThELEVBQ25FLGdCQUFvRDtRQUV2RSxLQUFLLEVBQUUsQ0FBQztRQWpCMEIsbUJBQWMsR0FBZCxjQUFjLENBQWlCO1FBQ25DLGVBQVUsR0FBVixVQUFVLENBQWE7UUFDakIscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFtQjtRQUNuQyxxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQW1CO1FBQy9CLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFDeEMsNEJBQXVCLEdBQXZCLHVCQUF1QixDQUEwQjtRQUNqRCw0QkFBdUIsR0FBdkIsdUJBQXVCLENBQTBCO1FBQ3hELHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBbUI7UUFDL0IseUJBQW9CLEdBQXBCLG9CQUFvQixDQUF1QjtRQUM1Qyx3QkFBbUIsR0FBbkIsbUJBQW1CLENBQXNCO1FBQ3pDLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBc0I7UUFDakQsZUFBVSxHQUFWLFVBQVUsQ0FBYTtRQUNuQixtQkFBYyxHQUFkLGNBQWMsQ0FBaUI7UUFDdkIsMkJBQXNCLEdBQXRCLHNCQUFzQixDQUF5QjtRQUNoRCwwQkFBcUIsR0FBckIscUJBQXFCLENBQXdCO1FBQ2xELHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBbUI7UUFsRXZELHFCQUFnQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxxQkFBcUIsRUFBc0IsQ0FBQyxDQUFDO1FBQ25GLDRCQUF1QixHQUFHLElBQUksR0FBRyxFQUEyQyxDQUFDO1FBQ3RGLHVCQUFrQixHQUFHLElBQUksQ0FBQztRQU9qQix3QkFBbUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFnRixDQUFDLENBQUM7UUFDbkksdUJBQWtCLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQztRQUluRCw0QkFBdUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUF3QixDQUFDLENBQUM7UUFDL0UsMkJBQXNCLEdBQWdDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxLQUFLLENBQUM7UUFFeEYsd0NBQW1DLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBdUYsQ0FBQyxDQUFDO1FBQzFKLHVDQUFrQyxHQUFHLElBQUksQ0FBQyxtQ0FBbUMsQ0FBQyxLQUFLLENBQUM7UUFFbkYseUJBQW9CLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBMkQsQ0FBQyxDQUFDO1FBQy9HLHdCQUFtQixHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLENBQUM7UUFFckQsaUNBQTRCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLHFCQUFxQixFQUEyQixDQUFDLENBQUM7UUErQ3BILElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsY0FBYyxFQUFFO1lBQ3hGLFdBQVcsRUFBRSxDQUFDLEtBQXlCLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDO1lBQ3JFLGdCQUFnQixFQUFFLEtBQUssRUFBRSxLQUFnQixFQUFFLEVBQUU7Z0JBQzVDLE1BQU0sY0FBYyxHQUFHLG1CQUFtQixDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsQ0FBQztnQkFDdEYsSUFBSSxjQUFjLElBQUksSUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7b0JBQ3RELGtFQUFrRTtvQkFDbEUsSUFBSSxLQUFLLENBQUMsV0FBVyxFQUFFLENBQUMsTUFBTSxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQzt3QkFDNUQsTUFBTSxJQUFJLENBQUMsaUJBQWlCLENBQUMsYUFBYSxDQUFDLGNBQWMsQ0FBQyxDQUFDO29CQUM1RCxDQUFDO3lCQUFNLElBQUksSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7d0JBQ3BDLE1BQU0sSUFBSSxDQUFDLGlCQUFpQixDQUFDLGFBQWEsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7b0JBQ3JELENBQUM7Z0JBQ0YsQ0FBQztxQkFBTSxJQUFJLENBQUMsY0FBYyxJQUFJLEtBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7b0JBQzlELE1BQU0sSUFBSSxDQUFDLGlCQUFpQixDQUFDLHlCQUF5QixDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztnQkFDakUsQ0FBQztZQUNGLENBQUM7U0FDRCxDQUFDLENBQUMsQ0FBQztRQUNKLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUM1RCxjQUFjLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQ3RDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQ3hELElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxnQkFBZ0IsRUFBRSxDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUNsRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLHFCQUFxQixHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUM1RixJQUFJLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQztRQUNwRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsbUJBQW1CLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7UUFFckUsTUFBTSxlQUFlLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLHlCQUF5QixFQUFFLENBQUM7UUFDM0UsSUFBSSxlQUFlLEVBQUUsQ0FBQztZQUNyQixJQUFJLENBQUMsS0FBSyxDQUFDLGFBQWEsRUFBRSx1QkFBdUIsZUFBZSxFQUFFLENBQUMsQ0FBQztZQUNwRSxJQUFJLENBQUMsMkJBQTJCLEdBQUcsZUFBZSxDQUFDO1FBQ3BELENBQUM7UUFFRCxJQUFJLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztRQUUvQixJQUFJLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQyxlQUFlLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV2RSxJQUFJLENBQUMsVUFBVSxHQUFHLE9BQU8sQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVyRyxJQUFJLENBQUMsb0JBQW9CLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQzVDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNwRSxPQUFPLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBQzdFLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELElBQVcsZUFBZTtRQUN6QixPQUFPLENBQUMsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUN2RixDQUFDO0lBRUQsU0FBUyxDQUFDLFFBQTJCO1FBQ3BDLE9BQU8sSUFBSSxDQUFDLGdCQUFnQixDQUFDLDBCQUEwQixDQUFDLFFBQVEsQ0FBQyxLQUFLLFNBQVMsQ0FBQztJQUNqRixDQUFDO0lBRU8sV0FBVztRQUNsQixNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsbUNBQTBCLENBQUMsK0JBQXVCLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDM0ksSUFBSSxXQUFXLEVBQUUsQ0FBQztZQUNqQixNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUM3RCxNQUFNLFlBQVksR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsTUFBTSxDQUFDO1lBQzNELElBQUksWUFBWSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUN0QixJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxZQUFZLFlBQVkscUJBQXFCLENBQUMsQ0FBQztZQUN6RSxDQUFDO1lBRUQsT0FBTyxpQkFBaUIsQ0FBQztRQUMxQixDQUFDO1FBRUQsT0FBTztJQUNSLENBQUM7SUFFTyxTQUFTO1FBQ2hCLElBQUksQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztZQUM5QixPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sY0FBYyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQzthQUM3RCxNQUFNLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUV0RCxJQUFJLENBQUMsaUJBQWlCLENBQUMsYUFBYSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBRXJELE1BQU0saUJBQWlCLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDO2FBQ2hFLE1BQU0sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUMsbUJBQW1CLENBQUMsbUJBQW1CLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7UUFDdkYsSUFBSSxDQUFDLGlCQUFpQixDQUFDLHlCQUF5QixDQUFDLGlCQUFpQixDQUFDLENBQUM7SUFDckUsQ0FBQztJQUVEOztPQUVHO0lBQ0ssa0JBQWtCLENBQUMsT0FBa0I7UUFDNUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLG1CQUFtQixDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDO1lBQ3ZFLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUNELE9BQU8sT0FBTyxDQUFDLGVBQWUsS0FBSyxpQkFBaUIsQ0FBQyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDO0lBQ2xGLENBQUM7SUFFRCxnQkFBZ0IsQ0FBQyxNQUE0QjtRQUM1QyxJQUFJLENBQUMscUJBQXFCLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDcEQsSUFBSSxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUMxQyxJQUFJLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLDBCQUEwQixFQUFFLENBQUM7WUFDdkQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQzlELElBQUksS0FBSyxFQUFFLENBQUM7Z0JBQ1gsS0FBSyxDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUMxQyxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCw0QkFBNEIsQ0FBQyxTQUFpQixFQUFFLFNBQWlCLEVBQUUsT0FBeUM7UUFDM0csSUFBSSxDQUFDLG1DQUFtQyxDQUFDLElBQUksQ0FBQyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUNsRixDQUFDO0lBRUQsS0FBSyxDQUFDLG1CQUFtQixDQUFDLGVBQW9CLEVBQUUsS0FBYTtRQUM1RCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUN2RCxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQ1gsS0FBSyxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM3QixDQUFDO1FBRUQsdUNBQXVDO1FBQ3ZDLE1BQU0sY0FBYyxHQUFHLG1CQUFtQixDQUFDLG1CQUFtQixDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ2hGLElBQUksY0FBYyxFQUFFLENBQUM7WUFDcEIsTUFBTSxJQUFJLENBQUMsaUJBQWlCLENBQUMsZUFBZSxDQUFDLGNBQWMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNwRSwrQ0FBK0M7WUFDL0MsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ2xCLENBQUM7SUFDRixDQUFDO0lBRU8sS0FBSyxDQUFDLE1BQWMsRUFBRSxPQUFnQjtRQUM3QyxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ2IsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsZUFBZSxNQUFNLEtBQUssT0FBTyxFQUFFLENBQUMsQ0FBQztRQUM1RCxDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLGVBQWUsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUNoRCxDQUFDO0lBQ0YsQ0FBQztJQUVPLElBQUksQ0FBQyxNQUFjLEVBQUUsT0FBZ0I7UUFDNUMsSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUNiLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLGVBQWUsTUFBTSxLQUFLLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDM0QsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxlQUFlLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDL0MsQ0FBQztJQUNGLENBQUM7SUFFTyxLQUFLLENBQUMsTUFBYyxFQUFFLE9BQWU7UUFDNUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsZUFBZSxNQUFNLElBQUksT0FBTyxFQUFFLENBQUMsQ0FBQztJQUMzRCxDQUFDO0lBRU8sZ0JBQWdCLENBQUMsV0FBbUI7UUFDM0MsSUFBSSxDQUFDO1lBQ0osTUFBTSxlQUFlLEdBQThCLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyx5Q0FBeUM7WUFDN0gsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQztnQkFDckMsTUFBTSxJQUFJLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1lBQ25DLENBQUM7WUFFRCxNQUFNLFFBQVEsR0FBRyxlQUFlLENBQUMsTUFBTSxDQUF5QixDQUFDLEdBQUcsRUFBRSxPQUFPLEVBQUUsRUFBRTtnQkFDaEYsc0RBQXNEO2dCQUN0RCxLQUFLLE1BQU0sT0FBTyxJQUFJLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQztvQkFDeEMsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO3dCQUNyQyxPQUFPLENBQUMsUUFBUSxHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsUUFBUSxFQUFFLEVBQUU7NEJBQ3BELElBQUksT0FBTyxRQUFRLEtBQUssUUFBUSxFQUFFLENBQUM7Z0NBQ2xDLE9BQU8sSUFBSSxjQUFjLENBQUMsUUFBUSxDQUFDLENBQUM7NEJBQ3JDLENBQUM7NEJBQ0QsT0FBTyxRQUFRLENBQUM7d0JBQ2pCLENBQUMsQ0FBQyxDQUFDO29CQUNKLENBQUM7eUJBQU0sSUFBSSxPQUFPLE9BQU8sQ0FBQyxRQUFRLEtBQUssUUFBUSxFQUFFLENBQUM7d0JBQ2pELE9BQU8sQ0FBQyxRQUFRLEdBQUcsQ0FBQyxJQUFJLGNBQWMsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztvQkFDM0QsQ0FBQztnQkFDRixDQUFDO2dCQUVELEdBQUcsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsNkJBQTZCLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQ2hFLE9BQU8sR0FBRyxDQUFDO1lBQ1osQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ1AsT0FBTyxRQUFRLENBQUM7UUFDakIsQ0FBQztRQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDZCxJQUFJLENBQUMsS0FBSyxDQUFDLGtCQUFrQixFQUFFLDJCQUEyQixHQUFHLE1BQU0sV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLEdBQUcsV0FBVyxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUMzSSxPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUM7SUFDRixDQUFDO0lBRUQ7O09BRUc7SUFDSyxLQUFLLENBQUMsdUJBQXVCO1FBQ3BDLE1BQU0sR0FBRyxHQUFHLE1BQU0sSUFBSSxDQUFDLGlCQUFpQixDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ3BELE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUMsT0FBTyxFQUFDLEVBQUU7WUFDeEQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFDOUIsT0FBTztZQUNSLENBQUM7WUFFRCxJQUFJLGVBQW9CLENBQUM7WUFDekIsb0ZBQW9GO1lBQ3BGLElBQUksT0FBTyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDckMsSUFBSSxDQUFDO29CQUNKLGVBQWUsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQ3RELENBQUM7Z0JBQUMsTUFBTSxDQUFDO29CQUNSLE9BQU87Z0JBQ1IsQ0FBQztZQUNGLENBQUM7WUFDRCxlQUFlLEtBQUssbUJBQW1CLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUV0RSxNQUFNLFVBQVUsR0FBRyxNQUFNLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxlQUFlLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxFQUFFLGlCQUFpQixDQUFDLElBQUksRUFBRSxxQ0FBcUMsQ0FBQyxDQUFDO1lBQzNKLElBQUksVUFBVSxFQUFFLE1BQU0sQ0FBQyxjQUFjLEVBQUUsQ0FBQztnQkFDdkMsTUFBTSx5QkFBeUIsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxDQUFDO2dCQUNsRSw2RUFBNkU7Z0JBQzdFLFVBQVUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUN0QixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRDs7Ozs7O09BTUc7SUFDSCxLQUFLLENBQUMsc0JBQXNCO1FBQzNCLE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztRQUMxRCxNQUFNLG1CQUFtQixHQUFHLE1BQU0sSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUM7UUFFaEUsT0FBTyxDQUFDLEdBQUcsZ0JBQWdCLEVBQUUsR0FBRyxtQkFBbUIsQ0FBQyxDQUFDO0lBQ3RELENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxtQkFBbUI7UUFDeEIsT0FBTyxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDO2FBQy9ELE1BQU0sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsQ0FBQzthQUNsRCxHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDO0lBQy9CLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxzQkFBc0I7UUFDM0IsTUFBTSxLQUFLLEdBQUcsTUFBTSxJQUFJLENBQUMsaUJBQWlCLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDdEQsT0FBTyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQzthQUN6QixNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUM7YUFDbEMsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksS0FBSyxDQUFDLGVBQWUsS0FBSyxpQkFBaUIsQ0FBQyxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDO2FBQ2hLLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBZSxFQUFFO1lBQzNCLE1BQU0sZUFBZSxHQUFHLG1CQUFtQixDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDeEUsT0FBTyxDQUFDO2dCQUNQLEdBQUcsS0FBSztnQkFDUixlQUFlO2dCQUNmLFFBQVEsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUM7YUFDbEQsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsS0FBSyxDQUFDLHFCQUFxQixDQUFDLGVBQW9CO1FBQy9DLE1BQU0sS0FBSyxHQUFHLE1BQU0sSUFBSSxDQUFDLGlCQUFpQixDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ3RELE1BQU0sUUFBUSxHQUEwQyxLQUFLLENBQUMsZUFBZSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDMUYsSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUNkLE9BQU87Z0JBQ04sR0FBRyxRQUFRO2dCQUNYLGVBQWU7Z0JBQ2YsUUFBUSxFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQzthQUNsRCxDQUFDO1FBQ0gsQ0FBQztRQUVELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFTyxpQkFBaUIsQ0FBQyxLQUFnQjtRQUN6QyxPQUFPLENBQUMsS0FBSyxDQUFDLFVBQVUsSUFBSSxDQUFDLENBQUMsbUJBQW1CLENBQUMsbUJBQW1CLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxJQUFJLEtBQUssQ0FBQyxlQUFlLEtBQUssaUJBQWlCLENBQUMsSUFBSSxDQUFDO0lBQ2xKLENBQUM7SUFFRCxLQUFLLENBQUMsa0JBQWtCLENBQUMsZUFBb0I7UUFDNUMsTUFBTSxJQUFJLENBQUMsaUJBQWlCLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDO1FBQ25GLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxnQkFBZ0IsRUFBRSxDQUFDLGVBQWUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO0lBQzVGLENBQUM7SUFFRCxLQUFLLENBQUMsc0JBQXNCO1FBQzNCLE1BQU0sSUFBSSxDQUFDLGlCQUFpQixDQUFDLGdCQUFnQixFQUFFLENBQUM7SUFDakQsQ0FBQztJQUVELG9CQUFvQixDQUFDLFFBQTJCLEVBQUUsT0FBa0M7UUFDbkYsSUFBSSxDQUFDLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1FBQ25DLE1BQU0sZUFBZSxHQUFHLG1CQUFtQixDQUFDLFVBQVUsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZFLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQyxlQUFlLENBQUM7WUFDMUMsV0FBVyxFQUFFLFNBQVM7WUFDdEIsUUFBUTtZQUNSLGVBQWU7WUFDZixXQUFXLEVBQUUsT0FBTyxFQUFFLFdBQVcsSUFBSSxJQUFJO1lBQ3pDLDBCQUEwQixFQUFFLE9BQU8sRUFBRSwwQkFBMEI7U0FDL0QsRUFBRSxPQUFPLEVBQUUsVUFBVSxJQUFJLGtDQUFrQyxDQUFDLENBQUM7SUFDL0QsQ0FBQztJQUVPLGFBQWEsQ0FBQyxLQUF5QjtRQUM5QyxNQUFNLEVBQUUsV0FBVyxFQUFFLFFBQVEsRUFBRSxlQUFlLEVBQUUsV0FBVyxFQUFFLHNCQUFzQixFQUFFLDBCQUEwQixFQUFFLFVBQVUsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUN0SSxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLFNBQVMsRUFBRSxXQUFXLEVBQUUsRUFBRSxlQUFlLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxRQUFRLEVBQUUsZUFBZSxFQUFFLDBCQUEwQixFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUM7UUFDOUwsSUFBSSxRQUFRLEtBQUssaUJBQWlCLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDekMsS0FBSyxDQUFDLG1CQUFtQixDQUFDLElBQUksRUFBRSxzQkFBc0IsQ0FBQyxDQUFDO1FBQ3pELENBQUM7UUFFRCxJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDOUIsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRU8saUJBQWlCLENBQUMsS0FBZ0I7UUFDekMsSUFBSSxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsRUFBRSxzQkFBc0IsS0FBSyxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUM7UUFFL0UsZ0VBQWdFO1FBQ2hFLGlFQUFpRTtRQUNqRSxvREFBb0Q7UUFDcEQsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3ZGLENBQUM7SUFFRCxLQUFLLENBQUMsb0JBQW9CLENBQUMsUUFBMkI7UUFDckQsTUFBTSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsaUNBQWlDLEVBQUUsQ0FBQztRQUVoRSxNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQywwQkFBMEIsQ0FBQyxRQUFRLENBQUMsSUFBSSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsMEJBQTBCLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDaEssSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDdkIsTUFBTSxJQUFJLGdCQUFnQixDQUFDLDhCQUE4QixDQUFDLENBQUM7UUFDNUQsQ0FBQztRQUVELG1EQUFtRDtRQUNuRCxtREFBbUQ7UUFDbkQsb0RBQW9EO1FBQ3BELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUM5QixNQUFNLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxFQUFFO2dCQUN0RSxlQUFlLEVBQUUscUJBQXFCLGdCQUFnQixDQUFDLEVBQUUsRUFBRTtnQkFDM0QsV0FBVyxFQUFFLGdCQUFnQixDQUFDLFdBQVc7Z0JBQ3pDLE9BQU8sRUFBRSxLQUFLO2FBQ2QsQ0FBQyxDQUFDO1FBQ0osQ0FBQztRQUVELE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxFQUFFLEtBQUssZ0JBQWdCLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDaEgsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ25CLE1BQU0sSUFBSSxnQkFBZ0IsQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1FBQzNELENBQUM7SUFDRixDQUFDO0lBRUQsVUFBVSxDQUFDLGVBQW9CO1FBQzlCLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDakQsQ0FBQztJQUVELHNCQUFzQixDQUFDLGVBQW9CLEVBQUUsVUFBbUI7UUFDL0QsT0FBTyxJQUFJLENBQUMsY0FBYyxDQUFDLGVBQWUsQ0FBQyxlQUFlLEVBQUUsVUFBVSxJQUFJLG9DQUFvQyxDQUFDLENBQUM7SUFDakgsQ0FBQztJQUVELDhCQUE4QjtRQUM3QixPQUFPLElBQUksQ0FBQyxjQUFjLENBQUMseUJBQXlCLEVBQUUsQ0FBQztJQUN4RCxDQUFDO0lBRU8sS0FBSyxDQUFDLDRCQUE0QixDQUFDLGVBQW9CLEVBQUUsVUFBbUI7UUFDbkYsSUFBSSxDQUFDLEtBQUssQ0FBQyx5QkFBeUIsRUFBRSxHQUFHLGVBQWUsRUFBRSxDQUFDLENBQUM7UUFDNUQsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLHNCQUFzQixDQUFDLGVBQWUsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUM3RSxJQUFJLFdBQVcsRUFBRSxDQUFDO1lBQ2pCLE9BQU8sV0FBVyxDQUFDO1FBQ3BCLENBQUM7UUFFRCxJQUFJLFdBQXFELENBQUM7UUFDMUQsSUFBSSxPQUFPLENBQUMsSUFBSSxDQUFDLDBCQUEwQixFQUFFLGVBQWUsQ0FBQyxFQUFFLENBQUM7WUFDL0QsSUFBSSxDQUFDLDJCQUEyQixHQUFHLFNBQVMsQ0FBQztZQUM3QyxXQUFXLEdBQUcsTUFBTSxJQUFJLENBQUMsaUJBQWlCLENBQUMsc0JBQXNCLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDcEYsQ0FBQzthQUFNLENBQUM7WUFDUCxNQUFNLGNBQWMsR0FBRyxtQkFBbUIsQ0FBQyxtQkFBbUIsQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUNoRixJQUFJLGNBQWMsRUFBRSxDQUFDO2dCQUNwQixXQUFXLEdBQUcsTUFBTSxJQUFJLENBQUMsaUJBQWlCLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1lBQ3hFLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ2xCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLGVBQWUsQ0FBQztZQUN0RCxXQUFXLEVBQUUsV0FBVztZQUN4QixRQUFRLEVBQUUsV0FBVyxDQUFDLEtBQUssQ0FBQyxlQUFlLElBQUksaUJBQWlCLENBQUMsSUFBSTtZQUNyRSxlQUFlO1lBQ2YsV0FBVyxFQUFFLElBQUk7U0FDakIsRUFBRSxVQUFVLElBQUksMENBQTBDLENBQUMsQ0FBQztRQUU3RCxPQUFPLFVBQVUsQ0FBQztJQUNuQixDQUFDO0lBRUQscUZBQXFGO0lBQ3JGLDJGQUEyRjtJQUMzRixlQUFlLENBQUMsZUFBb0I7UUFDbkMsTUFBTSxTQUFTLEdBQUcsbUJBQW1CLENBQUMsbUJBQW1CLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDM0UsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2hCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxFQUFFLEtBQUs7WUFDckQsSUFBSSxDQUFDLGlCQUFpQixDQUFDLHlCQUF5QixDQUFDLGVBQWUsQ0FBQyxFQUFFLEtBQUssQ0FBQztJQUMzRSxDQUFDO0lBRUQsbUJBQW1CLENBQUMsSUFBaUQsRUFBRSxVQUFtQjtRQUN6RixNQUFNLFNBQVMsR0FBSSxJQUE4QixDQUFDLFNBQVMsSUFBSSxZQUFZLEVBQUUsQ0FBQztRQUM5RSxNQUFNLGVBQWUsR0FBRyxtQkFBbUIsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDbEUsT0FBTyxJQUFJLENBQUMsY0FBYyxDQUFDLGVBQWUsQ0FBQztZQUMxQyxXQUFXLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxJQUFJLHVCQUF1QixFQUFFLEVBQUU7WUFDdkUsUUFBUSxFQUFFLElBQUksQ0FBQyxlQUFlLElBQUksaUJBQWlCLENBQUMsSUFBSTtZQUN4RCxlQUFlO1lBQ2YsV0FBVyxFQUFFLElBQUk7U0FDakIsRUFBRSxVQUFVLElBQUksaUNBQWlDLENBQUMsQ0FBQztJQUNyRCxDQUFDO0lBRUQsS0FBSyxDQUFDLG9CQUFvQixDQUFDLGVBQW9CLEVBQUUsUUFBMkIsRUFBRSxLQUF3QixFQUFFLFVBQW1CO1FBQzFILElBQUksZUFBZSxDQUFDLE1BQU0sS0FBSyxPQUFPLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztZQUMvRCxPQUFPLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxlQUFlLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDdkUsQ0FBQzthQUFNLENBQUM7WUFDUCxPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxlQUFlLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxVQUFVLENBQUMsQ0FBQztRQUM3RSxDQUFDO0lBQ0YsQ0FBQztJQUVPLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxlQUFvQixFQUFFLFFBQTJCLEVBQUUsS0FBd0IsRUFBRSxVQUFtQjtRQUMvSCxpRUFBaUU7UUFDakUseUVBQXlFO1FBQ3pFLENBQUM7WUFDQSxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsc0JBQXNCLENBQUMsZUFBZSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1lBQzdFLElBQUksV0FBVyxFQUFFLENBQUM7Z0JBQ2pCLE9BQU8sV0FBVyxDQUFDO1lBQ3BCLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLGtCQUFrQixDQUFDLHFCQUFxQixDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQ2xGLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxNQUFNLGVBQWUsR0FBRyxNQUFNLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxzQkFBc0IsQ0FBQyxlQUFlLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFckcsb0RBQW9EO1FBQ3BELENBQUM7WUFDQSxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsc0JBQXNCLENBQUMsZUFBZSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1lBQzdFLElBQUksV0FBVyxFQUFFLENBQUM7Z0JBQ2pCLGVBQWUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDMUIsT0FBTyxXQUFXLENBQUM7WUFDcEIsQ0FBQztRQUNGLENBQUM7UUFDRCxNQUFNLGVBQWUsR0FBRyxrQkFBa0IsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUM1RCxNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLFNBQVMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLE9BQU8sQ0FBQztRQUNqSCxNQUFNLFFBQVEsR0FBRyxRQUFRLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLFNBQVMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLGdCQUFnQixFQUFFLEdBQUcsQ0FBQyxFQUFFLGdCQUFnQixFQUFFLEdBQUcsQ0FBQztRQUM5SSxNQUFNLHFCQUFxQixHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyx5QkFBeUIsQ0FBQyxlQUFlLENBQUMsRUFBRSxlQUFlLENBQUM7UUFDakgsSUFBSSxXQUFXLEdBQTZDLFNBQVMsQ0FBQztRQUN0RSxJQUFJLENBQUMsT0FBTyxJQUFJLFFBQVEsQ0FBQyxFQUFFLENBQUM7WUFDM0IsTUFBTSxJQUFJLEdBQTZDLFFBQVEsQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsWUFBWSxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLFlBQVksQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLFFBQVEsQ0FBQyxLQUFLLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDOUssTUFBTSxhQUFhLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsbUJBQW1CLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztZQUNwRyxNQUFNLGFBQWEsR0FBc0QsT0FBTyxJQUFJLGFBQWEsQ0FBQyxDQUFDLENBQUMsRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxhQUFhLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1lBQ2pLLGlHQUFpRztZQUNqRyxXQUFXLEdBQUc7Z0JBQ2IsVUFBVSxFQUFFLElBQUksdUJBQXVCLEVBQUU7Z0JBQ3pDLEtBQUssRUFBRTtvQkFDTixZQUFZLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRTtvQkFDeEIsZUFBZSxFQUFFLFNBQVM7b0JBQzFCLFdBQVcsRUFBRSxTQUFTO29CQUN0QixRQUFRLEVBQUUsRUFBRTtvQkFDWixpQkFBaUIsRUFBRSxFQUFFO29CQUNyQixTQUFTLEVBQUUsRUFBRTtvQkFDYixPQUFPLEVBQUUsQ0FBQztvQkFDVixlQUFlLEVBQUUsU0FBUztvQkFDMUIsVUFBVSxFQUFFO3dCQUNYLFdBQVcsRUFBRSxFQUFFO3dCQUNmLE9BQU8sRUFBRSxFQUFFO3dCQUNYLFNBQVMsRUFBRSxFQUFFO3dCQUNiLElBQUk7d0JBQ0osYUFBYSxFQUFFLGFBQWE7d0JBQzVCLFVBQVUsRUFBRSxFQUFFO3dCQUNkLGVBQWUsRUFBRSxxQkFBcUI7cUJBQ3RDO29CQUNELGVBQWUsRUFBRSxTQUFTO29CQUMxQixRQUFRLEVBQUUsU0FBUztpQkFDbkI7YUFDRCxDQUFDO1FBQ0gsQ0FBQztRQUVELDJDQUEyQztRQUMzQyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLGVBQWUsQ0FBQztZQUNwRCxXQUFXO1lBQ1gsUUFBUTtZQUNSLGVBQWUsRUFBRSxlQUFlO1lBQ2hDLFdBQVcsRUFBRSxLQUFLO1lBQ2xCLHNCQUFzQixFQUFFLGVBQWUsQ0FBQyxnQkFBZ0IsRUFBRSxjQUFjO1lBQ3hFLFVBQVUsRUFBRSxlQUFlLENBQUMsZ0JBQWdCLEVBQUUsVUFBVTtTQUN4RCxFQUFFLFVBQVUsSUFBSSwrQkFBK0IsQ0FBQyxDQUFDO1FBRWxELG1GQUFtRjtRQUNuRixJQUFJLHFCQUFxQixJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDM0MsUUFBUSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLEVBQUUsZUFBZSxFQUFFLHFCQUFxQixFQUFFLENBQUMsQ0FBQztRQUNqRixDQUFDO1FBRUQsSUFBSSxlQUFlLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDM0IsUUFBUSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3ZELENBQUM7UUFFRCxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDO1FBQzlCLE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDMUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUU7WUFDakQsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ3RCLGVBQWUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUMzQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxXQUF5QyxDQUFDO1FBQzlDLEtBQUssTUFBTSxPQUFPLElBQUksZUFBZSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQy9DLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDaEMsSUFBSSxXQUFXLEVBQUUsQ0FBQztvQkFDakIsV0FBVyxDQUFDLFFBQVEsRUFBRSxRQUFRLEVBQUUsQ0FBQztnQkFDbEMsQ0FBQztnQkFFRCxNQUFNLFdBQVcsR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDO2dCQUVuQyxNQUFNLGFBQWEsR0FBdUI7b0JBQ3pDLElBQUksRUFBRSxXQUFXO29CQUNqQixLQUFLLEVBQUUsQ0FBQyxJQUFJLG1CQUFtQixDQUM5QixJQUFJLFdBQVcsQ0FBQyxDQUFDLEVBQUUsV0FBVyxDQUFDLE1BQU0sQ0FBQyxFQUN0QyxFQUFFLGVBQWUsRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxhQUFhLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxXQUFXLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxFQUMzRixXQUFXLENBQ1gsQ0FBQztpQkFDRixDQUFDO2dCQUNGLE1BQU0sS0FBSyxHQUNWLE9BQU8sQ0FBQyxXQUFXO29CQUNsQixDQUFDLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUMsOENBQThDO29CQUNwRyxDQUFDLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsQ0FBQztnQkFDcEQsTUFBTSxRQUFRLEdBQUcsT0FBTyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQztvQkFDM0MsSUFBSSxFQUFFLFlBQVksQ0FBQyxLQUFLO29CQUN4QixTQUFTLEVBQUUsT0FBTyxDQUFDLGdCQUFnQixDQUFDLFNBQVMsSUFBSSxLQUFLO29CQUN0RCxnQkFBZ0IsRUFBRSxPQUFPLENBQUMsZ0JBQWdCO29CQUMxQyxNQUFNLEVBQUUsUUFBUTtvQkFDaEIsMEJBQTBCLEVBQUUsU0FBUztpQkFDTixDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7Z0JBQzdDLFdBQVcsR0FBRyxLQUFLLENBQUMsVUFBVSxDQUFDLGFBQWEsRUFDM0MsT0FBTyxDQUFDLFlBQVksSUFBSSxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUUsRUFDekMsQ0FBQyxFQUFFLFVBQVU7Z0JBQ2IsUUFBUSxFQUNSLEtBQUssRUFDTCxTQUFTLEVBQUUsZUFBZTtnQkFDMUIsU0FBUyxFQUFFLGVBQWU7Z0JBQzFCLFNBQVMsRUFBRSxlQUFlO2dCQUMxQixTQUFTLEVBQUUsY0FBYztnQkFDekIsS0FBSyxFQUFFLGtFQUFrRTtnQkFDekUsT0FBTyxDQUFDLE9BQU8sRUFDZixTQUFTLEVBQ1QsT0FBTyxDQUFDLEVBQUUsQ0FDVixDQUFDO1lBQ0gsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLFdBQVc7Z0JBQ1gsSUFBSSxXQUFXLEVBQUUsQ0FBQztvQkFDakIsS0FBSyxNQUFNLElBQUksSUFBSSxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUM7d0JBQ2xDLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLENBQUM7b0JBQ2pELENBQUM7Z0JBQ0YsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxlQUFlLENBQUMsYUFBYSxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUM7WUFDMUMsV0FBVyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsQ0FBQztRQUNuQyxDQUFDO1FBRUQsdUVBQXVFO1FBQ3ZFLHVFQUF1RTtRQUN2RSw2RUFBNkU7UUFDN0UsTUFBTSxvQkFBb0IsR0FBRyxlQUFlLENBQUMsV0FBVyxJQUFJLGVBQWUsQ0FBQywrQkFBK0IsQ0FBQztRQUM1RyxJQUFJLG9CQUFvQixFQUFFLENBQUM7WUFDMUIsSUFBSSxrQkFBa0IsR0FBRyxDQUFDLENBQUM7WUFFM0IsTUFBTSxvQkFBb0IsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO1lBQ3RFLE1BQU0sMEJBQTBCLEdBQUcsQ0FBQyxLQUF3QixFQUFFLEVBQUU7Z0JBQy9ELE9BQU8sS0FBSyxDQUFDLHVCQUF1QixDQUFDLEdBQUcsRUFBRTtvQkFDekMsZUFBZSxDQUFDLCtCQUErQixFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMseUJBQXlCLENBQUMsRUFBRTt3QkFDcEYsSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUM7NEJBQ2hDLGtDQUFrQzs0QkFDbEMsTUFBTSxzQkFBc0IsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGtCQUFrQixFQUFFLElBQUksdUJBQXVCLEVBQUUsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDOzRCQUM1SixJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxlQUFlLEVBQUUsc0JBQXNCLENBQUMsQ0FBQzs0QkFDekUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FBd0UsaUNBQWlDLEVBQUUsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsYUFBYSxFQUFFLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDLENBQUM7NEJBQ3RQLG9CQUFvQixDQUFDLEtBQUssR0FBRywwQkFBMEIsQ0FBQyxzQkFBc0IsQ0FBQyx1QkFBdUIsQ0FBQyxLQUFLLENBQUMsQ0FBQzt3QkFDL0csQ0FBQztvQkFDRixDQUFDLENBQUMsQ0FBQztnQkFDSixDQUFDLENBQUMsQ0FBQztZQUNKLENBQUMsQ0FBQztZQUVGLE1BQU0sMEJBQTBCLEdBQUcsR0FBRyxFQUFFO2dCQUN2QyxJQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQztvQkFDdkQsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLHVCQUF1QixFQUFFLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztvQkFDekksSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsZUFBZSxFQUFFLEdBQUcsQ0FBQyxDQUFDO29CQUN0RCxJQUFJLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUF3RSxpQ0FBaUMsRUFBRSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxhQUFhLEVBQUUsdUJBQXVCLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUMsQ0FBQztvQkFDdFAsb0JBQW9CLENBQUMsS0FBSyxHQUFHLDBCQUEwQixDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDNUYsQ0FBQztZQUNGLENBQUMsQ0FBQztZQUVGLElBQUksV0FBVyxFQUFFLENBQUM7Z0JBQ2pCLE1BQU0sMEJBQTBCLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLHVCQUF1QixFQUFFLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztnQkFDaEssSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsZUFBZSxFQUFFLDBCQUEwQixDQUFDLENBQUM7Z0JBQzdFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQXdFLGlDQUFpQyxFQUFFLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLGFBQWEsRUFBRSx1QkFBdUIsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN0UCxvQkFBb0IsQ0FBQyxLQUFLLEdBQUcsMEJBQTBCLENBQUMsMEJBQTBCLENBQUMsdUJBQXVCLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDbkgsQ0FBQztZQUVELG9FQUFvRTtZQUNwRSxJQUFJLGVBQWUsQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO2dCQUM3QyxXQUFXLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLEVBQUUsRUFBRTtvQkFDdEUsaUNBQWlDO29CQUNqQyxJQUFJLFdBQVcsRUFBRSxRQUFRLElBQUksQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxDQUFDO3dCQUMvRCxXQUFXLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDO29CQUNqQyxDQUFDO29CQUVELG9DQUFvQztvQkFDcEMsTUFBTSxXQUFXLEdBQUcsTUFBTSxDQUFDO29CQUMzQixNQUFNLGFBQWEsR0FBdUI7d0JBQ3pDLElBQUksRUFBRSxXQUFXO3dCQUNqQixLQUFLLEVBQUUsQ0FBQyxJQUFJLG1CQUFtQixDQUM5QixJQUFJLFdBQVcsQ0FBQyxDQUFDLEVBQUUsV0FBVyxDQUFDLE1BQU0sQ0FBQyxFQUN0QyxFQUFFLGVBQWUsRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxhQUFhLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxXQUFXLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxFQUMzRixXQUFXLENBQ1gsQ0FBQztxQkFDRixDQUFDO29CQUNGLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLENBQUM7b0JBQzlELFdBQVcsR0FBRyxLQUFLLENBQUMsVUFBVSxDQUFDLGFBQWEsRUFBRSxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO29CQUV0RiwyQ0FBMkM7b0JBQzNDLGtCQUFrQixHQUFHLENBQUMsQ0FBQztvQkFFdkIseUNBQXlDO29CQUN6QywwQkFBMEIsRUFBRSxDQUFDO2dCQUM5QixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztZQUVELHlFQUF5RTtZQUN6RSxXQUFXLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtnQkFDaEMsTUFBTSxhQUFhLEdBQUcsZUFBZSxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUN0RSxNQUFNLFVBQVUsR0FBRyxlQUFlLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUM7Z0JBRXhFLGtDQUFrQztnQkFDbEMsSUFBSSxXQUFXLElBQUksYUFBYSxDQUFDLE1BQU0sR0FBRyxrQkFBa0IsRUFBRSxDQUFDO29CQUM5RCxNQUFNLFdBQVcsR0FBRyxhQUFhLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLENBQUM7b0JBQzVELEtBQUssTUFBTSxRQUFRLElBQUksV0FBVyxFQUFFLENBQUM7d0JBQ3BDLEtBQUssRUFBRSxzQkFBc0IsQ0FBQyxXQUFXLEVBQUUsUUFBUSxDQUFDLENBQUM7b0JBQ3RELENBQUM7b0JBQ0Qsa0JBQWtCLEdBQUcsYUFBYSxDQUFDLE1BQU0sQ0FBQztnQkFDM0MsQ0FBQztnQkFFRCxvQkFBb0I7Z0JBQ3BCLElBQUksVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDO29CQUMvQixXQUFXLENBQUMsUUFBUSxFQUFFLFFBQVEsRUFBRSxDQUFDO29CQUNqQyxvQkFBb0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDOUIsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQXdFLGlDQUFpQyxFQUFFLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLGFBQWEsRUFBRSx1QkFBdUIsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ2hRLElBQUksV0FBVyxJQUFJLEtBQUssQ0FBQyxjQUFjLEVBQUUsQ0FBQztnQkFDekMsMEZBQTBGO2dCQUMxRixNQUFNLHlCQUF5QixDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQztnQkFDdEQsV0FBVyxDQUFDLFFBQVEsRUFBRSxRQUFRLEVBQUUsQ0FBQztZQUNsQyxDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sUUFBUSxDQUFDO0lBQ2pCLENBQUM7SUFFRCxLQUFLLENBQUMsYUFBYSxDQUFDLE9BQTBCLEVBQUUsT0FBaUM7UUFDaEYsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUN2RSxJQUFJLENBQUMsS0FBSyxJQUFJLEtBQUssS0FBSyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDekMsTUFBTSxJQUFJLEtBQUssQ0FBQyxvQkFBb0IsT0FBTyxDQUFDLE9BQU8sQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFDO1FBQ3hFLENBQUM7UUFFRCxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDdkUsSUFBSSxHQUFHLEVBQUUsQ0FBQztZQUNULElBQUksQ0FBQyxLQUFLLENBQUMsZUFBZSxFQUFFLFdBQVcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxlQUFlLCtDQUErQyxDQUFDLENBQUM7WUFDdkgsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ2QsQ0FBQztRQUVELE1BQU0sUUFBUSxHQUFHLE9BQU8sRUFBRSxRQUFRLElBQUksS0FBSyxDQUFDLGVBQWUsQ0FBQztRQUM1RCxNQUFNLE9BQU8sR0FBRyxPQUFPLEVBQUUsT0FBTyxJQUFJLENBQUMsQ0FBQztRQUN0QyxNQUFNLHNCQUFzQixHQUFHLENBQUMsT0FBTyxFQUFFLGtCQUFrQixDQUFDO1FBQzVELE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsUUFBUSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFFLENBQUM7UUFFL0YsS0FBSyxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsRUFBRSwwQ0FBa0MsQ0FBQztRQUVqRSxNQUFNLGFBQWEsR0FBNEI7WUFDOUMsR0FBRyxPQUFPO1lBQ1YsWUFBWSxFQUFFLE9BQU8sQ0FBQyxZQUFZO1lBQ2xDLGVBQWUsRUFBRSxPQUFPLENBQUMsZUFBZTtTQUN4QyxDQUFDO1FBQ0YsTUFBTSxJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxlQUFlLEVBQUUsT0FBTyxDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsWUFBWSxFQUFFLFFBQVEsRUFBRSxhQUFhLENBQUMsQ0FBQyx1QkFBdUIsQ0FBQztJQUM3SyxDQUFDO0lBRU8sbUJBQW1CLENBQUMsS0FBZ0IsRUFBRSxlQUFvQixFQUFFLE9BQWUsRUFBRSxPQUFnQztRQUNwSCxNQUFNLFFBQVEsR0FBRyxPQUFPLENBQUMsUUFBUSxJQUFJLEtBQUssQ0FBQyxlQUFlLENBQUM7UUFDM0QsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGVBQWUsRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3pGLE1BQU0sWUFBWSxHQUFHLElBQUksZ0JBQWdCLENBQUM7WUFDekMsT0FBTyxFQUFFLEtBQUs7WUFDZCxPQUFPLEVBQUUsYUFBYTtZQUN0QixZQUFZLEVBQUUsRUFBRSxTQUFTLEVBQUUsT0FBTyxDQUFDLGVBQWUsSUFBSSxFQUFFLEVBQUU7WUFDMUQsU0FBUyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUU7WUFDckIsUUFBUSxFQUFFLE9BQU8sQ0FBQyxRQUFRO1lBQzFCLFlBQVksRUFBRSxPQUFPLENBQUMsWUFBWTtZQUNsQyxlQUFlLEVBQUUsT0FBTyxDQUFDLGVBQWU7WUFDeEMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxtQkFBbUI7WUFDcEMsaUJBQWlCLEVBQUUsT0FBTyxDQUFDLGlCQUFpQixFQUFFLEdBQUcsRUFBRTtZQUNuRCxpQkFBaUIsRUFBRSxPQUFPLENBQUMsaUJBQWlCO1lBQzVDLG9CQUFvQixFQUFFLE9BQU8sQ0FBQyxvQkFBb0I7U0FDbEQsQ0FBQyxDQUFDO1FBRUgsTUFBTSxRQUFRLEdBQUcsSUFBSSxlQUFlLEVBQWtCLENBQUM7UUFDdkQsSUFBSSxDQUFDLHVCQUF1QixDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsRUFBRSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRTVELEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxZQUFZLEVBQUUsT0FBTyxDQUFDLEtBQUssOENBQStCLEVBQUUsRUFBRSxHQUFHLE9BQU8sRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUV0SCxJQUFJLE9BQU8sQ0FBQyxLQUFLLG1EQUFrQyxFQUFFLENBQUM7WUFDckQsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ3pDLENBQUM7UUFFRCxJQUFJLENBQUMsS0FBSyxDQUFDLGFBQWEsRUFBRSw4QkFBOEIsZUFBZSxFQUFFLENBQUMsQ0FBQztRQUMzRSxPQUFPLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDO0lBQ2pELENBQUM7SUFFRCxLQUFLLENBQUMsV0FBVyxDQUFDLGVBQW9CLEVBQUUsT0FBZSxFQUFFLE9BQWlDO1FBQ3pGLElBQUksQ0FBQyxLQUFLLENBQUMsYUFBYSxFQUFFLG9CQUFvQixlQUFlLENBQUMsUUFBUSxFQUFFLGNBQWMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLEdBQUcsT0FBTyxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUd4SixJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLFlBQVksSUFBSSxDQUFDLE9BQU8sRUFBRSxPQUFPLElBQUksQ0FBQyxPQUFPLEVBQUUsYUFBYSxFQUFFLENBQUM7WUFDL0YsSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLEVBQUUsd0JBQXdCLENBQUMsQ0FBQztZQUNwRCxPQUFPLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLENBQUM7UUFDdEQsQ0FBQztRQUVELElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ3JELElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNaLE1BQU0sSUFBSSxLQUFLLENBQUMsb0JBQW9CLGVBQWUsRUFBRSxDQUFDLENBQUM7UUFDeEQsQ0FBQztRQUVELElBQUksa0JBQW1DLENBQUM7UUFFeEMsK0NBQStDO1FBQy9DLEVBQUU7UUFDRiwwR0FBMEc7UUFDMUcsMktBQTJLO1FBQzNLLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxJQUFJLHFCQUFxQixDQUFDLGVBQWUsQ0FBQyxJQUFJLGtCQUFrQixDQUFDLGVBQWUsQ0FBQyxLQUFLLG9CQUFvQixFQUFFLENBQUM7WUFFbEksTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGVBQWUsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFFBQVEsSUFBSSxLQUFLLENBQUMsZUFBZSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQzNILE1BQU0sV0FBVyxHQUFHLGFBQWEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFvQyxFQUFFLENBQUMsQ0FBQyxZQUFZLDJCQUEyQixDQUFDLENBQUM7WUFDaEksTUFBTSxXQUFXLEdBQUcsYUFBYSxDQUFDLGFBQWEsQ0FBQyxDQUFDLE9BQU8sQ0FBQztZQUV6RCw2REFBNkQ7WUFDN0QsNERBQTREO1lBQzVELE1BQU0scUJBQXFCLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGlCQUFpQixDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBRXpGLE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLGtCQUFrQixDQUFDLHdCQUF3QixDQUFDLGtCQUFrQixDQUFDLGVBQWUsQ0FBQyxFQUFFLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLElBQUksRUFBRSxxQkFBcUIsRUFBRSxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2hOLElBQUksT0FBTyxFQUFFLENBQUM7Z0JBQ2IsS0FBSyxHQUFHLENBQUMsTUFBTSxJQUFJLENBQUMsaUJBQWlCLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsZUFBZSxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsTUFBK0IsQ0FBQztnQkFDekksSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUNaLE1BQU0sSUFBSSxLQUFLLENBQUMsd0NBQXdDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO2dCQUM3RSxDQUFDO2dCQUVELHNFQUFzRTtnQkFDdEUsSUFBSSxDQUFDLGtCQUFrQixDQUFDLDRCQUE0QixDQUFDLGVBQWUsRUFBRSxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBRXhGLHdFQUF3RTtnQkFDeEUsZ0RBQWdEO2dCQUNoRCxJQUFJLHFCQUFxQixFQUFFLENBQUM7b0JBQzNCLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsZUFBZSxFQUFFLHFCQUFxQixDQUFDLENBQUM7Z0JBQzVGLENBQUM7Z0JBRUQsZUFBZSxHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUM7Z0JBQ25DLGtCQUFrQixHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUM7WUFDdkMsQ0FBQztRQUNGLENBQUM7UUFFRCxNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7UUFFckUsSUFBSSxPQUFPLEVBQUUsS0FBSyxFQUFFLENBQUM7WUFDcEIsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEtBQUssRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ2xGLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ3pCLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUM5QyxDQUFDO1lBQ0QsT0FBTyxNQUFNLENBQUM7UUFDZixDQUFDO2FBQU0sSUFBSSxpQkFBaUIsRUFBRSxDQUFDO1lBQzlCLElBQUksQ0FBQyxLQUFLLENBQUMsYUFBYSxFQUFFLFdBQVcsZUFBZSxnQ0FBZ0MsQ0FBQyxDQUFDO1lBQ3RGLE9BQU8sRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLE1BQU0sRUFBRSw2QkFBNkIsRUFBRSxDQUFDO1FBQ3BFLENBQUM7UUFFRCxNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDckMsS0FBSyxJQUFJLENBQUMsR0FBRyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUNsRCxNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDNUIsSUFBSSxPQUFPLENBQUMscUJBQXFCLEVBQUUsQ0FBQztnQkFDbkMsSUFBSSxPQUFPLENBQUMscUJBQXFCLENBQUMsYUFBYSxFQUFFLENBQUM7b0JBQ2pELE9BQU8sQ0FBQyxRQUFRLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQztnQkFDdkMsQ0FBQztxQkFBTSxDQUFDO29CQUNQLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxlQUFlLEVBQUUsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN2RCxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFFRCxNQUFNLFFBQVEsR0FBRyxPQUFPLEVBQUUsUUFBUSxJQUFJLEtBQUssQ0FBQyxlQUFlLENBQUM7UUFDNUQsTUFBTSxPQUFPLEdBQUcsT0FBTyxFQUFFLE9BQU8sSUFBSSxDQUFDLENBQUM7UUFDdEMsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGVBQWUsQ0FBQyxRQUFRLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUUsQ0FBQztRQUUvRixNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsZUFBZSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDekYsTUFBTSxXQUFXLEdBQUcsT0FBTyxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUMvRyxNQUFNLEtBQUssR0FBRyxXQUFXLElBQUksYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQTZCLEVBQUUsQ0FBQyxDQUFDLFlBQVksb0JBQW9CLENBQUMsRUFBRSxLQUFLLElBQUksWUFBWSxDQUFDO1FBQ2xKLE1BQU0scUJBQXFCLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQXVDLEVBQUUsQ0FBQyxDQUFDLFlBQVksOEJBQThCLENBQUMsQ0FBQztRQUVoSixxR0FBcUc7UUFDckcsT0FBTztZQUNOLElBQUksRUFBRSxNQUFNO1lBQ1osa0JBQWtCO1lBQ2xCLElBQUksRUFBRTtnQkFDTCxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLEVBQUUsZUFBZSxFQUFFLGFBQWEsRUFBRSxPQUFPLEVBQUUsQ0FBQyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsV0FBVyxJQUFJLFlBQVksRUFBRSxRQUFRLEVBQUUsT0FBTyxDQUFDO2dCQUN2SixLQUFLO2dCQUNMLFlBQVksRUFBRSxxQkFBcUIsRUFBRSxPQUFPO2FBQzVDO1NBQ0QsQ0FBQztJQUNILENBQUM7SUFFTyxnQkFBZ0IsQ0FBQyxlQUFvQixFQUFFLE9BQWUsRUFBRSxRQUEyQixFQUFFLE9BQTRDO1FBQ3hJLElBQUksYUFBYSxHQUFHLE9BQU8sRUFBRSxhQUFhLENBQUM7UUFDM0MsSUFBSSxPQUFPLEVBQUUsT0FBTyxFQUFFLENBQUM7WUFDdEIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDOUQsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNaLE1BQU0sSUFBSSxLQUFLLENBQUMsa0JBQWtCLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBQ3RELENBQUM7WUFDRCxhQUFhLEdBQUcsRUFBRSxhQUFhLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDO1lBQ3ZFLE1BQU0sV0FBVyxHQUFHLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLElBQUksb0JBQW9CLEdBQUcsT0FBTyxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDbEcsT0FBTyxHQUFHLEdBQUcsZUFBZSxHQUFHLEtBQUssQ0FBQyxJQUFJLEdBQUcsV0FBVyxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQ3RFLENBQUM7YUFBTSxJQUFJLE9BQU8sRUFBRSxhQUFhLElBQUksQ0FBQyxhQUFhLEVBQUUsV0FBVyxFQUFFLENBQUM7WUFDbEUsNEdBQTRHO1lBQzVHLHFDQUFxQztZQUNyQyxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUMxRSxJQUFJLFdBQVcsRUFBRSxDQUFDO2dCQUNqQixhQUFhLEdBQUcsRUFBRSxHQUFHLGFBQWEsRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLENBQUM7WUFDaEUsQ0FBQztRQUNGLENBQUM7UUFFRCxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGlCQUFpQixDQUFDLENBQUMsZ0JBQWdCLENBQUMsZUFBZSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDdEosT0FBTyxhQUFhLENBQUM7SUFDdEIsQ0FBQztJQUVPLGlDQUFpQyxDQUFDLGVBQW9CO1FBQzdELElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLEVBQUUsTUFBTSxFQUFFLENBQUM7UUFDakUsTUFBTSxjQUFjLEdBQUcsSUFBSSx1QkFBdUIsRUFBRSxDQUFDO1FBQ3JELElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxHQUFHLENBQUMsZUFBZSxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBRXZFLE9BQU8sY0FBYyxDQUFDLEtBQUssQ0FBQztJQUM3QixDQUFDO0lBRU8saUJBQWlCLENBQUMsS0FBZ0IsRUFBRSxlQUFvQixFQUFFLGFBQWlDLEVBQUUsT0FBZSxFQUFFLHNCQUErQixFQUFFLFlBQTRCLEVBQUUsUUFBMkIsRUFBRSxPQUFpQztRQUNsUCxNQUFNLG9CQUFvQixHQUFHLElBQUksQ0FBQyxpQ0FBaUMsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNyRixJQUFJLE9BQXFDLENBQUM7UUFDMUMsTUFBTSxTQUFTLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQTZCLEVBQUUsQ0FBQyxDQUFDLFlBQVksb0JBQW9CLENBQUMsQ0FBQztRQUNoSCxNQUFNLHFCQUFxQixHQUFHLGFBQWEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUF1QyxFQUFFLENBQUMsQ0FBQyxZQUFZLDhCQUE4QixDQUFDLENBQUM7UUFDaEosTUFBTSxXQUFXLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQW9DLEVBQUUsQ0FBQyxDQUFDLFlBQVksMkJBQTJCLENBQUMsQ0FBQztRQUNoSSxNQUFNLFFBQVEsR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7UUFDMUMsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLG9CQUFvQixFQUFFO1lBQ3ZGLEtBQUssRUFBRSxTQUFTLEVBQUUsS0FBSyxJQUFJLFlBQVk7WUFDdkMscUJBQXFCO1lBQ3JCLFdBQVc7WUFDWCxlQUFlLEVBQUUsS0FBSyxDQUFDLGVBQWU7WUFDdEMsUUFBUSxFQUFFLEtBQUssQ0FBQyxlQUFlO1lBQy9CLE9BQU87WUFDUCxzQkFBc0I7U0FDdEIsQ0FBQyxDQUFDO1FBRUgsSUFBSSxXQUFXLEdBQUcsS0FBSyxDQUFDO1FBQ3hCLE1BQU0sV0FBVyxHQUFHLFdBQVcsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUM7UUFFNUQsTUFBTSxlQUFlLEdBQUcsSUFBSSxlQUFlLEVBQXNCLENBQUM7UUFDbEUsSUFBSSx1QkFBdUIsR0FBRyxLQUFLLENBQUM7UUFDcEMsU0FBUyx1QkFBdUI7WUFDL0IsSUFBSSxDQUFDLHVCQUF1QixJQUFJLE9BQU8sRUFBRSxRQUFRLEVBQUUsQ0FBQztnQkFDbkQsZUFBZSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQzNDLHVCQUF1QixHQUFHLElBQUksQ0FBQztZQUNoQyxDQUFDO1FBQ0YsQ0FBQztRQUVELE1BQU0sS0FBSyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDcEMsTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHVCQUF1QixFQUFFLENBQUMsQ0FBQztRQUN4RCxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDO1FBQzNCLE1BQU0sbUJBQW1CLEdBQUcsS0FBSyxJQUFJLEVBQUU7WUFDdEMsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLFFBQXlCLEVBQUUsRUFBRTtnQkFDdEQsSUFBSSxLQUFLLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztvQkFDbkMsT0FBTztnQkFDUixDQUFDO2dCQUVELElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztvQkFDbEIsUUFBUSxDQUFDLGVBQWUsRUFBRSxZQUFZLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQ3BELENBQUM7Z0JBQ0QsV0FBVyxHQUFHLElBQUksQ0FBQztnQkFFbkIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztvQkFDMUMsTUFBTSxNQUFNLEdBQUcsQ0FBQyxLQUFLLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO29CQUN6QyxNQUFNLFlBQVksR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBRWpDLElBQUksWUFBWSxDQUFDLElBQUksS0FBSyxpQkFBaUIsRUFBRSxDQUFDO3dCQUM3QyxJQUFJLENBQUMsS0FBSyxDQUFDLGFBQWEsRUFBRSwwQ0FBMEMsS0FBSyxDQUFDLGVBQWUsS0FBSyxZQUFZLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxNQUFNLFFBQVEsQ0FBQyxDQUFDO29CQUMxSSxDQUFDO3lCQUFNLENBQUM7d0JBQ1AsSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLEVBQUUsK0JBQStCLElBQUksQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUMxRixDQUFDO29CQUVELElBQUksT0FBTyxFQUFFLENBQUM7d0JBQ2IsS0FBSyxDQUFDLHNCQUFzQixDQUFDLE9BQU8sRUFBRSxZQUFZLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQztvQkFDOUQsQ0FBQztnQkFDRixDQUFDO2dCQUNELHVCQUF1QixFQUFFLENBQUM7WUFDM0IsQ0FBQyxDQUFDO1lBRUYsSUFBSSxhQUF5QyxDQUFDO1lBQzlDLElBQUksZUFBOEMsQ0FBQztZQUVuRCx5RUFBeUU7WUFDekUsQ0FBQztnQkFDQSxNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsUUFBUSxDQUFVLCtCQUErQixDQUFDLENBQUM7Z0JBQ3JHLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFFBQVEsQ0FBVSw0Q0FBNEMsQ0FBQyxDQUFDO2dCQUNySCxJQUFJLENBQUMsZUFBZSxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztvQkFDN0MsTUFBTSxxQkFBcUIsR0FBRyxxQkFBcUIsRUFBRSxPQUFPLENBQUMsSUFBSSxLQUFLLHlCQUF5QixDQUFDO29CQUNoRyxNQUFNLG9CQUFvQixHQUFHLE9BQU8sRUFBRSxlQUFlLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFO3dCQUMvRCxNQUFNLEdBQUcsR0FBRyx5QkFBeUIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQy9DLE9BQU8sR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sS0FBSyx3QkFBd0IsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUM7b0JBQ3ZHLENBQUMsQ0FBQyxDQUFDO29CQUNILElBQUkscUJBQXFCLElBQUksb0JBQW9CLEVBQUUsQ0FBQzt3QkFDbkQsT0FBTyxHQUFHLEtBQUssQ0FBQyxVQUFVLENBQUMsYUFBYSxFQUFFLEVBQUUsU0FBUyxFQUFFLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUM7d0JBQ3pGLHVCQUF1QixFQUFFLENBQUM7d0JBRTFCLE1BQU0sZUFBZSxHQUFhLEVBQUUsQ0FBQzt3QkFDckMsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDOzRCQUN0QixlQUFlLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRywrQkFBK0IsR0FBRyxHQUFHLENBQUMsQ0FBQzt3QkFDbkUsQ0FBQzt3QkFDRCxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQzs0QkFDekIsZUFBZSxDQUFDLElBQUksQ0FBQyxHQUFHLEdBQUcsNENBQTRDLEdBQUcsR0FBRyxDQUFDLENBQUM7d0JBQ2hGLENBQUM7d0JBRUQsTUFBTSxhQUFhLEdBQUcsQ0FBQyxlQUFlLElBQUksQ0FBQyxrQkFBa0I7NEJBQzVELENBQUMsQ0FBQywrQkFBK0I7NEJBQ2pDLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsTUFBTSxHQUFHLCtCQUErQixDQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUcsNENBQTRDLENBQUM7d0JBQ3ZILE1BQU0sV0FBVyxHQUFHLGtCQUFrQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQzt3QkFDdEUsS0FBSyxDQUFDLHNCQUFzQixDQUFDLE9BQU8sRUFBRTs0QkFDckMsSUFBSSxFQUFFLGlCQUFpQjs0QkFDdkIsT0FBTyxFQUFFLElBQUksY0FBYyxDQUFDLFFBQVEsQ0FDbkMsb0NBQW9DLEVBQ3BDLGlMQUFpTCxFQUNqTCx5QkFBeUIsRUFDekIsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFDMUIsV0FBVyxDQUNYLEVBQUUsRUFBRSxTQUFTLEVBQUUsRUFBRSxlQUFlLEVBQUUsQ0FBQywrQkFBK0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQzt5QkFDekUsQ0FBQyxDQUFDO3dCQUNILEtBQUssQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDO3dCQUMvQixPQUFPLENBQUMsUUFBUSxFQUFFLFFBQVEsRUFBRSxDQUFDO3dCQUM3QixPQUFPO29CQUNSLENBQUM7Z0JBQ0YsQ0FBQztZQUNGLENBQUM7WUFFRCxzQ0FBc0M7WUFDdEMsSUFBSSxjQUE0QyxDQUFDO1lBQ2pELElBQUksc0JBQXNCLEdBQUcsS0FBSyxDQUFDO1lBQ25DLElBQUksQ0FBQztnQkFDSixNQUFNLFNBQVMsR0FBRyxNQUFNLElBQUksQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUM1RCxJQUFJLFNBQVMsRUFBRSxDQUFDO29CQUNmLGNBQWMsR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDO29CQUNqQyxzQkFBc0IsR0FBRyxTQUFTLENBQUMsc0JBQXNCLENBQUM7Z0JBQzNELENBQUM7WUFDRixDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDaEIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsd0NBQXdDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDdkUsQ0FBQztZQUVELG9FQUFvRTtZQUNwRSxNQUFNLFNBQVMsR0FBRyxPQUFPLEVBQUUsUUFBUSxFQUFFLGdCQUFnQixFQUFFLElBQUksQ0FBQztZQUM1RCxJQUFJLFNBQVMsRUFBRSxDQUFDO2dCQUNmLElBQUksQ0FBQztvQkFDSixNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxjQUFjLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDO29CQUNoRSxNQUFNLFdBQVcsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxTQUFTLENBQUMsQ0FBQztvQkFDM0QsSUFBSSxXQUFXLEVBQUUsS0FBSyxFQUFFLENBQUM7d0JBQ3hCLGNBQWMsR0FBRyxVQUFVLENBQUMsY0FBYyxFQUFFLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDaEUsQ0FBQztnQkFDRixDQUFDO2dCQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7b0JBQ2hCLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLDhDQUE4QyxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUM3RSxDQUFDO1lBQ0YsQ0FBQztZQUVELE1BQU0sU0FBUyxHQUFHLElBQUksU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3ZDLEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLHVCQUF1QixDQUFDLEdBQUcsRUFBRTtnQkFDNUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLEVBQUUsdUJBQXVCLEtBQUssQ0FBQyxlQUFlLGdCQUFnQixDQUFDLENBQUM7Z0JBQ3hGLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztvQkFDZCxPQUFPO2dCQUNSLENBQUM7Z0JBRUQsZ0JBQWdCLENBQUMsUUFBUSxDQUFDO29CQUN6QixtQkFBbUIsRUFBRSxTQUFTO29CQUM5QixNQUFNLEVBQUUsV0FBVztvQkFDbkIsK0lBQStJO29CQUMvSSxTQUFTLEVBQUUsU0FBUyxDQUFDLE9BQU8sRUFBRTtvQkFDOUIsV0FBVztvQkFDWCxhQUFhO29CQUNiLE9BQU87aUJBQ1AsQ0FBQyxDQUFDO2dCQUVILEtBQUssQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDOUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUVKLElBQUksQ0FBQztnQkFDSixJQUFJLFNBQThDLENBQUM7Z0JBQ25ELElBQUksdUJBQXVCLEdBQXFELFNBQVMsQ0FBQztnQkFDMUYsSUFBSSxTQUFTLElBQUksQ0FBQyxZQUFZLElBQUksQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDO29CQUNqRCxNQUFNLHVCQUF1QixHQUFHLENBQUMsS0FBcUIsRUFBRSxPQUEyQixFQUFFLHNCQUFnQyxFQUFFLFdBQThCLEVBQUUscUJBQStCLEVBQXFCLEVBQUU7d0JBQzVNLE1BQU0sZ0JBQWdCLEdBQTZCLEVBQUUsU0FBUyxFQUFFLEVBQUUsRUFBRSxDQUFDO3dCQUNyRSxPQUFPLEdBQUcsV0FBVyxJQUFJLEtBQUssQ0FBQyxVQUFVLENBQUMsYUFBYSxFQUFFLGdCQUFnQixFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsR0FBRyxFQUFFLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxPQUFPLEVBQUUsb0JBQW9CLENBQUMsQ0FBQzt3QkFFalYsSUFBSSxZQUFzQyxDQUFDO3dCQUMzQyxJQUFJLE9BQWUsQ0FBQzt3QkFDcEIsSUFBSSxXQUFXLEVBQUUsQ0FBQzs0QkFDakIsWUFBWSxHQUFHLFdBQVcsQ0FBQyxZQUFZLENBQUM7NEJBQ3hDLE9BQU8sR0FBRyxhQUFhLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE9BQU8sQ0FBQzt3QkFDbEQsQ0FBQzs2QkFBTSxDQUFDOzRCQUNQLFlBQVksR0FBRyxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDOzRCQUMzRSxLQUFLLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxZQUFZLENBQUMsQ0FBQzs0QkFFM0Msa0VBQWtFOzRCQUNsRSxpRUFBaUU7NEJBQ2pFLElBQUksT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sRUFBRSxDQUFDO2dDQUN4QyxZQUFZLEdBQUcsRUFBRSxTQUFTLEVBQUUsQ0FBQyxHQUFHLFlBQVksQ0FBQyxTQUFTLEVBQUUsR0FBRyxPQUFPLENBQUMsaUJBQWlCLENBQUMsRUFBRSxDQUFDOzRCQUN6RixDQUFDOzRCQUVELE1BQU0sZ0JBQWdCLEdBQUcsYUFBYSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQzs0QkFDeEQsWUFBWSxHQUFHLFlBQVksQ0FBQyxZQUFZLEVBQUUsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxxQkFBcUI7NEJBQ3ZGLE9BQU8sR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUM7d0JBQ3BDLENBQUM7d0JBRUQsTUFBTSxZQUFZLEdBQXNCOzRCQUN2QyxlQUFlLEVBQUUsS0FBSyxDQUFDLGVBQWU7NEJBQ3RDLFNBQVMsRUFBRSxPQUFPLENBQUMsRUFBRTs0QkFDckIsT0FBTyxFQUFFLEtBQUssQ0FBQyxFQUFFOzRCQUNqQixPQUFPOzRCQUNQLE9BQU8sRUFBRSxPQUFPLEVBQUUsSUFBSTs0QkFDdEIsU0FBUyxFQUFFLFlBQVk7NEJBQ3ZCLHNCQUFzQjs0QkFDdEIscUJBQXFCOzRCQUNyQixPQUFPOzRCQUNQLFFBQVE7NEJBQ1IsWUFBWSxFQUFFLE9BQU8sQ0FBQyxZQUFZOzRCQUNsQyx3QkFBd0IsRUFBRSxPQUFPLEVBQUUsd0JBQXdCOzRCQUMzRCx3QkFBd0IsRUFBRSxPQUFPLEVBQUUsd0JBQXdCOzRCQUMzRCxtQkFBbUIsRUFBRSxPQUFPLEVBQUUsbUJBQW1COzRCQUNqRCxrQkFBa0IsRUFBRSxPQUFPLEVBQUUsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUzs0QkFDNUksaUJBQWlCLEVBQUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLEdBQUcsRUFBRTs0QkFDcEQsZ0JBQWdCLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxnQkFBZ0I7NEJBQ3JELGVBQWUsRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLGVBQWU7NEJBQ25ELGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxnQkFBZ0I7NEJBQzFDLEtBQUssRUFBRSxjQUFjOzRCQUNyQixlQUFlLEVBQUUsQ0FBQyxDQUFDLGNBQWMsSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDOzRCQUM5RixpQkFBaUIsRUFBRSxPQUFPLEVBQUUsaUJBQWlCO3lCQUM3QyxDQUFDO3dCQUVGLElBQUksY0FBYyxHQUFHLElBQUksQ0FBQzt3QkFFMUIsS0FBSyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUU7NEJBQzFCLE1BQU0sS0FBSyxHQUFHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7NEJBQ3ZELElBQUksY0FBYyxFQUFFLENBQUM7Z0NBQ3BCLGNBQWMsR0FBRyxLQUFLLENBQUM7Z0NBQ3ZCLE9BQU87NEJBQ1IsQ0FBQzs0QkFFRCxJQUFJLEtBQUssSUFBSSxPQUFPLEVBQUUsQ0FBQztnQ0FDdEIsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsRUFBRSxFQUFFLE9BQU8sQ0FBQyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0NBQ25FLGlEQUFpRDtnQ0FDakQsWUFBWSxDQUFDLGlCQUFpQixHQUFHLEtBQUssQ0FBQzs0QkFDeEMsQ0FBQzt3QkFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUVKLE9BQU8sWUFBWSxDQUFDO29CQUNyQixDQUFDLENBQUM7b0JBRUYsSUFDQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsUUFBUSxDQUFDLGdDQUFnQyxDQUFDLEtBQUssS0FBSzt3QkFDOUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLG9DQUFvQyxFQUFFO3dCQUM1RCxDQUFDLFNBQVM7d0JBQ1YsQ0FBQyxXQUFXO3dCQUNaLENBQUMscUJBQXFCO3dCQUN0QixzQkFBc0I7d0JBQ3RCLENBQUMsUUFBUSxLQUFLLGlCQUFpQixDQUFDLFlBQVksSUFBSSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLDJEQUErQixDQUFDO3dCQUNuSCxPQUFPLEVBQUUsUUFBUSxFQUFFLElBQUksS0FBSyxZQUFZLENBQUMsS0FBSzt3QkFDOUMsT0FBTyxFQUFFLFFBQVEsRUFBRSxJQUFJLEtBQUssWUFBWSxDQUFDLElBQUk7d0JBQzdDLENBQUMsT0FBTyxFQUFFLGFBQWEsRUFDdEIsQ0FBQzt3QkFDRixpSEFBaUg7d0JBQ2pILE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxDQUFDLDBCQUEwQixDQUFDLFFBQVEsRUFBRSxRQUFRLEVBQUUsWUFBWSxDQUFDLEVBQUUsQ0FBQyxDQUFDO3dCQUVqRyxxRkFBcUY7d0JBQ3JGLE1BQU0sZ0JBQWdCLEdBQUcsdUJBQXVCLENBQUMsWUFBWSxFQUFFLFNBQVMsRUFBRSxzQkFBc0IsRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7d0JBRXBILE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLGdCQUFnQixDQUFDLG9CQUFvQixDQUFDLGdCQUFnQixFQUFFLG1CQUFtQixFQUFFLEVBQUUsUUFBUSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7d0JBQzVILElBQUksTUFBTSxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsUUFBUSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7NEJBQzlGLGlGQUFpRjs0QkFDakYsT0FBTyxFQUFFLFFBQVEsRUFBRSxRQUFRLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7NEJBQzFELGFBQWEsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDOzRCQUM3QixlQUFlLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQzt3QkFDbEMsQ0FBQztvQkFDRixDQUFDO29CQUVELE1BQU0sS0FBSyxHQUFHLENBQUMsYUFBYSxJQUFJLFNBQVMsRUFBRSxLQUFLLElBQUksWUFBWSxDQUFFLENBQUM7b0JBQ25FLE1BQU0sT0FBTyxHQUFHLGVBQWUsSUFBSSxxQkFBcUIsRUFBRSxPQUFPLENBQUM7b0JBRWxFLE1BQU0sSUFBSSxDQUFDLGdCQUFnQixDQUFDLGVBQWUsQ0FBQyxxQkFBcUIsS0FBSyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7b0JBRTdFLHlEQUF5RDtvQkFDekQsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLDBCQUEwQixDQUFDLFFBQVEsRUFBRSxRQUFRLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUM5RSxNQUFNLFlBQVksR0FBRyx1QkFBdUIsQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE9BQU8sQ0FBQyxpRkFBaUYsRUFBRSxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUM7b0JBQ2pNLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQyxLQUFLLEVBQUUsWUFBWSxFQUFFLFlBQVksRUFBRSxLQUFLLENBQUMsQ0FBQztvQkFDaEYsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQztvQkFDbEUsSUFBSSxjQUFjLEVBQUUsQ0FBQzt3QkFDcEIsS0FBSyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUU7NEJBQzFCLE1BQU0sY0FBYyxHQUFHLGNBQWMsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDOzRCQUNsRSxJQUFJLE9BQU8sRUFBRSxDQUFDO2dDQUNiLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsRUFBRSxFQUFFLE9BQU8sQ0FBQyxFQUFFLEVBQUUsY0FBYyxDQUFDLENBQUM7NEJBQy9FLENBQUM7d0JBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDSixjQUFjLENBQUMsU0FBUyxLQUFLLFlBQVksQ0FBQyxTQUFTLENBQUM7d0JBQ3BELElBQUksY0FBYyxDQUFDLFNBQVMsRUFBRSxDQUFDOzRCQUM5QixJQUFJLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUF3RSxpQ0FBaUMsRUFBRSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxTQUFTLEVBQUUsY0FBYyxDQUFDLFNBQVMsRUFBRSxhQUFhLEVBQUUsdUJBQXVCLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQyxDQUFDO3dCQUN0UixDQUFDO29CQUNGLENBQUM7b0JBQ0QsdUJBQXVCLEVBQUUsQ0FBQztvQkFFMUIsK0VBQStFO29CQUMvRSw0RUFBNEU7b0JBQzVFLHFGQUFxRjtvQkFDckYsTUFBTSwrQkFBK0IsR0FBRyx1Q0FBdUMsQ0FBQztvQkFDaEYsSUFBSSxzQkFBc0IsSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDLCtCQUErQixpQ0FBeUIsRUFBRSxDQUFDO3dCQUN4SCxJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQywrQkFBK0IsRUFBRSxJQUFJLDZEQUE2QyxDQUFDO3dCQUM3RyxnQkFBZ0IsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLHFCQUFxQixFQUFFLENBQUMsQ0FBQyxDQUFDO29CQUNyRCxDQUFDO29CQUVELGlKQUFpSjtvQkFDakosSUFBSSxLQUFLLENBQUMsV0FBVyxFQUFFLENBQUM7d0JBQ3ZCLE1BQU0sZUFBZSxHQUFHLElBQUksc0JBQXNCLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQzt3QkFDckYsSUFBSSxDQUFDLGVBQWUsQ0FBQyxPQUFPLEVBQUUsQ0FBQzs0QkFDOUIsZ0JBQWdCLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDOzRCQUNwQyxNQUFNLGVBQWUsQ0FBQyxJQUFJLEVBQUUsQ0FBQzt3QkFDOUIsQ0FBQztvQkFDRixDQUFDO29CQUVELE1BQU0sV0FBVyxHQUFHLE1BQU0sSUFBSSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsRUFBRSxFQUFFLFlBQVksRUFBRSxnQkFBZ0IsRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7b0JBQ3RILFNBQVMsR0FBRyxXQUFXLENBQUM7b0JBQ3hCLHVCQUF1QixHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLEVBQUUsRUFBRSxZQUFZLEVBQUUsV0FBVyxFQUFFLE9BQU8sRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO2dCQUNsSSxDQUFDO3FCQUFNLElBQUksV0FBVyxJQUFJLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO29CQUNyRyxJQUFJLFdBQVcsQ0FBQyxZQUFZLENBQUMsTUFBTSxLQUFLLElBQUksRUFBRSxDQUFDO3dCQUM5QyxPQUFPLEdBQUcsS0FBSyxDQUFDLFVBQVUsQ0FBQyxhQUFhLEVBQUUsRUFBRSxTQUFTLEVBQUUsRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxRQUFRLENBQUMsQ0FBQzt3QkFDekYsdUJBQXVCLEVBQUUsQ0FBQztvQkFDM0IsQ0FBQztvQkFDRCw2QkFBNkI7b0JBQzdCLGlDQUFpQztvQkFDakMsTUFBTSxPQUFPLEdBQW1CLEVBQUUsQ0FBQztvQkFDbkMsS0FBSyxNQUFNLFlBQVksSUFBSSxLQUFLLENBQUMsV0FBVyxFQUFFLEVBQUUsQ0FBQzt3QkFDaEQsSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLEVBQUUsQ0FBQzs0QkFDNUIsU0FBUzt3QkFDVixDQUFDO3dCQUNELE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLDhCQUFzQixFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsWUFBWSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQzt3QkFDNUcsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksbUNBQTJCLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxZQUFZLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUNsSSxDQUFDO29CQUNELE1BQU0sT0FBTyxHQUFHLGFBQWEsQ0FBQyxJQUFJLENBQUM7b0JBQ25DLE1BQU0sYUFBYSxHQUFHLE1BQU0sSUFBSSxDQUFDLHVCQUF1QixDQUFDLGNBQWMsQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQUUsRUFBRSxJQUFJLFFBQVEsQ0FBZ0IsQ0FBQyxDQUFDLEVBQUU7d0JBQ3JOLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDdkIsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxLQUFLLENBQUMsZUFBZSxFQUFFLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQztvQkFDOUQsdUJBQXVCLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsUUFBUSxDQUFDLENBQUM7b0JBQ25FLFNBQVMsR0FBRyxFQUFFLENBQUM7Z0JBRWhCLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxNQUFNLElBQUksS0FBSyxDQUFDLHVCQUF1QixDQUFDLENBQUM7Z0JBQzFDLENBQUM7Z0JBRUQsSUFBSSxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7b0JBQ25ELE9BQU87Z0JBQ1IsQ0FBQztxQkFBTSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7b0JBQ3JCLDZEQUE2RDtvQkFDN0QsdUJBQXVCO29CQUN2QixvQkFBb0IsR0FBRyxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQztvQkFDdEQsT0FBTztnQkFDUixDQUFDO3FCQUFNLENBQUM7b0JBQ1AsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO3dCQUNoQixJQUFJLENBQUMsS0FBSyxDQUFDLGFBQWEsRUFBRSw2Q0FBNkMsS0FBSyxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUM7d0JBQ2hHLFNBQVMsR0FBRyxFQUFFLFlBQVksRUFBRSxFQUFFLE9BQU8sRUFBRSxRQUFRLENBQUMsZUFBZSxFQUFFLGlDQUFpQyxDQUFDLEVBQUUsRUFBRSxDQUFDO29CQUN6RyxDQUFDO29CQUVELE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxZQUFZLEVBQUUsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDO3dCQUN2RSxTQUFTLENBQUMsWUFBWSxJQUFJLFdBQVcsQ0FBQyxDQUFDLENBQUMsaUJBQWlCLENBQUMsQ0FBQzs0QkFDMUQsU0FBUyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUM7Z0NBQ2pDLFNBQVMsQ0FBQztvQkFFYixnQkFBZ0IsQ0FBQyxRQUFRLENBQUM7d0JBQ3pCLG1CQUFtQixFQUFFLFNBQVMsQ0FBQyxPQUFPLEVBQUUsYUFBYTt3QkFDckQsU0FBUyxFQUFFLFNBQVMsQ0FBQyxPQUFPLEVBQUUsWUFBWTt3QkFDMUMsTUFBTTt3QkFDTixXQUFXO3dCQUNYLGFBQWE7d0JBQ2IsT0FBTztxQkFDUCxDQUFDLENBQUM7b0JBRUgsS0FBSyxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsU0FBUyxDQUFDLENBQUM7b0JBQ3RDLHVCQUF1QixFQUFFLENBQUM7b0JBQzFCLElBQUksQ0FBQyxLQUFLLENBQUMsYUFBYSxFQUFFLDBDQUEwQyxLQUFLLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQztvQkFFN0YsSUFBSSxTQUFTLENBQUMsWUFBWSxFQUFFLGFBQWEsRUFBRSxDQUFDO3dCQUMzQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsd0JBQXdCLEVBQUUsQ0FBQztvQkFDeEQsQ0FBQztvQkFFRCxvQkFBb0IsR0FBRyxDQUFDLFNBQVMsQ0FBQyxZQUFZLElBQUksQ0FBQyxLQUFLLENBQUMsdUJBQXVCLENBQUM7b0JBQ2pGLE9BQU8sQ0FBQyxRQUFRLEVBQUUsUUFBUSxFQUFFLENBQUM7b0JBRTdCLElBQUksdUJBQXVCLEVBQUUsQ0FBQzt3QkFDN0IsdUJBQXVCLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFOzRCQUN4QyxLQUFLLENBQUMsWUFBWSxDQUFDLE9BQVEsRUFBRSxTQUFTLENBQUMsQ0FBQzs0QkFDeEMsTUFBTSxtQkFBbUIsR0FBRyxxQkFBcUIsQ0FBQyxDQUFDLENBQUMscUJBQXFCLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLFlBQVksQ0FBQyxPQUFPLENBQUM7NEJBQzNILElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUUsbUJBQW1CLEVBQUUsU0FBUyxFQUFFLE1BQU0sSUFBSSxDQUFDLENBQUMsQ0FBQzt3QkFDdkgsQ0FBQyxDQUFDLENBQUM7b0JBQ0osQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQztZQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7Z0JBQ2QsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsc0NBQXNDLGNBQWMsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN6RixJQUFJLE9BQU8sRUFBRSxDQUFDO29CQUNiLGdCQUFnQixDQUFDLFFBQVEsQ0FBQzt3QkFDekIsbUJBQW1CLEVBQUUsU0FBUzt3QkFDOUIsU0FBUyxFQUFFLFNBQVM7d0JBQ3BCLE1BQU0sRUFBRSxPQUFPO3dCQUNmLFdBQVc7d0JBQ1gsYUFBYTt3QkFDYixPQUFPO3FCQUNQLENBQUMsQ0FBQztvQkFDSCxNQUFNLFNBQVMsR0FBcUIsRUFBRSxZQUFZLEVBQUUsRUFBRSxPQUFPLEVBQUUsR0FBRyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7b0JBQy9FLEtBQUssQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLFNBQVMsQ0FBQyxDQUFDO29CQUN0Qyx1QkFBdUIsRUFBRSxDQUFDO29CQUMxQixPQUFPLENBQUMsUUFBUSxFQUFFLFFBQVEsRUFBRSxDQUFDO2dCQUM5QixDQUFDO1lBQ0YsQ0FBQztvQkFBUyxDQUFDO2dCQUNWLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNqQixDQUFDO1FBQ0YsQ0FBQyxDQUFDO1FBQ0YsSUFBSSxvQkFBb0IsR0FBRyxLQUFLLENBQUM7UUFDakMsTUFBTSxrQkFBa0IsR0FBRyxtQkFBbUIsRUFBRSxDQUFDO1FBQ2pELDZEQUE2RDtRQUM3RCxNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsa0JBQWtCLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxrQkFBa0IsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUN4SSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxlQUFlLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztRQUNyRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUF3RSxpQ0FBaUMsRUFBRSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLGFBQWEsRUFBRSxhQUFhLEVBQUUsdUJBQXVCLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNwUCxrQkFBa0IsQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFO1lBQy9CLFFBQVEsQ0FBQyxlQUFlLEVBQUUsWUFBWSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQ3hELGNBQWMsQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUNoQyxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxLQUFLLGtCQUFrQixFQUFFLENBQUM7Z0JBQzdFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLENBQUM7Z0JBQzlELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQXdFLGlDQUFpQyxFQUFFLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUscUJBQXFCLEVBQUUsU0FBUyxFQUFFLGtCQUFrQixDQUFDLFNBQVMsRUFBRSxhQUFhLEVBQUUsdUJBQXVCLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN6UyxDQUFDO1lBQ0QseURBQXlEO1lBQ3pELElBQUksb0JBQW9CLEVBQUUsQ0FBQztnQkFDMUIsSUFBSSxDQUFDLHlCQUF5QixDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3ZDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUNILElBQUksT0FBTyxFQUFFLG1CQUFtQixFQUFFLENBQUM7WUFDbEMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLHFCQUFxQixDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBQy9FLENBQUM7UUFDRCxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLEVBQUUsbUJBQW1CLEVBQUUsS0FBSyxDQUFDLGVBQWUsRUFBRSxPQUFPLEVBQUUsYUFBYSxFQUFFLENBQUMsQ0FBQztRQUN0RyxPQUFPO1lBQ04sc0JBQXNCLEVBQUUsZUFBZSxDQUFDLENBQUM7WUFDekMsdUJBQXVCLEVBQUUsa0JBQWtCO1NBQzNDLENBQUM7SUFDSCxDQUFDO0lBRUQsc0JBQXNCLENBQUMsZUFBb0I7UUFDMUMsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDdkQsSUFBSSxLQUFLLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUM7WUFDMUQsSUFBSSxDQUFDLHlCQUF5QixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3ZDLENBQUM7SUFDRixDQUFDO0lBRUQ7OztPQUdHO0lBQ0sscUJBQXFCLENBQUMsZUFBb0I7UUFDakQsT0FBTyxlQUFlLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUN6RCxDQUFDO0lBRUQ7Ozs7T0FJRztJQUNLLHlCQUF5QixDQUFDLEtBQWdCO1FBQ2pELCtEQUErRDtRQUMvRCxxRUFBcUU7UUFDckUsMEVBQTBFO1FBQzFFLElBQUksSUFBSSxDQUFDLHFCQUFxQixDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDO1lBQ3ZELE9BQU87UUFDUixDQUFDO1FBRUQsc0VBQXNFO1FBQ3RFLE1BQU0sZ0JBQWdCLEdBQUcsS0FBSyxDQUFDLDBCQUEwQixFQUFFLENBQUM7UUFFNUQsc0VBQXNFO1FBQ3RFLE1BQU0sVUFBVSxHQUFHLGdCQUFnQixDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFFN0YsTUFBTSxXQUFXLEdBQUcsZ0JBQWdCLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN0RyxJQUFJLFdBQVcsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDOUIsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMsS0FBSyxDQUFDLDJCQUEyQixFQUFFLGNBQWMsV0FBVyxDQUFDLE1BQU0sa0NBQWtDLEtBQUssQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFDO1FBRW5JLG1DQUFtQztRQUNuQyxNQUFNLFNBQVMsR0FBc0MsRUFBRSxDQUFDO1FBQ3hELEtBQUssTUFBTSxHQUFHLElBQUksV0FBVyxFQUFFLENBQUM7WUFDL0IsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ2xFLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNwRCxJQUFJLFFBQVEsRUFBRSxDQUFDO2dCQUNkLFNBQVMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDMUIsQ0FBQztRQUNGLENBQUM7UUFFRCw0RUFBNEU7UUFDNUUsTUFBTSxZQUFZLEdBQUcsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3BDLE1BQU0sV0FBVyxHQUE0QjtZQUM1QyxHQUFHLFlBQVksQ0FBQyxXQUFXO1lBQzNCLGVBQWUsRUFBRSxXQUFXLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO1NBQ3ZGLENBQUM7UUFFRixNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUMsUUFBUSxJQUFJLFdBQVcsQ0FBQyxZQUFZLEVBQUUsSUFBSSxJQUFJLEtBQUssQ0FBQyxlQUFlLENBQUM7UUFDakcsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGVBQWUsQ0FBQyxRQUFRLEVBQUUsV0FBVyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNqRyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDbkIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsMkJBQTJCLEVBQUUsaUNBQWlDLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDL0YsS0FBSyxNQUFNLFFBQVEsSUFBSSxTQUFTLEVBQUUsQ0FBQztnQkFDbEMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLDRCQUE0QixFQUFFLENBQUMsQ0FBQztZQUMvRSxDQUFDO1lBQ0QsT0FBTztRQUNSLENBQUM7UUFFRCxrRkFBa0Y7UUFDbEYsSUFBSSxhQUFpQyxDQUFDO1FBQ3RDLElBQUksQ0FBQztZQUNKLElBQUksV0FBVyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDNUIsTUFBTSxZQUFZLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDbkYsc0VBQXNFO2dCQUN0RSwyREFBMkQ7Z0JBQzNELGFBQWEsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLGVBQWUsRUFBRSxZQUFZLEVBQUUsUUFBUSxFQUFFO29CQUNwRixHQUFHLFdBQVc7b0JBQ2QsT0FBTyxFQUFFLFNBQVM7b0JBQ2xCLFlBQVksRUFBRSxTQUFTO2lCQUN2QixDQUFDLENBQUM7WUFDSixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsYUFBYSxHQUFHLFlBQVksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDO1lBQzlDLENBQUM7UUFDRixDQUFDO1FBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUNkLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLGtFQUFrRSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQy9GLE1BQU0sTUFBTSxHQUFHLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNuQyxLQUFLLE1BQU0sUUFBUSxJQUFJLFNBQVMsRUFBRSxDQUFDO2dCQUNsQyxRQUFRLENBQUMsUUFBUSxDQUFDLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO1lBQ2pELENBQUM7WUFDRCxPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sV0FBVyxHQUFHLFdBQVcsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDdEgsTUFBTSxLQUFLLEdBQUcsV0FBVyxJQUFJLGFBQWEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUE2QixFQUFFLENBQUMsQ0FBQyxZQUFZLG9CQUFvQixDQUFDLEVBQUUsS0FBSyxJQUFJLFlBQVksQ0FBQztRQUNsSixNQUFNLHFCQUFxQixHQUFHLGFBQWEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUF1QyxFQUFFLENBQUMsQ0FBQyxZQUFZLDhCQUE4QixDQUFDLENBQUM7UUFFaEosTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsZUFBZSxFQUFFLGFBQWEsRUFBRSxZQUFZLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsRUFBRSxXQUFXLElBQUksWUFBWSxFQUFFLFFBQVEsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUU3TSxNQUFNLE1BQU0sR0FBdUI7WUFDbEMsSUFBSSxFQUFFLE1BQU07WUFDWixJQUFJLEVBQUU7Z0JBQ0wsR0FBRyxhQUFhO2dCQUNoQixLQUFLO2dCQUNMLFlBQVksRUFBRSxxQkFBcUIsRUFBRSxPQUFPO2FBQzVDO1NBQ0QsQ0FBQztRQUNGLEtBQUssTUFBTSxRQUFRLElBQUksU0FBUyxFQUFFLENBQUM7WUFDbEMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUMzQixDQUFDO0lBQ0YsQ0FBQztJQUVPLGdDQUFnQyxDQUFDLEtBQWdCLEVBQUUsT0FBMEIsRUFBRSxZQUE0QixFQUFFLEtBQXdCO1FBQzVJLCtFQUErRTtRQUMvRSxrRkFBa0Y7UUFDbEYsSUFBSSxLQUFLLENBQUMsV0FBVyxFQUFFLENBQUMsTUFBTSxLQUFLLENBQUMsSUFBSSxLQUFLLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDM0QsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLGtCQUFrQixHQUE2QixDQUFDO2dCQUNyRCxPQUFPO2dCQUNQLFFBQVEsRUFBRSxFQUFFO2dCQUNaLE1BQU0sRUFBRSxFQUFFO2FBQ1YsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxRQUFRLEdBQUcsS0FBSyxJQUFJLEVBQUU7WUFDM0IsTUFBTSxLQUFLLEdBQUcsTUFBTSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FBQyxFQUFFLEVBQUUsa0JBQWtCLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDbkcsSUFBSSxLQUFLLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQ2pDLEtBQUssQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDN0IsQ0FBQztRQUNGLENBQUMsQ0FBQztRQUNGLEtBQUssUUFBUSxFQUFFLENBQUM7SUFDakIsQ0FBQztJQUVPLGNBQWMsQ0FBQyx3QkFBaUU7UUFDdkYsd0JBQXdCLEtBQUssRUFBRSxDQUFDO1FBRWhDLDREQUE0RDtRQUM1RCx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDdEMsb0RBQW9EO1lBQ3BELElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUMxQixPQUFPLENBQUMsQ0FBQyxDQUFDLG1EQUFtRDtZQUM5RCxDQUFDO1lBQ0QsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDZCxPQUFPLENBQUMsQ0FBQyxDQUFDLGlCQUFpQjtZQUM1QixDQUFDO1lBQ0QsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDZCxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsa0JBQWtCO1lBQzlCLENBQUM7WUFDRCxPQUFPLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO1FBQ3RDLENBQUMsQ0FBQyxDQUFDO1FBRUgsT0FBTyx3QkFBd0IsQ0FBQztJQUNqQyxDQUFDO0lBRU8sMEJBQTBCLENBQUMsUUFBNkIsRUFBRSxRQUEyQixFQUFFLFVBQWtCO1FBQ2hILE1BQU0sT0FBTyxHQUE2QixFQUFFLENBQUM7UUFDN0MsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUN6RCxLQUFLLE1BQU0sT0FBTyxJQUFJLFFBQVEsRUFBRSxDQUFDO1lBQ2hDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ3ZCLFNBQVM7WUFDVixDQUFDO1lBRUQsSUFBSSxVQUFVLEtBQUssT0FBTyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLFNBQVMsSUFBSSxDQUFDLEtBQUssRUFBRSw0QkFBNEIsRUFBRSxDQUFDO2dCQUM1RyxtRUFBbUU7Z0JBQ25FLGlIQUFpSDtnQkFDakgsU0FBUztZQUNWLENBQUM7WUFFRCw0Q0FBNEM7WUFDNUMsSUFBSSxRQUFRLEtBQUssaUJBQWlCLENBQUMsWUFBWSxFQUFFLENBQUM7Z0JBQ2pELFNBQVM7WUFDVixDQUFDO1lBRUQsTUFBTSxnQkFBZ0IsR0FBRyxhQUFhLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3hELE1BQU0sY0FBYyxHQUFzQjtnQkFDekMsZUFBZSxFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsZUFBZTtnQkFDaEQsU0FBUyxFQUFFLE9BQU8sQ0FBQyxFQUFFO2dCQUNyQixPQUFPLEVBQUUsT0FBTyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUU7Z0JBQ3pDLE9BQU8sRUFBRSxnQkFBZ0IsQ0FBQyxPQUFPO2dCQUNqQyxPQUFPLEVBQUUsT0FBTyxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsSUFBSTtnQkFDNUMsU0FBUyxFQUFFLFlBQVksQ0FBQyxPQUFPLENBQUMsWUFBWSxFQUFFLGdCQUFnQixDQUFDLElBQUksQ0FBQyxFQUFFLHFCQUFxQjtnQkFDM0YsUUFBUSxFQUFFLGlCQUFpQixDQUFDLElBQUk7Z0JBQ2hDLGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxnQkFBZ0I7Z0JBQzFDLGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxRQUFRLEVBQUUsZ0JBQWdCO2FBQ3BELENBQUM7WUFDRixPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxRQUFRLEVBQUUsb0JBQW9CLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxRQUFRLENBQUMsTUFBTSxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDbkosQ0FBQztRQUVELE9BQU8sT0FBTyxDQUFDO0lBQ2hCLENBQUM7SUFFRCxLQUFLLENBQUMsYUFBYSxDQUFDLGVBQW9CLEVBQUUsU0FBaUI7UUFDMUQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDdkQsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osTUFBTSxJQUFJLEtBQUssQ0FBQyxvQkFBb0IsZUFBZSxFQUFFLENBQUMsQ0FBQztRQUN4RCxDQUFDO1FBRUQsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNsRSxJQUFJLGNBQWMsRUFBRSxTQUFTLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDN0MsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ3hCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUN4RCxJQUFJLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUF3RSxpQ0FBaUMsRUFBRSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxTQUFTLEVBQUUsYUFBYSxFQUFFLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDclEsQ0FBQztRQUVELEtBQUssQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDaEMsQ0FBQztJQUVELEtBQUssQ0FBQyxZQUFZLENBQUMsZUFBb0IsRUFBRSxPQUEwQjtRQUNsRSxJQUFJLENBQUMsQ0FBQyxPQUFPLFlBQVksZ0JBQWdCLENBQUMsRUFBRSxDQUFDO1lBQzVDLE1BQU0sSUFBSSxTQUFTLENBQUMsa0RBQWtELENBQUMsQ0FBQztRQUN6RSxDQUFDO1FBQ0QsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDeEQsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2IsTUFBTSxJQUFJLEtBQUssQ0FBQyxvQkFBb0IsZUFBZSxFQUFFLENBQUMsQ0FBQztRQUN4RCxDQUFDO1FBRUQsTUFBTSxRQUFRLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQztRQUNqQyxNQUFNLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRTdCLElBQUksT0FBTyxDQUFDLFFBQVEsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDdEQsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDMUUsSUFBSSxHQUFHLEVBQUUsQ0FBQztnQkFDVCxHQUFHLENBQUMsU0FBUyxHQUFHLE9BQU8sQ0FBQyxFQUFFLENBQUM7Z0JBQzNCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRSxHQUFHLENBQUMsQ0FBQztnQkFDdkQsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FBd0UsaUNBQWlDLEVBQUUsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxjQUFjLEVBQUUsU0FBUyxFQUFFLE9BQU8sQ0FBQyxFQUFFLEVBQUUsYUFBYSxFQUFFLHVCQUF1QixDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ2xSLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQXdFLGlDQUFpQyxFQUFFLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsY0FBYyxFQUFFLFNBQVMsRUFBRSxPQUFPLENBQUMsRUFBRSxFQUFFLGFBQWEsRUFBRSx1QkFBdUIsQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQzlRLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxlQUFvQixFQUFFLE9BQW9DLEVBQUUsWUFBa0QsRUFBRSxPQUEyQixFQUFFLFFBQStCO1FBQ3BNLElBQUksQ0FBQyxLQUFLLENBQUMsb0JBQW9CLEVBQUUsWUFBWSxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBRXhELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ3ZELElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNaLE1BQU0sSUFBSSxLQUFLLENBQUMsb0JBQW9CLGVBQWUsRUFBRSxDQUFDLENBQUM7UUFDeEQsQ0FBQztRQUVELE1BQU0sYUFBYSxHQUFHLE9BQU8sT0FBTyxLQUFLLFFBQVEsQ0FBQyxDQUFDO1lBQ2xELElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxlQUFlLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUN4RyxPQUFPLENBQUM7UUFDVCxNQUFNLE9BQU8sR0FBRyxLQUFLLENBQUMsVUFBVSxDQUFDLGFBQWEsRUFBRSxZQUFZLElBQUksRUFBRSxTQUFTLEVBQUUsRUFBRSxFQUFFLEVBQUUsT0FBTyxJQUFJLENBQUMsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN6SyxJQUFJLE9BQU8sUUFBUSxDQUFDLE9BQU8sS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUMxQyx5QkFBeUI7WUFDekIsS0FBSyxDQUFDLHNCQUFzQixDQUFDLE9BQU8sRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLGNBQWMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsSUFBSSxFQUFFLGlCQUFpQixFQUFFLENBQUMsQ0FBQztRQUNuSCxDQUFDO2FBQU0sQ0FBQztZQUNQLEtBQUssTUFBTSxJQUFJLElBQUksUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNyQyxLQUFLLENBQUMsc0JBQXNCLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztZQUNuRCxDQUFDO1FBQ0YsQ0FBQztRQUNELEtBQUssQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLFFBQVEsQ0FBQyxNQUFNLElBQUksRUFBRSxDQUFDLENBQUM7UUFDbEQsSUFBSSxRQUFRLENBQUMsU0FBUyxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ3RDLEtBQUssQ0FBQyxZQUFZLENBQUMsT0FBTyxFQUFFLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNqRCxDQUFDO1FBQ0QsT0FBTyxDQUFDLFFBQVEsRUFBRSxRQUFRLEVBQUUsQ0FBQztJQUM5QixDQUFDO0lBRUQsS0FBSyxDQUFDLDhCQUE4QixDQUFDLGVBQW9CLEVBQUUsTUFBZTtRQUN6RSxJQUFJLENBQUMsS0FBSyxDQUFDLGdDQUFnQyxFQUFFLFlBQVksZUFBZSxFQUFFLENBQUMsQ0FBQztRQUM1RSxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ2xFLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUNyQixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUN2RCxNQUFNLGlCQUFpQixHQUFHLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUN6RCxNQUFNLG9CQUFvQixHQUFHLEtBQUssRUFBRSxrQkFBa0IsRUFBRSxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUM7WUFDckUsTUFBTSxXQUFXLEdBQUcsS0FBSyxFQUFFLFdBQVcsQ0FBQztZQUN2QyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUF3RSxpQ0FBaUMsRUFBRTtnQkFDMUksTUFBTSxFQUFFLE1BQU0sSUFBSSxhQUFhO2dCQUMvQixNQUFNLEVBQUUsa0JBQWtCO2dCQUMxQixpQkFBaUIsRUFBRSxpQkFBaUIsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsT0FBTztnQkFDckcsZUFBZSxFQUFFLG9CQUFvQjtnQkFDckMsYUFBYSxFQUFFLGVBQWUsQ0FBQyxNQUFNO2dCQUNyQyxhQUFhLEVBQUUsV0FBVyxFQUFFLEVBQUU7Z0JBQzlCLGFBQWEsRUFBRSx1QkFBdUIsQ0FBQyxlQUFlLENBQUM7YUFDdkQsQ0FBQyxDQUFDO1lBQ0gsSUFBSSxDQUFDLElBQUksQ0FBQyxnQ0FBZ0MsRUFBRSw0Q0FBNEMsZUFBZSx1QkFBdUIsaUJBQWlCLElBQUksU0FBUyxxQkFBcUIsb0JBQW9CLEVBQUUsQ0FBQyxDQUFDO1lBQ3pNLE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSx1QkFBdUIsR0FBRyxjQUFjLENBQUMsdUJBQXVCLENBQUM7UUFDdkUsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ3hCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUN4RCxJQUFJLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUF3RSxpQ0FBaUMsRUFBRSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLE1BQU0sSUFBSSxlQUFlLEVBQUUsU0FBUyxFQUFFLGNBQWMsQ0FBQyxTQUFTLEVBQUUsYUFBYSxFQUFFLHVCQUF1QixDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUVsUyxJQUFJLHVCQUF1QixFQUFFLENBQUM7WUFDN0IsTUFBTSxXQUFXLENBQUMsdUJBQXVCLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDbEQsQ0FBQztJQUNGLENBQUM7SUFFRCxpQkFBaUIsQ0FBQyxlQUFvQjtRQUNyQyxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ2xFLElBQUksY0FBYyxFQUFFLENBQUM7WUFDcEIsY0FBYyxDQUFDLGlCQUFpQixFQUFFLENBQUM7UUFDcEMsQ0FBQztJQUNGLENBQUM7SUFFRCxlQUFlLENBQUMsZ0JBQXFCLEVBQUUsY0FBbUI7UUFDekQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUN4RCxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDWixPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sZUFBZSxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO1FBRXhELElBQUksZUFBZSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUNsQyxPQUFPO1FBQ1IsQ0FBQztRQUVELGtFQUFrRTtRQUNsRSxLQUFLLE1BQU0sT0FBTyxJQUFJLGVBQWUsRUFBRSxDQUFDO1lBQ3ZDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxnQkFBZ0IsRUFBRSxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2pFLENBQUM7UUFFRCxvQ0FBb0M7UUFDcEMsS0FBSyxNQUFNLE9BQU8sSUFBSSxlQUFlLEVBQUUsQ0FBQztZQUN2QyxLQUFLLElBQUksQ0FBQyxXQUFXLENBQUMsY0FBYyxFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRTtnQkFDbkUsR0FBRyxPQUFPLENBQUMsV0FBVztnQkFDdEIsS0FBSyxFQUFFLE9BQU8sQ0FBQyxJQUFJO2FBQ25CLENBQUMsQ0FBQztRQUNKLENBQUM7SUFDRixDQUFDO0lBRUQsb0JBQW9CLENBQUMsZUFBb0IsRUFBRSxTQUFpQjtRQUMzRCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQTBCLENBQUM7UUFDaEYsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUNYLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUV0Qyw2RkFBNkY7WUFDN0YsTUFBTSxtQkFBbUIsR0FBRyxLQUFLLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxtREFBa0MsQ0FBQyxDQUFDO1lBQzNHLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO2dCQUMxQixNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxDQUFDO2dCQUNsRSxjQUFjLEVBQUUsbUJBQW1CLEVBQUUsQ0FBQztZQUN2QyxDQUFDO1FBQ0YsQ0FBQztRQUVELHNEQUFzRDtRQUN0RCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsdUJBQXVCLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzdELElBQUksUUFBUSxFQUFFLENBQUM7WUFDZCxRQUFRLENBQUMsUUFBUSxDQUFDLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsZ0NBQWdDLEVBQUUsQ0FBQyxDQUFDO1lBQ2xGLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDaEQsQ0FBQztJQUNGLENBQUM7SUFFRCxrQkFBa0IsQ0FBQyxlQUFvQixFQUFFLFFBQXNFO1FBQzlHLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBMEIsQ0FBQztRQUNoRixJQUFJLEtBQUssRUFBRSxDQUFDO1lBQ1gsS0FBSyxDQUFDLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3BDLENBQUM7SUFDRixDQUFDO0lBRU0sV0FBVztRQUNqQixPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUM3QyxDQUFDO0lBRUQsS0FBSyxDQUFDLG1CQUFtQixDQUFDLDBCQUErQixFQUFFLFdBQWdCO1FBQzFFLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxjQUFjLENBQUMsMEJBQTBCLENBQUMsRUFBRSxDQUFDO1lBQ3JFLE1BQU0sSUFBSSxLQUFLLENBQUMsMkRBQTJELDBCQUEwQixFQUFFLENBQUMsQ0FBQztRQUMxRyxDQUFDO1FBRUQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsMEJBQTBCLENBQTBCLENBQUM7UUFDM0YsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osTUFBTSxJQUFJLEtBQUssQ0FBQyxnREFBZ0QsMEJBQTBCLEVBQUUsQ0FBQyxDQUFDO1FBQy9GLENBQUM7UUFFRCxJQUFJLEtBQUssQ0FBQyxlQUFlLEtBQUssaUJBQWlCLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDdEQsTUFBTSxJQUFJLEtBQUssQ0FBQyxxRUFBcUUsMEJBQTBCLGlCQUFpQixLQUFLLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQztRQUMxSixDQUFDO1FBRUQsTUFBTSxJQUFJLENBQUMsaUJBQWlCLENBQUMsb0JBQW9CLENBQUM7WUFDakQsZUFBZSxFQUFFLEtBQUssQ0FBQyxlQUFlO1lBQ3RDLHVCQUF1QixFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUU7WUFDbkMsV0FBVyxFQUFFLFdBQVc7U0FDeEIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNWLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyx5QkFBeUIsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUNoRSxJQUFJLENBQUMsS0FBSyxDQUFDLHFCQUFxQixFQUFFLHVCQUF1QixLQUFLLENBQUMsZUFBZSxpQkFBaUIsV0FBVyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUMxSCxDQUFDO0lBRUQsb0JBQW9CO1FBQ25CLE9BQU8sSUFBSSxDQUFDLGlCQUFpQixDQUFDLG9CQUFvQixFQUFFLENBQUM7SUFDdEQsQ0FBQztJQUVELFlBQVk7UUFDWCxJQUFJLENBQUMsaUJBQWlCLENBQUMsUUFBUSxFQUFFLENBQUM7SUFDbkMsQ0FBQztJQUVELGVBQWUsQ0FBQyxlQUFvQixFQUFFLEtBQWE7UUFDbEQsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLEVBQUUsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ2pFLENBQUM7SUFFRCxjQUFjLENBQUMsT0FBMEIsRUFBRSxRQUF1QjtRQUNqRSxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ3ZFLElBQUksQ0FBQyxDQUFDLE9BQU8sWUFBWSxnQkFBZ0IsQ0FBQyxFQUFFLENBQUM7WUFDNUMsTUFBTSxJQUFJLGtCQUFrQixDQUFDLCtEQUErRCxDQUFDLENBQUM7UUFDL0YsQ0FBQztRQUVELEtBQUssRUFBRSxzQkFBc0IsQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDbEQsQ0FBQztJQUVPLGdCQUFnQixDQUFDLGVBQW9CO1FBQzVDLE1BQU0sY0FBYyxHQUFHLG1CQUFtQixDQUFDLG1CQUFtQixDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ2hGLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUNyQixNQUFNLElBQUksS0FBSyxDQUFDLHdDQUF3QyxlQUFlLEVBQUUsQ0FBQyxDQUFDO1FBQzVFLENBQUM7UUFDRCxPQUFPLGNBQWMsQ0FBQztJQUN2QixDQUFDO0NBQ0QsQ0FBQTtBQTVyRFksV0FBVztJQXVEckIsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLFdBQVcsQ0FBQTtJQUNYLFdBQUEsaUJBQWlCLENBQUE7SUFDakIsV0FBQSxpQkFBaUIsQ0FBQTtJQUNqQixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsd0JBQXdCLENBQUE7SUFDeEIsV0FBQSx3QkFBd0IsQ0FBQTtJQUN4QixXQUFBLGlCQUFpQixDQUFBO0lBQ2pCLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxvQkFBb0IsQ0FBQTtJQUNwQixZQUFBLG9CQUFvQixDQUFBO0lBQ3BCLFlBQUEsV0FBVyxDQUFBO0lBQ1gsWUFBQSxlQUFlLENBQUE7SUFDZixZQUFBLHVCQUF1QixDQUFBO0lBQ3ZCLFlBQUEsc0JBQXNCLENBQUE7SUFDdEIsWUFBQSxpQkFBaUIsQ0FBQTtHQXRFUCxXQUFXLENBNHJEdkI7O0FBRUQsTUFBTSxDQUFDLEtBQUssVUFBVSxxQkFBcUIsQ0FBQyxLQUFpQjtJQUM1RCxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxJQUFJLFFBQVEsQ0FBQyxTQUFTLEVBQUUsVUFBVSxDQUFDLENBQUM7SUFDN0QsT0FBTztRQUNOLGVBQWUsRUFBRSxLQUFLLENBQUMsZUFBZTtRQUN0QyxLQUFLO1FBQ0wsZUFBZSxFQUFFLEtBQUssQ0FBQyxlQUFlO1FBQ3RDLE1BQU0sRUFBRSxLQUFLLENBQUMsTUFBTTtRQUNwQixRQUFRLEVBQUUsSUFBSTtRQUNkLEtBQUssRUFBRSxNQUFNLG9CQUFvQixDQUFDLEtBQUssQ0FBQztRQUN4QyxpQkFBaUIsRUFBRSxLQUFLLENBQUMsV0FBVyxFQUFFLFFBQVEsRUFBRSxLQUFLLHNDQUE4QjtLQUNuRixDQUFDO0FBQ0gsQ0FBQyJ9