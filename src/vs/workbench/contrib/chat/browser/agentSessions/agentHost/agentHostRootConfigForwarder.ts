/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { structuralEquals } from '../../../../../../base/common/equals.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { AgentHostConfigKey } from '../../../../../../platform/agentHost/common/agentHostCustomizationConfig.js';
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
	readonly key: AgentHostConfigKey | CopilotCliConfigKey;

	/** Compute the desired value; return `undefined` to skip the push. May be async. */
	computeValue(): unknown | Promise<unknown>;

	/** Wire up the triggers that should re-push this key; add disposables to `store`, call `push`. */
	registerTriggers(store: DisposableStore, push: () => void): void;
}

/**
 * Shared engine that forwards VS Code-derived values into the **local** agent
 * host's root config so the host (and the CLI session launcher) can read them
 * via `getRootValue`. Not a contribution itself: a workbench contribution
 * constructs one with its own {@link IForwardedRootConfigKey} table and drives
 * {@link start} / {@link stop} from its own enablement gate. Shared by
 * `AgentHostTerminalContribution` and `AgentHostCopilotCliSettingsContribution`
 * so the three correctness constraints below live in exactly one place.
 *
 * The three constraints forwarding into the shared root config requires:
 *  1. **Schema gate.** A key is dispatched only once the host advertises it in
 *     its root-config schema - protects older / third-party agent hosts (and an
 *     older host that advertises only a subset of the keys) from receiving keys
 *     they don't understand.
 *  2. **Hydration retry.** The host's `rootState` may hydrate *after* the
 *     forwarder starts, so a key whose schema isn't present yet is retried when
 *     the schema first appears (see {@link _onRootStateChanged}).
 *  3. **Cross-window loop guard.** The local agent host's root config is shared
 *     across windows, so a key is dispatched only when its value actually
 *     changes (compared structurally - see {@link _push}). Reacting to a
 *     value-only change pushed by another window would otherwise start an
 *     infinite update war, each window forcing its own value back over the
 *     other's (#314385).
 *
 * Local agent host only. Remote agent hosts (via
 * `IRemoteAgentHostService.connections`) are intentionally not fanned out to:
 * e.g. a resolved shell path is local-machine-shaped and not necessarily valid
 * on the remote. Remote operators should configure such values server-side via
 * the remote's `agent-host-config.json`. See
 * https://github.com/microsoft/vscode/issues/313160 follow-ups.
 */
export class AgentHostRootConfigForwarder extends Disposable {

	private readonly _listeners = this._register(new MutableDisposable<DisposableStore>());

	/**
	 * Managed keys whose schema the host has already advertised, so a key is
	 * re-pushed only when its schema *first* appears (see {@link _onRootStateChanged}).
	 */
	private readonly _schemaSeen = new Set<AgentHostConfigKey | CopilotCliConfigKey>();

	constructor(
		private readonly _keys: readonly IForwardedRootConfigKey[],
		private readonly _agentHostService: IAgentHostService,
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
		const store = new DisposableStore();
		store.add(this._agentHostService.onAgentHostStart(() => this.reconcile()));
		for (const entry of this._keys) {
			entry.registerTriggers(store, () => this._push(entry));
		}
		store.add(this._agentHostService.rootState.onDidChange(() => this._onRootStateChanged()));
		// Seed schema-seen so the immediate reconcile() counts as the initial push
		// for already-advertised keys (rather than being re-fired by _onRootStateChanged).
		this._schemaSeen.clear();
		for (const entry of this._keys) {
			if (this._schemaHasKey(entry.key)) {
				this._schemaSeen.add(entry.key);
			}
		}
		this._listeners.value = store;
		this.reconcile();
	}

	/** Stop listening and forget advertised-schema state. Idempotent. */
	stop(): void {
		this._schemaSeen.clear();
		this._listeners.value = undefined;
	}

	/** Push every managed key (e.g. on start and after an agent-host restart). */
	reconcile(): void {
		for (const entry of this._keys) {
			this._push(entry);
		}
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

	private _schemaHasKey(key: AgentHostConfigKey | CopilotCliConfigKey): boolean {
		const rootState = this._agentHostService.rootState.value;
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
		if (!this._schemaHasKey(entry.key)) {
			return;
		}
		const rootState = this._agentHostService.rootState.value;
		if (!rootState || rootState instanceof Error || !rootState.config) {
			return;
		}
		if (structuralEquals(rootState.config.values[entry.key], value)) {
			return;
		}

		this._agentHostService.dispatch(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [entry.key]: value },
		});
	}
}
