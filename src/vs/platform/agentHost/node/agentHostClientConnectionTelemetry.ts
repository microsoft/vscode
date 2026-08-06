/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';

export interface IAgentHostClientConnectionCounts {
	readonly connectedClientCount: number;
	readonly connectedTransportCount: number;
	readonly clientTransportCount: number;
}

export interface IAgentHostClientConnectedResult extends IAgentHostClientConnectionCounts {
	readonly isReconnect: boolean;
}

export class AgentHostClientConnectionTelemetryTracker extends Disposable {
	private readonly _seenClients = new Set<string>();
	private readonly _activeTransports = new Map<string, Set<object>>();

	hasSeenClient(clientId: string): boolean {
		return this._seenClients.has(clientId);
	}

	connect(clientId: string, transportToken: object): IAgentHostClientConnectedResult {
		const isReconnect = this._seenClients.has(clientId);
		this._seenClients.add(clientId);
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
		}
		return this._counts(clientId);
	}

	override dispose(): void {
		this._seenClients.clear();
		this._activeTransports.clear();
		super.dispose();
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
