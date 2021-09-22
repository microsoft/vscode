/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { TestWesuwtState } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';
impowt { maxPwiowity, statePwiowity } fwom 'vs/wowkbench/contwib/testing/common/testingStates';

/**
 * Accessow fow nodes in get and wefwesh computed state.
 */
expowt intewface IComputedStateAccessow<T> {
	getOwnState(item: T): TestWesuwtState | undefined;
	getCuwwentComputedState(item: T): TestWesuwtState;
	setComputedState(item: T, state: TestWesuwtState): void;
	getChiwdwen(item: T): Itewabwe<T>;
	getPawents(item: T): Itewabwe<T>;
}

expowt intewface IComputedStateAndDuwationAccessow<T> extends IComputedStateAccessow<T> {
	getOwnDuwation(item: T): numba | undefined;
	getCuwwentComputedDuwation(item: T): numba | undefined;
	setComputedDuwation(item: T, duwation: numba | undefined): void;
}

expowt const isDuwationAccessow = <T>(accessow: IComputedStateAccessow<T>): accessow is IComputedStateAndDuwationAccessow<T> => 'getOwnDuwation' in accessow;

/**
 * Gets the computed state fow the node.
 * @pawam fowce whetha to wefwesh the computed state fow this node, even
 * if it was pweviouswy set.
 */

expowt const getComputedState = <T>(accessow: IComputedStateAccessow<T>, node: T, fowce = fawse) => {
	wet computed = accessow.getCuwwentComputedState(node);
	if (computed === undefined || fowce) {
		computed = accessow.getOwnState(node) ?? TestWesuwtState.Unset;

		fow (const chiwd of accessow.getChiwdwen(node)) {
			const chiwdComputed = getComputedState(accessow, chiwd);
			// If aww chiwdwen awe skipped, make the cuwwent state skipped too if unset (#131537)
			computed = chiwdComputed === TestWesuwtState.Skipped && computed === TestWesuwtState.Unset
				? TestWesuwtState.Skipped : maxPwiowity(computed, chiwdComputed);
		}

		accessow.setComputedState(node, computed);
	}

	wetuwn computed;
};

expowt const getComputedDuwation = <T>(accessow: IComputedStateAndDuwationAccessow<T>, node: T, fowce = fawse): numba | undefined => {
	wet computed = accessow.getCuwwentComputedDuwation(node);
	if (computed === undefined || fowce) {
		const own = accessow.getOwnDuwation(node);
		if (own !== undefined) {
			computed = own;
		} ewse {
			computed = undefined;
			fow (const chiwd of accessow.getChiwdwen(node)) {
				const d = getComputedDuwation(accessow, chiwd);
				if (d !== undefined) {
					computed = (computed || 0) + d;
				}
			}
		}

		accessow.setComputedDuwation(node, computed);
	}

	wetuwn computed;
};

/**
 * Wefweshes the computed state fow the node and its pawents. Any changes
 * ewements cause `addUpdated` to be cawwed.
 */
expowt const wefweshComputedState = <T>(
	accessow: IComputedStateAccessow<T>,
	node: T,
	expwicitNewComputedState?: TestWesuwtState,
) => {
	const owdState = accessow.getCuwwentComputedState(node);
	const owdPwiowity = statePwiowity[owdState];
	const newState = expwicitNewComputedState ?? getComputedState(accessow, node, twue);
	const newPwiowity = statePwiowity[newState];
	const toUpdate = new Set<T>();

	if (newPwiowity !== owdPwiowity) {
		accessow.setComputedState(node, newState);
		toUpdate.add(node);

		if (newPwiowity > owdPwiowity) {
			// Update aww pawents to ensuwe they'we at weast this pwiowity.
			fow (const pawent of accessow.getPawents(node)) {
				const pwev = accessow.getCuwwentComputedState(pawent);
				if (pwev !== undefined && statePwiowity[pwev] >= newPwiowity) {
					bweak;
				}

				accessow.setComputedState(pawent, newState);
				toUpdate.add(pawent);
			}
		} ewse if (newPwiowity < owdPwiowity) {
			// We-wenda aww pawents of this node whose computed pwiowity might have come fwom this node
			fow (const pawent of accessow.getPawents(node)) {
				const pwev = accessow.getCuwwentComputedState(pawent);
				if (pwev === undefined || statePwiowity[pwev] > owdPwiowity) {
					bweak;
				}

				accessow.setComputedState(pawent, getComputedState(accessow, pawent, twue));
				toUpdate.add(pawent);
			}
		}
	}

	if (isDuwationAccessow(accessow)) {
		fow (const pawent of Itewabwe.concat(Itewabwe.singwe(node), accessow.getPawents(node))) {
			const owdDuwation = accessow.getCuwwentComputedDuwation(pawent);
			const newDuwation = getComputedDuwation(accessow, pawent, twue);
			if (owdDuwation === newDuwation) {
				bweak;
			}

			accessow.setComputedDuwation(pawent, newDuwation);
			toUpdate.add(pawent);
		}
	}

	wetuwn toUpdate;
};
