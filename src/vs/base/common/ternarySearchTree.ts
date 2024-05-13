/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { shuffle } from 'vs/base/common/arrays';
import { CharCode } from 'vs/base/common/charCode';
import { compare, compareIgnoreCase, compareSubstring, compareSubstringIgnoreCase } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';

export interface IKeyIterator<K> {
	reset(key: K): this;
	next(): this;

	hasNext(): boolean;
	cmp(a: string): number;
	value(): string;
}

export class StringIterator implements IKeyIterator<string> {

	private _value: string = '';
	private _pos: number = 0;

	reset(key: string): this {
		this._value = key;
		this._pos = 0;
		return this;
	}

	next(): this {
		this._pos += 1;
		return this;
	}

	hasNext(): boolean {
		return this._pos < this._value.length - 1;
	}

	cmp(a: string): number {
		const aCode = a.charCodeAt(0);
		const thisCode = this._value.charCodeAt(this._pos);
		return aCode - thisCode;
	}

	value(): string {
		return this._value[this._pos];
	}
}

export class ConfigKeysIterator implements IKeyIterator<string> {

	private _value!: string;
	private _from!: number;
	private _to!: number;

	constructor(
		private readonly _caseSensitive: boolean = true
	) { }

	reset(key: string): this {
		this._value = key;
		this._from = 0;
		this._to = 0;
		return this.next();
	}

	hasNext(): boolean {
		return this._to < this._value.length;
	}

	next(): this {
		// this._data = key.split(/[\\/]/).filter(s => !!s);
		this._from = this._to;
		let justSeps = true;
		for (; this._to < this._value.length; this._to++) {
			const ch = this._value.charCodeAt(this._to);
			if (ch === CharCode.Period) {
				if (justSeps) {
					this._from++;
				} else {
					break;
				}
			} else {
				justSeps = false;
			}
		}
		return this;
	}

	cmp(a: string): number {
		return this._caseSensitive
			? compareSubstring(a, this._value, 0, a.length, this._from, this._to)
			: compareSubstringIgnoreCase(a, this._value, 0, a.length, this._from, this._to);
	}

	value(): string {
		return this._value.substring(this._from, this._to);
	}
}

export class PathIterator implements IKeyIterator<string> {

	private _value!: string;
	private _valueLen!: number;
	private _from!: number;
	private _to!: number;

	constructor(
		private readonly _splitOnBackslash: boolean = true,
		private readonly _caseSensitive: boolean = true
	) { }

	reset(key: string): this {
		this._from = 0;
		this._to = 0;
		this._value = key;
		this._valueLen = key.length;
		for (let pos = key.length - 1; pos >= 0; pos--, this._valueLen--) {
			const ch = this._value.charCodeAt(pos);
			if (!(ch === CharCode.Slash || this._splitOnBackslash && ch === CharCode.Backslash)) {
				break;
			}
		}

		return this.next();
	}

	hasNext(): boolean {
		return this._to < this._valueLen;
	}

	next(): this {
		// this._data = key.split(/[\\/]/).filter(s => !!s);
		this._from = this._to;
		let justSeps = true;
		for (; this._to < this._valueLen; this._to++) {
			const ch = this._value.charCodeAt(this._to);
			if (ch === CharCode.Slash || this._splitOnBackslash && ch === CharCode.Backslash) {
				if (justSeps) {
					this._from++;
				} else {
					break;
				}
			} else {
				justSeps = false;
			}
		}
		return this;
	}

	cmp(a: string): number {
		return this._caseSensitive
			? compareSubstring(a, this._value, 0, a.length, this._from, this._to)
			: compareSubstringIgnoreCase(a, this._value, 0, a.length, this._from, this._to);
	}

	value(): string {
		return this._value.substring(this._from, this._to);
	}
}

const enum UriIteratorState {
	Scheme = 1, Authority = 2, Path = 3, Query = 4, Fragment = 5
}

export class UriIterator implements IKeyIterator<URI> {

