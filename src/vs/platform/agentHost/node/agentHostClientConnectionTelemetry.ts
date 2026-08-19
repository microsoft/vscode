/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';

export const AGENT_HOST_CLIENT_CONNECTION_HISTORY_RETENTION = 30_000 * 10;

export interface IAgentHostClientConnectionCounts {
	readonly connectedClientCount: number;
	readonly connectedTransportCount: number;
	readonly clientTransportCount: number;
}

export interface IAgentHostClientConnectedResult extends IAgentHostClientConnectionCounts {
	readonly isReconnect: boolean;
}

export class AgentHostClientConnectionTelemetryTracker extends Disposable {
	private readonly _recentlyDisconnectedClients = new Map<string, number>();
	private readonly _activeTransports = new Map<string, Set<object>>();

	constructor(private readonly _historyRetentionMs = AGENT_HOST_CLIENT_CONNECTION_HISTORY_RETENTION) {
		super();
	}

	hasSeenClient(clientId: string): boolean {
		this._pruneDisconnectedClientHistory();
		return this._activeTransports.has(clientId) || this._recentlyDisconnectedClients.has(clientId);
	}

	connect(clientId: string, transportToken: object): IAgentHostClientConnectedResult {
		const isReconnect = this.hasSeenClient(clientId);
		this._recentlyDisconnectedClients.delete(clientId);
		let transports = this._activeTransports.get(clientId);
		if (!transports) {
			transports = new Set();
			this._activeTransports.set(clientId, transports);
		}
		transports.add(transportToken);
		return { isReconnect, ...this._counts(clientId) };
	}

	disconnect(clientId: string, transportToken: object): IAgentHostClientConnectionCounts {
		const transports = this._activeTransports.get(clientId);
		transports?.delete(transportToken);
		if (transports?.size === 0) {
			this._activeTransports.delete(clientId);
			this._recentlyDisconnectedClients.set(clientId, Date.now());
		}
		this._pruneDisconnectedClientHistory();
		return this._counts(clientId);
	}

	override dispose(): void {
		this._recentlyDisconnectedClients.clear();
		this._activeTransports.clear();
		super.dispose();
	}

	private _pruneDisconnectedClientHistory(): void {
		const cutoff = Date.now() - this._historyRetentionMs;
		for (const [clientId, disconnectedAt] of this._recentlyDisconnectedClients) {
			if (disconnectedAt <= cutoff) {
				this._recentlyDisconnectedClients.delete(clientId);
			}
		}
	}

	private _counts(clientId: string): IAgentHostClientConnectionCounts {
		let connectedTransportCount = 0;
		for (const transports of this._activeTransports.values()) {
			connectedTransportCount += transports.size;
		}
		return {
			connectedClientCount: this._activeTransports.size,
			connectedTransportCount,
			clientTransportCount: this._activeTransports.get(clientId)?.size ?? 0,
		};
	}
}
