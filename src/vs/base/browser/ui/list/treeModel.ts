/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ISpliceable } from 'vs/base/common/sequence';
import { IIterator, map, collect, iter } from 'vs/base/common/iterator';
import { last } from 'vs/base/common/arrays';

/**
 * TODO:
 * remove trie
 * remove tree
 */

export interface ITreeElement<T> {
	readonly element: T;
	readonly children: IIterator<ITreeElement<T>>;
	readonly collapsed: boolean;
}

export interface ITreeListElement<T> {
	readonly element: T;
	readonly collapsed: boolean;
	readonly depth: number;
}

interface ITreeNode<T> {
	readonly element: T;
	readonly children: ITreeNode<T>[];
	readonly depth: number;
	collapsed: boolean;
	visibleCount: number;
}

function treeElementToNode<T>(treeElement: ITreeElement<T>, depth: number, visible: boolean, visibleElements: ITreeListElement<T>[]): ITreeNode<T> {
	const { element, collapsed } = treeElement;

	if (visible) {
		visibleElements.push({ element, collapsed, depth });
	}

	const children = collect(map(treeElement.children, el => treeElementToNode(el, depth + 1, visible && !treeElement.collapsed, visibleElements)));
	const visibleCount = children.reduce((r, c) => r + (c.collapsed ? 1 : c.visibleCount), 1);

	return { element, children, depth, collapsed, visibleCount };
}

function treeNodeToElement<T>(node: ITreeNode<T>): ITreeElement<T> {
	const { element, collapsed } = node;
	const children = map(iter(node.children), treeNodeToElement);

	return { element, children, collapsed };
}

export class TreeModel<T> {

	private root: ITreeNode<T> = {
		element: undefined,
		children: [],
		depth: 0,
		collapsed: false,
		visibleCount: 1
	};

	constructor(private list: ISpliceable<ITreeListElement<T>>) { }

	splice(location: number[], deleteCount: number, toInsert: IIterator<ITreeElement<T>>): IIterator<ITreeElement<T>> {
		if (location.length === 0) {
			throw new Error('Invalid tree location');
		}

		const { parentNode, parentListIndex, visible } = this.findParentNode(location);
		const listToInsert: ITreeListElement<T>[] = [];
		const nodesToInsert = collect(map(toInsert, el => treeElementToNode(el, parentNode.depth + 1, visible, listToInsert)));
		const index = last(location);
		const deletedNodes = parentNode.children.splice(index, deleteCount, ...nodesToInsert);

		parentNode.visibleCount += nodesToInsert.reduce((r, c) => r + (c.collapsed ? 1 : c.visibleCount), 1) - deletedNodes.reduce((r, c) => r + (c.collapsed ? 1 : c.visibleCount), 1);

		if (visible) {
			const listDeleteCount = deletedNodes.reduce((r, c) => r + (c.collapsed ? 1 : c.visibleCount), 1);
			this.list.splice(parentListIndex + index, listDeleteCount, listToInsert);
		}

		return map(iter(deletedNodes), treeNodeToElement);
	}

	private findParentNode(location: number[], node: ITreeNode<T> = this.root, listIndex: number = 0, visible = true): { parentNode: ITreeNode<T>; parentListIndex: number; visible: boolean; } {
		if (location.length === 1) {
			return { parentNode: node, parentListIndex: listIndex, visible };
		}

		const [i, ...rest] = location;
		const limit = Math.min(i, node.children.length);

		// TODO@joao perf!
		for (let j = 0; j < limit; j++) {
			listIndex += node.children[j].visibleCount;
		}

		return this.findParentNode(rest, node.children[i], listIndex + 1, visible && !node.collapsed);
	}
}