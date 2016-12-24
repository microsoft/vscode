/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export interface Set<T> {
	add(value: T): Set<T>;
	clear(): void;
	delete(value: T): boolean;
	forEach(callbackfn: (value: T, index: T, set: Set<T>) => void, thisArg?: any): void;
	has(value: T): boolean;
	size: number;

	// not supported on IE11:
	// entries(): IterableIterator<[T, T]>;
	// keys(): IterableIterator<T>;
	// values(): IterableIterator<T>;
	// [Symbol.iterator]():IterableIterator<T>;
	// [Symbol.toStringTag]: string;
}

interface SetConstructor {
	new <T>(): Set<T>;
	prototype: Set<any>;

	// not supported on IE11:
	// new <T>(iterable: Iterable<T>): Set<T>;
}
declare var Set: SetConstructor;

export function createSet<T>(): Set<T> {
	return new Set<T>();
}
