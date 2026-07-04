/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { NKeyMap } from '../../../base/common/map.js';
import { equals } from '../../../base/common/objects.js';
import { autorun, IObservable, IReader } from '../../../base/common/observable.js';
import { hasKey } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentHostChangesetService } from '../common/agentHostChangesetService.js';
import { IAgentHostCheckpointService } from '../common/agentHostCheckpointService.js';
import { AgentSignal, IAgent, IAgentToolPendingConfirmationSignal } from '../common/agentService.js';
import { toToolCallMeta } from '../common/meta/agentToolCallMeta.js';

import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import { SessionInputRequestKind, ToolCallContributorKind, type AgentInfo, type SessionInputRequest } from '../common/state/protocol/state.js';
import { ActionType, isChatAction, StateAction, type ChatAction, type ChatToolCallCompleteAction } from '../common/state/sessionActions.js';
import {
	buildSubagentChatUri,
	getToolFileEdits,
	isAhpChatChannel,
	isDefaultChatUri,
	isSubagentChatUri,
	MessageKind,
	parseChatUri,
	parseRequiredSessionUriFromChatUri,
	PendingMessageKind,
	ResponsePartKind,
	ROOT_STATE_URI,
	ToolCallStatus,
	ToolResultContentType,
	type ErrorInfo,
	type ISessionWithDefaultChat,
	type Message,
	type URI as ProtocolURI,
	type SessionState,
	type ToolCallState,
	type ToolCallResult,
	type ToolResultContent,
	type Turn
} from '../common/state/sessionState.js';
import { AgentHostLocalTurns } from './agentHostLocalTurns.js';
import { AgentHostSessionTitleController } from './agentHostSessionTitleController.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { AgentHostTelemetryReporter } from './agentHostTelemetryReporter.js';
import { AgentHostToolCallTracker } from './agentHostToolCallTracker.js';
import { updateAgentHostTelemetryLevelFromConfig } from './agentHostTelemetryService.js';
import { AgentHostTurnTracker } from './agentHostTurnTracker.js';
import { AgentHostLocalCommands } from './localCommands/localChatCommand.js';
import './localCommands/localChatCommands.contribution.js';
import { SessionPermissionManager } from './sessionPermissions.js';
import type { ICopilotApiService } from './shared/copilotApiService.js';
import { stripProxyErrorMarker, toChatErrorMeta, tryParseForwardedChatError } from './shared/forwardedChatError.js';
import { persistSessionMetadata } from './shared/persistSessionMetadata.js';

/**
 * Options for constructing an {@link AgentSideEffects} instance.
 */
export interface IAgentSideEffectsOptions {
	/** Resolve the agent responsible for a given session URI. */
	readonly getAgent: (session: ProtocolURI) => IAgent | undefined;
	/** Observable set of registered agents. Triggers `root/agentsChanged` when it changes. */
	readonly agents: IObservable<readonly IAgent[]>;
	/** Session data service for cleaning up per-session data on disposal. */
	readonly sessionDataService: ISessionDataService;
	/** Registry that persists host-injected `/rename` and `!command` turns. */
	readonly localTurns: AgentHostLocalTurns;
	/** Get the GitHub token used for Copilot utility title generation. */
	readonly getGitHubCopilotToken?: () => string | undefined;
	/** CAPI service used for Copilot utility title generation. */
	readonly copilotApiService?: ICopilotApiService;
	/**
	 * Called after each top-level session turn completes so git state can be
	 * refreshed and published via `SessionMetaChanged`. Subagent turns are
	 * excluded — only the parent session URI is passed.
	 */
	readonly onTurnComplete: (session: ProtocolURI) => void;
}

/** A signal that was deferred because its subagent session does not exist yet. */
interface IPendingSubagentSignal {
	readonly signal: AgentSignal;
	readonly agent: IAgent;
}

interface ISubagentSessionRef {
	readonly parentChatUri: ProtocolURI;
	readonly toolCallId: string;
	readonly sessionUri: ProtocolURI;
	readonly chatUri: ProtocolURI;
}

/**
 * Shared implementation of agent side-effect handling.
 *
 * Routes client-dispatched actions to the correct agent backend,
 * restores sessions from previous lifetimes, handles filesystem
 * operations (browse/fetch/write), tracks pending permission requests,
 * and wires up agent progress events to the state manager.
 *
 * Session create/dispose/list and auth are handled by {@link AgentService}.
 */
export class AgentSideEffects extends Disposable {

	/** Maps tool call IDs to the agent that owns them, for routing confirmations. */
	private readonly _toolCallAgents = new Map<string, string>();
	private _lastAgentInfos: readonly AgentInfo[] = [];

	private readonly _permissionManager: SessionPermissionManager;

	/** Registry-driven dispatcher for host-handled `/rename` / `!command` etc. */
	private readonly _localCommands: AgentHostLocalCommands;

	private readonly _subagentChats = new NKeyMap<ISubagentSessionRef, [ProtocolURI, string]>();

