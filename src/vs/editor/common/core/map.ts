/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export interface Map<K, V> {
	clear(): void;
	delete(key: K): boolean;
	forEach(callbackfn: (value: V, index: K, map: Map<K, V>) => void, thisArg?: any): void;
	get(key: K): V;
	has(key: K): boolean;
	set(key: K, value?: V): Map<K, V>;
	size: number;

	// not supported on IE11:
	// entries(): IterableIterator<[K, V]>;
	// keys(): IterableIterator<K>;
	// values(): IterableIterator<V>;
	// [Symbol.iterator]():IterableIterator<[K,V]>;
	// [Symbol.toStringTag]: string;
}

interface MapConstructor {
	new <K, V>(): Map<K, V>;
	prototype: Map<any, any>;

	// not supported on IE11:
	// new <K, V>(iterable: Iterable<[K, V]>): Map<K, V>;
}
declare var Map: MapConstructor;

export function createMap<K, V>(): Map<K, V> {
	return new Map<K, V>();
}
