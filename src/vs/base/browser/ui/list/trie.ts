/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

interface TrieNode<K, T> {
	value: T;
	children: Map<K, TrieNode<K, T>>;
}

/**
 * Do not use with undefined values!
 */
export class Trie<K, V> {

	private root: TrieNode<K, V>;

	constructor() {
		this.clear();
	}

	set(path: K[], element: V): void {
		if (path.length === 0) {
			throw new Error('Invalid path length');
		}

		let node = this.root;

		for (const key of path) {
			let child = node.children.get(key);

			if (!child) {
				child = { value: undefined, children: new Map<K, TrieNode<K, V>>() };
				node.children.set(key, child);
			}

			node = child;
		}

		node.value = element;
	}

	get(path: K[]): V | undefined {
		if (path.length === 0) {
			throw new Error('Invalid path length');
		}

		let node = this.root;

		for (const key of path) {
			let child = node.children.get(key);

			if (!child) {
				return undefined;
			}

			node = child;
		}

		return node.value;
	}

	delete(path: K[], recursive: boolean = false): V {
		if (path.length === 0) {
			throw new Error('Invalid path length');
		}

		let nodePath: { key: K, node: TrieNode<K, V> }[] = [];
		let node = this.root;

		for (const key of path) {
			let child = node.children.get(key);

			if (!child) {
				return undefined;
			}

			nodePath.push({ key, node });
			node = child;
		}

		const value = node.value;
		node.value = undefined;

		if (node.children && !recursive) {
			return value;
		}

		for (let i = nodePath.length - 1; i >= 0; i--) {
			const { key, node } = nodePath[i];

			node.children.delete(key);

			if (Object.keys(node.children).length > 0) {
				break;
			}
		}

		return value;
	}

	clear(): void {
		this.root = { value: undefined, children: new Map<K, TrieNode<K, V>>() };
	}
}