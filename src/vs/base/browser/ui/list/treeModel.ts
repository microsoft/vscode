/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ISpliceable } from 'vs/base/common/sequence';
import { Tree } from 'vs/base/common/tree';
import { tail2 } from 'vs/base/common/arrays';
import { Trie } from 'vs/base/browser/ui/list/trie';

export interface ITreeElement<T> {
	readonly element: T;
	readonly children: ITreeElement<T>[];
}

export interface ITreeListElement<T> {
	readonly element: T;
	readonly depth: number;
}

class TreeNode<T> implements ITreeListElement<T> {

	static createRoot<T>(): TreeNode<T> {
		const node = new TreeNode<T>();
		node.children = [];
		node.count = 1;
		node.depth = 0;
		return node;
	}

	static createNode<T>(treeElement: ITreeElement<T>, depth: number, list: ITreeListElement<T>[]): TreeNode<T> {
		const node = new TreeNode<T>();
		list.push(node);

		let count = 1;
		const children: TreeNode<T>[] = [];

		for (const childItem of treeElement.children) {
			const node = TreeNode.createNode<T>(childItem, depth + 1, list);
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

	splice(index: number, deleteCount: number, treeElements: ITreeElement<T>[]): { listDeleteCount: number; listElements: ITreeListElement<T>[]; deletedNodes: TreeNode<T>[]; } {
		const listElements = [] as ITreeListElement<T>[];

		const added = treeElements.map(e => TreeNode.createNode<T>(e, this.depth + 1, listElements));
		const listAddCount = added.reduce((r, n) => r + n.count, 0);

		const deletedNodes = this.children.splice(index, deleteCount, ...added);
		const listDeleteCount = deletedNodes.reduce((r, n) => r + n.count, 0);

		this.count += listAddCount - listDeleteCount;
		return { listDeleteCount, listElements, deletedNodes };
	}
}

export class TreeModel<T> {

	private root = TreeNode.createRoot<T>();

	constructor(private spliceable: ISpliceable<ITreeListElement<T>>) { }

	splice(start: number[], deleteCount: number, elements: ITreeElement<T>[] = []): ITreeElement<T>[] {
		if (start.length === 0) {
			throw new Error('Invalid tree location');
		}

		const { parentNode, parentListIndex } = this.findParentNode(start);
		const lastIndex = start[start.length - 1];
		const { listDeleteCount, listElements, deletedNodes } = parentNode.splice(lastIndex, deleteCount, elements);

		this.spliceable.splice(parentListIndex + lastIndex, listDeleteCount, listElements);

		return deletedNodes;
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

export interface ICollapsibleTreeElement<T> {
	element: T;
	collapsed: boolean;
}

export class CollapsibleTreeModel<T> {

	private model = new Tree<ICollapsibleTreeElement<T>>();
	private collapsedElements = new Trie<number, ITreeElement<T>>();
	private visibleModel: TreeModel<T>;

	constructor(spliceable: ISpliceable<ITreeListElement<T>>) {
		this.visibleModel = new TreeModel<T>(spliceable);
	}

	splice(start: number[], deleteCount: number, items: ITreeElement<ICollapsibleTreeElement<T>>[]): void {
		// const elementPath = this.model.getElementPath(start);

		this.model.splice(start, deleteCount, items);
		// this.visibleModel.splice(start, deleteCount, items);
	}

	setCollapsed(location: number[], collapsed: boolean): void {
		const elementPath = this.model.getElementPath(location);
		const [pathToElement, collapsibleElement] = tail2(elementPath);

		if (collapsibleElement.collapsed === collapsed) {
			return;
		}

		collapsibleElement.collapsed = collapsed;

		if (pathToElement.some(e => e.collapsed)) {
			return;
		}

		if (collapsed) {
			const collapsedElement: ITreeElement<T> = {
				element: collapsibleElement.element,
				children: []
			};

			const [element] = this.visibleModel.splice(location, 1, [collapsedElement]);
			this.collapsedElements.set(location, element);
		} else {
			const expandedElement = this.collapsedElements.delete(location);
			this.visibleModel.splice(location, 1, [expandedElement]);
		}


		// gotta reflect the state on the visibleModel
	}

	isCollapsed(location: number[]): boolean {
		return this.model.getElement(location).collapsed;
	}
}