/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable, type IDisposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const AGENT_HOST_CLIENT_CONNECTION_HISTORY_RETENTION = 30_000 * 10;

export interface IAgentHostClientConnectionCounts {
	readonly connectedClientCount: number;
	readonly connectedTransportCount: number;
	readonly clientTransportCount: number;
}

export interface IAgentHostClientConnectionSource {
	hasSeenClient(clientId: string): boolean;
	isClientConnected(clientId: string): boolean;
	getConnectedClientTransportCounts(): ReadonlyMap<string, number>;
}

export const IAgentHostClientConnectionService = createDecorator<IAgentHostClientConnectionService>('agentHostClientConnectionService');

export interface IAgentHostClientConnectionService {
	readonly _serviceBrand: undefined;
	registerSource(source: IAgentHostClientConnectionSource): IDisposable;
	hasSeenClient(clientId: string): boolean;
	isClientConnected(clientId: string): boolean;
	getConnectionCounts(clientId: string): IAgentHostClientConnectionCounts;
}

export class AgentHostClientConnectionService extends Disposable implements IAgentHostClientConnectionService {
	declare readonly _serviceBrand: undefined;
	private readonly _sources = new Set<IAgentHostClientConnectionSource>();

	constructor() {
		super();
		this._register(toDisposable(() => this._sources.clear()));
	}

	registerSource(source: IAgentHostClientConnectionSource): IDisposable {
		if (this._sources.has(source)) {
			throw new Error('Agent Host client connection source is already registered');
		}
		this._sources.add(source);
		return toDisposable(() => this._sources.delete(source));
	}

	hasSeenClient(clientId: string): boolean {
		for (const source of this._sources) {
			if (source.hasSeenClient(clientId)) {
				return true;
			}
		}
		return false;
	}

	isClientConnected(clientId: string): boolean {
		for (const source of this._sources) {
			if (source.isClientConnected(clientId)) {
				return true;
			}
		}
		return false;
	}

	getConnectionCounts(clientId: string): IAgentHostClientConnectionCounts {
		const connectedClients = new Set<string>();
		let connectedTransportCount = 0;
		let clientTransportCount = 0;
		for (const source of this._sources) {
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
}
