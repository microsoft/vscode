/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, SequencerByKey } from '../../../base/common/async.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { autorun, IObservable, IReader } from '../../../base/common/observable.js';
import { hasKey } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { IAgent, IAgentAttachment, IAgentProgressEvent, type IAgentToolCompleteEvent, type IAgentToolReadyEvent } from '../common/agentService.js';
import { IDiffComputeService } from '../common/diffComputeService.js';
import { ISessionDatabase, ISessionDataService } from '../common/sessionDataService.js';
import type { AgentInfo } from '../common/state/protocol/state.js';
import { ActionType, StateAction } from '../common/state/sessionActions.js';
import {
	PendingMessageKind,
	ResponsePartKind,
	SessionStatus,
	ToolCallStatus,
	ToolResultContentType,
	buildSubagentSessionUri,
	getToolFileEdits,
	type SessionState,
	type ToolResultContent,
	type ISessionFileDiff,
	type URI as ProtocolURI,
} from '../common/state/sessionState.js';
import { AgentEventMapper } from './agentEventMapper.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { IAgentHostGitService, META_DIFF_BASE_BRANCH } from './agentHostGitService.js';
import { NodeWorkerDiffComputeService } from './diffComputeService.js';
import { computeSessionDiffs, type IIncrementalDiffOptions } from './sessionDiffAggregator.js';
import { SessionPermissionManager } from './sessionPermissions.js';

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
	/**
	 * Called after each top-level session turn completes so git state can be
	 * refreshed and published via `SessionMetaChanged`. Subagent turns are
	 * excluded — only the parent session URI is passed.
	 */
	readonly onTurnComplete: (session: ProtocolURI) => void;
}

/** A progress event that was deferred because its subagent session does not exist yet. */
interface IPendingSubagentEvent {
	readonly event: IAgentProgressEvent;
	readonly agent: IAgent;
	readonly agentMapper: AgentEventMapper;
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
	/** Per-agent event mapper instances (stateful for partId tracking). */
	private readonly _eventMappers = new Map<string, AgentEventMapper>();
	/** Shared diff compute service for calculating line-level diffs in a worker thread. */
	private readonly _diffComputeService: IDiffComputeService;
	/** Serializes per-session diff computations to avoid races with stale previousDiffs. */
	private readonly _diffComputationSequencer = new SequencerByKey<string>();
	private _lastAgentInfos: readonly AgentInfo[] = [];
	/** Per-session debounce timers for mid-turn diff computation. */
	private readonly _debouncedDiffTimers = this._register(new DisposableMap<string>());
	private static readonly _DIFF_DEBOUNCE_MS = 5000;

	private readonly _permissionManager: SessionPermissionManager;

	/**
	 * Maps `parentSession:toolCallId` → subagent session URI.
	 * Used to route events with `parentToolCallId` to the correct subagent.
	 */
	private readonly _subagentSessions = new Map<string, ProtocolURI>();

