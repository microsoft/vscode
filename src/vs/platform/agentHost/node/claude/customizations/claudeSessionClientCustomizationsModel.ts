/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { equals as arraysEqual } from '../../../../../base/common/arrays.js';
import { URI } from '../../../../../base/common/uri.js';
import { autorun, derivedOpts, IObservable, ISettableObservable, observableValueOpts } from '../../../../../base/common/observable.js';
import type { ISyncedCustomization } from '../../../common/agentPluginManager.js';

/**
 * Per-session **client-pushed** customization snapshot + enablement
 * map. "Client" here means the workbench client that called
 * `setClientCustomizations` / `setCustomizationEnabled` — server-side
 * (SDK-discovered) customizations live separately and are never
 * stored in this model. The two fields travel as one value so
 * consumers can read both with a single `.get()` and so that an
 * update to either is observed as a single change.
 */
export interface ISessionCustomizationsState {
	readonly synced: readonly ISyncedCustomization[];
	readonly enablement: ReadonlyMap<string, boolean>;
}

const INITIAL_STATE: ISessionCustomizationsState = { synced: [], enablement: new Map() };

/**
 * Pure observable state holder for the **client-pushed**
 * {@link ISyncedCustomization} list and the per-customization
 * enablement map. Exposes a derived `enabledPluginPaths` view used
 * to project `Options.plugins` at materialize / rematerialize.
 *
 * Server-side (SDK-discovered) customizations are NOT in scope here
 * — they're fetched on demand from the live `Query` in
 * `getSessionCustomizations` and never written into this
 * model.
 *
 * `state` dedupes structurally-equivalent writes: a re-send of the
 * same `(synced, enablement)` pair does NOT fire downstream
 * subscribers. Knows nothing about diffing or the SDK — pair with
 * {@link SessionClientCustomizationsDiff} to track "has the client-pushed
 * snapshot changed since the last successful SDK plugin reload".
 */
export class SessionClientCustomizationsModel {

	private readonly _state: ISettableObservable<ISessionCustomizationsState> = observableValueOpts(
		{ owner: this, equalsFn: stateEqual },
		INITIAL_STATE,
	);
	readonly state: IObservable<ISessionCustomizationsState> = this._state;

	/**
	 * Resolved local plugin paths for the currently enabled
	 * **client-pushed** customizations. Customizations without a
	 * `pluginDir` (still loading or failed sync) are excluded.
	 * Default enablement is `true` — an absent entry counts as
	 * enabled. Server-side customizations contribute nothing here.
	 */
	readonly enabledPluginPaths: IObservable<readonly URI[]> = derivedOpts<readonly URI[]>(
		{ owner: this, equalsFn: (a, b) => arraysEqual(a, b, (x, y) => x.toString() === y.toString()) },
		reader => {
			const s = this._state.read(reader);
			const paths: URI[] = [];
			for (const synced of s.synced) {
				if (!synced.pluginDir) {
					continue;
				}
				const uri = synced.customization.customization.uri.toString();
				if (s.enablement.get(uri) === false) {
					continue;
				}
				paths.push(synced.pluginDir);
			}
			return paths;
		},
	);

	/** Replace the client-pushed customization snapshot for this session. */
	setSyncedCustomizations(synced: readonly ISyncedCustomization[]): void {
		const cur = this._state.get();
		this._state.set({ synced, enablement: cur.enablement }, undefined);
	}

	/** Toggle a client-pushed customization on/off for this session. */
	setEnabled(uri: string, enabled: boolean): void {
		const cur = this._state.get();
		if (cur.enablement.get(uri) === enabled) {
			return;
		}
		const next = new Map(cur.enablement);
		next.set(uri, enabled);
		this._state.set({ synced: cur.synced, enablement: next }, undefined);
	}
}

