/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { shuffle } from 'vs/base/common/arrays';
import { CharCode } from 'vs/base/common/charCode';
import { compare, compareIgnoreCase, compareSubstring, compareSubstringIgnoreCase } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';

export function getOrSet<K, V>(map: Map<K, V>, key: K, value: V): V {
	let result = map.get(key);
	if (result === undefined) {
		result = value;
		map.set(key, result);
	}

	return result;
}

export function mapToString<K, V>(map: Map<K, V>): string {
	const entries: string[] = [];
	map.forEach((value, key) => {
		entries.push(`${key} => ${value}`);
	});

	return `Map(${map.size}) {${entries.join(', ')}}`;
}

export function setToString<K>(set: Set<K>): string {
	const entries: K[] = [];
	set.forEach(value => {
		entries.push(value);
	});

	return `Set(${set.size}) {${entries.join(', ')}}`;
}

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
	Right = 1,
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
			for (let k of arr) {
				this.set(k, (<V>values));
			}
		} else {
			const arr = (<[K, V][]>values).slice(0);
			shuffle(arr);
			for (let entry of arr) {
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
				const min = this._min(node.right);
				const { key, value, segment } = min;
				this._delete(min.key!, false);
				node.key = key;
				node.value = value;
				node.segment = segment;

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
					return undefined;
				} else {
					return this._entries(node.mid);
				}
			}
		}
		return undefined;
	}

	forEach(callback: (value: V, index: K) => any): void {
		for (const [key, value] of this) {
			callback(value, key);
		}
	}

	*[Symbol.iterator](): IterableIterator<[K, V]> {
		yield* this._entries(this._root);
	}

	private *_entries(node: TernarySearchTreeNode<K, V> | undefined): IterableIterator<[K, V]> {
		// DFS
		if (!node) {
			return;
		}
		if (node.left) {
			yield* this._entries(node.left);
		}
		if (node.value) {
			yield [node.key!, node.value];
		}
		if (node.mid) {
			yield* this._entries(node.mid);
		}
		if (node.right) {
			yield* this._entries(node.right);
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

interface ResourceMapKeyFn {
	(resource: URI): string;
}

class ResourceMapEntry<T> {
	constructor(readonly uri: URI, readonly value: T) { }
}

export class ResourceMap<T> implements Map<URI, T> {

	private static readonly defaultToKey = (resource: URI) => resource.toString();

	readonly [Symbol.toStringTag] = 'ResourceMap';

	private readonly map: Map<string, ResourceMapEntry<T>>;
	private readonly toKey: ResourceMapKeyFn;

	/**
	 *
	 * @param toKey Custom uri identity function, e.g use an existing `IExtUri#getComparison`-util
	 */
	constructor(toKey?: ResourceMapKeyFn);

	/**
	 *
	 * @param other Another resource which this maps is created from
	 * @param toKey Custom uri identity function, e.g use an existing `IExtUri#getComparison`-util
	 */
	constructor(other?: ResourceMap<T>, toKey?: ResourceMapKeyFn);

	constructor(mapOrKeyFn?: ResourceMap<T> | ResourceMapKeyFn, toKey?: ResourceMapKeyFn) {
		if (mapOrKeyFn instanceof ResourceMap) {
			this.map = new Map(mapOrKeyFn.map);
			this.toKey = toKey ?? ResourceMap.defaultToKey;
		} else {
			this.map = new Map();
			this.toKey = mapOrKeyFn ?? ResourceMap.defaultToKey;
		}
	}

	set(resource: URI, value: T): this {
		this.map.set(this.toKey(resource), new ResourceMapEntry(resource, value));
		return this;
	}

	get(resource: URI): T | undefined {
		return this.map.get(this.toKey(resource))?.value;
	}

	has(resource: URI): boolean {
		return this.map.has(this.toKey(resource));
	}

	get size(): number {
		return this.map.size;
	}

	clear(): void {
		this.map.clear();
	}

	delete(resource: URI): boolean {
		return this.map.delete(this.toKey(resource));
	}

	forEach(clb: (value: T, key: URI, map: Map<URI, T>) => void, thisArg?: any): void {
		if (typeof thisArg !== 'undefined') {
			clb = clb.bind(thisArg);
		}
		for (let [_, entry] of this.map) {
			clb(entry.value, entry.uri, <any>this);
		}
	}

	*values(): IterableIterator<T> {
		for (let entry of this.map.values()) {
			yield entry.value;
		}
	}

	*keys(): IterableIterator<URI> {
		for (let entry of this.map.values()) {
			yield entry.uri;
		}
	}

	*entries(): IterableIterator<[URI, T]> {
		for (let entry of this.map.values()) {
			yield [entry.uri, entry.value];
		}
	}

	*[Symbol.iterator](): IterableIterator<[URI, T]> {
		for (let [, entry] of this.map) {
			yield [entry.uri, entry.value];
		}
	}
}

export class ResourceSet implements Set<URI> {

	readonly [Symbol.toStringTag]: string = 'ResourceSet';

	private readonly _map: ResourceMap<URI>;

	constructor(toKey?: ResourceMapKeyFn);
	constructor(entries: readonly URI[], toKey?: ResourceMapKeyFn);
	constructor(entriesOrKey?: readonly URI[] | ResourceMapKeyFn, toKey?: ResourceMapKeyFn) {
		if (!entriesOrKey || typeof entriesOrKey === 'function') {
			this._map = new ResourceMap(entriesOrKey);
		} else {
			this._map = new ResourceMap(toKey);
			entriesOrKey.forEach(this.add, this);
		}
	}


	get size(): number {
		return this._map.size;
	}

	add(value: URI): this {
		this._map.set(value, value);
		return this;
	}

	clear(): void {
		this._map.clear();
	}

	delete(value: URI): boolean {
		return this._map.delete(value);
	}

	forEach(callbackfn: (value: URI, value2: URI, set: Set<URI>) => void, thisArg?: any): void {
		this._map.forEach((_value, key) => callbackfn.call(thisArg, key, key, this));
	}

	has(value: URI): boolean {
		return this._map.has(value);
	}

	entries(): IterableIterator<[URI, URI]> {
		return this._map.entries();
	}

	keys(): IterableIterator<URI> {
		return this._map.keys();
	}

	values(): IterableIterator<URI> {
		return this._map.keys();
	}

	[Symbol.iterator](): IterableIterator<URI> {
		return this.keys();
	}
}


interface Item<K, V> {
	previous: Item<K, V> | undefined;
	next: Item<K, V> | undefined;
	key: K;
	value: V;
}

export const enum Touch {
	None = 0,
	AsOld = 1,
	AsNew = 2
}

export class LinkedMap<K, V> implements Map<K, V> {

	readonly [Symbol.toStringTag] = 'LinkedMap';

	private _map: Map<K, Item<K, V>>;
	private _head: Item<K, V> | undefined;
	private _tail: Item<K, V> | undefined;
	private _size: number;

	private _state: number;

	constructor() {
		this._map = new Map<K, Item<K, V>>();
		this._head = undefined;
		this._tail = undefined;
		this._size = 0;
		this._state = 0;
	}

	clear(): void {
		this._map.clear();
		this._head = undefined;
		this._tail = undefined;
		this._size = 0;
		this._state++;
	}

	isEmpty(): boolean {
		return !this._head && !this._tail;
	}

	get size(): number {
		return this._size;
	}

	get first(): V | undefined {
		return this._head?.value;
	}

	get last(): V | undefined {
		return this._tail?.value;
	}

	has(key: K): boolean {
		return this._map.has(key);
	}

	get(key: K, touch: Touch = Touch.None): V | undefined {
		const item = this._map.get(key);
		if (!item) {
			return undefined;
		}
		if (touch !== Touch.None) {
			this.touch(item, touch);
		}
		return item.value;
	}

	set(key: K, value: V, touch: Touch = Touch.None): this {
		let item = this._map.get(key);
		if (item) {
			item.value = value;
			if (touch !== Touch.None) {
				this.touch(item, touch);
			}
		} else {
			item = { key, value, next: undefined, previous: undefined };
			switch (touch) {
				case Touch.None:
					this.addItemLast(item);
					break;
				case Touch.AsOld:
					this.addItemFirst(item);
					break;
				case Touch.AsNew:
					this.addItemLast(item);
					break;
				default:
					this.addItemLast(item);
					break;
			}
			this._map.set(key, item);
			this._size++;
		}
		return this;
	}

	delete(key: K): boolean {
		return !!this.remove(key);
	}

	remove(key: K): V | undefined {
		const item = this._map.get(key);
		if (!item) {
			return undefined;
		}
		this._map.delete(key);
		this.removeItem(item);
		this._size--;
		return item.value;
	}

	shift(): V | undefined {
		if (!this._head && !this._tail) {
			return undefined;
		}
		if (!this._head || !this._tail) {
			throw new Error('Invalid list');
		}
		const item = this._head;
		this._map.delete(item.key);
		this.removeItem(item);
		this._size--;
		return item.value;
	}

	forEach(callbackfn: (value: V, key: K, map: LinkedMap<K, V>) => void, thisArg?: any): void {
		const state = this._state;
		let current = this._head;
		while (current) {
			if (thisArg) {
				callbackfn.bind(thisArg)(current.value, current.key, this);
			} else {
				callbackfn(current.value, current.key, this);
			}
			if (this._state !== state) {
				throw new Error(`LinkedMap got modified during iteration.`);
			}
			current = current.next;
		}
	}

	keys(): IterableIterator<K> {
		const map = this;
		const state = this._state;
		let current = this._head;
		const iterator: IterableIterator<K> = {
			[Symbol.iterator]() {
				return iterator;
			},
			next(): IteratorResult<K> {
				if (map._state !== state) {
					throw new Error(`LinkedMap got modified during iteration.`);
				}
				if (current) {
					const result = { value: current.key, done: false };
					current = current.next;
					return result;
				} else {
					return { value: undefined, done: true };
				}
			}
		};
		return iterator;
	}

	values(): IterableIterator<V> {
		const map = this;
		const state = this._state;
		let current = this._head;
		const iterator: IterableIterator<V> = {
			[Symbol.iterator]() {
				return iterator;
			},
			next(): IteratorResult<V> {
				if (map._state !== state) {
					throw new Error(`LinkedMap got modified during iteration.`);
				}
				if (current) {
					const result = { value: current.value, done: false };
					current = current.next;
					return result;
				} else {
					return { value: undefined, done: true };
				}
			}
		};
		return iterator;
	}

	entries(): IterableIterator<[K, V]> {
		const map = this;
		const state = this._state;
		let current = this._head;
		const iterator: IterableIterator<[K, V]> = {
			[Symbol.iterator]() {
				return iterator;
			},
			next(): IteratorResult<[K, V]> {
				if (map._state !== state) {
					throw new Error(`LinkedMap got modified during iteration.`);
				}
				if (current) {
					const result: IteratorResult<[K, V]> = { value: [current.key, current.value], done: false };
					current = current.next;
					return result;
				} else {
					return { value: undefined, done: true };
				}
			}
		};
		return iterator;
	}

	[Symbol.iterator](): IterableIterator<[K, V]> {
		return this.entries();
	}

	protected trimOld(newSize: number) {
		if (newSize >= this.size) {
			return;
		}
		if (newSize === 0) {
			this.clear();
			return;
		}
		let current = this._head;
		let currentSize = this.size;
		while (current && currentSize > newSize) {
			this._map.delete(current.key);
			current = current.next;
			currentSize--;
		}
		this._head = current;
		this._size = currentSize;
		if (current) {
			current.previous = undefined;
		}
		this._state++;
	}

	private addItemFirst(item: Item<K, V>): void {
		// First time Insert
		if (!this._head && !this._tail) {
			this._tail = item;
		} else if (!this._head) {
			throw new Error('Invalid list');
		} else {
			item.next = this._head;
			this._head.previous = item;
		}
		this._head = item;
		this._state++;
	}

	private addItemLast(item: Item<K, V>): void {
		// First time Insert
		if (!this._head && !this._tail) {
			this._head = item;
		} else if (!this._tail) {
			throw new Error('Invalid list');
		} else {
			item.previous = this._tail;
			this._tail.next = item;
		}
		this._tail = item;
		this._state++;
	}

	private removeItem(item: Item<K, V>): void {
		if (item === this._head && item === this._tail) {
			this._head = undefined;
			this._tail = undefined;
		}
		else if (item === this._head) {
			// This can only happen if size === 1 which is handled
			// by the case above.
			if (!item.next) {
				throw new Error('Invalid list');
			}
			item.next.previous = undefined;
			this._head = item.next;
		}
		else if (item === this._tail) {
			// This can only happen if size === 1 which is handled
			// by the case above.
			if (!item.previous) {
				throw new Error('Invalid list');
			}
			item.previous.next = undefined;
			this._tail = item.previous;
		}
		else {
			const next = item.next;
			const previous = item.previous;
			if (!next || !previous) {
				throw new Error('Invalid list');
			}
			next.previous = previous;
			previous.next = next;
		}
		item.next = undefined;
		item.previous = undefined;
		this._state++;
	}

	private touch(item: Item<K, V>, touch: Touch): void {
		if (!this._head || !this._tail) {
			throw new Error('Invalid list');
		}
		if ((touch !== Touch.AsOld && touch !== Touch.AsNew)) {
			return;
		}

		if (touch === Touch.AsOld) {
			if (item === this._head) {
				return;
			}

			const next = item.next;
			const previous = item.previous;

			// Unlink the item
			if (item === this._tail) {
				// previous must be defined since item was not head but is tail
				// So there are more than on item in the map
				previous!.next = undefined;
				this._tail = previous;
			}
			else {
				// Both next and previous are not undefined since item was neither head nor tail.
				next!.previous = previous;
				previous!.next = next;
			}

			// Insert the node at head
			item.previous = undefined;
			item.next = this._head;
			this._head.previous = item;
			this._head = item;
			this._state++;
		} else if (touch === Touch.AsNew) {
			if (item === this._tail) {
				return;
			}

			const next = item.next;
			const previous = item.previous;

			// Unlink the item.
			if (item === this._head) {
				// next must be defined since item was not tail but is head
				// So there are more than on item in the map
				next!.previous = undefined;
				this._head = next;
			} else {
				// Both next and previous are not undefined since item was neither head nor tail.
				next!.previous = previous;
				previous!.next = next;
			}
			item.next = undefined;
			item.previous = this._tail;
			this._tail.next = item;
			this._tail = item;
			this._state++;
		}
	}

	toJSON(): [K, V][] {
		const data: [K, V][] = [];

		this.forEach((value, key) => {
			data.push([key, value]);
		});

		return data;
	}

	fromJSON(data: [K, V][]): void {
		this.clear();

		for (const [key, value] of data) {
			this.set(key, value);
		}
	}
}

export class LRUCache<K, V> extends LinkedMap<K, V> {

	private _limit: number;
	private _ratio: number;

	constructor(limit: number, ratio: number = 1) {
		super();
		this._limit = limit;
		this._ratio = Math.min(Math.max(0, ratio), 1);
	}

	get limit(): number {
		return this._limit;
	}

	set limit(limit: number) {
		this._limit = limit;
		this.checkTrim();
	}

	get ratio(): number {
		return this._ratio;
	}

	set ratio(ratio: number) {
		this._ratio = Math.min(Math.max(0, ratio), 1);
		this.checkTrim();
	}

	override get(key: K, touch: Touch = Touch.AsNew): V | undefined {
		return super.get(key, touch);
	}

	peek(key: K): V | undefined {
		return super.get(key, Touch.None);
	}

	override set(key: K, value: V): this {
		super.set(key, value, Touch.AsNew);
		this.checkTrim();
		return this;
	}

	private checkTrim() {
		if (this.size > this._limit) {
			this.trimOld(Math.round(this._limit * this._ratio));
		}
	}
}

/**
 * Wraps the map in type that only implements readonly properties. Useful
 * in the extension host to prevent the consumer from making any mutations.
 */
export class ReadonlyMapView<K, V> implements ReadonlyMap<K, V>{
	readonly #source: ReadonlyMap<K, V>;

	public get size() {
		return this.#source.size;
	}

	constructor(source: ReadonlyMap<K, V>) {
		this.#source = source;
	}

	forEach(callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: any): void {
		this.#source.forEach(callbackfn, thisArg);
	}

	get(key: K): V | undefined {
		return this.#source.get(key);
	}

	has(key: K): boolean {
		return this.#source.has(key);
	}

	entries(): IterableIterator<[K, V]> {
		return this.#source.entries();
	}

	keys(): IterableIterator<K> {
		return this.#source.keys();
	}

	values(): IterableIterator<V> {
		return this.#source.values();
	}

	[Symbol.iterator](): IterableIterator<[K, V]> {
		return this.#source.entries();
	}
}
