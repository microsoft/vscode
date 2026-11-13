/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterable } from '../../../../base/common/iterator.js';
import { TestResultState } from './testTypes.js';
import { makeEmptyCounts, maxPriority, statePriority, statesInOrder } from './testingStates.js';

/** Cached child aggregates, owned by the node whose children they describe. */
export class ComputedStateCache {
	/** State counts for nodes above LARGE_NODE_THRESHOLD. */
	public childrenStates?: { [K in TestResultState]: number };
	public childrenWithDuration?: number;
}

/**
 * Accessor for nodes in get and refresh computed state.
 */
export interface IComputedStateAccessor<T> {
	getCache(item: T): ComputedStateCache;
	getOwnState(item: T): TestResultState | undefined;
	getCurrentComputedState(item: T): TestResultState;
	setComputedState(item: T, state: TestResultState): void;
	getChildren(item: T): Iterable<T>;
	getParents(item: T): Iterable<T>;
}

export interface IComputedStateAndDurationAccessor<T> extends IComputedStateAccessor<T> {
	getOwnDuration(item: T): number | undefined;
	getCurrentComputedDuration(item: T): number | undefined;
	setComputedDuration(item: T, duration: number | undefined): void;
}

const isDurationAccessor = <T>(accessor: IComputedStateAccessor<T>): accessor is IComputedStateAndDurationAccessor<T> => 'getOwnDuration' in accessor;

/**
 * Gets the computed state for the node.
 * @param force whether to refresh the computed state for this node, even
 * if it was previously set.
 */

const getComputedState = <T>(accessor: IComputedStateAccessor<T>, node: T, force = false) => {
	let computed = accessor.getCurrentComputedState(node);
	if (computed === undefined || force) {
		computed = accessor.getOwnState(node) ?? TestResultState.Unset;

		let childrenCount = 0;
		const stateMap = makeEmptyCounts();

		for (const child of accessor.getChildren(node)) {
			const childComputed = getComputedState(accessor, child);
			childrenCount++;
			stateMap[childComputed]++;

			// If all children are skipped, make the current state skipped too if unset (#131537)
			computed = childComputed === TestResultState.Skipped && computed === TestResultState.Unset
				? TestResultState.Skipped : maxPriority(computed, childComputed);
		}

		if (childrenCount > LARGE_NODE_THRESHOLD) {
			accessor.getCache(node).childrenStates = stateMap;
		} else {
			accessor.getCache(node).childrenStates = undefined;
		}

		accessor.setComputedState(node, computed);
	}

	return computed;
};

const getComputedDuration = <T>(accessor: IComputedStateAndDurationAccessor<T>, node: T, force = false): number | undefined => {
	let computed = accessor.getCurrentComputedDuration(node);
	if (computed === undefined || force) {
		const own = accessor.getOwnDuration(node);
		if (own !== undefined) {
			computed = own;
			accessor.getCache(node).childrenWithDuration = undefined;
		} else {
			computed = undefined;
			let childrenWithDuration = 0;
			for (const child of accessor.getChildren(node)) {
				const d = getComputedDuration(accessor, child);
				if (d !== undefined) {
					childrenWithDuration++;
					computed = (computed || 0) + d;
				}
			}
			accessor.getCache(node).childrenWithDuration = childrenWithDuration;
		}

		accessor.setComputedDuration(node, computed);
	}

	return computed;
};

/** Updates the parent's cached duration aggregate, rebuilding it when necessary. */
const getNewDurationCached = <T>(
	accessor: IComputedStateAndDurationAccessor<T>,
	parent: T,
	oldDuration: number | undefined,
	previousChildDuration: number | undefined,
	childDuration: number | undefined,
): number | undefined => {
	const cache = accessor.getCache(parent);
	const childCount = cache.childrenWithDuration;
	if (childCount !== undefined && accessor.getOwnDuration(parent) === undefined
		&& Number.isFinite(oldDuration ?? 0) && Number.isFinite(previousChildDuration ?? 0) && Number.isFinite(childDuration ?? 0)) {
		const newChildCount = childCount + Number(childDuration !== undefined) - Number(previousChildDuration !== undefined);
		cache.childrenWithDuration = newChildCount;
		return newChildCount ? (oldDuration ?? 0) - (previousChildDuration ?? 0) + (childDuration ?? 0) : undefined;
	}

	return getComputedDuration(accessor, parent, true);
};

const LARGE_NODE_THRESHOLD = 64;

/**
 * Refreshes the computed state for the node and its parents. Any changes
 * elements cause `addUpdated` to be called.
 */
export const refreshComputedState = <T>(
	accessor: IComputedStateAccessor<T>,
	node: T,
	explicitNewComputedState?: TestResultState,
	refreshDuration = true,
) => {
	const oldState = accessor.getCurrentComputedState(node);
	const oldPriority = statePriority[oldState];
	const newState = explicitNewComputedState ?? getComputedState(accessor, node, true);
	const newPriority = statePriority[newState];
	const toUpdate = new Set<T>();

	if (newPriority !== oldPriority) {
		accessor.setComputedState(node, newState);
		toUpdate.add(node);

		let moveFromState = oldState;
		let moveToState = newState;

		for (const parent of accessor.getParents(node)) {
			const lnm = accessor.getCache(parent).childrenStates;
			if (lnm) {
				lnm[moveFromState]--;
				lnm[moveToState]++;
			}

			const prev = accessor.getCurrentComputedState(parent);
			if (newPriority > oldPriority) {
				// Update all parents to ensure they're at least this priority.
				if (prev !== undefined && statePriority[prev] >= newPriority) {
					break;
				}

				if (lnm && lnm[moveToState] > 1) {
					break;
				}

				// moveToState remains the same, the new higher priority node state
				accessor.setComputedState(parent, newState);
				toUpdate.add(parent);
			} else /* newProirity < oldPriority */ {
				// Update all parts whose statese might have been based on this one
				if (prev === undefined || statePriority[prev] > oldPriority) {
					break;
				}

				if (lnm && lnm[moveFromState] > 0) {
					break;
				}

				moveToState = lnm
					? maxPriority(accessor.getOwnState(parent) ?? TestResultState.Unset, statesInOrder.find(state => lnm[state] > 0) ?? TestResultState.Unset)
					: getComputedState(accessor, parent, true);
				accessor.setComputedState(parent, moveToState);
				toUpdate.add(parent);
			}

			moveFromState = prev;
		}
	}

	if (isDurationAccessor(accessor) && refreshDuration) {
		let previousChildDuration: number | undefined;
		let childDuration: number | undefined;
		for (const parent of Iterable.concat(Iterable.single(node), accessor.getParents(node))) {
			const oldDuration = accessor.getCurrentComputedDuration(parent);
			const newDuration = parent === node
				? getComputedDuration(accessor, parent, true)
				: getNewDurationCached(accessor, parent, oldDuration, previousChildDuration, childDuration);
			if (oldDuration === newDuration) {
				break;
			}

			accessor.setComputedDuration(parent, newDuration);
			toUpdate.add(parent);
			previousChildDuration = oldDuration;
			childDuration = newDuration;
		}
	}

	return toUpdate;
};
