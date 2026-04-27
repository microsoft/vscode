/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Throttler } from '../../../../../../base/common/async.js';
import { encodeBase64 } from '../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { BugIndicatingError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableResourceMap, DisposableStore, IReference, MutableDisposable, toDisposable, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { autorun, derived, IObservable, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase, isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { AgentProvider, AgentSession, type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { SessionTruncatedAction } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { ConfirmationOptionKind, CustomizationRef, TerminalClaimKind, ToolResultContentType, type ConfirmationOption, type ProtectedResourceMetadata, type ToolDefinition } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ActionType, SessionTurnStartedAction, type ClientSessionAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { AttachmentType, buildSubagentSessionUri, getToolFileEdits, getToolSubagentContent, PendingMessageKind, ResponsePartKind, SessionInputAnswerState, SessionInputAnswerValueKind, SessionInputQuestionKind, SessionInputResponseKind, StateComponents, ToolCallCancellationReason, ToolCallConfirmationReason, ToolCallStatus, TurnState, type ICompletedToolCall, type MessageAttachment, type ModelSelection, type ResponsePart, type RootState, type SessionInputAnswer, type SessionInputRequest, type SessionState, type ToolCallState, type Turn } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { observableConfigValue } from '../../../../../../platform/observable/common/platformObservableUtils.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IAgentHostTerminalService } from '../../../../terminal/browser/agentHostTerminalService.js';
import { ITerminalChatService } from '../../../../terminal/browser/terminal.js';
import { ChatRequestQueueKind, ConfirmedReason, IChatProgress, IChatQuestion, IChatQuestionAnswers, IChatService, IChatToolInvocation, ToolConfirmKind, type IChatMultiSelectAnswer, type IChatSingleSelectAnswer, type IChatTerminalToolInvocationData } from '../../../common/chatService/chatService.js';
import { IChatSession, IChatSessionContentProvider, IChatSessionHistoryItem, IChatSessionItem, IChatSessionRequestHistoryItem } from '../../../common/chatSessionsService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../../common/constants.js';
import { IChatEditingService } from '../../../common/editing/chatEditingService.js';
import { ChatQuestionCarouselData } from '../../../common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { IChatAgentData, IChatAgentImplementation, IChatAgentRequest, IChatAgentResult, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ILanguageModelToolsService, IToolData, IToolInvocation, IToolResult, ToolInvocationPresentation } from '../../../common/tools/languageModelToolsService.js';
import { getAgentHostIcon } from '../agentSessions.js';
import { AgentHostEditingSession } from './agentHostEditingSession.js';
import { IAgentHostSessionWorkingDirectoryResolver } from './agentHostSessionWorkingDirectoryResolver.js';
import { activeTurnToProgress, completedToolCallToEditParts, completedToolCallToSerialized, finalizeToolInvocation, getTerminalContentUri, isSubagentTool, makeAhpTerminalToolSessionId, parseAhpTerminalToolSessionId, rawMarkdownToString, stringOrMarkdownToString, toolCallStateToInvocation, turnsToHistory, updateRunningToolSpecificData, type IToolCallFileEdit } from './stateToProgressAdapter.js';

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
	readonly onFileEdits?: (tc: ToolCallState, fileEdits: IToolCallFileEdit[]) => void;
}

/**
 * Per-tool bookkeeping for a client-provided tool invocation managed by
 * {@link AgentHostSessionHandler}. The invocation lifecycle (UI, confirmation,
 * execution) is driven by {@link ILanguageModelToolsService}; this entry
 * tracks the cancellation source, whether `invokeTool` has been called, and
 * the eventual result/error. When the tool call is cancelled externally via
 * session state, the entry's CTS is fired and `cts.token.isCancellationRequested`
 * is the signal that no protocol action should be dispatched (the server
 * already knows).
 */
interface IClientToolCallEntry {
	readonly invocation: ChatToolInvocation;
	readonly disposables: DisposableStore;
	readonly cts: CancellationTokenSource;
	/** The tool name, used when synthesizing a protocol result. */
	readonly toolName: string;
	/** `true` once {@link ILanguageModelToolsService.invokeTool} has been called. */
	invoked: boolean;
	/**
	 * `true` once we have dispatched {@link ActionType.SessionToolCallConfirmed}
	 * with `approved: true`. Used by the settle handler to decide whether to
	 * also dispatch {@link ActionType.SessionToolCallComplete}: pre-execution
	 * denials produce `approved: false` only (the server transitions the call
	 * to `Cancelled` on its own) and must not be followed by a `Complete`.
	 */
	approvedDispatched: boolean;
}

