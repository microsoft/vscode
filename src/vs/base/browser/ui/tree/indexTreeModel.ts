/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISpliceable } from 'vs/base/common/sequence';
import { Iterator, ISequence } from 'vs/base/common/iterator';
import { Emitter, Event } from 'vs/base/common/event';
import { tail2 } from 'vs/base/common/arrays';
import { ITreeFilterDataResult, TreeVisibility, ITreeFilter, ITreeOptions, ITreeModel, ITreeNode, ITreeElement } from 'vs/base/browser/ui/tree/tree';

interface IMutableTreeNode<T, TFilterData> extends ITreeNode<T, TFilterData> {
	readonly parent: IMutableTreeNode<T, TFilterData> | undefined;
	readonly children: IMutableTreeNode<T, TFilterData>[];
	collapsible: boolean;
	collapsed: boolean;
	revealedCount: number;
	filterData: TFilterData | undefined;
	visible: boolean;
}

function isFilterResult<T>(obj: any): obj is ITreeFilterDataResult<T> {
	return typeof obj === 'object' && 'visibility' in obj && 'data' in obj;
}

function treeNodeToElement<T>(node: IMutableTreeNode<T, any>): ITreeElement<T> {
	const { element, collapsed } = node;
	const children = Iterator.map(Iterator.fromArray(node.children), treeNodeToElement);

	return { element, children, collapsed };
}

function getVisibleState(visibility: boolean | TreeVisibility): boolean | undefined {
	switch (visibility) {
		case true: return true;
		case false: return false;
		case TreeVisibility.Hidden: return false;
		case TreeVisibility.Visible: return true;
		case TreeVisibility.Recurse: return undefined;
	}
}

export interface IIndexTreeModelOptions<T, TFilterData> extends ITreeOptions<T, TFilterData> { }

export class IndexTreeModel<T, TFilterData = void> implements ITreeModel<T, TFilterData, number[]> {

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

	constructor(private list: ISpliceable<ITreeNode<T, TFilterData>>, options: IIndexTreeModelOptions<T, TFilterData> = {}) {
		this.filter = options.filter;
	}

	splice(
		location: number[],
		deleteCount: number,
		toInsert?: ISequence<ITreeElement<T>>,
		onDidCreateNode?: (node: ITreeNode<T, TFilterData>) => void,
		onDidDeleteNode?: (node: ITreeNode<T, TFilterData>) => void
	): Iterator<ITreeElement<T>> {
		if (location.length === 0) {
			throw new Error('Invalid tree location');
		}

		const { parentNode, listIndex, revealed } = this.getParentNodeWithListIndex(location);
		const treeListElementsToInsert: ITreeNode<T, TFilterData>[] = [];
		const nodesToInsertIterator = Iterator.map(Iterator.from(toInsert), el => this.createTreeNode(el, parentNode, revealed, treeListElementsToInsert, onDidCreateNode));

		const nodesToInsert: IMutableTreeNode<T, TFilterData>[] = [];
		let revealedCount = 0;

		Iterator.forEach(nodesToInsertIterator, node => {
			nodesToInsert.push(node);
			revealedCount += node.revealedCount;
		});

		const lastIndex = location[location.length - 1];
		const deletedNodes = parentNode.children.splice(lastIndex, deleteCount, ...nodesToInsert);

		if (revealed) {
			const visibleDeleteCount = deletedNodes.reduce((r, node) => r + node.revealedCount, 0);

			this._updateAncestorsRevealedCount(parentNode, revealedCount - visibleDeleteCount);
			this.list.splice(listIndex, visibleDeleteCount, treeListElementsToInsert);
		}

		if (deletedNodes.length > 0 && onDidDeleteNode) {
			const visit = (node: ITreeNode<T, TFilterData>) => {
				onDidDeleteNode(node);
				node.children.forEach(visit);
			};

			deletedNodes.forEach(visit);
		}

		return Iterator.map(Iterator.fromArray(deletedNodes), treeNodeToElement);
	}

	getListIndex(location: number[]): number {
		return this.getNodeWithListIndex(location).listIndex;
	}

	setCollapsed(location: number[], collapsed: boolean): boolean {
		const { node, listIndex, revealed } = this.getNodeWithListIndex(location);
		return this._setCollapsed(node, listIndex, revealed, collapsed);
	}

	toggleCollapsed(location: number[]): void {
		const { node, listIndex, revealed } = this.getNodeWithListIndex(location);
		this._setCollapsed(node, listIndex, revealed);
	}

	// // TODO@joao cleanup
	// setCollapsedAll(collapsed: boolean): void {
	// 	if (collapsed) {
	// 		const queue = [...this.root.children]; // TODO@joao use a linked list
	// 		let listIndex = 0;

