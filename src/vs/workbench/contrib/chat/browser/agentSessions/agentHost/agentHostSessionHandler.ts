/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Throttler } from '../../../../../../base/common/async.js';
import { encodeBase64 } from '../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { BugIndicatingError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableResourceMap, DisposableStore, IReference, MutableDisposable, toDisposable, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { autorun, derived, IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { observableConfigValue } from '../../../../../../platform/observable/common/platformObservableUtils.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { AgentHostSessionConfigBranchNameHintKey, AgentProvider, AgentSession, IAgentAttachment, type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ISessionTruncatedAction } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { ICustomizationRef, TerminalClaimKind, ToolResultContentType, type IProtectedResourceMetadata, type IToolDefinition } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ActionType, ISessionTurnStartedAction, type ISessionAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { AttachmentType, buildSubagentSessionUri, getToolFileEdits, getToolSubagentContent, PendingMessageKind, ResponsePartKind, SessionInputAnswerState, SessionInputAnswerValueKind, SessionInputQuestionKind, SessionInputResponseKind, StateComponents, ToolCallCancellationReason, ToolCallConfirmationReason, ToolCallStatus, TurnState, type ICompletedToolCall, type IMessageAttachment, type IRootState, type IResponsePart, type ISessionInputAnswer, type ISessionInputRequest, type ISessionState, type IToolCallRunningState, type IToolCallState, type ITurn } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { ITerminalChatService } from '../../../../terminal/browser/terminal.js';
import { ChatRequestQueueKind, IChatProgress, IChatQuestion, IChatQuestionAnswers, IChatService, IChatToolInvocation, ToolConfirmKind, type IChatTerminalToolInvocationData, type IChatMultiSelectAnswer, type IChatSingleSelectAnswer } from '../../../common/chatService/chatService.js';
import { IChatSession, IChatSessionContentProvider, IChatSessionHistoryItem, IChatSessionItem, IChatSessionRequestHistoryItem } from '../../../common/chatSessionsService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../../common/constants.js';
import { IChatEditingService } from '../../../common/editing/chatEditingService.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { ChatQuestionCarouselData } from '../../../common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { IChatAgentData, IChatAgentImplementation, IChatAgentRequest, IChatAgentResult, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ILanguageModelToolsService, IToolData, IToolInvocation, IToolResult, ToolInvocationPresentation } from '../../../common/tools/languageModelToolsService.js';
import { getAgentHostIcon } from '../agentSessions.js';
import { AgentHostEditingSession } from './agentHostEditingSession.js';
import { IAgentHostSessionWorkingDirectoryResolver } from './agentHostSessionWorkingDirectoryResolver.js';
import { IAgentHostTerminalService } from '../../../../terminal/browser/agentHostTerminalService.js';
import { activeTurnToProgress, completedToolCallToEditParts, completedToolCallToSerialized, finalizeToolInvocation, getTerminalContentUri, makeAhpTerminalToolSessionId, parseAhpTerminalToolSessionId, toolCallStateToInvocation, turnsToHistory, updateRunningToolSpecificData, type IToolCallFileEdit } from './stateToProgressAdapter.js';
import { getToolKind } from '../../../../../../platform/agentHost/common/state/sessionReducers.js';

// =============================================================================
// AgentHostSessionHandler - renderer-side handler for a single agent host
// chat session type. Bridges the protocol state layer with the chat UI:
// subscribes to session state, derives IChatProgress[] from immutable state
// changes, and dispatches client actions (turnStarted, toolCallConfirmed,
// turnCancelled) back to the server.
// =============================================================================

/**
 * Shared context for processing turn state changes. Threaded through
 * {@link AgentHostSessionHandler._processSessionState} and
 * {@link AgentHostSessionHandler._updateToolCallState}.
 */
interface ITurnProcessingContext {
	readonly turnId: string;
	readonly backendSession: URI;
	/** The UI session resource (agent-host-copilot:/...) for tool invocation context. */
	readonly sessionResource: URI;
	readonly activeToolInvocations: Map<string, ChatToolInvocation>;
	readonly lastEmittedLengths: Map<string, number>;
	readonly progress: (parts: IChatProgress[]) => void;
	readonly cancellationToken: CancellationToken;
	/** Called when a completed tool produces file edits. */
	readonly onFileEdits?: (tc: IToolCallState, fileEdits: IToolCallFileEdit[]) => void;
}

/**
 * Converts carousel answers (IChatQuestionAnswers) to protocol
 * ISessionInputAnswer records, handling text, single-select,
 * and multi-select answer shapes.
 */
export function convertCarouselAnswers(raw: IChatQuestionAnswers): Record<string, ISessionInputAnswer> {
	const answers: Record<string, ISessionInputAnswer> = {};
	for (const [qId, answer] of Object.entries(raw)) {
		if (typeof answer === 'string') {
			answers[qId] = {
				state: SessionInputAnswerState.Submitted,
				value: { kind: SessionInputAnswerValueKind.Text, value: answer },
			};
		} else if (answer && typeof answer === 'object') {
			const multi = answer as IChatMultiSelectAnswer;
			const single = answer as IChatSingleSelectAnswer;
			if (Array.isArray(multi.selectedValues)) {
				// Multi-select answer
				answers[qId] = {
					state: SessionInputAnswerState.Submitted,
					value: {
						kind: SessionInputAnswerValueKind.SelectedMany,
						value: multi.selectedValues,
						freeformValues: multi.freeformValue ? [multi.freeformValue] : undefined,
					},
				};
			} else if (single.selectedValue) {
				// Single-select answer
				answers[qId] = {
					state: SessionInputAnswerState.Submitted,
					value: {
						kind: SessionInputAnswerValueKind.Selected,
						value: single.selectedValue,
						freeformValues: single.freeformValue ? [single.freeformValue] : undefined,
					},
				};
			} else if (single.freeformValue) {
				// Freeform-only answer (no selection)
				answers[qId] = {
					state: SessionInputAnswerState.Submitted,
					value: { kind: SessionInputAnswerValueKind.Text, value: single.freeformValue },
				};
			}
		}
	}
	return answers;
}

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

	interruptActiveResponseCallback: IChatSession['interruptActiveResponseCallback'];
	readonly forkSession: IChatSession['forkSession'];

	constructor(
		readonly sessionResource: URI,
		readonly history: readonly IChatSessionHistoryItem[],
		private readonly _forkSession: ((request: IChatSessionRequestHistoryItem | undefined, token: CancellationToken) => Promise<IChatSessionItem>),
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
	 * If not provided or unresolved, session resource resolvers are consulted before
	 * falling back to the first workspace folder.
	 */
	readonly resolveWorkingDirectory?: (sessionResource: URI) => URI | undefined;
	/**
	 * Optional callback invoked when the server rejects an operation because
	 * authentication is required. Should trigger interactive authentication
	 * and return true if the user authenticated successfully.
	 *
	 * @param protectedResources The protected resources from the agent's root
	 *   state that require authentication.
	 */
	readonly resolveAuthentication?: (protectedResources: IProtectedResourceMetadata[]) => Promise<boolean>;

	/**
	 * Observable set of agent-level customizations to include in the active
	 * client set. When the value changes, active sessions are updated.
	 */
	readonly customizations?: IObservable<ICustomizationRef[]>;
}

