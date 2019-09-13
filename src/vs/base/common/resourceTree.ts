/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { memoize } from 'vs/base/common/decorators';
import * as paths from 'vs/base/common/path';
import { Iterator } from 'vs/base/common/iterator';

export interface ILeafNode<T> {
	readonly path: string;
	readonly name: string;
	readonly element: T;
}

export interface IBranchNode<T> {
	readonly path: string;
	readonly name: string;
	readonly size: number;
	readonly children: Iterator<INode<T>>;
	get(childName: string): INode<T> | undefined;
}

export type INode<T> = IBranchNode<T> | ILeafNode<T>;

export function isBranchNode<T>(obj: any): obj is IBranchNode<T> {
	return obj instanceof BranchNode;
}

// Internals

class Node {

	@memoize
	get name(): string { return paths.posix.basename(this.path); }

	constructor(readonly path: string) { }
}

class BranchNode<T> extends Node implements IBranchNode<T> {

	private _children = new Map<string, BranchNode<T> | LeafNode<T>>();

	get size(): number {
		return this._children.size;
	}

	get children(): Iterator<BranchNode<T> | LeafNode<T>> {
		return Iterator.fromIterableIterator(this._children.values());
	}

	get(path: string): BranchNode<T> | LeafNode<T> | undefined {
		return this._children.get(path);
	}

	set(path: string, child: BranchNode<T> | LeafNode<T>): void {
		this._children.set(path, child);
	}

	delete(path: string): void {
		this._children.delete(path);
	}
}

class LeafNode<T> extends Node implements ILeafNode<T> {

	constructor(path: string, readonly element: T) {
		super(path);
	}
}

export class ResourceTree<T extends NonNullable<any>> {

	readonly root = new BranchNode<T>('');

	constructor() { }

	add(uri: URI, element: T): void {
		const parts = uri.fsPath.split(/[\\\/]/).filter(p => !!p);
		let node = this.root;
		let path = this.root.path;

		for (let i = 0; i < parts.length; i++) {
			const name = parts[i];
			path = path + '/' + name;

			let child = node.get(name);

			if (!child) {
				if (i < parts.length - 1) {
					child = new BranchNode(path);
					node.set(name, child);
				} else {
					child = new LeafNode(path, element);
					node.set(name, child);
					return;
				}
			}

			if (!(child instanceof BranchNode)) {
				if (i < parts.length - 1) {
					throw new Error('Inconsistent tree: can\'t override leaf with branch.');
				}

				// replace
				node.set(name, new LeafNode(path, element));
				return;
			} else if (i === parts.length - 1) {
				throw new Error('Inconsistent tree: can\'t override branch with leaf.');
			}

			node = child;
		}
	}

	delete(uri: URI): T | undefined {
		const parts = uri.fsPath.split(/[\\\/]/).filter(p => !!p);
		return this._delete(this.root, parts, 0);
	}

	private _delete(node: BranchNode<T>, parts: string[], index: number): T | undefined {
		const name = parts[index];
		const child = node.get(name);

		if (!child) {
			return undefined;
		}

		// not at end
		if (index < parts.length - 1) {
			if (child instanceof BranchNode) {
				const result = this._delete(child, parts, index + 1);

				if (typeof result !== 'undefined' && child.size === 0) {
					node.delete(name);
				}

				return result;
			} else {
				throw new Error('Inconsistent tree: Expected a branch, found a leaf instead.');
			}
		}

		//at end
		if (child instanceof BranchNode) {
			// TODO: maybe we can allow this
			throw new Error('Inconsistent tree: Expected a leaf, found a branch instead.');
		}

		node.delete(name);
		return child.element;
	}
}
