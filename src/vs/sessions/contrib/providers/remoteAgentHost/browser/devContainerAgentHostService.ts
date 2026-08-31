/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { raceCancellationError, raceTimeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { getComparisonKey } from '../../../../../base/common/resources.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { AGENT_HOST_SCHEME, agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IDevContainerAgentHostConnector, IDevContainerAgentHostService, IDevContainerAgentHostTarget } from '../../../../common/devContainerAgentHostService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { RemoteAgentHostSessionsProvider } from './remoteAgentHostSessionsProvider.js';

interface IActiveDevContainerAgentHost {
	readonly address: string;
	readonly provider: RemoteAgentHostSessionsProvider;
	readonly target: Omit<IDevContainerAgentHostTarget, 'release'>;
	references: number;
}

interface IPendingDevContainerAgentHost {
	readonly promise: Promise<IActiveDevContainerAgentHost>;
	readonly tokenSource: CancellationTokenSource;
}

/** Registers Dev Container Agent Hosts as dynamic remote Sessions providers. */
export class DevContainerAgentHostService extends Disposable implements IDevContainerAgentHostService {
	declare readonly _serviceBrand: undefined;

	private readonly _providerStores = this._register(new DisposableMap<string>());
	private readonly _activeConnections = new Map<string, IActiveDevContainerAgentHost>();
	private readonly _pendingConnections = new Map<string, IPendingDevContainerAgentHost>();
	private _connector: IDevContainerAgentHostConnector | undefined;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
	) {
		super();
		this._register(this._remoteAgentHostService.onDidChangeConnections(() => this._reconcileConnections()));
	}

	registerConnector(connector: IDevContainerAgentHostConnector): IDisposable {
		if (this._connector) {
			throw new Error(localize('devContainerAgentHost.connectorAlreadyRegistered', "A Dev Container Agent Host connector is already registered."));
		}
		this._connector = connector;
		return toDisposable(() => {
			if (this._connector === connector) {
				this._connector = undefined;
			}
		});
	}

	isAvailable(workspaceUri: URI): Promise<boolean> {
		return this._connector?.isAvailable(workspaceUri) ?? Promise.resolve(false);
	}

	connect(workspaceUri: URI, token: CancellationToken): Promise<IDevContainerAgentHostTarget> {
		const key = getComparisonKey(workspaceUri);
		const active = this._activeConnections.get(key);
		if (active && this._isConnectedOrReconnecting(active.address)) {
			return Promise.resolve(this._acquireConnection(key, active));
		}
		const pending = this._pendingConnections.get(key);
		if (pending) {
			return raceCancellationError(pending.promise, token).then(active => this._acquireConnection(key, active));
		}
		if (!this._connector) {
			return Promise.reject(new Error(localize('devContainerAgentHost.connectorUnavailable', "No Dev Container Agent Host connector is registered.")));
		}

		const tokenSource = new CancellationTokenSource(token);
		const promise = this._replaceConnectionAndConnect(this._connector, workspaceUri, key, active, tokenSource.token);
		const pendingConnection = { promise, tokenSource };
		this._pendingConnections.set(key, pendingConnection);
		void promise.then(
			() => this._completePendingConnection(key, pendingConnection),
			() => this._completePendingConnection(key, pendingConnection),
		);
		return promise.then(active => this._acquireConnection(key, active));
	}

	private _completePendingConnection(key: string, pending: IPendingDevContainerAgentHost): void {
		if (this._pendingConnections.get(key) === pending) {
			this._pendingConnections.delete(key);
		}
		pending.tokenSource.dispose();
	}

	private async _replaceConnectionAndConnect(
		connector: IDevContainerAgentHostConnector,
		workspaceUri: URI,
		key: string,
		active: IActiveDevContainerAgentHost | undefined,
		token: CancellationToken,
	): Promise<IActiveDevContainerAgentHost> {
		if (active) {
			await this._removeActiveConnection(key, active);
		}
		return this._connect(connector, workspaceUri, key, token);
	}

	private async _connect(connector: IDevContainerAgentHostConnector, workspaceUri: URI, key: string, token: CancellationToken): Promise<IActiveDevContainerAgentHost> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const connected = await connector.connect(workspaceUri, token);
		if (token.isCancellationRequested) {
			connected.transportDisposable?.dispose();
			connected.connection.dispose();
			throw new CancellationError();
		}

		const authority = agentHostAuthority(connected.address);
		if (connected.workspaceUri.scheme !== AGENT_HOST_SCHEME || connected.workspaceUri.authority !== authority) {
			connected.transportDisposable?.dispose();
			connected.connection.dispose();
			throw new Error(localize('devContainerAgentHost.invalidWorkspaceUri', "Dev Container workspace URI must use the '{0}' scheme and '{1}' authority.", AGENT_HOST_SCHEME, authority));
		}

		const providerStore = new DisposableStore();
		let connectionOwnedByRemoteService = false;
		try {
			const provider = providerStore.add(this._createProvider({
				address: connected.address,
				name: connected.name,
				omitHostFromWorkspaceLabel: true,
			}));
			providerStore.add(this._sessionsProvidersService.registerProvider(provider));

			const entry: IRemoteAgentHostEntry = {
				name: connected.name,
				connection: {
					type: RemoteAgentHostEntryType.DevContainer,
					address: connected.address,
					hostPath: workspaceUri.fsPath,
				},
			};
			const connectionInfo = await this._remoteAgentHostService.addManagedConnection(entry, connected.connection, connected.transportDisposable);
			connectionOwnedByRemoteService = true;
			provider.setConnection(connected.connection, connected.defaultDirectory ?? connectionInfo.defaultDirectory);
			provider.setConnectionStatus(connectionInfo.status);
			await this._waitForSessionTypes(provider, token);

			const target = { providerId: provider.id, workspaceUri: connected.workspaceUri };
			const active = { address: connectionInfo.address, provider, target, references: 0 };
			providerStore.add(toDisposable(() => this._activeConnections.delete(key)));
			this._providerStores.set(key, providerStore);
			this._activeConnections.set(key, active);
			return active;
		} catch (error) {
			providerStore.dispose();
			if (connectionOwnedByRemoteService) {
				await this._remoteAgentHostService.removeRemoteAgentHost(connected.address);
			} else {
				connected.transportDisposable?.dispose();
				connected.connection.dispose();
			}
			throw error;
		}
	}

	private _acquireConnection(key: string, active: IActiveDevContainerAgentHost): IDevContainerAgentHostTarget {
		active.references++;
		let released = false;
		return {
			...active.target,
			release: async () => {
				if (released) {
					return;
				}
				released = true;
				active.references--;
				if (active.references === 0 && this._activeConnections.get(key) === active) {
					await this._removeActiveConnection(key, active);
				}
			},
		};
	}

	protected _createProvider(config: ConstructorParameters<typeof RemoteAgentHostSessionsProvider>[0]): RemoteAgentHostSessionsProvider {
		return this._instantiationService.createInstance(RemoteAgentHostSessionsProvider, config);
	}

	protected async _waitForSessionTypes(provider: RemoteAgentHostSessionsProvider, token: CancellationToken): Promise<void> {
		const deadline = Date.now() + 30_000;
		while (provider.sessionTypes.length === 0) {
			const remaining = deadline - Date.now();
			if (remaining <= 0) {
				throw new Error(localize('devContainerAgentHost.agentDiscoveryTimeout', "Timed out waiting for the Dev Container Agent Host to advertise agents."));
			}
			let timedOut = false;
			await raceCancellationError(
				raceTimeout(Event.toPromise(provider.onDidChangeSessionTypes), remaining, () => timedOut = true),
				token,
			);
			if (timedOut) {
				throw new Error(localize('devContainerAgentHost.agentDiscoveryTimeout', "Timed out waiting for the Dev Container Agent Host to advertise agents."));
			}
		}
	}

	async disconnect(workspaceUri: URI): Promise<void> {
		const key = getComparisonKey(workspaceUri);
		const pending = this._pendingConnections.get(key);
		if (pending) {
			pending.tokenSource.cancel();
			await pending.promise.then(
				() => undefined,
				() => undefined,
			);
		}
		const active = this._activeConnections.get(key);
		if (!active) {
			return;
		}
		await this._removeActiveConnection(key, active);
	}

	private async _removeActiveConnection(key: string, active: IActiveDevContainerAgentHost): Promise<void> {
		await this._remoteAgentHostService.removeRemoteAgentHost(active.address);
		this._providerStores.deleteAndDispose(key);
	}

	private _isConnectedOrReconnecting(address: string): boolean {
		return this._remoteAgentHostService.connections.some(connection =>
			connection.address === address
			&& (RemoteAgentHostConnectionStatus.isConnected(connection.status) || RemoteAgentHostConnectionStatus.isReconnecting(connection.status))
		);
	}

	private _reconcileConnections(): void {
		for (const [key, active] of this._activeConnections) {
			const connectionInfo = this._remoteAgentHostService.connections.find(connection => connection.address === active.address);
			if (!connectionInfo) {
				this._providerStores.deleteAndDispose(key);
				continue;
			}
			active.provider.setConnectionStatus(connectionInfo.status);
			if (RemoteAgentHostConnectionStatus.isConnected(connectionInfo.status)) {
				const connection = this._remoteAgentHostService.getConnection(active.address);
				if (connection) {
					active.provider.setConnection(connection, connectionInfo.defaultDirectory);
				}
			}
		}
	}

	override dispose(): void {
		for (const pending of this._pendingConnections.values()) {
			pending.tokenSource.cancel();
			pending.tokenSource.dispose();
		}
		this._pendingConnections.clear();
		super.dispose();
	}
}

registerSingleton(IDevContainerAgentHostService, DevContainerAgentHostService, InstantiationType.Delayed);
