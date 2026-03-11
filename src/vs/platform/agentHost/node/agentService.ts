/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { AgentProvider, IAgentAttachment, IAgentCreateSessionConfig, IAgent, IAgentService, IAgentSessionMetadata, AgentSession, IAgentDescriptor } from '../common/agentService.js';
import type { IActionEnvelope, INotification, ISessionAction } from '../common/state/sessionActions.js';
import type { IStateSnapshot } from '../common/state/sessionProtocol.js';
import {
	ISessionModelInfo,
	SessionStatus, type ISessionSummary
} from '../common/state/sessionState.js';
import { mapProgressEventToAction } from './agentEventMapper.js';
import { SessionStateManager } from './sessionStateManager.js';

/**
 * The agent service implementation that runs inside the agent-host utility
 * process. Dispatches to registered {@link IAgent} instances based
 * on the provider identifier in the session configuration.
 */
export class AgentService extends Disposable implements IAgentService {
	declare readonly _serviceBrand: undefined;

	/** Protocol: fires when state is mutated by an action. */
	private readonly _onDidAction = this._register(new Emitter<IActionEnvelope>());
	readonly onDidAction = this._onDidAction.event;

	/** Protocol: fires for ephemeral notifications (sessionAdded/Removed). */
	private readonly _onDidNotification = this._register(new Emitter<INotification>());
	readonly onDidNotification = this._onDidNotification.event;

	/** Authoritative state manager for the sessions process protocol. */
	private readonly _stateManager: SessionStateManager;

	/** Registered providers keyed by their {@link AgentProvider} id. */
	private readonly _providers = new Map<AgentProvider, IAgent>();
	/** Maps each active session URI (toString) to its owning provider. */
	private readonly _sessionToProvider = new Map<string, AgentProvider>();
	/** Subscriptions to provider progress events; cleared when providers change. */
	private readonly _providerSubscriptions = this._register(new DisposableStore());
	/** Default provider used when no explicit provider is specified. */
	private _defaultProvider: AgentProvider | undefined;
	/** Maps pending permission request IDs to the provider that issued them. */
	private readonly _pendingPermissions = new Map<string, AgentProvider>();

	constructor(
		private readonly _logService: ILogService,
	) {
		super();
		this._logService.info('AgentService initialized');
		this._stateManager = this._register(new SessionStateManager(_logService));
		this._register(this._stateManager.onDidEmitEnvelope(e => this._onDidAction.fire(e)));
		this._register(this._stateManager.onDidEmitNotification(e => this._onDidNotification.fire(e)));
	}

	// ---- provider registration ----------------------------------------------

	registerProvider(provider: IAgent): void {
		if (this._providers.has(provider.id)) {
			throw new Error(`Agent provider already registered: ${provider.id}`);
		}
		this._logService.info(`Registering agent provider: ${provider.id}`);
		this._providers.set(provider.id, provider);
		this._providerSubscriptions.add(
			provider.onDidSessionProgress(e => {
				// Track permission requests so dispatchAction can route
				if (e.type === 'permission_request') {
					this._pendingPermissions.set(e.requestId, provider.id);
				}

				// Map to protocol action and dispatch through state manager
				const turnId = this._stateManager.getActiveTurnId(e.session);
				if (turnId) {
					const action = mapProgressEventToAction(e, e.session, turnId);
					if (action) {
						this._stateManager.dispatchServerAction(action);
					}
				}
			})
		);
		if (!this._defaultProvider) {
			this._defaultProvider = provider.id;
		}

		// Update root state with current agents list
		this._publishAgentsToRootState();
	}

	// ---- auth ---------------------------------------------------------------

	async listAgents(): Promise<IAgentDescriptor[]> {
		return [...this._providers.values()].map(p => p.getDescriptor());
	}

	async setAuthToken(token: string): Promise<void> {
		this._logService.trace('[AgentService] setAuthToken called');
		const promises: Promise<void>[] = [];
		for (const provider of this._providers.values()) {
			promises.push(provider.setAuthToken(token));
		}
		await Promise.all(promises);
	}

	// ---- session management -------------------------------------------------

	async listSessions(): Promise<IAgentSessionMetadata[]> {
		this._logService.trace('[AgentService] listSessions called');
		const results = await Promise.all(
			[...this._providers.values()].map(p => p.listSessions())
		);
		const flat = results.flat();
		this._logService.trace(`[AgentService] listSessions returned ${flat.length} sessions`);
		return flat;
	}

	/**
	 * Refreshes the model list from all providers and publishes the updated
	 * agents (with their models) to root state via `root/agentsChanged`.
	 */
	async refreshModels(): Promise<void> {
		this._logService.trace('[AgentService] refreshModels called');
		await this._publishAgentsToRootState();
	}

	async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		const providerId = config?.provider ?? this._defaultProvider;
		const provider = providerId ? this._providers.get(providerId) : undefined;
		if (!provider) {
			throw new Error(`No agent provider registered for: ${providerId ?? '(none)'}`);
		}
		this._logService.trace(`[AgentService] createSession: provider=${provider.id} model=${config?.model ?? '(default)'}`);
		const session = await provider.createSession(config);
		this._sessionToProvider.set(session.toString(), provider.id);
		this._logService.trace(`[AgentService] createSession returned: ${session.toString()}`);

