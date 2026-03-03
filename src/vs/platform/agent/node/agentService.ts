/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { AgentProvider, IAgentCreateSessionConfig, IAgentModelInfo, IAgentProgressEvent, IAgentMessageEvent, IAgent, IAgentService, IAgentSessionMetadata, IAgentToolStartEvent, IAgentToolCompleteEvent, AgentSession } from '../common/agentService.js';

/**
 * The agent service implementation that runs inside the agent-host utility
 * process. Dispatches to registered {@link IAgent} instances based
 * on the provider identifier in the session configuration.
 */
export class AgentService extends Disposable implements IAgentService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidSessionProgress = this._register(new Emitter<IAgentProgressEvent>());
	readonly onDidSessionProgress = this._onDidSessionProgress.event;

	/** Registered providers keyed by their {@link AgentProvider} id. */
	private readonly _providers = new Map<AgentProvider, IAgent>();
	/** Maps each active session URI (toString) to its owning provider. */
	private readonly _sessionToProvider = new Map<string, AgentProvider>();
	/** Subscriptions to provider progress events; cleared when providers change. */
	private readonly _providerSubscriptions = this._register(new DisposableStore());
	/** Default provider used when no explicit provider is specified. */
	private _defaultProvider: AgentProvider | undefined;

	constructor(
		private readonly _logService: ILogService,
	) {
		super();
		this._logService.info('AgentService initialized');
	}

	// ---- provider registration ----------------------------------------------

	registerProvider(provider: IAgent): void {
		if (this._providers.has(provider.id)) {
			throw new Error(`Agent provider already registered: ${provider.id}`);
		}
		this._logService.info(`Registering agent provider: ${provider.id}`);
		this._providers.set(provider.id, provider);
		this._providerSubscriptions.add(
			provider.onDidSessionProgress(e => this._onDidSessionProgress.fire(e))
		);
		if (!this._defaultProvider) {
			this._defaultProvider = provider.id;
		}
	}

	// ---- auth ---------------------------------------------------------------

	async setAuthToken(token: string): Promise<void> {
		const promises: Promise<void>[] = [];
		for (const provider of this._providers.values()) {
			promises.push(provider.setAuthToken(token));
		}
		await Promise.all(promises);
	}

	// ---- session management -------------------------------------------------

	async listSessions(): Promise<IAgentSessionMetadata[]> {
		const results = await Promise.all(
			[...this._providers.values()].map(p => p.listSessions())
		);
		return results.flat();
	}

	async listModels(): Promise<IAgentModelInfo[]> {
		const results = await Promise.all(
			[...this._providers.values()].map(p => p.listModels())
		);
		return results.flat();
	}

	async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		const providerId = config?.provider ?? this._defaultProvider;
		const provider = providerId ? this._providers.get(providerId) : undefined;
		if (!provider) {
			throw new Error(`No agent provider registered for: ${providerId ?? '(none)'}`);
		}
		this._logService.info(`Creating session via provider=${provider.id} ${config?.model ? `model=${config.model}` : ''}`);
		const session = await provider.createSession(config);
		this._sessionToProvider.set(session.toString(), provider.id);
		return session;
	}

	async sendMessage(session: URI, prompt: string): Promise<void> {
		const provider = this._getProviderForSession(session);
		await provider.sendMessage(session, prompt);
	}

	async getSessionMessages(session: URI): Promise<(IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent)[]> {
		const provider = this._findProviderForSession(session);
		if (!provider) {
			return [];
		}
		return provider.getSessionMessages(session);
	}

	async disposeSession(session: URI): Promise<void> {
		const provider = this._findProviderForSession(session);
		if (provider) {
			await provider.disposeSession(session);
			this._sessionToProvider.delete(session.toString());
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

	private _getProviderForSession(session: URI): IAgent {
		const provider = this._findProviderForSession(session);
		if (!provider) {
			throw new Error(`No provider found for session: ${session.toString()}`);
		}
		return provider;
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
		for (const provider of this._providers.values()) {
			provider.dispose();
		}
		this._providers.clear();
		super.dispose();
	}
}
