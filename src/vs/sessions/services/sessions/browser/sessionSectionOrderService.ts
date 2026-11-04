/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

/**
 * Service that owns the manual ordering of the sessions list's top-level
 * headers: top-level user-created groups relative to workspace sections, and to
 * the date sections when grouping by date. The groups service orders subgroups
 * within their group.
 *
 * The order is stored as one flat list of opaque identities (`group:<id>` for
 * groups, see `getSessionGroupSectionId`, `workspace:<label>` for workspace
 * sections, and `recent`/`older` for the date sections), from which the visible
 * headers resolve their relative order. It is purely local (persisted to
 * profile storage) and not synced to providers.
 * Identities the user has never moved fall back to a caller-provided default
 * order, so newly created groups / discovered workspaces appear in their
 * natural place until the user drags them.
 *
 * Workspaces additionally carry a *promotion* flag: once the user drags a
 * workspace it is promoted so it stays visible (escapes the "+N more workspaces"
 * capping) even if it would otherwise be hidden.
 */
export interface ISessionSectionOrderService {
	readonly _serviceBrand: undefined;

	/** Fires when the manual order or promotion set changes. */
	readonly onDidChange: Event<void>;

	/**
	 * Resolve the final top-to-bottom display order for `defaultOrderedIds`
	 * (the live identities to show, in their natural/default order). Identities
	 * with a persisted manual position keep it; not-yet-seen identities are
	 * woven in at their default position. Pure: never mutates or persists.
	 */
	resolveOrder(defaultOrderedIds: readonly string[]): string[];

	/**
	 * Apply a manual reorder. `visibleOrder` is the current resolved order of
	 * the reorderable identities the user sees; the dragged identity is moved
	 * before/after the target within it and the result is merged into the
	 * persisted order, preserving the relative position of identities that are
	 * not currently visible (e.g. hidden workspaces, or the other grouping
	 * mode's entries). When `promoteId` is given that identity is recorded as
	 * user-promoted.
	 */
	reorder(visibleOrder: readonly string[], draggedId: string, targetId: string, position: 'before' | 'after', promoteId?: string): void;

	/** Whether the identity has been explicitly promoted (moved) by the user. */
	isPromoted(id: string): boolean;

	/**
	 * Drop stored order/promotion entries that are not in `liveIds`. Persists
	 * (without firing {@link onDidChange}, since the visible order is unaffected)
	 * only when something was actually removed. Used to garbage-collect stale
	 * identities such as deleted groups or vanished workspaces.
	 */
	retain(liveIds: Iterable<string>): void;

	/**
	 * Capture the manual positions and promotion of `ids`, so that
	 * {@link restorePositions} can bring them back after {@link retain} dropped
	 * them, e.g. to undo deleting groups.
	 */
	capturePositions(ids: Iterable<string>): ISessionSectionPositions;

	/**
	 * Restore captured positions: an identity that is no longer ordered is
	 * re-inserted after the identity it followed when captured, while identities
	 * that are still ordered stay where they are.
	 */
	restorePositions(positions: ISessionSectionPositions): void;

	/**
	 * Give `id` the manual position of `formerId`, right after it, unless `id` has a manual
	 * position of its own, and promote `id` when `formerId` is promoted. `formerId` keeps its
	 * own, as another grouping mode may still show it. For a section whose identity changed.
	 */
	adoptPosition(formerId: string, id: string): void;
}

/** Manual positions captured by {@link ISessionSectionOrderService.capturePositions}. */
export interface ISessionSectionPositions {
	/** The captured identities. */
	readonly ids: readonly string[];
	/** The whole manual order when the positions were captured. */
	readonly order: readonly string[];
	/** The captured identities that were promoted. */
	readonly promoted: readonly string[];
}

export const ISessionSectionOrderService = createDecorator<ISessionSectionOrderService>('sessionSectionOrderService');

interface ISerializedState {
	readonly order: readonly string[];
	readonly promoted: readonly string[];
}