	/**
	 * Buffers signals whose `parentToolCallId` references a subagent
	 * whose `subagent_started` signal has not yet been processed. The SDK is
	 * not strict about ordering: an inner `tool_start` can arrive before the
	 * `subagent_started` that creates the child session. Without buffering,
	 * those signals would be dispatched against the parent session and the
	 * UI would render the inner tool calls flat at the top level rather than
	 * grouping them under the subagent. Drained by `_handleSubagentStarted`.
	 *
	 */
	private readonly _pendingSubagentSignals = new NKeyMap<IPendingSubagentSignal[], [ProtocolURI, string]>();
	private readonly _telemetryReporter: AgentHostTelemetryReporter;
	private readonly _turnTracker: AgentHostTurnTracker;
	private readonly _toolCallTracker: AgentHostToolCallTracker;
	private readonly _titleController: AgentHostSessionTitleController;

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		private readonly _options: IAgentSideEffectsOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IAgentHostChangesetService private readonly _changesets: IAgentHostChangesetService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IAgentHostCheckpointService private readonly _checkpointService: IAgentHostCheckpointService,
	) {
		super();
		this._telemetryReporter = new AgentHostTelemetryReporter(this._telemetryService);
		this._turnTracker = new AgentHostTurnTracker(this._telemetryReporter);
		this._toolCallTracker = new AgentHostToolCallTracker(this._telemetryReporter);
		this._permissionManager = this._register(instantiationService.createInstance(SessionPermissionManager, this._stateManager));
		this._localCommands = this._register(instantiationService.createInstance(
			AgentHostLocalCommands,
			this._stateManager,
			this._options.localTurns,
			// Draining the queue re-enters agent lookup / telemetry / sendMessage,
			// which is this class's responsibility, so the dispatcher hands the
			// turn back here once it has completed a host-handled command.
			(turnChannel: ProtocolURI) => this._tryConsumeNextQueuedMessage(turnChannel),
		));
		this._titleController = this._register(instantiationService.createInstance(AgentHostSessionTitleController, this._stateManager, {
			sessionDataService: this._options.sessionDataService,
			getGitHubCopilotToken: this._options.getGitHubCopilotToken,
			copilotApiService: this._options.copilotApiService,
		}));

		// Whenever the agents observable changes, publish to root state.
		this._register(autorun(reader => {
			const agents = this._options.agents.read(reader);
			this._publishAgentInfos(agents, reader);
		}));

		// Server-dispatched ChatToolCallComplete actions (e.g. from
		// the disconnect timeout in ProtocolServerHandler) bypass
		// handleAction, so the agent's SDK deferred never resolves.
		// Listen for these envelopes and notify the agent directly.
		this._register(this._stateManager.onDidEmitEnvelope(envelope => {
			if (isAhpChatChannel(envelope.channel) && isChatAction(envelope.action)) {
				this._syncSessionInputNeededForChatAction(envelope.channel, envelope.action);
			}
			if (!envelope.origin && envelope.action.type === ActionType.ChatToolCallComplete) {
				const action = envelope.action;
				// Chat-action envelopes are emitted on the chat channel URI;
				// agents are keyed by session URI, so resolve back to the
				// owning session before notifying the agent. Pass the chat URI
				// alongside so agents that track peer chats can route correctly.
				if (!isAhpChatChannel(envelope.channel)) {
					return; // Not a chat channel; ignore (already logged elsewhere).
				}
				const sessionChannel = parseRequiredSessionUriFromChatUri(envelope.channel);
				this._notifyClientToolCallComplete(sessionChannel, envelope.channel, action.toolCallId, action.result, 'server-envelope');
			}
			if (envelope.action.type === ActionType.ChatDraftChanged) {
				this._persistChatDraft(envelope.channel, envelope.action.draft);
			}
		}));
	}

	/**
	 * Publishes agent descriptors using the last known model lists.
	 */
	private _publishAgentInfos(agents: readonly IAgent[], reader?: IReader): void {
		const infos: AgentInfo[] = agents.map(a => {
			const d = a.getDescriptor();
			const protectedResources = a.getProtectedResources();
			const models = reader ? a.models.read(reader) : a.models.get();
			const customizations = a.getCustomizations?.();
			return {
				provider: d.provider, displayName: d.displayName, description: d.description, models: models.map(m => ({
					id: m.id,
					provider: m.provider,
					name: m.name,
					maxContextWindow: m.maxContextWindow,
					maxOutputTokens: m.maxOutputTokens,
					maxPromptTokens: m.maxPromptTokens,
					supportsVision: m.supportsVision,
					policyState: m.policyState,
					configSchema: m.configSchema,
					_meta: m._meta,
				})),
				customizations: customizations?.length ? [...customizations] : undefined,
				protectedResources: protectedResources.length > 0 ? protectedResources : undefined,
				capabilities: d.capabilities ? { ...d.capabilities } : undefined,
			};
		});
		if (equals(this._lastAgentInfos, infos)) {
			return;
		}
		this._lastAgentInfos = infos;
		this._stateManager.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootAgentsChanged, agents: infos });
	}

	private async _publishSessionCustomizations(agent: IAgent, session: ProtocolURI): Promise<void> {
		if (!agent.getSessionCustomizations) {
			return;
		}

		const customizations = await agent.getSessionCustomizations(URI.parse(session));
		this._stateManager.dispatchServerAction(session, {
			type: ActionType.SessionCustomizationsChanged,
			customizations: [...customizations],
		});
	}

	private _publishSessionCustomizationsSoon(agent: IAgent, session: ProtocolURI): void {
		void this._publishSessionCustomizations(agent, session).catch(err => {
			this._logService.error('[AgentSideEffects] getSessionCustomizations failed', err);
		});
	}

	private _publishSessionCustomizationsForAgent(agent: IAgent): void {
		for (const session of this._stateManager.getSessionUris()) {
			if (this._options.getAgent(session) === agent) {
				this._publishSessionCustomizationsSoon(agent, session);
			}
		}
	}

	private _publishAllSessionCustomizations(): void {
		for (const session of this._stateManager.getSessionUris()) {
			const agent = this._options.getAgent(session);
			if (agent) {
				this._publishSessionCustomizationsSoon(agent, session);
			}
		}
	}

	// ---- Session input-needed aggregation ----------------------------------
	//
	// Mirrors per-chat blockers (user-input elicitations, tool confirmations,
	// and running client-tool executions) into the owning session's
	// `inputNeeded` list so clients subscribed only to the session channel can
	// discover and answer them without subscribing to each chat. This handler
	// only produces the state; it does not consume it.

	private _syncSessionInputNeededForChatAction(chatUri: ProtocolURI, action: ChatAction): void {
		switch (action.type) {
			case ActionType.ChatInputRequested:
				this._setSessionInputNeeded(chatUri, {
					id: this._chatInputNeededId(chatUri, action.request.id),
					kind: SessionInputRequestKind.ChatInput,
					chat: chatUri,
					request: action.request,
				});
				break;
			case ActionType.ChatInputCompleted:
				this._removeSessionInputNeeded(chatUri, this._chatInputNeededId(chatUri, action.requestId));
				break;
			case ActionType.ChatToolCallStart:
			case ActionType.ChatToolCallReady:
			case ActionType.ChatToolCallConfirmed:
			case ActionType.ChatToolCallComplete:
			case ActionType.ChatToolCallResultConfirmed:
				this._syncToolInputNeeded(chatUri, action.turnId, action.toolCallId);
				break;
			case ActionType.ChatTurnComplete:
			case ActionType.ChatTurnCancelled:
			case ActionType.ChatError:
			case ActionType.ChatTruncated:
				this._removeSessionInputNeededForChat(chatUri);
				break;
		}
	}

	private _syncToolInputNeeded(chatUri: ProtocolURI, turnId: string, toolCallId: string): void {
		const confirmationId = this._toolConfirmationNeededId(chatUri, turnId, toolCallId);
		const clientExecutionId = this._toolClientExecutionNeededId(chatUri, turnId, toolCallId);
		const toolCall = this._findToolCall(chatUri, turnId, toolCallId);

		const needsConfirmation = toolCall?.status === ToolCallStatus.PendingConfirmation || toolCall?.status === ToolCallStatus.PendingResultConfirmation;
		if (needsConfirmation && toolCall) {
			this._setSessionInputNeeded(chatUri, {
				id: confirmationId,
				kind: SessionInputRequestKind.ToolConfirmation,
				chat: chatUri,
				turnId,
				toolCall,
			});
		} else {
			this._removeSessionInputNeeded(chatUri, confirmationId);
		}

		const contributor = toolCall?.contributor;
		if (toolCall?.status === ToolCallStatus.Running && contributor?.kind === ToolCallContributorKind.Client) {
			this._setSessionInputNeeded(chatUri, {
				id: clientExecutionId,
				kind: SessionInputRequestKind.ToolClientExecution,
				chat: chatUri,
				turnId,
				clientId: contributor.clientId,
				toolCall,
			});
		} else {
			this._removeSessionInputNeeded(chatUri, clientExecutionId);
		}
	}

	private _findToolCall(chatUri: ProtocolURI, turnId: string, toolCallId: string): ToolCallState | undefined {
		const state = this._stateManager.getSessionState(chatUri);
		const turn = state?.activeTurn?.id === turnId ? state.activeTurn : state?.turns.find(t => t.id === turnId);
		const part = turn?.responseParts.find(p => p.kind === ResponsePartKind.ToolCall && p.toolCall.toolCallId === toolCallId);
		return part?.kind === ResponsePartKind.ToolCall ? part.toolCall : undefined;
	}

	private _setSessionInputNeeded(chatUri: ProtocolURI, request: SessionInputRequest): void {
		const sessionUri = parseRequiredSessionUriFromChatUri(chatUri);
		const existing = this._stateManager.getSessionState(sessionUri)?.inputNeeded?.find(r => r.id === request.id);
		if (existing && equals(existing, request)) {
			return;
		}
		this._stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionInputNeededSet, request });
	}

	private _removeSessionInputNeeded(chatUri: ProtocolURI, id: string): void {
		const sessionUri = parseRequiredSessionUriFromChatUri(chatUri);
		if (!this._stateManager.getSessionState(sessionUri)?.inputNeeded?.some(r => r.id === id)) {
			return;
		}
		this._stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionInputNeededRemoved, id });
	}

	private _removeSessionInputNeededForChat(chatUri: ProtocolURI): void {
		const sessionUri = parseRequiredSessionUriFromChatUri(chatUri);
		for (const request of this._stateManager.getSessionState(sessionUri)?.inputNeeded ?? []) {
			if (request.chat === chatUri) {
				this._stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionInputNeededRemoved, id: request.id });
			}
		}
	}

	private _chatInputNeededId(chatUri: ProtocolURI, requestId: string): string {
		return `chatInput:${chatUri}:${requestId}`;
	}

	private _toolConfirmationNeededId(chatUri: ProtocolURI, turnId: string, toolCallId: string): string {
		return `toolConfirmation:${chatUri}:${turnId}:${toolCallId}`;
	}

	private _toolClientExecutionNeededId(chatUri: ProtocolURI, turnId: string, toolCallId: string): string {
		return `toolClientExecution:${chatUri}:${turnId}:${toolCallId}`;
	}

	// ---- Initialization ----------------------------------------------------

	/**
	 * Initializes async resources (tree-sitter WASM) used for command
	 * auto-approval. Await this before any session events can arrive to
	 * guarantee that auto-approval checks are fully synchronous.
	 */
	initialize(): Promise<void> {
		return this._permissionManager.initialize();
	}

	// ---- Agent registration -------------------------------------------------

	/**
	 * Registers a progress-signal listener on the given agent so that
	 * {@link AgentSignal}s are routed/dispatched through the state manager.
	 * Returns a disposable that removes the listener.
	 */
	registerProgressListener(agent: IAgent): IDisposable {
		const disposables = new DisposableStore();
		disposables.add(agent.onDidSessionProgress(signal => {
			this._handleAgentSignal(agent, signal);
		}));
		if (agent.onDidCustomizationsChange) {
			disposables.add(agent.onDidCustomizationsChange(() => {
				this._publishAgentInfos(this._options.agents.get());
				this._publishSessionCustomizationsForAgent(agent);
			}));
		}
		return disposables;
	}

	/**
	 * Routes a single signal from `agent` to the correct session.
	 *
	 * Action signals with a `parentToolCallId` are routed to the matching
	 * subagent session. If the subagent session does not exist yet (the SDK
	 * can emit an inner `tool_start` before its `subagent_started`), the
	 * signal is buffered in {@link _pendingSubagentSignals} and replayed
	 * once the `subagent_started` arrives.
	 */
	private _handleAgentSignal(agent: IAgent, signal: AgentSignal): void {
		if (signal.kind === 'subagent_started') {
			this._handleSubagentStarted(signal.chat.toString(), signal.toolCallId, signal.agentName, signal.agentDisplayName, signal.agentDescription, signal.parentToolCallId);
			this._drainPendingSubagentSignals(signal.chat.toString(), signal.toolCallId);
			return;
		}

		if (signal.kind === 'subagent_completed') {
			this.completeSubagentSession(signal.chat.toString(), signal.toolCallId);
			return;
		}

		if (signal.kind === 'steering_consumed') {
			this._stateManager.dispatchServerAction(signal.chat.toString(), {
				type: ActionType.ChatPendingMessageRemoved,
				kind: PendingMessageKind.Steering,
				id: signal.id,
			});
			return;
		}
		const sessionKey = signal.kind === 'action' ? signal.resource.toString() : signal.chat.toString();

		// Route signals with parentToolCallId to the subagent session.
		// Both action signals and pending_confirmation signals can carry
		// a parentToolCallId — for client tools inside a subagent the
		// permission flow fires `pending_confirmation` for an inner tool
		// call, and that signal must be routed to the subagent session
		// (otherwise the resulting ChatToolCallReady would land on the
		// parent session, which has no matching ChatToolCallStart).
		const parentToolCallId = signal.parentToolCallId;
		if (parentToolCallId) {
			const subagentSession = this._subagentChats.get(sessionKey, parentToolCallId);
			if (subagentSession) {
				const subTurnId = this._stateManager.getActiveTurnId(subagentSession.chatUri);
				if (subTurnId) {
					this._dispatchActionForSession(signal, subagentSession.chatUri, subTurnId, agent);
				}
				return;
			}

			// Subagent session does not exist yet — buffer the signal so we can
			// replay it after `subagent_started` arrives.
			this._logService.trace(`[AgentSideEffects] Buffering ${this._describeSignal(signal)} for pending subagent ${sessionKey}/${parentToolCallId}`);
			let buffer = this._pendingSubagentSignals.get(sessionKey, parentToolCallId);
			if (!buffer) {
				buffer = [];
				this._pendingSubagentSignals.set(buffer, sessionKey, parentToolCallId);
			}
			buffer.push({ signal, agent });
			return;
		}

		// Route pending_confirmation signals for tools inside subagent sessions
		// (legacy path for signals without an explicit parentToolCallId — the
		// tool was previously registered under its subagent session key in
		// _toolCallAgents).
		if (signal.kind === 'pending_confirmation') {
			const subagentChatUri = this._findSubagentChatForToolCall(sessionKey, signal.state.toolCallId);
			if (subagentChatUri) {
				const subTurnId = this._stateManager.getActiveTurnId(subagentChatUri) ?? '';
				void this._handleToolReady(signal, subagentChatUri, subTurnId, agent).catch(err => {
					this._logService.error('[AgentSideEffects] _handleToolReady failed', err);
				});
				return;
			}
		}

		const turnId = this._stateManager.getActiveTurnId(sessionKey);
		if (turnId) {
			this._dispatchActionForSession(signal, sessionKey, turnId, agent);
			return;
		}

		// No active turn on the session. Non-action signals are silently
		// dropped, but action signals can still target session-level state
		// such as customizations, title, or configuration. A turnComplete
		// action also drives post-turn side effects even when the matching
		// turnStarted was not observed by this side-effects instance.
		//
		// pending_confirmation signals must also be handled here: when a
		// hook-triggered continuation runs after the protocol turn has
		// already completed, tool actions are dispatched (below) with an
		// empty turnId. Without this, the pending_confirmation is silently
		// dropped, the permission deferred never resolves, and the session
		// hangs indefinitely.
		if (signal.kind === 'pending_confirmation') {
			void this._handleToolReady(signal, sessionKey, '', agent).catch(err => {
				this._logService.error('[AgentSideEffects] _handleToolReady failed', err);
			});
			return;
		}
		if (signal.kind === 'action') {
			this._stateManager.dispatchServerAction(sessionKey, signal.action);
			if (signal.action.type === ActionType.ChatTurnComplete) {
				this._runTurnCompleteSideEffects(sessionKey, undefined);
			}
		}
	}

	/**
	 * Dispatches a signal against a resolved session+turn. Performs the
	 * subagent-content merge for tool_complete and the related side effects.
	 */
	private _dispatchActionForSession(signal: AgentSignal, sessionKey: ProtocolURI, turnId: string, agent?: IAgent): void {
		if (signal.kind === 'pending_confirmation') {
			if (agent) {
				void this._handleToolReady(signal, sessionKey, turnId, agent).catch(err => {
					this._logService.error('[AgentSideEffects] _handleToolReady failed', err);
				});
			}
			return;
		}
		if (signal.kind !== 'action') {
			return;
		}
		// The agent emits actions with its own view of the active turnId
		// targeting the top-level session. The state manager is the source
		// of truth — rewrite `turnId` so the action lands in the right
		// reducer (queued turn ID when the agent hasn't yet seen
		// `sendMessage`, etc.). Routing to subagent sessions is handled by
		// the caller via the channel argument.
		// Actions without a `turnId` field (`SessionTitleChanged`,
		// `ChatInputRequested`) only get their channel rewritten.
		let action = signal.action;
		if (hasKey(action, { turnId: true }) && action.turnId !== turnId) {
			action = { ...action, turnId };
		}

		if (action.type === ActionType.ChatToolCallStart && agent) {
			this._toolCallAgents.set(`${sessionKey}:${action.toolCallId}`, agent.id);
			// Stamp the tool call start for `languageModelToolInvoked` telemetry.
			// Only the start action carries the tool name and contributor, so the
			// source kind must be captured here rather than on completion. The
			// provider comes from the agent that emitted the signal.
			this._toolCallTracker.toolCallStarted(agent.id, sessionKey, action.toolCallId, action.toolName, action.contributor);
		}

		const sessionUri = isAhpChatChannel(sessionKey) ? parseRequiredSessionUriFromChatUri(sessionKey) : sessionKey;

		// When a parent tool call has an associated subagent session,
		// preserve the subagent content metadata in the completion result.
		// The SDK's tool_complete provides its own content which would
		// overwrite the ToolResultSubagentContent that was set via
		// ChatToolCallContentChanged while running.
		if (action.type === ActionType.ChatToolCallComplete) {
			const subagent = this._subagentChats.get(sessionKey, action.toolCallId);
			if (subagent) {
				const parentState = this._stateManager.getSessionState(sessionKey);
				const runningContent = this._getRunningToolCallContent(parentState, turnId, action.toolCallId);
				const subagentEntry = runningContent.find(c => hasKey(c, { type: true }) && c.type === ToolResultContentType.Subagent);
				if (subagentEntry) {
					const mergedContent = [...(action.result.content ?? []), subagentEntry];
					const merged: ChatToolCallCompleteAction = { ...action, result: { ...action.result, content: mergedContent } };
					action = merged;
				}

			}
		}

		this._stateManager.dispatchServerAction(sessionKey, action);

		// Mark first visible progress for TTFT telemetry
		if (action.type === ActionType.ChatDelta
			|| action.type === ActionType.ChatResponsePart
			|| action.type === ActionType.ChatToolCallStart
			|| action.type === ActionType.ChatReasoning) {
			this._turnTracker.markFirstProgress(sessionKey, turnId);
		}

		if (action.type === ActionType.ChatToolCallComplete) {
			// Emit `languageModelToolInvoked` telemetry for the completed tool
			// call. `action.result` carries `success`/`error.code` even after the
			// subagent-content merge above (which only touches `result.content`).
			this._toolCallTracker.toolCallCompleted(sessionKey, action.toolCallId, action.result);

			// Drop any events that were buffered for a subagent whose
			// `subagent_started` never arrived (e.g. the parent tool failed
			// before the subagent was created). The actual subagent session
			// teardown is driven by the `subagent_completed` signal because
			// background subagents (`mode: background`) continue running
			// after the parent tool call returns.
			this._pendingSubagentSignals.delete(sessionKey, action.toolCallId);
			if (getToolFileEdits(action.result).length > 0) {
				this._changesets.onToolCallEditsApplied(sessionUri, turnId);
			}
		}

		if (action.type === ActionType.ChatTurnComplete) {
			this._turnTracker.turnCompleted(sessionKey, turnId, 'success');
			this._toolCallTracker.clearSession(sessionKey);
			this._runTurnCompleteSideEffects(sessionKey, turnId);
		}

		if (action.type === ActionType.ChatTurnCancelled) {
			this._turnTracker.turnCompleted(sessionKey, turnId, 'cancelled');
			this._toolCallTracker.clearSession(sessionKey);
		}

		if (action.type === ActionType.ChatError) {
			this._turnTracker.turnCompleted(sessionKey, turnId, 'error');
			this._toolCallTracker.clearSession(sessionKey);
		}
	}

	/**
	 * Post-turn side effects: flush any pending debounced diff computation,
	 * compute final diffs immediately, drain the next queued message, and
	 * notify the host so it can refresh git state.
	 */
	private _runTurnCompleteSideEffects(sessionKey: ProtocolURI, turnId: string | undefined): void {
		// Checkpoints, changesets and the host git-refresh notification are
		// scoped to the owning session's working tree, which peer chats
		// share. Normalize an additional-chat channel to its session for
		// those, while keeping the original channel for per-chat queued
		// message consumption (queues live on the chat state). For the
		// default chat / single-chat case `sessionKey` is already the
		// session URI, so this is a no-op.
		const sessionUri = isAhpChatChannel(sessionKey) ? parseRequiredSessionUriFromChatUri(sessionKey) : sessionKey;
		// Capture the end-of-turn git checkpoint BEFORE notifying the
		// changeset service so the per-turn changeset recompute can take
		// the authoritative git-diff fast path (which includes terminal-tool
		// edits the FileEditTracker misses). The capture is best-effort —
		// any failure logs and the changeset pipeline falls back to the
		// `file_edits`-based path. We don't block subsequent side effects
		// (queued message drain, host notification) on the changeset
		// completion since those have always been fire-and-forget; the
		// ordering guarantee we care about is checkpoint-then-changeset.
		if (turnId !== undefined) {
			this._checkpointService.captureTurnCheckpoint(URI.parse(sessionUri), turnId).then(() => {
				this._changesets.onTurnComplete(sessionUri, turnId);
			}, err => {
				this._logService.warn(`[AgentSideEffects] Turn checkpoint capture failed for ${sessionUri}/${turnId}: ${err instanceof Error ? err.message : String(err)}`);
				this._changesets.onTurnComplete(sessionUri, turnId);
			});
		} else {
			this._changesets.onTurnComplete(sessionUri, turnId);
		}
		this._tryConsumeNextQueuedMessage(sessionKey);
		this._options.onTurnComplete(sessionUri);

		// After the first turn completes, refine the auto-generated title using
		// the full first-turn context (request + response). No-op for later
		// turns or when the title has since been changed. `sessionKey` may be an
		// additional chat channel; route it as `chatChannel` so the refinement
		// targets that chat's title, mirroring `seedTitleFromFirstMessage`.
		const titleChatChannel = isAhpChatChannel(sessionKey) && !isDefaultChatUri(sessionKey) ? sessionKey : undefined;
		this._titleController.refineTitleFromFirstTurn(sessionUri, titleChatChannel);
	}

	private _describeSignal(signal: AgentSignal): string {
		return signal.kind === 'action' ? `action(${signal.action.type})` : signal.kind;
	}

	/**
	 * Replays any signals that were buffered while waiting for
	 * `subagent_started` to create the subagent session. Called immediately
	 * after `_handleSubagentStarted`.
	 */
	private _drainPendingSubagentSignals(parentChatURI: ProtocolURI, parentToolCallId: string): void {
		const buffer = this._pendingSubagentSignals.get(parentChatURI, parentToolCallId);
		if (!buffer) {
			return;
		}
		this._pendingSubagentSignals.delete(parentChatURI, parentToolCallId);
		this._logService.trace(`[AgentSideEffects] Draining ${buffer.length} buffered signal(s) for subagent ${parentChatURI}/${parentToolCallId}`);
		for (const { signal, agent } of buffer) {
			this._handleAgentSignal(agent, signal);
		}
	}

	// ---- Subagent session management ----------------------------------------

	/**
	 * Starts the subagent turn in response to a `subagent_started` event and
	 * wires the parent tool call to the subagent chat. The subagent chat's
	 * catalog membership is owned by the spawn channel
	 * ({@link AgentService._onChatSpawned}), which the orchestrator applies
	 * before this runs, so this only drives the turn/tracking/parent content
	 * — it does not add the chat.
	 *
	 * `chatURI` is always the agent's top-level chat: the subagent is
	 * registered (and inner events routed) under it because inner-tool
	 * signals carry the top-level chat as their resource. `spawningToolParentId`,
	 * when set, is the tool call one level up from the spawning `toolCallId`
	 * — the tool call in whose (subagent) chat the spawning tool lives — and
	 * is used to route the discovery content block to that immediate parent
	 * chat. Since subagent chats are flat (keyed off the root session), this
	 * one-hop reference resolves the parent chat at any nesting depth.
	 */
	private _handleSubagentStarted(
		chatURI: ProtocolURI,
		toolCallId: string,
		agentName: string,
		agentDisplayName: string,
		agentDescription?: string,
		spawningToolParentId?: string,
	): void {
		const parentSessionUri = parseRequiredSessionUriFromChatUri(chatURI);
		const subagentChatUri = buildSubagentChatUri(parentSessionUri, toolCallId);

		// Already tracking this subagent
		if (this._subagentChats.get(chatURI, toolCallId)) {
			return;
		}

		this._logService.info(`[AgentSideEffects] Starting subagent turn: ${subagentChatUri} (parent=${chatURI}, toolCallId=${toolCallId})`);

		// Start a turn on the subagent session
		const turnId = generateUuid();
		this._stateManager.dispatchServerAction(subagentChatUri, {
			type: ActionType.ChatTurnStarted,
			turnId,
			message: { text: '', origin: { kind: MessageKind.User } },
		});

		this._subagentChats.set({ parentChatUri: chatURI, toolCallId, sessionUri: parentSessionUri, chatUri: subagentChatUri }, chatURI, toolCallId);

		// Dispatch content on the spawning tool call so clients discover the
		// subagent. The tool call lives in the immediate parent chat, which is
		// the top-level chat for a first-level subagent or the immediate
		// parent subagent chat when nested (at any depth) — resolve it via
		// `spawningToolParentId` so the block lands where the tool call is
		// (dispatching on the top-level chat would be a no-op, leaving nested
		// subagents undiscoverable). Merge with any existing content to avoid
		// dropping prior content blocks.
		const contentChatUri = spawningToolParentId
			? this._subagentChats.get(chatURI, spawningToolParentId)?.chatUri ?? chatURI
			: chatURI;
		const parentTurnId = this._stateManager.getActiveTurnId(contentChatUri);
		if (parentTurnId) {
			const parentState = this._stateManager.getSessionState(contentChatUri);
			const existingContent = this._getRunningToolCallContent(parentState, parentTurnId, toolCallId);
			this._stateManager.dispatchServerAction(contentChatUri, {
				type: ActionType.ChatToolCallContentChanged,
				turnId: parentTurnId,
				toolCallId,
				content: [
					...existingContent,
					{
						type: ToolResultContentType.Subagent,
						resource: subagentChatUri,
						title: agentDisplayName,
						agentName,
						description: agentDescription,
					},
				],
			});
		}
	}

	/**
	 * Gets the current content array from a running tool call, if any.
	 */
	private _getRunningToolCallContent(
		state: ISessionWithDefaultChat | undefined,
		turnId: string,
		toolCallId: string,
	): ToolResultContent[] {
		if (!state?.activeTurn || state.activeTurn.id !== turnId) {
			return [];
		}
		for (const rp of state.activeTurn.responseParts) {
			if (rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === toolCallId && rp.toolCall.status === ToolCallStatus.Running) {
				return rp.toolCall.content ? [...rp.toolCall.content] : [];
			}
		}
		return [];
	}

	/**
	 * Cancels all active subagent sessions for a given parent session.
	 */
	cancelSubagentSessions(parentChatURI: ProtocolURI): void {
		for (const subagent of this._subagentChats.getAll(parentChatURI)) {
			const turnId = this._stateManager.getActiveTurnId(subagent.chatUri);
			if (turnId) {
				this._stateManager.dispatchServerAction(subagent.chatUri, {
					type: ActionType.ChatTurnCancelled,
					turnId,
				});
				this._turnTracker.turnCompleted(subagent.chatUri, turnId, 'cancelled');
			}
			this._toolCallTracker.clearSession(subagent.chatUri);
		}
		this._subagentChats.deleteAll(parentChatURI);
		// Drop any buffered events targeted at subagents that never started.
		this._pendingSubagentSignals.deleteAll(parentChatURI);
	}

	/**
	 * Completes the subagent session associated with a parent tool call.
	 * Driven by the `subagent_completed` signal from the agent (which the
	 * SDK fires on both `subagent.completed` and `subagent.failed`), not by
	 * parent tool call completion — background subagents keep running after
	 * their parent tool returns.
	 */
	completeSubagentSession(parentChatURI: ProtocolURI, toolCallId: string): void {
		// Drop any events that were buffered waiting for a `subagent_started`
		// that never arrived (e.g. the parent tool failed before the subagent
		// was created). Without this, the buffer entry would leak until the
		// parent session is disposed.
		this._pendingSubagentSignals.delete(parentChatURI, toolCallId);

		const subagent = this._subagentChats.get(parentChatURI, toolCallId);
		if (!subagent) {
			return;
		}

		const turnId = this._stateManager.getActiveTurnId(subagent.chatUri);
		if (turnId) {
			this._stateManager.dispatchServerAction(subagent.chatUri, {
				type: ActionType.ChatTurnComplete,
				turnId,
			});
		}
		this._subagentChats.delete(parentChatURI, toolCallId);
	}

	/**
	 * Removes all subagent chats for a given parent session from the state manager.
	 */
	removeSubagentSessions(parentSession: ProtocolURI): void {
		const parentChatURIs = new Set<ProtocolURI>();
		for (const subagent of this._subagentChats.values()) {
			if (subagent.sessionUri === parentSession) {
				this._stateManager.removeChat(subagent.sessionUri, subagent.chatUri);
				this._toolCallTracker.clearSession(subagent.chatUri);
				parentChatURIs.add(subagent.parentChatUri);
			}
		}
		for (const parentChatURI of parentChatURIs) {
			this._subagentChats.deleteAll(parentChatURI);
			this._pendingSubagentSignals.deleteAll(parentChatURI);
		}
	}

	/**
	 * Finds the subagent session that owns a given tool call by checking
	 * whether the tool call was previously registered under a subagent
	 * session key in `_toolCallAgents`. Scoped to subagent sessions owned
	 * by the given parent to avoid cross-session collisions.
	 */
	private _findSubagentChatForToolCall(parentChatURI: ProtocolURI, toolCallId: string): ProtocolURI | undefined {
		for (const subagent of this._subagentChats.getAll(parentChatURI)) {
			if (this._toolCallAgents.has(`${subagent.chatUri}:${toolCallId}`)) {
				return subagent.chatUri;
			}
		}
		return undefined;
	}

	private _toolCallCompletionChat(chatChannel: ProtocolURI): ProtocolURI {
		if (!isSubagentChatUri(chatChannel)) {
			return chatChannel;
		}

		for (const subagent of this._subagentChats.values()) {
			if (subagent.chatUri === chatChannel) {
				return this._toolCallCompletionChat(subagent.parentChatUri);
			}
		}

		this._logService.warn(`[AgentSideEffects] Missing parent chat for subagent tool completion: chat=${chatChannel}`);
		return chatChannel;
	}

	private _notifyClientToolCallComplete(sessionChannel: ProtocolURI, chatChannel: ProtocolURI, toolCallId: string, result: ToolCallResult, source: 'client-dispatch' | 'server-envelope'): void {
		const completionChat = this._toolCallCompletionChat(chatChannel);
		const agent = this._options.getAgent(sessionChannel);
		if (!agent) {
			this._logService.warn(`[AgentSideEffects] No agent for client tool completion: source=${source}, session=${sessionChannel}, chat=${chatChannel}, completionChat=${completionChat}, toolCallId=${toolCallId}`);
			return;
		}
		this._logService.info(`[AgentSideEffects] Forwarding client tool completion: source=${source}, session=${sessionChannel}, chat=${chatChannel}, completionChat=${completionChat}, toolCallId=${toolCallId}, success=${result.success}`);
		agent.onClientToolCallComplete(URI.parse(sessionChannel), URI.parse(completionChat), toolCallId, result);
	}

	// ---- Side-effect handlers --------------------------------------------------

	/**
	 * Handles a `pending_confirmation` signal end-to-end: checks for
	 * auto-approval via the permission manager, and if not auto-approved,
	 * dispatches the `ChatToolCallReady` action with confirmation options
	 * for the client.
	 */
	private async _handleToolReady(e: IAgentToolPendingConfirmationSignal, sessionKey: ProtocolURI, turnId: string, agent: IAgent): Promise<void> {
		const approvalEvent = {
			toolCallId: e.state.toolCallId,
			session: e.chat,
			permissionKind: e.permissionKind,
			permissionPath: e.permissionPath,
			toolInput: e.state.toolInput,
			requestSandboxBypass: e.requestSandboxBypass,
		};
		const autoApproval = await this._permissionManager.getAutoApproval(approvalEvent, sessionKey);
		const part = this._stateManager.getSessionState(sessionKey)?.activeTurn?.responseParts.find(part => part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === e.state.toolCallId);
		const toolCall = part?.kind === ResponsePartKind.ToolCall ? part.toolCall : undefined;
		const contributor = e.state.contributor ?? toolCall?.contributor;
		let effective = e;
		const clientShouldAutoApprove = autoApproval !== undefined
			&& contributor?.kind === ToolCallContributorKind.Client
			&& !!e.state.confirmationTitle;
		if (clientShouldAutoApprove) {
			this._toolCallAgents.set(`${sessionKey}:${e.state.toolCallId}`, agent.id);
			effective = { ...e, state: { ...e.state, _meta: { ...toolCall?._meta, ...e.state._meta, ...toToolCallMeta({ autoApproveBySetting: true }) } } };
		} else if (autoApproval !== undefined) {
			this._toolCallAgents.delete(`${sessionKey}:${e.state.toolCallId}`);
			agent.respondToPermissionRequest(e.state.toolCallId, true);
			// Strip confirmationTitle so createToolReadyAction emits the
			// auto-approved (no-options) action.
			effective = { ...e, state: { ...e.state, confirmationTitle: undefined } };
		} else if (effective.state.confirmationTitle) {
			// Make sure the agent is registered for the eventual `ChatToolCallConfirmed` response.
			this._toolCallAgents.set(`${sessionKey}:${e.state.toolCallId}`, agent.id);
		}
		this._stateManager.dispatchServerAction(
			sessionKey,
			this._permissionManager.createToolReadyAction(effective, sessionKey, turnId)
		);
	}

	handleAction(channel: ProtocolURI, action: StateAction, clientId?: string): void {
		const chatChannel = isAhpChatChannel(channel) ? channel : undefined;
		const sessionChannel = chatChannel ? parseRequiredSessionUriFromChatUri(chatChannel) : channel;
		switch (action.type) {
			case ActionType.ChatTurnStarted: {
				if (!chatChannel) {
					throw new Error(`ChatTurnStarted must be handled on an AHP chat channel: ${channel}`);
				}
				// Per-turn streaming part tracking is owned by the agent
				// (e.g. CopilotAgentSession) and reset on its `send()` call.

				// Generic, agent-agnostic host commands (`/rename`, `!command`,
				// …) are intercepted here and handled by the local-command
				// dispatcher rather than forwarded to the agent SDK.
				if (this._localCommands.tryHandle({ turnChannel: channel, turnId: action.turnId, text: action.message.text })) {
					break;
				}

				const state = this._stateManager.getSessionState(channel);
				if (!state) {
					this._logService.info(`[AgentSideEffects] Turn started for session not in state manager: ${channel}, turnId=${action.turnId} - status/summary updates may be dropped unless the session is restored`);
				}
				this._titleController.seedTitleFromFirstMessage(sessionChannel, action.message.text, chatChannel);

				const agent = this._options.getAgent(sessionChannel);
				if (!agent) {
					this._stateManager.dispatchServerAction(channel, {
						type: ActionType.ChatError,
						turnId: action.turnId,
						error: { errorType: 'noAgent', message: 'No agent found for session' },
					});
					return;
				}
				const attachments = action.message.attachments;
				this._telemetryReporter.userMessageSent(agent.id, channel, state, 'direct', attachments);
				const { model, permissionLevel } = this._getTurnTelemetryContext(state, action.message.model?.id);
				this._turnTracker.turnStarted(agent.id, channel, action.turnId, model, permissionLevel);
				void this._sendTurnMessage({
					agent,
					sessionChannel,
					turnChannel: channel,
					chat: channel,
					message: action.message,
					turnId: action.turnId,
					senderClientId: clientId,
				});
				break;
			}
			case ActionType.ChatToolCallConfirmed: {
				if (!chatChannel) {
					throw new Error(`ChatToolCallConfirmed must be handled on an AHP chat channel: ${channel}`);
				}
				const toolCallKey = `${channel}:${action.toolCallId}`;
				const agentId = this._toolCallAgents.get(toolCallKey);
				if (agentId) {
					this._toolCallAgents.delete(toolCallKey);
					const agent = this._options.agents.get().find(a => a.id === agentId);
					agent?.respondToPermissionRequest(action.toolCallId, action.approved);
				} else {
					this._logService.warn(`[AgentSideEffects] No agent for tool call confirmation: ${action.toolCallId}`);
				}

				// When the user chose "Allow in this Session", add the tool
				// to the session's permissions so future calls are auto-approved.
				if (action.approved) {
					this._permissionManager.handleToolCallConfirmed(channel, action.toolCallId, action.selectedOptionId);
				}
				break;
			}
			case ActionType.ChatInputCompleted: {
				if (!chatChannel) {
					throw new Error(`ChatInputCompleted must be handled on an AHP chat channel: ${channel}`);
				}
				const agent = this._options.getAgent(sessionChannel);
				agent?.respondToUserInputRequest(action.requestId, action.response, action.answers);
				break;
			}
			case ActionType.ChatTurnCancelled: {
				if (!chatChannel) {
					throw new Error(`ChatTurnCancelled must be handled on an AHP chat channel: ${channel}`);
				}
				this._turnTracker.turnCompleted(channel, action.turnId, 'cancelled');
				this._toolCallTracker.clearSession(channel);
				// Cancel all subagent sessions for this parent
				this.cancelSubagentSessions(channel);
				const agent = this._options.getAgent(sessionChannel);
				if (agent) {
					const chat = URI.parse(channel);
					agent.chats.abort(chat).catch(err => {
						this._logService.error('[AgentSideEffects] abort failed', err);
					});
				}
				// Intentionally do NOT drain queued messages here: cancelling means
				// "stop", so messages queued behind the turn stay queued for the
				// user to dequeue/run manually. (A message the user sends *after*
				// the abort is still consumed via the ChatPendingMessageSet path
				// once cancellation has cleared the active turn.)
				break;
			}
			case ActionType.SessionTitleChanged: {
				if (chatChannel) {
					// The rename targeted a specific chat (default or additional),
					// not the whole session. Route it to a per-chat title update so
					// the session title stays independent.
					this._stateManager.updateChatTitle(sessionChannel, chatChannel, action.title);
					this._persistSessionFlag(sessionChannel, `customChatTitle:${chatChannel}`, action.title);
					break;
				}
				this._persistSessionFlag(channel, 'customTitle', action.title);
				break;
			}
			case ActionType.ChatPendingMessageSet:
			case ActionType.ChatPendingMessageRemoved:
			case ActionType.ChatQueuedMessagesReordered: {
				if (!chatChannel) {
					throw new Error(`${action.type} must be handled on an AHP chat channel: ${channel}`);
				}
				this._syncPendingMessages(channel);
				break;
			}
			case ActionType.ChatTruncated: {
				if (!chatChannel) {
					throw new Error(`ChatTruncated must be handled on an AHP chat channel: ${channel}`);
				}
				const agent = this._options.getAgent(sessionChannel);
				// When the truncation boundary is a host-injected local turn
				// (`/rename` / `!command`), redirect the SDK truncation to the
				// preceding concrete turn so the agent keeps everything up to
				// the real message before it.
				const sdkTurnId = action.turnId !== undefined
					? this._options.localTurns.resolveConcreteTurnId(chatChannel, action.turnId)
					: action.turnId;
				// Route to the chat being truncated: the default chat (addressed
				// by the session) or a peer chat with its own backing.
				agent?.truncateSession?.(URI.parse(sessionChannel), sdkTurnId, URI.parse(chatChannel)).catch(err => {
					this._logService.error('[AgentSideEffects] truncateSession failed', err);
				});
				// Drop persisted local turns that no longer survive in the
				// (already-truncated) chat state.
				const survivingIds = new Set((this._stateManager.getChatState(chatChannel)?.turns ?? []).map(t => t.id));
				const removed = this._options.localTurns.getLocalTurnIds(chatChannel).filter(id => !survivingIds.has(id));
				this._options.localTurns.deleteLocals(sessionChannel, removed);
				this._changesets.onSessionTruncated(sessionChannel);
				break;
			}
			case ActionType.SessionActiveClientSet: {
				const agent = this._options.getAgent(channel);
				if (!agent) {
					break;
				}
				const activeClient = action.activeClient;
				const handle = agent.getOrCreateActiveClient(URI.parse(channel), {
					clientId: activeClient.clientId,
					displayName: activeClient.displayName,
				});
				handle.tools = activeClient.tools;
				handle.customizations = activeClient.customizations ?? [];
				break;
			}
			case ActionType.SessionActiveClientRemoved: {
				const agent = this._options.getAgent(channel);
				agent?.removeActiveClient(URI.parse(channel), action.clientId);
				break;
			}
			case ActionType.RootConfigChanged: {
				updateAgentHostTelemetryLevelFromConfig(this._telemetryService, action.config);
				// Host customizations are self-managed by each agent's
				// PluginController via IAgentConfigurationService.onDidRootConfigChange.
				// Republish agent infos for non-customization schema changes
				// (e.g. permissions) and session customizations as a catchall.
				this._publishAgentInfos(this._options.agents.get());
				this._publishAllSessionCustomizations();
				break;
			}
			case ActionType.SessionCustomizationToggled: {
				const agent = this._options.getAgent(channel);
				agent?.setCustomizationEnabled?.(action.id, action.enabled);
				break;
			}
			case ActionType.SessionIsReadChanged: {
				this._persistSessionFlag(channel, 'isRead', action.isRead ? 'true' : '');
				break;
			}
			case ActionType.SessionIsArchivedChanged: {
				this._persistSessionFlag(channel, 'isArchived', action.isArchived ? 'true' : '');
				const agent = this._options.getAgent(channel);
				agent?.onArchivedChanged?.(URI.parse(channel), action.isArchived).catch(err => {
					this._logService.warn(`[AgentSideEffects] onArchivedChanged failed for ${channel}`, err);
				});
				break;
			}
			case ActionType.SessionConfigChanged: {
				// Persist merged values so a future `restoreSession` can re-hydrate
				// the user's previous selections (e.g. autoApprove).
				const sessionState = this._stateManager.getSessionState(channel);
				const values = sessionState?.config?.values;
				if (values) {
					this._persistSessionFlag(channel, 'configValues', JSON.stringify(values));
				}
				break;
			}
			case ActionType.ChatToolCallComplete: {
				if (!chatChannel) {
					break; // Not a chat channel; ignore.
				}
				this._notifyClientToolCallComplete(sessionChannel, chatChannel, action.toolCallId, action.result, 'client-dispatch');
				break;
			}
		}
	}

	cancelSessionTitleGeneration(session: ProtocolURI): void {
		this._titleController.cancelTitleGeneration(session);
	}

	/**
	 * Generates a content-derived title for a freshly forked session
	 * (`chatChannel` undefined) or peer chat from its inherited chat
	 * turns, replacing the placeholder `Forked: …` title once ready.
	 */
	generateForkedTitle(channel: ProtocolURI, chatChannel: ProtocolURI | undefined, turns: readonly Turn[], fallbackTitle: string, sourceTitle?: string): void {
		this._titleController.generateForkedTitle(channel, chatChannel, turns, fallbackTitle, sourceTitle);
	}

	/**
	 * Persists a session metadata key/value pair to the session database.
	 * Used for fields the host needs to remember across restarts (custom
	 * title, isRead/isArchived flags, merged config values).
	 */
	private _persistSessionFlag(session: ProtocolURI, key: string, value: string): void {
		persistSessionMetadata(this._options.sessionDataService, this._logService, session, key, value);
	}

	private _persistChatDraft(channel: ProtocolURI, draft: Message | undefined): void {
		if (!isAhpChatChannel(channel)) {
			return;
		}

		const parsed = parseChatUri(channel);
		if (!parsed) {
			return;
		}

		const session = URI.parse(parsed.session);
		const ref = this._options.sessionDataService.openDatabase(session);
		ref.object.setChatDraft(URI.parse(channel), draft).catch(err => {
			this._logService.warn(`[AgentSideEffects] Failed to persist chat draft for ${channel.toString()}`, err);
		}).finally(() => {
			ref.dispose();
		});
	}

	/**
	 * Pushes the current pending message state from the session to the agent.
	 * The server controls queued message consumption; only steering messages
	 * are forwarded to the agent for mid-turn injection.
	 */
	private _syncPendingMessages(chatChannel: ProtocolURI): void {
		const sessionChannel = parseRequiredSessionUriFromChatUri(chatChannel);
		const state = this._stateManager.getSessionState(chatChannel);
		if (!state) {
			return;
		}
		const agent = this._options.getAgent(sessionChannel);
		agent?.setPendingMessages?.(
			URI.parse(sessionChannel),
			state.steeringMessage,
			[],
			isDefaultChatUri(chatChannel) ? undefined : URI.parse(chatChannel),
		);

		// Steering message removal is now dispatched by the agent
		// via the 'steering_consumed' progress event once the message
		// has actually been sent to the model.

		// If the session is idle, try to consume the next queued message
		this._tryConsumeNextQueuedMessage(chatChannel);
	}

	/**
	 * Consumes the next queued message by dispatching a server-initiated
	 * `ChatTurnStarted` action with `queuedMessageId` set. The reducer
	 * atomically creates the active turn and removes the message from the
	 * queue. Only consumes one message at a time; subsequent messages are
	 * consumed when the next `idle` event fires.
	 */
	private _tryConsumeNextQueuedMessage(session: ProtocolURI): void {
		const sessionChannel = parseRequiredSessionUriFromChatUri(session);
		// Bail if there's already an active turn
		if (this._stateManager.getActiveTurnId(session)) {
			return;
		}
		const state = this._stateManager.getSessionState(session);
		if (!state?.queuedMessages?.length) {
			return;
		}

		const msg = state.queuedMessages[0];
		const turnId = generateUuid();

		// Per-turn streaming part tracking is owned by the agent (reset
		// inside its `send()` call), so no host-side reset is needed.

		// Dispatch server-initiated turn start; the reducer removes the queued message atomically
		this._stateManager.dispatchServerAction(session, {
			type: ActionType.ChatTurnStarted,
			turnId,
			message: msg.message,
			queuedMessageId: msg.id,
		});

		// Generic host commands (`/rename`, `!command`, …) are intercepted by
		// the local-command dispatcher (see the ChatTurnStarted handler) and
		// must not reach the agent SDK even when queued.
		if (this._localCommands.tryHandle({ turnChannel: session, turnId, text: msg.message.text })) {
			return;
		}

		// Send the message to the agent backend. When `session` is an
		// additional chat channel, the SDK chat is owned by the
		// parent session: look up the provider by the parent session URI and
		// pass the chat channel so the harness routes to the right peer chat.
		const agent = this._options.getAgent(sessionChannel);
		if (!agent) {
			this._stateManager.dispatchServerAction(session, {
				type: ActionType.ChatError,
				turnId,
				error: { errorType: 'noAgent', message: 'No agent found for session' },
			});
			return;
		}
		const attachments = msg.message.attachments;
		const queuedState = this._stateManager.getSessionState(session);
		this._telemetryReporter.userMessageSent(agent.id, session, queuedState, 'queued', attachments);
		const { model, permissionLevel } = this._getTurnTelemetryContext(queuedState, msg.message.model?.id);
		this._turnTracker.turnStarted(agent.id, session, turnId, model, permissionLevel);
		// Selection travels on the queued message; it is applied before sending.
		void this._sendTurnMessage({
			agent,
			sessionChannel,
			turnChannel: session,
			chat: session,
			message: msg.message,
			turnId,
			senderClientId: undefined,
		});
	}


	private _getTurnTelemetryContext(state: SessionState | undefined, modelId: string | undefined): { model: string | undefined; permissionLevel: string | undefined } {
		const permissionValue = state?.config?.values[SessionConfigKey.AutoApprove];
		const permissionLevel = typeof permissionValue === 'string' ? permissionValue : undefined;
		return { model: modelId, permissionLevel };
	}

	/**
	 * Applies a turn message's model/agent selection (see
	 * {@link _applyMessageSelection}) and forwards it to the agent's
	 * `sendMessage`. A rejected send is wired to fail the turn: it logs,
	 * dispatches {@link ActionType.ChatError} on the turn channel, and marks the
	 * turn errored.
	 */
	private async _sendTurnMessage(options: {
		agent: IAgent;
		/** The agent/session URI the chat lives on (the send target). */
		sessionChannel: ProtocolURI;
		/** The channel the turn runs on — where `ChatError` / turn completion are reported. */
		turnChannel: ProtocolURI;
		/** Chat channel URI the turn targets. */
		chat: ProtocolURI;
		message: Message;
		turnId: string;
		senderClientId: string | undefined;
	}): Promise<void> {
		const { agent, turnChannel, chat, message, turnId, senderClientId } = options;

		const chatUri = URI.parse(chat);

		const selectionUpdates: Promise<void>[] = [];
		if (message.model) {
			selectionUpdates.push(agent.chats.changeModel(chatUri, message.model).catch(err => {
				this._logService.error('[AgentSideEffects] changeModel failed', err);
			}));
		}
		selectionUpdates.push(agent.chats.changeAgent(chatUri, message.agent).catch(err => {
			this._logService.error('[AgentSideEffects] changeAgent failed', err);
		}));

		await Promise.all(selectionUpdates);

		await agent.chats.sendMessage(chatUri, message.text, message.attachments, turnId, senderClientId).catch(err => {
			const errCode = (err as { code?: number })?.code;
			this._logService.error(`[AgentSideEffects] sendMessage failed for session=${turnChannel}: code=${errCode}, message=${err instanceof Error ? err.message : String(err)}, type=${err?.constructor?.name}`, err);
			this._stateManager.dispatchServerAction(turnChannel, {
				type: ActionType.ChatError,
				turnId,
				error: buildSendFailedError(err),
			});
			this._turnTracker.turnCompleted(turnChannel, turnId, 'error');
			this._toolCallTracker.clearSession(turnChannel);
		});
	}


	override dispose(): void {
		this._toolCallAgents.clear();
		this._toolCallTracker.clear();
		super.dispose();
	}
}

/**
 * Builds the {@link ErrorInfo} for a failed `sendMessage` rejection. When the
 * rejection text carries a `VSCODE_PROXY_ERROR` marker (embedded by a model
 * proxy and echoed back through the agent SDK), the decoded structured chat
 * error is attached to `_meta.chatError` so core can render a rich, localized
 * message. Otherwise the raw error message is used as-is.
 */
function buildSendFailedError(err: unknown): ErrorInfo {
	const message = String(err);
	const forwarded = tryParseForwardedChatError(err instanceof Error ? err.message : message);
	if (forwarded) {
		return { errorType: 'sendFailed', message: stripProxyErrorMarker(message), _meta: toChatErrorMeta(forwarded) };
	}
	return { errorType: 'sendFailed', message };
}
