/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, ISettableObservable, observableValueOpts } from '../../../../../base/common/observable.js';
import type { ToolDefinition } from '../../../common/state/protocol/state.js';
import { ActiveClientToolSet, structuralToolsEqual } from '../../activeClientState.js';

/**
 * Pure state holder for the workbench-registered client-tool snapshots
 * contributed by potentially several active clients, keyed by `clientId`.
 * Exposes the merged tool set as a single {@link IObservable} (deduplicated
 * by name, first-inserted client wins) so consumers can react to changes
 * without polling, and {@link ownerOf} so tool calls can be routed back to
 * the contributing client.
 *
 * The `merged` observable dedupes structurally-equivalent writes: tool
 * snapshots compare on `name + description + inputSchema` (order-insensitive,
 * `undefined` equivalent to `[]`). A re-send of a structurally identical set
 * therefore does NOT fire downstream subscribers.
 *
 * Knows nothing about diffing or the SDK — pair with
 * {@link SessionClientToolsDiff} to track "has the merged snapshot changed
 * since the last successful SDK build".
 */
export class SessionClientToolsModel {

	private readonly _toolSet = new ActiveClientToolSet();
	private readonly _merged: ISettableObservable<readonly ToolDefinition[]> = observableValueOpts(
		{ owner: this, equalsFn: (a, b) => structuralToolsEqual(a, b) },
		[],
	);
	readonly merged: IObservable<readonly ToolDefinition[]> = this._merged;

	/** Replace `clientId`'s contributed tools (full replacement). */
	setTools(clientId: string, tools: readonly ToolDefinition[]): void {
		this._toolSet.set(clientId, tools);
		this._merged.set(this._toolSet.merged(), undefined);
	}

	/** This client's contributed tools (empty when absent). */
	getTools(clientId: string): readonly ToolDefinition[] {
		return this._toolSet.get(clientId);
	}

	/** Remove a client's tool contribution. */
	removeClient(clientId: string): void {
		if (this._toolSet.delete(clientId)) {
			this._merged.set(this._toolSet.merged(), undefined);
		}
	}

	/** The `clientId` that owns the tool named `toolName`, or `undefined`. */
	ownerOf(toolName: string, preferredClientId?: string): string | undefined {
		return this._toolSet.ownerOf(toolName, preferredClientId);
	}
}

/**
 * Tracks "has {@link SessionClientToolsModel.merged} changed since the
 * last successful {@link consume}?". Subscribes to the model's observable
 * and flips a private dirty bit on every change; {@link consume} captures
 * the current merged snapshot and clears the bit — preserving the C6 pin
 * invariant from the previous `ClientToolDiff` implementation: a `setTools`
 * call that races the in-flight builder re-flips the bit via the autorun, so
 * the next sendMessage detects the stale set and triggers another rebind.
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
	// Structural tool snapshot last marked applied (via {@link consume}).
	private _lastAppliedTools: readonly ToolDefinition[] = [];

	constructor() {
		super();
		this._register(autorun(reader => {
			const merged = this.model.merged.read(reader);
			if (this._ignoreNextFire) {
				this._ignoreNextFire = false;
				this._lastAppliedTools = merged;
				return;
			}
			if (!structuralToolsEqual(merged, this._lastAppliedTools)) {
				this._dirty = true;
			}
		}));
	}

	get hasDifference(): boolean {
		return this._dirty;
	}

	/**
	 * Read the current merged tool set and mark it as the applied snapshot.
	 * A subsequent {@link SessionClientToolsModel.setTools} re-flips dirty
	 * via the autorun, so callers do NOT need to compare snapshots
	 * themselves to detect a race. If the caller's downstream work
	 * (e.g. SDK rebuild) fails, call {@link markDirty} to surface the
	 * stale state so the next sendMessage retries.
	 */
	consume(): readonly ToolDefinition[] {
		const merged = this.model.merged.get();
		this._dirty = false;
		this._lastAppliedTools = merged;
		return merged;
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