export class SessionSectionOrderService extends Disposable implements ISessionSectionOrderService {

	declare readonly _serviceBrand: undefined;

	private static readonly STORAGE_KEY = 'sessionsListControl.sectionOrder';

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _order: string[] = [];
	private _promoted = new Set<string>();

	constructor(
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		this.load();
	}

	resolveOrder(defaultOrderedIds: readonly string[]): string[] {
		return resolveSectionOrder(this._order, defaultOrderedIds);
	}

	reorder(visibleOrder: readonly string[], draggedId: string, targetId: string, position: 'before' | 'after', promoteId?: string): void {
		const visibleAfter = spliceSectionOrder(visibleOrder, draggedId, targetId, position);
		if (!visibleAfter) {
			return;
		}
		const next = mergeSectionOrder(this._order, visibleAfter);
		const orderChanged = !arraysEqual(next, this._order);
		const promoteChanged = promoteId !== undefined && !this._promoted.has(promoteId);
		if (!orderChanged && !promoteChanged) {
			return;
		}
		this._order = next;
		if (promoteId !== undefined) {
			this._promoted.add(promoteId);
		}
		this.save();
		this._onDidChange.fire();
	}

	isPromoted(id: string): boolean {
		return this._promoted.has(id);
	}

	retain(liveIds: Iterable<string>): void {
		const live = liveIds instanceof Set ? liveIds : new Set(liveIds);
		const order = this._order.filter(id => live.has(id));
		const promoted = [...this._promoted].filter(id => live.has(id));
		if (order.length === this._order.length && promoted.length === this._promoted.size) {
			return;
		}
		this._order = order;
		this._promoted = new Set(promoted);
		this.save();
	}

	capturePositions(ids: Iterable<string>): ISessionSectionPositions {
		const capturedIds = [...new Set(ids)];
		return { ids: capturedIds, order: [...this._order], promoted: capturedIds.filter(id => this._promoted.has(id)) };
	}

	restorePositions(positions: ISessionSectionPositions): void {
		const order = restoreSectionOrderPositions(this._order, positions.order, new Set(positions.ids));
		const promotedRestored = positions.promoted.filter(id => !this._promoted.has(id));
		if (arraysEqual(order, this._order) && promotedRestored.length === 0) {
			return;
		}
		this._order = order;
		for (const id of promotedRestored) {
			this._promoted.add(id);
		}
		this.save();
		this._onDidChange.fire();
	}

	adoptPosition(formerId: string, id: string): void {
		const formerIndex = this._order.indexOf(formerId);
		const adoptsPosition = formerIndex !== -1 && !this._order.includes(id);
		const adoptsPromotion = this._promoted.has(formerId) && !this._promoted.has(id);
		if (!adoptsPosition && !adoptsPromotion) {
			return;
		}
		if (adoptsPosition) {
			this._order = [...this._order.slice(0, formerIndex + 1), id, ...this._order.slice(formerIndex + 1)];
		}
		if (adoptsPromotion) {
			this._promoted.add(id);
		}
		this.save();
		this._onDidChange.fire();
	}

	// -- Storage --

	private load(): void {
		const raw = this.storageService.get(SessionSectionOrderService.STORAGE_KEY, StorageScope.PROFILE);
		if (!raw) {
			return;
		}
		try {
			const parsed = JSON.parse(raw) as Partial<ISerializedState>;
			if (Array.isArray(parsed.order)) {
				this._order = parsed.order.filter((id): id is string => typeof id === 'string');
			}
			if (Array.isArray(parsed.promoted)) {
				this._promoted = new Set(parsed.promoted.filter((id): id is string => typeof id === 'string'));
			}
		} catch {
			// ignore corrupt data
		}
	}

