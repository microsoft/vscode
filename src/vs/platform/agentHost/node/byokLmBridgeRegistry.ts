/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IByokLmBridgeConnection, IByokLmModelInfo } from '../common/agentHostByokLm.js';

export const IByokLmBridgeRegistry = createDecorator<IByokLmBridgeRegistry>('byokLmBridgeRegistry');

/**
 * Node-side registry of renderer {@link IByokLmBridgeConnection}s keyed by
 * client id. Populated by the agent host's connection lifecycle (one entry per
 * connected renderer) and consumed by {@link IByokLmProxyService} (inference
 * routing) and {@link CopilotAgent} (model catalogue).
 *
 * **Single serving window, multiple connections.** BYOK is serviced by the
 * renderer LM API, whose BYOK models are a property of the user's installed
 * extensions, not of a particular window — so every window that registers the
 * handler exposes the same set. Both the main workbench and the dedicated Agents
 * app register it (each runs a full extension host whose LM API holds the same
 * BYOK models), so either can serve. A connection that connects without binding
 * the handler registers a bridge whose `listModels()` rejects and is treated as
 * non-serving. The registry therefore does NOT aggregate per-window model sets;
 * it surfaces the models from any one *serving* window (preferring one that
 * actually has models) and routes inference there, automatically excluding
 * non-serving windows.
 *
 * A connection becomes "serving" once its `listModels()` resolves (even to an
 * empty list). On registration (and whenever a connection reports
 * {@link IByokLmBridgeConnection.onDidChangeModels}) the registry enumerates it
 * and fires {@link onDidChangeModels} when the serving model set changes.
 */
export interface IByokLmBridgeRegistry {
	readonly _serviceBrand: undefined;

	/** Register a renderer connection. Disposing the result removes it. */
	register(clientId: string, connection: IByokLmBridgeConnection): IDisposable;

	/**
	 * Re-enumerate the connected renderers, refresh the cache, and return the
	 * serving window's BYOK models. Use this when freshness matters (e.g.
	 * synthesizing a session's provider config at create time).
	 */
	listModels(): Promise<IByokLmModelInfo[]>;

	/**
	 * The serving window's BYOK models, read synchronously from the cache (no
	 * enumeration). Use this for fast reads driven by {@link onDidChangeModels}.
	 */
	getModels(): readonly IByokLmModelInfo[];

	/**
	 * A connection that can serve BYOK inference (one whose enumeration has
	 * resolved), or `undefined` when no connected window can. All serving
	 * windows expose the same models, so any one of them is a valid target.
	 */
	getServingConnection(): IByokLmBridgeConnection | undefined;

	/**
	 * Subscribe to changes in the set of registered connections (a renderer
	 * connecting or disconnecting) or in the serving window's models, so
	 * consumers can re-read {@link getModels}. Disposing the result removes the
	 * listener.
	 */
	onDidChangeModels(listener: () => void): IDisposable;
}

/**
 * Per-connection registry entry. `models` is `undefined` until the connection's
 * first successful enumeration; a connection with defined `models` is "serving"
 * (it answered, even if with an empty list). Non-serving windows (those that did
 * not register the BYOK handler, whose `listModels()` rejects) keep
 * `models === undefined`.
 */
interface IConnectionEntry {
	readonly connection: IByokLmBridgeConnection;
	models: readonly IByokLmModelInfo[] | undefined;
	readonly store: DisposableStore;
}

export class ByokLmBridgeRegistry implements IByokLmBridgeRegistry {

	declare readonly _serviceBrand: undefined;

	private readonly _entries = new Map<string, IConnectionEntry>();
	private readonly _changeListeners = new Set<() => void>();

	onDidChangeModels(listener: () => void): IDisposable {
		this._changeListeners.add(listener);
		return toDisposable(() => {
			this._changeListeners.delete(listener);
		});
	}

	private _notifyChanged(): void {
		// Snapshot first: a listener may unsubscribe (mutating the set) while it
		// is being notified.
		for (const listener of [...this._changeListeners]) {
			listener();
		}
	}

