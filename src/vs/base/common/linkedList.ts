/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterator, IteratorResult, FIN } from 'vs/base/common/iterator';

class Node<E> {
	element: E;
	next: Node<E> | undefined;
	prev: Node<E> | undefined;

	constructor(element: E) {
		this.element = element;
	}
}

export class LinkedList<E> {

	private _first: Node<E> | undefined;
	private _last: Node<E> | undefined;
	private _size: number = 0;

	get size(): number {
		return this._size;
	}

	isEmpty(): boolean {
		return !this._first;
	}

	clear(): void {
		this._first = undefined;
		this._last = undefined;
		this._size = 0;
	}

	unshift(element: E): () => void {
		return this._insert(element, false);
	}

	push(element: E): () => void {
		return this._insert(element, true);
	}

	private _insert(element: E, atTheEnd: boolean): () => void {
		const newNode = new Node(element);
		if (!this._first) {
			this._first = newNode;
			this._last = newNode;

		} else if (atTheEnd) {
			// push
			const oldLast = this._last!;
			this._last = newNode;
			newNode.prev = oldLast;
			oldLast.next = newNode;

		} else {
			// unshift
			const oldFirst = this._first;
			this._first = newNode;
			newNode.next = oldFirst;
			oldFirst.prev = newNode;
		}
		this._size += 1;
		return this._remove.bind(this, newNode);
	}


	shift(): E | undefined {
		if (!this._first) {
			return undefined;
		} else {
			const res = this._first.element;
			this._remove(this._first);
			return res;
		}
	}

	pop(): E | undefined {
		if (!this._last) {
			return undefined;
		} else {
			const res = this._last.element;
			this._remove(this._last);
			return res;
		}
	}

	private _remove(node: Node<E>): void {
		let candidate: Node<E> | undefined = this._first;
		while (candidate instanceof Node) {
			if (candidate !== node) {
				candidate = candidate.next;
				continue;
			}
			if (candidate.prev && candidate.next) {
				// middle
				let anchor = candidate.prev;
				anchor.next = candidate.next;
				candidate.next.prev = anchor;

			} else if (!candidate.prev && !candidate.next) {
				// only node
				this._first = undefined;
				this._last = undefined;

			} else if (!candidate.next) {
				// last
				this._last = this._last!.prev!;
				this._last.next = undefined;

			} else if (!candidate.prev) {
				// first
				this._first = this._first!.next!;
				this._first.prev = undefined;
			}

			// done
			this._size -= 1;
			break;
		}
	}

	iterator(): Iterator<E> {
		let element: { done: false; value: E; };
		let node = this._first;
		return {
			next(): IteratorResult<E> {
				if (!node) {
					return FIN;
				}

				if (!element) {
					element = { done: false, value: node.element };
				} else {
					element.value = node.element;
				}
				node = node.next;
				return element;
			}
		};
	}

	toArray(): E[] {
		let result: E[] = [];
		for (let node = this._first; node instanceof Node; node = node.next) {
			result.push(node.element);
		}
		return result;
	}
}
