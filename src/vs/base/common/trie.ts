/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
import collections = require('vs/base/common/collections');
import assert = require('vs/base/common/assert');


export interface TrieNode<E> {
	element?:E;
	children?: { [k: number]: TrieNode<E> };
}

export interface Trie<E> {
	insert(key: string, element: E): E;
	lookUp(key: string): E;
	lookUpMany(part: string): { next(): { done: boolean; value?: { key: string; element: E; } } };
}

var _emptyIterator = {
	next: function() {
		return { done: true }
	}
}

export function createTrie<E>(data?:collections.IStringDictionary<E>):Trie<E> {

	let _root: TrieNode<E> = Object.create(null);

	function insert(key: string, element: E): E {

		let idx = 0,
			len = key.length,
			parent = _root,
			node = parent;

		while (idx < len) {
			node = parent.children && parent.children[key.charCodeAt(idx)];
			if (node) {
				parent = node;
				idx += 1;
			} else {
				break;
			}
		}

		while (idx < len) {
			node = Object.create(null);
			if (!parent.children) {
				parent.children = Object.create(null);
			}
			parent.children[key.charCodeAt(idx)] = node;
			parent = node;
			idx += 1;
		}

		var oldElement = node.element;
		node.element = element;
		return oldElement;
	}

	function lookUp(key: string): E {

		let i = 0,
			len = key.length,
			parent = _root,
			node = parent;

		while (i < len) {
			node = parent.children && parent.children[key.charCodeAt(i)];
			if (node) {
				parent = node;
				i += 1;
			} else {
				break;
			}
		}

		return node && node.element;
	}

	function lookUpMany(part: string): { next(): { done: boolean; value?: { key: string; element: E; } } } {

		// find substring
		let i = 0,
			len = part.length,
			parent = _root,
			node = parent;

		while (i < len) {
			node = parent.children && parent.children[part.charCodeAt(i)];
			if (!node) {
				return _emptyIterator;
			} else {
				parent = node;
				i++;
			}
		}

		let stack = [{ node, part }];

		function next() {

			let done = stack.length === 0,
				value: { key: string; element: E; };

			if (!done) {
				while(stack.length) {
					let item = stack.pop();
					if (item.node.children) {
						for (let ch in item.node.children) {
							stack.push({ node: item.node.children[ch], part: item.part + String.fromCharCode(ch) });
						}
					}
					if (item.node.element) {
						value = { key: item.part, element: item.node.element };
						break;
					}
				}
			}

			return {
				done,
				value
			}
		}

		return {
			next
		}
	}

	if(typeof data !== 'undefined') {
		for (var key in data) {
			if (Object.hasOwnProperty.call(data, key)) {
				insert(key, data[key]);
			}
		}
	}

	return {
		insert,
		lookUp,
		lookUpMany
	};
}