	private _pathIterator!: PathIterator;
	private _value!: URI;
	private _states: UriIteratorState[] = [];
	private _stateIdx: number = 0;

	constructor(
		private readonly _ignorePathCasing: (uri: URI) => boolean,
		private readonly _ignoreQueryAndFragment: (uri: URI) => boolean) { }

	reset(key: URI): this {
		this._value = key;
		this._states = [];
		if (this._value.scheme) {
			this._states.push(UriIteratorState.Scheme);
		}
		if (this._value.authority) {
			this._states.push(UriIteratorState.Authority);
		}
		if (this._value.path) {
			this._pathIterator = new PathIterator(false, !this._ignorePathCasing(key));
			this._pathIterator.reset(key.path);
			if (this._pathIterator.value()) {
				this._states.push(UriIteratorState.Path);
			}
		}
		if (!this._ignoreQueryAndFragment(key)) {
			if (this._value.query) {
				this._states.push(UriIteratorState.Query);
			}
			if (this._value.fragment) {
				this._states.push(UriIteratorState.Fragment);
			}
		}
		this._stateIdx = 0;
		return this;
	}

	next(): this {
		if (this._states[this._stateIdx] === UriIteratorState.Path && this._pathIterator.hasNext()) {
			this._pathIterator.next();
		} else {
			this._stateIdx += 1;
		}
		return this;
	}

	hasNext(): boolean {
		return (this._states[this._stateIdx] === UriIteratorState.Path && this._pathIterator.hasNext())
			|| this._stateIdx < this._states.length - 1;
	}

	cmp(a: string): number {
		if (this._states[this._stateIdx] === UriIteratorState.Scheme) {
			return compareIgnoreCase(a, this._value.scheme);
		} else if (this._states[this._stateIdx] === UriIteratorState.Authority) {
			return compareIgnoreCase(a, this._value.authority);
		} else if (this._states[this._stateIdx] === UriIteratorState.Path) {
			return this._pathIterator.cmp(a);
		} else if (this._states[this._stateIdx] === UriIteratorState.Query) {
			return compare(a, this._value.query);
		} else if (this._states[this._stateIdx] === UriIteratorState.Fragment) {
			return compare(a, this._value.fragment);
		}
		throw new Error();
	}

	value(): string {
		if (this._states[this._stateIdx] === UriIteratorState.Scheme) {
			return this._value.scheme;
		} else if (this._states[this._stateIdx] === UriIteratorState.Authority) {
			return this._value.authority;
		} else if (this._states[this._stateIdx] === UriIteratorState.Path) {
			return this._pathIterator.value();
		} else if (this._states[this._stateIdx] === UriIteratorState.Query) {
			return this._value.query;
		} else if (this._states[this._stateIdx] === UriIteratorState.Fragment) {
			return this._value.fragment;
		}
		throw new Error();
	}
}
class TernarySearchTreeNode<K, V> {
	height: number = 1;
	segment!: string;
	value: V | undefined;
	key: K | undefined;
	left: TernarySearchTreeNode<K, V> | undefined;
	mid: TernarySearchTreeNode<K, V> | undefined;
	right: TernarySearchTreeNode<K, V> | undefined;

	isEmpty(): boolean {
		return !this.left && !this.mid && !this.right && !this.value;
	}

	rotateLeft() {
		const tmp = this.right!;
		this.right = tmp.left;
		tmp.left = this;
		this.updateHeight();
		tmp.updateHeight();
		return tmp;
	}

	rotateRight() {
		const tmp = this.left!;
		this.left = tmp.right;
		tmp.right = this;
		this.updateHeight();
		tmp.updateHeight();
		return tmp;
	}

	updateHeight() {
		this.height = 1 + Math.max(this.heightLeft, this.heightRight);
	}

	balanceFactor() {
		return this.heightRight - this.heightLeft;
	}

	get heightLeft() {
		return this.left?.height ?? 0;
	}

	get heightRight() {
		return this.right?.height ?? 0;
	}
}

