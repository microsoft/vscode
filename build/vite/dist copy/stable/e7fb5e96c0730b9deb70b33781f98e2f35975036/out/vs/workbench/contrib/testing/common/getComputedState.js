/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Iterable } from '../../../../base/common/iterator.js';
import { makeEmptyCounts, maxPriority, statePriority } from './testingStates.js';
const isDurationAccessor = (accessor) => 'getOwnDuration' in accessor;
/**
 * Gets the computed state for the node.
 * @param force whether to refresh the computed state for this node, even
 * if it was previously set.
 */
const getComputedState = (accessor, node, force = false) => {
    let computed = accessor.getCurrentComputedState(node);
    if (computed === undefined || force) {
        computed = accessor.getOwnState(node) ?? 0 /* TestResultState.Unset */;
        let childrenCount = 0;
        const stateMap = makeEmptyCounts();
        for (const child of accessor.getChildren(node)) {
            const childComputed = getComputedState(accessor, child);
            childrenCount++;
            stateMap[childComputed]++;
            // If all children are skipped, make the current state skipped too if unset (#131537)
            computed = childComputed === 5 /* TestResultState.Skipped */ && computed === 0 /* TestResultState.Unset */
                ? 5 /* TestResultState.Skipped */ : maxPriority(computed, childComputed);
        }
        if (childrenCount > LARGE_NODE_THRESHOLD) {
            largeNodeChildrenStates.set(node, stateMap);
        }
        accessor.setComputedState(node, computed);
    }
    return computed;
};
const getComputedDuration = (accessor, node, force = false) => {
    let computed = accessor.getCurrentComputedDuration(node);
    if (computed === undefined || force) {
        const own = accessor.getOwnDuration(node);
        if (own !== undefined) {
            computed = own;
        }
        else {
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
const largeNodeChildrenStates = new WeakMap();
/**
 * Refreshes the computed state for the node and its parents. Any changes
 * elements cause `addUpdated` to be called.
 */
export const refreshComputedState = (accessor, node, explicitNewComputedState, refreshDuration = true) => {
    const oldState = accessor.getCurrentComputedState(node);
    const oldPriority = statePriority[oldState];
    const newState = explicitNewComputedState ?? getComputedState(accessor, node, true);
    const newPriority = statePriority[newState];
    const toUpdate = new Set();
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
            }
            else /* newProirity < oldPriority */ {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0Q29tcHV0ZWRTdGF0ZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvY29tbW9uL2dldENvbXB1dGVkU3RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRS9ELE9BQU8sRUFBRSxlQUFlLEVBQUUsV0FBVyxFQUFFLGFBQWEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBbUJqRixNQUFNLGtCQUFrQixHQUFHLENBQUksUUFBbUMsRUFBb0QsRUFBRSxDQUFDLGdCQUFnQixJQUFJLFFBQVEsQ0FBQztBQUV0Sjs7OztHQUlHO0FBRUgsTUFBTSxnQkFBZ0IsR0FBRyxDQUFtQixRQUFtQyxFQUFFLElBQU8sRUFBRSxLQUFLLEdBQUcsS0FBSyxFQUFFLEVBQUU7SUFDMUcsSUFBSSxRQUFRLEdBQUcsUUFBUSxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3RELElBQUksUUFBUSxLQUFLLFNBQVMsSUFBSSxLQUFLLEVBQUUsQ0FBQztRQUNyQyxRQUFRLEdBQUcsUUFBUSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsaUNBQXlCLENBQUM7UUFFL0QsSUFBSSxhQUFhLEdBQUcsQ0FBQyxDQUFDO1FBQ3RCLE1BQU0sUUFBUSxHQUFHLGVBQWUsRUFBRSxDQUFDO1FBRW5DLEtBQUssTUFBTSxLQUFLLElBQUksUUFBUSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ2hELE1BQU0sYUFBYSxHQUFHLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUN4RCxhQUFhLEVBQUUsQ0FBQztZQUNoQixRQUFRLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztZQUUxQixxRkFBcUY7WUFDckYs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