	// 		while (queue.length > 0) {
	// 			const node = queue.shift();
	// 			const revealed = listIndex < this.root.children.length;
	// 			this._setCollapsed(node, listIndex, revealed, collapsed);

	// 			queue.push(...node.children);
	// 			listIndex++;
	// 		}
	// 	}
	// }

	isCollapsed(location: number[]): boolean {
		return this.getNode(location).collapsed;
	}

	refilter(): void {
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

	private createTreeNode(
		treeElement: ITreeElement<T>,
		parent: IMutableTreeNode<T, TFilterData>,
		revealed: boolean,
		treeListElements: ITreeNode<T, TFilterData>[],
		onDidCreateNode?: (node: ITreeNode<T, TFilterData>) => void
	): IMutableTreeNode<T, TFilterData> {
		const node: IMutableTreeNode<T, TFilterData> = {
			parent,
			element: treeElement.element,
			children: [],
			depth: parent.depth + 1,
			collapsible: typeof treeElement.collapsible === 'boolean' ? treeElement.collapsible : (typeof treeElement.collapsed === 'boolean'),
			collapsed: !!treeElement.collapsed,
			revealedCount: 1,
			visible: true,
			filterData: undefined
		};

		const visible = this._filterNode(node);

		if (revealed) {
			treeListElements.push(node);
		}

		const childElements = Iterator.from(treeElement.children);
		const childRevealed = revealed && visible !== false && !node.collapsed;
		const childNodes = Iterator.map(childElements, el => this.createTreeNode(el, node, childRevealed, treeListElements, onDidCreateNode));

		let hasVisibleDescendants = false;
		let revealedCount = 1;

		Iterator.forEach(childNodes, child => {
			node.children.push(child);
			hasVisibleDescendants = hasVisibleDescendants || child.visible;
			revealedCount += child.revealedCount;
		});

		node.collapsible = node.collapsible || node.children.length > 0;
		node.visible = typeof visible === 'undefined' ? hasVisibleDescendants : visible;

		if (!node.visible) {
			node.revealedCount = 0;

			if (revealed) {
				treeListElements.pop();
			}
		} else if (!node.collapsed) {
			node.revealedCount = revealedCount;
		}

		if (onDidCreateNode) {
			onDidCreateNode(node);
		}

		return node;
	}

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
		const result = this.filter ? this.filter.filter(node.element) : TreeVisibility.Visible;

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

	/**
	 * Cheaper version of findNode, which doesn't require list indices.
	 */
	private getNode(location: number[], node: IMutableTreeNode<T, TFilterData> = this.root): IMutableTreeNode<T, TFilterData> {
		if (location.length === 0) {
			return node;
		}

		const [index, ...rest] = location;

		if (index < 0 || index > node.children.length) {
			throw new Error('Invalid tree location');
		}

		return this.getNode(rest, node.children[index]);
	}

	private getNodeWithListIndex(location: number[]): { node: IMutableTreeNode<T, TFilterData>, listIndex: number, revealed: boolean } {
		const { parentNode, listIndex, revealed } = this.getParentNodeWithListIndex(location);
		const index = location[location.length - 1];

		if (index < 0 || index > parentNode.children.length) {
			throw new Error('Invalid tree location');
		}

		const node = parentNode.children[index];

		return { node, listIndex, revealed };
	}

	private getParentNodeWithListIndex(location: number[], node: IMutableTreeNode<T, TFilterData> = this.root, listIndex: number = 0, revealed = true): { parentNode: IMutableTreeNode<T, TFilterData>; listIndex: number; revealed: boolean; } {
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

		return this.getParentNodeWithListIndex(rest, node.children[index], listIndex + 1, revealed);
	}

	// TODO@joao perf!
	getNodeLocation(node: ITreeNode<T, TFilterData>): number[] {
		const location = [];

		while (node.parent) {
			location.push(node.parent.children.indexOf(node));
			node = node.parent;
		}

		return location.reverse();
	}

	getParentNodeLocation(location: number[]): number[] | null {
		if (location.length <= 1) {
			return null;
		}

		return tail2(location)[0];
	}

	getParentElement(location: number[]): T | null {
		const parentLocation = this.getParentNodeLocation(location);
		const node = this.getNode(parentLocation);
		return node === this.root ? null : node.element;
	}

	getFirstElementChild(location: number[]): T | null {
		const node = this.getNode(location);

		if (node.children.length === 0) {
			return null;
		}

		return node.children[0].element;
	}

	getLastElementAncestor(location: number[]): T | null {
		const node = this.getNode(location);

		if (node.children.length === 0) {
			return null;
		}

		return this._getLastElementAncestor(node);
	}

	private _getLastElementAncestor(node: ITreeNode<T, TFilterData>): T | null {
		if (node.children.length === 0) {
			return node.element;
		}

		return this._getLastElementAncestor(node.children[node.children.length - 1]);
	}
}