	register(clientId: string, connection: IByokLmBridgeConnection): IDisposable {
		// Replace any prior entry for the same client id (e.g. a reconnect).
		this._entries.get(clientId)?.store.dispose();

		const store = new DisposableStore();
		const entry: IConnectionEntry = { connection, models: undefined, store };
		this._entries.set(clientId, entry);

		// Re-enumerate whenever the renderer reports its BYOK models changed.
		if (connection.onDidChangeModels) {
			store.add(connection.onDidChangeModels(() => {
				void this._refreshConnection(clientId);
			}));
		}

		// The connection set changed; enumerate the new connection's models.
		this._notifyChanged();
		void this._refreshConnection(clientId);

		return toDisposable(() => {
			if (this._entries.get(clientId) === entry) {
				this._entries.delete(clientId);
				entry.store.dispose();
				this._notifyChanged();
			}
		});
	}

	async listModels(): Promise<IByokLmModelInfo[]> {
		// Actively re-enumerate every connection so callers that need freshness
		// (e.g. session create) don't race a cold cache.
		await Promise.all([...this._entries.keys()].map(clientId => this._refreshConnection(clientId)));
		return [...this.getModels()];
	}

	getModels(): readonly IByokLmModelInfo[] {
		return this._servingEntry()?.models ?? [];
	}

	getServingConnection(): IByokLmBridgeConnection | undefined {
		return this._servingEntry()?.connection;
	}

	/**
	 * A connection that has answered an enumeration (`models` defined), preferring
	 * one whose model set is non-empty. All serving windows expose the same models,
	 * so any populated one is an equivalent source/target; the preference matters
	 * when a window that is still starting up (e.g. the Agents app before its BYOK
	 * extension has registered models) answers with an empty list first — it must
	 * not shadow a peer that already has them, transiently or permanently. Falls
	 * back to a serving-but-empty window when none have models yet; non-serving
	 * windows (those that didn't register the BYOK handler) are skipped.
	 */
	private _servingEntry(): IConnectionEntry | undefined {
		let emptyFallback: IConnectionEntry | undefined;
		for (const entry of this._entries.values()) {
			if (entry.models === undefined) {
				continue;
			}
			if (entry.models.length > 0) {
				return entry;
			}
			emptyFallback ??= entry;
		}
		return emptyFallback;
	}

	/**
	 * Enumerate a single connection's models into its cache and notify listeners
	 * when the result changes. A connection whose `listModels()` rejects (e.g. a
	 * window that did not register the BYOK handler) is left non-serving.
	 */
	private async _refreshConnection(clientId: string): Promise<void> {
		const entry = this._entries.get(clientId);
		if (!entry) {
			return;
		}
		let models: readonly IByokLmModelInfo[];
		try {
			models = await entry.connection.listModels();
		} catch {
			// The connection didn't answer (e.g. no BYOK handler registered);
			// leave it non-serving.
			return;
		}
		// Drop the result if the entry was removed/replaced while in flight.
		if (this._entries.get(clientId) !== entry) {
			return;
		}
		// The connection answered, so this entry is serving. Notify only when the
		// serving model set actually changed.
		if (entry.models === undefined || !modelsEqual(entry.models, models)) {
			entry.models = models;
			this._notifyChanged();
		}
	}
}

/** Shallow structural comparison of two model lists (order-sensitive). */
function modelsEqual(a: readonly IByokLmModelInfo[], b: readonly IByokLmModelInfo[]): boolean {
	if (a.length !== b.length) {
		return false;
	}
	return a.every((m, i) => {
		const n = b[i];
		return m.vendor === n.vendor && m.id === n.id && m.name === n.name && m.maxContextWindowTokens === n.maxContextWindowTokens && m.supportsVision === n.supportsVision;
	});
}

/**
 * No-op {@link IByokLmBridgeRegistry} for agent host entrypoints that do not
 * support BYOK — e.g. the remote agent host, where no extension host runs
 * alongside the agent host to serve the renderer LM API.
 */
export class NullByokLmBridgeRegistry implements IByokLmBridgeRegistry {

	declare readonly _serviceBrand: undefined;

	register(): IDisposable {
		return Disposable.None;
	}

	async listModels(): Promise<IByokLmModelInfo[]> {
		return [];
	}

	getModels(): readonly IByokLmModelInfo[] {
		return [];
	}

	getServingConnection(): IByokLmBridgeConnection | undefined {
		return undefined;
	}

	onDidChangeModels(): IDisposable {
		return Disposable.None;
	}
}
