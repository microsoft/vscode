/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ISpliceable } from 'vs/base/common/sequence';
import { IIterator } from 'vs/base/common/iterator';

export type Location = number[];

export interface ITreeElement<T> {
	readonly element: T;
	readonly children: ITreeElement<T>[];
}

export interface ITreeNode<T> {
	readonly element: T;
	readonly depth: number;
}

class TreeNodeIterator<T> implements IIterator<ITreeElement<T>> {

	private stack: TreeNode<T>[] = [];

	constructor(node: TreeNode<T>) {
		this.stack.push(node);
	}

	next(): { readonly done: boolean; readonly value: ITreeElement<T>; } {
		const value = this.stack.pop();

		for (let i = value.children.length - 1; i >= 0; i--) {
			this.stack.push(value.children[i]);
		}

		return { done: this.stack.length === 0, value };
	}
}

class TreeNodesIterator<T> implements IIterator<ITreeElement<T>> {

	private index = 0;

	constructor(private iterators: TreeNodeIterator<T>[]) { }

	next(): { readonly done: boolean; readonly value: ITreeElement<T> | undefined; } {
		if (this.index >= this.iterators.length) {
			return { done: true, value: undefined };
		}

		const result = this.iterators[this.index].next();

		if (result.done) {
			this.index++;
		}

		return result;
	}
}

class TreeNode<T> implements ITreeNode<T> {

	static createRoot<T>(): TreeNode<T> {
		const node = new TreeNode<T>();
		node.children = [];
		node.count = 1;
		node.depth = 0;
		return node;
	}

	static createNode<T>(treeElement: ITreeElement<T>, depth: number, list: ITreeNode<T>[]): TreeNode<T> {
		const node = new TreeNode<T>();
		list.push(node);

		let count = 1;
		const children: TreeNode<T>[] = [];

		for (const element of treeElement.children) {
			const node = TreeNode.createNode<T>(element, depth + 1, list);
			children.push(node);
			count += node.count;
		}

		node.element = treeElement.element;
		node.children = children;
		node.count = count;
		node.depth = depth;

		return node;
	}

	element: T;
	children: TreeNode<T>[];
	count: number;
	depth: number;

	private constructor() { }

	splice(index: number, deleteCount: number, elements: ITreeElement<T>[]): { listDeleteCount: number; listElements: ITreeNode<T>[]; deletedIterator: IIterator<ITreeElement<T>>; } {
		const listElements = [] as ITreeNode<T>[];

		const added = elements.map(e => TreeNode.createNode<T>(e, this.depth + 1, listElements));
		const listAddCount = added.reduce((r, n) => r + n.count, 0);

		const deleted = this.children.splice(index, deleteCount, ...added);
		const deletedIterator = new TreeNodesIterator(deleted.map(node => new TreeNodeIterator(node)));
		const listDeleteCount = deleted.reduce((r, n) => r + n.count, 0);

		this.count += listAddCount - listDeleteCount;
		return { listDeleteCount, listElements, deletedIterator };
	}
}

export class TreeModel<T> {

	private root = TreeNode.createRoot<T>();

	constructor(private spliceable: ISpliceable<ITreeNode<T>>) { }

	splice(start: Location, deleteCount: number, elements: ITreeElement<T>[] = []): IIterator<ITreeElement<T>> {
		if (start.length === 0) {
			throw new Error('Invalid tree location');
		}

		const { parentNode, parentListIndex } = this.findParentNode(start);
		const lastIndex = start[start.length - 1];
		const { listDeleteCount, listElements, deletedIterator } = parentNode.splice(lastIndex, deleteCount, elements);

		this.spliceable.splice(parentListIndex + lastIndex, listDeleteCount, listElements);

		return deletedIterator;
	}

	getElement(location: Location): T | undefined {
		const node = this.findNode(location);
		return node && node.element;
	}

	private findNode(location: Location): TreeNode<T> {
		const { parentNode } = this.findParentNode(location);
		const lastIndex = location[location.length - 1];

		return parentNode.children[lastIndex];
	}

	private findParentNode(location: Location, node: TreeNode<T> = this.root, listIndex: number = 0): { parentNode: TreeNode<T>; parentListIndex: number } {
		if (location.length === 1) {
			return { parentNode: node, parentListIndex: listIndex };
		}

		const [i, ...rest] = location;
		const limit = Math.min(i, node.children.length);

		for (let j = 0; j < limit; j++) {
			listIndex += node.children[j].count;
		}

		return this.findParentNode(rest, node.children[i], listIndex + 1);
	}
}

// type TrieNode<T> = TrieNode<T>[] | T;

// [[], [], T]
// { key: 1, children: {} }
// { 1: { 2: {} } }

type TrieNodeMap<T> = { [key: string]: TrieNode<T> };
type TrieNode<T> = { value: T | undefined, children: TrieNodeMap<T> };

export class Trie<T> {

	private root: TrieNode<T>;

	constructor() {
		this.clear();
	}

	set(path: string[], element: T): void {
		if (path.length === 0) {
			throw new Error('Invalid path length');
		}

		let node = this.root;

		for (const key of path) {
			let child = node.children[key];

			if (!child) {
				child = node.children[key] = { value: undefined, children: Object.create(null) };
			}

			node = child;
		}

		node.value = element;
	}

	get(path: string[]): T | undefined {
		if (path.length === 0) {
			throw new Error('Invalid path length');
		}

		let node = this.root;

		for (const key of path) {
			let child = node.children[key];

			if (!child) {
				return undefined;
			}

			node = child;
		}

		return node.value;
	}

	delete(path: string[]): void {
		if (path.length === 0) {
			throw new Error('Invalid path length');
		}

		let nodePath: { key: string, node: TrieNode<T> }[] = [];
		let node = this.root;

		for (const key of path) {
			let child = node.children[key];

			if (!child) {
				return;
			}

			nodePath.push({ key, node });
			node = child;
		}

		for (let i = nodePath.length - 1; i >= 0; i--) {
			const { key, node } = nodePath[i];

			delete node.children[key];

			if (Object.keys(node.children).length > 0) {
				return;
			}
		}
	}

	clear(): void {
		this.root = { value: undefined, children: {} };
	}
}

export class CollapsibleTreeModel<T> {

	private model: TreeModel<T>;

	constructor(spliceable: ISpliceable<ITreeNode<T>>) {
		this.model = new TreeModel<T>(spliceable);
	}

	splice(start: Location, deleteCount: number, elements: ITreeElement<T>[]): void {
		this.model.splice(start, deleteCount, elements);
	}

	expand(location: Location): boolean {

		// this.model.splice(start, deleteCount, elements);
		// const element = this.model.getElement()
		return false;
	}

	collapse(location: Location): boolean {
		// const element = this.model.getElement(location);
		// const collapsedElement: ITreeElement<T> = { element, children: [] };
		// const deletedIterator = this.model.splice(location, 1, [collapsedElement]);

		return false;
	}
}