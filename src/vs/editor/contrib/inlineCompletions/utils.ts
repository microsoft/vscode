/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, IReference } from 'vs/base/common/lifecycle';

export function createDisposableRef<T>(object: T, disposable?: IDisposable): IReference<T> {
	return {
		object,
		dispose: () => disposable?.dispose(),
	};
}

export type Comparator<T> = (a: T, b: T) => number;

export function compareBy<TItem, TCompareBy>(selector: (item: TItem) => TCompareBy, comparator: Comparator<TCompareBy>): Comparator<TItem> {
	return (a, b) => comparator(selector(a), selector(b));
}

export function compareByNumber(): Comparator<number> {
	return (a, b) => a - b;
}

export function findMaxBy<T>(items: T[], comparator: Comparator<T>): T | undefined {
	let min: T | undefined = undefined;
	for (const item of items) {
		if (min === undefined || comparator(item, min) > 0) {
			min = item;
		}
	}
	return min;
}