	/**
	 * Buffers progress events whose `parentToolCallId` references a subagent
	 * whose `subagent_started` event has not yet been processed. The SDK is
	 * not strict about ordering: an inner `tool_start` can arrive before the
	 * `subagent_started` that creates the child session. Without buffering,
	 * those events would be dispatched against the parent session and the
	 * UI would render the inner tool calls flat at the top level rather than
	 * grouping them under the subagent. Drained by `_handleSubagentStarted`.
	 *
	 * Key: `${parentSession}:${parentToolCallId}`.
	 */
	private readonly _pendingSubagentEvents = new Map<string, IPendingSubagentEvent[]>();

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		private readonly _options: IAgentSideEffectsOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
	) {
		super();
		this._diffComputeService = this._register(new NodeWorkerDiffComputeService(this._logService));
		this._permissionManager = this._register(instantiationService.createInstance(SessionPermissionManager, this._stateManager));

		// Whenever the agents observable changes, publish to root state.
		this._register(autorun(reader => {
			const agents = this._options.agents.read(reader);
			this._publishAgentInfos(agents, reader);
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
					supportsVision: m.supportsVision,
					policyState: m.policyState,
					configSchema: m.configSchema,
				})),
				customizations: customizations?.length ? [...customizations] : undefined,
				protectedResources: protectedResources.length > 0 ? protectedResources : undefined,
			};
		});
		if (equals(this._lastAgentInfos, infos)) {
			return;
		}
		this._lastAgentInfos = infos;
		this._stateManager.dispatchServerAction({ type: ActionType.RootAgentsChanged, agents: infos });
	}

	private async _publishSessionCustomizations(agent: IAgent, session: ProtocolURI): Promise<void> {
		if (!agent.getSessionCustomizations) {
			return;
		}

		const customizations = await agent.getSessionCustomizations(URI.parse(session));
		this._stateManager.dispatchServerAction({
			type: ActionType.SessionCustomizationsChanged,
			session,
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
	 * Registers a progress-event listener on the given agent so that
	 * `IAgentProgressEvent`s are mapped to protocol actions and dispatched
	 * through the state manager. Returns a disposable that removes the
	 * listener.
	 */
	registerProgressListener(agent: IAgent): IDisposable {
		const disposables = new DisposableStore();
		let mapper = this._eventMappers.get(agent.id);
		if (!mapper) {
			mapper = new AgentEventMapper();
			this._eventMappers.set(agent.id, mapper);
		}
		const agentMapper = mapper;
		disposables.add(agent.onDidSessionProgress(e => {
			this._handleAgentProgress(agent, agentMapper, e);
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
	 * Routes a single progress event from `agent` to the correct session.
	 *
	 * Events with a `parentToolCallId` are routed to the matching subagent
	 * session. If the subagent session does not exist yet (the SDK can emit
	 * an inner `tool_start` before its `subagent_started`), the event is
	 * buffered in `_pendingSubagentEvents` and replayed once the
	 * `subagent_started` arrives.
	 */
	private _handleAgentProgress(agent: IAgent, agentMapper: AgentEventMapper, e: IAgentProgressEvent): void {
		const sessionKey = e.session.toString();

		// Track tool calls so handleAction can route confirmations. Defer
		// registration for inner subagent tool calls (those carrying a
		// `parentToolCallId`) until we know which subagent session they
		// belong to — otherwise we'd register them under the parent
		// session key and a later `tool_ready` (which lacks
		// `parentToolCallId`) could be routed against the wrong session.
		if (e.type === 'tool_start' && !this._getParentToolCallId(e)) {
			this._toolCallAgents.set(`${sessionKey}:${e.toolCallId}`, agent.id);
		}

		// Handle subagent_started: create the subagent session, then drain
		// any inner events that arrived before us.
		if (e.type === 'subagent_started') {
			this._handleSubagentStarted(sessionKey, e.toolCallId, e.agentName, e.agentDisplayName, e.agentDescription);
			this._drainPendingSubagentEvents(sessionKey, e.toolCallId);
			return;
		}

		// Route events with parentToolCallId to the subagent session.
		const parentToolCallId = this._getParentToolCallId(e);
		if (parentToolCallId) {
			const subagentKey = `${sessionKey}:${parentToolCallId}`;
			const subagentSession = this._subagentSessions.get(subagentKey);
			if (subagentSession) {
				// Track tool calls in subagent context for confirmation routing
				if (e.type === 'tool_start') {
					this._toolCallAgents.set(`${subagentSession}:${e.toolCallId}`, agent.id);
				}
				const subTurnId = this._stateManager.getActiveTurnId(subagentSession);
				if (subTurnId) {
					if (e.type === 'tool_ready') {
						this._handleToolReady(e, subagentSession, subTurnId, agent);
					} else {
						this._dispatchProgressActions(agentMapper, e, subagentSession, subTurnId);
					}
				}
				return;
			}

			// Subagent session does not exist yet — buffer the event so we
			// can replay it after `subagent_started` arrives. Without this,
			// inner tool calls would leak into the parent session and the
			// UI would render them flat at the top level.
			this._logService.trace(`[AgentSideEffects] Buffering ${e.type} for pending subagent ${subagentKey}`);
			let buffer = this._pendingSubagentEvents.get(subagentKey);
			if (!buffer) {
				buffer = [];
				this._pendingSubagentEvents.set(subagentKey, buffer);
			}
			buffer.push({ event: e, agent, agentMapper });
			return;
		}

		// Route tool_ready events for tools inside subagent sessions
		// (tool_ready lacks parentToolCallId, but the tool was previously
		// registered under its subagent session key in _toolCallAgents)
		if (e.type === 'tool_ready') {
			const subagentSession = this._findSubagentSessionForToolCall(sessionKey, e.toolCallId);
			if (subagentSession) {
				const subTurnId = this._stateManager.getActiveTurnId(subagentSession);
				if (subTurnId) {
					this._handleToolReady(e, subagentSession, subTurnId, agent);
				}
				return;
			}
		}

		const turnId = this._stateManager.getActiveTurnId(sessionKey);
		if (turnId) {
			if (e.type === 'tool_ready') {
				this._handleToolReady(e, sessionKey, turnId, agent);
				return;
			}

			// When a parent tool call has an associated subagent session,
			// preserve the subagent content metadata in the completion
			// result. The SDK's tool_complete provides its own content
			// which would overwrite the ToolResultSubagentContent that
			// was set via SessionToolCallContentChanged while running.
			if (e.type === 'tool_complete') {
				const subagentKey = `${sessionKey}:${e.toolCallId}`;
				const subagentUri = this._subagentSessions.get(subagentKey);
				if (subagentUri) {
					const parentState = this._stateManager.getSessionState(sessionKey);
					const runningContent = this._getRunningToolCallContent(parentState, turnId, e.toolCallId);
					const subagentEntry = runningContent.find(c => hasKey(c, { type: true }) && c.type === ToolResultContentType.Subagent);
					if (subagentEntry) {
						const mergedContent = [...(e.result.content ?? []), subagentEntry];
						e = { ...e, result: { ...e.result, content: mergedContent } };
					}
				}
			}

			this._dispatchProgressActions(agentMapper, e, sessionKey, turnId);

			// When a parent tool call completes, complete any associated subagent session
			if (e.type === 'tool_complete') {
				this.completeSubagentSession(sessionKey, e.toolCallId);
				if (getToolFileEdits((e as IAgentToolCompleteEvent).result).length > 0) {
					this._scheduleDebouncedDiffComputation(sessionKey, turnId);
				}
			}
		}

		// After a turn completes (idle event), flush any pending debounced
		// diff computation and compute final diffs immediately, then refresh
		// git state so the toolbar buttons reflect post-turn repository state.
		if (e.type === 'idle') {
			this._cancelDebouncedDiffComputation(sessionKey);
			this._computeSessionDiffs(sessionKey, turnId);
			this._tryConsumeNextQueuedMessage(sessionKey);
			this._options.onTurnComplete(sessionKey as ProtocolURI);
		}

		// Steering message was consumed by the agent — remove from protocol state
		if (e.type === 'steering_consumed') {
			this._stateManager.dispatchServerAction({
				type: ActionType.SessionPendingMessageRemoved,
				session: sessionKey,
				kind: PendingMessageKind.Steering,
				id: e.id,
			});
		}
	}

	/**
	 * Replays any progress events that were buffered while waiting for
	 * `subagent_started` to create the subagent session. Called immediately
	 * after `_handleSubagentStarted`.
	 */
	private _drainPendingSubagentEvents(parentSession: ProtocolURI, parentToolCallId: string): void {
		const subagentKey = `${parentSession}:${parentToolCallId}`;
		const buffer = this._pendingSubagentEvents.get(subagentKey);
		if (!buffer) {
			return;
		}
		this._pendingSubagentEvents.delete(subagentKey);
		this._logService.trace(`[AgentSideEffects] Draining ${buffer.length} buffered event(s) for subagent ${subagentKey}`);
		for (const { event, agent, agentMapper } of buffer) {
			this._handleAgentProgress(agent, agentMapper, event);
		}
	}

	// ---- Subagent session management ----------------------------------------

	/**
	 * Creates a subagent session in response to a `subagent_started` event.
	 * The subagent session is created silently (no `sessionAdded` notification)
	 * and immediately transitioned to ready with an active turn.
	 */
	private _handleSubagentStarted(
		parentSession: ProtocolURI,
		toolCallId: string,
		agentName: string,
		agentDisplayName: string,
		agentDescription?: string,
	): void {
		const subagentSessionUri = buildSubagentSessionUri(parentSession, toolCallId);
		const subagentKey = `${parentSession}:${toolCallId}`;

		// Already tracking this subagent
		if (this._subagentSessions.has(subagentKey)) {
			return;
		}

		this._logService.info(`[AgentSideEffects] Creating subagent session: ${subagentSessionUri} (parent=${parentSession}, toolCallId=${toolCallId})`);
		const parentState = this._stateManager.getSessionState(parentSession);

		// Create the subagent session silently (restoreSession skips notification)
		this._stateManager.restoreSession(
			{
				resource: subagentSessionUri,
				provider: 'subagent',
				title: agentDisplayName,
				status: SessionStatus.Idle,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
				...(parentState?.summary.project ? { project: parentState.summary.project } : {}),
			},
			[],
		);

		// Start a turn on the subagent session
		const turnId = generateUuid();
		this._stateManager.dispatchServerAction({
			type: ActionType.SessionTurnStarted,
			session: subagentSessionUri,
			turnId,
			userMessage: { text: '' },
		});

		this._subagentSessions.set(subagentKey, subagentSessionUri);

		// Dispatch content on the parent tool call so clients discover the subagent.
		// Merge with any existing content to avoid dropping prior content blocks.
		const parentTurnId = this._stateManager.getActiveTurnId(parentSession);
		if (parentTurnId) {
			const parentState = this._stateManager.getSessionState(parentSession);
			const existingContent = this._getRunningToolCallContent(parentState, parentTurnId, toolCallId);
			const mergedContent = [
				...existingContent,
				{
					type: ToolResultContentType.Subagent as const,
					resource: subagentSessionUri,
					title: agentDisplayName,
					agentName,
					description: agentDescription,
				},
			];
			this._stateManager.dispatchServerAction({
				type: ActionType.SessionToolCallContentChanged,
				session: parentSession,
				turnId: parentTurnId,
				toolCallId,
				content: mergedContent,
			});
		}
	}

	/**
	 * Gets the current content array from a running tool call, if any.
	 */
	private _getRunningToolCallContent(
		state: SessionState | undefined,
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
	cancelSubagentSessions(parentSession: ProtocolURI): void {
		for (const [key, subagentUri] of this._subagentSessions) {
			if (key.startsWith(`${parentSession}:`)) {
				const turnId = this._stateManager.getActiveTurnId(subagentUri);
				if (turnId) {
					this._stateManager.dispatchServerAction({
						type: ActionType.SessionTurnCancelled,
						session: subagentUri,
						turnId,
					});
				}
				this._subagentSessions.delete(key);
			}
		}
		// Drop any buffered events targeted at subagents that never started.
		for (const key of [...this._pendingSubagentEvents.keys()]) {
			if (key.startsWith(`${parentSession}:`)) {
				this._pendingSubagentEvents.delete(key);
			}
		}
	}

	/**
	 * Completes all active subagent sessions for a given parent session.
	 * Called when a parent tool call completes.
	 */
	completeSubagentSession(parentSession: ProtocolURI, toolCallId: string): void {
		const key = `${parentSession}:${toolCallId}`;

		// Drop any events that were buffered waiting for a `subagent_started`
		// that never arrived (e.g. the parent tool failed before the subagent
		// was created). Without this, the buffer entry would leak until the
		// parent session is disposed.
		this._pendingSubagentEvents.delete(key);

		const subagentUri = this._subagentSessions.get(key);
		if (!subagentUri) {
			return;
		}

		const turnId = this._stateManager.getActiveTurnId(subagentUri);
		if (turnId) {
			this._stateManager.dispatchServerAction({
				type: ActionType.SessionTurnComplete,
				session: subagentUri,
				turnId,
			});
		}
		this._subagentSessions.delete(key);
	}

	/**
	 * Removes all subagent sessions for a given parent session from
	 * the state manager. Called when the parent session is disposed.
	 */
	removeSubagentSessions(parentSession: ProtocolURI): void {
		const toRemove: string[] = [];
		for (const [key, subagentUri] of this._subagentSessions) {
			if (key.startsWith(`${parentSession}:`)) {
				this._stateManager.removeSession(subagentUri);
				toRemove.push(key);
			}
		}
		for (const key of toRemove) {
			this._subagentSessions.delete(key);
		}

		// Also clean up any subagent sessions that are in the state manager
		// but not tracked (e.g. restored sessions)
		const prefix = `${parentSession}/subagent/`;
		for (const uri of this._stateManager.getSessionUrisWithPrefix(prefix)) {
			this._stateManager.removeSession(uri);
		}

		// Drop any buffered events targeted at subagents that never started.
		for (const key of [...this._pendingSubagentEvents.keys()]) {
			if (key.startsWith(`${parentSession}:`)) {
				this._pendingSubagentEvents.delete(key);
			}
		}
	}

	/**
	 * Extracts the `parentToolCallId` from a progress event, if present.
	 */
	private _getParentToolCallId(e: IAgentProgressEvent): string | undefined {
		switch (e.type) {
			case 'delta':
			case 'message':
			case 'tool_start':
			case 'tool_complete':
				return e.parentToolCallId;
			default:
				return undefined;
		}
	}

	/**
	 * Finds the subagent session that owns a given tool call by checking
	 * whether the tool call was previously registered under a subagent
	 * session key in `_toolCallAgents`. Scoped to subagent sessions owned
	 * by the given parent to avoid cross-session collisions.
	 */
	private _findSubagentSessionForToolCall(parentSession: ProtocolURI, toolCallId: string): ProtocolURI | undefined {
		const prefix = `${parentSession}:`;
		for (const [key, subagentUri] of this._subagentSessions) {
			if (key.startsWith(prefix) && this._toolCallAgents.has(`${subagentUri}:${toolCallId}`)) {
				return subagentUri;
			}
		}
		return undefined;
	}

	// ---- Side-effect handlers --------------------------------------------------

	private _dispatchProgressActions(mapper: AgentEventMapper, e: IAgentProgressEvent, sessionKey: ProtocolURI, turnId: string): void {
		const actions = mapper.mapProgressEventToActions(e, sessionKey, turnId);
		if (actions) {
			if (Array.isArray(actions)) {
				for (const action of actions) {
					this._stateManager.dispatchServerAction(action);
				}
			} else {
				this._stateManager.dispatchServerAction(actions);
			}
		}
	}

	/**
	 * Handles a `tool_ready` event end-to-end: checks for auto-approval via
	 * the permission manager, and if not auto-approved, dispatches the
	 * `SessionToolCallReady` action with confirmation options for the client.
	 */
	private _handleToolReady(e: IAgentToolReadyEvent, sessionKey: ProtocolURI, turnId: string, agent: IAgent): void {
		const autoApproval = this._permissionManager.getAutoApproval(e, sessionKey);
		if (autoApproval !== undefined) {
			this._toolCallAgents.delete(`${sessionKey}:${e.toolCallId}`);
			agent.respondToPermissionRequest(e.toolCallId, true);
			return;
		}
		this._stateManager.dispatchServerAction(
			this._permissionManager.createToolReadyAction(e, sessionKey, turnId)
		);
	}

	handleAction(action: StateAction): void {
		switch (action.type) {
			case ActionType.SessionTurnStarted: {
				// Reset the event mapper's part tracking for the new turn
				for (const mapper of this._eventMappers.values()) {
					mapper.reset(action.session);
				}

				// On the very first turn, immediately set the session title to the
				// user's message so the UI shows a meaningful title right away
				// while waiting for the AI-generated title. Only apply when the
				// title is still the default placeholder to avoid clobbering a
				// title set by the user or provider before the first turn.
				const state = this._stateManager.getSessionState(action.session);
				const fallbackTitle = action.userMessage.text.trim().replace(/\s+/g, ' ').slice(0, 200);
				if (state && state.turns.length === 0 && !state.summary.title && fallbackTitle.length > 0) {
					this._stateManager.dispatchServerAction({
						type: ActionType.SessionTitleChanged,
						session: action.session,
						title: fallbackTitle,
					});
				}

				const agent = this._options.getAgent(action.session);
				if (!agent) {
					this._stateManager.dispatchServerAction({
						type: ActionType.SessionError,
						session: action.session,
						turnId: action.turnId,
						error: { errorType: 'noAgent', message: 'No agent found for session' },
					});
					return;
				}
				const attachments = action.userMessage.attachments?.map((a): IAgentAttachment => ({
					type: a.type,
					uri: URI.parse(a.uri),
					displayName: a.displayName,
				}));
				agent.sendMessage(URI.parse(action.session), action.userMessage.text, attachments, action.turnId).catch(err => {
					const errCode = (err as { code?: number })?.code;
					this._logService.error(`[AgentSideEffects] sendMessage failed for session=${action.session}: code=${errCode}, message=${err instanceof Error ? err.message : String(err)}, type=${err?.constructor?.name}`, err);
					this._stateManager.dispatchServerAction({
						type: ActionType.SessionError,
						session: action.session,
						turnId: action.turnId,
						error: { errorType: 'sendFailed', message: String(err) },
					});
				});
				break;
			}
			case ActionType.SessionToolCallConfirmed: {
				const toolCallKey = `${action.session}:${action.toolCallId}`;
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
					this._permissionManager.handleToolCallConfirmed(action.session, action.toolCallId, action.selectedOptionId);
				}
				break;
			}
			case ActionType.SessionInputCompleted: {
				const agent = this._options.getAgent(action.session);
				agent?.respondToUserInputRequest(action.requestId, action.response, action.answers);
				break;
			}
			case ActionType.SessionTurnCancelled: {
				// Cancel all subagent sessions for this parent
				this.cancelSubagentSessions(action.session);
				const agent = this._options.getAgent(action.session);
				agent?.abortSession(URI.parse(action.session)).catch(err => {
					this._logService.error('[AgentSideEffects] abortSession failed', err);
				});
				break;
			}
			case ActionType.SessionModelChanged: {
				const agent = this._options.getAgent(action.session);
				agent?.changeModel?.(URI.parse(action.session), action.model).catch(err => {
					this._logService.error('[AgentSideEffects] changeModel failed', err);
				});
				break;
			}
			case ActionType.SessionTitleChanged: {
				this._persistTitle(action.session, action.title);
				break;
			}
			case ActionType.SessionPendingMessageSet:
			case ActionType.SessionPendingMessageRemoved:
			case ActionType.SessionQueuedMessagesReordered: {
				this._syncPendingMessages(action.session);
				break;
			}
			case ActionType.SessionTruncated: {
				const agent = this._options.getAgent(action.session);
				agent?.truncateSession?.(URI.parse(action.session), action.turnId).catch(err => {
					this._logService.error('[AgentSideEffects] truncateSession failed', err);
				});
				// Turns were removed — recompute diffs from scratch (no changedTurnId)
				this._computeSessionDiffs(action.session);
				break;
			}
			case ActionType.SessionActiveClientChanged: {
				const agent = this._options.getAgent(action.session);
				if (!agent) {
					break;
				}
				// Always forward client tools, even if empty, to clear previous client's tools
				const clientId = action.activeClient?.clientId ?? '';
				agent.setClientTools(URI.parse(action.session), clientId, action.activeClient?.tools ?? []);

				const refs = action.activeClient?.customizations ?? [];
				agent.setClientCustomizations(
					clientId,
					refs,
					() => {
						this._publishSessionCustomizationsSoon(agent, action.session);
					},
				).then(() => {
					this._publishSessionCustomizationsSoon(agent, action.session);
				}).catch(err => {
					this._logService.error('[AgentSideEffects] setClientCustomizations failed', err);
				});
				break;
			}
			case ActionType.RootConfigChanged: {
				// Host customizations are self-managed by each agent's
				// PluginController via IAgentConfigurationService.onDidRootConfigChange.
				// Republish agent infos for non-customization schema changes
				// (e.g. permissions) and session customizations as a catchall.
				this._publishAgentInfos(this._options.agents.get());
				this._publishAllSessionCustomizations();
				break;
			}
			case ActionType.SessionActiveClientToolsChanged: {
				const agent = this._options.getAgent(action.session);
				if (agent) {
					const sessionState = this._stateManager.getSessionState(action.session);
					const toolClientId = sessionState?.activeClient?.clientId;
					if (toolClientId) {
						agent.setClientTools(URI.parse(action.session), toolClientId, action.tools);
					}
				}
				break;
			}
			case ActionType.SessionCustomizationToggled: {
				const agent = this._options.getAgent(action.session);
				agent?.setCustomizationEnabled?.(action.uri, action.enabled);
				break;
			}
			case ActionType.SessionIsReadChanged: {
				this._persistSessionFlag(action.session, 'isRead', action.isRead ? 'true' : '');
				break;
			}
			case ActionType.SessionIsArchivedChanged: {
				this._persistSessionFlag(action.session, 'isArchived', action.isArchived ? 'true' : '');
				break;
			}
			case ActionType.SessionConfigChanged: {
				// Persist merged values so a future `restoreSession` can re-hydrate
				// the user's previous selections (e.g. autoApprove).
				const sessionState = this._stateManager.getSessionState(action.session);
				const values = sessionState?.config?.values;
				if (values) {
					this._persistSessionFlag(action.session, 'configValues', JSON.stringify(values));
				}
				break;
			}
			case ActionType.SessionToolCallComplete: {
				const agent = this._options.getAgent(action.session);
				agent?.onClientToolCallComplete(URI.parse(action.session), action.toolCallId, action.result);
				break;
			}
		}
	}

	private _persistTitle(session: ProtocolURI, title: string): void {
		const ref = this._options.sessionDataService.openDatabase(URI.parse(session));
		ref.object.setMetadata('customTitle', title).catch(err => {
			this._logService.warn('[AgentSideEffects] Failed to persist session title', err);
		}).finally(() => {
			ref.dispose();
		});
	}

	private _persistSessionFlag(session: ProtocolURI, key: string, value: string): void {
		const ref = this._options.sessionDataService.openDatabase(URI.parse(session));
		ref.object.setMetadata(key, value).catch(err => {
			this._logService.warn(`[AgentSideEffects] Failed to persist ${key}`, err);
		}).finally(() => {
			ref.dispose();
		});
	}

	/**
	 * Pushes the current pending message state from the session to the agent.
	 * The server controls queued message consumption; only steering messages
	 * are forwarded to the agent for mid-turn injection.
	 */
	private _syncPendingMessages(session: ProtocolURI): void {
		const state = this._stateManager.getSessionState(session);
		if (!state) {
			return;
		}
		const agent = this._options.getAgent(session);
		agent?.setPendingMessages?.(
			URI.parse(session),
			state.steeringMessage,
			[],
		);

		// Steering message removal is now dispatched by the agent
		// via the 'steering_consumed' progress event once the message
		// has actually been sent to the model.

		// If the session is idle, try to consume the next queued message
		this._tryConsumeNextQueuedMessage(session);
	}

	/**
	 * Consumes the next queued message by dispatching a server-initiated
	 * `SessionTurnStarted` action with `queuedMessageId` set. The reducer
	 * atomically creates the active turn and removes the message from the
	 * queue. Only consumes one message at a time; subsequent messages are
	 * consumed when the next `idle` event fires.
	 */
	private _tryConsumeNextQueuedMessage(session: ProtocolURI): void {
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

		// Reset event mappers for the new turn (same as handleAction does for SessionTurnStarted)
		for (const mapper of this._eventMappers.values()) {
			mapper.reset(session);
		}

		// Dispatch server-initiated turn start; the reducer removes the queued message atomically
		this._stateManager.dispatchServerAction({
			type: ActionType.SessionTurnStarted,
			session,
			turnId,
			userMessage: msg.userMessage,
			queuedMessageId: msg.id,
		});

		// Send the message to the agent backend
		const agent = this._options.getAgent(session);
		if (!agent) {
			this._stateManager.dispatchServerAction({
				type: ActionType.SessionError,
				session,
				turnId,
				error: { errorType: 'noAgent', message: 'No agent found for session' },
			});
			return;
		}
		const attachments = msg.userMessage.attachments?.map((a): IAgentAttachment => ({
			type: a.type,
			uri: URI.parse(a.uri),
			displayName: a.displayName,
		}));
		agent.sendMessage(URI.parse(session), msg.userMessage.text, attachments, turnId).catch(err => {
			this._logService.error('[AgentSideEffects] sendMessage failed (queued)', err);
			this._stateManager.dispatchServerAction({
				type: ActionType.SessionError,
				session,
				turnId,
				error: { errorType: 'sendFailed', message: String(err) },
			});
		});
	}

	// ---- Session diff computation ----------------------------------------------

	/**
	 * Schedules a debounced diff computation for a session. If a timer is
	 * already pending for this session, it is replaced (restarting the delay).
	 * The computation fires after {@link _DIFF_DEBOUNCE_MS} unless cancelled
	 * or flushed by the turn-complete handler.
	 */
	private _scheduleDebouncedDiffComputation(session: ProtocolURI, turnId: string): void {
		// DisposableMap.set() auto-disposes any previous timer for this session
		this._debouncedDiffTimers.set(session, disposableTimeout(() => {
			this._debouncedDiffTimers.deleteAndDispose(session);
			this._computeSessionDiffs(session, turnId);
		}, AgentSideEffects._DIFF_DEBOUNCE_MS));
	}

	/**
	 * Cancels any pending debounced diff computation for a session.
	 * Called at turn end before the final (non-debounced) computation.
	 */
	private _cancelDebouncedDiffComputation(session: ProtocolURI): void {
		this._debouncedDiffTimers.deleteAndDispose(session);
	}

	/**
	 * Asynchronously (re)computes aggregated diff statistics for a session
	 * and dispatches {@link ActionType.SessionDiffsChanged} to update the
	 * session summary. Fire-and-forget: errors are logged but do not fail
	 * the turn.
	 */
	private _computeSessionDiffs(session: ProtocolURI, changedTurnId?: string): void {
		// Chain onto any pending computation for this session to ensure
		// sequential access to previousDiffs (avoids stale-read races).
		this._diffComputationSequencer.queue(session, () => this._doComputeSessionDiffs(session, changedTurnId));
	}

	private async _doComputeSessionDiffs(session: ProtocolURI, changedTurnId?: string): Promise<void> {
		let ref: ReturnType<ISessionDataService['openDatabase']>;
		try {
			ref = this._options.sessionDataService.openDatabase(URI.parse(session));
		} catch (err) {
			this._logService.warn(`[AgentSideEffects] Failed to open session database for diff computation: ${session}`, err);
			return;
		}
		try {
			// Prefer a git-driven diff so terminal-driven file changes show up
			// alongside SDK-tracked tool edits. The git path is the source of
			// truth whenever the working directory is a real work tree; we
			// only fall back to the edit-tracker aggregator when it isn't
			// (e.g. agents running in non-git scratch directories or under
			// test harnesses without git).
			let diffs = await this._tryComputeGitDiffs(session, ref.object);
			if (!diffs) {
				// Build incremental options when a specific turn triggered the recomputation
				let incremental: IIncrementalDiffOptions | undefined;
				if (changedTurnId) {
					const previousDiffs = this._stateManager.getSessionState(session)?.summary.diffs;
					if (previousDiffs) {
						incremental = { changedTurnId, previousDiffs };
					}
				}
				diffs = await computeSessionDiffs(session, ref.object, this._diffComputeService, incremental);
			}

			this._stateManager.dispatchServerAction({
				type: ActionType.SessionDiffsChanged,
				session,
				diffs: [...diffs],
			});
			// Persist diffs to the session database so they survive restarts
			ref.object.setMetadata('diffs', JSON.stringify(diffs)).catch(err => {
				this._logService.warn('[AgentSideEffects] Failed to persist session diffs', err);
			});
		} catch (err) {
			this._logService.warn('[AgentSideEffects] Failed to compute session diffs', err);
		} finally {
			ref.dispose();
		}
	}

	/**
	 * Computes session diffs by shelling out to git. Returns the diff list
	 * when the session has a working directory and that directory is a git
	 * work tree; returns `undefined` otherwise so the caller can fall back
	 * to the edit-tracker aggregator. The base branch (anchor for the
	 * `merge-base` baseline) is read from the provider-agnostic
	 * {@link META_DIFF_BASE_BRANCH} metadata key — agents that create
	 * worktrees write it at session-creation time.
	 */
	private async _tryComputeGitDiffs(session: ProtocolURI, db: ISessionDatabase): Promise<readonly ISessionFileDiff[] | undefined> {
		const workingDirectory = this._stateManager.getSessionState(session)?.summary.workingDirectory;
		if (!workingDirectory) {
			return undefined;
		}
		let workingDirectoryUri: URI;
		try {
			workingDirectoryUri = URI.parse(workingDirectory);
		} catch {
			return undefined;
		}
		const baseBranch = (await db.getMetadata(META_DIFF_BASE_BRANCH)) ?? undefined;
		try {
			return await this._gitService.computeSessionFileDiffs(workingDirectoryUri, { sessionUri: session, baseBranch });
		} catch (err) {
			this._logService.warn('[AgentSideEffects] git-driven diff computation failed; falling back to edit-tracker', err);
			return undefined;
		}
	}

	override dispose(): void {
		this._toolCallAgents.clear();
		super.dispose();
	}
}
