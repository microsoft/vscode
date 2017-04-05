/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

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
		var ret: Node<T>[] = [];
		forEach(this._nodes, entry => {
			if (isEmptyObject(entry.value.outgoing)) {
				ret.push(entry.value);
			}
		});
		return ret;
	}

	traverse(start: T, inwards: boolean, callback: (data: T) => void): void {
		var startNode = this.lookup(start);
		if (!startNode) {
			return;
		}
		this._traverse(startNode, inwards, Object.create(null), callback);
	}

	private _traverse(node: Node<T>, inwards: boolean, seen: { [key: string]: boolean }, callback: (data: T) => void): void {
		var key = this._hashFn(node.data);
		if (seen[key]) {
			return;
		}
		seen[key] = true;
		callback(node.data);
		var nodes = inwards ? node.outgoing : node.incoming;
		forEach(nodes, (entry) => this._traverse(entry.value, inwards, seen, callback));
	}

	insertEdge(from: T, to: T): void {
		var fromNode = this.lookupOrInsertNode(from),
			toNode = this.lookupOrInsertNode(to);

		fromNode.outgoing[this._hashFn(to)] = toNode;
		toNode.incoming[this._hashFn(from)] = fromNode;
	}

	removeNode(data: T): void {
		var key = this._hashFn(data);
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

	get length(): number {
		return Object.keys(this._nodes).length;
	}

	toString(): string {
		let data: string[] = [];
		forEach(this._nodes, entry => {
			data.push(`${entry.key}, (incoming)[${Object.keys(entry.value.incoming).join(', ')}], (outgoing)[${Object.keys(entry.value.outgoing).join(',')}]`);
		});
		return data.join('\n');
	}
}
