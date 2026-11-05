/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { Emitter, type Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable, type IDisposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { IAgentHostMcpAuthenticationRequest, IAgentHostWorkspaceTrustRequest } from '../common/agentHostExtensionProtocol.js';

export const AGENT_HOST_CLIENT_RECONNECT_GRACE_PERIOD = 30_000;
export const AGENT_HOST_CLIENT_CONNECTION_HISTORY_RETENTION = AGENT_HOST_CLIENT_RECONNECT_GRACE_PERIOD * 10;

export interface IAgentHostClientConnectionCounts {
	readonly connectedClientCount: number;
	readonly connectedTransportCount: number;
	readonly clientTransportCount: number;
}

export interface IAgentHostClientConnectionSource {
	readonly onDidChangeSessionPermissionClients?: Event<void>;
	hasSessionPermissionClient?(session: string): boolean;
	hasSeenClient(clientId: string): boolean;
	isClientConnected(clientId: string): boolean;
	/** Whether an active connection is local and uses the server's MessagePort transport. */
	isLocalClient(clientId: string): boolean;
	/** Compatibility addressing for a positively identified legacy VS Code connection. */
	usesLegacySessionUris?(clientId: string): boolean;
	/** Whether a positively identified VS Code connection lacks opaque chat URI support (`vscode.ahpChatUris`). */
	usesLegacyChatUris(clientId: string): boolean;
	getConnectedClientTransportCounts(): ReadonlyMap<string, number>;
	requestWorkspaceTrust(clientId: string, request: IAgentHostWorkspaceTrustRequest): Promise<boolean>;
	/** Requests silent MCP authentication from connected clients. */
	requestMcpAuthentication(request: IAgentHostMcpAuthenticationRequest): Promise<boolean>;
}

export const IAgentHostClientConnectionService = createDecorator<IAgentHostClientConnectionService>('agentHostClientConnectionService');

export interface IAgentHostClientConnectionService {
	readonly _serviceBrand: undefined;
	registerSource(source: IAgentHostClientConnectionSource): IDisposable;
	/** Watches client availability, not the time taken by a connected user to decide. */
	watchSessionPermissionClient(session: string, onUnavailable: () => void): IDisposable;
	hasSeenClient(clientId: string): boolean;
	isClientConnected(clientId: string): boolean;
	/** Whether any source has an active local MessagePort connection for this client. */
	isLocalClient(clientId: string): boolean;
	usesLegacySessionUris(clientId: string): boolean;
	usesLegacyChatUris(clientId: string): boolean;
	getConnectionCounts(clientId: string): IAgentHostClientConnectionCounts;
	requestWorkspaceTrust(clientId: string, request: IAgentHostWorkspaceTrustRequest): Promise<boolean>;
	/** Requests silent MCP authentication, stopping at the first successful source. */
	requestMcpAuthentication(request: IAgentHostMcpAuthenticationRequest): Promise<boolean>;
}

export class AgentHostClientConnectionService extends Disposable implements IAgentHostClientConnectionService {
	declare readonly _serviceBrand: undefined;
	private readonly _sources = this._register(new DisposableMap<IAgentHostClientConnectionSource, IDisposable>());
	private readonly _onDidChangeSessionPermissionClients = this._register(new Emitter<void>());

	registerSource(source: IAgentHostClientConnectionSource): IDisposable {
		if (this._sources.has(source)) {
			throw new Error('Agent Host client connection source is already registered');
		}
		this._sources.set(source, source.onDidChangeSessionPermissionClients?.(() => this._onDidChangeSessionPermissionClients.fire()) ?? Disposable.None);
		this._onDidChangeSessionPermissionClients.fire();
		return toDisposable(() => {
			this._sources.deleteAndDispose(source);
			this._onDidChangeSessionPermissionClients.fire();
		});
	}

	watchSessionPermissionClient(session: string, onUnavailable: () => void): IDisposable {
		const store = new DisposableStore();
		const hasClient = () => [...this._sources.keys()].some(source => source.hasSessionPermissionClient?.(session) === true);
		const timer = store.add(new RunOnceScheduler(() => {
			if (!hasClient()) {
				store.dispose();
				onUnavailable();
			}
		}, AGENT_HOST_CLIENT_RECONNECT_GRACE_PERIOD));
		const update = () => {
			if (hasClient()) {
				timer.cancel();
			} else if (!timer.isScheduled()) {
				timer.schedule();
			}
		};
		store.add(this._onDidChangeSessionPermissionClients.event(update));
		update();
		return store;
	}

	hasSeenClient(clientId: string): boolean {
		for (const source of this._sources.keys()) {
			if (source.hasSeenClient(clientId)) {
				return true;
			}
		}
		return false;
	}

	isClientConnected(clientId: string): boolean {
		for (const source of this._sources.keys()) {
			if (source.isClientConnected(clientId)) {
				return true;
			}
		}
		return false;
	}

	isLocalClient(clientId: string): boolean {
		for (const source of this._sources.keys()) {
			if (source.isLocalClient(clientId)) {
				return true;
			}
		}
		return false;
	}

	getConnectionCounts(clientId: string): IAgentHostClientConnectionCounts {
		const connectedClients = new Set<string>();
		let connectedTransportCount = 0;
		let clientTransportCount = 0;
		for (const source of this._sources.keys()) {
			for (const [connectedClientId, transportCount] of source.getConnectedClientTransportCounts()) {
				connectedClients.add(connectedClientId);
				connectedTransportCount += transportCount;
				if (connectedClientId === clientId) {
					clientTransportCount += transportCount;
				}
			}
		}
		return {
			connectedClientCount: connectedClients.size,
			connectedTransportCount,
			clientTransportCount,
		};
	}

	usesLegacySessionUris(clientId: string): boolean {
		return [...this._sources.keys()].some(source => source.usesLegacySessionUris?.(clientId) === true);
	}

	usesLegacyChatUris(clientId: string): boolean {
		return [...this._sources.keys()].some(source => source.usesLegacyChatUris(clientId));
	}

	async requestMcpAuthentication(request: IAgentHostMcpAuthenticationRequest): Promise<boolean> {
		for (const source of this._sources.keys()) {
			if (await source.requestMcpAuthentication(request)) {
				return true;
			}
		}
		return false;
	}

	requestWorkspaceTrust(clientId: string, request: IAgentHostWorkspaceTrustRequest): Promise<boolean> {
		for (const source of this._sources.keys()) {
			if (source.isClientConnected(clientId)) {
				return source.requestWorkspaceTrust(clientId, request);
			}
		}
		return Promise.reject(new Error(`Cannot request workspace trust because client ${clientId} is not connected.`));
	}
}
