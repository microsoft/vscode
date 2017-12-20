/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ISpliceable } from 'vs/base/common/sequence';

export interface ITreeElement<T> {
	readonly element: T;
	readonly children: ITreeElement<T>[];
}

export interface ITreeNode<T> {
	readonly element: T;
	readonly depth: number;
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

	splice(index: number, deleteCount: number, elements: ITreeElement<T>[]): { listDeleteCount: number; listElements: ITreeNode<T>[]; } {
		const listElements = [] as ITreeNode<T>[];

		const added = elements.map(e => TreeNode.createNode<T>(e, this.depth + 1, listElements));
		const listAddCount = added.reduce((r, n) => r + n.count, 0);

		const deleted = this.children.splice(index, deleteCount, ...added);
		const listDeleteCount = deleted.reduce((r, n) => r + n.count, 0);

		this.count += listAddCount - listDeleteCount;
		return { listDeleteCount, listElements };
	}
}

export class TreeModel<T> {

	private root = TreeNode.createRoot<T>();

	constructor(private spliceable: ISpliceable<ITreeNode<T>>) { }

	splice(start: number[], deleteCount: number, elements: ITreeElement<T>[]): void {
		if (start.length === 0) {
			throw new Error('Invalid tree location');
		}

		const { parentNode, parentListIndex } = this.findParentNode(start, this.root, 0);
		const lastIndex = start[start.length - 1];
		const { listDeleteCount, listElements } = parentNode.splice(lastIndex, deleteCount, elements);

		this.spliceable.splice(parentListIndex + lastIndex, listDeleteCount, listElements);
	}

	private findParentNode(location: number[], node: TreeNode<T>, listIndex: number): { parentNode: TreeNode<T>; parentListIndex: number } {
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
