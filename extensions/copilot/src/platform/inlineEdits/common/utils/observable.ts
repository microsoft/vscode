/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../util/vs/base/common/lifecycle';
import { autorunHandleChanges, IObservableWithChange } from '../../../../util/vs/base/common/observable';

type ObservableResult<T> = T extends IObservableWithChange<infer U, any> ? U : never;

type ObservableArrayToChangesData<T extends Record<string, IObservableWithChange<any, any>>> = {
	[Key in keyof T]: {
		value: ObservableResult<T[Key]>;
		changes: T[Key]['TChange'][];
		/**
		 * The value of the observable before the changes. `undefined` if
		 */
		previous: ObservableResult<T[Key]> | undefined;
	}
};

export function autorunWithChanges<T extends Record<string, IObservableWithChange<any, any>>>(owner: object, observables: T, handler: (data: ObservableArrayToChangesData<T>) => void): IDisposable {
	const observableToKey = new Map(Object.entries(observables).map(([key, value]) => [value, key] as const));

	const previousValues = new Map(Object.keys(observables).map(key => [key, undefined]));

	return autorunHandleChanges({
		owner,
		changeTracker: {
			createChangeSummary: () => ({}) as ObservableArrayToChangesData<T>,
			handleChange: (ctx, changeSummary) => {
				const key = observableToKey.get(ctx.changedObservable)!;

				if (changeSummary[key] === undefined) {
					(changeSummary as any)[key] = { value: undefined!, changes: [] };
				}
				changeSummary[key].changes.push(ctx.change);
				return true;
			}
		}
	}, (reader, data) => {
		for (const [key, value] of Object.entries(observables)) {
			const v = value.read(reader);

			if (data[key] === undefined) {
				(data as any)[key] = { value: v, changes: [], previous: previousValues.get(key) };
			}
			data[key].value = v;
			data[key].previous = previousValues.get(key) === undefined ? undefined : previousValues.get(key);
			previousValues.set(key, v);
		}
		handler(data);
	});
}
