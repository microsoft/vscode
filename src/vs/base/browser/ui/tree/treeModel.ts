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

export interface ITreeNode<T, TFilterData = void> {
	readonly parent: ITreeNode<T, TFilterData> | undefined;
	readonly element: T;
	readonly children: ITreeNode<T, TFilterData>[];
	readonly depth: number;
	readonly collapsible: boolean;
	readonly collapsed: boolean;
	readonly visibleCount: number;
	readonly visible: boolean;
	readonly filterData: TFilterData | undefined;
}

interface IMutableTreeNode<T, TFilterData> extends ITreeNode<T, TFilterData> {
	readonly parent: IMutableTreeNode<T, TFilterData> | undefined;
	readonly children: IMutableTreeNode<T, TFilterData>[];
	collapsed: boolean;
	visibleCount: number;
	visible: boolean;
	filterData: TFilterData | undefined;
}

export const enum Visibility {
	Hidden,
	Visible,
	Recurse // TODO@joao come up with a better name
}

export interface IFilterResult<TFilterData> {
	visibility: Visibility;
	data: TFilterData;
}

export interface IFilter<T, TFilterData> {
	filter(element: T): Visibility | IFilterResult<TFilterData>;
}

function visibleCountReducer<T>(result: number, node: IMutableTreeNode<T, any>): number {
	return result + (node.collapsed ? 1 : node.visibleCount);
}

function getVisibleCount<T>(nodes: IMutableTreeNode<T, any>[]): number {
	return nodes.reduce(visibleCountReducer, 0);
}

/**
 * Recursively updates the visibleCount of a subtree, while collecting
 * all the visible nodes in an array.
 */
function updateVisibleCount<T, TFilterData>(node: IMutableTreeNode<T, TFilterData>): ITreeNode<T, TFilterData>[] {
	const previousVisibleCount = node.visibleCount;
	const result: ITreeNode<T, TFilterData>[] = [];

	function _updateVisibleCount(node: IMutableTreeNode<T, TFilterData>): number {
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
		return Iterator.fromArray(elements);
	} else {
		return elements;
	}
}

function treeElementToNode<T, TFilterData>(treeElement: ITreeElement<T>, parent: IMutableTreeNode<T, TFilterData>, visible: boolean, treeListElements: ITreeNode<T, TFilterData>[]): IMutableTreeNode<T, TFilterData> {
	const depth = parent.depth + 1;
	const { element, collapsible, collapsed } = treeElement;
	const node = { parent, element, children: [], depth, collapsible: !!collapsible, collapsed: !!collapsed, visibleCount: 1, visible: true, filterData: undefined };

	if (visible) {
		treeListElements.push(node);
	}

	const children = getTreeElementIterator(treeElement.children);
	node.children = Iterator.collect(Iterator.map(children, el => treeElementToNode(el, node, visible && !treeElement.collapsed, treeListElements)));
	node.collapsible = node.collapsible || node.children.length > 0;

	if (!collapsed) {
		node.visibleCount += getVisibleCount(node.children);
	}

	return node;
}

function treeNodeToElement<T>(node: IMutableTreeNode<T, any>): ITreeElement<T> {
	const { element, collapsed } = node;
	const children = Iterator.map(Iterator.fromArray(node.children), treeNodeToElement);

	return { element, children, collapsed };
}

export function getNodeLocation<T>(node: ITreeNode<T, any>): number[] {
	const location = [];

	while (node.parent) {
		location.push(node.parent.children.indexOf(node));
		node = node.parent;
	}

	return location.reverse();
}

export class TreeModel<T, TFilterData = void> {

	private root: IMutableTreeNode<T, TFilterData> = {
		parent: undefined,
		element: undefined,
		children: [],
		depth: 0,
		collapsible: false,
		collapsed: false,
		visibleCount: 1,
		visible: true,
		filterData: undefined
	};

	private _onDidChangeCollapseState = new Emitter<ITreeNode<T, TFilterData>>();
	readonly onDidChangeCollapseState: Event<ITreeNode<T, TFilterData>> = this._onDidChangeCollapseState.event;

	constructor(private list: ISpliceable<ITreeNode<T, TFilterData>>) { }

	splice(location: number[], deleteCount: number, toInsert?: ISequence<ITreeElement<T>>): Iterator<ITreeElement<T>> {
		if (location.length === 0) {
			throw new Error('Invalid tree location');
		}

		const { parentNode, listIndex, visible } = this.findParentNode(location);
		const treeListElementsToInsert: ITreeNode<T, TFilterData>[] = [];
		const elementsToInsert = getTreeElementIterator(toInsert);
		const nodesToInsert = Iterator.collect(Iterator.map(elementsToInsert, el => treeElementToNode(el, parentNode, visible, treeListElementsToInsert)));
		const lastIndex = location[location.length - 1];
		const deletedNodes = parentNode.children.splice(lastIndex, deleteCount, ...nodesToInsert);
		const visibleDeleteCount = getVisibleCount(deletedNodes);

		parentNode.visibleCount += getVisibleCount(nodesToInsert) - visibleDeleteCount;

		if (visible) {
			this.list.splice(listIndex, visibleDeleteCount, treeListElementsToInsert);
		}

		return Iterator.map(Iterator.fromArray(deletedNodes), treeNodeToElement);
	}

	getListIndex(location: number[]): number {
		return this.findNode(location).listIndex;
	}

	setCollapsed(location: number[], collapsed: boolean): boolean {
		const { node, listIndex, visible } = this.findNode(location);
		return this._setCollapsed(node, listIndex, visible, collapsed);
	}

	toggleCollapsed(location: number[]): void {
		const { node, listIndex, visible } = this.findNode(location);
		this._setCollapsed(node, listIndex, visible);
	}

	private _setCollapsed(node: IMutableTreeNode<T, TFilterData>, listIndex: number, visible: boolean, collapsed?: boolean | undefined): boolean {
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
			this._onDidChangeCollapseState.fire(node);
		}

		return true;
	}

	// TODO@joao cleanup
	setCollapsedAll(collapsed: boolean): void {
		if (collapsed) {
			const queue = [...this.root.children]; // TODO@joao use a linked list
			let listIndex = 0;

			while (queue.length > 0) {
				const node = queue.shift();
				const visible = listIndex < this.root.children.length;
				this._setCollapsed(node, listIndex, visible, collapsed);

				queue.push(...node.children);
				listIndex++;
			}
		}
	}

	isCollapsed(location: number[]): boolean {
		return this.findNode(location).node.collapsed;
	}

	private findNode(location: number[]): { node: IMutableTreeNode<T, TFilterData>, listIndex: number, visible: boolean } {
		const { parentNode, listIndex, visible } = this.findParentNode(location);
		const index = location[location.length - 1];

		if (index < 0 || index > parentNode.children.length) {
			throw new Error('Invalid tree location');
		}

		const node = parentNode.children[index];

		return { node, listIndex, visible };
	}

	private findParentNode(location: number[], node: IMutableTreeNode<T, TFilterData> = this.root, listIndex: number = 0, visible = true): { parentNode: IMutableTreeNode<T, TFilterData>; listIndex: number; visible: boolean; } {
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