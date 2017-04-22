/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ISpreadSpliceable } from './splice';

export interface ITreeElement<T> {
	element: T;
	children: ITreeElement<T>[];
}

export type TreeLocation = number[];

export interface ITreeNode<T> {
	readonly element: T;
	readonly depth: number;
}

export class TreeNode<T> implements ITreeNode<T> {

	static createRoot<T>(): TreeNode<T> {
		const node = new TreeNode<T>();
		node._children = [];
		node._count = 1;
		node._depth = 0;
		return node;
	}

	static createNode<T>(
		treeElement: ITreeElement<T>,
		depth: number,
		list: ITreeNode<T>[]
	): TreeNode<T> {
		const node = new TreeNode<T>();
		list.push(node);

		const {children, count} = treeElement.children.reduce((r, e) => {
			const child = TreeNode.createNode<T>(e, depth + 1, list);
			r.children.push(child);
			r.count += child.count;
			return r;
		}, { children: [] as TreeNode<T>[], count: 1 });

		node._element = treeElement.element;
		node._children = children;
		node._count = count;
		node._depth = depth;

		return node;
	}

	private _element: T;
	public get element(): T { return this._element; }

	private _children: TreeNode<T>[];
	public get children(): TreeNode<T>[] { return this._children; }

	private _count = 1;
	public get count(): number { return this._count; }

	private _depth: number;
	public get depth(): number { return this._depth; }

	constructor() { }

	splice(index: number, deleteCount: number, elements: ITreeElement<T>[]): { listDeleteCount: number, listElements: ITreeNode<T>[] } {
		const listElements = [] as ITreeNode<T>[];

		const added = elements.map(e => TreeNode.createNode<T>(e, this.depth + 1, listElements));
		const listAddCount = added.reduce((r, n) => r + n.count, 0);

		const deleted = this.children.splice(index, deleteCount, ...added);
		const listDeleteCount = deleted.reduce((r, n) => r + n.count, 0);

		this._count += listAddCount - listDeleteCount;
		return { listDeleteCount, listElements };
	}
}

export class TreeModel<T> {

	private root = TreeNode.createRoot<T>();

	constructor(private spliceable: ISpreadSpliceable<ITreeNode<T>>) { }

	splice(start: TreeLocation, deleteCount: number, elements: ITreeElement<T>[]): void {
		if (start.length === 0) {
			throw new Error('Invalid tree location');
		}

		const {node, listIndex} = this.findNode(start, this.root, 0);
		const {listDeleteCount, listElements} = node.splice(start[start.length - 1], deleteCount, elements);

		this.spliceable.splice(listIndex, listDeleteCount, ...listElements);
	}

	private findNode(location: TreeLocation, node: TreeNode<T>, listIndex: number): { node: TreeNode<T>; listIndex: number } {
		const [i, ...rest] = location;

		if (rest.length === 0) {
			return { node, listIndex };
		}

		for (let j = 0; j < i; j++) {
			listIndex += node.children[j].count;
		}

		return this.findNode(rest, node.children[i], listIndex);
	}
}
