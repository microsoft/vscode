/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IByokLmBridgeConnection } from '../common/agentHostByokLm.js';

export const IByokLmBridgeRegistry = createDecorator<IByokLmBridgeRegistry>('byokLmBridgeRegistry');

/**
 * Node-side registry of renderer {@link IByokLmBridgeConnection}s keyed by
 * client id. Populated by the agent host's connection lifecycle (one entry per
 * connected renderer) and consumed by {@link IByokLmProxyService} when it needs
 * to service an inbound OpenAI request against the renderer LM API.
 *
 * Single-tenant assumption (matching the Claude/Codex proxies): the most
 * recently registered connection is treated as the active one.
 */
export interface IByokLmBridgeRegistry {
	readonly _serviceBrand: undefined;

	/** Register a renderer connection. Disposing the result removes it. */
	register(clientId: string, connection: IByokLmBridgeConnection): IDisposable;

	/** The connection for `clientId`, or `undefined` if none is registered. */
	get(clientId: string): IByokLmBridgeConnection | undefined;

	/** The most recently registered, still-live connection, if any. */
	getActive(): IByokLmBridgeConnection | undefined;

	/**
	 * Subscribe to changes in the set of registered connections (a renderer
	 * connecting or disconnecting), so consumers can re-enumerate models.
	 * Disposing the result removes the listener.
	 */
	onDidChangeActive(listener: () => void): IDisposable;
}

export class ByokLmBridgeRegistry implements IByokLmBridgeRegistry {

	declare readonly _serviceBrand: undefined;

	private readonly _connections = new Map<string, IByokLmBridgeConnection>();
	private _activeClientId: string | undefined;
	private readonly _changeListeners = new Set<() => void>();

	onDidChangeActive(listener: () => void): IDisposable {
		this._changeListeners.add(listener);
		return toDisposable(() => {
			this._changeListeners.delete(listener);
		});
	}

	private _notifyActiveChanged(): void {
		// Snapshot first: a listener may unsubscribe (mutating the set) while it
		// is being notified.
		for (const listener of [...this._changeListeners]) {
			listener();
		}
	}

	register(clientId: string, connection: IByokLmBridgeConnection): IDisposable {
		this._connections.set(clientId, connection);
		this._activeClientId = clientId;
		this._notifyActiveChanged();
		return toDisposable(() => {
			if (this._connections.get(clientId) === connection) {
				this._connections.delete(clientId);
				if (this._activeClientId === clientId) {
					// Fall back to any remaining connection.
					const next = this._connections.keys().next();
					this._activeClientId = next.done ? undefined : next.value;
				}
				this._notifyActiveChanged();
			}
		});
	}

	get(clientId: string): IByokLmBridgeConnection | undefined {
		return this._connections.get(clientId);
	}

	getActive(): IByokLmBridgeConnection | undefined {
		if (this._activeClientId !== undefined) {
			return this._connections.get(this._activeClientId);
		}
		return undefined;
	}
}
