/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { match as globMatch } from '../../../base/common/glob.js';
import { Disposable, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import { IAgent, IAgentAttachment } from '../common/agentService.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { ActionType, ISessionAction } from '../common/state/sessionActions.js';
import {
	PendingMessageKind,
	type ISessionModelInfo,
	type URI as ProtocolURI,
} from '../common/state/sessionState.js';
import { AgentEventMapper } from './agentEventMapper.js';
import { SessionStateManager } from './sessionStateManager.js';

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

	constructor(
		private readonly _stateManager: SessionStateManager,
		private readonly _options: IAgentSideEffectsOptions,
		private readonly _logService: ILogService,
	) {
		super();

		// Whenever the agents observable changes, publish to root state.
		this._register(autorun(reader => {
			const agents = this._options.agents.read(reader);
			this._publishAgentInfos(agents);
		}));
	}

	/**
	 * Fetches models from all agents and dispatches `root/agentsChanged`.
	 */
	private async _publishAgentInfos(agents: readonly IAgent[]): Promise<void> {
		const infos = await Promise.all(agents.map(async a => {
			const d = a.getDescriptor();
			let models: ISessionModelInfo[];
			try {
				const rawModels = await a.listModels();
				models = rawModels.map(m => ({
					id: m.id, provider: m.provider, name: m.name,
					maxContextWindow: m.maxContextWindow, supportsVision: m.supportsVision,
					policyState: m.policyState,
				}));
			} catch {
				models = [];
			}
			return { provider: d.provider, displayName: d.displayName, description: d.description, models };
		}));
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
			const turnId = this._stateManager.getActiveTurnId(sessionKey);
			if (turnId) {
				// Check if this is a write permission request that can be auto-approved
				// based on the built-in default patterns.
				if (e.type === 'tool_ready' && e.permissionKind === 'write' && e.permissionPath) {
					if (this._shouldAutoApproveEdit(e.permissionPath)) {
						this._logService.trace(`[AgentSideEffects] Auto-approving write to ${e.permissionPath}`);
						agent.respondToPermissionRequest(e.toolCallId, true);
						return;
					}
				}

				const actions = agentMapper.mapProgressEventToActions(e, sessionKey, turnId);
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

			// After a turn completes (idle event), try to consume the next queued message
			if (e.type === 'idle') {
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

	// ---- Side-effect handlers --------------------------------------------------

	handleAction(action: ISessionAction): void {
		switch (action.type) {
			case ActionType.SessionTurnStarted: {
				// Reset the event mapper's part tracking for the new turn
				for (const mapper of this._eventMappers.values()) {
					mapper.reset(action.session);
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
				agent.sendMessage(URI.parse(action.session), action.userMessage.text, attachments).catch(err => {
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
			case ActionType.SessionTurnCancelled: {
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
		agent.sendMessage(URI.parse(session), msg.userMessage.text, attachments).catch(err => {
			this._logService.error('[AgentSideEffects] sendMessage failed (queued)', err);
			this._stateManager.dispatchServerAction({
				type: ActionType.SessionError,
				session,
				turnId,
				error: { errorType: 'sendFailed', message: String(err) },
			});
		});
	}

	override dispose(): void {
		this._toolCallAgents.clear();
		super.dispose();
	}
}
