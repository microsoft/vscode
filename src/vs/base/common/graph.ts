/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import objects = require('vs/base/common/types');
import collections = require('vs/base/common/collections');

export interface Node<T> {
	data:T;
	incoming:{[key:string]:Node<T>};
	outgoing:{[key:string]:Node<T>};
}

export function newNode<T>(data:T):Node<T> {
	return {
		data: data, 
		incoming: {}, 
		outgoing: {}
	};
}

export class Graph<T> {
	
	private _nodes:{[key:string]:Node<T>} = Object.create(null);
	
	constructor(private _hashFn:(element:T)=>string) {
		// empty
	}
	
	public roots():Node<T>[] {
		var ret:Node<T>[] = [];
		collections.forEach(this._nodes, entry => {
			if(objects.isEmptyObject(entry.value.outgoing)) {
				ret.push(entry.value);
			}
		});
		return ret;
	}
	
	public traverse(start:T, inwards:boolean, callback:(data:T)=>void):void {
		var startNode = this.lookup(start);
		if(!startNode) {
			return;
		}
		this._traverse(startNode, inwards, {}, callback);
	}
	
	private _traverse(node:Node<T>, inwards:boolean, seen:{[key:string]:boolean}, callback:(data:T)=>void):void {
		var key = this._hashFn(node.data);
		if(collections.contains(seen, key)) {
			return;
		}
		seen[key] = true;
		callback(node.data);
		var nodes = inwards ? node.outgoing : node.incoming;
		collections.forEach(nodes, (entry) => this._traverse(entry.value, inwards, seen, callback));
	}
	
	public insertEdge(from:T, to:T):void {
		var fromNode = this.lookupOrInsertNode(from), 
			toNode = this.lookupOrInsertNode(to);
		
		fromNode.outgoing[this._hashFn(to)] = toNode;
		toNode.incoming[this._hashFn(from)] = fromNode;
	}
	
	public removeNode(data:T):void {
		var key = this._hashFn(data);
		delete this._nodes[key];
		collections.forEach(this._nodes, (entry) => {
			delete entry.value.outgoing[key];
			delete entry.value.incoming[key];
		});
	}
	
	public lookupOrInsertNode(data:T):Node<T> {
		var key = this._hashFn(data),
			node = collections.lookup(this._nodes, key);
		
		if(!node) {
			node = newNode(data);
			this._nodes[key] = node;
		}
		
		return node;
	}
	
	public lookup(data:T):Node<T> {
		return collections.lookup(this._nodes, this._hashFn(data));
	}
	
	public get length():number {
		return Object.keys(this._nodes).length;
	}
}