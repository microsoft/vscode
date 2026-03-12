/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Service implementation that manages WebSocket connections to remote agent
// host processes. Reads addresses from the `chat.remoteAgentHosts` setting
// and maintains connections, reconnecting as the setting changes.

import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';

import type { IAgentCreateSessionConfig, IAgentSessionMetadata } from '../common/agentService.js';
import type { ISessionAction } from '../common/state/sessionActions.js';
import type { IStateSnapshot } from '../common/state/sessionProtocol.js';
import {
	IRemoteAgentHostService,
	RemoteAgentHostsSettingId,
	type IRemoteActionEnvelope,
	type IRemoteAgentHostConnection,
	type IRemoteAgentHostEntry,
	type IRemoteNotification,
} from '../common/remoteAgentHostService.js';
import { RemoteAgentHostProtocolClient } from './remoteAgentHostProtocolClient.js';

export class RemoteAgentHostService extends Disposable implements IRemoteAgentHostService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidAction = this._register(new Emitter<IRemoteActionEnvelope>());
	readonly onDidAction = this._onDidAction.event;

	private readonly _onDidNotification = this._register(new Emitter<IRemoteNotification>());
	readonly onDidNotification = this._onDidNotification.event;

	private readonly _onDidChangeConnections = this._register(new Emitter<void>());
	readonly onDidChangeConnections = this._onDidChangeConnections.event;

	private readonly _clients = this._register(new DisposableMap<string, RemoteAgentHostProtocolClient>());
	private readonly _names = new Map<string, string>();

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		// React to setting changes
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(RemoteAgentHostsSettingId)) {
				this._reconcileConnections();
			}
		}));

		// Initial connection
		this._reconcileConnections();
	}

	get connections(): readonly IRemoteAgentHostConnection[] {
		const result: IRemoteAgentHostConnection[] = [];
		for (const [address, client] of this._clients) {
			result.push({ address, name: this._names.get(address) ?? address, clientId: client.clientId });
		}
		return result;
	}

	getClientId(address: string): string | undefined {
		return this._clients.get(address)?.clientId;
	}

	async subscribe(address: string, resource: URI): Promise<IStateSnapshot> {
		const client = this._getClient(address);
		return client.subscribe(resource);
	}

	unsubscribe(address: string, resource: URI): void {
		this._clients.get(address)?.unsubscribe(resource);
	}

	setAuthToken(address: string, token: string): void {
		const client = this._getClient(address);
		client.setAuthToken(token);
	}

	dispatchAction(address: string, action: ISessionAction, clientId: string, clientSeq: number): void {
		const client = this._getClient(address);
		client.dispatchAction(action, clientId, clientSeq);
	}

	async createSession(address: string, config?: IAgentCreateSessionConfig): Promise<URI> {
		const client = this._getClient(address);
		return client.createSession(config);
	}

	disposeSession(address: string, session: URI): void {
		this._clients.get(address)?.disposeSession(session);
	}

	async listSessions(address: string): Promise<readonly IAgentSessionMetadata[]> {
		const client = this._getClient(address);
		return client.listSessions();
	}

	private _getClient(address: string): RemoteAgentHostProtocolClient {
		const client = this._clients.get(address);
		if (!client) {
			throw new Error(`No connection to remote agent host at ${address}`);
		}
		return client;
	}

	private _reconcileConnections(): void {
		const entries: IRemoteAgentHostEntry[] = this._configurationService.getValue<IRemoteAgentHostEntry[]>(RemoteAgentHostsSettingId) ?? [];
		const desired = new Set(entries.map(e => e.address));

		// Update name map
		this._names.clear();
		for (const entry of entries) {
			this._names.set(entry.address, entry.name);
		}

		// Remove connections no longer in the setting
		for (const address of this._clients.keys()) {
			if (!desired.has(address)) {
				this._logService.info(`[RemoteAgentHost] Disconnecting from ${address}`);
				this._clients.deleteAndDispose(address);
				this._onDidChangeConnections.fire();
			}
		}

		// Add new connections
		for (const entry of entries) {
			if (!this._clients.has(entry.address)) {
				this._connectTo(entry.address);
			}
		}
	}

	private _connectTo(address: string): void {
		const client = this._instantiationService.createInstance(RemoteAgentHostProtocolClient, address);
		this._clients.set(address, client);

		// Forward events tagged with the remote address
		client.onDidAction(envelope => {
			this._onDidAction.fire({ ...envelope, remoteAddress: address });
		});

		client.onDidNotification(notification => {
			this._onDidNotification.fire({ remoteAddress: address, notification });
		});

		client.onDidClose(() => {
			this._logService.warn(`[RemoteAgentHost] Connection closed: ${address}`);
			this._clients.deleteAndDispose(address);
			this._onDidChangeConnections.fire();
		});

		this._logService.info(`[RemoteAgentHost] Connecting to ${address}`);
		client.connect().then(() => {
			this._logService.info(`[RemoteAgentHost] Connected to ${address}`);
			this._onDidChangeConnections.fire();
		}).catch(err => {
			this._logService.error(`[RemoteAgentHost] Failed to connect to ${address}`, err);
			this._clients.deleteAndDispose(address);
		});
	}
}
