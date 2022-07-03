/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import * as observable from 'vs/base/common/observable';
export {
	observableFromEvent,
	autorunWithStore,
	IObservable,
	transaction,
	ITransaction,
	autorunDelta,
	constObservable,
	observableFromPromise,
	wasEventTriggeredRecently,
	debouncedObservable,
	autorunHandleChanges,
	waitForState,
	keepAlive,
	IReader,
	derivedObservableWithCache,
	derivedObservableWithWritableCache,
} from 'vs/base/common/observable';
import * as observableValue from 'vs/base/common/observableImpl/base';

export function autorun(fn: (reader: observable.IReader) => void, name: string): IDisposable {
	return observable.autorun(name, fn);
}

export class ObservableValue<T, TChange = void> extends observableValue.ObservableValue<T, TChange> {
	constructor(initialValue: T, name: string) {
		super(name, initialValue);
	}
}

export function derivedObservable<T>(name: string, computeFn: (reader: observable.IReader) => T): observable.IObservable<T> {
	return observable.derived(name, computeFn);
}
