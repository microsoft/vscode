/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

class Node<E> {
	element: E;
	next: Node<E>;
	prev: Node<E>;

	constructor(element: E) {
		this.element = element;
	}
}

export class LinkedList<E> {

	private _first: Node<E>;
	private _last: Node<E>;

	isEmpty(): boolean {
		return !this._first;
	}

	insert(element: E) {
		const newNode = new Node(element);
		if (!this._first) {
			this._first = newNode;
			this._last = newNode;
		} else {
			const oldLast = this._last;
			this._last = newNode;
			newNode.prev = oldLast;
			oldLast.next = newNode;
		}

		return () => {

			for (let candidate = this._first; candidate instanceof Node; candidate = candidate.next) {
				if (candidate !== newNode) {
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
					this._last = this._last.prev;
					this._last.next = undefined;

				} else if (!candidate.prev) {
					// first
					this._first = this._first.next;
					this._first.prev = undefined;
				}

				// done
				break;
			}
		};
	}

	iterator() {
		let _done: boolean;
		let _value: E;
		let element = {
			get done() { return _done; },
			get value() { return _value; }
		};
		let node = this._first;
		return {
			next(): { done: boolean; value: E } {
				if (!node) {
					_done = true;
					_value = undefined;
				} else {
					_done = false;
					_value = node.element;
					node = node.next;
				}
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
