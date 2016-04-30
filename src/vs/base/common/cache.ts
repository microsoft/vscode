/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

interface Entry<T> {
	next?: Entry<T>;
	prev?: Entry<T>;
	key: string;
	value: T;
}

/**
 * A simple Map<T> that optionally allows to set a limit of entries to store. Once the limit is hit,
 * the cache will remove the entry that was last recently added.
 */
export class Cache<T> {
	private map: { [key: string]: Entry<T> };
	private head: Entry<T>;
	private tail: Entry<T>;
	private _size: number;

	constructor(private limit) {
		this.map = Object.create(null);
		this._size = 0;
	}

	public get size(): number {
		return this._size;
	}

	public set(key: string, value: T): boolean {
		if (this.map[key]) {
			return false; // already present!
		}

		const entry: Entry<T> = { key, value };
		this.push(key, entry);

		if (this._size > this.limit) {
			this.trim();
		}

		return true;
	}

	public get(key: string): T {
		const entry = this.map[key];

		return entry ? entry.value : null;
	}

	public remove(key: string): T {
		const entry = this.map[key];

		if (entry) {
			this.map[key] = void 0;
			this._size--;

			if (entry.next) {
				entry.next.prev = entry.prev; // [A]<-[x]<-[C] = [A]<-[C]
			} else {
				this.head = entry.prev; // [A]-[x] = [A]
			}

			if (entry.prev) {
				entry.prev.next = entry.next; // [A]->[x]->[C] = [A]->[C]
			} else {
				this.tail = entry.next; // [x]-[A] = [A]
			}

			return entry.value;
		}

		return null;
	}

	public clear(): void {
		this.map = Object.create(null);
		this._size = 0;
		this.head = null;
		this.tail = null;
	}

	private push(key: string, entry: Entry<T>): void {
		if (this.head) {
			// [A]-[B] = [A]-[B]->[X]
			entry.prev = this.head;
			this.head.next = entry;
		}

		if (!this.tail) {
			this.tail = entry;
		}

		this.head = entry;

		this.map[key] = entry;
		this._size++;
	}

	private trim(): void {
		if (this.tail) {
			delete this.map[this.tail.key];
			this._size--;

			// [x]-[B] = [B]
			this.tail = this.tail.next;
			this.tail.prev = null;
		}
	}
}