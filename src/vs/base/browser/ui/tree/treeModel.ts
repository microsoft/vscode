/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ISpliceable } from 'vs/base/common/sequence';
import { IIterator, map, collect, iter, empty } from 'vs/base/common/iterator';
import { last } from 'vs/base/common/arrays';

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

function visibleCountReducer<T>(result: number, node: ITreeNode<T>): number {
	return result + (node.collapsed ? 1 : node.visibleCount);
}

function getVisibleCount<T>(nodes: ITreeNode<T>[]): number {
	return nodes.reduce(visibleCountReducer, 0);
}

function getVisibleNodes<T>(nodes: ITreeNode<T>[], result: ITreeListElement<T>[] = []): ITreeListElement<T>[] {
	for (const node of nodes) {
		result.push(node);

		if (!node.collapsed) {
			getVisibleNodes(node.children, result);
		}
	}

	return result;
}

function treeElementToNode<T>(treeElement: ITreeElement<T>, depth: number, visible: boolean, treeListElements: ITreeListElement<T>[]): ITreeNode<T> {
	const { element, collapsed } = treeElement;

	if (visible) {
		treeListElements.push({ element, collapsed, depth });
	}

	const children = collect(map(treeElement.children, el => treeElementToNode(el, depth + 1, visible && !treeElement.collapsed, treeListElements)));
	const visibleCount = 1 + getVisibleCount(children);

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

	splice(location: number[], deleteCount: number, toInsert: IIterator<ITreeElement<T>> = empty()): IIterator<ITreeElement<T>> {
		if (location.length === 0) {
			throw new Error('Invalid tree location');
		}

		const { parentNode, listIndex, visible } = this.findParentNode(location);
		const treeListElementsToInsert: ITreeListElement<T>[] = [];
		const nodesToInsert = collect(map(toInsert, el => treeElementToNode(el, parentNode.depth + 1, visible, treeListElementsToInsert)));
		const deletedNodes = parentNode.children.splice(last(location), deleteCount, ...nodesToInsert);
		const visibleDeleteCount = getVisibleCount(deletedNodes);

		parentNode.visibleCount += getVisibleCount(nodesToInsert) - visibleDeleteCount;

		if (visible) {
			this.list.splice(listIndex, visibleDeleteCount, treeListElementsToInsert);
		}

		return map(iter(deletedNodes), treeNodeToElement);
	}

	setCollapsed(location: number[], collapsed: boolean): void {
		const { node, listIndex, visible } = this.findNode(location);

		if (node.collapsed === collapsed) {
			return;
		}

		node.collapsed = collapsed;

		if (visible) {
			if (collapsed) {
				const deleteCount = getVisibleCount(node.children);
				const { element, depth } = node;

				this.list.splice(listIndex, 1 + deleteCount, [{ element, collapsed, depth }]);
			} else {
				const toInsert = [node, ...getVisibleNodes(node.children)];

				this.list.splice(listIndex, 1, toInsert);
			}
		}
	}

	isCollapsed(location: number[]): boolean {
		const { node } = this.findNode(location);
		return node.collapsed;
	}

	private findNode(location: number[]): { node: ITreeNode<T>, listIndex: number, visible: boolean } {
		const { parentNode, listIndex, visible } = this.findParentNode(location);
		const index = last(location);

		if (index < 0 || index > parentNode.children.length) {
			throw new Error('Invalid tree location');
		}

		const node = parentNode.children[index];

		return { node, listIndex, visible };
	}

	private findParentNode(location: number[], node: ITreeNode<T> = this.root, listIndex: number = 0, visible = true): { parentNode: ITreeNode<T>; listIndex: number; visible: boolean; } {
		const [index, ...rest] = location;

		if (index < 0 || index > node.children.length) {
			throw new Error('Invalid tree location');
		}

		// TODO@joao perf!
		for (let i = 0; i < index; i++) {
			listIndex += node.children[i].visibleCount;
		}

		visible = visible && !node.collapsed;

		if (rest.length === 0) {
			return { parentNode: node, listIndex, visible };
		}

		return this.findParentNode(rest, node.children[index], listIndex + 1, visible);
	}
}