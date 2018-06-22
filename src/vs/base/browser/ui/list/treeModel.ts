/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ISpliceable } from 'vs/base/common/sequence';
import { IIterator, map, collect, forEach, iter, empty } from 'vs/base/common/iterator';
import { last } from 'vs/base/common/arrays';
import { Tree } from 'vs/base/common/tree';

/**
 * TODO:
 * remove trie
 * remote base tree
 */

export interface ITreeElement<T> {
	readonly element: T;
	readonly children: IIterator<ITreeElement<T>>;
}

export interface ITreeListElement<T> {
	readonly element: T;
	readonly depth: number;
}

class TreeNode<T> implements ITreeListElement<T> {

	static createRoot<T>(element: T): TreeNode<T> {
		const node = new TreeNode<T>(element);
		node.children = [];
		node.count = 1;
		node.depth = 0;
		return node;
	}

	static createNode<T>(treeElement: ITreeElement<T>, depth: number, list: ITreeListElement<T>[]): TreeNode<T> {
		const node = new TreeNode<T>(treeElement.element);
		list.push(node);

		let count = 1;
		const children: TreeNode<T>[] = [];

		forEach(treeElement.children, child => {
			const node = TreeNode.createNode<T>(child, depth + 1, list);
			children.push(node);
			count += node.count;
		});

		node.children = children;
		node.count = count;
		node.depth = depth;

		return node;
	}

	children: TreeNode<T>[];
	count: number;
	depth: number;

	private constructor(public element: T) { }

	splice(index: number, deleteCount: number, toInsert: IIterator<ITreeElement<T>>): { listDeleteCount: number; listElements: ITreeListElement<T>[]; deletedNodes: TreeNode<T>[]; } {
		const listElements = [] as ITreeListElement<T>[];

		const nodesToInsert = collect(map(toInsert, e => TreeNode.createNode<T>(e, this.depth + 1, listElements)));
		const listAddCount = nodesToInsert.reduce((r, n) => r + n.count, 0);
		const deletedNodes = this.children.splice(index, deleteCount, ...nodesToInsert);
		const listDeleteCount = deletedNodes.reduce((r, n) => r + n.count, 0);

		this.count += listAddCount - listDeleteCount;
		return { listDeleteCount, listElements, deletedNodes };
	}
}

function createTreeElementFromTreeNode<T>(node: TreeNode<T>): ITreeElement<T> {
	return {
		element: node.element,
		children: map(iter(node.children), createTreeElementFromTreeNode)
	};
}

export class TreeModel<T> {

	private root = TreeNode.createRoot<T>(undefined);

	constructor(private spliceable: ISpliceable<ITreeListElement<T>>) { }

	splice(location: number[], deleteCount: number, toInsert: IIterator<ITreeElement<T>>): IIterator<ITreeElement<T>> {
		if (location.length === 0) {
			throw new Error('Invalid tree location');
		}

		const { parentNode, parentListIndex } = this.findParentNode(location);
		const index = last(location);
		const { listDeleteCount, listElements, deletedNodes } = parentNode.splice(index, deleteCount, toInsert);

		this.spliceable.splice(parentListIndex + index, listDeleteCount, listElements);

		return map(iter(deletedNodes), createTreeElementFromTreeNode);
	}

	private findParentNode(location: number[], node: TreeNode<T> = this.root, listIndex: number = 0): { parentNode: TreeNode<T>; parentListIndex: number } {
		if (location.length === 1) {
			return { parentNode: node, parentListIndex: listIndex };
		}

		const [i, ...rest] = location;
		const limit = Math.min(i, node.children.length);

		// TODO@joao perf!
		for (let j = 0; j < limit; j++) {
			listIndex += node.children[j].count;
		}

		return this.findParentNode(rest, node.children[i], listIndex + 1);
	}
}

interface ICollapsibleElement<T> {
	collapsed: boolean;
	element: T;
}

export type ICollapsibleTreeElement<T> = ITreeElement<ICollapsibleElement<T>>;
export type ICollapsibleTreeListElement<T> = ITreeListElement<ICollapsibleElement<T>>;

function asVisibleElement<T>(element: ICollapsibleTreeElement<T>): ICollapsibleTreeElement<T> {
	if (element.element.collapsed) {
		return { element: element.element, children: empty() };
	}

	return {
		element: element.element,
		children: map(element.children, asVisibleElement)
	};
}

export class CollapsibleTreeModel<T> {

	private model = new Tree<ICollapsibleElement<T>>();
	private viewModel: TreeModel<ICollapsibleElement<T>>;

	constructor(spliceable: ISpliceable<ICollapsibleTreeListElement<T>>) {
		this.viewModel = new TreeModel(spliceable);
	}

	splice(location: number[], deleteCount: number, toInsert: IIterator<ICollapsibleTreeElement<T>>): IIterator<ICollapsibleTreeElement<T>> {
		let length = 0;
		toInsert = map(toInsert, el => { length++; return el; });

		const result = this.model.splice(location, deleteCount, toInsert);
		const [ancestors, elementsToInsert] = this.model.getElementRange(location, length);
		const isVisible = ancestors.every(el => !el.collapsed);

		if (isVisible) {
			this.viewModel.splice(location, deleteCount, map(elementsToInsert, asVisibleElement));
		}

		return result;
	}
}