/**
 * Tracks "has the **client-pushed** customization snapshot changed
 * since the SDK was last (re)started against it?". Subscribes to
 * {@link SessionClientCustomizationsModel.state}, with the state
 * observable's equalsFn structurally comparing the meaningful
 * fields (URI list, enablement, nonce, status, user-visible
 * metadata). Same race semantics as `SessionClientToolsDiff`: a
 * write that lands during an in-flight rebind re-flips dirty via
 * the autorun, so callers don't need to snapshot-compare.
 *
 * Why state and not just `enabledPluginPaths`: the SDK's
 * `reloadPlugins()` is parameterless — the plugin URI set is
 * captured into `Options.plugins` at startup and is otherwise
 * immutable. Any meaningful change (new plugin, toggle, content
 * refresh via nonce, metadata refresh) therefore requires the
 * yield-restart path to take effect, so we treat every state
 * change as SDK-relevant.
 *
 * Server-side (SDK-discovered) customizations are NOT tracked
 * here — the SDK manages its own discovery lifecycle, and
 * changes to server-side data flow to the workbench via separate
 * event fires (post-materialize, post-rebind).
 *
 * On rebind throw the bit is left set — the SDK is still running
 * with the previous plugin set, so the next sendMessage should
 * retry.
 */
export class SessionClientCustomizationsDiff extends Disposable {

	readonly model: SessionClientCustomizationsModel = new SessionClientCustomizationsModel();

	private _dirty = false;
	// `autorun` invokes its callback once at registration for dependency
	// tracking. Skip that initial run so a brand-new diff doesn't
	// report dirty before any mutation has happened.
	private _ignoreNextFire = true;

	/**
	 * Outward fire-and-forget signal that the underlying state
	 * changed. Derived from the observable so external listeners
	 * (e.g. agent-level event aggregation) don't have to subscribe to
	 * the observable directly.
	 */
	readonly onDidChange: Event<void> = Event.fromObservableLight(this.model.state);

	constructor() {
		super();
		this._register(autorun(reader => {
			this.model.state.read(reader);
			if (this._ignoreNextFire) {
				this._ignoreNextFire = false;
				return;
			}
			this._dirty = true;
		}));
	}

	get hasDifference(): boolean {
		return this._dirty;
	}

	/**
	 * Read the resolved enabled plugin paths and mark the current
	 * snapshot as applied. A subsequent write that changes any
	 * meaningful field re-flips dirty via the autorun. If the caller's
	 * downstream work (e.g. SDK rebind) fails, call {@link markDirty}
	 * to surface the stale state.
	 */
	consume(): readonly URI[] {
		const paths = this.model.enabledPluginPaths.get();
		this._dirty = false;
		return paths;
	}

	/**
	 * Force the dirty bit on. Use when async work that followed
	 * {@link consume} failed and the SDK is therefore still on the
	 * previous plugin set.
	 */
	markDirty(): void {
		this._dirty = true;
	}
}

function stateEqual(a: ISessionCustomizationsState, b: ISessionCustomizationsState): boolean {
	return syncedListEqual(a.synced, b.synced) && enablementEqual(a.enablement, b.enablement);
}

function syncedListEqual(a: readonly ISyncedCustomization[], b: readonly ISyncedCustomization[]): boolean {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		const ai = a[i].customization;
		const bi = b[i].customization;
		if (ai.customization.uri.toString() !== bi.customization.uri.toString()) {
			return false;
		}
		if (ai.customization.nonce !== bi.customization.nonce) {
			return false;
		}
		if (ai.customization.displayName !== bi.customization.displayName) {
			return false;
		}
		if (ai.customization.description !== bi.customization.description) {
			return false;
		}
		if (ai.enabled !== bi.enabled) {
			return false;
		}
		if (ai.status !== bi.status) {
			return false;
		}
		if (ai.statusMessage !== bi.statusMessage) {
			return false;
		}
		if (!agentsEqual(ai.agents, bi.agents)) {
			return false;
		}
		if (a[i].pluginDir?.toString() !== b[i].pluginDir?.toString()) {
			return false;
		}
	}
	return true;
}

function agentsEqual(a: readonly { name: string }[] | undefined, b: readonly { name: string }[] | undefined): boolean {
	if (a === b) {
		return true;
	}
	if (!a || !b || a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		if (a[i].name !== b[i].name) {
			return false;
		}
	}
	return true;
}

function enablementEqual(a: ReadonlyMap<string, boolean>, b: ReadonlyMap<string, boolean>): boolean {
	if (a.size !== b.size) {
		return false;
	}
	for (const [k, v] of a) {
		if (b.get(k) !== v) {
			return false;
		}
	}
	return true;
}
