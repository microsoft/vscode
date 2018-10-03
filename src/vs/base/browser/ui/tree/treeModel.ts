/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
	readonly parent: IMutableTreeNode<T, TFilterData> | undefined;
	readonly children: IMutableTreeNode<T, TFilterData>[];
	collapsible: boolean;
	collapsed: boolean;
	revealedCount: number;
	filterData: TFilterData | undefined;
	visible: boolean;
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

function asIterator<T>(elements: Iterator<T> | T[] | undefined): Iterator<T> {
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

export interface ITreeModelOptions<T, TFilterData = void> {
	filter?: ITreeFilter<T, TFilterData>;
}

export class TreeModel<T, TFilterData = void> {

	static getNodeLocation<T>(node: ITreeNode<T, any>): number[] {
		const location = [];

		while (node.parent) {
			location.push(node.parent.children.indexOf(node));
			node = node.parent;
		}

		return location.reverse();
	}

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
		const elementsToInsert = asIterator(toInsert);
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

	refilter(/* location?: number[] */): void {
		const previousRevealedCount = this.root.revealedCount;
		const toInsert = this.updateNodeAfterFilterChange(this.root);
		this.list.splice(0, previousRevealedCount, toInsert);
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
			const toInsert = this.updateNodeAfterCollapseChange(node);

			this.list.splice(listIndex + 1, previousRevealedCount - 1, toInsert.slice(1));
			this._onDidChangeCollapseState.fire(node);
		}

		return true;
	}

	private createTreeNode(treeElement: ITreeElement<T>, parent: IMutableTreeNode<T, TFilterData>, revealed: boolean, treeListElements: ITreeNode<T, TFilterData>[]): IMutableTreeNode<T, TFilterData> {
		const node: IMutableTreeNode<T, TFilterData> = {
			parent,
			element: treeElement.element,
			children: [],
			depth: parent.depth + 1,
			collapsible: !!treeElement.collapsible,
			collapsed: !!treeElement.collapsed,
			revealedCount: 1,
			visible: true,
			filterData: undefined
		};

		const visible = this._filterNode(node);

		if (revealed) {
			treeListElements.push(node);
		}

		const childElements = asIterator(treeElement.children);
		const childNodes = Iterator.map(childElements, el => this.createTreeNode(el, node, revealed && !treeElement.collapsed, treeListElements));
		let hasVisibleDescendants = false;

		Iterator.forEach(childNodes, child => {
			node.children.push(child);
			hasVisibleDescendants = hasVisibleDescendants || child.visible;
		});

		node.collapsible = node.collapsible || node.children.length > 0;
		node.visible = typeof visible === 'undefined' ? hasVisibleDescendants : visible;

		if (!node.visible) {
			node.revealedCount = 0;

			if (revealed) {
				treeListElements.pop();
			}
		} else if (!node.collapsed) {
			// TODO@joao fix perf
			node.revealedCount += getRevealedCount(node.children);
		}

		return node;
	}

	/**
	 * Recursively updates the view state of a subtree, while collecting
	 * all the visible nodes in an array. Used in expanding/collapsing.
	 */
	private updateNodeAfterCollapseChange(node: IMutableTreeNode<T, TFilterData>): ITreeNode<T, TFilterData>[] {
		const previousRevealedCount = node.revealedCount;
		const result: ITreeNode<T, TFilterData>[] = [];

		this._updateNodeAfterCollapseChange(node, result);
		this._updateAncestorsRevealedCount(node.parent, result.length - previousRevealedCount);

		return result;
	}

	private _updateNodeAfterCollapseChange(node: IMutableTreeNode<T, TFilterData>, result: ITreeNode<T, TFilterData>[]): number {
		if (node.visible === false) {
			return 0;
		}

		result.push(node);
		node.revealedCount = 1;

		if (!node.collapsed) {
			for (const child of node.children) {
				node.revealedCount += this._updateNodeAfterCollapseChange(child, result);
			}
		}

		return node.revealedCount;
	}

	private updateNodeAfterFilterChange(node: IMutableTreeNode<T, TFilterData>): ITreeNode<T, TFilterData>[] {
		const previousRevealedCount = node.revealedCount;
		const result: ITreeNode<T, TFilterData>[] = [];

		this._updateNodeAfterFilterChange(node, result);
		this._updateAncestorsRevealedCount(node.parent, result.length - previousRevealedCount);

		return result;
	}

	private _updateNodeAfterFilterChange(node: IMutableTreeNode<T, TFilterData>, result: ITreeNode<T, TFilterData>[], revealed = true): boolean {
		let visible: boolean | undefined;

		if (node !== this.root) {
			visible = this._filterNode(node);

			if (visible === false) {
				node.visible = false;
				return false;
			}

			if (revealed) {
				result.push(node);
			}
		}

		const resultStartLength = result.length;
		node.revealedCount = node === this.root ? 0 : 1;

		let hasVisibleDescendants = false;
		if (visible !== false || !node.collapsed) {
			for (const child of node.children) {
				hasVisibleDescendants = this._updateNodeAfterFilterChange(child, result, revealed && !node.collapsed) || hasVisibleDescendants;
			}
		}

		if (node !== this.root) {
			node.visible = typeof visible === 'undefined' ? hasVisibleDescendants : visible;
		}

		if (!node.visible) {
			node.revealedCount = 0;

			if (revealed) {
				result.pop();
			}
		} else if (!node.collapsed) {
			node.revealedCount += result.length - resultStartLength;
		}

		return node.visible;
	}

	private _updateAncestorsRevealedCount(node: IMutableTreeNode<T, TFilterData>, diff: number): void {
		if (diff === 0) {
			return;
		}

		while (node) {
			node.revealedCount += diff;
			node = node.parent;
		}
	}

	private _filterNode(node: IMutableTreeNode<T, TFilterData>): boolean | undefined {
		const result = this.filter ? this.filter.filter(node.element) : Visibility.Visible;

		if (typeof result === 'boolean') {
			node.filterData = undefined;
			return result;
		} else if (isFilterResult<TFilterData>(result)) {
			node.filterData = result.data;
			return getVisibleState(result.visibility);
		} else {
			node.filterData = undefined;
			return getVisibleState(result);
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