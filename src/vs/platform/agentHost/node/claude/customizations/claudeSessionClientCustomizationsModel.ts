/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { equals as arraysEqual } from '../../../../../base/common/arrays.js';
import { URI } from '../../../../../base/common/uri.js';
import { autorun, IObservable, ISettableObservable, observableValueOpts } from '../../../../../base/common/observable.js';
import type { ISyncedCustomization } from '../../../common/agentPluginManager.js';
import type { ClientPluginCustomization } from '../../../common/state/sessionState.js';

/**
 * Per-session **client-pushed** customization snapshot. Server-side
 * (SDK-discovered) customizations live separately and are never stored here.
 */
export interface ISessionCustomizationsState {
	readonly synced: readonly ISyncedCustomization[];
}

const INITIAL_STATE: ISessionCustomizationsState = { synced: [] };

/**
 * Pure observable state holder for the **client-pushed**
 * {@link ISyncedCustomization} list.
 *
 * Server-side (SDK-discovered) customizations are NOT in scope here
 * — they're fetched on demand from the live `Query` in
 * `getSessionCustomizations` and never written into this
 * model.
 *
 * `state` dedupes structurally-equivalent writes: a re-send of the
 * same synced snapshot does NOT fire downstream
 * subscribers. Knows nothing about diffing or the SDK — pair with
 * {@link SessionClientCustomizationsDiff} to track "has the client-pushed
 * snapshot changed since the last successful SDK plugin reload".
 */
export class SessionClientCustomizationsModel {

	/** Per-client synced customizations, keyed by `clientId`, merged into `state.synced`. */
	private readonly _byClient = new Map<string, readonly ISyncedCustomization[]>();

	private readonly _state: ISettableObservable<ISessionCustomizationsState> = observableValueOpts(
		{ owner: this, equalsFn: stateEqual },
		INITIAL_STATE,
	);
	readonly state: IObservable<ISessionCustomizationsState> = this._state;

	/**
	 * The union of every client's synced customizations, deduplicated by
	 * customization `id` with the first-inserted client winning. Order
	 * follows client insertion order.
	 */
	private _mergedSynced(): readonly ISyncedCustomization[] {
		const seen = new Set<string>();
		const result: ISyncedCustomization[] = [];
		for (const synced of this._byClient.values()) {
			for (const item of synced) {
				if (seen.has(item.customization.id)) {
					continue;
				}
				seen.add(item.customization.id);
				result.push(item);
			}
		}
		return result;
	}

	/** Replace a single client's pushed customization snapshot for this session. */
	setSyncedCustomizations(clientId: string, synced: readonly ISyncedCustomization[]): void {
		this._byClient.set(clientId, synced);
		this._state.set({ synced: this._mergedSynced() }, undefined);
	}

	/** Remove a client's pushed customizations from this session. */
	removeClient(clientId: string): void {
		if (!this._byClient.delete(clientId)) {
			return;
		}
		this._state.set({ synced: this._mergedSynced() }, undefined);
	}
}

/**
 * Tracks "has the **client-pushed** customization snapshot changed
 * since the SDK was last (re)started against it?". Subscribes to
 * {@link SessionClientCustomizationsModel.state}, with the state
 * observable's equalsFn structurally comparing the meaningful
 * fields (URI list, nonce, status, user-visible
 * metadata). Same race semantics as `SessionClientToolsDiff`: a
 * write that lands during an in-flight rebind re-flips dirty via
 * the autorun, so callers don't need to snapshot-compare.
 *
 * The SDK captures `Options.plugins` at startup. Synced customization changes
 * mark the diff dirty, while reducer-backed enablement drift is detected by
 * comparing desired plugin paths with the last successfully applied paths.
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
	private _appliedPluginPaths: readonly URI[] = [];
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

	hasDifferenceFrom(pluginPaths: readonly URI[]): boolean {
		return this._dirty || !pluginPathsEqual(this._appliedPluginPaths, pluginPaths);
	}

	/**
	 * Record the resolved desired plugin paths and mark the current
	 * snapshot as applied. A subsequent write that changes any
	 * meaningful field re-flips dirty via the autorun. If the caller's
	 * downstream work (e.g. SDK rebind) fails, call {@link markDirty}
	 * to surface the stale state.
	 */
	consume(paths: readonly URI[]): readonly URI[] {
		this._appliedPluginPaths = paths;
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
	return syncedListEqual(a.synced, b.synced);
}

function syncedListEqual(a: readonly ISyncedCustomization[], b: readonly ISyncedCustomization[]): boolean {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		const ai = a[i].customization;
		const bi = b[i].customization;
		if (ai.id !== bi.id) {
			return false;
		}
		if (ai.uri !== bi.uri) {
			return false;
		}
		if ((ai as ClientPluginCustomization).nonce !== (bi as ClientPluginCustomization).nonce) {
			return false;
		}
		if (ai.name !== bi.name) {
			return false;
		}
		if (ai.enabled !== bi.enabled) {
			return false;
		}
		if (ai.load?.kind !== bi.load?.kind) {
			return false;
		}
		if (loadMessageOf(ai.load) !== loadMessageOf(bi.load)) {
			return false;
		}
		if (!childrenEqual(ai.children, bi.children)) {
			return false;
		}
		if (a[i].pluginDir?.toString() !== b[i].pluginDir?.toString()) {
			return false;
		}
	}
	return true;
}

function loadMessageOf(load: { kind: string; message?: string } | undefined): string | undefined {
	return load && load.message ? load.message : undefined;
}

function childrenEqual(a: readonly { id: string; name: string }[] | undefined, b: readonly { id: string; name: string }[] | undefined): boolean {
	if (a === b) {
		return true;
	}
	if (!a || !b || a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		if (a[i].id !== b[i].id || a[i].name !== b[i].name) {
			return false;
		}
	}
	return true;
}

function pluginPathsEqual(a: readonly URI[], b: readonly URI[]): boolean {
	return arraysEqual(a, b, (x, y) => x.toString() === y.toString());
}
