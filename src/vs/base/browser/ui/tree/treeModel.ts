/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

export interface ITreeElement<T> {
	element: T;
	children: ITreeElement<T>[];
}

export interface ITreeNode<T> {
	readonly element: T;
	readonly children: ITreeNode<T>[];
	readonly depth: number;
	count: number;
}

export type TreeLocation = number[];

function createNode<T>(depth: number, element: ITreeElement<T>, list: ITreeNode<T>[]): ITreeNode<T> {
	const node = {
		element: element.element,
		children: null,
		depth,
		count: 0
	};

	list.push(node);

	const children = element.children
		.map(e => createNode(depth + 1, element, list));

	node.children = children;
	node.count = children.reduce((r, n) => r + n.count, 0);
	return node;
}

function createNodes<T>(depth: number, elements: ITreeElement<T>[]): { nodes: ITreeNode<T>[]; list: ITreeNode<T>[] } {
	const list: ITreeNode<T>[] = [];
	const nodes = elements.map(e => createNode(depth, e, list));

	return { nodes, list };
}

export class TreeNode<T> {

	constructor() {

	}

	splice(childIndex: number, deleteCount: number, elements: ITreeElement<T>[]) {
		// TODO?
	}
}

export class TreeModel<T> {

	private list: ITreeNode<T>[] = [];
	private root: ITreeNode<T> = {
		element: null as T,
		children: [],
		depth: 0,
		count: 0
	};

	splice(start: TreeLocation, deleteCount: number, elements: ITreeElement<T>[]) {
		if (start.length === 0) {
			throw new Error('Invalid tree location');
		}

		return this.spliceRecursive(this.root, 0, start, deleteCount, elements);
	}

	private spliceRecursive(node: ITreeNode<T>, listIndex: number, location: TreeLocation, deleteCount: number, elements: ITreeElement<T>[]) {
		const [i, ...rest] = location;

		if (rest.length > 0) {
			for (let j = 0; j < i; j++) {
				listIndex += node.children[j].count;
			}

			return this.spliceRecursive(node.children[i], listIndex, rest, deleteCount, elements);
		} else {
			return this.spliceNode(node, listIndex, i, deleteCount, elements);
		}
	}

	private spliceNode(node: ITreeNode<T>, listIndex: number, childIndex: number, deleteCount: number, elements: ITreeElement<T>[]) {
		const depth = node.depth;
		const { nodes, list } = createNodes(depth, elements);
		const countAdd = nodes.reduce((r, n) => r + n.count, 0);
		const deleted = node.children.splice(childIndex, deleteCount, ...nodes);
		const countSubtract = deleted.reduce((r, n) => r + n.count, 0);

		node.count += countAdd - countSubtract;
		this.list.splice(listIndex, countSubtract, ...list);
	}
}
