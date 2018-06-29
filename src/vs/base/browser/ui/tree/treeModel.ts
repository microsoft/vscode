/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ISpliceable } from 'vs/base/common/sequence';
import { IIterator, map, collect, iter, empty } from 'vs/base/common/iterator';
import { last } from 'vs/base/common/arrays';
import { Emitter, Event } from 'vs/base/common/event';

export interface ITreeElement<T> {
	readonly element: T;
	readonly children?: IIterator<ITreeElement<T>> | ITreeElement<T>[];
	readonly collapsed?: boolean;
}

export interface ITreeNode<T> {
	readonly parent: IMutableTreeNode<T> | undefined;
	readonly element: T;
	readonly children: IMutableTreeNode<T>[];
	readonly depth: number;
	readonly collapsed: boolean;
	readonly visibleCount: number;
}

interface IMutableTreeNode<T> extends ITreeNode<T> {
	collapsed: boolean;
	visibleCount: number;
}

function visibleCountReducer<T>(result: number, node: IMutableTreeNode<T>): number {
	return result + (node.collapsed ? 1 : node.visibleCount);
}

function getVisibleCount<T>(nodes: IMutableTreeNode<T>[]): number {
	return nodes.reduce(visibleCountReducer, 0);
}

function getVisibleNodes<T>(nodes: IMutableTreeNode<T>[], result: ITreeNode<T>[] = []): ITreeNode<T>[] {
	for (const node of nodes) {
		result.push(node);

		if (!node.collapsed) {
			getVisibleNodes(node.children, result);
		}
	}

	return result;
}

function getTreeElementIterator<T>(elements: IIterator<ITreeElement<T>> | ITreeElement<T>[] | undefined): IIterator<ITreeElement<T>> {
	if (!elements) {
		return empty();
	} else if (Array.isArray(elements)) {
		return iter(elements);
	} else {
		return elements;
	}
}

function treeElementToNode<T>(treeElement: ITreeElement<T>, parent: IMutableTreeNode<T>, visible: boolean, treeListElements: ITreeNode<T>[]): IMutableTreeNode<T> {
	const depth = parent.depth + 1;
	const { element, collapsed } = treeElement;
	const node = { parent, element, children: [], depth, collapsed: !!collapsed, visibleCount: 0 };

	if (visible) {
		treeListElements.push(node);
	}

	const children = getTreeElementIterator(treeElement.children);
	node.children = collect(map(children, el => treeElementToNode(el, node, visible && !treeElement.collapsed, treeListElements)));
	node.visibleCount = 1 + getVisibleCount(node.children);

	return node;
}

function treeNodeToElement<T>(node: IMutableTreeNode<T>): ITreeElement<T> {
	const { element, collapsed } = node;
	const children = map(iter(node.children), treeNodeToElement);

	return { element, children, collapsed };
}

export class TreeModel<T> {

	private root: IMutableTreeNode<T> = {
		parent: undefined,
		element: undefined,
		children: [],
		depth: 0,
		collapsed: false,
		visibleCount: 1
	};

	private _onDidChangeCollapseState = new Emitter<ITreeNode<T>>();
	readonly onDidChangeCollapseState: Event<ITreeNode<T>> = this._onDidChangeCollapseState.event;

	constructor(private list: ISpliceable<ITreeNode<T>>) { }

	splice(location: number[], deleteCount: number, toInsert?: IIterator<ITreeElement<T>> | ITreeElement<T>[]): IIterator<ITreeElement<T>> {
		if (location.length === 0) {
			throw new Error('Invalid tree location');
		}

		const { parentNode, listIndex, visible } = this.findParentNode(location);
		const treeListElementsToInsert: ITreeNode<T>[] = [];
		const elementsToInsert = getTreeElementIterator(toInsert);
		const nodesToInsert = collect(map(elementsToInsert, el => treeElementToNode(el, parentNode, visible, treeListElementsToInsert)));
		const deletedNodes = parentNode.children.splice(last(location), deleteCount, ...nodesToInsert);
		const visibleDeleteCount = getVisibleCount(deletedNodes);

		parentNode.visibleCount += getVisibleCount(nodesToInsert) - visibleDeleteCount;

		if (visible) {
			this.list.splice(listIndex, visibleDeleteCount, treeListElementsToInsert);
		}

		return map(iter(deletedNodes), treeNodeToElement);
	}

	setCollapsed(location: number[], collapsed: boolean): void {
		this._setCollapsed(location, collapsed);
	}

	toggleCollapsed(location: number[]): void {
		this._setCollapsed(location);
	}

	private _setCollapsed(location: number[], collapsed?: boolean | undefined): void {
		const { node, listIndex, visible } = this.findNode(location);

		if (typeof collapsed === 'undefined') {
			collapsed = !node.collapsed;
		}

		if (node.collapsed === collapsed) {
			return;
		}

		node.collapsed = collapsed;

		if (visible) {
			let visibleCountDiff: number;

			if (collapsed) {
				const deleteCount = getVisibleCount(node.children);

				this.list.splice(listIndex + 1, deleteCount, []);
				visibleCountDiff = -deleteCount;
			} else {
				const toInsert = getVisibleNodes(node.children);

				this.list.splice(listIndex + 1, 0, toInsert);
				visibleCountDiff = toInsert.length;
			}

			let mutableNode = node;

			while (mutableNode) {
				mutableNode.visibleCount += visibleCountDiff;
				mutableNode = mutableNode.parent;
			}

			this._onDidChangeCollapseState.fire(node);
		}
	}

	isCollapsed(location: number[]): boolean {
		return this.findNode(location).node.collapsed;
	}

	private findNode(location: number[]): { node: IMutableTreeNode<T>, listIndex: number, visible: boolean } {
		const { parentNode, listIndex, visible } = this.findParentNode(location);
		const index = last(location);

		if (index < 0 || index > parentNode.children.length) {
			throw new Error('Invalid tree location');
		}

		const node = parentNode.children[index];

		return { node, listIndex, visible };
	}

	private findParentNode(location: number[], node: IMutableTreeNode<T> = this.root, listIndex: number = 0, visible = true): { parentNode: IMutableTreeNode<T>; listIndex: number; visible: boolean; } {
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