/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const unset = Symbol('unset');

/**
 * A simple prefix tree implementation where a value is stored based on
 * well-defined prefix segments.
 */
export class WellDefinedPrefixTree<V> {
	private readonly root = new Node<V>();

	/** Inserts a new value in the prefix tree. */
	insert(key: Iterable<string>, value: V): void {
		let node = this.root;
		for (const part of key) {
			if (!node.children) {
				const next = new Node<V>();
				node.children = new Map([[part, next]]);
				node = next;
			} else if (!node.children.has(part)) {
				const next = new Node<V>();
				node.children.set(part, next);
				node = next;
			} else {
				node = node.children.get(part)!;
			}

		}

		node.value = value;
	}

	/** Gets a value from the tree. */
	find(key: Iterable<string>): V | undefined {
		let node = this.root;
		for (const segment of key) {
			const next = node.children?.get(segment);
			if (!next) {
				return undefined;
			}

			node = next;
		}

		return node.value === unset ? undefined : node.value;
	}

	/** Gets whether the tree has the key, or a parent of the key, already inserted. */
	hasKeyOrParent(key: Iterable<string>): boolean {
		let node = this.root;
		for (const segment of key) {
			const next = node.children?.get(segment);
			if (!next) {
				return false;
			}
			if (next.value !== unset) {
				return true;
			}

			node = next;
		}

		return false;
	}

	/** Gets whether the tree has the given key or any children. */
	hasKeyOrChildren(key: Iterable<string>): boolean {
		let node = this.root;
		for (const segment of key) {
			const next = node.children?.get(segment);
			if (!next) {
				return false;
			}

			node = next;
		}

		return true;
	}
}

class Node<T> {
	public children?: Map<string, Node<T>>;
	public value: T | typeof unset = unset;
}
