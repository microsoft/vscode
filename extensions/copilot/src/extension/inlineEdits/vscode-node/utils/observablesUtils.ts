/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { derivedWithSetter, IObservable, ISettableObservable, observableValue } from '../../../../util/vs/base/common/observable';

export function makeSettable<T>(obs: IObservable<T>): ISettableObservable<T> {
	const overrideObs = observableValue<T | undefined>('overrideObs', undefined);
	return derivedWithSetter(overrideObs, (reader) => {
		return overrideObs.read(reader) ?? obs.read(reader);
	}, (value, tx) => {
		overrideObs.set(value, tx);
	});
}