	private save(): void {
		if (this._order.length === 0 && this._promoted.size === 0) {
			this.storageService.remove(SessionSectionOrderService.STORAGE_KEY, StorageScope.PROFILE);
			return;
		}
		const state: ISerializedState = { order: this._order, promoted: [...this._promoted] };
		this.storageService.store(SessionSectionOrderService.STORAGE_KEY, JSON.stringify(state), StorageScope.PROFILE, StorageTarget.USER);
	}
}

//#region Pure helpers for manually ordered lists (also used for the order of subgroups)

/**
 * Combine a persisted manual order with a default order. Identities present in
 * `persisted` keep their relative manual order; identities only in
 * `defaultOrderedIds` are inserted at their default position (after their
 * nearest preceding default neighbour that is already placed). Stale persisted
 * identities not in `defaultOrderedIds` are dropped from the result.
 */
export function resolveSectionOrder(persisted: readonly string[], defaultOrderedIds: readonly string[]): string[] {
	const live = new Set(defaultOrderedIds);
	const result: string[] = persisted.filter(id => live.has(id));
	const placed = new Set(result);
	for (let i = 0; i < defaultOrderedIds.length; i++) {
		const id = defaultOrderedIds[i];
		if (placed.has(id)) {
			continue;
		}
		let insertAt = 0;
		for (let j = i - 1; j >= 0; j--) {
			const idx = result.indexOf(defaultOrderedIds[j]);
			if (idx !== -1) {
				insertAt = idx + 1;
				break;
			}
		}
		result.splice(insertAt, 0, id);
		placed.add(id);
	}
	return result;
}

/**
 * Move `draggedId` before/after `targetId` within `order`. Returns the new
 * array, or `undefined` when the target is not present.
 */
export function spliceSectionOrder(order: readonly string[], draggedId: string, targetId: string, position: 'before' | 'after'): string[] | undefined {
	const without = order.filter(id => id !== draggedId);
	const targetIndex = without.indexOf(targetId);
	if (targetIndex === -1) {
		return undefined;
	}
	const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
	without.splice(insertIndex, 0, draggedId);
	return without;
}

/**
 * Merge a new order for a subset of identities (`visibleAfter`) into the full
 * persisted order. Identities not in `visibleAfter` keep their relative
 * position by staying anchored to the visible identity they previously
 * followed (or the head, if they preceded all visible identities).
 */
export function mergeSectionOrder(persisted: readonly string[], visibleAfter: readonly string[]): string[] {
	const scope = new Set(visibleAfter);
	const head: string[] = [];
	const trailing = new Map<string, string[]>();
	let lastInScope: string | undefined;
	for (const id of persisted) {
		if (scope.has(id)) {
			lastInScope = id;
			continue;
		}
		if (lastInScope === undefined) {
			head.push(id);
		} else {
			let arr = trailing.get(lastInScope);
			if (!arr) {
				arr = [];
				trailing.set(lastInScope, arr);
			}
			arr.push(id);
		}
	}
	const result: string[] = [...head];
	for (const id of visibleAfter) {
		result.push(id);
		const t = trailing.get(id);
		if (t) {
			result.push(...t);
		}
	}
	return result;
}

/**
 * Re-insert the `ids` that `captured` ordered but `current` no longer does, each
 * after the identity it followed in `captured` (or first, when none of the
 * identities it followed are still in the result).
 */
export function restoreSectionOrderPositions(current: readonly string[], captured: readonly string[], ids: ReadonlySet<string>): string[] {
	const result = [...current];
	const placed = new Set(result);
	for (let i = 0; i < captured.length; i++) {
		const id = captured[i];
		if (!ids.has(id) || placed.has(id)) {
			continue;
		}
		let insertAt = 0;
		for (let j = i - 1; j >= 0; j--) {
			const index = result.indexOf(captured[j]);
			if (index !== -1) {
				insertAt = index + 1;
				break;
			}
		}
		result.splice(insertAt, 0, id);
		placed.add(id);
	}
	return result;
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			return false;
		}
	}
	return true;
}

//#endregion

registerSingleton(ISessionSectionOrderService, SessionSectionOrderService, InstantiationType.Delayed);
