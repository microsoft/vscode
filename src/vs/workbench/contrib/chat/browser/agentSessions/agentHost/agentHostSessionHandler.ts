/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Throttler } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableResourceMap, DisposableStore, MutableDisposable, toDisposable, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { AgentProvider, AgentSession, IAgentAttachment, type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { ActionType, isSessionAction, type ISessionAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { SessionClientState } from '../../../../../../platform/agentHost/common/state/sessionClientState.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { getToolKind, getToolLanguage } from '../../../../../../platform/agentHost/common/state/sessionReducers.js';
import { AttachmentType, getToolFileEdits, PendingMessageKind, ResponsePartKind, ToolCallCancellationReason, ToolCallConfirmationReason, ToolCallStatus, TurnState, type IMessageAttachment, type ISessionState, type IToolCallState, type ITurn } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { ChatRequestQueueKind, IChatProgress, IChatService, IChatToolInvocation, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { IChatSession, IChatSessionContentProvider, IChatSessionHistoryItem } from '../../../common/chatSessionsService.js';
import { ChatAgentLocation, ChatModeKind } from '../../../common/constants.js';
import { IChatEditingService } from '../../../common/editing/chatEditingService.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { IChatAgentData, IChatAgentImplementation, IChatAgentRequest, IChatAgentResult, IChatAgentService } from '../../../common/participants/chatAgents.js';
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

class AgentHostChatSession extends Disposable implements IChatSession {
	readonly progressObs = observableValue<IChatProgress[]>('agentHostProgress', []);
	readonly isCompleteObs = observableValue<boolean>('agentHostComplete', true);

	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;

	private readonly _onDidStartServerRequest = this._register(new Emitter<{ prompt: string }>());
	readonly onDidStartServerRequest = this._onDidStartServerRequest.event;

	readonly requestHandler: IChatSession['requestHandler'];
	interruptActiveResponseCallback: IChatSession['interruptActiveResponseCallback'];

	constructor(
		readonly sessionResource: URI,
		readonly history: readonly IChatSessionHistoryItem[],
		private readonly _sendRequest: (request: IChatAgentRequest, progress: (parts: IChatProgress[]) => void, token: CancellationToken) => Promise<void>,
		initialProgress: IChatProgress[] | undefined,
		onDispose: () => void,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

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
	}

	/**
	 * Registers a disposable to be cleaned up when this session is disposed.
	 */
	registerDisposable<T extends IDisposable>(disposable: T): T {
		return this._register(disposable);
	}

	/**
	 * Appends new progress items to the observable. Used by the reconnection
	 * flow to stream ongoing state changes into the chat UI.
	 */
	appendProgress(items: IChatProgress[]): void {
		const current = this.progressObs.get();
		this.progressObs.set([...current, ...items], undefined);
	}

	/**
	 * Marks the active turn as complete.
	 */
	complete(): void {
		this.isCompleteObs.set(true, undefined);
	}

	/**
	 * Called by the session handler when a server-initiated turn starts.
	 * Resets the progress observable and signals listeners to create a new
	 * request+response pair in the chat model.
	 */
	startServerRequest(prompt: string): void {
		this._logService.info('[AgentHost] Server-initiated request started');
		this.progressObs.set([], undefined);
		this.isCompleteObs.set(false, undefined);
		this._onDidStartServerRequest.fire({ prompt });
	}
}

// =============================================================================
// Session handler
// =============================================================================

export interface IAgentHostSessionHandlerConfig {
	readonly provider: AgentProvider;
	readonly agentId: string;
	readonly sessionType: string;
	readonly fullName: string;
	readonly description: string;
	/** The agent connection to use for this handler. */
	readonly connection: IAgentConnection;
	/** Sanitized connection authority for constructing vscode-agent-host:// URIs. */
	readonly connectionAuthority: string;
	/** Extension identifier for the registered agent. Defaults to 'vscode.agent-host'. */
	readonly extensionId?: string;
	/** Extension display name for the registered agent. Defaults to 'Agent Host'. */
	readonly extensionDisplayName?: string;
	/**
	 * Optional callback to resolve a working directory for a new session.
	 * If not provided, falls back to the first workspace folder.
	 */
	readonly resolveWorkingDirectory?: (resourceKey: string) => URI | undefined;
	/**
	 * Optional callback invoked when the server rejects an operation because
	 * authentication is required. Should trigger interactive authentication
	 * and return true if the user authenticated successfully.
	 */
	readonly resolveAuthentication?: () => Promise<boolean>;
}

export class AgentHostSessionHandler extends Disposable implements IChatSessionContentProvider {

	private readonly _activeSessions = new ResourceMap<AgentHostChatSession>();
	/** Maps UI resource keys to resolved backend session URIs. */
	private readonly _sessionToBackend = new ResourceMap<URI>();
	/** Per-session subscription to chat model pending request changes. */
	private readonly _pendingMessageSubscriptions = this._register(new DisposableResourceMap());
	/** Per-session subscription watching for server-initiated turns. */
	private readonly _serverTurnWatchers = this._register(new DisposableResourceMap());
	/** Per-session writeFile listeners for agent host editing sessions. */
	private readonly _editingSessionListeners = this._register(new DisposableResourceMap());
	/** Historical turns with file edits, pending hydration into the editing session. */
	private readonly _pendingHistoryTurns = new ResourceMap<readonly ITurn[]>();
	/** Turn IDs dispatched by this client, used to distinguish server-originated turns. */
	private readonly _clientDispatchedTurnIds = new Set<string>();
	private readonly _config: IAgentHostSessionHandlerConfig;

	/** Client state manager shared across all sessions for this handler. */
	private readonly _clientState: SessionClientState;

	constructor(
		config: IAgentHostSessionHandlerConfig,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IChatService private readonly _chatService: IChatService,
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@ILogService private readonly _logService: ILogService,
		@IProductService private readonly _productService: IProductService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		this._config = config;

		// Create shared client state manager for this handler instance
		this._clientState = this._register(new SessionClientState(config.connection.clientId, this._logService, () => config.connection.nextClientSeq()));

		// Register an editing session provider for this handler's session type
		this._register(this._chatEditingService.registerEditingSessionProvider(
			config.sessionType,
			{
				createEditingSession: (chatSessionResource: URI) => {
					return this._instantiationService.createInstance(
						AgentHostEditingSession,
						chatSessionResource,
						config.connectionAuthority,
					);
				},
			},
		));

		// Forward action envelopes from IPC to client state
		this._register(config.connection.onDidAction(envelope => {
			if (isSessionAction(envelope.action)) {
				this._clientState.receiveEnvelope(envelope);
			}
		}));

		this._registerAgent();
	}

	async provideChatSessionContent(sessionResource: URI, _token: CancellationToken): Promise<IChatSession> {

		// For untitled (new) sessions, defer backend session creation until the
		// first request arrives so the user-selected model is available.
		// For existing sessions we resolve immediately to load history.
		let resolvedSession: URI | undefined;
		const isUntitled = sessionResource.path.substring(1).startsWith('untitled-');
		const history: IChatSessionHistoryItem[] = [];
		let initialProgress: IChatProgress[] | undefined;
		let activeTurnId: string | undefined;
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
						const hasTurnsWithEdits = sessionState.turns.some(t =>
							t.responseParts.some(rp => rp.kind === ResponsePartKind.ToolCall
								&& rp.toolCall.status === ToolCallStatus.Completed
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
			} catch (err) {
				this._logService.warn(`[AgentHost] Failed to subscribe to existing session: ${resolvedSession.toString()}`, err);
			}
		}
		const session = this._instantiationService.createInstance(
			AgentHostChatSession,
			sessionResource,
			history,
			async (request: IChatAgentRequest, progress: (parts: IChatProgress[]) => void, token: CancellationToken) => {
				const backendSession = resolvedSession ?? await this._createAndSubscribe(sessionResource, request.userSelectedModelId);
				if (!resolvedSession) {
					resolvedSession = backendSession;
					this._sessionToBackend.set(sessionResource, backendSession);
				}
				// For existing sessions, set up pending message sync on the first turn
				// (after the ChatModel becomes available in the ChatService).
				this._ensurePendingMessageSubscription(sessionResource, backendSession);
				return this._handleTurn(backendSession, request, progress, token);
			},
			initialProgress,
			() => {
				this._activeSessions.delete(sessionResource);
				this._sessionToBackend.delete(sessionResource);
				this._pendingMessageSubscriptions.deleteAndDispose(sessionResource);
				this._serverTurnWatchers.deleteAndDispose(sessionResource);
				this._editingSessionListeners.deleteAndDispose(sessionResource);
				this._pendingHistoryTurns.delete(sessionResource);
				if (resolvedSession) {
					this._clientState.unsubscribe(resolvedSession.toString());
					this._config.connection.unsubscribe(resolvedSession);
				}
			},
		);
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

	private _registerAgent(): void {
		const agentData: IChatAgentData = {
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

		const agentImpl: IChatAgentImplementation = {
			invoke: async (request, progress, _history, cancellationToken) => {
				return this._invokeAgent(request, progress, cancellationToken);
			},
		};

		this._register(this._chatAgentService.registerDynamicAgent(agentData, agentImpl));
	}

	private async _invokeAgent(
		request: IChatAgentRequest,
		progress: (parts: IChatProgress[]) => void,
		cancellationToken: CancellationToken,
	): Promise<IChatAgentResult> {
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
	private _syncPendingMessages(sessionResource: URI, backendSession: URI): void {
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
		let currentSteering: { id: string; text: string } | undefined;
		const currentQueued: { id: string; text: string }[] = [];
		for (const p of pending) {
			if (p.kind === ChatRequestQueueKind.Steering) {
				currentSteering = { id: p.request.id, text: p.request.message.text };
			} else {
				currentQueued.push({ id: p.request.id, text: p.request.message.text });
			}
		}

		// --- Steering ---
		if (currentSteering) {
			if (currentSteering.id !== prevSteering?.id) {
				this._dispatchAction({
					type: ActionType.SessionPendingMessageSet,
					session,
					kind: PendingMessageKind.Steering,
					id: currentSteering.id,
					userMessage: { text: currentSteering.text },
				});
			}
		} else if (prevSteering) {
			this._dispatchAction({
				type: ActionType.SessionPendingMessageRemoved,
				session,
				kind: PendingMessageKind.Steering,
				id: prevSteering.id,
			});
		}

		// --- Queued: removals ---
		const currentQueuedIds = new Set(currentQueued.map(q => q.id));
		for (const prev of prevQueued) {
			if (!currentQueuedIds.has(prev.id)) {
				this._dispatchAction({
					type: ActionType.SessionPendingMessageRemoved,
					session,
					kind: PendingMessageKind.Queued,
					id: prev.id,
				});
			}
		}

		// --- Queued: additions ---
		const prevQueuedIds = new Set(prevQueued.map(q => q.id));
		for (const q of currentQueued) {
			if (!prevQueuedIds.has(q.id)) {
				this._dispatchAction({
					type: ActionType.SessionPendingMessageSet,
					session,
					kind: PendingMessageKind.Queued,
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
					type: ActionType.SessionQueuedMessagesReordered,
					session,
					order: currentQueued.map(q => q.id),
				});
			}
		}
	}

	private _dispatchAction(action: ISessionAction): void {
		const seq = this._clientState.applyOptimistic(action);
		this._config.connection.dispatchAction(action, this._clientState.clientId, seq);
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
	private _watchForServerInitiatedTurns(backendSession: URI, sessionResource: URI): void {
		const sessionStr = backendSession.toString();

		// Seed from the current state so we don't treat any pre-existing active
		// turn (e.g. one being handled by _reconnectToActiveTurn) as new.
		const currentState = this._clientState.getSessionState(sessionStr);
		let lastSeenTurnId: string | undefined = currentState?.activeTurn?.id;
		let previousQueuedIds: Set<string> | undefined;
		let previousSteeringId: string | undefined = currentState?.steeringMessage?.id;

		const disposables = new DisposableStore();

		// MutableDisposable for per-turn progress tracking (replaced each turn)
		const turnProgressDisposable = new MutableDisposable<DisposableStore>();
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
	private _trackServerTurnProgress(
		backendSession: URI,
		turnId: string,
		chatSession: AgentHostChatSession,
		turnDisposables: DisposableStore,
	): void {
		const sessionStr = backendSession.toString();
		const activeToolInvocations = new Map<string, ChatToolInvocation>();
		const lastEmittedLengths = new Map<string, number>();
		const throttler = new Throttler();
		turnDisposables.add(throttler);

		const progress = (parts: IChatProgress[]) => {
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

		const processState = (sessionState: ISessionState) => {
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
						case ResponsePartKind.Markdown: {
							const lastLen = lastEmittedLengths.get(rp.id) ?? 0;
							if (rp.content.length > lastLen) {
								const delta = rp.content.substring(lastLen);
								lastEmittedLengths.set(rp.id, rp.content.length);
								progress([{ kind: 'markdownContent', content: new MarkdownString(delta, { supportHtml: true }) }]);
							}
							break;
						}
						case ResponsePartKind.Reasoning: {
							const lastLen = lastEmittedLengths.get(rp.id) ?? 0;
							if (rp.content.length > lastLen) {
								const delta = rp.content.substring(lastLen);
								lastEmittedLengths.set(rp.id, rp.content.length);
								progress([{ kind: 'thinking', value: delta }]);
							}
							break;
						}
						case ResponsePartKind.ToolCall: {
							const tc = rp.toolCall;
							const toolCallId = tc.toolCallId;
							let existing = activeToolInvocations.get(toolCallId);

							if (!existing) {
								existing = toolCallStateToInvocation(tc);
								activeToolInvocations.set(toolCallId, existing);
								progress([existing]);

								if (tc.status === ToolCallStatus.PendingConfirmation) {
									this._awaitToolConfirmation(existing, toolCallId, backendSession, turnId, CancellationToken.None);
								}
							} else if (tc.status === ToolCallStatus.PendingConfirmation) {
								// Running → PendingConfirmation (re-confirmation).
								// Only replace if the existing invocation is not already
								// waiting for confirmation (avoids flickering on duplicate
								// state change events).
								const existingState = existing.state.get();
								if (existingState.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
									existing.didExecuteTool(undefined);
									const confirmInvocation = toolCallStateToInvocation(tc);
									activeToolInvocations.set(toolCallId, confirmInvocation);
									progress([confirmInvocation]);
									this._awaitToolConfirmation(confirmInvocation, toolCallId, backendSession, turnId, CancellationToken.None);
								}
							} else if (tc.status === ToolCallStatus.Running) {
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

							if (existing && (tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Cancelled) && !IChatToolInvocation.isComplete(existing)) {
								finalizeToolInvocation(existing, tc);
							}
							break;
						}
					}
				}
			}

			if (!isActive && !finished) {
				const lastTurn = sessionState.turns.find(t => t.id === turnId);
				if (lastTurn?.state === TurnState.Error && lastTurn.error) {
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

	private async _handleTurn(
		session: URI,
		request: IChatAgentRequest,
		progress: (parts: IChatProgress[]) => void,
		cancellationToken: CancellationToken,
	): Promise<void> {
		if (cancellationToken.isCancellationRequested) {
			return;
		}

		const turnId = generateUuid();
		this._clientDispatchedTurnIds.add(turnId);
		const cleanUpTurnId = () => this._clientDispatchedTurnIds.delete(turnId);
		const attachments = this._convertVariablesToAttachments(request);
		const messageAttachments: IMessageAttachment[] = attachments.map(a => ({
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
					type: ActionType.SessionModelChanged as const,
					session: session.toString(),
					model: rawModelId,
				};
				const modelSeq = this._clientState.applyOptimistic(modelAction);
				this._config.connection.dispatchAction(modelAction, this._clientState.clientId, modelSeq);
			}
		}

		// Dispatch session/turnStarted — the server will call sendMessage on
		// the provider as a side effect.
		const turnAction = {
			type: ActionType.SessionTurnStarted as const,
			session: session.toString(),
			turnId,
			userMessage: {
				text: request.message,
				attachments: messageAttachments.length > 0 ? messageAttachments : undefined,
			},
		};
		const clientSeq = this._clientState.applyOptimistic(turnAction);
		this._config.connection.dispatchAction(turnAction, this._clientState.clientId, clientSeq);

		// Track live ChatToolInvocation objects for this turn
		const activeToolInvocations = new Map<string, ChatToolInvocation>();

		// Track last-emitted content lengths per response part to compute deltas
		const lastEmittedLengths = new Map<string, number>();

		const turnDisposables = new DisposableStore();

		// We throttle updates because generation of edits is async, if this breaks
		// layouts if they are not sequenced correctly.
		const throttler = new Throttler();
		turnDisposables.add(throttler);

		let resolveDone: () => void;
		const done = new Promise<void>(resolve => { resolveDone = resolve; });

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
							case ResponsePartKind.Markdown: {
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
							case ResponsePartKind.Reasoning: {
								const lastLen = lastEmittedLengths.get(rp.id) ?? 0;
								if (rp.content.length > lastLen) {
									const delta = rp.content.substring(lastLen);
									lastEmittedLengths.set(rp.id, rp.content.length);
									progress([{ kind: 'thinking', value: delta }]);
								}
								break;
							}
							case ResponsePartKind.ToolCall: {
								const tc = rp.toolCall;
								const toolCallId = tc.toolCallId;
								let existing = activeToolInvocations.get(toolCallId);

								if (!existing) {
									// First time seeing this tool call — create an invocation
									existing = toolCallStateToInvocation(tc);
									activeToolInvocations.set(toolCallId, existing);
									progress([existing]);

									if (tc.status === ToolCallStatus.PendingConfirmation) {
										this._awaitToolConfirmation(existing, toolCallId, session, turnId, cancellationToken);
									}
								} else if (tc.status === ToolCallStatus.PendingConfirmation) {
									// Running → PendingConfirmation (re-confirmation).
									const existingState = existing.state.get();
									if (existingState.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
										existing.didExecuteTool(undefined);
										const confirmInvocation = toolCallStateToInvocation(tc);
										activeToolInvocations.set(toolCallId, confirmInvocation);
										progress([confirmInvocation]);
										this._awaitToolConfirmation(confirmInvocation, toolCallId, session, turnId, cancellationToken);
									}
								} else if (tc.status === ToolCallStatus.Running) {
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
								if (existing && (tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Cancelled) && !IChatToolInvocation.isComplete(existing)) {
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
					if (lastTurn?.state === TurnState.Error && lastTurn.error) {
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
				type: ActionType.SessionTurnCancelled as const,
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
	private _awaitToolConfirmation(
		invocation: ChatToolInvocation,
		toolCallId: string,
		session: URI,
		turnId: string,
		cancellationToken: CancellationToken,
	): void {
		IChatToolInvocation.awaitConfirmation(invocation, cancellationToken).then(reason => {
			const approved = reason.type !== ToolConfirmKind.Denied && reason.type !== ToolConfirmKind.Skipped;
			this._logService.info(`[AgentHost] Tool confirmation: toolCallId=${toolCallId}, approved=${approved}`);
			if (approved) {
				const confirmAction = {
					type: ActionType.SessionToolCallConfirmed as const,
					session: session.toString(),
					turnId,
					toolCallId,
					approved: true as const,
					confirmed: ToolCallConfirmationReason.UserAction,
				};
				const seq = this._clientState.applyOptimistic(confirmAction);
				this._config.connection.dispatchAction(confirmAction, this._clientState.clientId, seq);
			} else {
				const denyAction = {
					type: ActionType.SessionToolCallConfirmed as const,
					session: session.toString(),
					turnId,
					toolCallId,
					approved: false as const,
					reason: ToolCallCancellationReason.Denied as const,
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
	private _reconnectToActiveTurn(
		backendSession: URI,
		turnId: string,
		chatSession: AgentHostChatSession,
		initialProgress: IChatProgress[],
	): void {
		const sessionKey = backendSession.toString();

		// Extract live ChatToolInvocation objects from the initial progress
		// array so we can update/finalize the same instances the chat UI holds.
		const activeToolInvocations = new Map<string, ChatToolInvocation>();
		for (const item of initialProgress) {
			if (item instanceof ChatToolInvocation) {
				activeToolInvocations.set(item.toolCallId, item);
			}
		}

		// Track last-emitted content lengths per response part to compute deltas.
		// Seed from the current state so we only emit new content beyond what
		// activeTurnToProgress already captured.
		const lastEmittedLengths = new Map<string, number>();
		const currentState = this._clientState.getSessionState(sessionKey);
		if (currentState?.activeTurn) {
			for (const rp of currentState.activeTurn.responseParts) {
				if (rp.kind === ResponsePartKind.Markdown || rp.kind === ResponsePartKind.Reasoning) {
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
				type: ActionType.SessionTurnCancelled as const,
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
		const processStateChange = (sessionState: ISessionState) => {
			const activeTurn = sessionState.activeTurn;
			const isActive = activeTurn?.id === turnId;
			const responseParts = isActive
				? activeTurn.responseParts
				: sessionState.turns.find(t => t.id === turnId)?.responseParts;

			if (responseParts) {
				for (const rp of responseParts) {
					switch (rp.kind) {
						case ResponsePartKind.Markdown: {
							const lastLen = lastEmittedLengths.get(rp.id) ?? 0;
							if (rp.content.length > lastLen) {
								const delta = rp.content.substring(lastLen);
								lastEmittedLengths.set(rp.id, rp.content.length);
								chatSession.appendProgress([{ kind: 'markdownContent', content: new MarkdownString(delta, { supportHtml: true }) }]);
							}
							break;
						}
						case ResponsePartKind.Reasoning: {
							const lastLen = lastEmittedLengths.get(rp.id) ?? 0;
							if (rp.content.length > lastLen) {
								const delta = rp.content.substring(lastLen);
								lastEmittedLengths.set(rp.id, rp.content.length);
								chatSession.appendProgress([{ kind: 'thinking', value: delta }]);
							}
							break;
						}
						case ResponsePartKind.ToolCall: {
							const tc = rp.toolCall;
							const toolCallId = tc.toolCallId;
							let existing = activeToolInvocations.get(toolCallId);

							if (!existing) {
								existing = toolCallStateToInvocation(tc);
								activeToolInvocations.set(toolCallId, existing);
								chatSession.appendProgress([existing]);

								if (tc.status === ToolCallStatus.PendingConfirmation) {
									this._awaitToolConfirmation(existing, toolCallId, backendSession, turnId, cts.token);
								}
							} else if (tc.status === ToolCallStatus.PendingConfirmation) {
								// Running -> PendingConfirmation (re-confirmation).
								const existingState = existing.state.get();
								if (existingState.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
									existing.didExecuteTool(undefined);
									const confirmInvocation = toolCallStateToInvocation(tc);
									activeToolInvocations.set(toolCallId, confirmInvocation);
									chatSession.appendProgress([confirmInvocation]);
									this._awaitToolConfirmation(confirmInvocation, toolCallId, backendSession, turnId, cts.token);
								}
							} else if (tc.status === ToolCallStatus.Running) {
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
							if (existing && (tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Cancelled) && !IChatToolInvocation.isComplete(existing)) {
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
				if (lastTurn?.state === TurnState.Error && lastTurn.error) {
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
	private _ensureEditingSession(sessionResource: URI): AgentHostEditingSession | undefined {
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

		// Wire up the writeFile listener if not already done
		if (!this._editingSessionListeners.has(sessionResource)) {
			this._editingSessionListeners.set(sessionResource, editingSession.onDidRequestFileWrite(params => {
				this._config.connection.writeFile(params).catch(err => {
					this._logService.warn('[AgentHost] writeFile failed for undo/redo', err);
				});
			}));

			// Hydrate from historical turns if this is the first time
			// the editing session is accessed for this chat session.
			const pendingTurns = this._pendingHistoryTurns.get(sessionResource);
			if (pendingTurns) {
				this._pendingHistoryTurns.delete(sessionResource);
				for (const turn of pendingTurns) {
					for (const rp of turn.responseParts) {
						if (rp.kind === ResponsePartKind.ToolCall) {
							editingSession.addToolCallEdits(turn.id, rp.toolCall);
						}
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
	private _hydrateFileEdits(
		sessionResource: URI,
		requestId: string,
		tc: IToolCallState,
	): IChatProgress[] {
		const editingSession = this._ensureEditingSession(sessionResource);
		if (editingSession) {
			return editingSession.addToolCallEdits(requestId, tc);
		}
		return [];
	}

	// ---- Session resolution -------------------------------------------------

	/** Maps a UI session resource to a backend provider URI. */
	private _resolveSessionUri(sessionResource: URI): URI {
		const rawId = sessionResource.path.substring(1);
		return AgentSession.uri(this._config.provider, rawId);
	}

	/** Creates a new backend session and subscribes to its state. */
	private async _createAndSubscribe(sessionResource: URI, modelId?: string): Promise<URI> {
		const rawModelId = this._extractRawModelId(modelId);
		const resourceKey = sessionResource.path.substring(1);
		const workingDirectory = this._config.resolveWorkingDirectory?.(resourceKey)
			?? this._workspaceContextService.getWorkspace().folders[0]?.uri;

		this._logService.trace(`[AgentHost] Creating new session, model=${rawModelId ?? '(default)'}, provider=${this._config.provider}`);

		let session: URI;
		try {
			session = await this._config.connection.createSession({
				model: rawModelId,
				provider: this._config.provider,
				workingDirectory,
			});
		} catch (err) {
			// If authentication is required, try to resolve it and retry once
			if (this._isAuthRequiredError(err) && this._config.resolveAuthentication) {
				this._logService.info('[AgentHost] Authentication required, prompting user...');
				const authenticated = await this._config.resolveAuthentication();
				if (authenticated) {
					session = await this._config.connection.createSession({
						model: rawModelId,
						provider: this._config.provider,
						workingDirectory,
					});
				} else {
					throw new Error(localize('agentHost.authRequired', "Authentication is required to start a session. Please sign in and try again."));
				}
			} else {
				throw err;
			}
		}

		this._logService.trace(`[AgentHost] Created session: ${session.toString()}`);

		// Subscribe to the new session's state
		try {
			const snapshot = await this._config.connection.subscribe(session);
			this._clientState.handleSnapshot(session.toString(), snapshot.state, snapshot.fromSeq);
		} catch (err) {
			this._logService.error(`[AgentHost] Failed to subscribe to new session: ${session.toString()}`, err);
		}

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
	private _ensurePendingMessageSubscription(sessionResource: URI, backendSession: URI): void {
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
	private _isAuthRequiredError(err: unknown): boolean {
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
	private _extractRawModelId(languageModelIdentifier: string | undefined): string | undefined {
		if (!languageModelIdentifier) {
			return undefined;
		}
		const prefix = this._config.sessionType + ':';
		if (languageModelIdentifier.startsWith(prefix)) {
			return languageModelIdentifier.substring(prefix.length);
		}
		return languageModelIdentifier;
	}

	private _convertVariablesToAttachments(request: IChatAgentRequest): IAgentAttachment[] {
		const attachments: IAgentAttachment[] = [];
		for (const v of request.variables.variables) {
			if (v.kind === 'file') {
				const uri = v.value instanceof URI ? v.value : undefined;
				if (uri?.scheme === 'file') {
					attachments.push({ type: AttachmentType.File, path: uri.fsPath, displayName: v.name });
				}
			} else if (v.kind === 'directory') {
				const uri = v.value instanceof URI ? v.value : undefined;
				if (uri?.scheme === 'file') {
					attachments.push({ type: AttachmentType.Directory, path: uri.fsPath, displayName: v.name });
				}
			} else if (v.kind === 'implicit' && v.isSelection) {
				const uri = v.uri;
				if (uri?.scheme === 'file') {
					attachments.push({ type: AttachmentType.Selection, path: uri.fsPath, displayName: v.name });
				}
			}
		}
		if (attachments.length > 0) {
			this._logService.trace(`[AgentHost] Converted ${attachments.length} attachments from ${request.variables.variables.length} variables`);
		}
		return attachments;
	}

	// ---- Lifecycle ----------------------------------------------------------

	override dispose(): void {
		for (const [, session] of this._activeSessions) {
			session.dispose();
		}
		this._activeSessions.clear();
		this._sessionToBackend.clear();
		super.dispose();
	}
}
