/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISpliceable } from 'vs/base/common/sequence';
import { Iterator, ISequence, getSequenceIterator } from 'vs/base/common/iterator';
import { IndexTreeModel, IIndexTreeModelOptions } from 'vs/base/browser/ui/tree/indexTreeModel';
import { Event } from 'vs/base/common/event';
import { ITreeModel, ITreeNode, ITreeElement, ITreeSorter, ICollapseStateChangeEvent, ITreeModelSpliceEvent } from 'vs/base/browser/ui/tree/tree';

export interface IObjectTreeModelOptions<T, TFilterData> extends IIndexTreeModelOptions<T, TFilterData> {
	readonly sorter?: ITreeSorter<T>;
}

export class ObjectTreeModel<T extends NonNullable<any>, TFilterData extends NonNullable<any> = void> implements ITreeModel<T | null, TFilterData, T | null> {

	readonly rootRef = null;

	private model: IndexTreeModel<T | null, TFilterData>;
	private nodes = new Map<T | null, ITreeNode<T, TFilterData>>();
	private sorter?: ITreeSorter<{ element: T; }>;

	readonly onDidSplice: Event<ITreeModelSpliceEvent<T | null, TFilterData>>;
	readonly onDidChangeCollapseState: Event<ICollapseStateChangeEvent<T, TFilterData>>;
	readonly onDidChangeRenderNodeCount: Event<ITreeNode<T, TFilterData>>;

	get size(): number { return this.nodes.size; }

	constructor(list: ISpliceable<ITreeNode<T, TFilterData>>, options: IObjectTreeModelOptions<T, TFilterData> = {}) {
		this.model = new IndexTreeModel(list, null, options);
		this.onDidSplice = this.model.onDidSplice;
		this.onDidChangeCollapseState = this.model.onDidChangeCollapseState as Event<ICollapseStateChangeEvent<T, TFilterData>>;
		this.onDidChangeRenderNodeCount = this.model.onDidChangeRenderNodeCount as Event<ITreeNode<T, TFilterData>>;

		if (options.sorter) {
			this.sorter = {
				compare(a, b) {
					return options.sorter!.compare(a.element, b.element);
				}
			};
		}
	}

	setChildren(
		element: T | null,
		children: ISequence<ITreeElement<T>> | undefined,
		onDidCreateNode?: (node: ITreeNode<T, TFilterData>) => void,
		onDidDeleteNode?: (node: ITreeNode<T, TFilterData>) => void
	): Iterator<ITreeElement<T | null>> {
		const location = this.getElementLocation(element);
		return this._setChildren(location, this.preserveCollapseState(children), onDidCreateNode, onDidDeleteNode);
	}

	private _setChildren(
		location: number[],
		children: ISequence<ITreeElement<T>> | undefined,
		onDidCreateNode?: (node: ITreeNode<T, TFilterData>) => void,
		onDidDeleteNode?: (node: ITreeNode<T, TFilterData>) => void
	): Iterator<ITreeElement<T | null>> {
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
			children,
			_onDidCreateNode,
			_onDidDeleteNode
		);
	}

	private preserveCollapseState(elements: ISequence<ITreeElement<T>> | undefined): ISequence<ITreeElement<T>> {
		let iterator = elements ? getSequenceIterator(elements) : Iterator.empty<ITreeElement<T>>();

		if (this.sorter) {
			iterator = Iterator.fromArray(Iterator.collect(iterator).sort(this.sorter.compare.bind(this.sorter)));
		}

		return Iterator.map(iterator, treeElement => {
			const node = this.nodes.get(treeElement.element);

			if (!node) {
				return {
					...treeElement,
					children: this.preserveCollapseState(treeElement.children)
				};
			}

			const collapsible = typeof treeElement.collapsible === 'boolean' ? treeElement.collapsible : node.collapsible;
			const collapsed = typeof treeElement.collapsed !== 'undefined' ? treeElement.collapsed : node.collapsed;

			return {
				...treeElement,
				collapsible,
				collapsed,
				children: this.preserveCollapseState(treeElement.children)
			};
		});
	}

	rerender(element: T): void {
		const location = this.getElementLocation(element);
		this.model.rerender(location);
	}

	resort(element: T | null = null, recursive = true): void {
		if (!this.sorter) {
			return;
		}

		const location = this.getElementLocation(element);
		const node = this.model.getNode(location);

		this._setChildren(location, this.resortChildren(node, recursive));
	}

	private resortChildren(node: ITreeNode<T | null, TFilterData>, recursive: boolean, first = true): ISequence<ITreeElement<T>> {
		let childrenNodes = Iterator.fromArray(node.children as ITreeNode<T, TFilterData>[]);

		if (recursive || first) {
			childrenNodes = Iterator.fromArray(Iterator.collect(childrenNodes).sort(this.sorter!.compare.bind(this.sorter)));
		}

		return Iterator.map<ITreeNode<T | null, TFilterData>, ITreeElement<T>>(childrenNodes, node => ({
			element: node.element as T,
			collapsible: node.collapsible,
			collapsed: node.collapsed,
			children: this.resortChildren(node, recursive, false)
		}));
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

	getListRenderCount(element: T): number {
		const location = this.getElementLocation(element);
		return this.model.getListRenderCount(location);
	}

	isCollapsible(element: T): boolean {
		const location = this.getElementLocation(element);
		return this.model.isCollapsible(location);
	}

	isCollapsed(element: T): boolean {
		const location = this.getElementLocation(element);
		return this.model.isCollapsed(location);
	}

	setCollapsed(element: T, collapsed?: boolean, recursive?: boolean): boolean {
		const location = this.getElementLocation(element);
		return this.model.setCollapsed(location, collapsed, recursive);
	}

	expandTo(element: T): void {
		const location = this.getElementLocation(element);
		this.model.expandTo(location);
	}

	refilter(): void {
		this.model.refilter();
	}

	getNode(element: T | null = null): ITreeNode<T | null, TFilterData> {
		if (element === null) {
			return this.model.getNode(this.model.rootRef);
		}

		const node = this.nodes.get(element);

		if (!node) {
			throw new Error(`Tree element not found: ${element}`);
		}

		return node;
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
