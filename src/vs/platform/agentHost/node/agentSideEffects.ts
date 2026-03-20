/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import { Disposable, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IAgent, IAgentAttachment, IAuthenticateParams, IAuthenticateResult, IResourceMetadata } from '../common/agentService.js';
import { ActionType, ISessionAction } from '../common/state/sessionActions.js';
import { AHP_PROVIDER_NOT_FOUND, IBrowseDirectoryResult, ICreateSessionParams, IDirectoryEntry, JSON_RPC_INTERNAL_ERROR, ProtocolError } from '../common/state/sessionProtocol.js';
import {
	SessionStatus,
	type ISessionModelInfo,
	type ISessionSummary, type URI as ProtocolURI,
} from '../common/state/sessionState.js';
import { mapProgressEventToActions } from './agentEventMapper.js';
import type { IProtocolSideEffectHandler } from './protocolServerHandler.js';
import { SessionStateManager } from './sessionStateManager.js';

/**
 * Options for constructing an {@link AgentSideEffects} instance.
 */
export interface IAgentSideEffectsOptions {
	/** Resolve the agent responsible for a given session URI. */
	readonly getAgent: (session: ProtocolURI) => IAgent | undefined;
	/** Observable set of registered agents. Triggers `root/agentsChanged` when it changes. */
	readonly agents: IObservable<readonly IAgent[]>;
}

/**
 * Shared implementation of agent side-effect handling.
 *
 * Routes client-dispatched actions to the correct agent backend, handles
 * session create/dispose/list operations, tracks pending permission requests,
 * and wires up agent progress events to the state manager.
 *
 * Used by both the Electron utility-process path ({@link AgentService}) and
 * the standalone WebSocket server (`agentHostServerMain`).
 */
export class AgentSideEffects extends Disposable implements IProtocolSideEffectHandler {

	/** Maps pending permission request IDs to the provider that issued them. */
	private readonly _pendingPermissions = new Map<string, string>();

	constructor(
		private readonly _stateManager: SessionStateManager,
		private readonly _options: IAgentSideEffectsOptions,
		private readonly _logService: ILogService,
		private readonly _fileService: IFileService,
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

	// ---- Agent registration -------------------------------------------------

	/**
	 * Registers a progress-event listener on the given agent so that
	 * `IAgentProgressEvent`s are mapped to protocol actions and dispatched
	 * through the state manager. Returns a disposable that removes the
	 * listener.
	 */
	registerProgressListener(agent: IAgent): IDisposable {
		const disposables = new DisposableStore();
		disposables.add(agent.onDidSessionProgress(e => {
			// Track permission requests so handleAction can route responses
			if (e.type === 'permission_request') {
				this._pendingPermissions.set(e.requestId, agent.id);
			}

			const turnId = this._stateManager.getActiveTurnId(e.session.toString());
			if (turnId) {
				const actions = mapProgressEventToActions(e, e.session.toString(), turnId);
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
		}));
		return disposables;
	}

	// ---- IProtocolSideEffectHandler -----------------------------------------

	handleAction(action: ISessionAction): void {
		switch (action.type) {
			case ActionType.SessionTurnStarted: {
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
			case ActionType.SessionPermissionResolved: {
				const providerId = this._pendingPermissions.get(action.requestId);
				if (providerId) {
					this._pendingPermissions.delete(action.requestId);
					const agent = this._options.agents.get().find(a => a.id === providerId);
					agent?.respondToPermissionRequest(action.requestId, action.approved);
				} else {
					this._logService.warn(`[AgentSideEffects] No pending permission request for: ${action.requestId}`);
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
		}
	}

	async handleCreateSession(command: ICreateSessionParams): Promise<void> {
		const provider = command.provider;
		if (!provider) {
			throw new ProtocolError(AHP_PROVIDER_NOT_FOUND, 'No provider specified for session creation');
		}
		const agent = this._options.agents.get().find(a => a.id === provider);
		if (!agent) {
			throw new ProtocolError(AHP_PROVIDER_NOT_FOUND, `No agent registered for provider: ${provider}`);
		}
		// Use the client-provided session URI per the protocol spec
		const session = command.session;
		await agent.createSession({
			provider,
			model: command.model,
			workingDirectory: command.workingDirectory,
			session: URI.parse(session),
		});
		const summary: ISessionSummary = {
			resource: session,
			provider,
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: Date.now(),
			modifiedAt: Date.now(),
		};
		this._stateManager.createSession(summary);
		this._stateManager.dispatchServerAction({ type: ActionType.SessionReady, session });
	}

	handleDisposeSession(session: ProtocolURI): void {
		const agent = this._options.getAgent(session);
		agent?.disposeSession(URI.parse(session)).catch(() => { });
		this._stateManager.removeSession(session);
	}

	async handleListSessions(): Promise<ISessionSummary[]> {
		const allSessions: ISessionSummary[] = [];
		for (const agent of this._options.agents.get()) {
			const sessions = await agent.listSessions();
			const provider = agent.id;
			for (const s of sessions) {
				allSessions.push({
					resource: s.session.toString(),
					provider,
					title: s.summary ?? 'Session',
					status: SessionStatus.Idle,
					createdAt: s.startTime,
					modifiedAt: s.modifiedTime,
				});
			}
		}
		return allSessions;
	}

	handleGetResourceMetadata(): IResourceMetadata {
		const resources = this._options.agents.get().flatMap(a => a.getProtectedResources());
		return { resources };
	}

	async handleAuthenticate(params: IAuthenticateParams): Promise<IAuthenticateResult> {
		for (const agent of this._options.agents.get()) {
			const resources = agent.getProtectedResources();
			if (resources.some(r => r.resource === params.resource)) {
				const accepted = await agent.authenticate(params.resource, params.token);
				if (accepted) {
					return { authenticated: true };
				}
			}
		}
		return { authenticated: false };
	}

	async handleBrowseDirectory(uri: ProtocolURI): Promise<IBrowseDirectoryResult> {
		let stat;
		try {
			stat = await this._fileService.resolve(URI.parse(uri));
		} catch {
			throw new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Directory not found: ${uri.toString()}`);
		}

		if (!stat.isDirectory) {
			throw new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Not a directory: ${uri.toString()}`);
		}

		const entries: IDirectoryEntry[] = (stat.children ?? []).map(child => ({
			name: child.name,
			type: child.isDirectory ? 'directory' : 'file',
		}));
		return { entries };
	}

	getDefaultDirectory(): ProtocolURI {
		return URI.file(os.homedir()).toString();
	}

	override dispose(): void {
		this._pendingPermissions.clear();
		super.dispose();
	}
}
