/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ArrayNavigator, INavigator } from 'vs/base/common/navigator';

export class HistoryNavigator<T> implements INavigator<T> {

	private _history!: Set<T>;
	private _limit: number;
	private _navigator!: ArrayNavigator<T>;

	constructor(history: readonly T[] = [], limit: number = 10) {
		this._initialize(history);
		this._limit = limit;
		this._onChange();
	}

	public getHistory(): T[] {
		return this._elements;
	}

	public add(t: T) {
		this._history.delete(t);
		this._history.add(t);
		this._onChange();
	}

	public next(): T | null {
		// This will navigate past the end of the last element, and in that case the input should be cleared
		return this._navigator.next();
	}

	public previous(): T | null {
		if (this._currentPosition() !== 0) {
			return this._navigator.previous();
		}
		return null;
	}

	public current(): T | null {
		return this._navigator.current();
	}

	public first(): T | null {
		return this._navigator.first();
	}

	public last(): T | null {
		return this._navigator.last();
	}

	public isFirst(): boolean {
		return this._currentPosition() === 0;
	}

	public isLast(): boolean {
		return this._currentPosition() >= this._elements.length - 1;
	}

	public isNowhere(): boolean {
		return this._navigator.current() === null;
	}

	public has(t: T): boolean {
		return this._history.has(t);
	}

	public clear(): void {
		this._initialize([]);
		this._onChange();
	}

	private _onChange() {
		this._reduceToLimit();
		const elements = this._elements;
		this._navigator = new ArrayNavigator(elements, 0, elements.length, elements.length);
	}

	private _reduceToLimit() {
		const data = this._elements;
		if (data.length > this._limit) {
			this._initialize(data.slice(data.length - this._limit));
		}
	}

	private _currentPosition(): number {
		const currentElement = this._navigator.current();
		if (!currentElement) {
			return -1;
		}

		return this._elements.indexOf(currentElement);
	}

	private _initialize(history: readonly T[]): void {
		this._history = new Set();
		for (const entry of history) {
			this._history.add(entry);
		}
	}

	private get _elements(): T[] {
		const elements: T[] = [];
		this._history.forEach(e => elements.push(e));
		return elements;
	}
}

interface HistoryNode<T> {
	value: T;
	previous: HistoryNode<T> | undefined;
	next: HistoryNode<T> | undefined;
}

export class HistoryNavigator2<T> {

	private valueSet: Set<T>;
	private head: HistoryNode<T>;
	private tail: HistoryNode<T>;
	private cursor: HistoryNode<T>;
	private _size: number;
	get size(): number { return this._size; }

	constructor(history: readonly T[], private capacity: number = 10) {
		if (history.length < 1) {
			throw new Error('not supported');
		}

		this._size = 1;
		this.head = this.tail = this.cursor = {
			value: history[0],
			previous: undefined,
			next: undefined
		};

		this.valueSet = new Set<T>([history[0]]);
		for (let i = 1; i < history.length; i++) {
			this.add(history[i]);
		}
	}

	add(value: T): void {
		const node: HistoryNode<T> = {
			value,
			previous: this.tail,
			next: undefined
		};

		this.tail.next = node;
		this.tail = node;
		this.cursor = this.tail;
		this._size++;

		if (this.valueSet.has(value)) {
			this._deleteFromList(value);
		} else {
			this.valueSet.add(value);
		}

		while (this._size > this.capacity) {
			this.valueSet.delete(this.head.value);

			this.head = this.head.next!;
			this.head.previous = undefined;
			this._size--;
		}
	}

	/**
	 * @returns old last value
	 */
	replaceLast(value: T): T {
		if (this.tail.value === value) {
			return value;
		}

		const oldValue = this.tail.value;
		this.valueSet.delete(oldValue);
		this.tail.value = value;

		if (this.valueSet.has(value)) {
			this._deleteFromList(value);
		} else {
			this.valueSet.add(value);
		}

		return oldValue;
	}

	prepend(value: T): void {
		if (this._size === this.capacity || this.valueSet.has(value)) {
			return;
		}

		const node: HistoryNode<T> = {
			value,
			previous: undefined,
			next: this.head
		};

		this.head.previous = node;
		this.head = node;
		this._size++;

		this.valueSet.add(value);
	}

	isAtEnd(): boolean {
		return this.cursor === this.tail;
	}

	current(): T {
		return this.cursor.value;
	}

	previous(): T {
		if (this.cursor.previous) {
			this.cursor = this.cursor.previous;
		}

		return this.cursor.value;
	}

	next(): T {
		if (this.cursor.next) {
			this.cursor = this.cursor.next;
		}

		return this.cursor.value;
	}

	has(t: T): boolean {
		return this.valueSet.has(t);
	}

	resetCursor(): T {
		this.cursor = this.tail;
		return this.cursor.value;
	}

	*[Symbol.iterator](): Iterator<T> {
		let node: HistoryNode<T> | undefined = this.head;

		while (node) {
			yield node.value;
			node = node.next;
		}
	}

	private _deleteFromList(value: T): void {
		let temp = this.head;

		while (temp !== this.tail) {
			if (temp.value === value) {
				if (temp === this.head) {
					this.head = this.head.next!;
					this.head.previous = undefined;
				} else {
					temp.previous!.next = temp.next;
					temp.next!.previous = temp.previous;
				}

				this._size--;
			}

			temp = temp.next!;
		}
	}
}
