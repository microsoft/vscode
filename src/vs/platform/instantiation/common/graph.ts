/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEmptyObject } from 'vs/base/common/types';
import { forEach } from 'vs/base/common/collections';

export interface Node<T> {
	data: T;
	incoming: { [key: string]: Node<T> };
	outgoing: { [key: string]: Node<T> };
}

function newNode<T>(data: T): Node<T> {
	return {
		data: data,
		incoming: Object.create(null),
		outgoing: Object.create(null)
	};
}

export class Graph<T> {

	private _nodes: { [key: string]: Node<T> } = Object.create(null);

	constructor(private _hashFn: (element: T) => string) {
		// empty
	}

	roots(): Node<T>[] {
		const ret: Node<T>[] = [];
		forEach(this._nodes, entry => {
			if (isEmptyObject(entry.value.outgoing)) {
				ret.push(entry.value);
			}
		});
		return ret;
	}

	insertEdge(from: T, to: T): void {
		const fromNode = this.lookupOrInsertNode(from),
			toNode = this.lookupOrInsertNode(to);

		fromNode.outgoing[this._hashFn(to)] = toNode;
		toNode.incoming[this._hashFn(from)] = fromNode;
	}

	removeNode(data: T): void {
		const key = this._hashFn(data);
		delete this._nodes[key];
		forEach(this._nodes, (entry) => {
			delete entry.value.outgoing[key];
			delete entry.value.incoming[key];
		});
	}

	lookupOrInsertNode(data: T): Node<T> {
		const key = this._hashFn(data);
		let node = this._nodes[key];

		if (!node) {
			node = newNode(data);
			this._nodes[key] = node;
		}

		return node;
	}

	lookup(data: T): Node<T> {
		return this._nodes[this._hashFn(data)];
	}

	isEmpty(): boolean {
		for (const _key in this._nodes) {
			return false;
		}
		return true;
	}

	toString(): string {
		let data: string[] = [];
		forEach(this._nodes, entry => {
			data.push(`${entry.key}, (incoming)[${Object.keys(entry.value.incoming).join(', ')}], (outgoing)[${Object.keys(entry.value.outgoing).join(',')}]`);
		});
		return data.join('\n');
	}
}
