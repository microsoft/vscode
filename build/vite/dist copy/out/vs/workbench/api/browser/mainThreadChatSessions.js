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
import { raceCancellationError } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter } from '../../../base/common/event.js';
import { MarkdownString, markdownStringEqual } from '../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, DisposableResourceMap, DisposableStore } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { revive } from '../../../base/common/marshalling.js';
import { equals } from '../../../base/common/objects.js';
import { autorun, observableSignalFromEvent, observableValue } from '../../../base/common/observable.js';
import { isEqual } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IDialogService } from '../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { hasValidDiff } from '../../contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../contrib/chat/browser/agentSessions/agentSessionsService.js';
import { IChatWidgetService, isIChatViewViewContext } from '../../contrib/chat/browser/chat.js';
import { getInProgressSessionDescription } from '../../contrib/chat/browser/chatSessions/chatSessionDescription.js';
import { getSessionStatusForModel } from '../../contrib/chat/browser/chatSessions/chatSessions.contribution.js';
import { ChatEditorInput } from '../../contrib/chat/browser/widgetHosts/editor/chatEditorInput.js';
import { IChatDebugService } from '../../contrib/chat/common/chatDebugService.js';
import { IChatService } from '../../contrib/chat/common/chatService/chatService.js';
import { ChatSessionOptionsMap, IChatSessionsService } from '../../contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation } from '../../contrib/chat/common/constants.js';
import { getChatSessionType, isUntitledChatSession } from '../../contrib/chat/common/model/chatUri.js';
import { IChatArtifactsService } from '../../contrib/chat/common/tools/chatArtifactsService.js';
import { IChatTodoListService } from '../../contrib/chat/common/tools/chatTodoListService.js';
import { IEditorGroupsService } from '../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
function stringOrMarkdownEqual(a, b) {
    if (a === b) {
        return true;
    }
    if (!a || !b) {
        return false;
    }
    if (typeof a === 'string' || typeof b === 'string') {
        return false;
    }
    return markdownStringEqual(a, b);
}
export class ObservableChatSession extends Disposable {
    get options() {
        return this._options ? new Map(this._options) : undefined;
    }
    get progressObs() {
        return this._progressObservable;
    }
    get isCompleteObs() {
        return this._isCompleteObservable;
    }
    constructor(resource, providerHandle, proxy, logService, dialogService) {
        super();
        this._progressObservable = observableValue(this, []);
        this._isCompleteObservable = observableValue(this, false);
        this._onWillDispose = new Emitter();
        this.onWillDispose = this._onWillDispose.event;
        this._pendingProgressChunks = new Map();
        this._isInitialized = false;
        this._interruptionWasCanceled = false;
        this._disposalPending = false;
        this.sessionResource = resource;
        this.providerHandle = providerHandle;
        this.history = [];
        this._proxy = proxy;
        this._providerHandle = providerHandle;
        this._logService = logService;
        this._dialogService = dialogService;
    }
    initialize(token, context) {
        if (!this._initializationPromise) {
            this._initializationPromise = this._doInitializeContent(token, context);
        }
        return this._initializationPromise;
    }
    async _doInitializeContent(token, context) {
        try {
            const sessionContent = await raceCancellationError(this._proxy.$provideChatSessionContent(this._providerHandle, this.sessionResource, context, token), token);
            this._options = sessionContent.options ? ChatSessionOptionsMap.fromRecord(sessionContent.options) : undefined;
            this.title = sessionContent.title;
            this.history.length = 0;
            this.history.push(...sessionContent.history.map((turn) => {
                if (turn.type === 'request') {
                    const variables = turn.variableData?.variables.map(v => {
                        const entry = {
                            ...v,
                            value: revive(v.value)
                        };
                        return entry;
                    });
                    return {
                        type: 'request',
                        prompt: turn.prompt,
                        participant: turn.participant,
                        command: turn.command,
                        variableData: variables ? { variables } : undefined,
                        id: turn.id,
                        modelId: turn.modelId,
                        modeInstructions: turn.modeInstructions ? revive(turn.modeInstructions) : undefined,
                    };
                }
                return {
                    type: 'response',
                    parts: turn.parts.map((part) => revive(part)),
                    participant: turn.participant
                };
            }));
            if (sessionContent.hasActiveResponseCallback && !this.interruptActiveResponseCallback) {
                this.interruptActiveResponseCallback = async () => {
                    const confirmInterrupt = () => {
                        if (this._disposalPending) {
                            this._proxy.$disposeChatSessionContent(this._providerHandle, this.sessionResource);
                            this._disposalPending = false;
                        }
                        this._proxy.$interruptChatSessionActiveResponse(this._providerHandle, this.sessionResource, 'ongoing');
                        return true;
                    };
                    if (sessionContent.supportsInterruption) {
                        // If the session supports hot reload, interrupt without confirmation
                        return confirmInterrupt();
                    }
                    // Prompt the user to confirm interruption
                    return this._dialogService.confirm({
                        message: localize('interruptActiveResponse', 'Are you sure you want to interrupt the active session?')
                    }).then(confirmed => {
                        if (confirmed.confirmed) {
                            // User confirmed interruption - dispose the session content on extension host
                            return confirmInterrupt();
                        }
                        else {
                            // When user cancels the interruption, fire an empty progress message to keep the session alive
                            // This matches the behavior of the old implementation
                            this._addProgress([{
                                    kind: 'progressMessage',
                                    content: { value: '', isTrusted: false }
                                }]);
                            // Set flag to prevent completion when extension host calls handleProgressComplete
                            this._interruptionWasCanceled = true;
                            // User canceled interruption - cancel the deferred disposal
                            if (this._disposalPending) {
                                this._logService.info(`Canceling deferred disposal for session ${this.sessionResource} (user canceled interruption)`);
                                this._disposalPending = false;
                            }
                            return false;
                        }
                    });
                };
            }
            if (sessionContent.hasRequestHandler && !this.requestHandler) {
                this.requestHandler = async (request, progress, history, token) => {
                    // Clear previous progress and mark as active
                    this._progressObservable.set([], undefined);
                    this._isCompleteObservable.set(false, undefined);
                    // Set up reactive progress observation before starting the request
                    let lastProgressLength = 0;
                    const progressDisposable = autorun(reader => {
                        const progressArray = this._progressObservable.read(reader);
                        const isComplete = this._isCompleteObservable.read(reader);
                        if (progressArray.length > lastProgressLength) {
                            const newProgress = progressArray.slice(lastProgressLength);
                            progress(newProgress);
                            lastProgressLength = progressArray.length;
                        }
                        if (isComplete) {
                            progressDisposable.dispose();
                        }
                    });
                    try {
                        await this._proxy.$invokeChatSessionRequestHandler(this._providerHandle, this.sessionResource, request, history, token);
                        // Only mark as complete if there's no active response callback
                        // Sessions with active response callbacks should only complete when explicitly told to via handleProgressComplete
                        if (!this._isCompleteObservable.get() && !this.interruptActiveResponseCallback) {
                            this._markComplete();
                        }
                    }
                    catch (error) {
                        const errorProgress = {
                            kind: 'progressMessage',
                            content: { value: `Error: ${error instanceof Error ? error.message : String(error)}`, isTrusted: false }
                        };
                        this._addProgress([errorProgress]);
                        this._markComplete();
                        throw error;
                    }
                    finally {
                        // Ensure progress observation is cleaned up
                        progressDisposable.dispose();
                    }
                };
            }
            if (sessionContent.hasForkHandler && !this.forkSession) {
                this.forkSession = async (request, token) => {
                    const result = await this._proxy.$forkChatSession(this._providerHandle, this.sessionResource, request ? this.toRequestDto(request) : undefined, token);
                    return revive(result);
                };
            }
            this._isInitialized = true;
            // Process any pending progress chunks
            const hasActiveResponse = sessionContent.hasActiveResponseCallback;
            const hasRequestHandler = sessionContent.hasRequestHandler;
            const hasAnyCapability = hasActiveResponse || hasRequestHandler;
            for (const [requestId, chunks] of this._pendingProgressChunks) {
                this._logService.debug(`Processing ${chunks.length} pending progress chunks for session ${this.sessionResource}, requestId ${requestId}`);
                this._addProgress(chunks);
            }
            this._pendingProgressChunks.clear();
            // If session has no active response callback and no request handler, mark it as complete
            if (!hasAnyCapability) {
                this._isCompleteObservable.set(true, undefined);
            }
        }
        catch (error) {
            this._logService.error(`Failed to initialize chat session ${this.sessionResource}:`, error);
            throw error;
        }
    }
    /**
     * Handle progress chunks coming from the extension host.
     * If the session is not initialized yet, the chunks will be queued.
     */
    handleProgressChunk(requestId, progress) {
        if (!this._isInitialized) {
            const existing = this._pendingProgressChunks.get(requestId) || [];
            this._pendingProgressChunks.set(requestId, [...existing, ...progress]);
            this._logService.debug(`Queuing ${progress.length} progress chunks for session ${this.sessionResource}, requestId ${requestId} (session not initialized)`);
            return;
        }
        this._addProgress(progress);
    }
    /**
     * Handle progress completion from the extension host.
     */
    handleProgressComplete(requestId) {
        // Clean up any pending chunks for this request
        this._pendingProgressChunks.delete(requestId);
        if (this._isInitialized) {
            // Don't mark as complete if user canceled the interruption
            if (!this._interruptionWasCanceled) {
                this._markComplete();
            }
            else {
                // Reset the flag and don't mark as complete
                this._interruptionWasCanceled = false;
            }
        }
    }
    _addProgress(progress) {
        const currentProgress = this._progressObservable.get();
        this._progressObservable.set([...currentProgress, ...progress], undefined);
    }
    _markComplete() {
        if (!this._isCompleteObservable.get()) {
            this._isCompleteObservable.set(true, undefined);
        }
    }
    toRequestDto(request) {
        return {
            type: 'request',
            id: request.id,
            prompt: request.prompt,
            participant: request.participant,
            command: request.command,
            variableData: undefined,
            modelId: request.modelId,
            modeInstructions: request.modeInstructions,
        };
    }
    dispose() {
        this._onWillDispose.fire();
        this._onWillDispose.dispose();
        this._pendingProgressChunks.clear();
        // If this session has an active response callback and disposal is happening,
        // defer the actual session content disposal until we know the user's choice
        if (this.interruptActiveResponseCallback && !this._interruptionWasCanceled) {
            this._disposalPending = true;
            // The actual disposal will happen in the interruption callback based on user's choice
        }
        else {
            // No active response callback or user already canceled interruption - dispose immediately
            this._proxy.$disposeChatSessionContent(this._providerHandle, this.sessionResource);
        }
        super.dispose();
    }
}
let MainThreadChatSessionItemController = class MainThreadChatSessionItemController extends Disposable {
    constructor(proxy, chatSessionType, handle, _chatService, _logService) {
        super();
        this._chatService = _chatService;
        this._logService = _logService;
        this._onDidChangeChatSessionItems = this._register(new Emitter());
        this.onDidChangeChatSessionItems = this._onDidChangeChatSessionItems.event;
        this._modelListeners = this._register(new DisposableResourceMap());
        this._isDisposed = false;
        this._items = new ResourceMap();
        this._proxy = proxy;
        this._handle = handle;
        // Update the chat session item based on on the actual model state
        // TODO: This should be based on the chat session content provider instead of the chat models directly
        // or bed moved into the chat session service so that all controllers get the same behavior.
        const addModelListeners = async (model) => {
            if (getChatSessionType(model.sessionResource) !== chatSessionType) {
                return;
            }
            await this.refresh(CancellationToken.None);
            if (this._isDisposed) {
                return;
            }
            this.tryUpdateItemForModel(model);
            const requestChangeListener = model.lastRequestObs.map(last => last?.response && observableSignalFromEvent('chatSessions.modelRequestChangeListener', last.response.onDidChange));
            const modelChangeListener = observableSignalFromEvent('chatSessions.modelChangeListener', model.onDidChange);
            this._modelListeners.set(model.sessionResource, autorun(reader => {
                requestChangeListener.read(reader)?.read(reader);
                modelChangeListener.read(reader);
                this.tryUpdateItemForModel(model);
            }));
        };
        this._register(_chatService.onDidCreateModel(model => addModelListeners(model)));
        for (const model of _chatService.chatModels.get()) {
            addModelListeners(model);
        }
        this._register(_chatService.onDidDisposeSession(e => {
            for (const sessionResource of e.sessionResources) {
                this._modelListeners.deleteAndDispose(sessionResource);
            }
        }));
    }
    dispose() {
        this._isDisposed = true;
        super.dispose();
    }
    get items() {
        return Array.from(this._items.values());
    }
    refresh(token) {
        return this._proxy.$refreshChatSessionItems(this._handle, token);
    }
    async newChatSessionItem(request, token) {
        const dto = await raceCancellationError(this._proxy.$newChatSessionItem(this._handle, {
            prompt: request.prompt,
            command: request.command,
            initialSessionOptions: request.initialSessionOptions ? ChatSessionOptionsMap.toStrValueArray(request.initialSessionOptions) : undefined,
        }, token), token);
        if (!dto) {
            return undefined;
        }
        const item = this.addOrUpdateItem(dto);
        return item;
    }
    async acceptChange(change) {
        const addedOrUpdatedItems = [];
        for (const item of change.addedOrUpdated) {
            addedOrUpdatedItems.push(await this.addOrUpdateItem(item));
        }
        for (const uri of change.removed) {
            this._items.delete(uri);
        }
        this._onDidChangeChatSessionItems.fire({
            addedOrUpdated: addedOrUpdatedItems,
            removed: change.removed,
        });
    }
    async addOrUpdateItem(dto) {
        const resource = URI.revive(dto.resource);
        warnOnUntitledSessionResource(resource, this._logService);
        const existing = this._items.get(resource);
        const updated = new MainThreadChatSessionItem(dto, this._chatService.getSession(resource), await this._chatService.getMetadataForSession(resource));
        if (existing?.isEqual(updated)) {
            return existing;
        }
        this._items.set(resource, updated);
        this._onDidChangeChatSessionItems.fire({
            addedOrUpdated: [updated],
        });
        return updated;
    }
    async tryUpdateItemForModel(model) {
        const resource = model.sessionResource;
        const existing = this._items.get(resource);
        if (existing) {
            this.addOrUpdateItem(existing);
        }
    }
    async getNewChatSessionInputState(token) {
        const optionGroups = await this._proxy.$provideChatSessionInputState(this._handle, undefined, token);
        if (!optionGroups?.length) {
            return undefined;
        }
        return optionGroups;
    }
};
MainThreadChatSessionItemController = __decorate([
    __param(3, IChatService),
    __param(4, ILogService)
], MainThreadChatSessionItemController);
class MainThreadChatSessionItem {
    constructor(dto, model, detailOverrides) {
        this.resource = URI.revive(dto.resource);
        this.label = dto.label;
        this.timing = dto.timing;
        this.iconPath = dto.iconPath;
        this.badge = reviveMarkdownString(dto.badge);
        this.tooltip = reviveMarkdownString(dto.tooltip);
        this.archived = dto.archived;
        this.metadata = dto.metadata;
        this.description = (model && getInProgressSessionDescription(model)) ?? reviveMarkdownString(dto.description);
        this.status = (model && getSessionStatusForModel(model)) ?? dto.status;
        this.changes = revive(dto.changes);
        // We can still get stats if there is no model or if fetching from model failed
        if (detailOverrides && !this.changes) {
            const diffs = {
                files: detailOverrides.stats?.fileCount || 0,
                insertions: detailOverrides.stats?.added || 0,
                deletions: detailOverrides.stats?.removed || 0
            };
            if (hasValidDiff(diffs)) {
                this.changes = diffs;
            }
        }
    }
    isEqual(other) {
        return isEqual(this.resource, other.resource)
            && this.label === other.label
            && this.description === other.description
            && this.status === other.status
            && this.timing.created === other.timing.created
            && this.timing.lastRequestStarted === other.timing.lastRequestStarted
            && this.timing.lastRequestEnded === other.timing.lastRequestEnded
            && equals(this.changes, other.changes)
            && equals(this.iconPath, other.iconPath)
            && stringOrMarkdownEqual(this.badge, other.badge)
            && stringOrMarkdownEqual(this.tooltip, other.tooltip)
            && this.archived === other.archived
            && equals(this.metadata, other.metadata);
    }
}
let MainThreadChatSessions = class MainThreadChatSessions extends Disposable {
    constructor(_extHostContext, _agentSessionsService, _chatSessionsService, _chatService, _chatWidgetService, _chatTodoListService, _chatArtifactsService, _chatDebugService, _dialogService, _editorService, editorGroupService, _logService, _instantiationService) {
        super();
        this._extHostContext = _extHostContext;
        this._agentSessionsService = _agentSessionsService;
        this._chatSessionsService = _chatSessionsService;
        this._chatService = _chatService;
        this._chatWidgetService = _chatWidgetService;
        this._chatTodoListService = _chatTodoListService;
        this._chatArtifactsService = _chatArtifactsService;
        this._chatDebugService = _chatDebugService;
        this._dialogService = _dialogService;
        this._editorService = _editorService;
        this.editorGroupService = editorGroupService;
        this._logService = _logService;
        this._instantiationService = _instantiationService;
        this._itemControllerRegistrations = this._register(new DisposableMap());
        this._contentProvidersRegistrations = this._register(new DisposableMap());
        this._sessionTypeToHandle = new Map();
        this._activeSessions = new ResourceMap();
        this._sessionDisposables = new ResourceMap();
        this._proxy = this._extHostContext.getProxy(ExtHostContext.ExtHostChatSessions);
        this._register(this._chatSessionsService.onDidChangeSessionOptions(({ sessionResource, updates }) => {
            warnOnUntitledSessionResource(sessionResource, this._logService);
            const handle = this._getHandleForSessionType(sessionResource.scheme);
            this._logService.trace(`[MainThreadChatSessions] onRequestNotifyExtension received: scheme '${sessionResource.scheme}', handle ${handle}, ${updates.size} update(s)`);
            if (handle !== undefined) {
                this.notifyOptionsChange(handle, sessionResource, updates);
            }
            else {
                this._logService.warn(`[MainThreadChatSessions] Cannot notify option change for scheme '${sessionResource.scheme}': no provider registered. Registered schemes: [${Array.from(this._sessionTypeToHandle.keys()).join(', ')}]`);
            }
        }));
        this._register(this._agentSessionsService.model.onDidChangeSessionArchivedState(session => {
            for (const [handle, { chatSessionType }] of this._itemControllerRegistrations) {
                if (chatSessionType === session.providerType) {
                    warnOnUntitledSessionResource(session.resource, this._logService);
                    this._proxy.$onDidChangeChatSessionItemState(handle, session.resource, session.isArchived());
                }
            }
        }));
    }
    _getHandleForSessionType(chatSessionType) {
        return this._sessionTypeToHandle.get(chatSessionType);
    }
    $registerChatSessionItemController(handle, chatSessionType) {
        const disposables = new DisposableStore();
        const controller = disposables.add(this._instantiationService.createInstance(MainThreadChatSessionItemController, this._proxy, chatSessionType, handle));
        disposables.add(this._chatSessionsService.registerChatSessionItemController(chatSessionType, controller));
        this._itemControllerRegistrations.set(handle, {
            chatSessionType,
            controller,
            dispose: () => disposables.dispose(),
        });
        // Fetch initial input state for new/untitled sessions
        this._refreshControllerInputState(handle, chatSessionType);
    }
    _refreshControllerInputState(handle, chatSessionType) {
        this._proxy.$provideChatSessionInputState(handle, undefined, CancellationToken.None).then(optionGroups => {
            if (optionGroups?.length) {
                this._applyOptionGroups(handle, chatSessionType, optionGroups);
            }
        }).catch(err => this._logService.error('Error fetching chat session input state', err));
    }
    _applyOptionGroups(handle, chatSessionType, optionGroups) {
        this._chatSessionsService.setOptionGroupsForSessionType(chatSessionType, handle, optionGroups);
    }
    getController(handle) {
        const registration = this._itemControllerRegistrations.get(handle);
        if (!registration) {
            throw new Error(`No chat session controller registered for handle ${handle}`);
        }
        return registration.controller;
    }
    async $updateChatSessionItems(controllerHandle, change) {
        const controller = this.getController(controllerHandle);
        controller.acceptChange({
            addedOrUpdated: change.addedOrUpdated,
            removed: change.removed.map(uri => URI.revive(uri))
        });
    }
    async $addOrUpdateChatSessionItem(controllerHandle, item) {
        const controller = this.getController(controllerHandle);
        controller.acceptChange({
            addedOrUpdated: [item],
            removed: []
        });
    }
    $onDidChangeChatSessionOptions(handle, sessionResourceComponents, updates) {
        const sessionResource = URI.revive(sessionResourceComponents);
        warnOnUntitledSessionResource(sessionResource, this._logService);
        this._chatSessionsService.updateSessionOptions(sessionResource, ChatSessionOptionsMap.fromRecord(updates));
    }
    async $onDidCommitChatSessionItem(handle, originalComponents, modifiedCompoennts) {
        const originalResource = URI.revive(originalComponents);
        const modifiedResource = URI.revive(modifiedCompoennts);
        this._logService.trace(`$onDidCommitChatSessionItem: handle(${handle}), original(${originalResource}), modified(${modifiedResource})`);
        const chatSessionType = this._itemControllerRegistrations.get(handle)?.chatSessionType;
        if (!chatSessionType) {
            this._logService.error(`No chat session type found for provider handle ${handle}`);
            return;
        }
        const originalEditor = this._editorService.editors.find(editor => editor.resource?.toString() === originalResource.toString());
        const originalModel = this._chatService.acquireExistingSession(originalResource);
        const contribution = this._chatSessionsService.getAllChatSessionContributions().find(c => c.type === chatSessionType);
        try {
            // Migrate todos from old session to new session
            this._chatTodoListService.migrateTodos(originalResource, modifiedResource);
            // Migrate artifacts from old session to new session
            this._chatArtifactsService.getArtifacts(originalResource).migrate(this._chatArtifactsService.getArtifacts(modifiedResource));
            // Eagerly invoke debug providers for Copilot CLI sessions so the real
            // session appears in the debug panel immediately after the untitled →
            // real swap. Without this, the untitled session is filtered out (it
            // only has a "Load Hooks" event) and the real session has no events
            // until someone navigates to it — which can't happen because it's
            // not listed.
            if (chatSessionType === 'copilotcli') {
                // Fire-and-forget: don't block the editor swap. Errors are
                // handled internally by invokeProviders via onUnexpectedError.
                this._chatDebugService.invokeProviders(modifiedResource).catch(() => { });
            }
            // Find the group containing the original editor
            const originalGroup = this.editorGroupService.groups.find(group => group.editors.some(editor => isEqual(editor.resource, originalResource)))
                ?? this.editorGroupService.activeGroup;
            const options = {
                title: {
                    preferred: originalEditor?.getName() || undefined,
                    fallback: localize('chatEditorContributionName', "{0}", contribution?.displayName),
                }
            };
            // Prefetch the chat session content to make the subsequent editor swap quick
            const newSession = await this._chatSessionsService.getOrCreateChatSession(URI.revive(modifiedResource), CancellationToken.None);
            if (originalEditor) {
                newSession.transferredState = originalEditor instanceof ChatEditorInput
                    ? { editingSession: originalEditor.transferOutEditingSession(), inputState: originalModel?.object?.inputModel.toJSON() }
                    : undefined;
                await this._editorService.replaceEditors([{
                        editor: originalEditor,
                        replacement: {
                            resource: modifiedResource,
                            options,
                        },
                    }], originalGroup);
                // Re-send queued requests from the original session on the committed session
                this._resendPendingRequests(originalResource, modifiedResource);
                return;
            }
            // If chat editor is in the side panel, then those are not listed as editors.
            // In that case we need to transfer editing session using the original model.
            if (originalModel) {
                newSession.transferredState = {
                    editingSession: originalModel.object.editingSession,
                    inputState: originalModel.object.inputModel.toJSON()
                };
            }
            const chatViewWidget = this._chatWidgetService.getWidgetBySessionResource(originalResource);
            if (chatViewWidget && isIChatViewViewContext(chatViewWidget.viewContext)) {
                await this._chatWidgetService.openSession(modifiedResource, undefined, { preserveFocus: true });
            }
            else {
                // Loading the session to ensure the session is created and editing session is transferred.
                const ref = await this._chatService.acquireOrLoadSession(modifiedResource, ChatAgentLocation.Chat, CancellationToken.None);
                ref?.dispose();
            }
            // Re-send queued requests from the original session on the committed session
            this._resendPendingRequests(originalResource, modifiedResource);
            // Notify listeners that the session has been committed
            this._chatSessionsService.fireSessionCommitted(originalResource, modifiedResource);
        }
        finally {
            originalModel?.dispose();
        }
    }
    /**
     * Re-sends pending and in-flight requests from the original session on the committed session.
     */
    _resendPendingRequests(originalResource, modifiedResource) {
        this._chatService.migrateRequests(originalResource, modifiedResource);
    }
    async _provideChatSessionContent(providerHandle, sessionResource, token) {
        warnOnUntitledSessionResource(sessionResource, this._logService);
        let session = this._activeSessions.get(sessionResource);
        if (!session) {
            session = new ObservableChatSession(sessionResource, providerHandle, this._proxy, this._logService, this._dialogService);
            this._activeSessions.set(sessionResource, session);
            const disposable = session.onWillDispose(() => {
                this._activeSessions.delete(sessionResource);
                this._sessionDisposables.get(sessionResource)?.dispose();
                this._sessionDisposables.delete(sessionResource);
            });
            this._sessionDisposables.set(sessionResource, disposable);
        }
        try {
            const initialSessionOptions = this._chatSessionsService.getSessionOptions(sessionResource);
            await session.initialize(token, {
                initialSessionOptions: initialSessionOptions ? [...initialSessionOptions].map(([optionId, value]) => ({ optionId, value: typeof value === 'string' ? value : value?.id })) : undefined,
            });
            if (session.options) {
                for (const [_, handle] of this._sessionTypeToHandle) {
                    if (handle === providerHandle) {
                        for (const [optionId, value] of session.options) {
                            this._chatSessionsService.setSessionOption(sessionResource, optionId, value);
                        }
                        break;
                    }
                }
            }
            return session;
        }
        catch (error) {
            session.dispose();
            this._logService.error(`Error providing chat session content for handle ${providerHandle} and resource ${sessionResource.toString()}:`, error);
            throw error;
        }
    }
    $unregisterChatSessionItemController(handle) {
        this._itemControllerRegistrations.deleteAndDispose(handle);
    }
    $registerChatSessionContentProvider(handle, chatSessionScheme) {
        const provider = {
            provideChatSessionContent: (resource, token) => this._provideChatSessionContent(handle, resource, token)
        };
        this._sessionTypeToHandle.set(chatSessionScheme, handle);
        this._contentProvidersRegistrations.set(handle, this._chatSessionsService.registerChatSessionContentProvider(chatSessionScheme, provider));
        this._refreshProviderOptions(handle, chatSessionScheme);
    }
    $unregisterChatSessionContentProvider(handle) {
        this._contentProvidersRegistrations.deleteAndDispose(handle);
        for (const [sessionType, h] of this._sessionTypeToHandle) {
            if (h === handle) {
                this._sessionTypeToHandle.delete(sessionType);
                break;
            }
        }
        // dispose all sessions from this provider and clean up its disposables
        for (const [key, session] of this._activeSessions) {
            if (session.providerHandle === handle) {
                session.dispose();
                this._activeSessions.delete(key);
            }
        }
    }
    async $handleProgressChunk(handle, sessionResource, requestId, chunks) {
        const resource = URI.revive(sessionResource);
        const observableSession = this._activeSessions.get(resource);
        if (!observableSession) {
            this._logService.warn(`No session found for progress chunks: handle ${handle}, sessionResource ${resource}, requestId ${requestId}`);
            return;
        }
        const chatProgressParts = chunks.map(chunk => {
            const [progress] = Array.isArray(chunk) ? chunk : [chunk];
            return revive(progress);
        });
        observableSession.handleProgressChunk(requestId, chatProgressParts);
    }
    $handleProgressComplete(handle, sessionResource, requestId) {
        const resource = URI.revive(sessionResource);
        warnOnUntitledSessionResource(resource, this._logService);
        const observableSession = this._activeSessions.get(resource);
        if (!observableSession) {
            this._logService.warn(`No session found for progress completion: handle ${handle}, sessionResource ${resource}, requestId ${requestId}`);
            return;
        }
        observableSession.handleProgressComplete(requestId);
    }
    $handleAnchorResolve(handle, sesssionResource, requestId, requestHandle, anchor) {
        // throw new Error('Method not implemented.');
    }
    $onDidChangeChatSessionProviderOptions(handle) {
        let sessionType;
        for (const [type, h] of this._sessionTypeToHandle) {
            if (h === handle) {
                sessionType = type;
                break;
            }
        }
        if (!sessionType) {
            this._logService.warn(`No session type found for chat session content provider handle ${handle} when refreshing provider options`);
            return;
        }
        this._refreshProviderOptions(handle, sessionType);
    }
    $updateChatSessionInputState(controllerHandle, optionGroups) {
        const registration = this._itemControllerRegistrations.get(controllerHandle);
        if (!registration) {
            this._logService.warn(`No controller found for handle ${controllerHandle} when updating input state`);
            return;
        }
        this._applyOptionGroups(controllerHandle, registration.chatSessionType, optionGroups);
    }
    _refreshProviderOptions(handle, chatSessionScheme) {
        this._proxy.$provideChatSessionProviderOptions(handle, CancellationToken.None).then(options => {
            if (options?.optionGroups && options.optionGroups.length) {
                this._chatSessionsService.setOptionGroupsForSessionType(chatSessionScheme, handle, [...options.optionGroups]);
            }
        }).catch(err => this._logService.error('Error fetching chat session options', err));
    }
    dispose() {
        for (const session of this._activeSessions.values()) {
            session.dispose();
        }
        this._activeSessions.clear();
        for (const disposable of this._sessionDisposables.values()) {
            disposable.dispose();
        }
        this._sessionDisposables.clear();
        super.dispose();
    }
    /**
     * Notify the extension about option changes for a session
     */
    async notifyOptionsChange(handle, sessionResource, updates) {
        this._logService.trace(`[MainThreadChatSessions] notifyOptionsChange: starting proxy call for handle ${handle}, sessionResource ${sessionResource}`);
        try {
            await this._proxy.$provideHandleOptionsChange(handle, sessionResource, Object.fromEntries(updates), CancellationToken.None);
            this._logService.trace(`[MainThreadChatSessions] notifyOptionsChange: proxy call completed for handle ${handle}, sessionResource ${sessionResource}`);
        }
        catch (error) {
            this._logService.error(`[MainThreadChatSessions] notifyOptionsChange: error for handle ${handle}, sessionResource ${sessionResource}:`, error);
        }
    }
};
MainThreadChatSessions = __decorate([
    extHostNamedCustomer(MainContext.MainThreadChatSessions),
    __param(1, IAgentSessionsService),
    __param(2, IChatSessionsService),
    __param(3, IChatService),
    __param(4, IChatWidgetService),
    __param(5, IChatTodoListService),
    __param(6, IChatArtifactsService),
    __param(7, IChatDebugService),
    __param(8, IDialogService),
    __param(9, IEditorService),
    __param(10, IEditorGroupsService),
    __param(11, ILogService),
    __param(12, IInstantiationService)
], MainThreadChatSessions);
export { MainThreadChatSessions };
function warnOnUntitledSessionResource(resource, logService) {
    if (isUntitledChatSession(resource)) {
        logService.warn(`[MainThreadChatSessions] untitled-style sessionResource detected ${resource.toString()}`);
    }
}
function reviveMarkdownString(value) {
    if (!value) {
        return undefined;
    }
    // If it's already a string, return as-is
    if (typeof value === 'string') {
        return value;
    }
    // If it's a serialized IMarkdownString, revive it to MarkdownString
    if (typeof value === 'object' && 'value' in value) {
        return MarkdownString.lift(value);
    }
    return undefined;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZENoYXRTZXNzaW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkQ2hhdFNlc3Npb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN4RCxPQUFPLEVBQW1CLGNBQWMsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzNHLE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLHFCQUFxQixFQUFFLGVBQWUsRUFBZSxNQUFNLG1DQUFtQyxDQUFDO0FBQ25JLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUMxRCxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDN0QsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxPQUFPLEVBQWUseUJBQXlCLEVBQUUsZUFBZSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDdEgsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRTVELE9BQU8sRUFBRSxHQUFHLEVBQWlCLE1BQU0sNkJBQTZCLENBQUM7QUFDakUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzNDLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM3RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNoRyxPQUFP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