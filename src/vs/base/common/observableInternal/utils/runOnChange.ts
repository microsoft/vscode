/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservableWithChange } from '../base.js';
import { CancellationToken, cancelOnDispose } from '../commonFacade/cancellation.js';
import { DisposableStore, IDisposable } from '../commonFacade/deps.js';
import { autorunWithStoreHandleChanges } from '../reactions/autorun.js';

export type RemoveUndefined<T> = T extends undefined ? never : T;

export function runOnChange<T, TChange>(observable: IObservableWithChange<T, TChange>, cb: (value: T, previousValue: T, deltas: RemoveUndefined<TChange>[]) => void): IDisposable {
	let _previousValue: T | undefined;
	let _firstRun = true;
	return autorunWithStoreHandleChanges({
		changeTracker: {
			createChangeSummary: () => ({ deltas: [] as RemoveUndefined<TChange>[], didChange: false }),
			handleChange: (context, changeSummary) => {
				if (context.didChange(observable)) {
					const e = context.change;
					if (e !== undefined) {
						changeSummary.deltas.push(e as RemoveUndefined<TChange>);
					}
					changeSummary.didChange = true;
				}
				return true;
			},
		}
	}, (reader, changeSummary) => {
		const value = observable.read(reader);
		const previousValue = _previousValue;
		if (changeSummary.didChange) {
			_previousValue = value;
			// didChange can never be true on the first autorun, so we know previousValue is defined
			cb(value, previousValue!, changeSummary.deltas);
		}
		if (_firstRun) {
			_firstRun = false;
			_previousValue = value;
		}
	});
}

export function runOnChangeWithStore<T, TChange>(observable: IObservableWithChange<T, TChange>, cb: (value: T, previousValue: T, deltas: RemoveUndefined<TChange>[], store: DisposableStore) => void): IDisposable {
	const store = new DisposableStore();
	const disposable = runOnChange(observable, (value, previousValue: T, deltas) => {
		store.clear();
		cb(value, previousValue, deltas, store);
	});
	return {
		dispose() {
			disposable.dispose();
			store.dispose();
		}
	};
}

export function runOnChangeWithCancellationToken<T, TChange>(observable: IObservableWithChange<T, TChange>, cb: (value: T, previousValue: T, deltas: RemoveUndefined<TChange>[], token: CancellationToken) => Promise<void>): IDisposable {
	return runOnChangeWithStore(observable, (value, previousValue, deltas, store) => {
		cb(value, previousValue, deltas, cancelOnDispose(store));
	});
}
