/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import { autorun, IObservable, ISettableObservable, observableValueOpts } from '../../../../../base/common/observable.js';
import type { ToolDefinition } from '../../../common/state/protocol/state.js';

/**
 * Combined snapshot of the workbench-registered client-tool definitions
 * and the workbench `clientId` that owns them. The two travel as one
 * value so consumers can read both with a single `.get()` and so that an
 * update to either field is observed as a single change.
 */
export interface ISessionClientToolsState {
	readonly tools: readonly ToolDefinition[] | undefined;
	readonly clientId: string | undefined;
}

const INITIAL_STATE: ISessionClientToolsState = { tools: undefined, clientId: undefined };

/**
 * Pure state holder for the workbench-registered client-tool snapshot
 * and the workbench `clientId` that owns it. Exposes the pair as a
 * single {@link IObservable} so consumers can react to changes without
 * polling.
 *
 * The `state` observable dedupes structurally-equivalent writes: tool
 * snapshots compare on `name + description + inputSchema`
 * (order-insensitive, `undefined` equivalent to `[]`); `clientId` compares strictly.
 * A re-send of the same `(tools, clientId)` pair therefore does NOT fire
 * downstream subscribers.
 *
 * Knows nothing about diffing or the SDK — pair with
 * {@link SessionClientToolsDiff} to track "has the snapshot changed
 * since the last successful SDK build".
 */
export class SessionClientToolsModel {

	private readonly _state: ISettableObservable<ISessionClientToolsState> = observableValueOpts(
		{ owner: this, equalsFn: stateEqual },
		INITIAL_STATE,
	);
	readonly state: IObservable<ISessionClientToolsState> = this._state;

	setTools(tools: readonly ToolDefinition[] | undefined, clientId?: string): void {
		const current = this._state.get();
		this._state.set({
			tools,
			clientId: clientId ?? current.clientId,
		}, undefined);
	}
}

/**
 * Tracks "has {@link SessionClientToolsModel.state} changed since the
 * last successful {@link build}?". Subscribes to the model's observable
 * and flips a private dirty bit on every change; {@link build} captures
 * the current snapshot, hands it to the supplied builder, and clears
 * the bit on success — preserving the C6 pin invariant from the
 * previous `ClientToolDiff` implementation: a `setTools` call that
 * races the in-flight builder re-flips the bit via the autorun, so the
 * next sendMessage detects the stale set and triggers another rebind.
 *
 * On builder throw the bit is left set — the SDK is still running with
 * the previous snapshot, so the next sendMessage should retry.
 */
export class SessionClientToolsDiff extends Disposable {

	readonly model: SessionClientToolsModel = new SessionClientToolsModel();

	private _dirty = false;
	// `autorun` invokes its callback once at registration for dependency
	// tracking. Skip that initial run so a brand-new diff doesn't report
	// dirty before any `setTools` has happened.
	private _ignoreNextFire = true;

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
	 * Read the current state and mark it as the applied snapshot. A
	 * subsequent {@link SessionClientToolsModel.setTools} re-flips dirty
	 * via the autorun, so callers do NOT need to compare snapshots
	 * themselves to detect a race. If the caller's downstream work
	 * (e.g. SDK rebuild) fails, call {@link markDirty} to surface the
	 * stale state so the next sendMessage retries.
	 */
	consume(): ISessionClientToolsState {
		const state = this.model.state.get();
		this._dirty = false;
		return state;
	}

	/**
	 * Force the dirty bit on. Use when a caller's async work that
	 * followed {@link consume} failed and the SDK is therefore still on
	 * the previous snapshot.
	 */
	markDirty(): void {
		this._dirty = true;
	}
}

function stateEqual(a: ISessionClientToolsState, b: ISessionClientToolsState): boolean {
	return a.clientId === b.clientId && snapshotsEqual(a.tools, b.tools);
}

/**
 * Deep-equal two client-tool snapshots on `name + description + inputSchema`.
 * `undefined` and `[]` compare equal. Order-insensitive.
 */
function snapshotsEqual(
	a: readonly ToolDefinition[] | undefined,
	b: readonly ToolDefinition[] | undefined
): boolean {
	const aa = a ?? [];
	const bb = b ?? [];
	if (aa.length !== bb.length) {
		return false;
	}
	const byName = new Map<string, ToolDefinition>();
	for (const t of aa) {
		byName.set(t.name, t);
	}
	for (const t of bb) {
		const prev = byName.get(t.name);
		if (!prev) {
			return false;
		}
		if (prev.description !== t.description) {
			return false;
		}
		if (!equals(prev.inputSchema, t.inputSchema)) {
			return false;
		}
	}
	return true;
}
