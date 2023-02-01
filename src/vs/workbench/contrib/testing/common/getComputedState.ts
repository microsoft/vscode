/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { findFirstInSorted } from 'vs/base/common/arrays';
import { Iterable } from 'vs/base/common/iterator';
import { ITestTaskTimeRange, TestResultState } from 'vs/workbench/contrib/testing/common/testTypes';
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
	getOwnTime(item: T): ITestTaskTimeRange | undefined;
	getCurrentComputedDuration(item: T): number | undefined;
	setComputedDuration(item: T, time: number): void;
}

const isDurationAccessor = <T>(accessor: IComputedStateAccessor<T>): accessor is IComputedStateAndDurationAccessor<T> => 'getOwnTime' in accessor;

/**
 * Gets the computed state for the node.
 * @param force whether to refresh the computed state for this node, even
 * if it was previously set.
 */

const getComputedState = <T>(accessor: IComputedStateAccessor<T>, node: T, force = false) => {
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


const cachedComputedTime = new WeakMap<object, { ranges: readonly ITestTaskTimeRange[]; duration: number }>();

const getComputedTime = <T>(accessor: IComputedStateAndDurationAccessor<T>, node: T, force = false): { ranges: readonly ITestTaskTimeRange[]; duration: number } => {
	if (!force) {
		const cached = cachedComputedTime.get(node as object);
		if (cached) {
			return cached;
		}
	}

	const own = accessor.getOwnTime(node);
	if (own !== undefined) {
		const duration = own.to - own.from;
		accessor.setComputedDuration(node, duration);
		return { ranges: [own], duration };
	} else {
		const children: ITestTaskTimeRange[] = [];
		for (const child of accessor.getChildren(node)) {
			for (const range of getComputedTime(accessor, child).ranges) {
				// merge interval:
				const fromI = findFirstInSorted(children, c => c.to >= range.from);
				if (fromI === children.length) {
					children.push(range);
					continue;
				}

				const fi = children[fromI];
				if (fi.from > range.to) {
					children.splice(fromI, 0, range);
					continue;
				}

				let toI = fromI + 1;
				while (toI < children.length && children[toI].from < range.to) {
					toI++;
				}

				children.splice(fromI, toI - fromI, {
					from: Math.min(fi.from, range.from),
					to: Math.max(children[toI - 1].to, range.to)
				});
			}
		}

		let duration = 0;
		for (const range of children) {
			duration += range.to - range.from;
		}

		accessor.setComputedDuration(node, duration);
		const ret = { ranges: children, duration };
		cachedComputedTime.set(node as object, ret);
		return ret;
	}
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
			const newDuration = getComputedTime(accessor, parent, true).duration;
			if (oldDuration === newDuration) {
				break;
			}

			accessor.setComputedDuration(parent, newDuration);
			toUpdate.add(parent);
		}
	}

	return toUpdate;
};
