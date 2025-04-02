/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EqualityComparer, strictEquals } from '../equals.js';
import { IObservable, IObservableWithChange } from './base.js';
import { IChangeTracker } from './changeTracker.js';
import { DebugNameData, DebugOwner } from './debugName.js';
import { Derived, IDerivedReader } from './derived.js';

export interface IReducerOptions<T, TChangeSummary = void, TOutChange = void> {
	/**
	 * Is called to create the initial value of the observable when it becomes observed.
	*/
	initial: T | (() => T);
	/**
	 * Is called to dispose the observable value when it is no longer observed.
	*/
	disposeFinal?(value: T): void;
	changeTracker?: IChangeTracker<TChangeSummary>;
	equalityComparer?: EqualityComparer<T>;
	/**
	 * Applies the changes to the value.
	 * Use `reader.reportChange` to report change details or to report a change if the same value is returned.
	*/
	update(reader: IDerivedReader<TOutChange>, previousValue: T, changes: TChangeSummary): T;
}

/**
 * Creates an observable value that is based on values and changes from other observables.
 * Additionally, a reducer can report how that state changed.
*/
export function observableReducer<T, TInChanges, TOutChange = void>(owner: DebugOwner, options: IReducerOptions<T, TInChanges, TOutChange>): SimplifyObservableWithChange<T, TOutChange> {
	let prevValue: T | undefined = undefined;
	let hasValue = false;

	return new Derived(
		new DebugNameData(owner, undefined, options.update),
		(reader: IDerivedReader<TOutChange>, changeSummary) => {
			if (!hasValue) {
				prevValue = options.initial instanceof Function ? options.initial() : options.initial;
				hasValue = true;
			}
			const newValue = options.update(reader, prevValue!, changeSummary);
			prevValue = newValue;
			return newValue;
		},
		options.changeTracker,
		() => {
			if (hasValue) {
				options.disposeFinal?.(prevValue!);
				hasValue = false;
			}
		},
		options.equalityComparer ?? strictEquals,
	) as any;
}

/**
 * Returns IObservable<T> if TChange is void, otherwise IObservableWithChange<T, TChange>
*/
type SimplifyObservableWithChange<T, TChange> = TChange extends void ? IObservable<T> : IObservableWithChange<T, TChange>;
