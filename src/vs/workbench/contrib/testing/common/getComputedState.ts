/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterable } from '../../../../base/common/iterator.js';
import { TestResultState } from './testTypes.js';
import { makeEmptyCounts, maxPriority, statePriority } from './testingStates.js';

/**
 * Accessor for nodes in get and refresh computed state.
 */
export interface IComputedStateAccessor<T> {
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

const getComputedState = <T extends object>(accessor: IComputedStateAccessor<T>, node: T, force = false) => {
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
			largeNodeChildrenStates.set(node, stateMap);
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
		} else {
			computed = undefined;
			for (const child of accessor.getChildren(node)) {
				const d = getComputedDuration(accessor, child);
				if (d !== undefined) {
					computed = (computed || 0) + d;
				}
			}
		}

		accessor.setComputedDuration(node, computed);
	}

	return computed;
};

const LARGE_NODE_THRESHOLD = 64;

/**
 * Map of how many nodes have in each state. This is used to optimize state
 * computation in large nodes with children above the `LARGE_NODE_THRESHOLD`.
 */
const largeNodeChildrenStates = new WeakMap<object, { [K in TestResultState]: number }>();

/**
 * Refreshes the computed state for the node and its parents. Any changes
 * elements cause `addUpdated` to be called.
 */
export const refreshComputedState = <T extends object>(
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
			const lnm = largeNodeChildrenStates.get(parent);
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

				moveToState = getComputedState(accessor, parent, true);
				accessor.setComputedState(parent, moveToState);
				toUpdate.add(parent);
			}

			moveFromState = prev;
		}
	}

	if (isDurationAccessor(accessor) && refreshDuration) {
		for (const parent of Iterable.concat(Iterable.single(node), accessor.getParents(node))) {
			const oldDuration = accessor.getCurrentComputedDuration(parent);
			const newDuration = getComputedDuration(accessor, parent, true);
			if (oldDuration === newDuration) {
				break;
			}

			accessor.setComputedDuration(parent, newDuration);
			toUpdate.add(parent);
		}
	}

	return toUpdate;
};
