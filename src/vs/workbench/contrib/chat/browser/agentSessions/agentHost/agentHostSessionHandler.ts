/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeBase64 } from '../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableResourceMap, DisposableStore, IReference, MutableDisposable, toDisposable, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { autorun, autorunPerKeyedItem, derived, IObservable, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase, isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { AgentProvider, AgentSession, type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { IAgentSubscription, observableFromSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { SessionTruncatedAction } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { ConfirmationOptionKind, CustomizationRef, TerminalClaimKind, ToolResultContentType, type ConfirmationOption, type ProtectedResourceMetadata, type ToolDefinition } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ActionType, SessionTurnStartedAction, type ClientSessionAction, type SessionAction, type SessionInputCompletedAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { AttachmentType, buildSubagentSessionUri, getToolFileEdits, getToolSubagentContent, PendingMessageKind, ResponsePartKind, SessionInputAnswerState, SessionInputAnswerValueKind, SessionInputQuestionKind, SessionInputResponseKind, StateComponents, ToolCallCancellationReason, ToolCallConfirmationReason, ToolCallStatus, TurnState, type ICompletedToolCall, type MarkdownResponsePart, type MessageAttachment, type ModelSelection, type ReasoningResponsePart, type RootState, type SessionInputAnswer, type SessionInputRequest, type SessionState, type ToolCallResponsePart, type ToolCallState, type Turn } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { observableConfigValue } from '../../../../../../platform/observable/common/platformObservableUtils.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IAgentHostTerminalService } from '../../../../terminal/browser/agentHostTerminalService.js';
import { ITerminalChatService } from '../../../../terminal/browser/terminal.js';
import { IChatWidgetService } from '../../chat.js';
import { ChatRequestQueueKind, ConfirmedReason, IChatProgress, IChatQuestion, IChatQuestionAnswers, IChatService, IChatToolInvocation, ToolConfirmKind, type IChatMultiSelectAnswer, type IChatQuestionAnswerValue, type IChatSingleSelectAnswer, type IChatTerminalToolInvocationData } from '../../../common/chatService/chatService.js';
import { IChatSession, IChatSessionContentProvider, IChatSessionHistoryItem, IChatSessionItem, IChatSessionRequestHistoryItem } from '../../../common/chatSessionsService.js';
import { getChatSessionType } from '../../../common/model/chatUri.js';
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
 * Options threaded into {@link AgentHostSessionHandler._observeTurn}. The
 * same observation pipeline is used for live (`_handleTurn`), reconnected
 * (snapshot from `provideChatSessionContent`), and server-initiated turns
 * (`_watchForServerInitiatedTurns`). The differences are captured here:
 *
 * - {@link sink} routes emitted progress to either the agent invoke
 *   callback (live) or `chatSession.appendProgress` (reconnect /
 *   server-initiated).
 * - {@link adoptInvocations} carries `ChatToolInvocation` instances that
 *   `activeTurnToProgress` already produced so per-tool setup adopts them
 *   rather than recreating UI handles.
 * - {@link seedEmittedLengths} prevents the always-on graph from re-emitting
 *   markdown / reasoning prefixes already covered by the snapshot.
 * - {@link onTurnEnded} fires once when the turn reaches a terminal state.
 */
