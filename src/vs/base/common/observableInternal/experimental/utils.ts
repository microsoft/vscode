/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, IReader } from '../base.js';
import { BugIndicatingError, DisposableStore } from '../commonFacade/deps.js';
import { DebugOwner, getDebugName, DebugNameData } from '../debugName.js';
import { observableFromEvent } from '../observables/observableFromEvent.js';
import { autorunOpts } from '../reactions/autorun.js';
import { derivedObservableWithCache } from '../utils/utils.js';

/**
 * Creates an observable that has the latest changed value of the given observables.
 * Initially (and when not observed), it has the value of the last observable.
 * When observed and any of the observables change, it has the value of the last changed observable.
 * If multiple observables change in the same transaction, the last observable wins.
*/
export function latestChangedValue<T extends IObservable<any>[]>(owner: DebugOwner, observables: T): IObservable<ReturnType<T[number]['get']>> {
	if (observables.length === 0) {
		throw new BugIndicatingError();
	}

	let hasLastChangedValue = false;
	let lastChangedValue: unknown = undefined;

	const result = observableFromEvent<any, void>(owner, cb => {
		const store = new DisposableStore();
		for (const o of observables) {
			store.add(autorunOpts({ debugName: () => getDebugName(result, new DebugNameData(owner, undefined, undefined)) + '.updateLastChangedValue' }, reader => {
				hasLastChangedValue = true;
				lastChangedValue = o.read(reader);
				cb();
			}));
		}
		store.add({
			dispose() {
				hasLastChangedValue = false;
				lastChangedValue = undefined;
			},
		});
		return store;
	}, () => {
		if (hasLastChangedValue) {
			return lastChangedValue;
		} else {
			return observables[observables.length - 1].get();
		}
	});
	return result;
}

/**
 * Works like a derived.
 * However, if the value is not undefined, it is cached and will not be recomputed anymore.
 * In that case, the derived will unsubscribe from its dependencies.
*/
export function derivedConstOnceDefined<T>(owner: DebugOwner, fn: (reader: IReader) => T): IObservable<T | undefined> {
	return derivedObservableWithCache<T | undefined>(owner, (reader, lastValue) => lastValue ?? fn(reader));
}
