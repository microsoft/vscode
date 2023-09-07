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
	private _size = 0;

	public get size() {
		return this._size;
	}

	/** Inserts a new value in the prefix tree. */
	insert(key: Iterable<string>, value: V): void {
		this.opNode(key, n => n.value = value);
	}

	/** Mutates a value in the prefix tree. */
	mutate(key: Iterable<string>, mutate: (value?: V) => V): void {
		this.opNode(key, n => n.value = mutate(n.value === unset ? undefined : n.value));
	}

	/** Deletes a node from the prefix tree, returning the value it contained. */
	delete(key: Iterable<string>): V | undefined {
		const path = [{ part: '', node: this.root }];
		let i = 0;
		for (const part of key) {
			const node = path[i].node.children?.get(part);
			if (!node) {
				return undefined; // node not in tree
			}

			path.push({ part, node });
			i++;
		}

		const value = path[i].node.value;
		if (value === unset) {
			return; // not actually a real node
		}

		this._size--;
		for (; i > 0; i--) {
			const parent = path[i - 1];
			parent.node.children!.delete(path[i].part);
			if (parent.node.children!.size > 0 || parent.node.value !== unset) {
				break;
			}
		}

		return value;
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

	/** Gets whether the tree has the given key. */
	hasKey(key: Iterable<string>): boolean {
		let node = this.root;
		for (const segment of key) {
			const next = node.children?.get(segment);
			if (!next) {
				return false;
			}

			node = next;
		}

		return node.value !== unset;
	}

	private opNode(key: Iterable<string>, fn: (node: Node<V>) => void): void {
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

		if (node.value === unset) {
			this._size++;
		}

		fn(node);
	}

	/** Returns an iterable of the tree values in no defined order. */
	*values() {
		const stack = [this.root];
		while (stack.length > 0) {
			const node = stack.pop()!;
			if (node.value !== unset) {
				yield node.value;
			}

			if (node.children) {
				for (const child of node.children.values()) {
					stack.push(child);
				}
			}
		}
	}
}

class Node<T> {
	public children?: Map<string, Node<T>>;
	public value: T | typeof unset = unset;
}