interface IObserveTurnOptions {
	readonly backendSession: URI;
	readonly sessionResource: URI;
	readonly turnId: string;
	readonly sink: (parts: IChatProgress[]) => void;
	readonly cancellationToken: CancellationToken;
	readonly adoptInvocations?: ReadonlyMap<string, ChatToolInvocation>;
	readonly seedEmittedLengths?: ReadonlyMap<string, number>;
	readonly onTurnEnded?: (lastTurn: Turn | undefined) => void;
	readonly onFileEdits?: (tc: ToolCallState, fileEdits: IToolCallFileEdit[]) => void;
	/**
	 * When set, this turn is being observed as part of a subagent session.
	 * Tool calls emitted into {@link sink} are tagged with this id so the
	 * renderer groups them under the parent subagent widget. Markdown,
	 * reasoning, and input requests are not forwarded (the subagent's own
	 * session view renders those); nested subagent observation is also
	 * suppressed to preserve legacy behavior.
	 */
	readonly subAgentInvocationId?: string;
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

function convertProtocolAnswer(answer: SessionInputAnswer): IChatQuestionAnswerValue | undefined {
	if (answer.state !== SessionInputAnswerState.Submitted) {
		return undefined;
	}
	switch (answer.value.kind) {
		case SessionInputAnswerValueKind.Text:
			return answer.value.value;
		case SessionInputAnswerValueKind.Number:
		case SessionInputAnswerValueKind.Boolean:
			return String(answer.value.value);
		case SessionInputAnswerValueKind.Selected:
			return {
				selectedValue: answer.value.value,
				freeformValue: answer.value.freeformValues?.[0],
			};
		case SessionInputAnswerValueKind.SelectedMany:
			return {
				selectedValues: answer.value.value,
				freeformValue: answer.value.freeformValues?.[0],
			};
	}
}

function convertProtocolAnswers(raw: Record<string, SessionInputAnswer> | undefined): IChatQuestionAnswers | undefined {
	if (!raw) {
		return undefined;
	}
	const answers: IChatQuestionAnswers = {};
	for (const [questionId, answer] of Object.entries(raw)) {
		const converted = convertProtocolAnswer(answer);
		if (converted !== undefined) {
			answers[questionId] = converted;
		}
	}
	return Object.keys(answers).length > 0 ? answers : undefined;
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
	/** Whether a final-looking chat resource is still a client-side draft. */
	readonly isNewSession?: (sessionResource: URI) => boolean;
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
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
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
			for (const [sessionResource] of this._activeSessions) {
				const backendSession = this._resolveSessionUri(sessionResource);
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
				for (const [sessionResource] of this._activeSessions) {
					const backendSession = this._resolveSessionUri(sessionResource);
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
		if (sessionResource.path.substring(1).startsWith('untitled-')) {
			throw new Error(`Agent host chat sessions must be created by the sessions provider: ${sessionResource.toString()}`);
		}

		// For new sessions, defer backend session creation until the first request
		// arrives so the user-selected model is available. The chat resource still
		// carries the raw session id that will be used when createSession runs.
		const resolvedSession = this._resolveSessionUri(sessionResource);

		// The point of this is to check with the session provider or controller
		// whether this session resource represents a new session that hasn't yet
		// been created on the backend.
		const isNewSession = this._isNewSessionResource(sessionResource);
		const history: IChatSessionHistoryItem[] = [];
		let initialProgress: IChatProgress[] | undefined;
		let activeTurnId: string | undefined;
		if (!isNewSession) {
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
				if (!this._getSessionState(resolvedSession.toString())) {
					throw new Error('Cannot fork session before the initial request');
				}

				return this._forkSession(sessionResource, resolvedSession, request, token);
			},
			initialProgress,
			() => {
				this._activeSessions.delete(sessionResource);
				this._pendingMessageSubscriptions.deleteAndDispose(sessionResource);
				this._serverTurnWatchers.deleteAndDispose(sessionResource);
				this._pendingHistoryTurns.delete(sessionResource);
				this._releaseSessionSubscription(resolvedSession.toString());
			},
			() => {
				const sessionKey = resolvedSession.toString();
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

		if (!isNewSession) {
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

			// For existing sessions, start watching for server-initiated turns
			// immediately. For new sessions, this is deferred to _createAndSubscribe.
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

		const resolvedSession = this._resolveSessionUri(request.sessionResource);
		if (!this._getSessionState(resolvedSession.toString())) {
			await this._createAndSubscribe(request.sessionResource, this._createModelSelection(request.userSelectedModelId, request.modelConfiguration), undefined, request.agentHostSessionConfig, getAgentHostBranchNameHint(request.message));
		}

		await this._handleTurn(resolvedSession, request, progress, cancellationToken);

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
		const cts = new CancellationTokenSource();
		turnDisposables.add(toDisposable(() => cts.dispose(true)));
		turnDisposables.add(this._observeTurn({
			backendSession,
			sessionResource: chatSession.sessionResource,
			turnId,
			sink: parts => chatSession.appendProgress(parts),
			cancellationToken: cts.token,
			onTurnEnded: () => chatSession.isCompleteObs.set(true, undefined),
		}));
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

		// Wait for the turn to reach a terminal state. The observable graph
		// installed below drives all progress emission via the `progress`
		// sink and resolves the promise from `onTurnEnded`. Cancellation is
		// surfaced through the same path: the observer disposes itself when
		// `cancellationToken` fires, then calls `onTurnEnded(undefined)`.
		await new Promise<void>(resolve => {
			const store = new DisposableStore();
			const cancelSub = store.add(cancellationToken.onCancellationRequested(() => {
				cancelSub.dispose();
				this._logService.info(`[AgentHost] Cancellation requested for ${session.toString()}, dispatching turnCancelled`);
				this._config.connection.dispatch({
					type: ActionType.SessionTurnCancelled,
					session: session.toString(),
					turnId,
				});
			}));

			store.add(this._observeTurn({
				backendSession: session,
				sessionResource: request.sessionResource,
				turnId,
				sink: progress,
				cancellationToken,
				onTurnEnded: () => {
					store.dispose();
					this._clientDispatchedTurnIds.delete(turnId);
					this._activeSessions.get(request.sessionResource)?.isCompleteObs.set(true, undefined);
					resolve();
				},
				onFileEdits: (tc) => {
					const editParts = this._hydrateFileEdits(request.sessionResource, request.requestId, tc);
					if (editParts.length > 0) {
						progress(editParts);
					}
				},
			}));
		});
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

	// ---- Per-turn observable graph ------------------------------------------

	/**
	 * Installs the always-on observable graph that translates session state
	 * into `IChatProgress[]` for a specific turn. The same graph is used for:
	 *   - live turns started by the user via {@link _handleTurn},
	 *   - reconnect to an in-flight turn from {@link provideChatSessionContent},
	 *   - server-initiated turns detected by {@link _watchForServerInitiatedTurns}.
	 *
	 * Differences are captured in {@link IObserveTurnOptions.sink} (where
	 * progress is delivered) and {@link IObserveTurnOptions.adoptInvocations} /
	 * {@link IObserveTurnOptions.seedEmittedLengths} (snapshot continuity for
	 * the reconnect case).
	 *
	 * The returned disposable owns the entire per-turn graph, including the
	 * underlying session subscription reference.
	 */
	private _observeTurn(opts: IObserveTurnOptions): IDisposable {
		const sessionKey = opts.backendSession.toString();
		const store = new DisposableStore();
		// `_ensureSessionSubscription` returns a process-shared, non-refcounted
		// subscription owned by the chat session lifecycle. Do NOT release it
		// from here — other callers (the server-turn watcher, reconnect, the
		// history hydration code) share the same instance and would lose
		// their state if we tore it down.
		const sub = this._ensureSessionSubscription(sessionKey);

		const sessionState$ = observableFromSubscription(this, sub);
		const turn$ = derived(reader => {
			const state = sessionState$.read(reader);
			if (!state) {
				return undefined;
			}
			return state.activeTurn?.id === opts.turnId
				? state.activeTurn
				: state.turns.find(t => t.id === opts.turnId);
		});
		const responseParts$ = derived(reader => turn$.read(reader)?.responseParts ?? []);
		const inputRequests$ = derived(reader => sessionState$.read(reader)?.inputRequests ?? []);

		// Per-tool-call subagent observation dedup. A tool call may fire the
		// per-key autorun multiple times; only install the child observer once.
		const observedSubagentToolIds = new Set<string>();

		// Per response part. Markdown / reasoning / tool calls each get a
		// dedicated setup keyed by their stable id. Per-key closures replace
		// the `Map<string, ChatToolInvocation>` and `Map<string, number>
		// lastEmittedLengths` bookkeeping that used to live on every call
		// site of `_processSessionState`.
		store.add(autorunPerKeyedItem(
			responseParts$,
			rp => rp.kind === ResponsePartKind.ToolCall
				? `tc:${rp.toolCall.toolCallId}`
				: rp.kind === ResponsePartKind.Markdown
					? `md:${rp.id}`
					: rp.kind === ResponsePartKind.Reasoning
						? `rs:${rp.id}`
						: `other:${responseParts$.get().indexOf(rp)}`,
			(_key, part$, partStore) => {
				const initial = part$.get();
				switch (initial.kind) {
					case ResponsePartKind.Markdown:
						// Subagent observers don't forward markdown into the
						// parent's progress — it belongs to the subagent's own
						// session view.
						if (opts.subAgentInvocationId !== undefined) {
							break;
						}
						this._setupMarkdownPart(part$ as IObservable<MarkdownResponsePart>, partStore, opts);
						break;
					case ResponsePartKind.Reasoning:
						if (opts.subAgentInvocationId !== undefined) {
							break;
						}
						this._setupReasoningPart(part$ as IObservable<ReasoningResponsePart>, partStore, opts);
						break;
					case ResponsePartKind.ToolCall:
						this._setupToolCallPart(part$ as IObservable<ToolCallResponsePart>, partStore, opts, observedSubagentToolIds);
						break;
				}
			},
		));

		// Per input request carousel. Skipped for subagent observers — input
		// requests on a subagent session are surfaced through that session's
		// own view, not the parent.
		if (opts.subAgentInvocationId === undefined) {
			store.add(autorunPerKeyedItem(
				inputRequests$,
				ir => ir.id,
				(_id, ir$, irStore) => {
					this._setupInputRequest(ir$.get(), irStore, opts);
				},
			));
		}

		// Detect terminal turn state. The turn is over when the active turn
		// id no longer matches our turn id; the completed turn (if present
		// in `turns`) surfaces any error message.
		//
		// `seenActive` guards against firing `finish` on the install pass:
		// `_handleTurn` calls us right after dispatching `SessionTurnStarted`
		// but before the action has been echoed back, so the very first
		// reading of state may not yet contain our turn. We must wait until
		// we've seen our turn become active at least once before treating
		// its absence as a terminal transition.
		let terminated = false;
		let seenActive = false;
		const finish = (lastTurn: Turn | undefined) => {
			if (terminated) {
				return;
			}
			terminated = true;
			// Defer to a microtask so any other autoruns reacting to the
			// same state update (e.g. tool call finalization) finish first.
			// Self-dispose afterwards so callers do not need to track us
			// across the natural-completion path; cancellation paths can
			// still call `dispose()` proactively (idempotent).
			queueMicrotask(() => {
				try {
					opts.onTurnEnded?.(lastTurn);
				} finally {
					store.dispose();
				}
			});
		};
		store.add(autorun(reader => {
			if (terminated) {
				return;
			}
			const state = sessionState$.read(reader);
			if (!state) {
				return;
			}
			if (state.activeTurn?.id === opts.turnId) {
				seenActive = true;
				return;
			}
			// Also treat a completed turn we discover in `turns` as
			// "having seen it", so reconnect / server-initiated paths that
			// install us against an already-completed turn still finish.
			const lastTurn = state.turns.find(t => t.id === opts.turnId);
			if (lastTurn) {
				seenActive = true;
			}
			if (!seenActive) {
				return;
			}
			if (lastTurn?.state === TurnState.Error && lastTurn.error) {
				opts.sink([{ kind: 'markdownContent', content: new MarkdownString(`\n\nError: (${lastTurn.error.errorType}) ${lastTurn.error.message}`) }]);
			}
			finish(lastTurn);
		}));

		store.add(opts.cancellationToken.onCancellationRequested(() => finish(undefined)));

		return store;
	}

	private _setupMarkdownPart(
		part$: IObservable<MarkdownResponsePart>,
		store: DisposableStore,
		opts: IObserveTurnOptions,
	): void {
		// Seed from the snapshot length so the always-on graph does not
		// re-emit content already covered by `activeTurnToProgress` on
		// reconnect.
		let lastEmitted = opts.seedEmittedLengths?.get(part$.get().id) ?? 0;
		store.add(autorun(reader => {
			const content = part$.read(reader).content;
			if (content.length <= lastEmitted) {
				return;
			}
			const delta = content.substring(lastEmitted);
			lastEmitted = content.length;
			// supportHtml is load bearing. Without this the markdown string
			// gets merged into the edit part in chatModel.ts which breaks
			// rendering because the thinking content part does not deal
			// with this.
			opts.sink([{ kind: 'markdownContent', content: rawMarkdownToString(delta, this._config.connectionAuthority, { supportHtml: true }) }]);
		}));
	}

	private _setupReasoningPart(
		part$: IObservable<ReasoningResponsePart>,
		store: DisposableStore,
		opts: IObserveTurnOptions,
	): void {
		let lastEmitted = opts.seedEmittedLengths?.get(part$.get().id) ?? 0;
		store.add(autorun(reader => {
			const content = part$.read(reader).content;
			if (content.length <= lastEmitted) {
				return;
			}
			const delta = content.substring(lastEmitted);
			lastEmitted = content.length;
			opts.sink([{ kind: 'thinking', value: delta }]);
		}));
	}

	private _setupToolCallPart(
		part$: IObservable<ToolCallResponsePart>,
		store: DisposableStore,
		opts: IObserveTurnOptions,
		observedSubagentToolIds: Set<string>,
	): void {
		const initial = part$.get().toolCall;
		if (initial.toolClientId === this._config.connection.clientId) {
			this._setupClientToolCall(initial, part$, store, opts);
		} else {
			this._setupServerToolCall(initial, part$, store, opts, observedSubagentToolIds);
		}
	}

	/**
	 * Per-call setup for a server-driven tool. Adopts a snapshot
	 * {@link ChatToolInvocation} when present (reconnect parity); otherwise
	 * emits a fresh one. Reacts to status transitions for re-confirmation,
	 * terminal revival, finalization, and subagent observation.
	 */
	private _setupServerToolCall(
		initial: ToolCallState,
		part$: IObservable<ToolCallResponsePart>,
		store: DisposableStore,
		opts: IObserveTurnOptions,
		observedSubagentToolIds: Set<string>,
	): void {
		const toolCallId = initial.toolCallId;
		const subAgentInvocationId = opts.subAgentInvocationId;
		const adopted = opts.adoptInvocations?.get(toolCallId);
		let invocation = adopted
			?? toolCallStateToInvocation(initial, subAgentInvocationId, opts.backendSession, this._config.connectionAuthority);
		if (!adopted) {
			opts.sink([invocation]);
		}

		const tryObserveSubagent = (tc: ToolCallState) => {
			// Don't recurse into nested subagents \u2014 legacy behavior was to
			// only observe the immediate child session, not children of
			// children.
			if (subAgentInvocationId !== undefined) {
				return;
			}
			if (observedSubagentToolIds.has(toolCallId)) {
				return;
			}
			const isSub = isSubagentTool(tc)
				|| ((tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Completed) && getToolSubagentContent(tc));
			if (!isSub) {
				return;
			}
			observedSubagentToolIds.add(toolCallId);
			this._observeSubagentSession(opts.sessionResource, opts.backendSession, toolCallId, opts.sink, store, observedSubagentToolIds);
		};

		// Initial confirmation hookup. The autorun below only handles
		// *transitions* back into `PendingConfirmation` (server-driven
		// re-confirmation), not the initial state, because
		// `toolCallStateToInvocation` already created the invocation in
		// `WaitingForConfirmation`. Without this explicit call, no listener
		// would observe the user's confirmation answer.
		if (initial.status === ToolCallStatus.PendingConfirmation && !IChatToolInvocation.isComplete(invocation)) {
			this._awaitToolConfirmation(invocation, toolCallId, opts.backendSession, opts.turnId, opts.cancellationToken, initial.options);
		}
		tryObserveSubagent(initial);

		// Stream subsequent status transitions. Re-confirmation is detected
		// from a `tc.status` transition (Running → PendingConfirmation), not
		// from comparing against `invocation.state`: the user's local
		// confirmation flips `invocation.state` to `Executing` before the
		// server echoes Running, and a state-comparison check would
		// spuriously trigger re-confirmation in that gap.
		let previousStatus: ToolCallStatus | undefined;
		store.add(autorun(reader => {
			const tc = part$.read(reader).toolCall;
			const status = tc.status;
			const isReconfirmation = previousStatus !== undefined
				&& previousStatus !== ToolCallStatus.PendingConfirmation
				&& status === ToolCallStatus.PendingConfirmation;
			previousStatus = status;

			if (isReconfirmation) {
				// Server bounced the call back to PendingConfirmation
				// (e.g. write confirmation after edit). Settle the old
				// invocation and replace it with a fresh one carrying the
				// new confirmation messages.
				invocation.didExecuteTool(undefined);
				const confirmInvocation = toolCallStateToInvocation(tc, subAgentInvocationId, opts.backendSession, this._config.connectionAuthority);
				opts.sink([confirmInvocation]);
				this._awaitToolConfirmation(confirmInvocation, toolCallId, opts.backendSession, opts.turnId, opts.cancellationToken, tc.options);
				invocation = confirmInvocation;
			} else if (status === ToolCallStatus.Running || status === ToolCallStatus.PendingResultConfirmation) {
				invocation.invocationMessage = stringOrMarkdownToString(tc.invocationMessage, this._config.connectionAuthority);
				this._reviveTerminalIfNeeded(invocation, tc, opts.backendSession);
				updateRunningToolSpecificData(invocation, tc, this._config.connectionAuthority);
			}

			if ((status === ToolCallStatus.Completed || status === ToolCallStatus.Cancelled) && !IChatToolInvocation.isComplete(invocation)) {
				// Revive terminal before finalizing — handles the case where
				// Running was skipped (e.g. throttling) and terminal content
				// only appears at Completed time.
				this._reviveTerminalIfNeeded(invocation, tc, opts.backendSession);
				const fileEdits = finalizeToolInvocation(invocation, tc, opts.backendSession, this._config.connectionAuthority);
				if (fileEdits.length > 0) {
					opts.onFileEdits?.(tc, fileEdits);
				}
			}

			tryObserveSubagent(tc);
		}));

		// If the turn ends with the tool still mid-flight (e.g. external
		// cancellation), settle the invocation so the UI does not get stuck.
		store.add(toDisposable(() => {
			if (!IChatToolInvocation.isComplete(invocation)) {
				invocation.didExecuteTool(undefined);
			}
		}));
	}

	/**
	 * Per-call setup for a client-provided tool. Eagerly creates a streaming
	 * {@link ChatToolInvocation} so the UI has a handle, then invokes the
	 * tool once parameters are available. The inner autorun on `part$` is
	 * idempotent: `invoked` ensures `invokeTool` runs at most once,
	 * `confirmationDispatched` ensures `SessionToolCallConfirmed` is sent at
	 * most once.
	 */
	private _setupClientToolCall(
		initial: ToolCallState,
		part$: IObservable<ToolCallResponsePart>,
		store: DisposableStore,
		opts: IObserveTurnOptions,
	): void {
		const toolCallId = initial.toolCallId;
		const toolName = initial.toolName;

		// Reconnect adoption: settle any snapshot invocation so the new
		// streaming one created by `beginToolCall` can take over the UI
		// slot rather than leaving the old instance orphaned.
		const adopted = opts.adoptInvocations?.get(toolCallId);
		if (adopted && !IChatToolInvocation.isComplete(adopted)) {
			adopted.didExecuteTool(undefined);
		}

		const toolData = this._toolsService.getToolByName(toolName);
		if (!toolData) {
			this._logService.warn(`[AgentHost] Client tool call for unknown tool: ${toolName}`);
			this._dispatchAction({
				type: ActionType.SessionToolCallComplete,
				session: opts.backendSession.toString(),
				turnId: opts.turnId,
				toolCallId,
				result: {
					success: false,
					pastTenseMessage: `Tool "${toolName}" is not available`,
					error: { message: `Tool "${toolName}" is not available on this client` },
				},
			});
			return;
		}

		const invocation = this._toolsService.beginToolCall({
			toolCallId,
			toolId: toolData.id,
			sessionResource: opts.sessionResource,
			force: true,
		}) as ChatToolInvocation | undefined;

		if (!invocation) {
			this._logService.warn(`[AgentHost] Failed to begin client tool invocation: ${toolName}`);
			this._dispatchAction({
				type: ActionType.SessionToolCallComplete,
				session: opts.backendSession.toString(),
				turnId: opts.turnId,
				toolCallId,
				result: {
					success: false,
					pastTenseMessage: `Failed to start ${toolName}`,
					error: { message: `Could not create invocation for client tool "${toolName}"` },
				},
			});
			return;
		}

		const cts = new CancellationTokenSource();
		store.add(toDisposable(() => cts.dispose(true)));

		let invoked = false;
		let approvedDispatched = false;
		let confirmationDispatched = false;

		// Drive `SessionToolCallConfirmed` from the invocation's confirmation
		// gate. The autorun runs synchronously many times; the guards keep it
		// idempotent.
		store.add(autorun(reader => {
			const state = invocation.state.read(reader);
			if (confirmationDispatched) {
				return;
			}
			if (state.type === IChatToolInvocation.StateKind.Executing) {
				confirmationDispatched = true;
				if (cts.token.isCancellationRequested) {
					return;
				}
				approvedDispatched = true;
				this._dispatchAction({
					type: ActionType.SessionToolCallConfirmed,
					session: opts.backendSession.toString(),
					turnId: opts.turnId,
					toolCallId,
					approved: true,
					confirmed: confirmedReasonToProtocol(state.confirmed),
				});
			} else if (state.type === IChatToolInvocation.StateKind.Cancelled) {
				// Pre-execution cancellation. If the server already knows
				// (cts cancelled), suppress the dispatch — the server
				// transitioned the call itself.
				confirmationDispatched = true;
				if (cts.token.isCancellationRequested) {
					return;
				}
				this._dispatchAction({
					type: ActionType.SessionToolCallConfirmed,
					session: opts.backendSession.toString(),
					turnId: opts.turnId,
					toolCallId,
					approved: false,
					reason: ToolCallCancellationReason.Denied,
				});
			}
		}));

		const handleSettled = (result: IToolResult | undefined, err: unknown) => {
			if (cts.token.isCancellationRequested) {
				return;
			}
			if (!approvedDispatched) {
				if (err !== undefined && !isCancellationError(err)) {
					this._logService.warn(`[AgentHost] Client tool rejected pre-execution: ${toolName}`, err);
				}
				return;
			}
			if (err !== undefined) {
				if (!isCancellationError(err)) {
					this._logService.warn(`[AgentHost] Client tool invocation failed: ${toolName}`, err);
				}
				const message = err instanceof Error ? err.message : String(err);
				result = { content: [], toolResultError: message };
			}
			this._dispatchAction({
				type: ActionType.SessionToolCallComplete,
				session: opts.backendSession.toString(),
				turnId: opts.turnId,
				toolCallId,
				result: toolResultToProtocol(result ?? { content: [] }, toolName),
			});
		};

		// React to part$ updates: route external cancellation, and try to
		// invoke once parameters are present. Idempotent via `invoked` and
		// `cts.token.isCancellationRequested`.
		store.add(autorun(reader => {
			const tc = part$.read(reader).toolCall;
			if (tc.status === ToolCallStatus.Cancelled) {
				if (cts.token.isCancellationRequested) {
					return;
				}
				cts.cancel();
				if (!invoked) {
					// No `invokeTool` is listening to the CTS — transition
					// the invocation to `Cancelled` ourselves.
					invocation.cancelFromStreaming(ToolConfirmKind.Skipped);
				}
				return;
			}
			if (invoked || cts.token.isCancellationRequested) {
				return;
			}
			// eslint-disable-next-line local/code-no-in-operator
			let toolInput = 'toolInput' in tc ? tc.toolInput : undefined;
			if (toolInput === undefined) {
				// Still streaming — parameters may still be arriving. Once
				// we move past Streaming, treat a missing toolInput as `{}`
				// so zero-argument tools are not stuck.
				if (tc.status === ToolCallStatus.Streaming) {
					return;
				}
				toolInput = '{}';
			}
			invoked = true;

			let parameters: Record<string, unknown> = {};
			try {
				const parsed: unknown = JSON.parse(toolInput);
				if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
					throw new Error('expected JSON object');
				}
				parameters = parsed as Record<string, unknown>;
			} catch {
				this._logService.warn(`[AgentHost] Failed to parse tool input for ${toolName}`);
				this._dispatchAction({
					type: ActionType.SessionToolCallComplete,
					session: opts.backendSession.toString(),
					turnId: opts.turnId,
					toolCallId,
					result: {
						success: false,
						pastTenseMessage: `Failed to execute ${toolName}`,
						error: { message: `Invalid tool input for "${toolName}": expected JSON object parameters` },
					},
				});
				return;
			}

			const inv: IToolInvocation = {
				callId: toolCallId,
				toolId: invocation.toolId,
				parameters,
				context: { sessionResource: opts.sessionResource },
				chatStreamToolCallId: toolCallId,
			};
			const noOpCountTokens = async () => 0;
			this._logService.info(`[AgentHost] Invoking client tool: ${toolName} (callId=${toolCallId})`);
			this._toolsService.invokeTool(inv, noOpCountTokens, cts.token).then(
				result => handleSettled(result, undefined),
				err => handleSettled(undefined, err),
			);
		}));
	}

	private _setupInputRequest(
		inputReq: SessionInputRequest,
		store: DisposableStore,
		opts: IObserveTurnOptions,
	): void {
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
			inputReq.id,
			/* data */ undefined,
			/* isUsed */ undefined,
			/* message */ inputReq.message ? rawMarkdownToString(inputReq.message, this._config.connectionAuthority) : undefined,
		);
		opts.sink([carousel]);

		// Track the latest server-known answers — initially what was on the
		// request when it appeared, then overwritten by `SessionInputCompleted`
		// when the server applies it. The disposal path uses this to settle
		// the carousel with the server's authoritative answers.
		let latestProtocolAnswers: Record<string, SessionInputAnswer> | undefined = inputReq.answers;

		// Capture protocol answers from `SessionInputCompleted` BEFORE the
		// reducer drops the request from state — by the time disposal runs,
		// the action payload is no longer reachable. Also overwrite the
		// carousel's `data` so it reflects the server's authoritative answer
		// even if the user already locally submitted (mirrors legacy
		// `_applyCompletedInputRequest` behavior).
		const sub = this._ensureSessionSubscription(opts.backendSession.toString());
		store.add(sub.onWillApplyAction(envelope => {
			const action = envelope.action as SessionAction;
			if (action.type !== ActionType.SessionInputCompleted || action.requestId !== inputReq.id) {
				return;
			}
			latestProtocolAnswers = action.response === SessionInputResponseKind.Accept
				? (action as SessionInputCompletedAction).answers ?? latestProtocolAnswers
				: undefined;
			const carouselAnswers = convertProtocolAnswers(latestProtocolAnswers);
			carousel.data = carouselAnswers ?? {};
			carousel.draftAnswers = undefined;
			carousel.draftCurrentIndex = undefined;
			carousel.draftCollapsed = undefined;
		}));

		// User-driven completion → dispatch `SessionInputCompleted`. The
		// state echo (handled above) updates the carousel with the server's
		// authoritative answer afterwards.
		carousel.completion.p.then(result => {
			if (store.isDisposed) {
				return;
			}
			if (!result.answers) {
				this._config.connection.dispatch({
					type: ActionType.SessionInputCompleted,
					session: opts.backendSession.toString(),
					requestId: inputReq.id,
					response: SessionInputResponseKind.Cancel,
				});
			} else {
				const answers = convertCarouselAnswers(result.answers);
				this._config.connection.dispatch({
					type: ActionType.SessionInputCompleted,
					session: opts.backendSession.toString(),
					requestId: inputReq.id,
					response: SessionInputResponseKind.Accept,
					answers,
				});
			}
		});

		if (opts.cancellationToken.isCancellationRequested) {
			carousel.completion.complete({ answers: undefined });
		} else {
			const tokenListener = opts.cancellationToken.onCancellationRequested(() => {
				carousel.completion.complete({ answers: undefined });
			});
			carousel.completion.p.finally(() => tokenListener.dispose());
		}

		// Disposal: the request was either completed (action seen via
		// `onWillApplyAction`) or abandoned (turn ended). Settle the
		// carousel with whatever server answers we last captured and clear
		// the input UI to mirror legacy `_syncInputRequests` behavior.
		store.add(toDisposable(() => {
			if (carousel.isUsed) {
				return;
			}
			const carouselAnswers = convertProtocolAnswers(latestProtocolAnswers);
			carousel.data = carouselAnswers ?? {};
			carousel.isUsed = true;
			carousel.draftAnswers = undefined;
			carousel.draftCurrentIndex = undefined;
			carousel.draftCollapsed = undefined;
			carousel.completion.complete({ answers: carouselAnswers });
			this._chatWidgetService.getWidgetBySessionResource(opts.sessionResource)?.input.clearQuestionCarousel(undefined, inputReq.id);
		}));
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

	// ---- Subagent child session observation ---------------------------------

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
	 *
	 * Implementation: builds a per-turn-id keyed observation over the child
	 * session's `turns` and `activeTurn`. Each turn id discovered gets its
	 * own {@link _observeTurn} instance running in subagent mode (which skips
	 * markdown/reasoning/input-request emission and tags tool calls with the
	 * parent tool call id). Each per-turn observer self-disposes when its
	 * turn reaches a terminal state; the outer observation is torn down when
	 * the caller disposes `disposables`.
	 */
	private _observeSubagentSession(
		sessionResource: URI,
		parentSession: URI,
		parentToolCallId: string,
		emitProgress: (parts: IChatProgress[]) => void,
		disposables: DisposableStore,
		observedSet: Set<string>,
	): void {
		const childSessionUri = buildSubagentSessionUri(parentSession.toString(), parentToolCallId);
		const childUri = URI.parse(childSessionUri);

		const cts = new CancellationTokenSource();
		disposables.add(toDisposable(() => cts.dispose(true)));

		try {
			const childSub = this._ensureSessionSubscription(childSessionUri);
			disposables.add(toDisposable(() => this._releaseSessionSubscription(childSessionUri)));

			const childState$ = observableFromSubscription(this, childSub);

			// All turn ids observed in the child session: completed turns
			// plus any active turn that is not also already in `turns`. Each
			// id is keyed so `autorunPerKeyedItem` discovers new turns
			// incrementally and creates a fresh observer for each.
			const childTurnIds$ = derived(reader => {
				const state = childState$.read(reader);
				if (!state) {
					return [];
				}
				const ids: { id: string }[] = state.turns.map(t => ({ id: t.id }));
				const activeId = state.activeTurn?.id;
				if (activeId !== undefined && !state.turns.some(t => t.id === activeId)) {
					ids.push({ id: activeId });
				}
				return ids;
			});

			disposables.add(autorunPerKeyedItem(
				childTurnIds$,
				t => t.id,
				(turnId, _t$, turnStore) => {
					turnStore.add(this._observeTurn({
						backendSession: childUri,
						sessionResource,
						turnId,
						sink: emitProgress,
						cancellationToken: cts.token,
						subAgentInvocationId: parentToolCallId,
					}));
				},
			));
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
		// array so per-tool setup adopts the same instances the chat UI holds.
		const adoptInvocations = new Map<string, ChatToolInvocation>();
		for (const item of initialProgress) {
			if (item instanceof ChatToolInvocation) {
				adoptInvocations.set(item.toolCallId, item);
			}
		}

		// Seed last-emitted markdown/reasoning lengths from the snapshot so
		// per-part setup only emits content beyond what `activeTurnToProgress`
		// already produced.
		const seedEmittedLengths = new Map<string, number>();
		const currentState = this._getSessionState(sessionKey);
		if (currentState?.activeTurn) {
			for (const rp of currentState.activeTurn.responseParts) {
				if (rp.kind === ResponsePartKind.Markdown || rp.kind === ResponsePartKind.Reasoning) {
					seedEmittedLengths.set(rp.id, rp.content.length);
				}
			}
		}

		const cts = new CancellationTokenSource();
		const reconnectStore = chatSession.registerDisposable(new DisposableStore());
		reconnectStore.add(toDisposable(() => cts.dispose(true)));
		reconnectStore.add(this._observeTurn({
			backendSession,
			sessionResource: chatSession.sessionResource,
			turnId,
			sink: parts => chatSession.appendProgress(parts),
			cancellationToken: cts.token,
			adoptInvocations,
			seedEmittedLengths,
			onTurnEnded: () => {
				chatSession.complete();
				reconnectStore.dispose();
			},
		}));
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

	private _isNewSessionResource(sessionResource: URI): boolean {
		return !!this._config.isNewSession?.(sessionResource)
			|| this._workingDirectoryResolver.isNewSession(sessionResource);
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
		const requestedSession = fork ? undefined : this._resolveSessionUri(sessionResource);

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
				session: requestedSession,
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
						session: requestedSession,
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

		if (requestedSession && !isEqual(session, requestedSession)) {
			throw new Error(`Agent host returned unexpected session URI. Expected ${requestedSession.toString()}, got ${session.toString()}`);
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
		const prefix = `${getChatSessionType(sessionResource)}:`;
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
		const backendSession = this._resolveSessionUri(sessionResource);
		const rawResolvedDir = this._getSessionState(backendSession.toString())?.summary.workingDirectory;
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