		// Create state in the state manager
		const summary: ISessionSummary = {
			resource: session,
			provider: provider.id,
			title: 'New Session',
			status: SessionStatus.Idle,
			createdAt: Date.now(),
			modifiedAt: Date.now(),
		};
		this._stateManager.createSession(summary);
		this._stateManager.dispatchServerAction({ type: 'session/ready', session });

		return session;
	}

	async disposeSession(session: URI): Promise<void> {
		this._logService.trace(`[AgentService] disposeSession: ${session.toString()}`);
		const provider = this._findProviderForSession(session);
		if (provider) {
			await provider.disposeSession(session);
			this._sessionToProvider.delete(session.toString());
		}
		this._stateManager.removeSession(session);
	}

	// ---- Protocol methods ---------------------------------------------------

	async subscribe(resource: URI): Promise<IStateSnapshot> {
		this._logService.trace(`[AgentService] subscribe: ${resource.toString()}`);
		const snapshot = this._stateManager.getSnapshot(resource);
		if (!snapshot) {
			throw new Error(`Cannot subscribe to unknown resource: ${resource.toString()}`);
		}
		return snapshot;
	}

	unsubscribe(resource: URI): void {
		this._logService.trace(`[AgentService] unsubscribe: ${resource.toString()}`);
		// Server-side tracking of per-client subscriptions will be added
		// in Phase 4 (multi-client). For now this is a no-op.
	}

	dispatchAction(action: ISessionAction, clientId: string, clientSeq: number): void {
		this._logService.trace(`[AgentService] dispatchAction: type=${action.type}, clientId=${clientId}, clientSeq=${clientSeq}`, action);

		const origin = { clientId, clientSeq };
		const state = this._stateManager.dispatchClientAction(action, origin);
		this._logService.trace(`[AgentService] resulting state:`, state);

		// Trigger side effects based on the action type
		switch (action.type) {
			case 'session/turnStarted': {
				const provider = this._findProviderForSession(action.session);
				if (provider) {
					const attachments = action.userMessage.attachments?.map(a => ({
						type: a.type,
						path: a.path,
						displayName: a.displayName,
					}) satisfies IAgentAttachment);
					provider.sendMessage(action.session, action.userMessage.text, attachments).catch(err => {
						this._logService.error(`[AgentService] sendMessage failed for session/turnStarted`, err);
						this._stateManager.dispatchServerAction({
							type: 'session/error',
							session: action.session,
							turnId: action.turnId,
							error: { errorType: 'sendFailed', message: String(err) },
						});
					});
				}
				break;
			}
			case 'session/permissionResolved': {
				const providerId = this._pendingPermissions.get(action.requestId);
				if (providerId) {
					this._pendingPermissions.delete(action.requestId);
					const permProvider = this._providers.get(providerId);
					permProvider?.respondToPermissionRequest(action.requestId, action.approved);
				} else {
					this._logService.warn(`[AgentService] No pending permission request for: ${action.requestId}`);
				}
				break;
			}
			case 'session/turnCancelled': {
				const provider = this._findProviderForSession(action.session);
				if (provider) {
					provider.abortSession(action.session).catch(err => {
						this._logService.error(`[AgentService] abortSession failed for session/turnCancelled`, err);
					});
				}
				break;
			}
		}
	}

	async shutdown(): Promise<void> {
		this._logService.info('AgentService: shutting down all providers...');
		const promises: Promise<void>[] = [];
		for (const provider of this._providers.values()) {
			promises.push(provider.shutdown());
		}
		await Promise.all(promises);
		this._sessionToProvider.clear();
	}

	// ---- helpers ------------------------------------------------------------

	/**
	 * Fetches models from all providers and dispatches `root/agentsChanged`
	 * with the merged agent + model data.
	 */
	private async _publishAgentsToRootState(): Promise<void> {
		const agents = await Promise.all([...this._providers.values()].map(async p => {
			const d = p.getDescriptor();
			let models: ISessionModelInfo[];
			try {
				const rawModels = await p.listModels();
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
		this._stateManager.dispatchServerAction({ type: 'root/agentsChanged', agents });
	}

	private _findProviderForSession(session: URI): IAgent | undefined {
		const providerId = this._sessionToProvider.get(session.toString());
		if (providerId) {
			return this._providers.get(providerId);
		}
		// Try to infer from URI scheme
		const schemeProvider = AgentSession.provider(session);
		if (schemeProvider) {
			return this._providers.get(schemeProvider);
		}
		// Fallback: try the default provider (handles resumed sessions not yet tracked)
		if (this._defaultProvider) {
			return this._providers.get(this._defaultProvider);
		}
		return undefined;
	}

	override dispose(): void {
		this._pendingPermissions.clear();
		for (const provider of this._providers.values()) {
			provider.dispose();
		}
		this._providers.clear();
		super.dispose();
	}
}
