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
	readonly filterData: TFilterData | undefined;
}

interface IMutableTreeNode<T, TFilterData> extends ITreeNode<T, TFilterData> {
	parent: IMutableTreeNode<T, TFilterData> | undefined;
	children: IMutableTreeNode<T, TFilterData>[];
	collapsible: boolean;
	collapsed: boolean;
	revealedCount: number;
	filterData: TFilterData | undefined;

	// internal state
	visible: boolean | undefined;
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

function isFilterResult<T>(obj: any): obj is IFilterResult<T> {
	return typeof obj === 'object' && 'visibility' in obj && 'data' in obj;
}

export interface ITreeFilter<T, TFilterData = void> {
	filter(element: T): boolean | Visibility | IFilterResult<TFilterData>;
}

function revealedCountReducer<T>(result: number, node: IMutableTreeNode<T, any>): number {
	return result + (node.visible ? (node.collapsed ? 1 : node.revealedCount) : 0);
}

function getRevealedCount<T>(nodes: IMutableTreeNode<T, any>[]): number {
	return nodes.reduce(revealedCountReducer, 0);
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

function getVisibleState(visibility: Visibility): boolean | undefined {
	switch (visibility) {
		case Visibility.Hidden: return false;
		case Visibility.Visible: return true;
		case Visibility.Recurse: return undefined;
	}
}

export function getNodeLocation<T>(node: ITreeNode<T, any>): number[] {
	const location = [];

	while (node.parent) {
		location.push(node.parent.children.indexOf(node));
		node = node.parent;
	}

	return location.reverse();
}

export interface ITreeModelOptions<T, TFilterData = void> {
	filter?: ITreeFilter<T, TFilterData>;
}

export class TreeModel<T, TFilterData = void> {

	private root: IMutableTreeNode<T, TFilterData> = {
		parent: undefined,
		element: undefined,
		children: [],
		depth: 0,
		collapsible: false,
		collapsed: false,
		revealedCount: 0,
		visible: true,
		filterData: undefined
	};

	private _onDidChangeCollapseState = new Emitter<ITreeNode<T, TFilterData>>();
	readonly onDidChangeCollapseState: Event<ITreeNode<T, TFilterData>> = this._onDidChangeCollapseState.event;

	private filter?: ITreeFilter<T, TFilterData>;

	constructor(private list: ISpliceable<ITreeNode<T, TFilterData>>, options: ITreeModelOptions<T, TFilterData> = {}) {
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
		const visibleDeleteCount = getRevealedCount(deletedNodes);

		parentNode.revealedCount += getRevealedCount(nodesToInsert) - visibleDeleteCount;

		if (revealed) {
			this.list.splice(listIndex, visibleDeleteCount, treeListElementsToInsert);
		}

		return Iterator.map(Iterator.fromArray(deletedNodes), treeNodeToElement);
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

	refilter(location?: number[]): void {
		let node: ITreeNode<T, TFilterData>;

		if (!location || location.length === 0) {
			node = this.root;

			const previousRevealedCount = node.revealedCount;
			const toInsert = this.updateSubtreeViewState(this.root);
			this.list.splice(0, previousRevealedCount, toInsert.slice(1));
		} else {
			const findResult = this.findNode(location);

			if (!findResult.revealed) {
				return;
			}

			node = findResult.node;

			const previousRevealedCount = node.revealedCount;
			const toInsert = this.updateSubtreeViewState(this.root);
			this.list.splice(findResult.listIndex, previousRevealedCount, toInsert);
		}
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
			const previousRevealedCount = node.revealedCount;
			const toInsert = this.updateSubtreeViewState(node);

			this.list.splice(listIndex + 1, previousRevealedCount - 1, toInsert.slice(1));
			this._onDidChangeCollapseState.fire(node);
		}

		return true;
	}

	private createTreeNode(treeElement: ITreeElement<T>, parent: IMutableTreeNode<T, TFilterData>, revealed: boolean, treeListElements: ITreeNode<T, TFilterData>[]): IMutableTreeNode<T, TFilterData> {
		const depth = parent.depth + 1;
		const { element, collapsible, collapsed } = treeElement;
		const node: IMutableTreeNode<T, TFilterData> = { parent, element, children: [], depth, collapsible: !!collapsible, collapsed: !!collapsed, revealedCount: 1, visible: true, filterData: undefined };

		this.updateNodeFilterState(node);

		if (revealed && node.visible) {
			treeListElements.push(node);
		}

		const children = getTreeElementIterator(treeElement.children);
		node.children = Iterator.collect(Iterator.map(children, el => this.createTreeNode(el, node, revealed && !treeElement.collapsed, treeListElements)));
		node.collapsible = node.collapsible || node.children.length > 0;

		if (typeof node.visible === 'undefined' && node.children.length === 0) {
			node.visible = false;
			treeListElements.pop();
		} else {
			node.visible = true;
		}

		if (node.visible && !collapsed) {
			node.revealedCount += getRevealedCount(node.children);
		}

		return node;
	}

	/**
	 * Recursively updates the view state of a subtree, while collecting
	 * all the visible nodes in an array. Used in expanding/collapsing.
	 */
	private updateSubtreeViewState(node: IMutableTreeNode<T, TFilterData>, filterFirst = false): ITreeNode<T, TFilterData>[] {
		const previousRevealedCount = node.revealedCount;
		const result: ITreeNode<T, TFilterData>[] = [];
		let first = true;

		const recurse = (node: IMutableTreeNode<T, TFilterData>): number => {
			if (!first || filterFirst) {
				this.updateNodeFilterState(node);
			}

			if (node.visible === false) {
				return 0;
			}

			first = false;
			result.push(node);
			node.revealedCount = 1;

			let childrenRevealedCount = 0;
			if (!node.collapsed) {
				for (const child of node.children) {
					childrenRevealedCount += recurse(child);
				}
			}

			if (typeof node.visible === 'undefined' && childrenRevealedCount === 0) {
				node.visible = false;
				result.pop();
				return 0;
			}

			node.revealedCount += childrenRevealedCount;

			return node.revealedCount;
		};

		recurse(node);

		const revealedCountDiff = result.length - previousRevealedCount;

		if (revealedCountDiff === 0) {
			return result;
		}

		node = node.parent;

		while (node) {
			node.revealedCount += revealedCountDiff;
			node = node.parent;
		}

		return result;
	}

	private updateNodeFilterState(node: IMutableTreeNode<T, TFilterData>): void {
		const result = this.filter ? this.filter.filter(node.element) : Visibility.Visible;

		if (typeof result === 'boolean') {
			node.visible = result;
			node.filterData = undefined;
		} else if (isFilterResult<TFilterData>(result)) {
			node.visible = getVisibleState(result.visibility);
			node.filterData = result.data;
		} else {
			node.visible = getVisibleState(result);
			node.filterData = undefined;
		}
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