const enum Dir {
	Left = -1,
	Mid = 0,
	Right = 1
}

export class TernarySearchTree<K, V> {

	static forUris<E>(ignorePathCasing: (key: URI) => boolean = () => false, ignoreQueryAndFragment: (key: URI) => boolean = () => false): TernarySearchTree<URI, E> {
		return new TernarySearchTree<URI, E>(new UriIterator(ignorePathCasing, ignoreQueryAndFragment));
	}

	static forPaths<E>(ignorePathCasing = false): TernarySearchTree<string, E> {
		return new TernarySearchTree<string, E>(new PathIterator(undefined, !ignorePathCasing));
	}

	static forStrings<E>(): TernarySearchTree<string, E> {
		return new TernarySearchTree<string, E>(new StringIterator());
	}

	static forConfigKeys<E>(): TernarySearchTree<string, E> {
		return new TernarySearchTree<string, E>(new ConfigKeysIterator());
	}

	private _iter: IKeyIterator<K>;
	private _root: TernarySearchTreeNode<K, V> | undefined;

	constructor(segments: IKeyIterator<K>) {
		this._iter = segments;
	}

	clear(): void {
		this._root = undefined;
	}

	/**
	 * Fill the tree with the same value of the given keys
	 */
	fill(element: V, keys: readonly K[]): void;
	/**
	 * Fill the tree with given [key,value]-tuples
	 */
	fill(values: readonly [K, V][]): void;
	fill(values: readonly [K, V][] | V, keys?: readonly K[]): void {
		if (keys) {
			const arr = keys.slice(0);
			shuffle(arr);
			for (const k of arr) {
				this.set(k, (<V>values));
			}
		} else {
			const arr = (<[K, V][]>values).slice(0);
			shuffle(arr);
			for (const entry of arr) {
				this.set(entry[0], entry[1]);
			}
		}
	}

	set(key: K, element: V): V | undefined {
		const iter = this._iter.reset(key);
		let node: TernarySearchTreeNode<K, V>;

		if (!this._root) {
			this._root = new TernarySearchTreeNode<K, V>();
			this._root.segment = iter.value();
		}
		const stack: [Dir, TernarySearchTreeNode<K, V>][] = [];

		// find insert_node
		node = this._root;
		while (true) {
			const val = iter.cmp(node.segment);
			if (val > 0) {
				// left
				if (!node.left) {
					node.left = new TernarySearchTreeNode<K, V>();
					node.left.segment = iter.value();
				}
				stack.push([Dir.Left, node]);
				node = node.left;

			} else if (val < 0) {
				// right
				if (!node.right) {
					node.right = new TernarySearchTreeNode<K, V>();
					node.right.segment = iter.value();
				}
				stack.push([Dir.Right, node]);
				node = node.right;

			} else if (iter.hasNext()) {
				// mid
				iter.next();
				if (!node.mid) {
					node.mid = new TernarySearchTreeNode<K, V>();
					node.mid.segment = iter.value();
				}
				stack.push([Dir.Mid, node]);
				node = node.mid;
			} else {
				break;
			}
		}

		// set value
		const oldElement = node.value;
		node.value = element;
		node.key = key;

		// balance
		for (let i = stack.length - 1; i >= 0; i--) {
			const node = stack[i][1];

			node.updateHeight();
			const bf = node.balanceFactor();

			if (bf < -1 || bf > 1) {
				// needs rotate
				const d1 = stack[i][0];
				const d2 = stack[i + 1][0];

				if (d1 === Dir.Right && d2 === Dir.Right) {
					//right, right -> rotate left
					stack[i][1] = node.rotateLeft();

				} else if (d1 === Dir.Left && d2 === Dir.Left) {
					// left, left -> rotate right
					stack[i][1] = node.rotateRight();

				} else if (d1 === Dir.Right && d2 === Dir.Left) {
					// right, left -> double rotate right, left
					node.right = stack[i + 1][1] = stack[i + 1][1].rotateRight();
					stack[i][1] = node.rotateLeft();

				} else if (d1 === Dir.Left && d2 === Dir.Right) {
					// left, right -> double rotate left, right
					node.left = stack[i + 1][1] = stack[i + 1][1].rotateLeft();
					stack[i][1] = node.rotateRight();

				} else {
					throw new Error();
				}

				// patch path to parent
				if (i > 0) {
					switch (stack[i - 1][0]) {
						case Dir.Left:
							stack[i - 1][1].left = stack[i][1];
							break;
						case Dir.Right:
							stack[i - 1][1].right = stack[i][1];
							break;
						case Dir.Mid:
							stack[i - 1][1].mid = stack[i][1];
							break;
					}
				} else {
					this._root = stack[0][1];
				}
			}
		}

		return oldElement;
	}

