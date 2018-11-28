/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISpliceable } from 'vs/base/common/sequence';
import { Iterator, ISequence, getSequenceIterator } from 'vs/base/common/iterator';
import { IndexTreeModel, IIndexTreeModelOptions } from 'vs/base/browser/ui/tree/indexTreeModel';
import { Event } from 'vs/base/common/event';
import { ITreeModel, ITreeNode, ITreeElement } from 'vs/base/browser/ui/tree/tree';
import { IIdentityProvider } from 'vs/base/browser/ui/list/list';

export interface IObjectTreeModelOptions<T, TFilterData> extends IIndexTreeModelOptions<T, TFilterData> {
	identityProvider?: IIdentityProvider<T>;
}

export class ObjectTreeModel<T extends NonNullable<any>, TFilterData = void> implements ITreeModel<T, TFilterData, T> {

	private model: IndexTreeModel<T, TFilterData>;
	private nodes = new Map<T, ITreeNode<T, TFilterData>>();

	private identityProvider: IIdentityProvider<T> | undefined = undefined;
	private nodesByIdentity: Map<string, ITreeNode<T, TFilterData>> | undefined = undefined;

	readonly onDidChangeCollapseState: Event<ITreeNode<T, TFilterData>>;
	readonly onDidChangeRenderNodeCount: Event<ITreeNode<T, TFilterData>>;

	get size(): number { return this.nodes.size; }

	constructor(list: ISpliceable<ITreeNode<T, TFilterData>>, options: IObjectTreeModelOptions<T, TFilterData> = {}) {
		this.model = new IndexTreeModel(list, options);
		this.identityProvider = options.identityProvider;

		if (this.identityProvider) {
			this.nodesByIdentity = new Map();
		}

		this.onDidChangeCollapseState = this.model.onDidChangeCollapseState;
		this.onDidChangeRenderNodeCount = this.model.onDidChangeRenderNodeCount;
	}

	setChildren(
		element: T | null,
		children?: ISequence<ITreeElement<T>>,
		onDidCreateNode?: (node: ITreeNode<T, TFilterData>) => void,
		onDidDeleteNode?: (node: ITreeNode<T, TFilterData>) => void
	): Iterator<ITreeElement<T>> {
		const location = this.getElementLocation(element);
		const insertedElements = new Set<T>();
		let createdNodesByIdentity: Map<string, ITreeNode<T, TFilterData>> | undefined;

		if (this.identityProvider) {
			createdNodesByIdentity = new Map();
		}

		const _onDidCreateNode = (node: ITreeNode<T, TFilterData>) => {
			insertedElements.add(node.element);
			this.nodes.set(node.element, node);

			if (createdNodesByIdentity) {
				createdNodesByIdentity.set(this.identityProvider!.getId(node.element).toString(), node);
			}

			if (onDidCreateNode) {
				onDidCreateNode(node);
			}
		};

		const _onDidDeleteNode = (node: ITreeNode<T, TFilterData>) => {
			if (!insertedElements.has(node.element)) {
				this.nodes.delete(node.element);
			}

			if (this.nodesByIdentity) {
				this.nodesByIdentity.delete(this.identityProvider!.getId(node.element).toString());
			}

			if (onDidDeleteNode) {
				onDidDeleteNode(node);
			}
		};

		const preserveCollapseState = (elements: ISequence<ITreeElement<T>>): ISequence<ITreeElement<T>> => {
			const iterator = getSequenceIterator(elements);

			return Iterator.map(iterator, treeElement => {
				const identity = this.identityProvider!.getId(treeElement.element).toString();
				const node = this.nodesByIdentity!.get(identity);
				const collapsible = typeof treeElement.collapsible === 'boolean' ? treeElement.collapsible : (typeof treeElement.collapsed !== 'undefined');

				return {
					...treeElement,
					collapsible,
					collapsed: typeof treeElement.collapsed === 'undefined' ? (node ? (collapsible && node.collapsed) : undefined) : treeElement.collapsed,
					children: treeElement.children && preserveCollapseState(treeElement.children)
				};
			});
		};

		if (children && this.identityProvider) {
			children = preserveCollapseState(children);
		}

		const result = this.model.splice([...location, 0], Number.MAX_VALUE, children, _onDidCreateNode, _onDidDeleteNode);

		if (createdNodesByIdentity) {
			createdNodesByIdentity.forEach((node, identity) => this.nodesByIdentity!.set(identity, node));
		}

		return result;
	}

	getParentElement(ref: T | null = null): T | null {
		const location = this.getElementLocation(ref);
		return this.model.getParentElement(location);
	}

	getFirstElementChild(ref: T | null = null): T | null {
		const location = this.getElementLocation(ref);
		return this.model.getFirstElementChild(location);
	}

	getLastElementAncestor(ref: T | null = null): T | null {
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

	isCollapsed(element: T): boolean {
		const location = this.getElementLocation(element);
		return this.model.isCollapsed(location);
	}

	refilter(): void {
		this.model.refilter();
	}

	getNode(element: T | null = null): ITreeNode<T, TFilterData> {
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