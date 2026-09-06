/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promises } from '../../../base/common/async.js';
import { Emitter, type Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, type IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { observableValue, type IObservable, type ISettableObservable } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { type AgentProvider, AgentSession, type AuthenticateParams, type AuthenticateResult, type IAgent, type IAgentHostNetworkEndpoint, type IMcpNotification } from '../common/agent.js';
import type { IAgentHostManagedSettingsDiagnostics } from '../common/agentService.js';
import { IAgentHostAuthenticationController } from './agentHostAuthenticationService.js';
import { parseMcpChannelUri } from './shared/mcpCustomizationController.js';

export const IAgentHostProviderService = createDecorator<IAgentHostProviderService>('agentHostProviderService');

export interface IAgentHostProviderNetworkDiagnostics {
	readonly endpoints: readonly IAgentHostNetworkEndpoint[];
	readonly account: string | undefined;
}

export interface IAgentHostProviderService {
	readonly _serviceBrand: undefined;
	readonly agents: IObservable<readonly IAgent[]>;
	readonly onDidRegisterProvider: Event<IAgent>;
	readonly onMcpNotification: Event<IMcpNotification>;

	registerProviderInitializer(initializer: (provider: IAgent) => IDisposable): IDisposable;
	registerProvider(provider: IAgent): void;
	resolveProvider(provider?: AgentProvider): IAgent | undefined;
	getProvider(provider: AgentProvider): IAgent | undefined;
	getProviderForSession(session: URI | string): IAgent | undefined;
	getProviders(): readonly IAgent[];
	associateSession(session: URI | string, provider: AgentProvider): void;
	releaseSession(session: URI | string, expectedProvider?: AgentProvider): void;
	authenticate(params: AuthenticateParams): Promise<AuthenticateResult>;
	handleMcpRequest(channel: string, method: string, params: Record<string, unknown> | undefined): Promise<unknown>;
	getNetworkDiagnostics(): Promise<IAgentHostProviderNetworkDiagnostics>;
	getManagedSettingsDiagnostics(): Promise<readonly IAgentHostManagedSettingsDiagnostics[]>;
	shutdown(): Promise<void>;
}

export class AgentHostProviderService extends Disposable implements IAgentHostProviderService {
	declare readonly _serviceBrand: undefined;

	private readonly _providerRegistrations = this._register(new DisposableMap<AgentProvider, DisposableStore>());
	private readonly _providers = this._register(new DisposableMap<AgentProvider, IAgent>());
	private readonly _sessionToProvider = new Map<string, AgentProvider>();
	private readonly _agents: ISettableObservable<readonly IAgent[]> = observableValue(this, []);
	readonly agents: IObservable<readonly IAgent[]> = this._agents;
	private readonly _onDidRegisterProvider = this._register(new Emitter<IAgent>());
	readonly onDidRegisterProvider = this._onDidRegisterProvider.event;
	private readonly _onMcpNotification = this._register(new Emitter<IMcpNotification>());
	readonly onMcpNotification = this._onMcpNotification.event;
	private readonly _providerInitializers = new Set<(provider: IAgent) => IDisposable>();
	private readonly _authenticationReplays = new Map<AgentProvider, Promise<void>>();
	private _defaultProvider: AgentProvider | undefined;
	private _shutdownPromise: Promise<void> | undefined;

	constructor(
		@IAgentHostAuthenticationController private readonly _authenticationController: IAgentHostAuthenticationController,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(toDisposable(() => this._providerInitializers.clear()));
	}

	registerProviderInitializer(initializer: (provider: IAgent) => IDisposable): IDisposable {
		if (this._providers.size > 0) {
			throw new Error('Provider initializers must be registered before providers');
		}
		this._providerInitializers.add(initializer);
		return toDisposable(() => this._providerInitializers.delete(initializer));
	}

	registerProvider(provider: IAgent): void {
		if (this._shutdownPromise) {
			throw new Error('Cannot register an agent provider after shutdown has started');
		}
		if (this._providers.has(provider.id)) {
			throw new Error(`Agent provider already registered: ${provider.id}`);
		}

		this._logService.info(`Registering agent provider: ${provider.id}`);
		const registrations = new DisposableStore();
		const previousDefaultProvider = this._defaultProvider;
		try {
			if (provider.onMcpNotification) {
				registrations.add(provider.onMcpNotification(event => this._onMcpNotification.fire(event)));
			}
			this._providers.set(provider.id, provider);
			this._providerRegistrations.set(provider.id, registrations);
			for (const initializer of this._providerInitializers) {
				registrations.add(initializer(provider));
			}
			if (!this._defaultProvider) {
				this._defaultProvider = provider.id;
			}
			this._agents.set([...this._providers.values()], undefined);
		} catch (error) {
			this._providerRegistrations.deleteAndDispose(provider.id);
			this._providers.deleteAndDispose(provider.id);
			this._defaultProvider = previousDefaultProvider;
			throw error;
		}
		this._onDidRegisterProvider.fire(provider);
		const replay = this._authenticationController.replay(provider)
			.catch(error => this._logService.error(error, `[AgentHostProviderService] Failed to replay authentication for provider '${provider.id}'`));
		this._authenticationReplays.set(provider.id, replay);
		void replay.then(() => {
			if (this._authenticationReplays.get(provider.id) === replay) {
				this._authenticationReplays.delete(provider.id);
			}
		});
	}

	resolveProvider(provider?: AgentProvider): IAgent | undefined {
		return provider ? this._providers.get(provider) : this._defaultProvider ? this._providers.get(this._defaultProvider) : undefined;
	}

	getProvider(provider: AgentProvider): IAgent | undefined {
		return this._providers.get(provider);
	}

	getProviderForSession(session: URI | string): IAgent | undefined {
		const key = typeof session === 'string' ? session : session.toString();
		const associatedProvider = this._sessionToProvider.get(key);
		if (associatedProvider) {
			return this._providers.get(associatedProvider);
		}
		const schemeProvider = AgentSession.provider(session);
		if (schemeProvider) {
			return this._providers.get(schemeProvider);
		}
		return this._defaultProvider ? this._providers.get(this._defaultProvider) : undefined;
	}

	getProviders(): readonly IAgent[] {
		return [...this._providers.values()];
	}

	associateSession(session: URI | string, provider: AgentProvider): void {
		this._sessionToProvider.set(typeof session === 'string' ? session : session.toString(), provider);
	}

	releaseSession(session: URI | string, expectedProvider?: AgentProvider): void {
		const key = typeof session === 'string' ? session : session.toString();
		if (expectedProvider !== undefined && this._sessionToProvider.get(key) !== expectedProvider) {
			return;
		}
		this._sessionToProvider.delete(key);
	}

	authenticate(params: AuthenticateParams): Promise<AuthenticateResult> {
		return this._authenticationController.authenticate(params, this._providers.values());
	}

	async handleMcpRequest(channel: string, method: string, params: Record<string, unknown> | undefined): Promise<unknown> {
		const route = parseMcpChannelUri(channel);
		if (!route) {
			throw new Error(`Method not found: invalid mcp:// channel ${channel}`);
		}
		const provider = this._providers.get(route.providerId);
		if (!provider?.handleMcpRequest) {
			throw new Error(`Method not found: no provider for mcp:// channel ${channel}`);
		}
		return provider.handleMcpRequest(route.chatUri, route.serverName, method, params);
	}

	async getNetworkDiagnostics(): Promise<IAgentHostProviderNetworkDiagnostics> {
		const providers = this.getProviders();
		const [contributions, accounts] = await Promise.all([
			Promise.all(providers.map(async provider => {
				try {
					return await provider.getNetworkDiagnosticsEndpoints?.() ?? [];
				} catch (error) {
					this._logService.warn(`[AgentHostProviderService] Failed to resolve network diagnostics endpoints for ${provider.id}: ${error instanceof Error ? error.message : String(error)}`);
					return [];
				}
			})),
			Promise.all(providers.map(async provider => {
				try {
					return await provider.getNetworkDiagnosticsAccount?.();
				} catch (error) {
					this._logService.warn(`[AgentHostProviderService] Failed to resolve network diagnostics account for ${provider.id}: ${error instanceof Error ? error.message : String(error)}`);
					return undefined;
				}
			})),
		]);
		const endpoints: IAgentHostNetworkEndpoint[] = [];
		const seen = new Set<string>();
		for (const endpoint of contributions.flat()) {
			let key: string;
			try {
				key = new URL(endpoint.url).toString();
			} catch {
				key = endpoint.url;
			}
			if (!seen.has(key)) {
				seen.add(key);
				endpoints.push(endpoint);
			}
		}
		return { endpoints, account: accounts.find(account => !!account) };
	}

	async getManagedSettingsDiagnostics(): Promise<readonly IAgentHostManagedSettingsDiagnostics[]> {
		const providers = this.getProviders().filter(provider => provider.getManagedSettingsDiagnostics);
		return Promise.all(providers.map(async provider => {
			try {
				return { provider: provider.id, snapshot: await provider.getManagedSettingsDiagnostics!() };
			} catch (error) {
				return { provider: provider.id, error: error instanceof Error ? error.message : String(error) };
			}
		}));
	}

	shutdown(): Promise<void> {
		return this._shutdownPromise ??= this._shutdown();
	}

	private async _shutdown(): Promise<void> {
		try {
			await Promises.settled([...this._authenticationReplays.values()]);
			await Promises.settled([...this._providers.values()].map(provider => provider.shutdown()));
		} finally {
			this._sessionToProvider.clear();
		}
	}
}
