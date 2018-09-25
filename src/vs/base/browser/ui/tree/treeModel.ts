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
	readonly revealedCount: number;
	readonly visible: boolean;
	readonly filterData: TFilterData | undefined;
}

interface IMutableTreeNode<T, TFilterData> extends ITreeNode<T, TFilterData> {
	readonly parent: IMutableTreeNode<T, TFilterData> | undefined;
	readonly children: IMutableTreeNode<T, TFilterData>[];
	collapsed: boolean;
	revealedCount: number;
	visible: boolean;
	filterData: TFilterData | undefined;
}

export const enum Visibility {
	Hidden,
	Visible,
	// Recurse // TODO@joao come up with a better name
}

export interface IFilterResult<TFilterData> {
	visibility: Visibility;
	data: TFilterData;
}

function isFilterResult<T>(obj: any): obj is IFilterResult<T> {
	return typeof obj === 'object' && 'visibility' in obj && 'data' in obj;
}

export interface IFilter<T, TFilterData> {
	getVisibility(element: T): Visibility | IFilterResult<TFilterData>;
}

function visibleCountReducer<T>(result: number, node: IMutableTreeNode<T, any>): number {
	return result + (node.collapsed ? 1 : node.revealedCount);
}

function getVisibleCount<T>(nodes: IMutableTreeNode<T, any>[]): number {
	return nodes.reduce(visibleCountReducer, 0);
}

/**
 * Recursively updates the visibleCount of a subtree, while collecting
 * all the visible nodes in an array.
 */
function updateVisibleCount<T, TFilterData>(node: IMutableTreeNode<T, TFilterData>): ITreeNode<T, TFilterData>[] {
	const previousVisibleCount = node.revealedCount;
	const result: ITreeNode<T, TFilterData>[] = [];

	function _updateVisibleCount(node: IMutableTreeNode<T, TFilterData>): number {
		result.push(node);
		node.revealedCount = 1;

		if (!node.collapsed) {
			for (const child of node.children) {
				node.revealedCount += _updateVisibleCount(child);
			}
		}

		return node.revealedCount;
	}

	_updateVisibleCount(node);

	const visibleCountDiff = result.length - previousVisibleCount;
	node = node.parent;

	while (node) {
		node.revealedCount += visibleCountDiff;
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

export interface ITreeOptions<T, TFilterData = void> {
	filter?: IFilter<T, TFilterData>;
}

export class TreeModel<T, TFilterData = void> {

	private root: IMutableTreeNode<T, TFilterData> = {
		parent: undefined,
		element: undefined,
		children: [],
		depth: 0,
		collapsible: false,
		collapsed: false,
		revealedCount: 1,
		visible: true,
		filterData: undefined
	};

	private _onDidChangeCollapseState = new Emitter<ITreeNode<T, TFilterData>>();
	readonly onDidChangeCollapseState: Event<ITreeNode<T, TFilterData>> = this._onDidChangeCollapseState.event;

	private filter?: IFilter<T, TFilterData>;

	constructor(private list: ISpliceable<ITreeNode<T, TFilterData>>, options: ITreeOptions<T, TFilterData> = {}) {
		this.filter = options.filter;
	}

	splice(location: number[], deleteCount: number, toInsert?: ISequence<ITreeElement<T>>): Iterator<ITreeElement<T>> {
		if (location.length === 0) {
			throw new Error('Invalid tree location');
		}

		const { parentNode, listIndex, revealed } = this.findParentNode(location);
		const treeListElementsToInsert: ITreeNode<T, TFilterData>[] = [];
		const elementsToInsert = getTreeElementIterator(toInsert);
		const nodesToInsert = Iterator.collect(Iterator.map(elementsToInsert, el => this.createTreeNode(el, parentNode, revealed, treeListElementsToInsert)));
		const lastIndex = location[location.length - 1];
		const deletedNodes = parentNode.children.splice(lastIndex, deleteCount, ...nodesToInsert);
		const visibleDeleteCount = getVisibleCount(deletedNodes);

		parentNode.revealedCount += getVisibleCount(nodesToInsert) - visibleDeleteCount;

		if (revealed) {
			this.list.splice(listIndex, visibleDeleteCount, treeListElementsToInsert);
		}

		return Iterator.map(Iterator.fromArray(deletedNodes), treeNodeToElement);
	}

	private createTreeNode(treeElement: ITreeElement<T>, parent: IMutableTreeNode<T, TFilterData>, revealed: boolean, treeListElements: ITreeNode<T, TFilterData>[]): IMutableTreeNode<T, TFilterData> {
		const depth = parent.depth + 1;
		const { element, collapsible, collapsed } = treeElement;
		const visibility = this.filter ? this.filter.getVisibility(element) : Visibility.Visible;

		let visible = true;
		let filterData: TFilterData | undefined = undefined;

		if (isFilterResult(visibility)) {
			visible = visibility.visibility === Visibility.Visible;
			filterData = visibility.data;
		}

		const node = { parent, element, children: [], depth, collapsible: !!collapsible, collapsed: !!collapsed, revealedCount: 1, visible, filterData };

		if (revealed) {
			treeListElements.push(node);
		}

		const children = getTreeElementIterator(treeElement.children);
		node.children = Iterator.collect(Iterator.map(children, el => this.createTreeNode(el, node, revealed && !treeElement.collapsed, treeListElements)));
		node.collapsible = node.collapsible || node.children.length > 0;

		if (!collapsed) {
			node.revealedCount += getVisibleCount(node.children);
		}

		return node;
	}

	getListIndex(location: number[]): number {
		return this.findNode(location).listIndex;
	}

	setCollapsed(location: number[], collapsed: boolean): boolean {
		const { node, listIndex, revealed } = this.findNode(location);
		return this._setCollapsed(node, listIndex, revealed, collapsed);
	}

	toggleCollapsed(location: number[]): void {
		const { node, listIndex, revealed } = this.findNode(location);
		this._setCollapsed(node, listIndex, revealed);
	}

	private _setCollapsed(node: IMutableTreeNode<T, TFilterData>, listIndex: number, revealed: boolean, collapsed?: boolean | undefined): boolean {
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

		if (revealed) {
			const previousVisibleCount = node.revealedCount;
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
				const revealed = listIndex < this.root.children.length;
				this._setCollapsed(node, listIndex, revealed, collapsed);

				queue.push(...node.children);
				listIndex++;
			}
		}
	}

	isCollapsed(location: number[]): boolean {
		return this.findNode(location).node.collapsed;
	}

	private findNode(location: number[]): { node: IMutableTreeNode<T, TFilterData>, listIndex: number, revealed: boolean } {
		const { parentNode, listIndex, revealed } = this.findParentNode(location);
		const index = location[location.length - 1];

		if (index < 0 || index > parentNode.children.length) {
			throw new Error('Invalid tree location');
		}

		const node = parentNode.children[index];

		return { node, listIndex, revealed };
	}

	private findParentNode(location: number[], node: IMutableTreeNode<T, TFilterData> = this.root, listIndex: number = 0, revealed = true): { parentNode: IMutableTreeNode<T, TFilterData>; listIndex: number; revealed: boolean; } {
		const [index, ...rest] = location;

		if (index < 0 || index > node.children.length) {
			throw new Error('Invalid tree location');
		}

		// TODO@joao perf!
		for (let i = 0; i < index; i++) {
			listIndex += node.children[i].revealedCount;
		}

		revealed = revealed && !node.collapsed;

		if (rest.length === 0) {
			return { parentNode: node, listIndex, revealed };
		}

		return this.findParentNode(rest, node.children[index], listIndex + 1, revealed);
	}
}