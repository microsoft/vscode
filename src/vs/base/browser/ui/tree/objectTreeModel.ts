/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISpliceable } from 'vs/base/common/sequence';
import { Iterator, ISequence, getSequenceIterator } from 'vs/base/common/iterator';
import { IndexTreeModel, IIndexTreeModelOptions } from 'vs/base/browser/ui/tree/indexTreeModel';
import { Event } from 'vs/base/common/event';
import { ITreeModel, ITreeNode, ITreeElement } from 'vs/base/browser/ui/tree/tree';

export interface IObjectTreeModelOptions<T, TFilterData> extends IIndexTreeModelOptions<T, TFilterData> { }

export class ObjectTreeModel<T extends NonNullable<any>, TFilterData extends NonNullable<any> = void> implements ITreeModel<T | null, TFilterData, T | null> {

	private model: IndexTreeModel<T | null, TFilterData>;
	private nodes = new Map<T | null, ITreeNode<T, TFilterData>>();

	readonly onDidChangeCollapseState: Event<ITreeNode<T, TFilterData>>;
	readonly onDidChangeRenderNodeCount: Event<ITreeNode<T, TFilterData>>;

	get size(): number { return this.nodes.size; }

	constructor(list: ISpliceable<ITreeNode<T, TFilterData>>, options: IObjectTreeModelOptions<T, TFilterData> = {}) {
		this.model = new IndexTreeModel(list, null, options);
		this.onDidChangeCollapseState = this.model.onDidChangeCollapseState as Event<ITreeNode<T, TFilterData>>;
		this.onDidChangeRenderNodeCount = this.model.onDidChangeRenderNodeCount as Event<ITreeNode<T, TFilterData>>;
	}

	setChildren(
		element: T | null,
		children: ISequence<ITreeElement<T>> | undefined,
		onDidCreateNode?: (node: ITreeNode<T, TFilterData>) => void,
		onDidDeleteNode?: (node: ITreeNode<T, TFilterData>) => void
	): Iterator<ITreeElement<T | null>> {
		const location = this.getElementLocation(element);
		const insertedElements = new Set<T | null>();

		const _onDidCreateNode = (node: ITreeNode<T, TFilterData>) => {
			insertedElements.add(node.element);
			this.nodes.set(node.element, node);

			if (onDidCreateNode) {
				onDidCreateNode(node);
			}
		};

		const _onDidDeleteNode = (node: ITreeNode<T, TFilterData>) => {
			if (!insertedElements.has(node.element)) {
				this.nodes.delete(node.element);
			}

			if (onDidDeleteNode) {
				onDidDeleteNode(node);
			}
		};

		return this.model.splice(
			[...location, 0],
			Number.MAX_VALUE,
			this.preserveCollapseState(children),
			_onDidCreateNode,
			_onDidDeleteNode
		);
	}

	private preserveCollapseState(elements: ISequence<ITreeElement<T | null>> | undefined): ISequence<ITreeElement<T | null>> {
		const iterator = elements ? getSequenceIterator(elements) : Iterator.empty<ITreeElement<T>>();

		return Iterator.map(iterator, treeElement => {
			const node = this.nodes.get(treeElement.element);

			if (!node) {
				return treeElement;
			}

			const collapsible = typeof treeElement.collapsible === 'boolean' ? treeElement.collapsible : node.collapsible;
			const collapsed = typeof treeElement.collapsed !== 'undefined' ? treeElement.collapsed : (collapsible && node.collapsed);

			return {
				...treeElement,
				collapsible,
				collapsed,
				children: this.preserveCollapseState(treeElement.children)
			};
		});
	}

	getParentElement(ref: T | null = null): T | null {
		const location = this.getElementLocation(ref);
		return this.model.getParentElement(location);
	}

	getFirstElementChild(ref: T | null = null): T | null | undefined {
		const location = this.getElementLocation(ref);
		return this.model.getFirstElementChild(location);
	}

	getLastElementAncestor(ref: T | null = null): T | null | undefined {
		const location = this.getElementLocation(ref);
		return this.model.getLastElementAncestor(location);
	}

	getListIndex(element: T): number {
		const location = this.getElementLocation(element);
		return this.model.getListIndex(location);
	}

	setCollapsed(element: T, collapsed: boolean): boolean {
		const location = this.getElementLocation(element);
		return this.model.setCollapsed(location, collapsed);
	}

	toggleCollapsed(element: T): void {
		const location = this.getElementLocation(element);
		this.model.toggleCollapsed(location);
	}

	collapseAll(): void {
		this.model.collapseAll();
	}

	isCollapsible(element: T): boolean {
		const location = this.getElementLocation(element);
		return this.model.isCollapsible(location);
	}

	isCollapsed(element: T): boolean {
		const location = this.getElementLocation(element);
		return this.model.isCollapsed(location);
	}

	refilter(): void {
		this.model.refilter();
	}

	getNode(element: T | null = null): ITreeNode<T | null, TFilterData> {
		const location = this.getElementLocation(element);
		return this.model.getNode(location);
	}

	getNodeLocation(node: ITreeNode<T, TFilterData>): T {
		return node.element;
	}

	getParentNodeLocation(element: T): T | null {
		const node = this.nodes.get(element);

		if (!node) {
			throw new Error(`Tree element not found: ${element}`);
		}

		return node.parent!.element;
	}

	private getElementLocation(element: T | null): number[] {
		if (element === null) {
			return [];
		}

		const node = this.nodes.get(element);

		if (!node) {
			throw new Error(`Tree element not found: ${element}`);
		}

		return this.model.getNodeLocation(node);
	}
}
