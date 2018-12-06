/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISpliceable } from 'vs/base/common/sequence';
import { Iterator, ISequence } from 'vs/base/common/iterator';
import { Emitter, Event, EventBufferer } from 'vs/base/common/event';
import { tail2 } from 'vs/base/common/arrays';
import { ITreeFilterDataResult, TreeVisibility, ITreeFilter, ITreeModel, ITreeNode, ITreeElement } from 'vs/base/browser/ui/tree/tree';

interface IMutableTreeNode<T, TFilterData> extends ITreeNode<T, TFilterData> {
	readonly parent: IMutableTreeNode<T, TFilterData> | undefined;
	readonly children: IMutableTreeNode<T, TFilterData>[];
	collapsible: boolean;
	collapsed: boolean;
	renderNodeCount: number;
	visible: boolean;
	filterData: TFilterData | undefined;
}

function isFilterResult<T>(obj: any): obj is ITreeFilterDataResult<T> {
	return typeof obj === 'object' && 'visibility' in obj && 'data' in obj;
}

function treeNodeToElement<T>(node: IMutableTreeNode<T, any>): ITreeElement<T> {
	const { element, collapsed } = node;
	const children = Iterator.map(Iterator.fromArray(node.children), treeNodeToElement);

	return { element, children, collapsed };
}

function getVisibleState(visibility: boolean | TreeVisibility): TreeVisibility {
	switch (visibility) {
		case true: return TreeVisibility.Visible;
		case false: return TreeVisibility.Hidden;
		default: return visibility;
	}
}

export interface IIndexTreeModelOptions<T, TFilterData> {
	collapseByDefault?: boolean; // defaults to false
	filter?: ITreeFilter<T, TFilterData>;
}

export class IndexTreeModel<T extends Exclude<any, undefined>, TFilterData = void> implements ITreeModel<T, TFilterData, number[]> {

	private root: IMutableTreeNode<T, TFilterData>;
	private eventBufferer = new EventBufferer();

	private _onDidChangeCollapseState = new Emitter<ITreeNode<T, TFilterData>>();
	readonly onDidChangeCollapseState: Event<ITreeNode<T, TFilterData>> = this.eventBufferer.wrapEvent(this._onDidChangeCollapseState.event);

	private _onDidChangeRenderNodeCount = new Emitter<ITreeNode<T, TFilterData>>();
	readonly onDidChangeRenderNodeCount: Event<ITreeNode<T, TFilterData>> = this.eventBufferer.wrapEvent(this._onDidChangeRenderNodeCount.event);

	private collapseByDefault: boolean;
	private filter?: ITreeFilter<T, TFilterData>;

	constructor(private list: ISpliceable<ITreeNode<T, TFilterData>>, rootElement: T, options: IIndexTreeModelOptions<T, TFilterData> = {}) {
		this.collapseByDefault = typeof options.collapseByDefault === 'undefined' ? false : options.collapseByDefault;
		this.filter = options.filter;

		this.root = {
			parent: undefined,
			element: rootElement,
			children: [],
			depth: 0,
			collapsible: false,
			collapsed: false,
			renderNodeCount: 0,
			visible: true,
			filterData: undefined
		};
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
		const nodesToInsertIterator = Iterator.map(Iterator.from(toInsert), el => this.createTreeNode(el, parentNode, parentNode.visible ? TreeVisibility.Visible : TreeVisibility.Hidden, revealed, treeListElementsToInsert, onDidCreateNode));

		const nodesToInsert: IMutableTreeNode<T, TFilterData>[] = [];
		let renderNodeCount = 0;

		Iterator.forEach(nodesToInsertIterator, node => {
			nodesToInsert.push(node);
			renderNodeCount += node.renderNodeCount;
		});

		const lastIndex = location[location.length - 1];
		const deletedNodes = parentNode.children.splice(lastIndex, deleteCount, ...nodesToInsert);

		if (revealed) {
			const visibleDeleteCount = deletedNodes.reduce((r, node) => r + node.renderNodeCount, 0);

			this._updateAncestorsRenderNodeCount(parentNode, renderNodeCount - visibleDeleteCount);
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
		return this.getTreeNodeWithListIndex(location).listIndex;
	}

	setCollapsed(location: number[], collapsed: boolean): boolean {
		const { node, listIndex, revealed } = this.getTreeNodeWithListIndex(location);
		return this.eventBufferer.bufferEvents(() => this._setCollapsed(node, listIndex, revealed, collapsed));
	}

	toggleCollapsed(location: number[]): void {
		const { node, listIndex, revealed } = this.getTreeNodeWithListIndex(location);
		this.eventBufferer.bufferEvents(() => this._setCollapsed(node, listIndex, revealed));
	}

	collapseAll(): void {
		const queue = [...this.root.children];
		let listIndex = 0;

		this.eventBufferer.bufferEvents(() => {
			while (queue.length > 0) {
				const node = queue.shift()!;
				const revealed = listIndex < this.root.children.length;
				this._setCollapsed(node, listIndex, revealed, true);

				queue.push(...node.children);
				listIndex++;
			}
		});
	}

	isCollapsible(location: number[]): boolean {
		return this.getTreeNode(location).collapsible;
	}

	isCollapsed(location: number[]): boolean {
		return this.getTreeNode(location).collapsed;
	}

	refilter(): void {
		const previousRenderNodeCount = this.root.renderNodeCount;
		const toInsert = this.updateNodeAfterFilterChange(this.root);
		this.list.splice(0, previousRenderNodeCount, toInsert);
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
			const previousRenderNodeCount = node.renderNodeCount;
			const toInsert = this.updateNodeAfterCollapseChange(node);

			this.list.splice(listIndex + 1, previousRenderNodeCount - 1, toInsert.slice(1));
			this._onDidChangeCollapseState.fire(node);
		}

		return true;
	}

