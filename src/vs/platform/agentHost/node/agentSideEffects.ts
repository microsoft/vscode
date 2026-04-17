/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, SequencerByKey } from '../../../base/common/async.js';
import { match as globMatch } from '../../../base/common/glob.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { autorun, IObservable, IReader } from '../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase, normalizePath } from '../../../base/common/resources.js';
import { hasKey } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import { IAgent, IAgentAttachment, IAgentProgressEvent, type IAgentToolCompleteEvent, type IAgentToolReadyEvent } from '../common/agentService.js';
import { IDiffComputeService } from '../common/diffComputeService.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import type { IAgentInfo } from '../common/state/protocol/state.js';
import { ActionType, ISessionAction } from '../common/state/sessionActions.js';
import {
	CustomizationStatus,
	PendingMessageKind,
	ResponsePartKind,
	SessionStatus,
	ToolCallStatus,
	ToolResultContentType,
	buildSubagentSessionUri,
	getToolFileEdits,
	type ISessionCustomization,
	type ISessionState,
	type IToolResultContent,
	type URI as ProtocolURI,
} from '../common/state/sessionState.js';
import { AgentEventMapper } from './agentEventMapper.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { CommandAutoApprover } from './commandAutoApprover.js';
import { NodeWorkerDiffComputeService } from './diffComputeService.js';
import { computeSessionDiffs, type IIncrementalDiffOptions } from './sessionDiffAggregator.js';

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
	/** Auto-approver for shell commands parsed via tree-sitter. */
	private readonly _commandAutoApprover: CommandAutoApprover;
	/** Shared diff compute service for calculating line-level diffs in a worker thread. */
	private readonly _diffComputeService: IDiffComputeService;
	/** Serializes per-session diff computations to avoid races with stale previousDiffs. */
	private readonly _diffComputationSequencer = new SequencerByKey<string>();
	private _lastAgentInfos: readonly IAgentInfo[] = [];
	/** Per-session debounce timers for mid-turn diff computation. */
	private readonly _debouncedDiffTimers = this._register(new DisposableMap<string>());
	private static readonly _DIFF_DEBOUNCE_MS = 5000;

	/**
	 * Maps `parentSession:toolCallId` → subagent session URI.
	 * Used to route events with `parentToolCallId` to the correct subagent.
	 */
	private readonly _subagentSessions = new Map<string, ProtocolURI>();

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		private readonly _options: IAgentSideEffectsOptions,
		private readonly _logService: ILogService,
	) {
		super();
		this._commandAutoApprover = this._register(new CommandAutoApprover(this._logService));
		this._diffComputeService = this._register(new NodeWorkerDiffComputeService(this._logService));

		// Whenever the agents observable changes, publish to root state.
		this._register(autorun(reader => {
			const agents = this._options.agents.read(reader);
			this._publishAgentInfos(agents, reader);
		}));
	}

	/**
	 * Publishes agent descriptors using the last known model lists.
	 */
	private _publishAgentInfos(agents: readonly IAgent[], reader: IReader): void {
		const infos: IAgentInfo[] = agents.map(a => {
			const d = a.getDescriptor();
			const protectedResources = a.getProtectedResources();
			return {
				provider: d.provider, displayName: d.displayName, description: d.description, models: a.models.read(reader).map(m => ({
					id: m.id,
					provider: m.provider,
					name: m.name,
					maxContextWindow: m.maxContextWindow,
					supportsVision: m.supportsVision,
					policyState: m.policyState,
				})),
				protectedResources: protectedResources.length > 0 ? protectedResources : undefined,
			};
		});
		if (equals(this._lastAgentInfos, infos)) {
			return;
		}
		this._lastAgentInfos = infos;
		this._stateManager.dispatchServerAction({ type: ActionType.RootAgentsChanged, agents: infos });
	}

	// ---- Edit auto-approve --------------------------------------------------

	/**
	 * Default edit auto-approve patterns applied by the agent host.
	 * Matches the VS Code `chat.tools.edits.autoApprove` setting defaults.
	 */
	private static readonly _DEFAULT_EDIT_AUTO_APPROVE_PATTERNS: Readonly<Record<string, boolean>> = {
		'**/*': true,
		'**/.vscode/*.json': false,
		'**/.git/**': false,
		'**/{package.json,server.xml,build.rs,web.config,.gitattributes,.env}': false,
		'**/*.{code-workspace,csproj,fsproj,vbproj,vcxproj,proj,targets,props}': false,
		'**/*.lock': false,
		'**/*-lock.{yaml,json}': false,
	};

	/**
	 * Returns whether a write to `filePath` should be auto-approved based on
	 * the built-in default patterns.
	 */
	private _shouldAutoApproveEdit(filePath: string): boolean {
		const patterns = AgentSideEffects._DEFAULT_EDIT_AUTO_APPROVE_PATTERNS;
		let approved = true;
		for (const [pattern, isApproved] of Object.entries(patterns)) {
			if (isApproved !== approved && globMatch(pattern, filePath)) {
				approved = isApproved;
			}
		}
		return approved;
	}

	/**
	 * Initializes async resources (tree-sitter WASM) used for command
	 * auto-approval. Await this before any session events can arrive to
	 * guarantee that {@link _tryAutoApproveToolReady} is fully synchronous.
	 */
	initialize(): Promise<void> {
		return this._commandAutoApprover.initialize();
	}

	/**
	 * Synchronously attempts to auto-approve a `tool_ready` event based on
	 * permission kind. Returns `true` if auto-approved (event should not be
	 * dispatched to the state manager), or `false` to proceed normally.
	 */
	private _tryAutoApproveToolReady(
		e: { readonly toolCallId: string; readonly session: URI; readonly permissionKind?: IAgentToolReadyEvent['permissionKind']; readonly permissionPath?: string; readonly toolInput?: string },
		sessionKey: ProtocolURI,
		agent: IAgent,
	): boolean {
		// Session-level auto-approve: when the user has set "Bypass Approvals"
		// or "Autopilot", auto-approve all tool calls unconditionally.
		const sessionState = this._stateManager.getSessionState(sessionKey);
		const autoApproveLevel = sessionState?.config?.values?.autoApprove;
		if (autoApproveLevel === 'autoApprove' || autoApproveLevel === 'autopilot') {
			this._logService.trace(`[AgentSideEffects] Auto-approving tool call (session autoApprove=${autoApproveLevel})`);
			this._toolCallAgents.delete(`${sessionKey}:${e.toolCallId}`);
			agent.respondToPermissionRequest(e.toolCallId, true);
			return true;
		}

		// Read auto-approval: approve reads inside the session's working directory.
		if (e.permissionKind === 'read' && e.permissionPath) {
			const workDir = sessionState?.summary.workingDirectory;
			const workingDirectory = workDir ? URI.parse(workDir) : undefined;
			if (workingDirectory && extUriBiasedIgnorePathCase.isEqualOrParent(normalizePath(URI.file(e.permissionPath)), workingDirectory)) {
				this._logService.trace(`[AgentSideEffects] Auto-approving read of ${e.permissionPath}`);
				this._toolCallAgents.delete(`${sessionKey}:${e.toolCallId}`);
				agent.respondToPermissionRequest(e.toolCallId, true);
				return true;
			}
			return false;
		}

		// Write auto-approval: only within the session's working directory,
		// then apply the default glob patterns for protected files.
		if (e.permissionKind === 'write' && e.permissionPath) {
			const workDir = sessionState?.summary.workingDirectory;
			const workingDirectory = workDir ? URI.parse(workDir) : undefined;
			if (workingDirectory && extUriBiasedIgnorePathCase.isEqualOrParent(normalizePath(URI.file(e.permissionPath)), workingDirectory)) {
				if (this._shouldAutoApproveEdit(e.permissionPath)) {
					this._logService.trace(`[AgentSideEffects] Auto-approving write to ${e.permissionPath}`);
					this._toolCallAgents.delete(`${sessionKey}:${e.toolCallId}`);
					agent.respondToPermissionRequest(e.toolCallId, true);
					return true;
				}
			}
			return false;
		}

		// Shell auto-approval: parse the command via tree-sitter (synchronous
		// after initialize() has been awaited) and match against default rules.
		if (e.permissionKind === 'shell' && e.toolInput) {
			const result = this._commandAutoApprover.shouldAutoApprove(e.toolInput);
			if (result === 'approved') {
				this._logService.trace(`[AgentSideEffects] Auto-approving shell command`);
				this._toolCallAgents.delete(`${sessionKey}:${e.toolCallId}`);
				agent.respondToPermissionRequest(e.toolCallId, true);
				return true;
			}
			if (result === 'denied') {
				this._logService.trace(`[AgentSideEffects] Shell command denied by rule`);
			}
			return false;
		}

		return false;
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
			// Track tool calls so handleAction can route confirmations
			if (e.type === 'tool_start') {
				this._toolCallAgents.set(`${e.session.toString()}:${e.toolCallId}`, agent.id);
			}

			const sessionKey = e.session.toString();

			// Handle subagent_started: create the subagent session
			if (e.type === 'subagent_started') {
				this._handleSubagentStarted(sessionKey, e.toolCallId, e.agentName, e.agentDisplayName, e.agentDescription);
				return;
			}

			// Route events with parentToolCallId to the subagent session
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
							if (this._tryAutoApproveToolReady(e, subagentSession, agent)) {
								return;
							}
						}
						this._dispatchProgressActions(agentMapper, e, subagentSession, subTurnId);
					}
					return;
				}
			}

			// Route tool_ready events for tools inside subagent sessions
			// (tool_ready lacks parentToolCallId, but the tool was previously
			// registered under its subagent session key in _toolCallAgents)
			if (e.type === 'tool_ready') {
				const subagentSession = this._findSubagentSessionForToolCall(sessionKey, e.toolCallId);
				if (subagentSession) {
					const subTurnId = this._stateManager.getActiveTurnId(subagentSession);
					if (subTurnId) {
						if (this._tryAutoApproveToolReady(e, subagentSession, agent)) {
							return;
						}
						this._dispatchProgressActions(agentMapper, e, subagentSession, subTurnId);
					}
					return;
				}
			}

			const turnId = this._stateManager.getActiveTurnId(sessionKey);
			if (turnId) {
				// Auto-approve tool_ready events synchronously before dispatching.
				// Tree-sitter is pre-warmed via initialize(), so this is fully sync.
				if (e.type === 'tool_ready') {
					if (this._tryAutoApproveToolReady(e, sessionKey, agent)) {
						return;
					}
				}

				// When a parent tool call has an associated subagent session,
				// preserve the subagent content metadata in the completion
				// result. The SDK's tool_complete provides its own content
				// which would overwrite the IToolResultSubagentContent that
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
			// diff computation and compute final diffs immediately.
			if (e.type === 'idle') {
				this._cancelDebouncedDiffComputation(sessionKey);
				this._computeSessionDiffs(sessionKey, turnId);
				this._tryConsumeNextQueuedMessage(sessionKey);
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
		}));
		return disposables;
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
		state: ISessionState | undefined,
		turnId: string,
		toolCallId: string,
	): IToolResultContent[] {
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
	}

	/**
	 * Completes all active subagent sessions for a given parent session.
	 * Called when a parent tool call completes.
	 */
	completeSubagentSession(parentSession: ProtocolURI, toolCallId: string): void {
		const key = `${parentSession}:${toolCallId}`;
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

	handleAction(action: ISessionAction): void {
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
					path: a.path,
					displayName: a.displayName,
				}));
				agent.sendMessage(URI.parse(action.session), action.userMessage.text, attachments, action.turnId).catch(err => {
					this._logService.error('[AgentSideEffects] sendMessage failed', err);
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

				const refs = action.activeClient?.customizations;
				if (!refs?.length) {
					break;
				}
				// Publish initial "loading" status for all customizations
				const loading: ISessionCustomization[] = refs.map(r => ({
					customization: r,
					enabled: true,
					status: CustomizationStatus.Loading,
				}));
				this._stateManager.dispatchServerAction({
					type: ActionType.SessionCustomizationsChanged,
					session: action.session,
					customizations: loading,
				});
				agent.setClientCustomizations(
					action.activeClient!.clientId,
					refs,
					(synced) => {
						// Incremental progress: publish updated statuses
						const statuses: ISessionCustomization[] = synced.map(s => s.customization);
						this._stateManager.dispatchServerAction({
							type: ActionType.SessionCustomizationsChanged,
							session: action.session,
							customizations: statuses,
						});
					},
				).then(synced => {
					// Final status
					const statuses: ISessionCustomization[] = synced.map(s => s.customization);
					this._stateManager.dispatchServerAction({
						type: ActionType.SessionCustomizationsChanged,
						session: action.session,
						customizations: statuses,
					});
				}).catch(err => {
					this._logService.error('[AgentSideEffects] setClientCustomizations failed', err);
				});
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
			case ActionType.SessionIsDoneChanged: {
				this._persistSessionFlag(action.session, 'isDone', action.isDone ? 'true' : '');
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
			path: a.path,
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
			// Build incremental options when a specific turn triggered the recomputation
			let incremental: IIncrementalDiffOptions | undefined;
			if (changedTurnId) {
				const previousDiffs = this._stateManager.getSessionState(session)?.summary.diffs;
				if (previousDiffs) {
					incremental = { changedTurnId, previousDiffs };
				}
			}

			const diffs = await computeSessionDiffs(ref.object, this._diffComputeService, incremental);
			this._stateManager.dispatchServerAction({
				type: ActionType.SessionDiffsChanged,
				session,
				diffs,
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

	override dispose(): void {
		this._toolCallAgents.clear();
		super.dispose();
	}
}
