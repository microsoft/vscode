/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, type IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IAgentAttachment, AgentProvider, AgentSession, type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { ActionType, isSessionAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { SessionClientState } from '../../../../../../platform/agentHost/common/state/sessionClientState.js';
import { getToolKind, getToolLanguage } from '../../../../../../platform/agentHost/common/state/sessionReducers.js';
import { AttachmentType, ToolCallStatus, TurnState, type IMessageAttachment, type ISessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ChatAgentLocation, ChatModeKind } from '../../../common/constants.js';
import { IChatAgentData, IChatAgentImplementation, IChatAgentRequest, IChatAgentResult, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { IChatProgress, IChatService, IChatToolInvocation, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { IChatSession, IChatSessionContentProvider, IChatSessionHistoryItem } from '../../../common/chatSessionsService.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { getAgentHostIcon } from '../agentSessions.js';
import { turnsToHistory, activeTurnToProgress, toolCallStateToInvocation, permissionToConfirmation, finalizeToolInvocation, type IToolCallFileEdit } from './stateToProgressAdapter.js';

// =============================================================================
// AgentHostSessionHandler — renderer-side handler for a single agent host
// chat session type. Bridges the protocol state layer with the chat UI:
// subscribes to session state, derives IChatProgress[] from immutable state
// changes, and dispatches client actions (turnStarted, permissionResolved,
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
	readonly resolveWorkingDirectory?: (resourceKey: string) => string | undefined;
	/**
	 * Optional callback invoked when the server rejects an operation because
	 * authentication is required. Should trigger interactive authentication
	 * and return true if the user authenticated successfully.
	 */
	readonly resolveAuthentication?: () => Promise<boolean>;
}

export class AgentHostSessionHandler extends Disposable implements IChatSessionContentProvider {

	private readonly _activeSessions = new Map<string, AgentHostChatSession>();
	/** Maps UI resource keys to resolved backend session URIs. */
	private readonly _sessionToBackend = new Map<string, URI>();
	private readonly _config: IAgentHostSessionHandlerConfig;

	/** Client state manager shared across all sessions for this handler. */
	private readonly _clientState: SessionClientState;

	constructor(
		config: IAgentHostSessionHandlerConfig,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IChatService private readonly _chatService: IChatService,
		@ILogService private readonly _logService: ILogService,
		@IProductService private readonly _productService: IProductService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		this._config = config;

		// Create shared client state manager for this handler instance
		this._clientState = this._register(new SessionClientState(config.connection.clientId, this._logService));

		// Forward action envelopes from IPC to client state
		this._register(config.connection.onDidAction(envelope => {
			if (isSessionAction(envelope.action)) {
				this._clientState.receiveEnvelope(envelope);
			}
		}));

		this._registerAgent();
	}

	async provideChatSessionContent(sessionResource: URI, _token: CancellationToken): Promise<IChatSession> {
		const resourceKey = sessionResource.path.substring(1);

		// For untitled (new) sessions, defer backend session creation until the
		// first request arrives so the user-selected model is available.
		// For existing sessions we resolve immediately to load history.
		let resolvedSession: URI | undefined;
		const isUntitled = resourceKey.startsWith('untitled-');
		const history: IChatSessionHistoryItem[] = [];
		let initialProgress: IChatProgress[] | undefined;
		let activeTurnId: string | undefined;
		if (!isUntitled) {
			resolvedSession = this._resolveSessionUri(sessionResource);
			this._sessionToBackend.set(resourceKey, resolvedSession);
			try {
				const snapshot = await this._config.connection.subscribe(resolvedSession);
				if (snapshot?.state) {
					this._clientState.handleSnapshot(resolvedSession.toString(), snapshot.state, snapshot.fromSeq);
					const sessionState = this._clientState.getSessionState(resolvedSession.toString());
					if (sessionState) {
						history.push(...turnsToHistory(sessionState.turns, this._config.agentId));

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
				resolvedSession = backendSession;
				this._sessionToBackend.set(resourceKey, backendSession);
				return this._handleTurn(backendSession, request, progress, token);
			},
			initialProgress,
			() => {
				this._activeSessions.delete(resourceKey);
				this._sessionToBackend.delete(resourceKey);
				if (resolvedSession) {
					this._clientState.unsubscribe(resolvedSession.toString());
					this._config.connection.unsubscribe(resolvedSession);
					this._config.connection.disposeSession(resolvedSession);
				}
			},
		);
		this._activeSessions.set(resourceKey, session);

		// If reconnecting to an active turn, wire up an ongoing state listener
		// to stream new progress into the session's progressObs.
		if (activeTurnId && resolvedSession && initialProgress !== undefined) {
			this._reconnectToActiveTurn(resolvedSession, activeTurnId, session, initialProgress);
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
		const resourceKey = request.sessionResource.path.substring(1);
		let resolvedSession = this._sessionToBackend.get(resourceKey);
		if (!resolvedSession) {
			resolvedSession = await this._createAndSubscribe(request.sessionResource, request.userSelectedModelId);
			this._sessionToBackend.set(resourceKey, resolvedSession);
		}

		await this._handleTurn(resolvedSession, request, progress, cancellationToken);

		const activeSession = this._activeSessions.get(resourceKey);
		if (activeSession) {
			activeSession.isCompleteObs.set(true, undefined);
		}

		return {};
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

		// Track live ChatToolInvocation/permission objects for this turn
		const activeToolInvocations = new Map<string, ChatToolInvocation>();
		const activePermissions = new Map<string, ChatToolInvocation>();

		// Track last-emitted lengths to compute deltas from immutable state
		let lastStreamedTextLen = 0;
		let lastReasoningLen = 0;

		const turnDisposables = new DisposableStore();

		let resolveDone: () => void;
		const done = new Promise<void>(resolve => { resolveDone = resolve; });

		let finished = false;
		const pendingFileEdits: Promise<void>[] = [];
		const finish = async () => {
			if (finished) {
				return;
			}
			finished = true;
			// Wait for any in-flight file edit operations before finalizing
			await Promise.allSettled(pendingFileEdits);
			// Finalize any outstanding tool invocations
			for (const [, invocation] of activeToolInvocations) {
				invocation.didExecuteTool(undefined);
			}
			activeToolInvocations.clear();
			turnDisposables.dispose();
			resolveDone();
		};

		// Listen to state changes and translate to IChatProgress[]
		turnDisposables.add(this._clientState.onDidChangeSessionState(e => {
			if (e.session !== session.toString() || cancellationToken.isCancellationRequested) {
				return;
			}

			const activeTurn = e.state.activeTurn;

			if (!activeTurn || activeTurn.id !== turnId) {
				// Turn completed (activeTurn cleared by reducer).
				// Check if the finalized turn ended with an error and emit it.
				const lastTurn = e.state.turns[e.state.turns.length - 1];
				if (lastTurn?.id === turnId && lastTurn.state === TurnState.Error && lastTurn.error) {
					progress([{ kind: 'markdownContent', content: new MarkdownString(`\n\nError: (${lastTurn.error.errorType}) ${lastTurn.error.message}`) }]);
				}
				if (!finished) {
					finish();
				}
				return;
			}

			// Stream text deltas
			if (activeTurn.streamingText.length > lastStreamedTextLen) {
				const delta = activeTurn.streamingText.substring(lastStreamedTextLen);
				lastStreamedTextLen = activeTurn.streamingText.length;
				progress([{ kind: 'markdownContent', content: new MarkdownString(delta) }]);
			}

			// Stream reasoning deltas
			if (activeTurn.reasoning.length > lastReasoningLen) {
				const delta = activeTurn.reasoning.substring(lastReasoningLen);
				lastReasoningLen = activeTurn.reasoning.length;
				progress([{ kind: 'thinking', value: delta }]);
			}

			// Handle tool calls — create/finalize ChatToolInvocations
			for (const [toolCallId, tc] of Object.entries(activeTurn.toolCalls)) {
				const existing = activeToolInvocations.get(toolCallId);
				if (!existing) {
					if (tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Streaming || tc.status === ToolCallStatus.PendingConfirmation) {
						const invocation = toolCallStateToInvocation(tc);
						activeToolInvocations.set(toolCallId, invocation);
						progress([invocation]);
					}
				} else if (tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Cancelled) {
					activeToolInvocations.delete(toolCallId);
					const fileEdits = finalizeToolInvocation(existing, tc);
					if (fileEdits.length > 0) {
						pendingFileEdits.push(
							this._applyFileEdits(request.sessionResource, request, fileEdits, progress)
						);
					}
				} else if (tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.PendingConfirmation) {
					// Tool transitioned from streaming to ready — update the invocation
					// with the now-available invocationMessage and toolSpecificData.
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
			}

			// Handle permission requests
			for (const [requestId, perm] of Object.entries(activeTurn.pendingPermissions)) {
				if (activePermissions.has(requestId)) {
					continue;
				}
				const confirmInvocation = permissionToConfirmation(perm);
				activePermissions.set(requestId, confirmInvocation);
				progress([confirmInvocation]);

				IChatToolInvocation.awaitConfirmation(confirmInvocation, cancellationToken).then(reason => {
					const approved = reason.type !== ToolConfirmKind.Denied && reason.type !== ToolConfirmKind.Skipped;
					this._logService.info(`[AgentHost] Permission response: requestId=${requestId}, approved=${approved}`);
					const resolveAction = {
						type: ActionType.SessionPermissionResolved as const,
						session: session.toString(),
						turnId,
						requestId,
						approved,
					};
					const seq = this._clientState.applyOptimistic(resolveAction);
					this._config.connection.dispatchAction(resolveAction, this._clientState.clientId, seq);
					if (approved) {
						confirmInvocation.didExecuteTool(undefined);
					} else {
						confirmInvocation.didExecuteTool({ content: [], toolResultError: 'User denied' });
					}
				}).catch(err => {
					this._logService.warn(`[AgentHost] Permission confirmation failed for requestId=${requestId}`, err);
				});
			}
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

		// Build sets of tool-call IDs and permission request IDs from the
		// snapshot state so we can distinguish them in the initial progress
		// array without relying on naming conventions.
		const currentState = this._clientState.getSessionState(sessionKey);
		const snapshotToolCallIds = new Set(
			currentState?.activeTurn
				? Object.keys(currentState.activeTurn.toolCalls)
				: []
		);
		const snapshotPermissionIds = new Set(
			currentState?.activeTurn
				? Object.keys(currentState.activeTurn.pendingPermissions)
				: []
		);

		// Extract live ChatToolInvocation objects from the initial progress
		// array so we can update/finalize the same instances the chat UI holds.
		const activeToolInvocations = new Map<string, ChatToolInvocation>();
		const activePermissions = new Map<string, ChatToolInvocation>();
		for (const item of initialProgress) {
			if (item instanceof ChatToolInvocation) {
				if (snapshotPermissionIds.has(item.toolCallId)) {
					activePermissions.set(item.toolCallId, item);
				} else if (snapshotToolCallIds.has(item.toolCallId)) {
					activeToolInvocations.set(item.toolCallId, item);
				}
			}
		}

		// Track last-emitted lengths to compute deltas from the immutable state.
		// Start from the lengths already present in the snapshot so we only emit
		// new content beyond what activeTurnToProgress captured.
		let lastStreamedTextLen = currentState?.activeTurn?.streamingText.length ?? 0;
		let lastReasoningLen = currentState?.activeTurn?.reasoning.length ?? 0;

		const reconnectDisposables = chatSession.registerDisposable(new DisposableStore());

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

		// Wire up awaitConfirmation for permissions that were already pending
		// at snapshot time so the user can approve/deny them.
		for (const [requestId, confirmInvocation] of activePermissions) {
			this._wireUpPermissionConfirmation(reconnectDisposables, confirmInvocation, sessionKey, turnId, requestId);
		}

		// Process state changes from the protocol layer.
		const processStateChange = (sessionState: ISessionState) => {
			const activeTurn = sessionState.activeTurn;

			if (!activeTurn || activeTurn.id !== turnId) {
				// Turn completed -- emit any final error and mark complete
				const lastTurn = sessionState.turns[sessionState.turns.length - 1];
				if (lastTurn?.id === turnId && lastTurn.state === TurnState.Error && lastTurn.error) {
					chatSession.appendProgress([{
						kind: 'markdownContent',
						content: new MarkdownString(`\n\nError: (${lastTurn.error.errorType}) ${lastTurn.error.message}`),
					}]);
				}
				chatSession.complete();
				reconnectDisposables.dispose();
				return;
			}

			// Stream text deltas
			if (activeTurn.streamingText.length > lastStreamedTextLen) {
				const delta = activeTurn.streamingText.substring(lastStreamedTextLen);
				lastStreamedTextLen = activeTurn.streamingText.length;
				chatSession.appendProgress([{ kind: 'markdownContent', content: new MarkdownString(delta) }]);
			}

			// Stream reasoning deltas
			if (activeTurn.reasoning.length > lastReasoningLen) {
				const delta = activeTurn.reasoning.substring(lastReasoningLen);
				lastReasoningLen = activeTurn.reasoning.length;
				chatSession.appendProgress([{ kind: 'thinking', value: delta }]);
			}

			// Handle tool calls -- create/finalize ChatToolInvocations
			for (const [toolCallId, tc] of Object.entries(activeTurn.toolCalls)) {
				const existing = activeToolInvocations.get(toolCallId);
				if (!existing) {
					if (tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Streaming || tc.status === ToolCallStatus.PendingConfirmation) {
						const invocation = toolCallStateToInvocation(tc);
						activeToolInvocations.set(toolCallId, invocation);
						chatSession.appendProgress([invocation]);
					} else if (tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Cancelled) {
						// Tool call started and finished between initial snapshot and
						// first reconciliation. Synthesize a completed invocation so
						// the user can see the tool results.
						const invocation = toolCallStateToInvocation(tc);
						finalizeToolInvocation(invocation, tc);
						chatSession.appendProgress([invocation]);
					}
				} else if (tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Cancelled) {
					activeToolInvocations.delete(toolCallId);
					finalizeToolInvocation(existing, tc);
					// Note: file edits from reconnection are not routed through
					// the editing session pipeline as there is no active request
					// context. The edits already happened on the remote.
				} else if (tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.PendingConfirmation) {
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
			}

			// Handle new permission requests
			for (const [requestId, perm] of Object.entries(activeTurn.pendingPermissions)) {
				if (activePermissions.has(requestId)) {
					continue;
				}
				const confirmInvocation = permissionToConfirmation(perm);
				activePermissions.set(requestId, confirmInvocation);
				chatSession.appendProgress([confirmInvocation]);

				this._wireUpPermissionConfirmation(reconnectDisposables, confirmInvocation, sessionKey, turnId, requestId);
			}
		};

		// Attach the ongoing state listener
		reconnectDisposables.add(this._clientState.onDidChangeSessionState(e => {
			if (e.session !== sessionKey) {
				return;
			}
			processStateChange(e.state);
		}));

		// Immediately reconcile against the current state to close any gap
		// between snapshot time and listener registration. If the turn already
		// completed in the interim, this will mark the session complete.
		const latestState = this._clientState.getSessionState(sessionKey);
		if (latestState) {
			processStateChange(latestState);
		}
	}

	/**
	 * Wires up interactive confirmation handling for a permission request.
	 * Awaits the user's decision and dispatches the appropriate action.
	 */
	private _wireUpPermissionConfirmation(
		disposables: DisposableStore,
		confirmInvocation: ChatToolInvocation,
		sessionKey: string,
		turnId: string,
		requestId: string,
	): void {
		const cts = new CancellationTokenSource();
		disposables.add(toDisposable(() => cts.dispose(true)));

		IChatToolInvocation.awaitConfirmation(confirmInvocation, cts.token).then(reason => {
			const approved = reason.type !== ToolConfirmKind.Denied && reason.type !== ToolConfirmKind.Skipped;
			this._logService.info(`[AgentHost] Reconnect permission response: requestId=${requestId}, approved=${approved}`);
			const resolveAction = {
				type: ActionType.SessionPermissionResolved as const,
				session: sessionKey,
				turnId,
				requestId,
				approved,
			};
			const seq = this._clientState.applyOptimistic(resolveAction);
			this._config.connection.dispatchAction(resolveAction, this._clientState.clientId, seq);
			if (approved) {
				confirmInvocation.didExecuteTool(undefined);
			} else {
				confirmInvocation.didExecuteTool({ content: [], toolResultError: 'User denied' });
			}
		}).catch(err => {
			this._logService.warn(`[AgentHost] Reconnect permission confirmation failed for requestId=${requestId}`, err);
		});
	}

	// ---- File edit routing ---------------------------------------------------

	/**
	 * Routes file edits from completed tool calls through the editing session's
	 * external edits pipeline. Calls start/stop in sequence since the edit has
	 * already happened on the remote by the time we receive the tool completion.
	 */
	private async _applyFileEdits(
		sessionResource: URI,
		request: IChatAgentRequest,
		fileEdits: IToolCallFileEdit[],
		progress: (parts: IChatProgress[]) => void,
	): Promise<void> {
		const chatSession = this._chatService.getSession(sessionResource);
		const editingSession = chatSession?.editingSession;
		const response = chatSession?.getRequests().find(req => req.id === request.requestId)?.response;
		if (!editingSession || !response) {
			return;
		}

		const authority = this._config.connectionAuthority;
		const wrapUri = (uri: URI) => toAgentHostUri(uri, authority);

		for (const edit of fileEdits) {
			const operationId = this._nextOperationId++;
			const resource = wrapUri(edit.resource);
			const beforeUri = wrapUri(edit.beforeContentUri);
			const afterUri = wrapUri(edit.afterContentUri);

			const startProgress = await editingSession.startExternalEdits(
				response, operationId, [resource], edit.undoStopId,
				[beforeUri],
			);
			progress(startProgress);

			const stopProgress = await editingSession.stopExternalEdits(
				response, operationId,
				[afterUri],
			);
			progress(stopProgress);
		}
	}

	private _nextOperationId = 0;

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
			?? this._workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;

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

		return session;
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