	private createTreeNode(
		treeElement: ITreeElement<T>,
		parent: IMutableTreeNode<T, TFilterData>,
		parentVisibility: TreeVisibility,
		revealed: boolean,
		treeListElements: ITreeNode<T, TFilterData>[],
		onDidCreateNode?: (node: ITreeNode<T, TFilterData>) => void
	): IMutableTreeNode<T, TFilterData> {
		const node: IMutableTreeNode<T, TFilterData> = {
			parent,
			element: treeElement.element,
			children: [],
			depth: parent.depth + 1,
			collapsible: typeof treeElement.collapsible === 'boolean' ? treeElement.collapsible : (typeof treeElement.collapsed !== 'undefined'),
			collapsed: typeof treeElement.collapsed === 'undefined' ? this.collapseByDefault : treeElement.collapsed,
			renderNodeCount: 1,
			visible: true,
			filterData: undefined
		};

		const visibility = this._filterNode(node, parentVisibility);

		if (revealed) {
			treeListElements.push(node);
		}

		const childElements = Iterator.from(treeElement.children);
		const childRevealed = revealed && visibility !== TreeVisibility.Hidden && !node.collapsed;
		const childNodes = Iterator.map(childElements, el => this.createTreeNode(el, node, visibility, childRevealed, treeListElements, onDidCreateNode));

		let hasVisibleDescendants = false;
		let renderNodeCount = 1;

		Iterator.forEach(childNodes, child => {
			node.children.push(child);
			hasVisibleDescendants = hasVisibleDescendants || child.visible;
			renderNodeCount += child.renderNodeCount;
		});

		node.collapsible = node.collapsible || node.children.length > 0;
		node.visible = visibility === TreeVisibility.Recurse ? hasVisibleDescendants : (visibility === TreeVisibility.Visible);

		if (!node.visible) {
			node.renderNodeCount = 0;

			if (revealed) {
				treeListElements.pop();
			}
		} else if (!node.collapsed) {
			node.renderNodeCount = renderNodeCount;
		}

		if (onDidCreateNode) {
			onDidCreateNode(node);
		}

		return node;
	}

	private updateNodeAfterCollapseChange(node: IMutableTreeNode<T, TFilterData>): ITreeNode<T, TFilterData>[] {
		const previousRenderNodeCount = node.renderNodeCount;
		const result: ITreeNode<T, TFilterData>[] = [];

		this._updateNodeAfterCollapseChange(node, result);
		this._updateAncestorsRenderNodeCount(node.parent, result.length - previousRenderNodeCount);

		return result;
	}

	private _updateNodeAfterCollapseChange(node: IMutableTreeNode<T, TFilterData>, result: ITreeNode<T, TFilterData>[]): number {
		if (node.visible === false) {
			return 0;
		}

		result.push(node);
		node.renderNodeCount = 1;

		if (!node.collapsed) {
			for (const child of node.children) {
				node.renderNodeCount += this._updateNodeAfterCollapseChange(child, result);
			}
		}

		this._onDidChangeRenderNodeCount.fire(node);
		return node.renderNodeCount;
	}

	private updateNodeAfterFilterChange(node: IMutableTreeNode<T, TFilterData>): ITreeNode<T, TFilterData>[] {
		const previousRenderNodeCount = node.renderNodeCount;
		const result: ITreeNode<T, TFilterData>[] = [];

		this._updateNodeAfterFilterChange(node, node.visible ? TreeVisibility.Visible : TreeVisibility.Hidden, result);
		this._updateAncestorsRenderNodeCount(node.parent, result.length - previousRenderNodeCount);

		return result;
	}

