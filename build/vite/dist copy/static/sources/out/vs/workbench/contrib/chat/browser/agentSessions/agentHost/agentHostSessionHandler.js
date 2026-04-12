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
import { Throttler } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { BugIndicatingError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableResourceMap, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { autorun, observableValue } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { AgentSession } from '../../../../../../platform/agentHost/common/agentService.js';
import { isSessionAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { SessionClientState } from '../../../../../../platform/agentHost/common/state/sessionClientState.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { getToolKind, getToolLanguage } from '../../../../../../platform/agentHost/common/state/sessionReducers.js';
import { getToolFileEdits } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IChatService, IChatToolInvocation } from '../../../common/chatService/chatService.js';
import { ChatAgentLocation, ChatModeKind } from '../../../common/constants.js';
import { IChatEditingService } from '../../../common/editing/chatEditingService.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { IChatAgentService } from '../../../common/participants/chatAgents.js';
import { getAgentHostIcon } from '../agentSessions.js';
import { AgentHostEditingSession } from './agentHostEditingSession.js';
import { activeTurnToProgress, finalizeToolInvocation, toolCallStateToInvocation, turnsToHistory } from './stateToProgressAdapter.js';
// =============================================================================
// AgentHostSessionHandler - renderer-side handler for a single agent host
// chat session type. Bridges the protocol state layer with the chat UI:
// subscribes to session state, derives IChatProgress[] from immutable state
// changes, and dispatches client actions (turnStarted, toolCallConfirmed,
// turnCancelled) back to the server.
// =============================================================================
// =============================================================================
// Chat session
// =============================================================================
let AgentHostChatSession = class AgentHostChatSession extends Disposable {
    constructor(sessionResource, history, _sendRequest, _forkSession, initialProgress, onDispose, _logService) {
        super();
        this.sessionResource = sessionResource;
        this.history = history;
        this._sendRequest = _sendRequest;
        this._forkSession = _forkSession;
        this._logService = _logService;
        this.progressObs = observableValue('agentHostProgress', []);
        this.isCompleteObs = observableValue('agentHostComplete', true);
        this._onWillDispose = this._register(new Emitter());
        this.onWillDispose = this._onWillDispose.event;
        this._onDidStartServerRequest = this._register(new Emitter());
        this.onDidStartServerRequest = this._onDidStartServerRequest.event;
        const hasActiveTurn = initialProgress !== undefined;
        if (hasActiveTurn) {
            this.isCompleteObs.set(false, undefined);
            this.progressObs.set(initialProgress, undefined);
        }
        this._register(toDisposable(() => this._onWillDispose.fire()));
        this._register(toDisposable(onDispose));
        this.requestHandler = async (request, progress, _history, cancellationToken) => {
            this._logService.info('[AgentHost] requestHandler called');
            this.isCompleteObs.set(false, undefined);
            await this._sendRequest(request, progress, cancellationToken);
            this.isCompleteObs.set(true, undefined);
        };
        // Provide interrupt callback when reconnecting to an active turn or
        // when this is a brand-new session (no history yet).
        this.interruptActiveResponseCallback = (hasActiveTurn || history.length === 0) ? async () => {
            return true;
        } : undefined;
        this.forkSession = this._forkSession;
    }
    /**
     * Registers a disposable to be cleaned up when this session is disposed.
     */
    registerDisposable(disposable) {
        return this._register(disposable);
    }
    /**
     * Appends new progress items to the observable. Used by the reconnection
     * flow to stream ongoing state changes into the chat UI.
     */
    appendProgress(items) {
        const current = this.progressObs.get();
        this.progressObs.set([...current, ...items], undefined);
    }
    /**
     * Marks the active turn as complete.
     */
    complete() {
        this.isCompleteObs.set(true, undefined);
    }
    /**
     * Called by the session handler when a server-initiated turn starts.
     * Resets the progress observable and signals listeners to create a new
     * request+response pair in the chat model.
     */
    startServerRequest(prompt) {
        this._logService.info('[AgentHost] Server-initiated request started');
        this.progressObs.set([], undefined);
        this.isCompleteObs.set(false, undefined);
        this._onDidStartServerRequest.fire({ prompt });
    }
};
AgentHostChatSession = __decorate([
    __param(6, ILogService)
], AgentHostChatSession);
let AgentHostSessionHandler = class AgentHostSessionHandler extends Disposable {
    constructor(config, _chatAgentService, _chatService, _chatEditingService, _logService, _productService, _workspaceContextService, _instantiationService) {
        super();
        this._chatAgentService = _chatAgentService;
        this._chatService = _chatService;
        this._chatEditingService = _chatEditingService;
        this._logService = _logService;
        this._productService = _productService;
        this._workspaceContextService = _workspaceContextService;
        this._instantiationService = _instantiationService;
        this._activeSessions = new ResourceMap();
        /** Maps UI resource keys to resolved backend session URIs. */
        this._sessionToBackend = new ResourceMap();
        /** Per-session subscription to chat model pending request changes. */
        this._pendingMessageSubscriptions = this._register(new DisposableResourceMap());
        /** Per-session subscription watching for server-initiated turns. */
        this._serverTurnWatchers = this._register(new DisposableResourceMap());
        /** Historical turns with file edits, pending hydration into the editing session. */
        this._pendingHistoryTurns = new ResourceMap();
        /** Turn IDs dispatched by this client, used to distinguish server-originated turns. */
        this._clientDispatchedTurnIds = new Set();
        this._config = config;
        // Create shared client state manager for this handler instance
        this._clientState = this._register(new SessionClientState(config.connection.clientId, this._logService, () => config.connection.nextClientSeq()));
        // Register an editing session provider for this handler's session type
        this._register(this._chatEditingService.registerEditingSessionProvider(config.sessionType, {
            createEditingSession: (chatSessionResource) => {
                return this._instantiationService.createInstance(AgentHostEditingSession, chatSessionResource, config.connectionAuthority);
            },
        }));
        // Forward action envelopes from IPC to client state
        this._register(config.connection.onDidAction(envelope => {
            if (isSessionAction(envelope.action)) {
                this._clientState.receiveEnvelope(envelope);
            }
        }));
        // When the customizations observable changes, re-dispatch
        // activeClientChanged for sessions where this client is already
        // the active client. This avoids overwriting another client's
        // active status on sessions we're only observing.
        if (config.customizations) {
            this._register(autorun(reader => {
                const refs = config.customizations.read(reader);
                for (const [, backendSession] of this._sessionToBackend) {
                    const state = this._clientState.getSessionState(backendSession.toString());
                    if (state?.activeClient?.clientId === this._clientState.clientId) {
                        this._dispatchActiveClient(backendSession, refs);
                    }
                }
            }));
        }
        this._registerAgent();
    }
    async provideChatSessionContent(sessionResource, _token) {
        // For untitled (new) sessions, defer backend session creation until the
        // first request arrives so the user-selected model is available.
        // For existing sessions we resolve immediately to load history.
        let resolvedSession;
        const isUntitled = sessionResource.path.substring(1).startsWith('untitled-');
        const history = [];
        let initialProgress;
        let activeTurnId;
        if (!isUntitled) {
            resolvedSession = this._resolveSessionUri(sessionResource);
            this._sessionToBackend.set(sessionResource, resolvedSession);
            try {
                const snapshot = await this._config.connection.subscribe(resolvedSession);
                if (snapshot?.state) {
                    this._clientState.handleSnapshot(resolvedSession.toString(), snapshot.state, snapshot.fromSeq);
                    const sessionState = this._clientState.getSessionState(resolvedSession.toString());
                    if (sessionState) {
                        history.push(...turnsToHistory(sessionState.turns, this._config.agentId));
                        // Store turns with file edits so the editing session
                        // can be hydrated when it's created lazily.
                        const hasTurnsWithEdits = sessionState.turns.some(t => t.responseParts.some(rp => rp.kind === "toolCall" /* ResponsePartKind.ToolCall */
                            && rp.toolCall.status === "completed" /* ToolCallStatus.Completed */
                            && getToolFileEdits(rp.toolCall).length > 0));
                        if (hasTurnsWithEdits) {
                            this._pendingHistoryTurns.set(sessionResource, sessionState.turns);
                        }
                        // If there's an active turn, include its request in history
                        // with an empty response so the chat service creates a
                        // pending request, then provide accumulated progress via
                        // progressObs for live streaming.
                        if (sessionState.activeTurn) {
                            activeTurnId = sessionState.activeTurn.id;
                            history.push({
                                type: 'request',
                                prompt: sessionState.activeTurn.userMessage.text,
                                participant: this._config.agentId,
                            });
                            history.push({
                                type: 'response',
                                parts: [],
                                participant: this._config.agentId,
                            });
                            initialProgress = activeTurnToProgress(sessionState.activeTurn);
                            this._logService.info(`[AgentHost] Reconnecting to active turn ${activeTurnId} for session ${resolvedSession.toString()}`);
                        }
                    }
                }
            }
            catch (err) {
                this._logService.warn(`[AgentHost] Failed to subscribe to existing session: ${resolvedSession.toString()}`, err);
            }
            // Claim the active client role with current customizations
            const customizations = this._config.customizations?.get() ?? [];
            this._dispatchActiveClient(resolvedSession, customizations);
        }
        const session = this._instantiationService.createInstance(AgentHostChatSession, sessionResource, history, async (request, progress, token) => {
            // todo@connor4312, I think IChatSession.requestHandler is actually
            // dead code and I don't believe this is ever called.
            const backendSession = resolvedSession ?? await this._createAndSubscribe(sessionResource, request.userSelectedModelId);
            if (!resolvedSession) {
                resolvedSession = backendSession;
                this._sessionToBackend.set(sessionResource, backendSession);
            }
            // For existing sessions, set up pending message sync on the first turn
            // (after the ChatModel becomes available in the ChatService).
            this._ensurePendingMessageSubscription(sessionResource, backendSession);
            return this._handleTurn(backendSession, request, progress, token);
        }, (request, token) => {
            resolvedSession ??= this._sessionToBackend.get(sessionResource);
            if (!resolvedSession) {
                throw new BugIndicatingError('Cannot fork session before the initial request');
            }
            return this._forkSession(sessionResource, resolvedSession, request, token);
        }, initialProgress, () => {
            this._activeSessions.delete(sessionResource);
            this._sessionToBackend.delete(sessionResource);
            this._pendingMessageSubscriptions.deleteAndDispose(sessionResource);
            this._serverTurnWatchers.deleteAndDispose(sessionResource);
            this._pendingHistoryTurns.delete(sessionResource);
            if (resolvedSession) {
                this._clientState.unsubscribe(resolvedSession.toString());
                this._config.connection.unsubscribe(resolvedSession);
            }
        });
        this._activeSessions.set(sessionResource, session);
        if (resolvedSession) {
            // If there are historical turns with file edits, eagerly create
            // the editing session once the ChatModel is available so that
            // edit pills render with diff info on session restore.
            if (this._pendingHistoryTurns.has(sessionResource)) {
                session.registerDisposable(Event.once(this._chatService.onDidCreateModel)(model => {
                    if (isEqual(model.sessionResource, sessionResource)) {
                        this._ensureEditingSession(sessionResource);
                    }
                }));
            }
            // If reconnecting to an active turn, wire up an ongoing state listener
            // to stream new progress into the session's progressObs.
            if (activeTurnId && initialProgress !== undefined) {
                this._reconnectToActiveTurn(resolvedSession, activeTurnId, session, initialProgress);
            }
            // For existing (non-untitled) sessions, start watching for server-initiated turns
            // immediately. For untitled sessions, this is deferred to _createAndSubscribe.
            this._watchForServerInitiatedTurns(resolvedSession, sessionResource);
        }
        return session;
    }
    // ---- Agent registration -------------------------------------------------
    _registerAgent() {
        const agentData = {
            id: this._config.agentId,
            name: this._config.agentId,
            fullName: this._config.fullName,
            description: this._config.description,
            extensionId: new ExtensionIdentifier(this._config.extensionId ?? 'vscode.agent-host'),
            extensionVersion: undefined,
            extensionPublisherId: 'vscode',
            extensionDisplayName: this._config.extensionDisplayName ?? 'Agent Host',
            isDefault: false,
            isDynamic: true,
            isCore: true,
            metadata: { themeIcon: getAgentHostIcon(this._productService) },
            slashCommands: [],
            locations: [ChatAgentLocation.Chat],
            modes: [ChatModeKind.Agent],
            disambiguation: [],
        };
        const agentImpl = {
            invoke: async (request, progress, _history, cancellationToken) => {
                return this._invokeAgent(request, progress, cancellationToken);
            },
        };
        this._register(this._chatAgentService.registerDynamicAgent(agentData, agentImpl));
    }
    async _invokeAgent(request, progress, cancellationToken) {
        this._logService.info(`[AgentHost] _invokeAgent called for resource: ${request.sessionResource.toString()}`);
        // Resolve or create backend session
        let resolvedSession = this._sessionToBackend.get(request.sessionResource);
        if (!resolvedSession) {
            resolvedSession = await this._createAndSubscribe(request.sessionResource, request.userSelectedModelId);
            this._sessionToBackend.set(request.sessionResource, resolvedSession);
        }
        await this._handleTurn(resolvedSession, request, progress, cancellationToken);
        const activeSession = this._activeSessions.get(request.sessionResource);
        if (activeSession) {
            activeSession.isCompleteObs.set(true, undefined);
        }
        return {};
    }
    // ---- Pending message sync -----------------------------------------------
    /**
     * Diffs the chat model's pending requests against the protocol state in
     * `_clientState` and dispatches Set/Removed/Reordered actions as needed.
     */
    _syncPendingMessages(sessionResource, backendSession) {
        const chatModel = this._chatService.getSession(sessionResource);
        if (!chatModel) {
            return;
        }
        const session = backendSession.toString();
        const pending = chatModel.getPendingRequests();
        const protocolState = this._clientState.getSessionState(session);
        const prevSteering = protocolState?.steeringMessage;
        const prevQueued = protocolState?.queuedMessages ?? [];
        // Compute current state from chat model
        let currentSteering;
        const currentQueued = [];
        for (const p of pending) {
            if (p.kind === "steering" /* ChatRequestQueueKind.Steering */) {
                currentSteering = { id: p.request.id, text: p.request.message.text };
            }
            else {
                currentQueued.push({ id: p.request.id, text: p.request.message.text });
            }
        }
        // --- Steering ---
        if (currentSteering) {
            if (currentSteering.id !== prevSteering?.id) {
                this._dispatchAction({
                    type: "session/pendingMessageSet" /* ActionType.SessionPendingMessageSet */,
                    session,
                    kind: "steering" /* PendingMessageKind.Steering */,
                    id: currentSteering.id,
                    userMessage: { text: currentSteering.text },
                });
            }
        }
        else if (prevSteering) {
            this._dispatchAction({
                type: "session/pendingMessageRemoved" /* ActionType.SessionPendingMessageRemoved */,
                session,
                kind: "steering" /* PendingMessageKind.Steering */,
                id: prevSteering.id,
            });
        }
        // --- Queued: removals ---
        const currentQueuedIds = new Set(currentQueued.map(q => q.id));
        for (const prev of prevQueued) {
            if (!currentQueuedIds.has(prev.id)) {
                this._dispatchAction({
                    type: "session/pendingMessageRemoved" /* ActionType.SessionPendingMessageRemoved */,
                    session,
                    kind: "queued" /* PendingMessageKind.Queued */,
                    id: prev.id,
                });
            }
        }
        // --- Queued: additions ---
        const prevQueuedIds = new Set(prevQueued.map(q => q.id));
        for (const q of currentQueued) {
            if (!prevQueuedIds.has(q.id)) {
                this._dispatchAction({
                    type: "session/pendingMessageSet" /* ActionType.SessionPendingMessageSet */,
                    session,
                    kind: "queued" /* PendingMessageKind.Queued */,
                    id: q.id,
                    userMessage: { text: q.text },
                });
            }
        }
        // --- Queued: reordering ---
        // After additions/removals, check if the remaining common items changed order.
        // Re-read protocol state since dispatches above may have mutated it.
        const updatedProtocol = this._clientState.getSessionState(session);
        const updatedQueued = updatedProtocol?.queuedMessages ?? [];
        if (updatedQueued.length > 1 && currentQueued.length === updatedQueued.length) {
            const needsReorder = currentQueued.some((q, i) => q.id !== updatedQueued[i].id);
            if (needsReorder) {
                this._dispatchAction({
                    type: "session/queuedMessagesReordered" /* ActionType.SessionQueuedMessagesReordered */,
                    session,
                    order: currentQueued.map(q => q.id),
                });
            }
        }
    }
    _dispatchAction(action) {
        const seq = this._clientState.applyOptimistic(action);
        this._config.connection.dispatchAction(action, this._clientState.clientId, seq);
    }
    /**
     * Dispatches `session/activeClientChanged` to claim the active client
     * role for this session and publish the current customizations.
     */
    _dispatchActiveClient(backendSession, customizations) {
        this._dispatchAction({
            type: "session/activeClientChanged" /* ActionType.SessionActiveClientChanged */,
            session: backendSession.toString(),
            activeClient: {
                clientId: this._clientState.clientId,
                tools: [],
                customizations,
            },
        });
    }
    // ---- Server-initiated turn detection ------------------------------------
    /**
     * Sets up a persistent listener on the session's protocol state that
     * detects server-initiated turns (e.g. auto-consumed queued messages).
     * When a new `activeTurn` appears whose `turnId` was NOT dispatched by
     * this client, it signals the {@link AgentHostChatSession} to create a
     * new request in the chat model, removes the consumed pending request
     * if applicable, and pipes turn progress through `progressObs`.
     */
    _watchForServerInitiatedTurns(backendSession, sessionResource) {
        const sessionStr = backendSession.toString();
        // Seed from the current state so we don't treat any pre-existing active
        // turn (e.g. one being handled by _reconnectToActiveTurn) as new.
        const currentState = this._clientState.getSessionState(sessionStr);
        let lastSeenTurnId = currentState?.activeTurn?.id;
        let previousQueuedIds;
        let previousSteeringId = currentState?.steeringMessage?.id;
        const disposables = new DisposableStore();
        // MutableDisposable for per-turn progress tracking (replaced each turn)
        const turnProgressDisposable = new MutableDisposable();
        disposables.add(turnProgressDisposable);
        disposables.add(this._clientState.onDidChangeSessionState(e => {
            if (e.session !== sessionStr) {
                return;
            }
            // Track queued message IDs so we can detect which one was consumed
            const currentQueuedIds = new Set((e.state.queuedMessages ?? []).map(m => m.id));
            const currentSteeringId = e.state.steeringMessage?.id;
            // Detect steering message removal or replacement regardless of turn changes
            if (previousSteeringId && previousSteeringId !== currentSteeringId) {
                this._chatService.removePendingRequest(sessionResource, previousSteeringId);
            }
            previousSteeringId = currentSteeringId;
            const activeTurn = e.state.activeTurn;
            if (!activeTurn || activeTurn.id === lastSeenTurnId) {
                previousQueuedIds = currentQueuedIds;
                return;
            }
            lastSeenTurnId = activeTurn.id;
            // If we dispatched this turn, the existing _handleTurn flow handles it
            if (this._clientDispatchedTurnIds.has(activeTurn.id)) {
                previousQueuedIds = currentQueuedIds;
                return;
            }
            const chatSession = this._activeSessions.get(sessionResource);
            if (!chatSession) {
                previousQueuedIds = currentQueuedIds;
                return;
            }
            this._logService.info(`[AgentHost] Server-initiated turn detected: ${activeTurn.id}`);
            // Determine which queued message was consumed by diffing queue state
            if (previousQueuedIds) {
                for (const prevId of previousQueuedIds) {
                    if (!currentQueuedIds.has(prevId)) {
                        this._chatService.removePendingRequest(sessionResource, prevId);
                    }
                }
            }
            previousQueuedIds = currentQueuedIds;
            // Signal the session to create a new request+response pair
            chatSession.startServerRequest(activeTurn.userMessage.text);
            // Set up turn progress tracking — reuse the same state-to-progress
            // translation as _handleTurn, but pipe output to progressObs/isCompleteObs
            const turnStore = new DisposableStore();
            turnProgressDisposable.value = turnStore;
            this._trackServerTurnProgress(backendSession, activeTurn.id, chatSession, turnStore);
        }));
        this._serverTurnWatchers.set(sessionResource, disposables);
    }
    /**
     * Tracks protocol state changes for a specific server-initiated turn and
     * pushes `IChatProgress[]` items into the session's `progressObs`.
     * When the turn finishes, sets `isCompleteObs` to true.
     */
    _trackServerTurnProgress(backendSession, turnId, chatSession, turnDisposables) {
        const sessionStr = backendSession.toString();
        const activeToolInvocations = new Map();
        const lastEmittedLengths = new Map();
        const throttler = new Throttler();
        turnDisposables.add(throttler);
        const progress = (parts) => {
            const current = chatSession.progressObs.get();
            chatSession.progressObs.set([...current, ...parts], undefined);
        };
        let finished = false;
        const finish = () => throttler.queue(async () => {
            if (finished) {
                return;
            }
            finished = true;
            for (const [, invocation] of activeToolInvocations) {
                if (!IChatToolInvocation.isComplete(invocation)) {
                    invocation.didExecuteTool(undefined);
                }
            }
            activeToolInvocations.clear();
            chatSession.isCompleteObs.set(true, undefined);
        });
        const processState = (sessionState) => {
            if (finished) {
                return;
            }
            const activeTurn = sessionState.activeTurn;
            const isActive = activeTurn?.id === turnId;
            const responseParts = isActive
                ? activeTurn.responseParts
                : sessionState.turns.find(t => t.id === turnId)?.responseParts;
            if (responseParts) {
                for (const rp of responseParts) {
                    switch (rp.kind) {
                        case "markdown" /* ResponsePartKind.Markdown */: {
                            const lastLen = lastEmittedLengths.get(rp.id) ?? 0;
                            if (rp.content.length > lastLen) {
                                const delta = rp.content.substring(lastLen);
                                lastEmittedLengths.set(rp.id, rp.content.length);
                                progress([{ kind: 'markdownContent', content: new MarkdownString(delta, { supportHtml: true }) }]);
                            }
                            break;
                        }
                        case "reasoning" /* ResponsePartKind.Reasoning */: {
                            const lastLen = lastEmittedLengths.get(rp.id) ?? 0;
                            if (rp.content.length > lastLen) {
                                const delta = rp.content.substring(lastLen);
                                lastEmittedLengths.set(rp.id, rp.content.length);
                                progress([{ kind: 'thinking', value: delta }]);
                            }
                            break;
                        }
                        case "toolCall" /* ResponsePartKind.ToolCall */: {
                            const tc = rp.toolCall;
                            const toolCallId = tc.toolCallId;
                            let existing = activeToolInvocations.get(toolCallId);
                            if (!existing) {
                                existing = toolCallStateToInvocation(tc);
                                activeToolInvocations.set(toolCallId, existing);
                                progress([existing]);
                                if (tc.status === "pending-confirmation" /* ToolCallStatus.PendingConfirmation */) {
                                    this._awaitToolConfirmation(existing, toolCallId, backendSession, turnId, CancellationToken.None);
                                }
                            }
                            else if (tc.status === "pending-confirmation" /* ToolCallStatus.PendingConfirmation */) {
                                // Running → PendingConfirmation (re-confirmation).
                                // Only replace if the existing invocation is not already
                                // waiting for confirmation (avoids flickering on duplicate
                                // state change events).
                                const existingState = existing.state.get();
                                if (existingState.type !== 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */) {
                                    existing.didExecuteTool(undefined);
                                    const confirmInvocation = toolCallStateToInvocation(tc);
                                    activeToolInvocations.set(toolCallId, confirmInvocation);
                                    progress([confirmInvocation]);
                                    this._awaitToolConfirmation(confirmInvocation, toolCallId, backendSession, turnId, CancellationToken.None);
                                }
                            }
                            else if (tc.status === "running" /* ToolCallStatus.Running */) {
                                existing.invocationMessage = typeof tc.invocationMessage === 'string'
                                    ? tc.invocationMessage
                                    : new MarkdownString(tc.invocationMessage.markdown);
                                if (getToolKind(tc) === 'terminal' && tc.toolInput) {
                                    existing.toolSpecificData = {
                                        kind: 'terminal',
                                        commandLine: { original: tc.toolInput },
                                        language: getToolLanguage(tc) ?? 'shellscript',
                                    };
                                }
                            }
                            if (existing && (tc.status === "completed" /* ToolCallStatus.Completed */ || tc.status === "cancelled" /* ToolCallStatus.Cancelled */) && !IChatToolInvocation.isComplete(existing)) {
                                finalizeToolInvocation(existing, tc);
                            }
                            break;
                        }
                    }
                }
            }
            if (!isActive && !finished) {
                const lastTurn = sessionState.turns.find(t => t.id === turnId);
                if (lastTurn?.state === "error" /* TurnState.Error */ && lastTurn.error) {
                    progress([{ kind: 'markdownContent', content: new MarkdownString(`\n\nError: (${lastTurn.error.errorType}) ${lastTurn.error.message}`) }]);
                }
                finish();
            }
        };
        turnDisposables.add(this._clientState.onDidChangeSessionState(e => {
            if (e.session !== sessionStr) {
                return;
            }
            throttler.queue(async () => processState(e.state));
        }));
        // Immediately reconcile against the current state to close any gap
        // between turn detection and listener registration. The state change
        // that triggered server-initiated turn detection may already contain
        // response parts (e.g. markdown content) that arrived in the same batch.
        const currentState = this._clientState.getSessionState(sessionStr);
        if (currentState) {
            throttler.queue(async () => processState(currentState));
        }
    }
    // ---- Turn handling (state-driven) ---------------------------------------
    async _handleTurn(session, request, progress, cancellationToken) {
        if (cancellationToken.isCancellationRequested) {
            return;
        }
        const turnId = request.requestId;
        this._clientDispatchedTurnIds.add(turnId);
        const cleanUpTurnId = () => this._clientDispatchedTurnIds.delete(turnId);
        const attachments = this._convertVariablesToAttachments(request);
        const messageAttachments = attachments.map(a => ({
            type: a.type,
            path: a.path,
            displayName: a.displayName,
        }));
        // If the user selected a different model since the session was created
        // (or since the last turn), dispatch a model change action first so the
        // agent backend picks up the new model before processing the turn.
        const rawModelId = this._extractRawModelId(request.userSelectedModelId);
        if (rawModelId) {
            const currentModel = this._clientState.getSessionState(session.toString())?.summary.model;
            if (currentModel !== rawModelId) {
                const modelAction = {
                    type: "session/modelChanged" /* ActionType.SessionModelChanged */,
                    session: session.toString(),
                    model: rawModelId,
                };
                const modelSeq = this._clientState.applyOptimistic(modelAction);
                this._config.connection.dispatchAction(modelAction, this._clientState.clientId, modelSeq);
            }
        }
        // If the chat model has fewer previous requests than the protocol has
        // turns, a checkpoint was restored or a message was edited. Dispatch
        // session/truncated so the server drops the stale tail.
        const chatModel = this._chatService.getSession(request.sessionResource);
        const protocolState = this._clientState.getSessionState(session.toString());
        if (chatModel && protocolState && protocolState.turns.length > 0) {
            // -2 since -1 will already be the current request
            const previousRequestIndex = chatModel.getRequests().findIndex(i => i.id === request.requestId) - 1;
            const previousRequest = previousRequestIndex >= 0 ? chatModel.getRequests()[previousRequestIndex] : undefined;
            if (!previousRequest && protocolState.turns.length > 0) {
                const truncateAction = {
                    type: "session/truncated" /* ActionType.SessionTruncated */,
                    session: session.toString(),
                };
                const truncateSeq = this._clientState.applyOptimistic(truncateAction);
                this._config.connection.dispatchAction(truncateAction, this._clientState.clientId, truncateSeq);
            }
            else {
                const seenAtIndex = protocolState.turns.findIndex(t => t.id === previousRequest.id);
                if (seenAtIndex !== -1 && seenAtIndex < protocolState.turns.length - 1) {
                    const truncateAction = {
                        type: "session/truncated" /* ActionType.SessionTruncated */,
                        session: session.toString(),
                        turnId: previousRequest.id,
                    };
                    const truncateSeq = this._clientState.applyOptimistic(truncateAction);
                    this._config.connection.dispatchAction(truncateAction, this._clientState.clientId, truncateSeq);
                }
            }
        }
        // Dispatch session/turnStarted — the server will call sendMessage on
        // the provider as a side effect.
        const turnAction = {
            type: "session/turnStarted" /* ActionType.SessionTurnStarted */,
            session: session.toString(),
            turnId,
            userMessage: {
                text: request.message,
                attachments: messageAttachments.length > 0 ? messageAttachments : undefined,
            },
        };
        const clientSeq = this._clientState.applyOptimistic(turnAction);
        this._config.connection.dispatchAction(turnAction, this._clientState.clientId, clientSeq);
        // Ensure the editing session records a sentinel checkpoint for this
        // request so it appears in requestDisablement even if the turn
        // produces no file edits.
        this._ensureEditingSession(request.sessionResource)
            ?.ensureRequestCheckpoint(request.requestId);
        // Track live ChatToolInvocation objects for this turn
        const activeToolInvocations = new Map();
        // Track last-emitted content lengths per response part to compute deltas
        const lastEmittedLengths = new Map();
        const turnDisposables = new DisposableStore();
        // We throttle updates because generation of edits is async, if this breaks
        // layouts if they are not sequenced correctly.
        const throttler = new Throttler();
        turnDisposables.add(throttler);
        let resolveDone;
        const done = new Promise(resolve => { resolveDone = resolve; });
        let finished = false;
        const finish = () => throttler.queue(async () => {
            if (finished) {
                return;
            }
            finished = true;
            cleanUpTurnId();
            // Finalize any outstanding tool invocations
            for (const [, invocation] of activeToolInvocations) {
                invocation.didExecuteTool(undefined);
            }
            activeToolInvocations.clear();
            turnDisposables.dispose();
            resolveDone();
        });
        // Listen to state changes and translate to IChatProgress[]
        turnDisposables.add(this._clientState.onDidChangeSessionState(e => {
            throttler.queue(async () => {
                if (e.session !== session.toString() || cancellationToken.isCancellationRequested) {
                    return;
                }
                // Find response parts for our turn — either from the active
                // turn or from the finalized turn in the history array.
                const activeTurn = e.state.activeTurn;
                const isActive = activeTurn?.id === turnId;
                const responseParts = isActive
                    ? activeTurn.responseParts
                    : e.state.turns.find(t => t.id === turnId)?.responseParts;
                if (responseParts) {
                    for (const rp of responseParts) {
                        switch (rp.kind) {
                            case "markdown" /* ResponsePartKind.Markdown */: {
                                const lastLen = lastEmittedLengths.get(rp.id) ?? 0;
                                if (rp.content.length > lastLen) {
                                    const delta = rp.content.substring(lastLen);
                                    lastEmittedLengths.set(rp.id, rp.content.length);
                                    // supportHtml is load bearing. Without this the markdown string
                                    // gets merged into the edit part in chatModel.ts which breaks
                                    // rendering because the thinking content part does not deal with this.
                                    progress([{ kind: 'markdownContent', content: new MarkdownString(delta, { supportHtml: true }) }]);
                                }
                                break;
                            }
                            case "reasoning" /* ResponsePartKind.Reasoning */: {
                                const lastLen = lastEmittedLengths.get(rp.id) ?? 0;
                                if (rp.content.length > lastLen) {
                                    const delta = rp.content.substring(lastLen);
                                    lastEmittedLengths.set(rp.id, rp.content.length);
                                    progress([{ kind: 'thinking', value: delta }]);
                                }
                                break;
                            }
                            case "toolCall" /* ResponsePartKind.ToolCall */: {
                                const tc = rp.toolCall;
                                const toolCallId = tc.toolCallId;
                                let existing = activeToolInvocations.get(toolCallId);
                                if (!existing) {
                                    // First time seeing this tool call — create an invocation
                                    existing = toolCallStateToInvocation(tc);
                                    activeToolInvocations.set(toolCallId, existing);
                                    progress([existing]);
                                    if (tc.status === "pending-confirmation" /* ToolCallStatus.PendingConfirmation */) {
                                        this._awaitToolConfirmation(existing, toolCallId, session, turnId, cancellationToken);
                                    }
                                }
                                else if (tc.status === "pending-confirmation" /* ToolCallStatus.PendingConfirmation */) {
                                    // Running → PendingConfirmation (re-confirmation).
                                    const existingState = existing.state.get();
                                    if (existingState.type !== 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */) {
                                        existing.didExecuteTool(undefined);
                                        const confirmInvocation = toolCallStateToInvocation(tc);
                                        activeToolInvocations.set(toolCallId, confirmInvocation);
                                        progress([confirmInvocation]);
                                        this._awaitToolConfirmation(confirmInvocation, toolCallId, session, turnId, cancellationToken);
                                    }
                                }
                                else if (tc.status === "running" /* ToolCallStatus.Running */) {
                                    // Streaming → Running: update with now-available parameters.
                                    existing.invocationMessage = typeof tc.invocationMessage === 'string'
                                        ? tc.invocationMessage
                                        : new MarkdownString(tc.invocationMessage.markdown);
                                    if (getToolKind(tc) === 'terminal' && tc.toolInput) {
                                        existing.toolSpecificData = {
                                            kind: 'terminal',
                                            commandLine: { original: tc.toolInput },
                                            language: getToolLanguage(tc) ?? 'shellscript',
                                        };
                                    }
                                }
                                // Finalize terminal-state tools (whether just created or pre-existing)
                                if (existing && (tc.status === "completed" /* ToolCallStatus.Completed */ || tc.status === "cancelled" /* ToolCallStatus.Cancelled */) && !IChatToolInvocation.isComplete(existing)) {
                                    const fileEdits = finalizeToolInvocation(existing, tc);
                                    if (fileEdits.length > 0) {
                                        const editParts = this._hydrateFileEdits(request.sessionResource, request.requestId, tc);
                                        if (editParts.length > 0) {
                                            progress(editParts);
                                        }
                                    }
                                }
                                break;
                            }
                        }
                    }
                }
                // If the turn is no longer active, emit any error and finish.
                if (!isActive) {
                    const lastTurn = e.state.turns.find(t => t.id === turnId);
                    if (lastTurn?.state === "error" /* TurnState.Error */ && lastTurn.error) {
                        progress([{ kind: 'markdownContent', content: new MarkdownString(`\n\nError: (${lastTurn.error.errorType}) ${lastTurn.error.message}`) }]);
                    }
                    if (!finished) {
                        finish();
                    }
                }
            });
        }));
        turnDisposables.add(cancellationToken.onCancellationRequested(() => {
            this._logService.info(`[AgentHost] Cancellation requested for ${session.toString()}, dispatching turnCancelled`);
            const cancelAction = {
                type: "session/turnCancelled" /* ActionType.SessionTurnCancelled */,
                session: session.toString(),
                turnId,
            };
            const seq = this._clientState.applyOptimistic(cancelAction);
            this._config.connection.dispatchAction(cancelAction, this._clientState.clientId, seq);
            finish();
        }));
        await done;
    }
    // ---- Tool confirmation --------------------------------------------------
    /**
     * Awaits user confirmation on a PendingConfirmation tool call invocation
     * and dispatches `SessionToolCallConfirmed` back to the server.
     */
    _awaitToolConfirmation(invocation, toolCallId, session, turnId, cancellationToken) {
        IChatToolInvocation.awaitConfirmation(invocation, cancellationToken).then(reason => {
            const approved = reason.type !== 0 /* ToolConfirmKind.Denied */ && reason.type !== 5 /* ToolConfirmKind.Skipped */;
            this._logService.info(`[AgentHost] Tool confirmation: toolCallId=${toolCallId}, approved=${approved}`);
            if (approved) {
                const confirmAction = {
                    type: "session/toolCallConfirmed" /* ActionType.SessionToolCallConfirmed */,
                    session: session.toString(),
                    turnId,
                    toolCallId,
                    approved: true,
                    confirmed: "user-action" /* ToolCallConfirmationReason.UserAction */,
                };
                const seq = this._clientState.applyOptimistic(confirmAction);
                this._config.connection.dispatchAction(confirmAction, this._clientState.clientId, seq);
            }
            else {
                const denyAction = {
                    type: "session/toolCallConfirmed" /* ActionType.SessionToolCallConfirmed */,
                    session: session.toString(),
                    turnId,
                    toolCallId,
                    approved: false,
                    reason: "denied" /* ToolCallCancellationReason.Denied */,
                };
                const seq = this._clientState.applyOptimistic(denyAction);
                this._config.connection.dispatchAction(denyAction, this._clientState.clientId, seq);
            }
        }).catch(err => {
            this._logService.warn(`[AgentHost] Tool confirmation failed for toolCallId=${toolCallId}`, err);
        });
    }
    // ---- Reconnection to active turn ----------------------------------------
    /**
     * Wires up an ongoing state listener that streams incremental progress
     * from an already-running turn into the chat session's progressObs.
     * This is the reconnection counterpart of {@link _handleTurn}, which
     * handles newly-initiated turns.
     */
    _reconnectToActiveTurn(backendSession, turnId, chatSession, initialProgress) {
        const sessionKey = backendSession.toString();
        // Extract live ChatToolInvocation objects from the initial progress
        // array so we can update/finalize the same instances the chat UI holds.
        const activeToolInvocations = new Map();
        for (const item of initialProgress) {
            if (item instanceof ChatToolInvocation) {
                activeToolInvocations.set(item.toolCallId, item);
            }
        }
        // Track last-emitted content lengths per response part to compute deltas.
        // Seed from the current state so we only emit new content beyond what
        // activeTurnToProgress already captured.
        const lastEmittedLengths = new Map();
        const currentState = this._clientState.getSessionState(sessionKey);
        if (currentState?.activeTurn) {
            for (const rp of currentState.activeTurn.responseParts) {
                if (rp.kind === "markdown" /* ResponsePartKind.Markdown */ || rp.kind === "reasoning" /* ResponsePartKind.Reasoning */) {
                    lastEmittedLengths.set(rp.id, rp.content.length);
                }
            }
        }
        const reconnectDisposables = chatSession.registerDisposable(new DisposableStore());
        const throttler = new Throttler();
        reconnectDisposables.add(throttler);
        // Set up the interrupt callback so the user can actually cancel the
        // remote turn. This dispatches session/turnCancelled to the server.
        chatSession.interruptActiveResponseCallback = async () => {
            this._logService.info(`[AgentHost] Reconnect cancellation requested for ${sessionKey}, dispatching turnCancelled`);
            const cancelAction = {
                type: "session/turnCancelled" /* ActionType.SessionTurnCancelled */,
                session: sessionKey,
                turnId,
            };
            const seq = this._clientState.applyOptimistic(cancelAction);
            this._config.connection.dispatchAction(cancelAction, this._clientState.clientId, seq);
            return true;
        };
        // Wire up awaitConfirmation for tool calls that were already pending
        // confirmation at snapshot time so the user can approve/deny them.
        const cts = new CancellationTokenSource();
        reconnectDisposables.add(toDisposable(() => cts.dispose(true)));
        for (const [toolCallId, invocation] of activeToolInvocations) {
            if (!IChatToolInvocation.isComplete(invocation)) {
                this._awaitToolConfirmation(invocation, toolCallId, backendSession, turnId, cts.token);
            }
        }
        // Process state changes from the protocol layer.
        const processStateChange = (sessionState) => {
            const activeTurn = sessionState.activeTurn;
            const isActive = activeTurn?.id === turnId;
            const responseParts = isActive
                ? activeTurn.responseParts
                : sessionState.turns.find(t => t.id === turnId)?.responseParts;
            if (responseParts) {
                for (const rp of responseParts) {
                    switch (rp.kind) {
                        case "markdown" /* ResponsePartKind.Markdown */: {
                            const lastLen = lastEmittedLengths.get(rp.id) ?? 0;
                            if (rp.content.length > lastLen) {
                                const delta = rp.content.substring(lastLen);
                                lastEmittedLengths.set(rp.id, rp.content.length);
                                chatSession.appendProgress([{ kind: 'markdownContent', content: new MarkdownString(delta, { supportHtml: true }) }]);
                            }
                            break;
                        }
                        case "reasoning" /* ResponsePartKind.Reasoning */: {
                            const lastLen = lastEmittedLengths.get(rp.id) ?? 0;
                            if (rp.content.length > lastLen) {
                                const delta = rp.content.substring(lastLen);
                                lastEmittedLengths.set(rp.id, rp.content.length);
                                chatSession.appendProgress([{ kind: 'thinking', value: delta }]);
                            }
                            break;
                        }
                        case "toolCall" /* ResponsePartKind.ToolCall */: {
                            const tc = rp.toolCall;
                            const toolCallId = tc.toolCallId;
                            let existing = activeToolInvocations.get(toolCallId);
                            if (!existing) {
                                existing = toolCallStateToInvocation(tc);
                                activeToolInvocations.set(toolCallId, existing);
                                chatSession.appendProgress([existing]);
                                if (tc.status === "pending-confirmation" /* ToolCallStatus.PendingConfirmation */) {
                                    this._awaitToolConfirmation(existing, toolCallId, backendSession, turnId, cts.token);
                                }
                            }
                            else if (tc.status === "pending-confirmation" /* ToolCallStatus.PendingConfirmation */) {
                                // Running -> PendingConfirmation (re-confirmation).
                                const existingState = existing.state.get();
                                if (existingState.type !== 1 /* IChatToolInvocation.StateKind.WaitingForConfirmation */) {
                                    existing.didExecuteTool(undefined);
                                    const confirmInvocation = toolCallStateToInvocation(tc);
                                    activeToolInvocations.set(toolCallId, confirmInvocation);
                                    chatSession.appendProgress([confirmInvocation]);
                                    this._awaitToolConfirmation(confirmInvocation, toolCallId, backendSession, turnId, cts.token);
                                }
                            }
                            else if (tc.status === "running" /* ToolCallStatus.Running */) {
                                existing.invocationMessage = typeof tc.invocationMessage === 'string'
                                    ? tc.invocationMessage
                                    : new MarkdownString(tc.invocationMessage.markdown);
                                if (getToolKind(tc) === 'terminal' && tc.toolInput) {
                                    existing.toolSpecificData = {
                                        kind: 'terminal',
                                        commandLine: { original: tc.toolInput },
                                        language: getToolLanguage(tc) ?? 'shellscript',
                                    };
                                }
                            }
                            // Finalize terminal-state tools
                            if (existing && (tc.status === "completed" /* ToolCallStatus.Completed */ || tc.status === "cancelled" /* ToolCallStatus.Cancelled */) && !IChatToolInvocation.isComplete(existing)) {
                                finalizeToolInvocation(existing, tc);
                                // Note: file edits from reconnection are not routed through
                                // the editing session pipeline as there is no active request
                                // context. The edits already happened on the remote.
                            }
                            break;
                        }
                    }
                }
            }
            // If the turn is no longer active, emit any error and finish.
            if (!isActive) {
                const lastTurn = sessionState.turns.find(t => t.id === turnId);
                if (lastTurn?.state === "error" /* TurnState.Error */ && lastTurn.error) {
                    chatSession.appendProgress([{
                            kind: 'markdownContent',
                            content: new MarkdownString(`\n\nError: (${lastTurn.error.errorType}) ${lastTurn.error.message}`),
                        }]);
                }
                chatSession.complete();
                reconnectDisposables.dispose();
            }
        };
        // Attach the ongoing state listener
        reconnectDisposables.add(this._clientState.onDidChangeSessionState(e => {
            if (e.session !== sessionKey) {
                return;
            }
            throttler.queue(async () => processStateChange(e.state));
        }));
        // Immediately reconcile against the current state to close any gap
        // between snapshot time and listener registration. If the turn already
        // completed in the interim, this will mark the session complete.
        const latestState = this._clientState.getSessionState(sessionKey);
        if (latestState) {
            processStateChange(latestState);
        }
    }
    // ---- File edit routing ---------------------------------------------------
    /**
     * Ensures the chat model has an editing session and returns it if it's an
     * {@link AgentHostEditingSession}. The editing session is created via the
     * provider registered in the constructor if one doesn't exist yet.
     */
    _ensureEditingSession(sessionResource) {
        const chatModel = this._chatService.getSession(sessionResource);
        if (!chatModel) {
            return undefined;
        }
        // Start the editing session if not already started — this will use
        // our registered provider to create an AgentHostEditingSession.
        if (!chatModel.editingSession) {
            chatModel.startEditingSession();
        }
        const editingSession = chatModel.editingSession;
        if (!(editingSession instanceof AgentHostEditingSession)) {
            return undefined;
        }
        // Hydrate from historical turns if this is the first time
        // the editing session is accessed for this chat session.
        const pendingTurns = this._pendingHistoryTurns.get(sessionResource);
        if (pendingTurns) {
            this._pendingHistoryTurns.delete(sessionResource);
            for (const turn of pendingTurns) {
                for (const rp of turn.responseParts) {
                    if (rp.kind === "toolCall" /* ResponsePartKind.ToolCall */) {
                        editingSession.addToolCallEdits(turn.id, rp.toolCall);
                    }
                }
            }
        }
        return editingSession;
    }
    /**
     * Hydrates the editing session with file edits from a completed tool call
     * and returns progress parts for the file edit pills.
     */
    _hydrateFileEdits(sessionResource, requestId, tc) {
        const editingSession = this._ensureEditingSession(sessionResource);
        if (editingSession) {
            return editingSession.addToolCallEdits(requestId, tc);
        }
        return [];
    }
    // ---- Session resolution -------------------------------------------------
    /** Maps a UI session resource to a backend provider URI. */
    _resolveSessionUri(sessionResource) {
        const rawId = sessionResource.path.substring(1);
        return AgentSession.uri(this._config.provider, rawId);
    }
    /**
     * Forks a session at the given request point by creating a new backend
     * session with the `fork` parameter. Returns an {@link IChatSessionItem}
     * pointing to the newly created session.
     */
    async _forkSession(sessionResource, backendSession, request, token) {
        if (token.isCancellationRequested) {
            throw new Error('Cancelled');
        }
        // Determine the turn index to fork at. If a specific request is
        // provided, fork BEFORE it (keeping turns up to the previous one).
        // This matches the non-contributed path in ForkConversationAction
        // which uses `requestIndex - 1`. If no request is provided, fork
        // the entire session.
        const protocolState = this._clientState.getSessionState(backendSession.toString());
        let turnIndex;
        if (request) {
            const requestIdx = protocolState?.turns.findIndex(t => t.id === request.id);
            if (requestIdx === undefined || requestIdx < 0) {
                throw new Error(`Cannot fork: turn for request ${request.id} not found in protocol state`);
            }
            // Fork before this request — keep turns [0..requestIdx-1]
            turnIndex = requestIdx - 1;
            if (turnIndex < 0) {
                throw new Error('Cannot fork: cannot fork before the first request');
            }
        }
        else if (protocolState && protocolState.turns.length > 0) {
            turnIndex = protocolState.turns.length - 1;
        }
        if (turnIndex === undefined) {
            throw new Error('Cannot fork: no turns to fork from');
        }
        const chatModel = this._chatService.getSession(sessionResource);
        const forkedSession = await this._createAndSubscribe(sessionResource, undefined, {
            session: backendSession,
            turnIndex,
        });
        const forkedRawId = AgentSession.id(forkedSession);
        const forkedResource = URI.from({ scheme: this._config.sessionType, path: `/${forkedRawId}` });
        const now = Date.now();
        return {
            resource: forkedResource,
            label: chatModel?.title
                ? localize('chat.forked.title', "Forked: {0}", chatModel.title)
                : localize('chat.forked.fallbackTitle', "Forked Session"),
            iconPath: getAgentHostIcon(this._productService),
            timing: { created: now, lastRequestStarted: now, lastRequestEnded: now },
        };
    }
    /** Creates a new backend session and subscribes to its state. */
    async _createAndSubscribe(sessionResource, modelId, fork) {
        const rawModelId = this._extractRawModelId(modelId);
        const resourceKey = sessionResource.path.substring(1);
        const workingDirectory = this._config.resolveWorkingDirectory?.(resourceKey)
            ?? this._workspaceContextService.getWorkspace().folders[0]?.uri;
        this._logService.trace(`[AgentHost] Creating new session, model=${rawModelId ?? '(default)'}, provider=${this._config.provider}${fork ? `, fork from ${fork.session.toString()} at index ${fork.turnIndex}` : ''}`);
        let session;
        try {
            session = await this._config.connection.createSession({
                model: rawModelId,
                provider: this._config.provider,
                workingDirectory,
                fork,
            });
        }
        catch (err) {
            // If authentication is required, try to resolve it and retry once
            if (this._isAuthRequiredError(err) && this._config.resolveAuthentication) {
                this._logService.info('[AgentHost] Authentication required, prompting user...');
                const authenticated = await this._config.resolveAuthentication();
                if (authenticated) {
                    session = await this._config.connection.createSession({
                        model: rawModelId,
                        provider: this._config.provider,
                        workingDirectory,
                        fork,
                    });
                }
                else {
                    throw new Error(localize('agentHost.authRequired', "Authentication is required to start a session. Please sign in and try again."));
                }
            }
            else {
                throw err;
            }
        }
        this._logService.trace(`[AgentHost] Created session: ${session.toString()}`);
        // Subscribe to the new session's state
        try {
            const snapshot = await this._config.connection.subscribe(session);
            this._clientState.handleSnapshot(session.toString(), snapshot.state, snapshot.fromSeq);
        }
        catch (err) {
            this._logService.error(`[AgentHost] Failed to subscribe to new session: ${session.toString()}`, err);
        }
        // Claim the active client role with current customizations
        const customizations = this._config.customizations?.get() ?? [];
        this._dispatchActiveClient(session, customizations);
        // Start syncing the chat model's pending requests to the protocol
        this._ensurePendingMessageSubscription(sessionResource, session);
        // Start watching for server-initiated turns on this session
        this._watchForServerInitiatedTurns(session, sessionResource);
        return session;
    }
    /**
     * Ensures that the chat model's pending request changes are synced to the
     * protocol for a given session. No-ops if already subscribed.
     */
    _ensurePendingMessageSubscription(sessionResource, backendSession) {
        if (this._pendingMessageSubscriptions.has(sessionResource)) {
            return;
        }
        const chatModel = this._chatService?.getSession(sessionResource);
        if (chatModel) {
            this._pendingMessageSubscriptions.set(sessionResource, chatModel.onDidChangePendingRequests(() => {
                this._syncPendingMessages(sessionResource, backendSession);
            }));
        }
    }
    /**
     * Check if an error is an "authentication required" error.
     * Checks for the AHP_AUTH_REQUIRED error code when available,
     * with a message-based fallback for transports that don't preserve
     * structured error codes (e.g. ProxyChannel).
     */
    _isAuthRequiredError(err) {
        if (err instanceof ProtocolError && err.code === AHP_AUTH_REQUIRED) {
            return true;
        }
        if (err instanceof Error && err.message.includes('Authentication required')) {
            return true;
        }
        return false;
    }
    /**
     * Extracts the raw model id from a language-model service identifier.
     * E.g. "agent-host-copilot:claude-sonnet-4-20250514" → "claude-sonnet-4-20250514".
     */
    _extractRawModelId(languageModelIdentifier) {
        if (!languageModelIdentifier) {
            return undefined;
        }
        const prefix = this._config.sessionType + ':';
        if (languageModelIdentifier.startsWith(prefix)) {
            return languageModelIdentifier.substring(prefix.length);
        }
        return languageModelIdentifier;
    }
    _convertVariablesToAttachments(request) {
        const attachments = [];
        for (const v of request.variables.variables) {
            if (v.kind === 'file') {
                const uri = v.value instanceof URI ? v.value : undefined;
                if (uri?.scheme === 'file') {
                    attachments.push({ type: "file" /* AttachmentType.File */, path: uri.fsPath, displayName: v.name });
                }
            }
            else if (v.kind === 'directory') {
                const uri = v.value instanceof URI ? v.value : undefined;
                if (uri?.scheme === 'file') {
                    attachments.push({ type: "directory" /* AttachmentType.Directory */, path: uri.fsPath, displayName: v.name });
                }
            }
            else if (v.kind === 'implicit' && v.isSelection) {
                const uri = v.uri;
                if (uri?.scheme === 'file') {
                    attachments.push({ type: "selection" /* AttachmentType.Selection */, path: uri.fsPath, displayName: v.name });
                }
            }
        }
        if (attachments.length > 0) {
            this._logService.trace(`[AgentHost] Converted ${attachments.length} attachments from ${request.variables.variables.length} variables`);
        }
        return attachments;
    }
    // ---- Lifecycle ----------------------------------------------------------
    dispose() {
        for (const [, session] of this._activeSessions) {
            session.dispose();
        }
        this._activeSessions.clear();
        this._sessionToBackend.clear();
        super.dispose();
    }
};
AgentHostSessionHandler = __decorate([
    __param(1, IChatAgentService),
    __param(2, IChatService),
    __param(3, IChatEditingService),
    __param(4, ILogService),
    __param(5, IProductService),
    __param(6, IWorkspaceContextService),
    __param(7, IInstantiationService)
], AgentHostSessionHandler);
export { AgentHostSessionHandler };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzNHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxVQUFVLEVBQUUscUJBQXFCLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBb0IsTUFBTSw0Q0FBNEMsQ0FBQztBQUNuSyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbkUsT0FBTyxFQUFFLE9BQU8sRUFBZSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNwRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDckUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNwRCxPQUFPLEVBQWlCLFlBQVksRUFBMkMsTUFBTSw2REFBNkQsQ0FBQztBQUduSixPQUFPLEVBQWMsZUFBZSxFQUF1QixNQUFNLHFFQUFxRSxDQUFDO0FBQ3ZJLE9B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