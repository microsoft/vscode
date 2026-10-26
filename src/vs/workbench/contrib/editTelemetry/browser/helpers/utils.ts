/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncIterableSource } from '../../../../../base/common/async.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservableWithChange, observableValue, runOnChange, transaction, RemoveUndefined } from '../../../../../base/common/observable.js';

export function sumByCategory<T, TCategory extends string>(items: readonly T[], getValue: (item: T) => number, getCategory: (item: T) => TCategory): Record<TCategory, number | undefined> {
	return items.reduce((acc, item) => {
		const category = getCategory(item);
		acc[category] = (acc[category] || 0) + getValue(item);
		return acc;
		// eslint-disable-next-line local/code-no-any-casts
	}, {} as any as Record<TCategory, number>);
}

export function mapObservableDelta<T, TDelta, TDeltaNew>(obs: IObservableWithChange<T, TDelta>, mapFn: (value: TDelta) => TDeltaNew, store: DisposableStore): IObservableWithChange<T, TDeltaNew> {
	const obsResult = observableValue<T, TDeltaNew>('mapped', obs.get());
	store.add(runOnChange(obs, (value, _prevValue, changes) => {
		transaction(tx => {
			for (const c of changes) {
				obsResult.set(value, tx, mapFn(c));
			}
		});
	}));
	return obsResult;
}

export function iterateObservableChanges<T, TChange>(obs: IObservableWithChange<T, TChange>, store: DisposableStore): AsyncIterable<{ value: T; prevValue: T; change: RemoveUndefined<TChange>[] }> {
	const source = new AsyncIterableSource<{ value: T; prevValue: T; change: RemoveUndefined<TChange>[] }>();
	if (!store.isDisposed) {
		store.add(runOnChange(obs, (value, prevValue, change) => {
			source.emitOne({ value, prevValue, change });
		}));
		store.add(toDisposable(() => source.resolve()));
	} else {
		source.resolve();
	}
	return source.asyncIterable;
}
