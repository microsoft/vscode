/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { memoize } from 'vs/base/common/decorators';
import * as paths from 'vs/base/common/path';
import { Iterator } from 'vs/base/common/iterator';
import { relativePath, joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { mapValues } from 'vs/base/common/collections';
import { PathIterator } from 'vs/base/common/map';

export interface ILeafNode<T, C = void> {
	readonly uri: URI;
	readonly relativePath: string;
	readonly name: string;
	readonly element: T;
	readonly context: C;
}

export interface IBranchNode<T, C = void> {
	readonly uri: URI;
	readonly relativePath: string;
	readonly name: string;
	readonly size: number;
	readonly children: Iterator<INode<T, C>>;
	readonly parent: IBranchNode<T, C> | undefined;
	readonly context: C;
	get(childName: string): INode<T, C> | undefined;
}

export type INode<T, C> = IBranchNode<T, C> | ILeafNode<T, C>;

// Internals

class Node<C> {

	@memoize
	get name(): string { return paths.posix.basename(this.relativePath); }

	constructor(readonly uri: URI, readonly relativePath: string, readonly context: C) { }
}

class BranchNode<T, C> extends Node<C> implements IBranchNode<T, C> {

	private _children = new Map<string, BranchNode<T, C> | LeafNode<T, C>>();

	get size(): number {
		return this._children.size;
	}

	get children(): Iterator<BranchNode<T, C> | LeafNode<T, C>> {
		return Iterator.fromArray(mapValues(this._children));
	}

	constructor(uri: URI, relativePath: string, context: C, readonly parent: IBranchNode<T, C> | undefined = undefined) {
		super(uri, relativePath, context);
	}

	get(path: string): BranchNode<T, C> | LeafNode<T, C> | undefined {
		return this._children.get(path);
	}

	set(path: string, child: BranchNode<T, C> | LeafNode<T, C>): void {
		this._children.set(path, child);
	}

	delete(path: string): void {
		this._children.delete(path);
	}

	clear(): void {
		this._children.clear();
	}
}

class LeafNode<T, C> extends Node<C> implements ILeafNode<T, C> {

	constructor(uri: URI, path: string, context: C, readonly element: T) {
		super(uri, path, context);
	}
}

function collect<T, C>(node: INode<T, C>, result: T[]): T[] {
	if (ResourceTree.isBranchNode(node)) {
		Iterator.forEach(node.children, child => collect(child, result));
	} else {
		result.push(node.element);
	}

	return result;
}

export class ResourceTree<T extends NonNullable<any>, C> {

	readonly root: BranchNode<T, C>;

	static isBranchNode<T, C>(obj: any): obj is IBranchNode<T, C> {
		return obj instanceof BranchNode;
	}

	static getRoot<T, C>(node: IBranchNode<T, C>): IBranchNode<T, C> {
		while (node.parent) {
			node = node.parent;
		}

		return node;
	}

	static collect<T, C>(node: INode<T, C>): T[] {
		return collect(node, []);
	}

	constructor(context: C, rootURI: URI = URI.file('/')) {
		this.root = new BranchNode(rootURI, '', context);
	}

	add(uri: URI, element: T): void {
		const key = relativePath(this.root.uri, uri) || uri.fsPath;
		const iterator = new PathIterator(false).reset(key);
		let node = this.root;
		let path = '';

		while (true) {
			const name = iterator.value();
			path = path + '/' + name;

			let child = node.get(name);

			if (!child) {
				if (iterator.hasNext()) {
					child = new BranchNode(joinPath(this.root.uri, path), path, this.root.context, node);
					node.set(name, child);
				} else {
					child = new LeafNode(uri, path, this.root.context, element);
					node.set(name, child);
					return;
				}
			}

			if (!(child instanceof BranchNode)) {
				if (iterator.hasNext()) {
					throw new Error('Inconsistent tree: can\'t override leaf with branch.');
				}

				// replace
				node.set(name, new LeafNode(uri, path, this.root.context, element));
				return;
			} else if (!iterator.hasNext()) {
				throw new Error('Inconsistent tree: can\'t override branch with leaf.');
			}

			node = child;

			if (!iterator.hasNext()) {
				return;
			}

			iterator.next();
		}
	}

	delete(uri: URI): T | undefined {
		const key = relativePath(this.root.uri, uri) || uri.fsPath;
		const iterator = new PathIterator(false).reset(key);
		return this._delete(this.root, iterator);
	}

	private _delete(node: BranchNode<T, C>, iterator: PathIterator): T | undefined {
		const name = iterator.value();
		const child = node.get(name);

		if (!child) {
			return undefined;
		}

		// not at end
		if (iterator.hasNext()) {
			if (child instanceof BranchNode) {
				const result = this._delete(child, iterator.next());

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

	clear(): void {
		this.root.clear();
	}
}