	get(key: K): V | undefined {
		return this._getNode(key)?.value;
	}

	private _getNode(key: K) {
		const iter = this._iter.reset(key);
		let node = this._root;
		while (node) {
			const val = iter.cmp(node.segment);
			if (val > 0) {
				// left
				node = node.left;
			} else if (val < 0) {
				// right
				node = node.right;
			} else if (iter.hasNext()) {
				// mid
				iter.next();
				node = node.mid;
			} else {
				break;
			}
		}
		return node;
	}

	has(key: K): boolean {
		const node = this._getNode(key);
		return !(node?.value === undefined && node?.mid === undefined);
	}

	delete(key: K): void {
		return this._delete(key, false);
	}

	deleteSuperstr(key: K): void {
		return this._delete(key, true);
	}

	private _delete(key: K, superStr: boolean): void {
		const iter = this._iter.reset(key);
		const stack: [Dir, TernarySearchTreeNode<K, V>][] = [];
		let node = this._root;

		// find node
		while (node) {
			const val = iter.cmp(node.segment);
			if (val > 0) {
				// left
				stack.push([Dir.Left, node]);
				node = node.left;
			} else if (val < 0) {
				// right
				stack.push([Dir.Right, node]);
				node = node.right;
			} else if (iter.hasNext()) {
				// mid
				iter.next();
				stack.push([Dir.Mid, node]);
				node = node.mid;
			} else {
				break;
			}
		}

		if (!node) {
			// node not found
			return;
		}

		if (superStr) {
			// removing children, reset height
			node.left = undefined;
			node.mid = undefined;
			node.right = undefined;
			node.height = 1;
		} else {
			// removing element
			node.key = undefined;
			node.value = undefined;
		}

		// BST node removal
		if (!node.mid && !node.value) {
			if (node.left && node.right) {
				// full node
				// replace deleted-node with the min-node of the right branch.
				// If there is no true min-node leave things as they are
				const min = this._min(node.right);
				if (min.key) {
					const { key, value, segment } = min;
					this._delete(min.key, false);
					node.key = key;
					node.value = value;
					node.segment = segment;
				}

			} else {
				// empty or half empty
				const newChild = node.left ?? node.right;
				if (stack.length > 0) {
					const [dir, parent] = stack[stack.length - 1];
					switch (dir) {
						case Dir.Left: parent.left = newChild; break;
						case Dir.Mid: parent.mid = newChild; break;
						case Dir.Right: parent.right = newChild; break;
					}
				} else {
					this._root = newChild;
				}
			}
		}

		// AVL balance
		for (let i = stack.length - 1; i >= 0; i--) {
			const node = stack[i][1];

			node.updateHeight();
			const bf = node.balanceFactor();
			if (bf > 1) {
				// right heavy
				if (node.right!.balanceFactor() >= 0) {
					// right, right -> rotate left
					stack[i][1] = node.rotateLeft();
				} else {
					// right, left -> double rotate
					node.right = node.right!.rotateRight();
					stack[i][1] = node.rotateLeft();
				}

			} else if (bf < -1) {
				// left heavy
				if (node.left!.balanceFactor() <= 0) {
					// left, left -> rotate right
					stack[i][1] = node.rotateRight();
				} else {
					// left, right -> double rotate
					node.left = node.left!.rotateLeft();
					stack[i][1] = node.rotateRight();
				}
			}

			// patch path to parent
			if (i > 0) {
				switch (stack[i - 1][0]) {
					case Dir.Left:
						stack[i - 1][1].left = stack[i][1];
						break;
					case Dir.Right:
						stack[i - 1][1].right = stack[i][1];
						break;
					case Dir.Mid:
						stack[i - 1][1].mid = stack[i][1];
						break;
				}
			} else {
				this._root = stack[0][1];
			}
		}
	}

