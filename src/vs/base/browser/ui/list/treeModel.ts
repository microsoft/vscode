/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ISpliceable } from './splice';

export interface ITreeElement<T> {
	element: T;
	children: ITreeElement<T>[];
}

export type TreeLocation = number[];

export class TreeNode<T> {

	static createRoot<T>(): TreeNode<T> {
		return new TreeNode<T>({ children: [], element: null }, 0);
	}

	private _element: T;
	public get element(): T { return this._element; }

	private _children: TreeNode<T>[];
	public get children(): TreeNode<T>[] { return this._children; }

	private _count = 1;
	public get count(): number { return this._count; }

	private _depth: number;
	public get depth(): number { return this._depth; }

	constructor(
		treeElement: ITreeElement<T>,
		depth: number
	) {
		const {children, count} = treeElement.children.reduce((r, e) => {
			const child = new TreeNode<T>(e, depth + 1);
			r.children.push(child);
			r.count += child.count;
			return r;
		}, { children: [] as TreeNode<T>[], count: 1 });

		this._element = treeElement.element;
		this._children = children;
		this._count = count;
		this._depth = depth;
	}

	splice(index: number, deleteCount: number, elements: ITreeElement<T>[]): { listDeleteCount: number, listElements: TreeNode<T>[] } {
		const {added, listElements} = elements.reduce((r, e) => {
			const node = new TreeNode<T>(e, this.depth + 1);
			r.added.push(node);
			r.listElements = [...r.listElements, ...node.iterate()];
			return r;
		}, { added: [], listElements: [] });

		const listAddCount = added.reduce((r, n) => r + n.count, 0);

		const deleted = this.children.splice(index, deleteCount, ...added);
		const listDeleteCount = deleted.reduce((r, n) => r + n.count, 0);

		this._count += listAddCount - listDeleteCount;
		return { listDeleteCount, listElements };
	}

	private iterate(list: TreeNode<T>[] = []): TreeNode<T>[] {
		list.push(this);
		this.children.forEach(c => c.iterate(list));
		return list;
	}
}

export class TreeModel<T> {

	private root = TreeNode.createRoot<T>();

	constructor(private spliceable: ISpliceable<TreeNode<T>>) { }

	splice(start: TreeLocation, deleteCount: number, elements: ITreeElement<T>[]): void {
		if (start.length === 0) {
			throw new Error('Invalid tree location');
		}

		const {node, listIndex} = this.findNode(start, this.root, 0);
		const {listDeleteCount, listElements} = node.splice(start[start.length - 1], deleteCount, elements);

		this.spliceable.splice(listIndex, listDeleteCount, listElements);
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