/**
 * Map a local {@link ConfirmedReason} (how the {@link ChatToolInvocation}
 * resolved its confirmation gate) to the protocol's
 * {@link ToolCallConfirmationReason}. Only called for approved reasons
 * ({@link ToolConfirmKind.Denied} / {@link ToolConfirmKind.Skipped} are
 * handled by the `approved: false` branch).
 */
function confirmedReasonToProtocol(reason: ConfirmedReason | undefined): ToolCallConfirmationReason {
	switch (reason?.type) {
		case ToolConfirmKind.ConfirmationNotNeeded:
			return ToolCallConfirmationReason.NotNeeded;
		case ToolConfirmKind.Setting:
		case ToolConfirmKind.LmServicePerTool:
			return ToolCallConfirmationReason.Setting;
		default:
			return ToolCallConfirmationReason.UserAction;
	}
}

/**
 * Converts carousel answers (IChatQuestionAnswers) to protocol
 * SessionInputAnswer records, handling text, single-select,
 * and multi-select answer shapes.
 */
export function convertCarouselAnswers(raw: IChatQuestionAnswers): Record<string, SessionInputAnswer> {
	const answers: Record<string, SessionInputAnswer> = {};
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

	readonly interruptActiveResponseCallback: IChatSession['interruptActiveResponseCallback'];
	readonly forkSession: IChatSession['forkSession'];

	constructor(
		readonly sessionResource: URI,
		readonly history: readonly IChatSessionHistoryItem[],
		private readonly _forkSession: ((request: IChatSessionRequestHistoryItem | undefined, token: CancellationToken) => Promise<IChatSessionItem>),
		initialProgress: IChatProgress[] | undefined,
		onDispose: () => void,
		interruptActiveResponse: () => boolean,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		const hasActiveTurn = initialProgress !== undefined;
		if (hasActiveTurn) {
			this.isCompleteObs.set(false, undefined);
			this.progressObs.set(initialProgress, undefined);
		}

		this._register(toDisposable(onDispose));

		// Always provide an interrupt callback so the chat UI's stop button
		// can cancel a remote turn at any time. The callback resolves the
		// current active turn at call time and dispatches SessionTurnCancelled.
		this.interruptActiveResponseCallback = async () => interruptActiveResponse();

		this.forkSession = this._forkSession;
	}

	override dispose(): void {
		// Fire `onWillDispose` BEFORE `super.dispose()` so listeners (notably
		// `ContributedChatSessionData` in `ChatSessionsService`) can evict
		// this session from their caches.
		if (!this._store.isDisposed) {
			this._onWillDispose.fire();
		}
		super.dispose();
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
		transaction(tx => {
			this.progressObs.set([], tx);
			this.isCompleteObs.set(false, tx);
		});
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
	readonly resolveAuthentication?: (protectedResources: ProtectedResourceMetadata[]) => Promise<boolean>;

	/**
	 * Observable set of agent-level customizations to include in the active
	 * client set. When the value changes, active sessions are updated.
	 */
	readonly customizations?: IObservable<CustomizationRef[]>;
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
	private readonly _pendingHistoryTurns = new ResourceMap<readonly Turn[]>();
	/** Turn IDs dispatched by this client, used to distinguish server-originated turns. */
	private readonly _clientDispatchedTurnIds = new Set<string>();
	private readonly _config: IAgentHostSessionHandlerConfig;

	/** Active session subscriptions, keyed by backend session URI string. */
	private readonly _sessionSubscriptions = new Map<string, IReference<IAgentSubscription<SessionState>>>();

	/** Observable of client-provided tools filtered by the allowlist and `when` clauses. */
	private readonly _clientToolsObs: IObservable<readonly IToolData[]>;
	/**
	 * Per-tool state for client-provided tool invocations that are managed
	 * locally. The `invocation` is created eagerly (in streaming state) so
	 * the UI has a handle, then {@link ILanguageModelToolsService.invokeTool}
	 * is called once parameters are available. An autorun on the
	 * invocation's state dispatches the corresponding protocol actions.
	 */
	private readonly _clientToolCalls = new Map<string, IClientToolCallEntry>();

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
					const modelId = this._toLanguageModelId(sessionResource, sessionState.summary.model?.id);
					history.push(...turnsToHistory(resolvedSession, sessionState.turns, this._config.agentId, this._config.connectionAuthority, modelId));

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
						initialProgress = activeTurnToProgress(resolvedSession, sessionState.activeTurn, this._config.connectionAuthority);
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
			() => {
				const backend = resolvedSession ?? this._sessionToBackend.get(sessionResource);
				if (!backend) {
					// Nothing to cancel. Treat as a successful noop so ChatService
					// does not install a phantom pending request.
					return true;
				}
				const sessionKey = backend.toString();
				const turnId = this._getSessionState(sessionKey)?.activeTurn?.id;
				if (!turnId) {
					// No active turn (likely a race with completion). Noop-success.
					return true;
				}
				this._logService.info(`[AgentHost] Cancellation requested for ${sessionKey}, dispatching turnCancelled`);
				this._config.connection.dispatch({
					type: ActionType.SessionTurnCancelled,
					session: sessionKey,
					turnId,
				});
				return true;
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
			resolvedSession = await this._createAndSubscribe(request.sessionResource, this._createModelSelection(request.userSelectedModelId, request.modelConfiguration), undefined, request.agentHostSessionConfig, getAgentHostBranchNameHint(request.message));
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

	private _dispatchAction(action: ClientSessionAction): void {
		this._config.connection.dispatch(action);
	}

	/**
	 * Dispatches `session/activeClientChanged` to claim the active client
	 * role for this session and publish the current customizations and
	 * client-provided tools.
	 */
	private _dispatchActiveClient(backendSession: URI, customizations: CustomizationRef[]): void {
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

		const processState = (sessionState: SessionState) => {
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
		const messageAttachments = this._convertVariablesToAttachments(request);

		// If the user selected a different model since the session was created
		// (or since the last turn), dispatch a model change action first so the
		// agent backend picks up the new model before processing the turn.
		const selectedModel = this._createModelSelection(request.userSelectedModelId, request.modelConfiguration);
		if (selectedModel) {
			const currentModel = this._getSessionState(session.toString())?.summary.model;
			if (!this._modelSelectionsEqual(currentModel, selectedModel)) {
				this._config.connection.dispatch({
					type: ActionType.SessionModelChanged,
					session: session.toString(),
					model: selectedModel,
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
				const truncateAction: SessionTruncatedAction = {
					type: ActionType.SessionTruncated,
					session: session.toString(),
				};
				this._config.connection.dispatch(truncateAction);
			} else {
				const seenAtIndex = protocolState.turns.findIndex(t => t.id === previousRequest!.id);
				if (seenAtIndex !== -1 && seenAtIndex < protocolState.turns.length - 1) {
					const truncateAction: SessionTruncatedAction = {
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
		const turnAction: SessionTurnStartedAction = {
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
		protocolOptions?: ConfirmationOption[],
	): void {
		IChatToolInvocation.awaitConfirmation(invocation, cancellationToken).then(reason => {
			// When the user picked a custom button, resolve the matching
			// protocol option so we can forward `selectedOptionId` and
			// derive approve/deny from the option's kind.
			let selectedOption: ConfirmationOption | undefined;
			if (reason.type === ToolConfirmKind.UserAction && reason.selectedButton && protocolOptions) {
				selectedOption = protocolOptions.find(o => o.id === reason.selectedButton);
			}

			const approved = selectedOption
				? selectedOption.kind === ConfirmationOptionKind.Approve
				: reason.type !== ToolConfirmKind.Denied && reason.type !== ToolConfirmKind.Skipped;

			this._logService.info(`[AgentHost] Tool confirmation: toolCallId=${toolCallId}, approved=${approved}, selectedOptionId=${selectedOption?.id}`);
			if (approved) {
				this._config.connection.dispatch({
					type: ActionType.SessionToolCallConfirmed,
					session: session.toString(),
					turnId,
					toolCallId,
					approved: true,
					confirmed: ToolCallConfirmationReason.UserAction,
					...(selectedOption ? { selectedOptionId: selectedOption.id } : {}),
				});
			} else {
				this._config.connection.dispatch({
					type: ActionType.SessionToolCallConfirmed,
					session: session.toString(),
					turnId,
					toolCallId,
					approved: false,
					reason: ToolCallCancellationReason.Denied,
					...(selectedOption ? { selectedOptionId: selectedOption.id } : {}),
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
		tc: ToolCallState,
		ctx: ITurnProcessingContext,
	): { invocation: ChatToolInvocation; fileEdits: IToolCallFileEdit[] } {
		const toolCallId = tc.toolCallId;
		let fileEdits: IToolCallFileEdit[] = [];

		if (tc.status === ToolCallStatus.PendingConfirmation) {
			// Running → PendingConfirmation (re-confirmation).
			const existingState = existing.state.get();
			if (existingState.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
				existing.didExecuteTool(undefined);
				const confirmInvocation = toolCallStateToInvocation(tc, undefined, ctx.backendSession, this._config.connectionAuthority);
				ctx.activeToolInvocations.set(toolCallId, confirmInvocation);
				ctx.progress([confirmInvocation]);
				this._awaitToolConfirmation(confirmInvocation, toolCallId, ctx.backendSession, ctx.turnId, ctx.cancellationToken, tc.options);
				existing = confirmInvocation;
			}
		} else if (tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.PendingResultConfirmation) {
			existing.invocationMessage = stringOrMarkdownToString(tc.invocationMessage, this._config.connectionAuthority);
			this._reviveTerminalIfNeeded(existing, tc, ctx.backendSession);
			updateRunningToolSpecificData(existing, tc, this._config.connectionAuthority);
		}

		// Finalize terminal-state tools
		if ((tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Cancelled) && !IChatToolInvocation.isComplete(existing)) {
			// Revive terminal before finalizing — handles the case where
			// Running was skipped due to throttling and terminal content
			// only appears at Completed time.
			this._reviveTerminalIfNeeded(existing, tc, ctx.backendSession);
			fileEdits = finalizeToolInvocation(existing, tc, ctx.backendSession, this._config.connectionAuthority);
		}

		return { invocation: existing, fileEdits };
	}

	// ---- Client tool execution ----------------------------------------------

	/**
	 * Begin a client-provided tool invocation locally. Creates a
	 * {@link ChatToolInvocation} in the streaming state via
	 * {@link ILanguageModelToolsService.beginToolCall} so the UI has a
	 * handle as soon as the tool call first appears in session state.
	 *
	 * A single autorun observes the invocation's state machine and drives
	 * all protocol dispatches:
	 * - `Executing` → `SessionToolCallConfirmed(approved: true)`
	 * - `Cancelled` (pre-execution denial) → `SessionToolCallConfirmed(approved: false)`
	 * - `Completed` / post-execution `Cancelled` → `SessionToolCallComplete`
	 *
	 * When the tool call is cancelled externally via session state, the
	 * entry's cancellation source is fired and `CancellationTokenSource` is
	 * cancelled so the autorun skips redundant dispatches (the server already knows).
	 *
	 * The actual {@link ILanguageModelToolsService.invokeTool} call is
	 * deferred until {@link _tryInvokeClientTool} sees the tool parameters.
	 */
	private _beginClientToolInvocation(tc: ToolCallState, ctx: ITurnProcessingContext): void {
		const toolCallId = tc.toolCallId;

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
			return;
		}

		const invocation = this._toolsService.beginToolCall({
			toolCallId,
			toolId: toolData.id,
			sessionResource: ctx.sessionResource,
			force: true,
		}) as ChatToolInvocation | undefined;

		if (!invocation) {
			this._logService.warn(`[AgentHost] Failed to begin client tool invocation: ${tc.toolName}`);
			this._dispatchAction({
				type: ActionType.SessionToolCallComplete,
				session: ctx.backendSession.toString(),
				turnId: ctx.turnId,
				toolCallId,
				result: {
					success: false,
					pastTenseMessage: `Failed to start ${tc.toolName}`,
					error: { message: `Could not create invocation for client tool "${tc.toolName}"` },
				},
			});
			return;
		}

		const disposables = new DisposableStore();
		const cts = new CancellationTokenSource();
		disposables.add(toDisposable(() => cts.dispose(true)));

		const entry: IClientToolCallEntry = {
			invocation,
			disposables,
			cts,
			toolName: tc.toolName,
			invoked: false,
			approvedDispatched: false,
		};
		this._clientToolCalls.set(toolCallId, entry);
		ctx.activeToolInvocations.set(toolCallId, invocation);

		// Autorun drives the `SessionToolCallConfirmed` dispatch only. The
		// `SessionToolCallComplete` dispatch happens from `_handleClientToolSettled`
		// after `invokeTool` has resolved (or rejected) and the result/error is
		// actually available — otherwise we would race the microtask that
		// stashes the result onto the entry against the synchronous state
		// transition `didExecuteTool(...)` makes when the tool finishes.
		let confirmationDispatched = false;
		disposables.add(autorun(reader => {
			const state = invocation.state.read(reader);
			if (confirmationDispatched) {
				return;
			}
			if (state.type === IChatToolInvocation.StateKind.Executing) {
				confirmationDispatched = true;
				if (!cts.token.isCancellationRequested) {
					entry.approvedDispatched = true;
					this._dispatchAction({
						type: ActionType.SessionToolCallConfirmed,
						session: ctx.backendSession.toString(),
						turnId: ctx.turnId,
						toolCallId,
						approved: true,
						confirmed: confirmedReasonToProtocol(state.confirmed),
					});
				}
			} else if (state.type === IChatToolInvocation.StateKind.Cancelled) {
				// Pre-execution cancellation. Two sub-cases:
				// 1. User denied (or a hook denied): dispatch `approved: false`
				//    so the server transitions the call to `Cancelled`. No
				//    `Complete` dispatch follows — `approvedDispatched` stays
				//    `false` so the settle handler will skip it.
				// 2. The server already reported the call as cancelled and we
				//    fired our own CTS: `cts.token.isCancellationRequested` is
				//    `true`, suppress the dispatch (the server already knows)
				//    and just unwind the local invocation.
				confirmationDispatched = true;
				if (!cts.token.isCancellationRequested) {
					this._dispatchAction({
						type: ActionType.SessionToolCallConfirmed,
						session: ctx.backendSession.toString(),
						turnId: ctx.turnId,
						toolCallId,
						approved: false,
						reason: ToolCallCancellationReason.Denied,
					});
				}
				// If `invokeTool` was never called (cancel arrived before
				// parameters) there is no settle handler to clean us up.
				if (!entry.invoked) {
					this._disposeClientToolCall(toolCallId);
				}
			}
		}));
	}

	/**
	 * Invoke the client tool once parameters are available. On the first
	 * state update that carries `toolInput` (or once the call has moved past
	 * `Streaming`, to accommodate zero-argument tools that may never carry
	 * a `toolInput`), parses parameters and calls
	 * {@link ILanguageModelToolsService.invokeTool}, which reuses the
	 * streaming invocation created in {@link _beginClientToolInvocation}.
	 * Settlement is handled by {@link _handleClientToolSettled}.
	 */
	private _tryInvokeClientTool(tc: ToolCallState, ctx: ITurnProcessingContext): void {
		const entry = this._clientToolCalls.get(tc.toolCallId);
		if (!entry || entry.invoked || entry.cts.token.isCancellationRequested) {
			return;
		}
		// eslint-disable-next-line local/code-no-in-operator
		let toolInput = 'toolInput' in tc ? tc.toolInput : undefined;
		if (toolInput === undefined) {
			// Don't invoke while still streaming — parameters may still be
			// arriving. Once the call has moved to any post-streaming status,
			// a missing `toolInput` is treated as an empty JSON object so
			// zero-argument tools are not stuck forever.
			if (tc.status === ToolCallStatus.Streaming) {
				return;
			}
			toolInput = '{}';
		}
		const toolCallId = tc.toolCallId;
		entry.invoked = true;

		let parameters: Record<string, unknown> = {};
		try {
			const parsed: unknown = JSON.parse(toolInput);
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
			this._disposeClientToolCall(toolCallId);
			return;
		}

		const invocation: IToolInvocation = {
			callId: toolCallId,
			toolId: entry.invocation.toolId,
			parameters,
			context: { sessionResource: ctx.sessionResource },
			chatStreamToolCallId: toolCallId,
		};

		const noOpCountTokens = async () => 0;

		this._logService.info(`[AgentHost] Invoking client tool: ${tc.toolName} (callId=${toolCallId})`);

		this._toolsService.invokeTool(
			invocation,
			noOpCountTokens,
			entry.cts.token,
		).then(
			result => this._handleClientToolSettled(toolCallId, ctx, result, undefined),
			err => this._handleClientToolSettled(toolCallId, ctx, undefined, err),
		);
	}

	/**
	 * Called when {@link ILanguageModelToolsService.invokeTool} settles for
	 * a client tool. Dispatches `SessionToolCallComplete` when appropriate,
	 * then disposes the entry. Rules:
	 *
	 * - External cancellation (`cts.token.isCancellationRequested`): the
	 *   server already marked the call as `Cancelled`; suppress all
	 *   dispatches and just clean up.
	 * - Approved path (`approvedDispatched === true`): the tool actually
	 *   ran (or attempted to run), so dispatch the result/error as a
	 *   `Complete`.
	 * - Pre-execution denial (`approvedDispatched === false`,
	 *   `CancellationError`): the autorun already dispatched
	 *   `Confirmed(approved: false)`; the server transitions the call
	 *   itself, no `Complete` follows.
	 */
	private _handleClientToolSettled(
		toolCallId: string,
		ctx: ITurnProcessingContext,
		result: IToolResult | undefined,
		err: unknown,
	): void {
		const entry = this._clientToolCalls.get(toolCallId);
		if (!entry) {
			return;
		}

		if (entry.cts.token.isCancellationRequested) {
			this._disposeClientToolCall(toolCallId);
			return;
		}

		if (!entry.approvedDispatched) {
			if (err !== undefined && !isCancellationError(err)) {
				this._logService.warn(`[AgentHost] Client tool rejected pre-execution: ${entry.toolName}`, err);
			}
			this._disposeClientToolCall(toolCallId);
			return;
		}

		if (err !== undefined) {
			if (!isCancellationError(err)) {
				this._logService.warn(`[AgentHost] Client tool invocation failed: ${entry.toolName}`, err);
			}
			const message = err instanceof Error ? err.message : String(err);
			result = { content: [], toolResultError: message };
		}

		this._dispatchAction({
			type: ActionType.SessionToolCallComplete,
			session: ctx.backendSession.toString(),
			turnId: ctx.turnId,
			toolCallId,
			result: toolResultToProtocol(result ?? { content: [] }, entry.toolName),
		});
		this._disposeClientToolCall(toolCallId);
	}

	/**
	 * Cancel an ongoing client-tool invocation in response to the session
	 * state reporting the tool call as cancelled. Fires the entry's
	 * cancellation source — this signals both
	 * {@link ILanguageModelToolsService.invokeTool} (which unwinds and
	 * rejects with a {@link CancellationError}) and the autorun / settle
	 * handler (via `cts.token.isCancellationRequested`) to skip any
	 * redundant protocol dispatches. If `invokeTool` was never called
	 * (cancel arrived before parameters), we also have to force the local
	 * invocation out of `Streaming` and dispose ourselves, since no
	 * settle handler will run.
	 */
	private _cancelClientToolInvocation(toolCallId: string): void {
		const entry = this._clientToolCalls.get(toolCallId);
		if (!entry || entry.cts.token.isCancellationRequested) {
			return;
		}
		entry.cts.cancel();
		if (!entry.invoked) {
			// No `invokeTool` is listening to the CTS — transition the
			// invocation to `Cancelled` ourselves so the UI settles, then
			// clean up. The autorun will fire on the state change but
			// suppresses its dispatch because `isCancellationRequested` is
			// now true.
			entry.invocation.cancelFromStreaming(ToolConfirmKind.Skipped);
			this._disposeClientToolCall(toolCallId);
		}
	}

	private _disposeClientToolCall(toolCallId: string): void {
		const entry = this._clientToolCalls.get(toolCallId);
		if (entry) {
			entry.disposables.dispose();
			this._clientToolCalls.delete(toolCallId);
		}
	}

	/**
	 * Detects terminal content in a tool call and creates a local terminal
	 * instance backed by the agent host connection. Updates the invocation's
	 * `toolSpecificData` to `kind: 'terminal'` and clears
	 * `HiddenAfterComplete` so the terminal UI stays visible.
	 */
	private _reviveTerminalIfNeeded(
		invocation: ChatToolInvocation,
		tc: ToolCallState,
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
		sessionState: SessionState,
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
							ctx.progress([{ kind: 'markdownContent', content: rawMarkdownToString(delta, this._config.connectionAuthority, { supportHtml: true }) }]);
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
							// Client tools: create a ChatToolInvocation up front in streaming
							// state via beginToolCall so the UI has a handle, then invoke
							// once tool input is available. invokeTool reuses the pending
							// invocation, so there is a single UI throughout the lifecycle.
							if (tc.toolClientId === this._config.connection.clientId) {
								this._beginClientToolInvocation(tc, ctx);
								this._tryInvokeClientTool(tc, ctx);
								break;
							}

							existing = toolCallStateToInvocation(tc, undefined, ctx.backendSession, this._config.connectionAuthority);
							ctx.activeToolInvocations.set(tc.toolCallId, existing);
							ctx.progress([existing]);

							if (tc.status === ToolCallStatus.PendingConfirmation) {
								this._awaitToolConfirmation(existing, tc.toolCallId, ctx.backendSession, ctx.turnId, ctx.cancellationToken, tc.options);
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
							// Client tools: invokeTool owns the UI lifecycle once invoked.
							// Drive invocation from later updates when toolInput arrives,
							// and cancel locally if the server reports the call cancelled.
							if (this._clientToolCalls.has(tc.toolCallId)) {
								if (tc.status === ToolCallStatus.Cancelled) {
									this._cancelClientToolInvocation(tc.toolCallId);
								} else {
									this._tryInvokeClientTool(tc, ctx);
								}
								break;
							}
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
		inputRequests: readonly SessionInputRequest[] | undefined,
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
		inputReq: SessionInputRequest,
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
				title: inputReq.message ?? '',
				required: true,
			});
		}

		const carousel = new ChatQuestionCarouselData(
			questions,
			/* allowSkip */ true,
			/* resolveId */ undefined,
			/* data */ undefined,
			/* isUsed */ undefined,
			/* message */ inputReq.message ? rawMarkdownToString(inputReq.message, this._config.connectionAuthority) : undefined,
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
		sessionState: SessionState,
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
				if (existing && !observedSubagentToolIds.has(tc.toolCallId) && (isSubagentTool(tc) || ((tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Completed) && getToolSubagentContent(tc)))) {
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
										const serialized = completedToolCallToSerialized(completedTc, toolCallId, URI.parse(childSessionUri), this._config.connectionAuthority);
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
		const processChildParts = (responseParts: readonly ResponsePart[], turnId: string) => {
			for (const rp of responseParts) {
				if (rp.kind === ResponsePartKind.ToolCall) {
					const tc = rp.toolCall;
					let existing = activeChildToolInvocations.get(tc.toolCallId);

					if (!existing) {
						existing = toolCallStateToInvocation(tc, parentToolCallId, URI.parse(childSessionUri), this._config.connectionAuthority);
						activeChildToolInvocations.set(tc.toolCallId, existing);
						emitProgress([existing]);

						if (tc.status === ToolCallStatus.PendingConfirmation) {
							this._awaitToolConfirmation(existing, tc.toolCallId, URI.parse(childSessionUri), turnId, childCts.token, tc.options);
						}
					} else if (tc.status === ToolCallStatus.PendingConfirmation) {
						const existingState = existing.state.get();
						if (existingState.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
							existing.didExecuteTool(undefined);
							const confirmInvocation = toolCallStateToInvocation(tc, parentToolCallId, URI.parse(childSessionUri), this._config.connectionAuthority);
							activeChildToolInvocations.set(tc.toolCallId, confirmInvocation);
							emitProgress([confirmInvocation]);
							this._awaitToolConfirmation(confirmInvocation, tc.toolCallId, URI.parse(childSessionUri), turnId, childCts.token, tc.options);
						}
					} else if (tc.status === ToolCallStatus.Running) {
						updateRunningToolSpecificData(existing, tc, this._config.connectionAuthority);
					}

					if (existing && (tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Cancelled) && !IChatToolInvocation.isComplete(existing)) {
						finalizeToolInvocation(existing, tc, URI.parse(childSessionUri), this._config.connectionAuthority);
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

		// Wire up awaitConfirmation for tool calls that were already pending
		// confirmation at snapshot time so the user can approve/deny them.
		// Also start observing any subagent tools that were already running.
		const cts = new CancellationTokenSource();
		reconnectDisposables.add(toDisposable(() => cts.dispose(true)));
		for (const [toolCallId, invocation] of activeToolInvocations) {
			if (!IChatToolInvocation.isComplete(invocation)) {
				// Look up the tool call state to forward protocol options on reconnection
				const tcState = currentState?.activeTurn?.responseParts.find(
					rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === toolCallId
				);
				const tcOptions = tcState?.kind === ResponsePartKind.ToolCall && tcState.toolCall.status === ToolCallStatus.PendingConfirmation
					? tcState.toolCall.options
					: undefined;
				this._awaitToolConfirmation(invocation, toolCallId, backendSession, turnId, cts.token, tcOptions);
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
		const processStateChange = (sessionState: SessionState) => {
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
		tc: ToolCallState,
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
	private async _createAndSubscribe(sessionResource: URI, model: ModelSelection | undefined, fork?: { session: URI; turnIndex: number; turnId: string }, sessionConfig?: Record<string, unknown>, branchNameHint?: string): Promise<URI> {
		const config = branchNameHint ? { ...sessionConfig, [SessionConfigKey.BranchNameHint]: branchNameHint } : sessionConfig;
		const workingDirectory = this._resolveRequestedWorkingDirectory(sessionResource);

		this._logService.trace(`[AgentHost] Creating new session, model=${model?.id ?? '(default)'}, provider=${this._config.provider}${fork ? `, fork from ${fork.session.toString()} at index ${fork.turnIndex}` : ''}`);

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

		const activeClient = {
			clientId: this._config.connection.clientId,
			tools: this._clientToolsObs.get().map(toolDataToDefinition),
			customizations: this._config.customizations?.get() ?? [],
		};

		let session: URI;
		try {
			session = await this._config.connection.createSession({
				model,
				provider: this._config.provider,
				workingDirectory,
				fork,
				config,
				activeClient,
			});
		} catch (err) {
			// If authentication is required (e.g. token expired), try interactive auth and retry once
			if (this._isAuthRequiredError(err) && this._config.resolveAuthentication) {
				this._logService.info('[AgentHost] Authentication required, prompting user...');
				const authenticated = await this._config.resolveAuthentication(protectedResources);
				if (authenticated) {
					session = await this._config.connection.createSession({
						model,
						provider: this._config.provider,
						workingDirectory,
						fork,
						config,
						activeClient,
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

	private _createModelSelection(languageModelIdentifier: string | undefined, modelConfiguration: Record<string, unknown> | undefined): ModelSelection | undefined {
		const rawModelId = this._extractRawModelId(languageModelIdentifier);
		if (!rawModelId) {
			return undefined;
		}

		const config: Record<string, string> = {};
		for (const [key, value] of Object.entries(modelConfiguration ?? {})) {
			if (typeof value === 'string') {
				config[key] = value;
			}
		}

		return Object.keys(config).length > 0 ? { id: rawModelId, config } : { id: rawModelId };
	}

	private _modelSelectionsEqual(a: ModelSelection | undefined, b: ModelSelection | undefined): boolean {
		if (a?.id !== b?.id) {
			return false;
		}

		const aConfig = a?.config ?? {};
		const bConfig = b?.config ?? {};
		const aKeys = Object.keys(aConfig);
		const bKeys = Object.keys(bConfig);
		return aKeys.length === bKeys.length && aKeys.every(key => aConfig[key] === bConfig[key]);
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

	private _resolveRequestedWorkingDirectory(sessionResource: URI): URI | undefined {
		return this._config.resolveWorkingDirectory?.(sessionResource)
			?? this._workingDirectoryResolver.resolve(sessionResource)
			?? this._workspaceContextService.getWorkspace().folders[0]?.uri;
	}

	private _convertVariablesToAttachments(request: IChatAgentRequest): MessageAttachment[] {
		const attachments: MessageAttachment[] = [];
		for (const v of request.variables.variables) {
			if (v.kind === 'file') {
				const uri = v.value instanceof URI ? v.value : undefined;
				if (uri?.scheme === 'file') {
					const attachmentUri = this._rebaseAttachmentUri(uri, request.sessionResource);
					attachments.push({ type: AttachmentType.File, uri: attachmentUri.toString(), displayName: v.name });
				}
			} else if (v.kind === 'directory') {
				const uri = v.value instanceof URI ? v.value : undefined;
				if (uri?.scheme === 'file') {
					const attachmentUri = this._rebaseAttachmentUri(uri, request.sessionResource);
					attachments.push({ type: AttachmentType.Directory, uri: attachmentUri.toString(), displayName: v.name });
				}
			} else if (v.kind === 'implicit' && v.isSelection) {
				const uri = v.uri;
				if (uri?.scheme === 'file') {
					const attachmentUri = this._rebaseAttachmentUri(uri, request.sessionResource);
					attachments.push({ type: AttachmentType.Selection, uri: attachmentUri.toString(), displayName: v.name });
				}
			}
		}
		if (attachments.length > 0) {
			this._logService.trace(`[AgentHost] Converted ${attachments.length} attachments from ${request.variables.variables.length} variables`);
		}
		return attachments;
	}

	/**
	 * Rebase a `file:`-scheme attachment URI from the session's requested
	 * working directory onto the server-resolved working directory. This
	 * matters on the first turn of a worktree-isolated session, where the
	 * provider creates a worktree under a different path than the workspace
	 * folder the workbench attached the file from. Returns the URI unchanged
	 * if the requested and resolved directories match, the URI is not under
	 * the requested directory, or either side is unavailable.
	 */
	private _rebaseAttachmentUri(uri: URI, sessionResource: URI): URI {
		const requestedDir = this._resolveRequestedWorkingDirectory(sessionResource);
		if (!requestedDir || requestedDir.scheme !== 'file') {
			return uri;
		}
		const backendSession = this._sessionToBackend.get(sessionResource);
		const rawResolvedDir = backendSession ? this._getSessionState(backendSession.toString())?.summary.workingDirectory : undefined;
		const resolvedDir = typeof rawResolvedDir === 'string' ? URI.parse(rawResolvedDir) : rawResolvedDir;
		if (!resolvedDir || resolvedDir.scheme !== 'file') {
			return uri;
		}
		if (extUriBiasedIgnorePathCase.isEqual(requestedDir, resolvedDir)) {
			return uri;
		}
		if (!extUriBiasedIgnorePathCase.isEqualOrParent(uri, requestedDir)) {
			return uri;
		}
		const rel = extUriBiasedIgnorePathCase.relativePath(requestedDir, uri);
		if (rel === undefined) {
			return uri;
		}
		if (rel === '') {
			return resolvedDir;
		}
		return URI.joinPath(resolvedDir, ...rel.split('/'));
	}

	// ---- Lifecycle ----------------------------------------------------------

	// ---- Session subscription helpers ----------------------------------------

	/**
	 * Get or create a session subscription. The first call for a given URI
	 * triggers a server subscribe; subsequent calls increment the refcount.
	 */
	private _ensureSessionSubscription(sessionUri: string): IAgentSubscription<SessionState> {
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
	private _getSessionState(sessionUri: string): SessionState | undefined {
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
	private _getRootState(): RootState | undefined {
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
		for (const toolCallId of Array.from(this._clientToolCalls.keys())) {
			this._disposeClientToolCall(toolCallId);
		}
		super.dispose();
	}
}

// =============================================================================
// Client-provided tool helpers
// =============================================================================

/**
 * Converts an internal {@link IToolData} to a protocol {@link ToolDefinition}.
 */
export function toolDataToDefinition(tool: IToolData): ToolDefinition {
	return {
		name: tool.toolReferenceName ?? tool.id,
		title: tool.displayName,
		description: tool.modelDescription,
		inputSchema: tool.inputSchema?.type === 'object'
			? tool.inputSchema as ToolDefinition['inputSchema']
			: undefined,
	};
}

/**
 * Converts an internal {@link IToolResult} to a protocol
 * {@link import('../../../../../../platform/agentHost/common/state/protocol/state.js').ToolCallResult}.
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