export function getAgentHostBranchNameHint(message: string): string | undefined {
	const words = message
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.split('-')
		.filter(word => word.length > 0)
		.slice(0, 8);
	const hint = words.join('-').slice(0, 48).replace(/-+$/g, '');
	return hint.length > 0 ? hint : undefined;
}

export class AgentHostSessionHandler extends Disposable implements IChatSessionContentProvider {

	private readonly _activeSessions = new ResourceMap<AgentHostChatSession>();
	/** Maps UI resource keys to resolved backend session URIs. */
	private readonly _sessionToBackend = new ResourceMap<URI>();
	/** Per-session subscription to chat model pending request changes. */
	private readonly _pendingMessageSubscriptions = this._register(new DisposableResourceMap());
	/** Per-session subscription watching for server-initiated turns. */
	private readonly _serverTurnWatchers = this._register(new DisposableResourceMap());
	/** Historical turns with file edits, pending hydration into the editing session. */
	private readonly _pendingHistoryTurns = new ResourceMap<readonly ITurn[]>();
	/** Turn IDs dispatched by this client, used to distinguish server-originated turns. */
	private readonly _clientDispatchedTurnIds = new Set<string>();
	private readonly _config: IAgentHostSessionHandlerConfig;

	/** Active session subscriptions, keyed by backend session URI string. */
	private readonly _sessionSubscriptions = new Map<string, IReference<IAgentSubscription<ISessionState>>>();

	/** Observable of client-provided tools filtered by the allowlist and `when` clauses. */
	private readonly _clientToolsObs: IObservable<readonly IToolData[]>;
	/** Set of tool call IDs for client tool calls currently being executed. */
	private readonly _executingClientToolCalls = new Set<string>();