	private _min(node: TernarySearchTreeNode<K, V>): TernarySearchTreeNode<K, V> {
		while (node.left) {
			node = node.left;
		}
		return node;
	}

	findSubstr(key: K): V | undefined {
		const iter = this._iter.reset(key);
		let node = this._root;
		let candidate: V | undefined = undefined;
		while (node) {
			const val = iter.cmp(node.segment);
			if (val > 0) {
				// left
				node = node.left;
			} else if (val < 0) {
				// right
				node = node.right;
			} else if (iter.hasNext()) {
				// mid
				iter.next();
				candidate = node.value || candidate;
				node = node.mid;
			} else {
				break;
			}
		}
		return node && node.value || candidate;
	}

	findSuperstr(key: K): IterableIterator<[K, V]> | undefined {
		return this._findSuperstrOrElement(key, false);
	}

	private _findSuperstrOrElement(key: K, allowValue: true): IterableIterator<[K, V]> | V | undefined;
	private _findSuperstrOrElement(key: K, allowValue: false): IterableIterator<[K, V]> | undefined;
	private _findSuperstrOrElement(key: K, allowValue: boolean): IterableIterator<[K, V]> | V | undefined {
		const iter = this._iter.reset(key);
		let node = this._root;
		while (node) {
			const val = iter.cmp(node.segment);
			if (val > 0) {
				// left
				node = node.left;
			} else if (val < 0) {
				// right
				node = node.right;
			} else if (iter.hasNext()) {
				// mid
				iter.next();
				node = node.mid;
			} else {
				// collect
				if (!node.mid) {
					if (allowValue) {
						return node.value;
					} else {
						return undefined;
					}
				} else {
					return this._entries(node.mid);
				}
			}
		}
		return undefined;
	}

	hasElementOrSubtree(key: K): boolean {
		return this._findSuperstrOrElement(key, true) !== undefined;
	}

	forEach(callback: (value: V, index: K) => any): void {
		for (const [key, value] of this) {
			callback(value, key);
		}
	}

	*[Symbol.iterator](): IterableIterator<[K, V]> {
		yield* this._entries(this._root);
	}

	private _entries(node: TernarySearchTreeNode<K, V> | undefined): IterableIterator<[K, V]> {
		const result: [K, V][] = [];
		this._dfsEntries(node, result);
		return result[Symbol.iterator]();
	}

	private _dfsEntries(node: TernarySearchTreeNode<K, V> | undefined, bucket: [K, V][]) {
		// DFS
		if (!node) {
			return;
		}
		if (node.left) {
			this._dfsEntries(node.left, bucket);
		}
		if (node.value) {
			bucket.push([node.key!, node.value]);
		}
		if (node.mid) {
			this._dfsEntries(node.mid, bucket);
		}
		if (node.right) {
			this._dfsEntries(node.right, bucket);
		}
	}

	// for debug/testing
	_isBalanced(): boolean {
		const nodeIsBalanced = (node: TernarySearchTreeNode<any, any> | undefined): boolean => {
			if (!node) {
				return true;
			}
			const bf = node.balanceFactor();
			if (bf < -1 || bf > 1) {
				return false;
			}
			return nodeIsBalanced(node.left) && nodeIsBalanced(node.right);
		};
		return nodeIsBalanced(this._root);
	}
}