	private _updateNodeAfterFilterChange(node: IMutableTreeNode<T, TFilterData>, parentVisibility: TreeVisibility, result: ITreeNode<T, TFilterData>[], revealed = true): boolean {
		let visibility: TreeVisibility;

		if (node !== this.root) {
			visibility = this._filterNode(node, parentVisibility);

			if (visibility === TreeVisibility.Hidden) {
				node.visible = false;
				return false;
			}

			if (revealed) {
				result.push(node);
			}
		}

		const resultStartLength = result.length;
		node.renderNodeCount = node === this.root ? 0 : 1;

		let hasVisibleDescendants = false;
		if (!node.collapsed || visibility! !== TreeVisibility.Hidden) {
			for (const child of node.children) {
				hasVisibleDescendants = this._updateNodeAfterFilterChange(child, visibility!, result, revealed && !node.collapsed) || hasVisibleDescendants;
			}
		}

		if (node !== this.root) {
			node.visible = visibility! === TreeVisibility.Recurse ? hasVisibleDescendants : (visibility! === TreeVisibility.Visible);
		}

		if (!node.visible) {
			node.renderNodeCount = 0;

			if (revealed) {
				result.pop();
			}
		} else if (!node.collapsed) {
			node.renderNodeCount += result.length - resultStartLength;
		}

		this._onDidChangeRenderNodeCount.fire(node);
		return node.visible;
	}

	private _updateAncestorsRenderNodeCount(node: IMutableTreeNode<T, TFilterData> | undefined, diff: number): void {
		if (diff === 0) {
			return;
		}

		while (node) {
			node.renderNodeCount += diff;
			this._onDidChangeRenderNodeCount.fire(node);
			node = node.parent;
		}
	}

	private _filterNode(node: IMutableTreeNode<T, TFilterData>, parentVisibility: TreeVisibility): TreeVisibility {
		const result = this.filter ? this.filter.filter(node.element, parentVisibility) : TreeVisibility.Visible;

		if (typeof result === 'boolean') {
			node.filterData = undefined;
			return result ? TreeVisibility.Visible : TreeVisibility.Hidden;
		} else if (isFilterResult<TFilterData>(result)) {
			node.filterData = result.data;
			return getVisibleState(result.visibility);
		} else {
			node.filterData = undefined;
			return getVisibleState(result);
		}
	}

	// cheap
	private getTreeNode(location: number[], node: IMutableTreeNode<T, TFilterData> = this.root): IMutableTreeNode<T, TFilterData> {
		if (!location || location.length === 0) {
			return node;
		}

		const [index, ...rest] = location;

		if (index < 0 || index > node.children.length) {
			throw new Error('Invalid tree location');
		}

		return this.getTreeNode(rest, node.children[index]);
	}

	// expensive
	private getTreeNodeWithListIndex(location: number[]): { node: IMutableTreeNode<T, TFilterData>, listIndex: number, revealed: boolean } {
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
			listIndex += node.children[i].renderNodeCount;
		}

		revealed = revealed && !node.collapsed;

		if (rest.length === 0) {
			return { parentNode: node, listIndex, revealed };
		}

		return this.getParentNodeWithListIndex(rest, node.children[index], listIndex + 1, revealed);
	}

	getNode(location: number[] = []): ITreeNode<T, TFilterData> {
		return this.getTreeNode(location);
	}

	// TODO@joao perf!
	getNodeLocation(node: ITreeNode<T, TFilterData>): number[] {
		const location: number[] = [];

		while (node.parent) {
			location.push(node.parent.children.indexOf(node));
			node = node.parent;
		}

		return location.reverse();
	}

	getParentNodeLocation(location: number[]): number[] {
		if (location.length <= 1) {
			return [];
		}

		return tail2(location)[0];
	}

	getParentElement(location: number[]): T {
		const parentLocation = this.getParentNodeLocation(location);
		const node = this.getTreeNode(parentLocation);
		return node.element;
	}

	getFirstElementChild(location: number[]): T | undefined {
		const node = this.getTreeNode(location);

		if (node.children.length === 0) {
			return undefined;
		}

		return node.children[0].element;
	}

	getLastElementAncestor(location: number[] = []): T | undefined {
		const node = this.getTreeNode(location);

		if (node.children.length === 0) {
			return undefined;
		}

		return this._getLastElementAncestor(node);
	}

	private _getLastElementAncestor(node: ITreeNode<T, TFilterData>): T {
		if (node.children.length === 0) {
			return node.element;
		}

		return this._getLastElementAncestor(node.children[node.children.length - 1]);
	}
}