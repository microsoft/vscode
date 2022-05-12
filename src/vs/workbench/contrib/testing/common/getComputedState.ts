/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterable } from 'vs/base/common/iterator';
import { TestResultState } from 'vs/workbench/contrib/testing/common/testTypes';
import { maxPriority, statePriority } from 'vs/workbench/contrib/testing/common/testingStates';

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

export const isDurationAccessor = <T>(accessor: IComputedStateAccessor<T>): accessor is IComputedStateAndDurationAccessor<T> => 'getOwnDuration' in accessor;

/**
 * Gets the computed state for the node.
 * @param force whether to refresh the computed state for this node, even
 * if it was previously set.
 */

export const getComputedState = <T>(accessor: IComputedStateAccessor<T>, node: T, force = false) => {
	let computed = accessor.getCurrentComputedState(node);
	if (computed === undefined || force) {
		computed = accessor.getOwnState(node) ?? TestResultState.Unset;

		for (const child of accessor.getChildren(node)) {
			const childComputed = getComputedState(accessor, child);
			// If all children are skipped, make the current state skipped too if unset (#131537)
			computed = childComputed === TestResultState.Skipped && computed === TestResultState.Unset
				? TestResultState.Skipped : maxPriority(computed, childComputed);
		}

		accessor.setComputedState(node, computed);
	}

	return computed;
};

export const getComputedDuration = <T>(accessor: IComputedStateAndDurationAccessor<T>, node: T, force = false): number | undefined => {
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

		if (newPriority > oldPriority) {
			// Update all parents to ensure they're at least this priority.
			for (const parent of accessor.getParents(node)) {
				const prev = accessor.getCurrentComputedState(parent);
				if (prev !== undefined && statePriority[prev] >= newPriority) {
					break;
				}

				accessor.setComputedState(parent, newState);
				toUpdate.add(parent);
			}
		} else if (newPriority < oldPriority) {
			// Re-render all parents of this node whose computed priority might have come from this node
			for (const parent of accessor.getParents(node)) {
				const prev = accessor.getCurrentComputedState(parent);
				if (prev === undefined || statePriority[prev] > oldPriority) {
					break;
				}

				accessor.setComputedState(parent, getComputedState(accessor, parent, true));
				toUpdate.add(parent);
			}
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
