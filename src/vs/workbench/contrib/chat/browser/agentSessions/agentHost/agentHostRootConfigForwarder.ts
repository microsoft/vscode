/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { structuralEquals } from '../../../../../../base/common/equals.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { AgentHostConfigKey } from '../../../../../../platform/agentHost/common/agentHostCustomizationConfig.js';
import { AgentHostWorkflowsEnabledConfigKey } from '../../../../../../platform/agentHost/common/agentHostSchema.js';
import { CopilotCliConfigKey } from '../../../../../../platform/agentHost/common/copilotCliConfig.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { ROOT_STATE_URI } from '../../../../../../platform/agentHost/common/state/sessionState.js';

/**
 * A single root-config key managed by an {@link AgentHostRootConfigForwarder}:
 * says only *what* its value is and *when* to recompute it. The forwarder owns
 * the schema gate, value-equality guard, dispatch, and hydration retry.
 */
export interface IForwardedRootConfigKey {
	/** The root-config key this descriptor owns. */
	readonly key: AgentHostConfigKey | CopilotCliConfigKey | typeof AgentHostWorkflowsEnabledConfigKey;

	/** Compute the desired value; return `undefined` to skip the push. May be async. */
	computeValue(): unknown | Promise<unknown>;

	/** Wire up the triggers that should re-push this key; add disposables to `store`, call `push`. */
	registerTriggers(store: DisposableStore, push: () => void): void;
}

/**
 * Forwards derived values to one owning connection with schema-hydration and cross-window echo guards.
 * Callers choose the target; machine-specific settings must remain local.
 */
export class AgentHostRootConfigForwarder extends Disposable {

	private readonly _listeners = this._register(new MutableDisposable<DisposableStore>());
	private _generation = 0;

	/**
	 * Managed keys whose schema the host has already advertised, so a key is
	 * re-pushed only when its schema *first* appears (see {@link _onRootStateChanged}).
	 */
	private readonly _schemaSeen = new Set<IForwardedRootConfigKey['key']>();

	constructor(
		private readonly _keys: readonly IForwardedRootConfigKey[],
		private readonly _connection: IAgentConnection,
		private readonly _onDidStart: Event<void> = Event.None,
	) {
		super();
	}

	/**
	 * Begin listening for triggers / agent-host (re)starts / schema hydration and
	 * do the initial push. Idempotent.
	 */
	start(): void {
		if (this._listeners.value) {
			return;
		}
		this._generation++;
		const store = new DisposableStore();
		store.add(this._onDidStart(() => {
			this._generation++;
			this._schemaSeen.clear();
			void this.reconcile();
		}));
		for (const entry of this._keys) {
			entry.registerTriggers(store, () => this._push(entry));
		}
		store.add(this._connection.rootState.onDidChange(() => this._onRootStateChanged()));
		if (this._connection.rootState.onDidError) {
			store.add(this._connection.rootState.onDidError(() => this._schemaSeen.clear()));
		}
		// Seed schema-seen so the immediate reconcile() counts as the initial push
		// for already-advertised keys (rather than being re-fired by _onRootStateChanged).
		this._schemaSeen.clear();
		for (const entry of this._keys) {
			if (this._schemaHasKey(entry.key)) {
				this._schemaSeen.add(entry.key);
			}
		}
		this._listeners.value = store;
		void this.reconcile();
	}

	/** Stop listening and forget advertised-schema state. Idempotent. */
	stop(): void {
		this._generation++;
		this._schemaSeen.clear();
		this._listeners.value = undefined;
	}

	/** Push every managed key (e.g. on start and after an agent-host restart). */
	async reconcile(): Promise<void> {
		await Promise.all(this._keys.map(entry => this._push(entry)));
	}

	/**
	 * Push managed values only for keys whose schema has just transitioned from
	 * absent to present (host root-config hydration). Value-only changes — e.g.
	 * another window writing a different value — are ignored so windows don't
	 * fight in an infinite loop.
	 */
	private _onRootStateChanged(): void {
		for (const entry of this._keys) {
			if (this._schemaHasKey(entry.key)) {
				if (!this._schemaSeen.has(entry.key)) {
					this._schemaSeen.add(entry.key);
					this._push(entry);
				}
			} else {
				this._schemaSeen.delete(entry.key);
			}
		}
	}

	private _schemaHasKey(key: IForwardedRootConfigKey['key']): boolean {
		const rootState = this._connection.rootState.value;
		if (!rootState || rootState instanceof Error) {
			return false;
		}
		return !!rootState.config?.schema.properties[key];
	}

	/**
	 * Push pipeline for a managed key: no-op if the schema doesn't advertise it
	 * (retried on hydration); compute the value (`undefined` skips); dispatch only
	 * if the host doesn't already hold a structurally-equal value — which breaks
	 * cross-window loops (#314385) and, being structural not `===`, never
	 * re-dispatches an unchanged object value.
	 */
	private async _push(entry: IForwardedRootConfigKey): Promise<void> {
		const generation = this._generation;
		if (!this._schemaHasKey(entry.key)) {
			return;
		}

		let value: unknown;
		try {
			value = await entry.computeValue();
		} catch {
			return;
		}
		if (value === undefined) {
			return;
		}

		// Re-check after the await: a host restart / schema refresh may have landed
		// while we resolved, so never dispatch a key the current schema dropped.
		if (generation !== this._generation || !this._listeners.value || !this._schemaHasKey(entry.key)) {
			return;
		}
		const rootState = this._connection.rootState.value;
		if (!rootState || rootState instanceof Error || !rootState.config) {
			return;
		}
		if (structuralEquals(rootState.config.values[entry.key], value)) {
			return;
		}

		this._connection.dispatch(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [entry.key]: value },
		});
	}
}