	constructor(
		config: IAgentHostSessionHandlerConfig,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IChatService private readonly _chatService: IChatService,
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@ILogService private readonly _logService: ILogService,
		@IProductService private readonly _productService: IProductService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalChatService private readonly _terminalChatService: ITerminalChatService,
		@IAgentHostTerminalService private readonly _agentHostTerminalService: IAgentHostTerminalService,
		@IAgentHostSessionWorkingDirectoryResolver private readonly _workingDirectoryResolver: IAgentHostSessionWorkingDirectoryResolver,
		@ILanguageModelToolsService private readonly _toolsService: ILanguageModelToolsService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
		this._config = config;

		// Build an observable of client tools: all tools matching the
		// allowlist setting, filtered by `when` clauses via observeTools.
		// We pass `undefined` for the model since agent host sessions use
		// server-side model selection and client tools should be available
		// regardless of which model is active.
		const allToolsObs = this._toolsService.observeTools(undefined);
		const allowlistObs = observableConfigValue<string[]>(ChatConfiguration.AgentHostClientTools, [], this._configurationService);
		this._clientToolsObs = derived(reader => {
			const allowlist = new Set(allowlistObs.read(reader));
			const allTools = allToolsObs.read(reader);
			return allTools.filter(t => t.toolReferenceName !== undefined && allowlist.has(t.toolReferenceName));
		});

		// When the client tools set changes, dispatch
		// activeClientToolsChanged for all active sessions owned by this
		// client so the server sees the updated tool list.
		this._register(autorun(reader => {
			const tools = this._clientToolsObs.read(reader);
			const defs = tools.map(toolDataToDefinition);
			for (const [, backendSession] of this._sessionToBackend) {
				const state = this._getSessionState(backendSession.toString());
				if (state?.activeClient?.clientId === this._config.connection.clientId) {
					this._dispatchAction({
						type: ActionType.SessionActiveClientToolsChanged,
						session: backendSession.toString(),
						tools: defs,
					});
				}
			}
		}));

		// When the user clicks "Continue in Background" on an AHP terminal
		// tool, narrow the terminal claim so the server-side tool handler
		// can detect it and return early.
		this._register(this._terminalChatService.onDidContinueInBackground(terminalToolSessionId => {
			const parsed = parseAhpTerminalToolSessionId(terminalToolSessionId);
			if (!parsed) {
				return;
			}
			this._logService.info(`[AgentHost] Continue in background: terminal=${parsed.terminal}, session=${parsed.session}`);
			this._config.connection.dispatch({
				type: ActionType.TerminalClaimed,
				terminal: parsed.terminal,
				claim: {
					kind: TerminalClaimKind.Session,
					session: parsed.session,
				},
			});
		}));

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

		// When the customizations observable changes, re-dispatch
		// activeClientChanged for sessions where this client is already
		// the active client. This avoids overwriting another client's
		// active status on sessions we're only observing.
		if (config.customizations) {
			this._register(autorun(reader => {
				const refs = config.customizations!.read(reader);
				for (const [, backendSession] of this._sessionToBackend) {
					const state = this._getSessionState(backendSession.toString());
					if (state?.activeClient?.clientId === this._config.connection.clientId) {
						this._dispatchActiveClient(backendSession, refs);
					}
				}
			}));
		}

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
				const sub = this._ensureSessionSubscription(resolvedSession.toString());
				// Wait for the subscription to hydrate from the server
				if (!this._getSessionState(resolvedSession.toString())) {
					await new Promise<void>(resolve => {
						const d = sub.onDidChange(() => { d.dispose(); resolve(); });
					});
				}
				const sessionState = this._getSessionState(resolvedSession.toString());
				if (sessionState) {
					const modelId = this._toLanguageModelId(sessionResource, sessionState.summary.model);
					history.push(...turnsToHistory(resolvedSession, sessionState.turns, this._config.agentId, modelId));

					// Enrich history with inner tool calls from subagent
					// child sessions. Subscribes to each child session so
					// its tool calls appear grouped under the parent widget.
					await this._enrichHistoryWithSubagentCalls(history, resolvedSession);

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
							modelId,
						});
						history.push({
							type: 'response',
							parts: [],
							participant: this._config.agentId,
						});
						initialProgress = activeTurnToProgress(resolvedSession, sessionState.activeTurn);
						this._logService.info(`[AgentHost] Reconnecting to active turn ${activeTurnId} for session ${resolvedSession.toString()}`);
					}
				}
			} catch (err) {
				this._logService.warn(`[AgentHost] Failed to subscribe to existing session: ${resolvedSession.toString()}`, err);
			}

			// Claim the active client role with current customizations
			const customizations = this._config.customizations?.get() ?? [];
			this._dispatchActiveClient(resolvedSession, customizations);
		}
		const session = this._instantiationService.createInstance(
			AgentHostChatSession,
			sessionResource,
			history,
			(request: IChatSessionRequestHistoryItem | undefined, token: CancellationToken) => {
				resolvedSession ??= this._sessionToBackend.get(sessionResource);
				if (!resolvedSession) {
					throw new BugIndicatingError('Cannot fork session before the initial request');
				}

				return this._forkSession(sessionResource, resolvedSession!, request, token);
			},
			initialProgress,
			() => {
				this._activeSessions.delete(sessionResource);
				this._sessionToBackend.delete(sessionResource);
				this._pendingMessageSubscriptions.deleteAndDispose(sessionResource);
				this._serverTurnWatchers.deleteAndDispose(sessionResource);
				this._pendingHistoryTurns.delete(sessionResource);
				if (resolvedSession) {
					this._releaseSessionSubscription(resolvedSession.toString());
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
			resolvedSession = await this._createAndSubscribe(request.sessionResource, request.userSelectedModelId, undefined, request.agentHostSessionConfig, getAgentHostBranchNameHint(request.message));
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
		const protocolState = this._getSessionState(session);
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
		const updatedProtocol = this._getSessionState(session);
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
		this._config.connection.dispatch(action);
	}

	/**
	 * Dispatches `session/activeClientChanged` to claim the active client
	 * role for this session and publish the current customizations and
	 * client-provided tools.
	 */
	private _dispatchActiveClient(backendSession: URI, customizations: ICustomizationRef[]): void {
		this._dispatchAction({
			type: ActionType.SessionActiveClientChanged,
			session: backendSession.toString(),
			activeClient: {
				clientId: this._config.connection.clientId,
				tools: this._clientToolsObs.get().map(toolDataToDefinition),
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
	private _watchForServerInitiatedTurns(backendSession: URI, sessionResource: URI): void {
		const sessionStr = backendSession.toString();

		// Seed from the current state so we don't treat any pre-existing active
		// turn (e.g. one being handled by _reconnectToActiveTurn) as new.
		const currentState = this._getSessionState(sessionStr);
		let lastSeenTurnId: string | undefined = currentState?.activeTurn?.id;
		let previousQueuedIds: Set<string> | undefined;
		let previousSteeringId: string | undefined = currentState?.steeringMessage?.id;

		const disposables = new DisposableStore();

		// MutableDisposable for per-turn progress tracking (replaced each turn)
		const turnProgressDisposable = new MutableDisposable<DisposableStore>();
		disposables.add(turnProgressDisposable);

		const sessionSub = this._ensureSessionSubscription(sessionStr);
		disposables.add(sessionSub.onDidChange(state => {
			const e = { session: sessionStr, state };

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
		const activeInputRequests = new Map<string, ChatQuestionCarouselData>();
		const observedSubagentToolIds = new Set<string>();
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

		const ctx: ITurnProcessingContext = {
			turnId,
			backendSession,
			sessionResource: chatSession.sessionResource,
			activeToolInvocations,
			lastEmittedLengths,
			progress,
			cancellationToken: CancellationToken.None,
		};

		const processState = (sessionState: ISessionState) => {
			if (finished) {
				return;
			}
			const isActive = this._processSessionState(sessionState, ctx);
			this._syncInputRequests(activeInputRequests, sessionState.inputRequests, backendSession, CancellationToken.None, progress);

			// Observe subagent sessions for subagent tool calls
			this._observeSubagentToolCalls(sessionState, turnId, activeToolInvocations, observedSubagentToolIds, backendSession, progress, turnDisposables);

			if (!isActive && !finished) {
				finish();
			}
		};

		const trackSub = this._ensureSessionSubscription(sessionStr);
		turnDisposables.add(trackSub.onDidChange(state => {
			throttler.queue(async () => processState(state));
		}));

		// Immediately reconcile against the current state to close any gap
		// between turn detection and listener registration. The state change
		// that triggered server-initiated turn detection may already contain
		// response parts (e.g. markdown content) that arrived in the same batch.
		const currentState = this._getSessionState(sessionStr);
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

		const turnId = request.requestId;
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
			const currentModel = this._getSessionState(session.toString())?.summary.model;
			if (currentModel !== rawModelId) {
				this._config.connection.dispatch({
					type: ActionType.SessionModelChanged,
					session: session.toString(),
					model: rawModelId,
				});
			}
		}

		// If the chat model has fewer previous requests than the protocol has
		// turns, a checkpoint was restored or a message was edited. Dispatch
		// session/truncated so the server drops the stale tail.
		const chatModel = this._chatService.getSession(request.sessionResource);
		const protocolState = this._getSessionState(session.toString());
		if (chatModel && protocolState && protocolState.turns.length > 0) {
			// -2 since -1 will already be the current request
			const previousRequestIndex = chatModel.getRequests().findIndex(i => i.id === request.requestId) - 1;
			const previousRequest = previousRequestIndex >= 0 ? chatModel.getRequests()[previousRequestIndex] : undefined;
			if (!previousRequest && protocolState.turns.length > 0) {
				const truncateAction: ISessionTruncatedAction = {
					type: ActionType.SessionTruncated,
					session: session.toString(),
				};
				this._config.connection.dispatch(truncateAction);
			} else {
				const seenAtIndex = protocolState.turns.findIndex(t => t.id === previousRequest!.id);
				if (seenAtIndex !== -1 && seenAtIndex < protocolState.turns.length - 1) {
					const truncateAction: ISessionTruncatedAction = {
						type: ActionType.SessionTruncated,
						session: session.toString(),
						turnId: previousRequest!.id,
					};
					this._config.connection.dispatch(truncateAction);
				}
			}
		}

		// Dispatch session/turnStarted — the server will call sendMessage on
		// the provider as a side effect.
		const turnAction: ISessionTurnStartedAction = {
			type: ActionType.SessionTurnStarted,
			session: session.toString(),
			turnId,
			userMessage: {
				text: request.message,
				attachments: messageAttachments.length > 0 ? messageAttachments : undefined,
			},
		};
		this._config.connection.dispatch(turnAction);

		// Ensure the editing session records a sentinel checkpoint for this
		// request so it appears in requestDisablement even if the turn
		// produces no file edits.
		this._ensureEditingSession(request.sessionResource)
			?.ensureRequestCheckpoint(request.requestId);

		// Track live ChatToolInvocation objects for this turn
		const activeToolInvocations = new Map<string, ChatToolInvocation>();

		// Track live input request carousels to cancel if they disappear from state
		const activeInputRequests = new Map<string, ChatQuestionCarouselData>();

		// Track last-emitted content lengths per response part to compute deltas
		const lastEmittedLengths = new Map<string, number>();

		// Track subagent child sessions we're already observing
		const observedSubagentToolIds = new Set<string>();

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
		const handleTurnSub = this._ensureSessionSubscription(session.toString());
		const ctx: ITurnProcessingContext = {
			turnId,
			backendSession: session,
			sessionResource: request.sessionResource,
			activeToolInvocations,
			lastEmittedLengths,
			progress,
			cancellationToken,
			onFileEdits: (tc, fileEdits) => {
				const editParts = this._hydrateFileEdits(request.sessionResource, request.requestId, tc);
				if (editParts.length > 0) {
					progress(editParts);
				}
			},
		};

		turnDisposables.add(handleTurnSub.onDidChange(rawSessionState => {
			throttler.queue(async () => {
				if (cancellationToken.isCancellationRequested) {
					return;
				}
				const isActive = this._processSessionState(rawSessionState, ctx);

				// Process input requests (ask_user tool elicitations)
				this._syncInputRequests(activeInputRequests, rawSessionState.inputRequests, session, cancellationToken, progress);

				// Observe subagent sessions for subagent tool calls
				this._observeSubagentToolCalls(rawSessionState, turnId, activeToolInvocations, observedSubagentToolIds, session, progress, turnDisposables);

				if (!isActive && !finished) {
					finish();
				}
			});
		}));

		turnDisposables.add(cancellationToken.onCancellationRequested(() => {
			this._logService.info(`[AgentHost] Cancellation requested for ${session.toString()}, dispatching turnCancelled`);
			this._config.connection.dispatch({
				type: ActionType.SessionTurnCancelled,
				session: session.toString(),
				turnId,
			});
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
				this._config.connection.dispatch({
					type: ActionType.SessionToolCallConfirmed,
					session: session.toString(),
					turnId,
					toolCallId,
					approved: true,
					confirmed: ToolCallConfirmationReason.UserAction,
				});
			} else {
				this._config.connection.dispatch({
					type: ActionType.SessionToolCallConfirmed,
					session: session.toString(),
					turnId,
					toolCallId,
					approved: false,
					reason: ToolCallCancellationReason.Denied,
				});
			}
		}).catch(err => {
			this._logService.warn(`[AgentHost] Tool confirmation failed for toolCallId=${toolCallId}`, err);
		});
	}

	// ---- Tool call state updates --------------------------------------------

	/**
	 * Shared logic for updating an existing {@link ChatToolInvocation} when
	 * the protocol tool-call state changes. Handles:
	 * - PendingConfirmation re-confirmation (Running → PendingConfirmation)
	 * - Running status: updates invocation message and detects terminal content
	 * - Completed/Cancelled: revives terminal if needed, then finalizes
	 *
	 * @returns Updated invocation (may differ from `existing` on re-confirmation)
	 *   and file edits produced by finalization.
	 */
	private _updateToolCallState(
		existing: ChatToolInvocation,
		tc: IToolCallState,
		ctx: ITurnProcessingContext,
	): { invocation: ChatToolInvocation; fileEdits: IToolCallFileEdit[] } {
		const toolCallId = tc.toolCallId;
		let fileEdits: IToolCallFileEdit[] = [];

		if (tc.status === ToolCallStatus.PendingConfirmation) {
			// Running → PendingConfirmation (re-confirmation).
			const existingState = existing.state.get();
			if (existingState.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
				existing.didExecuteTool(undefined);
				const confirmInvocation = toolCallStateToInvocation(tc, undefined, ctx.backendSession);
				ctx.activeToolInvocations.set(toolCallId, confirmInvocation);
				ctx.progress([confirmInvocation]);
				this._awaitToolConfirmation(confirmInvocation, toolCallId, ctx.backendSession, ctx.turnId, ctx.cancellationToken);
				existing = confirmInvocation;
			}
		} else if (tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.PendingResultConfirmation) {
			existing.invocationMessage = typeof tc.invocationMessage === 'string'
				? tc.invocationMessage
				: new MarkdownString(tc.invocationMessage.markdown);
			this._reviveTerminalIfNeeded(existing, tc, ctx.backendSession);
			updateRunningToolSpecificData(existing, tc);

			// If this is a client-provided tool call owned by us, execute it.
			if (tc.status === ToolCallStatus.Running
				&& tc.toolClientId === this._config.connection.clientId
				&& !this._executingClientToolCalls.has(toolCallId)) {
				this._executeClientToolCall(tc, ctx);
			}
		}

		// Finalize terminal-state tools
		if ((tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Cancelled) && !IChatToolInvocation.isComplete(existing)) {
			// Revive terminal before finalizing — handles the case where
			// Running was skipped due to throttling and terminal content
			// only appears at Completed time.
			this._reviveTerminalIfNeeded(existing, tc, ctx.backendSession);
			fileEdits = finalizeToolInvocation(existing, tc, ctx.backendSession);
		}

		return { invocation: existing, fileEdits };
	}

	// ---- Client tool execution ----------------------------------------------

	/**
	 * Executes a client-provided tool call. Looks up the tool in the local
	 * tool service, invokes it, and dispatches the result back to the server
	 * via `session/toolCallComplete`.
	 */
	private _executeClientToolCall(tc: IToolCallRunningState, ctx: ITurnProcessingContext): void {
		const toolCallId = tc.toolCallId;
		this._executingClientToolCalls.add(toolCallId);

		const toolData = this._toolsService.getToolByName(tc.toolName);
		if (!toolData) {
			this._logService.warn(`[AgentHost] Client tool call for unknown tool: ${tc.toolName}`);
			this._dispatchAction({
				type: ActionType.SessionToolCallComplete,
				session: ctx.backendSession.toString(),
				turnId: ctx.turnId,
				toolCallId,
				result: {
					success: false,
					pastTenseMessage: `Tool "${tc.toolName}" is not available`,
					error: { message: `Tool "${tc.toolName}" is not available on this client` },
				},
			});
			this._executingClientToolCalls.delete(toolCallId);
			return;
		}

		// Parse tool input parameters
		let parameters: Record<string, unknown> = {};
		if (tc.toolInput) {
			try {
				const parsed: unknown = JSON.parse(tc.toolInput);
				if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
					throw new Error('expected JSON object');
				}
				parameters = parsed as Record<string, unknown>;
			} catch {
				this._logService.warn(`[AgentHost] Failed to parse tool input for ${tc.toolName}`);
				this._dispatchAction({
					type: ActionType.SessionToolCallComplete,
					session: ctx.backendSession.toString(),
					turnId: ctx.turnId,
					toolCallId,
					result: {
						success: false,
						pastTenseMessage: `Failed to execute ${tc.toolName}`,
						error: { message: `Invalid tool input for "${tc.toolName}": expected JSON object parameters` },
					},
				});
				this._executingClientToolCalls.delete(toolCallId);
				return;
			}
		}

		const invocation: IToolInvocation = {
			callId: toolCallId,
			toolId: toolData.id,
			parameters,
			context: { sessionResource: ctx.sessionResource },
		};

		const noOpCountTokens = async () => 0;

		this._logService.info(`[AgentHost] Executing client tool: ${tc.toolName} (callId=${toolCallId})`);

		this._toolsService.invokeTool(
			invocation,
			noOpCountTokens,
			ctx.cancellationToken,
		).then(result => {
			this._dispatchAction({
				type: ActionType.SessionToolCallComplete,
				session: ctx.backendSession.toString(),
				turnId: ctx.turnId,
				toolCallId,
				result: toolResultToProtocol(result, tc.toolName),
			});
		}).catch(err => {
			this._logService.warn(`[AgentHost] Client tool invocation failed: ${tc.toolName}`, err);
			this._dispatchAction({
				type: ActionType.SessionToolCallComplete,
				session: ctx.backendSession.toString(),
				turnId: ctx.turnId,
				toolCallId,
				result: {
					success: false,
					pastTenseMessage: `Failed to execute ${tc.toolName}`,
					error: { message: String(err?.message ?? err) },
				},
			});
		}).finally(() => {
			this._executingClientToolCalls.delete(toolCallId);
		});
	}

	/**
	 * Detects terminal content in a tool call and creates a local terminal
	 * instance backed by the agent host connection. Updates the invocation's
	 * `toolSpecificData` to `kind: 'terminal'` and clears
	 * `HiddenAfterComplete` so the terminal UI stays visible.
	 */
	private _reviveTerminalIfNeeded(
		invocation: ChatToolInvocation,
		tc: IToolCallState,
		backendSession: URI,
	): void {
		// content is only present on Running/Completed/PendingResultConfirmation.
		// toolInput is present on all post-streaming states.
		if (tc.status !== ToolCallStatus.Running && tc.status !== ToolCallStatus.Completed && tc.status !== ToolCallStatus.PendingResultConfirmation) {
			return;
		}
		const terminalUri = getTerminalContentUri(tc.content);
		if (!terminalUri || !tc.toolInput) {
			return;
		}
		invocation.presentation = undefined;
		const toolInput = tc.toolInput;
		this._ensureTerminalInstance(terminalUri, backendSession).then(sessionId => {
			const existing = invocation.toolSpecificData?.kind === 'terminal'
				? invocation.toolSpecificData as IChatTerminalToolInvocationData
				: undefined;

			// Resolve the terminalCommandId from the AHP command source
			let terminalCommandId = existing?.terminalCommandId;
			if (!terminalCommandId) {
				const source = this._terminalChatService.getAhpCommandSource(sessionId);
				if (source) {
					// Use the executing command or the most recent completed command
					const cmd = source.executingCommandObject ?? source.commands[source.commands.length - 1];
					terminalCommandId = cmd?.id;
				}
			}

			invocation.toolSpecificData = {
				...existing,
				kind: 'terminal',
				commandLine: { original: toolInput },
				language: 'shellscript',
				terminalToolSessionId: sessionId,
				terminalCommandUri: URI.parse(terminalUri),
				terminalCommandId,
			};
		});
	}

	/**
	 * Processes a session state snapshot for a specific turn, emitting
	 * incremental progress for new or changed content. Handles markdown
	 * and reasoning deltas, tool call lifecycle (creation, updates,
	 * confirmation, finalization), and turn-end error messages.
	 *
	 * @returns `true` if the turn is still active, `false` if it has ended.
	 *   When `false`, any error message has already been emitted via
	 *   `progress`.
	 */
	private _processSessionState(
		sessionState: ISessionState,
		ctx: ITurnProcessingContext,
	): boolean {
		const activeTurn = sessionState.activeTurn;
		const isActive = activeTurn?.id === ctx.turnId;
		const responseParts = isActive
			? activeTurn.responseParts
			: sessionState.turns.find(t => t.id === ctx.turnId)?.responseParts;

		if (responseParts) {
			for (const rp of responseParts) {
				switch (rp.kind) {
					case ResponsePartKind.Markdown: {
						const lastLen = ctx.lastEmittedLengths.get(rp.id) ?? 0;
						if (rp.content.length > lastLen) {
							const delta = rp.content.substring(lastLen);
							ctx.lastEmittedLengths.set(rp.id, rp.content.length);
							// supportHtml is load bearing. Without this the markdown
							// string gets merged into the edit part in chatModel.ts
							// which breaks rendering because the thinking content
							// part does not deal with this.
							ctx.progress([{ kind: 'markdownContent', content: new MarkdownString(delta, { supportHtml: true }) }]);
						}
						break;
					}
					case ResponsePartKind.Reasoning: {
						const lastLen = ctx.lastEmittedLengths.get(rp.id) ?? 0;
						if (rp.content.length > lastLen) {
							const delta = rp.content.substring(lastLen);
							ctx.lastEmittedLengths.set(rp.id, rp.content.length);
							ctx.progress([{ kind: 'thinking', value: delta }]);
						}
						break;
					}
					case ResponsePartKind.ToolCall: {
						const tc = rp.toolCall;
						let existing = ctx.activeToolInvocations.get(tc.toolCallId);

						if (!existing) {
							existing = toolCallStateToInvocation(tc, undefined, ctx.backendSession);
							ctx.activeToolInvocations.set(tc.toolCallId, existing);
							ctx.progress([existing]);

							if (tc.status === ToolCallStatus.PendingConfirmation) {
								this._awaitToolConfirmation(existing, tc.toolCallId, ctx.backendSession, ctx.turnId, ctx.cancellationToken);
							} else {
								// First snapshot may already be Running/Completed/
								// Cancelled (due to throttling). Process immediately
								// so terminal revival and finalization still happen.
								const { fileEdits } = this._updateToolCallState(existing, tc, ctx);
								if (fileEdits.length > 0) {
									ctx.onFileEdits?.(tc, fileEdits);
								}
							}
						} else {
							const { fileEdits } = this._updateToolCallState(existing, tc, ctx);
							if (fileEdits.length > 0) {
								ctx.onFileEdits?.(tc, fileEdits);
							}
						}
						break;
					}
				}
			}
		}

		if (!isActive) {
			const lastTurn = sessionState.turns.find(t => t.id === ctx.turnId);
			if (lastTurn?.state === TurnState.Error && lastTurn.error) {
				ctx.progress([{ kind: 'markdownContent', content: new MarkdownString(`\n\nError: (${lastTurn.error.errorType}) ${lastTurn.error.message}`) }]);
			}
			return false;
		}
		return true;
	}

	// ---- Input request handling ---------------------------------------------

	/**
	 * Syncs the set of active input request carousels against the current
	 * session state. Cancels carousels whose requests disappeared and creates
	 * new carousels for newly appeared requests.
	 */
	private _syncInputRequests(
		active: Map<string, ChatQuestionCarouselData>,
		inputRequests: readonly ISessionInputRequest[] | undefined,
		session: URI,
		token: CancellationToken,
		progress: (items: IChatProgress[]) => void,
	): void {
		const currentIds = new Set(inputRequests?.map(r => r.id));
		for (const [id, carousel] of active) {
			if (!currentIds.has(id)) {
				carousel.completion.complete({ answers: undefined });
				active.delete(id);
			}
		}
		if (inputRequests) {
			for (const inputReq of inputRequests) {
				if (!active.has(inputReq.id)) {
					active.set(inputReq.id, this._handleInputRequest(inputReq, session, token, progress));
				}
			}
		}
	}

	/**
	 * Creates a question carousel for a session input request and dispatches
	 * the `SessionInputCompleted` action when the user answers or cancels.
	 */
	private _handleInputRequest(
		inputReq: ISessionInputRequest,
		session: URI,
		cancellationToken: CancellationToken,
		progress: (items: IChatProgress[]) => void,
	): ChatQuestionCarouselData {
		const questions: IChatQuestion[] = (inputReq.questions ?? []).map((q): IChatQuestion => {
			switch (q.kind) {
				case SessionInputQuestionKind.SingleSelect:
					return {
						id: q.id,
						type: 'singleSelect',
						title: q.title ?? q.message,
						description: q.title !== undefined ? q.message : undefined,
						required: q.required,
						allowFreeformInput: q.allowFreeformInput ?? true,
						options: q.options.map(o => ({ id: o.id, label: o.label, value: o.id })),
					};
				case SessionInputQuestionKind.MultiSelect:
					return {
						id: q.id,
						type: 'multiSelect',
						title: q.title ?? q.message,
						description: q.title !== undefined ? q.message : undefined,
						required: q.required,
						allowFreeformInput: q.allowFreeformInput ?? true,
						options: q.options.map(o => ({ id: o.id, label: o.label, value: o.id })),
					};
				case SessionInputQuestionKind.Text:
					return {
						id: q.id,
						type: 'text',
						title: q.title ?? q.message,
						description: q.title !== undefined ? q.message : undefined,
						required: q.required,
						defaultValue: q.defaultValue,
					};
				default:
					return {
						id: q.id,
						type: 'text',
						title: q.title ?? q.message,
						description: q.title !== undefined ? q.message : undefined,
						required: q.required,
					};
			}
		});

		if (questions.length === 0) {
			// Fallback for input requests with no structured questions —
			// create a single text question from the message.
			questions.push({
				id: 'answer',
				type: 'text',
				title: inputReq.message,
				required: true,
			});
		}

		const carousel = new ChatQuestionCarouselData(
			questions,
			/* allowSkip */ true,
			/* resolveId */ undefined,
			/* data */ undefined,
			/* isUsed */ undefined,
			/* message */ new MarkdownString(inputReq.message),
		);

		progress([carousel]);

		if (cancellationToken.isCancellationRequested) {
			carousel.completion.complete({ answers: undefined });
		} else {
			const tokenListener = cancellationToken.onCancellationRequested(() => {
				carousel.completion.complete({ answers: undefined });
			});
			carousel.completion.p.finally(() => tokenListener.dispose());
		}

		carousel.completion.p.then(result => {
			if (!result.answers) {
				this._config.connection.dispatch({
					type: ActionType.SessionInputCompleted,
					session: session.toString(),
					requestId: inputReq.id,
					response: SessionInputResponseKind.Cancel,
				});
			} else {
				const answers = convertCarouselAnswers(result.answers);
				this._config.connection.dispatch({
					type: ActionType.SessionInputCompleted,
					session: session.toString(),
					requestId: inputReq.id,
					response: SessionInputResponseKind.Accept,
					answers,
				});
			}
		});

		return carousel;
	}

	// ---- Subagent child session observation ---------------------------------

	/**
	 * Scans the response parts of a turn for subagent tool calls and starts
	 * observing their child sessions. Deduplicates against previously observed
	 * tool call IDs.
	 */
	private _observeSubagentToolCalls(
		sessionState: ISessionState,
		turnId: string,
		activeToolInvocations: Map<string, ChatToolInvocation>,
		observedSubagentToolIds: Set<string>,
		backendSession: URI,
		progress: (parts: IChatProgress[]) => void,
		disposables: DisposableStore,
	): void {
		const activeTurn = sessionState.activeTurn;
		const isActiveTurn = activeTurn?.id === turnId;
		const parts = isActiveTurn
			? activeTurn.responseParts
			: sessionState.turns.find(t => t.id === turnId)?.responseParts;
		if (!parts) {
			return;
		}
		for (const rp of parts) {
			if (rp.kind === ResponsePartKind.ToolCall) {
				const tc = rp.toolCall;
				const existing = activeToolInvocations.get(tc.toolCallId);
				if (existing && !observedSubagentToolIds.has(tc.toolCallId) && (getToolKind(tc) === 'subagent' || ((tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Completed) && getToolSubagentContent(tc)))) {
					observedSubagentToolIds.add(tc.toolCallId);
					this._observeSubagentSession(backendSession, tc.toolCallId, progress, disposables, observedSubagentToolIds);
				}
			}
		}
	}

	/**
	 * Enriches serialized history with inner tool calls from subagent child
	 * sessions. For each subagent tool call found in the history, subscribes
	 * to the corresponding child session and appends its inner tool calls
	 * (with `subAgentInvocationId` set) to the response parts.
	 */
	private async _enrichHistoryWithSubagentCalls(
		history: IChatSessionHistoryItem[],
		parentSession: URI,
	): Promise<void> {
		const parentSessionStr = parentSession.toString();

		for (const item of history) {
			if (item.type !== 'response') {
				continue;
			}

			// Collect subagent tool calls from this response's parts
			const subagentInsertions: { index: number; toolCallId: string }[] = [];
			for (let i = 0; i < item.parts.length; i++) {
				const part = item.parts[i];
				if (part.kind === 'toolInvocationSerialized' && part.toolSpecificData?.kind === 'subagent') {
					subagentInsertions.push({ index: i, toolCallId: part.toolCallId });
				}
			}

			// Process insertions in reverse order so indices remain valid
			for (let j = subagentInsertions.length - 1; j >= 0; j--) {
				const { index, toolCallId } = subagentInsertions[j];
				const childSessionUri = buildSubagentSessionUri(parentSessionStr, toolCallId);

				try {
					const childSub = this._ensureSessionSubscription(childSessionUri);
					let childState = this._getSessionState(childSessionUri);
					if (!childState) {
						if (childSub.value instanceof Error) {
							throw childSub.value;
						}
						await new Promise<void>(resolve => {
							const d = childSub.onDidChange(() => { d.dispose(); resolve(); });
						});
						if (childSub.value instanceof Error) {
							throw childSub.value;
						}
						childState = this._getSessionState(childSessionUri);
					}
					if (childState) {
						const innerParts: IChatProgress[] = [];
						for (const turn of childState.turns) {
							for (const rp of turn.responseParts) {
								if (rp.kind === ResponsePartKind.ToolCall) {
									const tc = rp.toolCall;
									if (tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Cancelled) {
										const completedTc = tc as ICompletedToolCall;
										const fileEditParts = completedToolCallToEditParts(completedTc);
										const serialized = completedToolCallToSerialized(completedTc, toolCallId, URI.parse(childSessionUri));
										if (fileEditParts.length > 0) {
											serialized.presentation = ToolInvocationPresentation.Hidden;
										}
										innerParts.push(serialized);
										innerParts.push(...fileEditParts);
									}
								}
							}
						}
						if (innerParts.length > 0) {
							// Insert inner tool calls right after the subagent tool call
							item.parts.splice(index + 1, 0, ...innerParts);
						}
					}
				} catch (err) {
					this._logService.warn(`[AgentHost] Failed to enrich history with subagent calls: ${childSessionUri}`, err);
				} finally {
					this._releaseSessionSubscription(childSessionUri);
				}
			}
		}
	}

	/**
	 * Subscribes to a child subagent session and forwards its tool calls
	 * as progress parts into the parent session's response, with
	 * `subAgentInvocationId` set so the renderer groups them under the parent
	 * subagent widget.
	 */
	private _observeSubagentSession(
		parentSession: URI,
		parentToolCallId: string,
		emitProgress: (parts: IChatProgress[]) => void,
		disposables: DisposableStore,
		observedSet: Set<string>,
	): void {
		const childSessionUri = buildSubagentSessionUri(parentSession.toString(), parentToolCallId);

		const activeChildToolInvocations = new Map<string, ChatToolInvocation>();
		const childCts = new CancellationTokenSource();
		disposables.add(toDisposable(() => childCts.dispose(true)));

		// Helper to process response parts from a child turn
		const processChildParts = (responseParts: readonly IResponsePart[], turnId: string) => {
			for (const rp of responseParts) {
				if (rp.kind === ResponsePartKind.ToolCall) {
					const tc = rp.toolCall;
					let existing = activeChildToolInvocations.get(tc.toolCallId);

					if (!existing) {
						existing = toolCallStateToInvocation(tc, parentToolCallId, URI.parse(childSessionUri));
						activeChildToolInvocations.set(tc.toolCallId, existing);
						emitProgress([existing]);

						if (tc.status === ToolCallStatus.PendingConfirmation) {
							this._awaitToolConfirmation(existing, tc.toolCallId, URI.parse(childSessionUri), turnId, childCts.token);
						}
					} else if (tc.status === ToolCallStatus.PendingConfirmation) {
						const existingState = existing.state.get();
						if (existingState.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
							existing.didExecuteTool(undefined);
							const confirmInvocation = toolCallStateToInvocation(tc, parentToolCallId, URI.parse(childSessionUri));
							activeChildToolInvocations.set(tc.toolCallId, confirmInvocation);
							emitProgress([confirmInvocation]);
							this._awaitToolConfirmation(confirmInvocation, tc.toolCallId, URI.parse(childSessionUri), turnId, childCts.token);
						}
					} else if (tc.status === ToolCallStatus.Running) {
						updateRunningToolSpecificData(existing, tc);
					}

					if (existing && (tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Cancelled) && !IChatToolInvocation.isComplete(existing)) {
						finalizeToolInvocation(existing, tc, URI.parse(childSessionUri));
					}
				}
			}
		};

		try {
			const childSub = this._ensureSessionSubscription(childSessionUri);

			// Attach the state listener BEFORE replaying the snapshot so any
			// state change arriving in the gap is not lost. This mirrors the
			// pattern used for parent turn observation.
			disposables.add(childSub.onDidChange(state => {
				if (disposables.isDisposed) {
					return;
				}

				const activeTurn = state.activeTurn;
				const turnId = activeTurn?.id ?? state.turns[state.turns.length - 1]?.id;
				const responseParts = activeTurn?.responseParts
					?? state.turns[state.turns.length - 1]?.responseParts;

				if (responseParts && turnId) {
					processChildParts(responseParts, turnId);
				}
			}));

			// Replay any existing content from the child session snapshot
			// (handles both active turns and already-completed ones)
			const childState = this._getSessionState(childSessionUri);
			if (childState) {
				for (const turn of childState.turns) {
					processChildParts(turn.responseParts, turn.id);
				}
				if (childState.activeTurn) {
					processChildParts(childState.activeTurn.responseParts, childState.activeTurn.id);
				}
			}

			// Clean up when disposables are disposed
			disposables.add(toDisposable(() => {
				this._releaseSessionSubscription(childSessionUri);
			}));
		} catch (err) {
			// Remove from observed set so a later state change can retry
			observedSet.delete(parentToolCallId);
			this._logService.warn(`[AgentHost] Failed to subscribe to subagent session: ${childSessionUri}`, err);
		}
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
		const currentState = this._getSessionState(sessionKey);
		if (currentState?.activeTurn) {
			for (const rp of currentState.activeTurn.responseParts) {
				if (rp.kind === ResponsePartKind.Markdown || rp.kind === ResponsePartKind.Reasoning) {
					lastEmittedLengths.set(rp.id, rp.content.length);
				}
			}
		}

		const reconnectDisposables = chatSession.registerDisposable(new DisposableStore());
		const observedSubagentToolIds = new Set<string>();
		const throttler = new Throttler();
		reconnectDisposables.add(throttler);

		// Set up the interrupt callback so the user can actually cancel the
		// remote turn. This dispatches session/turnCancelled to the server.
		chatSession.interruptActiveResponseCallback = async () => {
			this._logService.info(`[AgentHost] Reconnect cancellation requested for ${sessionKey}, dispatching turnCancelled`);
			this._config.connection.dispatch({
				type: ActionType.SessionTurnCancelled,
				session: sessionKey,
				turnId,
			});
			return true;
		};

		// Wire up awaitConfirmation for tool calls that were already pending
		// confirmation at snapshot time so the user can approve/deny them.
		// Also start observing any subagent tools that were already running.
		const cts = new CancellationTokenSource();
		reconnectDisposables.add(toDisposable(() => cts.dispose(true)));
		for (const [toolCallId, invocation] of activeToolInvocations) {
			if (!IChatToolInvocation.isComplete(invocation)) {
				this._awaitToolConfirmation(invocation, toolCallId, backendSession, turnId, cts.token);
			}
			if (invocation.toolSpecificData?.kind === 'subagent' && !observedSubagentToolIds.has(toolCallId)) {
				observedSubagentToolIds.add(toolCallId);
				this._observeSubagentSession(backendSession, toolCallId, (parts) => chatSession.appendProgress(parts), reconnectDisposables, observedSubagentToolIds);
			}
		}

		// Track live input request carousels for reconnection
		const activeInputRequests = new Map<string, ChatQuestionCarouselData>();
		const appendProgress = (parts: IChatProgress[]) => chatSession.appendProgress(parts);

		// Restore any pending input requests from the initial state
		this._syncInputRequests(activeInputRequests, currentState?.inputRequests, backendSession, cts.token, appendProgress);

		// Process state changes from the protocol layer.
		const ctx: ITurnProcessingContext = {
			turnId,
			backendSession,
			sessionResource: chatSession.sessionResource,
			activeToolInvocations,
			lastEmittedLengths,
			progress: parts => chatSession.appendProgress(parts),
			cancellationToken: cts.token,
		};
		const processStateChange = (sessionState: ISessionState) => {
			const isActive = this._processSessionState(sessionState, ctx);
			this._syncInputRequests(activeInputRequests, sessionState.inputRequests, backendSession, cts.token, appendProgress);

			// Observe subagent sessions for subagent tool calls
			this._observeSubagentToolCalls(sessionState, turnId, activeToolInvocations, observedSubagentToolIds, backendSession, (parts: IChatProgress[]) => chatSession.appendProgress(parts), reconnectDisposables);

			if (!isActive) {
				chatSession.complete();
				reconnectDisposables.dispose();
			}
		};

		// Attach the ongoing state listener
		const reconnectSub = this._ensureSessionSubscription(sessionKey);
		reconnectDisposables.add(reconnectSub.onDidChange(state => {
			throttler.queue(async () => processStateChange(state));
		}));

		// Immediately reconcile against the current state to close any gap
		// between snapshot time and listener registration. If the turn already
		// completed in the interim, this will mark the session complete.
		const latestState = this._getSessionState(sessionKey);
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

	/**
	 * Attaches to an existing server-side terminal via the agent host
	 * terminal service and registers it with the terminal chat service.
	 *
	 * Returns the `terminalToolSessionId` to use for the tool invocation.
	 */
	private async _ensureTerminalInstance(terminalUri: string, backendSession: URI): Promise<string> {
		const terminalToolSessionId = makeAhpTerminalToolSessionId(terminalUri, backendSession);
		const parsedUri = URI.parse(terminalUri);
		await this._agentHostTerminalService.reviveTerminal(
			this._config.connection,
			parsedUri,
			terminalToolSessionId
		);

		return terminalToolSessionId;
	}

	/** Maps a UI session resource to a backend provider URI. */
	private _resolveSessionUri(sessionResource: URI): URI {
		const rawId = sessionResource.path.substring(1);
		return AgentSession.uri(this._config.provider, rawId);
	}

	/**
	 * Forks a session at the given request point by creating a new backend
	 * session with the `fork` parameter. Returns an {@link IChatSessionItem}
	 * pointing to the newly created session.
	 */
	private async _forkSession(
		sessionResource: URI,
		backendSession: URI,
		request: IChatSessionRequestHistoryItem | undefined,
		token: CancellationToken,
	): Promise<IChatSessionItem> {
		if (token.isCancellationRequested) {
			throw new Error('Cancelled');
		}

		// Determine the turn index to fork at. If a specific request is
		// provided, fork BEFORE it (keeping turns up to the previous one).
		// This matches the non-contributed path in ForkConversationAction
		// which uses `requestIndex - 1`. If no request is provided, fork
		// the entire session.
		const protocolState = this._getSessionState(backendSession.toString());
		let turnIndex: number | undefined;
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
		} else if (protocolState && protocolState.turns.length > 0) {
			turnIndex = protocolState.turns.length - 1;
		}

		if (turnIndex === undefined) {
			throw new Error('Cannot fork: no turns to fork from');
		}

		const turnId = protocolState!.turns[turnIndex].id;
		const chatModel = this._chatService.getSession(sessionResource);

		const forkedSession = await this._createAndSubscribe(sessionResource, protocolState?.summary.model, {
			session: backendSession,
			turnIndex,
			turnId,
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
	private async _createAndSubscribe(sessionResource: URI, modelId?: string, fork?: { session: URI; turnIndex: number; turnId: string }, sessionConfig?: Record<string, string>, branchNameHint?: string): Promise<URI> {
		const rawModelId = this._extractRawModelId(modelId);
		const config = branchNameHint ? { ...sessionConfig, [AgentHostSessionConfigBranchNameHintKey]: branchNameHint } : sessionConfig;
		const workingDirectory = this._config.resolveWorkingDirectory?.(sessionResource)
			?? this._workingDirectoryResolver.resolve(sessionResource)
			?? this._workspaceContextService.getWorkspace().folders[0]?.uri;

		this._logService.trace(`[AgentHost] Creating new session, model=${rawModelId ?? '(default)'}, provider=${this._config.provider}${fork ? `, fork from ${fork.session.toString()} at index ${fork.turnIndex}` : ''}`);

		// Eagerly authenticate before creating the session if the agent
		// declares required protected resources. This avoids a wasted
		// round-trip where createSession fails with AuthRequired.
		const agentInfo = this._getRootState()?.agents.find(a => a.provider === this._config.provider);
		const protectedResources = agentInfo?.protectedResources ?? [];
		const hasRequiredAuth = protectedResources.some(r => r.required !== false);
		if (hasRequiredAuth && this._config.resolveAuthentication) {
			const authenticated = await this._config.resolveAuthentication(protectedResources);
			if (!authenticated) {
				throw new Error(localize('agentHost.authRequired', "Authentication is required to start a session. Please sign in and try again."));
			}
		}

		let session: URI;
		try {
			session = await this._config.connection.createSession({
				model: rawModelId,
				provider: this._config.provider,
				workingDirectory,
				fork,
				config,
			});
		} catch (err) {
			// If authentication is required (e.g. token expired), try interactive auth and retry once
			if (this._isAuthRequiredError(err) && this._config.resolveAuthentication) {
				this._logService.info('[AgentHost] Authentication required, prompting user...');
				const authenticated = await this._config.resolveAuthentication(protectedResources);
				if (authenticated) {
					session = await this._config.connection.createSession({
						model: rawModelId,
						provider: this._config.provider,
						workingDirectory,
						fork,
						config,
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
		const newSub = this._ensureSessionSubscription(session.toString());
		if (!this._getSessionState(session.toString())) {
			// Wait for the subscription to hydrate
			await new Promise<void>(resolve => {
				const d = newSub.onDidChange(() => { d.dispose(); resolve(); });
			});
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

	private _toLanguageModelId(sessionResource: URI, rawModelId: string | undefined): string | undefined {
		if (!rawModelId) {
			return undefined;
		}
		const prefix = `${sessionResource.scheme}:`;
		return rawModelId.startsWith(prefix) ? rawModelId : `${prefix}${rawModelId}`;
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

	// ---- Session subscription helpers ----------------------------------------

	/**
	 * Get or create a session subscription. The first call for a given URI
	 * triggers a server subscribe; subsequent calls increment the refcount.
	 */
	private _ensureSessionSubscription(sessionUri: string): IAgentSubscription<ISessionState> {
		let ref = this._sessionSubscriptions.get(sessionUri);
		if (!ref) {
			ref = this._config.connection.getSubscription(StateComponents.Session, URI.parse(sessionUri));
			this._sessionSubscriptions.set(sessionUri, ref);
		}
		return ref.object;
	}

	/**
	 * Release a session subscription, decrementing refcount and unsubscribing
	 * when it reaches zero.
	 */
	private _releaseSessionSubscription(sessionUri: string): void {
		const ref = this._sessionSubscriptions.get(sessionUri);
		if (ref) {
			this._sessionSubscriptions.delete(sessionUri);
			ref.dispose();
		}
	}

	/**
	 * Read the current optimistic session state for a backend session URI.
	 */
	private _getSessionState(sessionUri: string): ISessionState | undefined {
		const ref = this._sessionSubscriptions.get(sessionUri);
		if (!ref) {
			return undefined;
		}
		const value = ref.object.value;
		return (value && !(value instanceof Error)) ? value : undefined;
	}

	/**
	 * Read the current root state.
	 */
	private _getRootState(): IRootState | undefined {
		const value = this._config.connection.rootState.value;
		return (value && !(value instanceof Error)) ? value : undefined;
	}

	override dispose(): void {
		for (const [, session] of this._activeSessions) {
			session.dispose();
		}
		this._activeSessions.clear();
		this._sessionToBackend.clear();
		for (const ref of this._sessionSubscriptions.values()) {
			ref.dispose();
		}
		this._sessionSubscriptions.clear();
		super.dispose();
	}
}

// =============================================================================
// Client-provided tool helpers
// =============================================================================

/**
 * Converts an internal {@link IToolData} to a protocol {@link IToolDefinition}.
 */
export function toolDataToDefinition(tool: IToolData): IToolDefinition {
	return {
		name: tool.toolReferenceName ?? tool.id,
		title: tool.displayName,
		description: tool.modelDescription,
		inputSchema: tool.inputSchema?.type === 'object'
			? tool.inputSchema as IToolDefinition['inputSchema']
			: undefined,
	};
}

/**
 * Converts an internal {@link IToolResult} to a protocol
 * {@link import('../../../../../../platform/agentHost/common/state/protocol/state.js').IToolCallResult}.
 */
export function toolResultToProtocol(result: IToolResult, toolName: string): {
	success: boolean;
	pastTenseMessage: string;
	content?: ({ type: ToolResultContentType.Text; text: string } | { type: ToolResultContentType.EmbeddedResource; data: string; contentType: string })[];
	error?: { message: string };
} {
	const isError = !!result.toolResultError;
	const pastTense = typeof result.toolResultMessage === 'string'
		? result.toolResultMessage
		: result.toolResultMessage?.value
		?? (isError ? `${toolName} failed` : `Ran ${toolName}`);

	const content: ({ type: ToolResultContentType.Text; text: string } | { type: ToolResultContentType.EmbeddedResource; data: string; contentType: string })[] = [];
	for (const part of result.content) {
		if (part.kind === 'text') {
			content.push({ type: ToolResultContentType.Text, text: part.value });
		} else if (part.kind === 'data') {
			content.push({
				type: ToolResultContentType.EmbeddedResource,
				data: encodeBase64(part.value.data),
				contentType: part.value.mimeType,
			});
		}
	}

	return {
		success: !isError,
		pastTenseMessage: pastTense,
		content: content.length > 0 ? content : undefined,
		error: isError
			? { message: typeof result.toolResultError === 'string' ? result.toolResultError : `${toolName} encountered an error` }
			: undefined,
	};
}
