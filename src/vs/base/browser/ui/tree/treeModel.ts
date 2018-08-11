/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ISpliceable } from 'vs/base/common/sequence';
import { Iterator, ISequence } from 'vs/base/common/iterator';
import { Emitter, Event } from 'vs/base/common/event';

export interface ITreeElement<T> {
	readonly element: T;
	readonly children?: Iterator<ITreeElement<T>> | ITreeElement<T>[];
	readonly collapsible?: boolean;
	readonly collapsed?: boolean;
}

export interface ITreeNode<T> {
	readonly parent: IMutableTreeNode<T> | undefined;
	readonly element: T;
	readonly children: IMutableTreeNode<T>[];
	readonly depth: number;
	readonly collapsible: boolean;
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

/**
 * Recursively updates the visibleCount of a subtree, while collecting
 * all the visible nodes in an array.
 */
function updateVisibleCount<T>(node: IMutableTreeNode<T>): ITreeNode<T>[] {
	const previousVisibleCount = node.visibleCount;
	const result: ITreeNode<T>[] = [];

	function _updateVisibleCount(node: IMutableTreeNode<T>): number {
		result.push(node);
		node.visibleCount = 1;

		if (!node.collapsed) {
			for (const child of node.children) {
				node.visibleCount += _updateVisibleCount(child);
			}
		}

		return node.visibleCount;
	}

	_updateVisibleCount(node);

	const visibleCountDiff = result.length - previousVisibleCount;
	node = node.parent;

	while (node) {
		node.visibleCount += visibleCountDiff;
		node = node.parent;
	}

	return result;
}

function getTreeElementIterator<T>(elements: Iterator<ITreeElement<T>> | ITreeElement<T>[] | undefined): Iterator<ITreeElement<T>> {
	if (!elements) {
		return Iterator.empty();
	} else if (Array.isArray(elements)) {
		return Iterator.iterate(elements);
	} else {
		return elements;
	}
}

function treeElementToNode<T>(treeElement: ITreeElement<T>, parent: IMutableTreeNode<T>, visible: boolean, treeListElements: ITreeNode<T>[]): IMutableTreeNode<T> {
	const depth = parent.depth + 1;
	const { element, collapsible, collapsed } = treeElement;
	const node = { parent, element, children: [], depth, collapsible: !!collapsible, collapsed: !!collapsed, visibleCount: 0 };

	if (visible) {
		treeListElements.push(node);
	}

	const children = getTreeElementIterator(treeElement.children);
	node.children = Iterator.collect(Iterator.map(children, el => treeElementToNode(el, node, visible && !treeElement.collapsed, treeListElements)));
	node.collapsible = node.collapsible || node.children.length > 0;
	node.visibleCount = 1 + getVisibleCount(node.children);

	return node;
}

function treeNodeToElement<T>(node: IMutableTreeNode<T>): ITreeElement<T> {
	const { element, collapsed } = node;
	const children = Iterator.map(Iterator.iterate(node.children), treeNodeToElement);

	return { element, children, collapsed };
}

export function getNodeLocation<T>(node: ITreeNode<T>): number[] {
	const location = [];

	while (node.parent) {
		location.push(node.parent.children.indexOf(node));
		node = node.parent;
	}

	return location.reverse();
}

export class TreeModel<T> {

	private root: IMutableTreeNode<T> = {
		parent: undefined,
		element: undefined,
		children: [],
		depth: 0,
		collapsible: false,
		collapsed: false,
		visibleCount: 1
	};

	// TODO@joao can't we do without this?
	private _onDidChangeCollapseState = new Emitter<ITreeNode<T>>();
	readonly onDidChangeCollapseState: Event<ITreeNode<T>> = this._onDidChangeCollapseState.event;

	constructor(private list: ISpliceable<ITreeNode<T>>) { }

	splice(location: number[], deleteCount: number, toInsert?: ISequence<ITreeElement<T>>): Iterator<ITreeElement<T>> {
		if (location.length === 0) {
			throw new Error('Invalid tree location');
		}

		const { parentNode, listIndex, visible } = this.findParentNode(location);
		const treeListElementsToInsert: ITreeNode<T>[] = [];
		const elementsToInsert = getTreeElementIterator(toInsert);
		const nodesToInsert = Iterator.collect(Iterator.map(elementsToInsert, el => treeElementToNode(el, parentNode, visible, treeListElementsToInsert)));
		const lastIndex = location[location.length - 1];
		const deletedNodes = parentNode.children.splice(lastIndex, deleteCount, ...nodesToInsert);
		const visibleDeleteCount = getVisibleCount(deletedNodes);

		parentNode.visibleCount += getVisibleCount(nodesToInsert) - visibleDeleteCount;

		if (visible) {
			this.list.splice(listIndex, visibleDeleteCount, treeListElementsToInsert);
		}

		return Iterator.map(Iterator.iterate(deletedNodes), treeNodeToElement);
	}

	getListIndex(location: number[]): number {
		return this.findNode(location).listIndex;
	}

	setCollapsed(location: number[], collapsed: boolean): boolean {
		return this._setCollapsed(location, collapsed);
	}

	toggleCollapsed(location: number[]): void {
		this._setCollapsed(location);
	}

	private _setCollapsed(location: number[], collapsed?: boolean | undefined): boolean {
		const { node, listIndex, visible } = this.findNode(location);

		if (!node.collapsible) {
			return false;
		}

		if (typeof collapsed === 'undefined') {
			collapsed = !node.collapsed;
		}

		if (node.collapsed === collapsed) {
			return false;
		}

		node.collapsed = collapsed;

		if (visible) {
			const previousVisibleCount = node.visibleCount;
			const toInsert = updateVisibleCount(node);

			this.list.splice(listIndex + 1, previousVisibleCount - 1, toInsert.slice(1));
		}

		this._onDidChangeCollapseState.fire(node);

		return true;
	}

	isCollapsed(location: number[]): boolean {
		return this.findNode(location).node.collapsed;
	}

	private findNode(location: number[]): { node: IMutableTreeNode<T>, listIndex: number, visible: boolean } {
		const { parentNode, listIndex, visible } = this.findParentNode(location);
		const index = location[location.length - 1];

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