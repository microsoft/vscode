/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Arrays = require('vs/base/common/arrays');

export interface IIterator<TValue> {
	current: TValue;
	moveNext(): boolean;
	hasNext(): boolean;
	reset(): void;
	dispose(): void;
}

export interface IIterable<TValue> {
	getIterator(): IIterator<TValue>;
}

export interface ISortedList<TKey, TValue> extends IIterable<KeyValue<TKey, TValue>> {
	/**
	 * Number of elements in a sorted list.
	 * O(1)
	 */
	 count: number;

	/**
	 * Gets the value associated with the specified key.
	 * Returns null if there is no value asociated with the key.
	 * O(log n)
	 */
	 getValue(key: TKey): TValue;

	 /**
	 * Gets an iterator over values.
	 * O(1)
	 */
	 getValues(): IIterator<TValue>;

	/**
	 * Gets the value at the specified index.
	 * Returns null if index is out of bounds.
	 * O(1)
	 */
	 getValueByIndex(index: number): TValue;

	/**
	 * Gets the key at the specified index.
	 * Returns null if index is out of bounds.
	 * O(1)
	 */
	 getKey(index: number): TKey;

	/**
	 * Gets an iterator over keys.
	 * O(1)
	 */
	 getKeys(): IIterator<TKey>;

	 /**
	  * Returns the zero-based index of the specified key in a SortedList object.
	  * Returns -1 if the key is not found.
	  * O(log n)
	  */
	 indexOfKey(key: TKey): number;

	/**
	 * Adds the specified key and value to the sorted list.
	 * O(n)
	 */
	 add(key: TKey, value: TValue): void;

	/**
	 * Removes a value from the sorted list.
	 * Returns true if the value got removed, false otherwise.
	 * O(n)
	 */
	 remove(key: TKey): boolean;
}

export interface KeyValue<TKey, TValue> {
	key: TKey;
	value: TValue;
}

export class SortedList<TKey, TValue> implements ISortedList<TKey, TValue> {

	private static DEFAULT_COMPARATOR = function<TKey>(first: TKey, second: TKey) {
		return first < second ? -1 : first > second ? 1 : 0;
	};

	private keys: TKey[];
	private values: TValue[];
	private comparator: (first: TKey, second: TKey) => number;

	constructor(comparator?: (first: TKey, second: TKey) => number) {
		this.keys = [];
		this.values = [];
		this.comparator = comparator || SortedList.DEFAULT_COMPARATOR;
	}

	public get count(): number {
		return this.keys.length;
	}

	public getValueByIndex(index: number): TValue {
		if (0 <= index && index < this.values.length) {
			return this.values[index];
		}

		return null;
	}

	public getKey(index: number): TKey {
		if (0 <= index && index < this.keys.length) {
			return this.keys[index];
		}

		return null;
	}

	public getKeys(): IIterator<TKey> {
		return new ListIterator<TKey>(this.keys);
	}

	public getValue(key: TKey): TValue {
		if (!key) {
			throw new Error('Key must be defined.');
		}
		var indexOfKey = this.indexOfKey(key);
		if (indexOfKey >= 0) {
			 return this.values[indexOfKey];
		}

		return null;
	}

	public getValues(): IIterator<TValue> {
		return new ListIterator<TValue>(this.values);
	}

	public indexOfKey(key: TKey): number {
		if (!key) {
			throw new Error('Key must be defined.');
		}
		return Math.max(-1, Arrays.binarySearch(this.keys, key, this.comparator));
	}

	public add(key: TKey, value: TValue): void {
		if (!key || !value) {
			throw new Error('Key and value must be defined.');
		}

		var position = 0;
		while (position < this.keys.length && this.comparator(key, this.keys[position]) > 0) {
			 position++;
		}

		this.keys.splice(position, 0, key);
		this.values.splice(position, 0, value);
	}

	public remove(key: TKey): boolean {
		if (!key) {
			throw new Error('Key must be defined.');
		}
		var indexOfKey = this.indexOfKey(key);
		if (indexOfKey >= 0) {
			 this.values.splice(indexOfKey, 1);
			 this.keys.splice(indexOfKey, 1);
		}

		return indexOfKey >= 0;
	}

	public getIterator(): IIterator<KeyValue<TKey, TValue>> {
		return new SortedListIterator<TKey, TValue>(this.keys, this.values);
	}
}

class SortedListIterator<TKey, TValue> implements IIterator<KeyValue<TKey, TValue>> {
	private keys: TKey[];
	private values: TValue[];
	private index: number;

	constructor(keys: TKey[], values: TValue[]) {
		this.keys = keys;
		this.values = values;
		this.index = -1;
	}

	public get current(): KeyValue<TKey, TValue> {
		if (this.index < 0 || this.keys.length < this.index) {
			return null;
		}

		return {
			key: this.keys[this.index],
			value: this.values[this.index]
		};
	}

	public moveNext(): boolean {
		this.index++;
		return this.index < this.keys.length;
	}

	public hasNext(): boolean {
		return this.index + 1 < this.keys.length;
	}

	 public reset(): void {
		this.index = -1;
	}

	public dispose(): void {
		this.keys = null;
		this.values = null;
	}
}

class ListIterator<TValue> implements IIterator<TValue> {
	private values: TValue[];
	private index: number;

	constructor(values: TValue[]) {
		this.values = values;
		this.index = -1;
	}

	public get current(): TValue {
		if (this.index < 0 || this.values.length < this.index) {
			return null;
		}

		return this.values[this.index];
	}

	public moveNext(): boolean {
		this.index++;
		return this.index < this.values.length;
	}

	public hasNext(): boolean {
		return this.index + 1 < this.values.length;
	}

	 public reset(): void {
		this.index = -1;
	}

	public dispose(): void {
		this.values = null;
	}
}