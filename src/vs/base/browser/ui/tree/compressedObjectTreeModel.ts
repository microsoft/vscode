/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISpliceable } from 'vs/base/common/sequence';
import { Iterator, ISequence } from 'vs/base/common/iterator';
import { Event } from 'vs/base/common/event';
import { ITreeModel, ITreeNode, ITreeElement, ICollapseStateChangeEvent, ITreeModelSpliceEvent } from 'vs/base/browser/ui/tree/tree';
import { IObjectTreeModelOptions, ObjectTreeModel } from 'vs/base/browser/ui/tree/objectTreeModel';

export interface ICompressedTreeElement<T> extends ITreeElement<T> {
	readonly children?: Iterator<ICompressedTreeElement<T>> | ICompressedTreeElement<T>[];
	readonly incompressible?: boolean;
}

export interface ICompressedTreeNode<T> {
	readonly elements: T[];
	readonly incompressible: boolean;
}

export function compress<T>(element: ICompressedTreeElement<T>): ITreeElement<ICompressedTreeNode<T>> {
	const elements = [element.element];
	const incompressible = element.incompressible || false;

	let childrenIterator: Iterator<ITreeElement<T>>;
	let children: ITreeElement<T>[];

	while (true) {
		childrenIterator = Iterator.from(element.children);
		children = Iterator.collect(childrenIterator, 2);

		if (children.length !== 1) {
			break;
		}

		element = children[0];

		if (element.incompressible) {
			break;
		}

		elements.push(element.element);
	}

	return {
		element: { elements, incompressible },
		children: Iterator.map(Iterator.concat(Iterator.fromArray(children), childrenIterator), compress)
	};
}

export function _decompress<T>(element: ITreeElement<ICompressedTreeNode<T>>, index = 0): ICompressedTreeElement<T> {
	let children: Iterator<ICompressedTreeElement<T>>;

	if (index < element.element.elements.length - 1) {
		children = Iterator.single(_decompress(element, index + 1));
	} else {
		children = Iterator.map(Iterator.from(element.children), el => _decompress(el, 0));
	}

	if (index === 0 && element.element.incompressible) {
		return { element: element.element.elements[index], children, incompressible: true };
	}

	return { element: element.element.elements[index], children };
}

export function decompress<T>(element: ITreeElement<ICompressedTreeNode<T>>): ICompressedTreeElement<T> {
	return _decompress(element, 0);
}

export function splice<T>(treeElement: ICompressedTreeElement<T>, element: T, children: Iterator<ICompressedTreeElement<T>>): ICompressedTreeElement<T> {
	if (treeElement.element === element) {
		return { element, children };
	}

	return {
		...treeElement,
		children: Iterator.map(Iterator.from(treeElement.children), e => splice(e, element, children))
	};
}

export interface ICompressedObjectTreeModelOptions<T, TFilterData> extends IObjectTreeModelOptions<ICompressedTreeNode<T>, TFilterData> { }

export class CompressedObjectTreeModel<T extends NonNullable<any>, TFilterData extends NonNullable<any> = void> implements ITreeModel<ICompressedTreeNode<T> | null, TFilterData, T | null> {

	readonly rootRef = null;

	get onDidSplice(): Event<ITreeModelSpliceEvent<ICompressedTreeNode<T> | null, TFilterData>> { return this.model.onDidSplice; }
	get onDidChangeCollapseState(): Event<ICollapseStateChangeEvent<ICompressedTreeNode<T>, TFilterData>> { return this.model.onDidChangeCollapseState; }
	get onDidChangeRenderNodeCount(): Event<ITreeNode<ICompressedTreeNode<T>, TFilterData>> { return this.model.onDidChangeRenderNodeCount; }

	private model: ObjectTreeModel<ICompressedTreeNode<T>, TFilterData>;
	private nodes = new Map<T | null, ICompressedTreeNode<T>>();

	get size(): number { return this.nodes.size; }

	constructor(list: ISpliceable<ITreeNode<ICompressedTreeNode<T>, TFilterData>>, options: ICompressedObjectTreeModelOptions<T, TFilterData> = {}) {
		this.model = new ObjectTreeModel(list, options);
	}

	setChildren(
		element: T | null,
		children: ISequence<ICompressedTreeElement<T>> | undefined,
		onDidCreateNode?: (node: ITreeNode<ICompressedTreeNode<T>, TFilterData>) => void,
		onDidDeleteNode?: (node: ITreeNode<ICompressedTreeNode<T>, TFilterData>) => void
	): Iterator<ITreeElement<T | null>> {
		const insertedElements = new Set<T | null>();
		const _onDidCreateNode = (node: ITreeNode<ICompressedTreeNode<T>, TFilterData>) => {
			for (const element of node.element.elements) {
				insertedElements.add(element);
				this.nodes.set(element, node.element);
			}

			// if (this.identityProvider) {
			// 	const id = this.identityProvider.getId(node.element).toString();
			// 	insertedElementIds.add(id);
			// 	this.nodesByIdentity.set(id, node);
			// }

			if (onDidCreateNode) {
				onDidCreateNode(node);
			}
		};

		const _onDidDeleteNode = (node: ITreeNode<ICompressedTreeNode<T>, TFilterData>) => {
			for (const element of node.element.elements) {
				if (!insertedElements.has(element)) {
					this.nodes.delete(element);
				}
			}

			// if (this.identityProvider) {
			// 	const id = this.identityProvider.getId(node.element).toString();
			// 	if (!insertedElementIds.has(id)) {
			// 		this.nodesByIdentity.delete(id);
			// 	}
			// }

			if (onDidDeleteNode) {
				onDidDeleteNode(node);
			}
		};

		if (element === null) {
			const compressedChildren = Iterator.map(Iterator.from(children), compress);
			const result = this.model.setChildren(null, compressedChildren, _onDidCreateNode, _onDidDeleteNode);
			return Iterator.map(result, decompress);
		}

		const compressedNode = this.nodes.get(element);
		const node = this.model.getNode(compressedNode) as ITreeNode<ICompressedTreeNode<T>, TFilterData>;
		const parent = node.parent!;

		const decompressedElement = decompress(node);
		const splicedElement = splice(decompressedElement, element, Iterator.from(children));
		const recompressedElement = compress(splicedElement);

		const parentChildren = parent.children
			.map(child => child === node ? recompressedElement : child);

		this.model.setChildren(parent.element, parentChildren, _onDidCreateNode, _onDidDeleteNode);

		// TODO
		return Iterator.empty();
	}

	getListIndex(location: T | null): number {
		const node = this.getCompressedNode(location);
		return this.model.getListIndex(node);
	}

	getListRenderCount(location: T | null): number {
		const node = this.getCompressedNode(location);
		return this.model.getListRenderCount(node);
	}

	getNode(location?: T | null | undefined): ITreeNode<ICompressedTreeNode<T> | null, TFilterData> {
		if (typeof location === 'undefined') {
			return this.model.getNode();
		}

		const node = this.getCompressedNode(location);
		return this.model.getNode(node);
	}

	// TODO: review this
	getNodeLocation(node: ITreeNode<ICompressedTreeNode<T>, TFilterData>): T | null {
		const compressedNode = this.model.getNodeLocation(node);

		if (compressedNode === null) {
			return null;
		}

		return compressedNode.elements[compressedNode.elements.length - 1];
	}

	// TODO: review this
	getParentNodeLocation(location: T | null): T | null {
		const compressedNode = this.getCompressedNode(location);
		const parentNode = this.model.getParentNodeLocation(compressedNode);

		if (parentNode === null) {
			return null;
		}

		return parentNode.elements[parentNode.elements.length - 1];
	}

	getParentElement(location: T | null): ICompressedTreeNode<T> | null {
		const compressedNode = this.getCompressedNode(location);
		return this.model.getParentElement(compressedNode);
	}

	getFirstElementChild(location: T | null): ICompressedTreeNode<T> | null | undefined {
		throw new Error('Method not implemented.');
	}

	getLastElementAncestor(location?: T | null | undefined): ICompressedTreeNode<T> | null | undefined {
		throw new Error('Method not implemented.');
	}

	isCollapsible(location: T | null): boolean {
		throw new Error('Method not implemented.');
	}

	isCollapsed(location: T | null): boolean {
		throw new Error('Method not implemented.');
	}

	setCollapsed(location: T | null, collapsed?: boolean | undefined, recursive?: boolean | undefined): boolean {
		throw new Error('Method not implemented.');
	}

	expandTo(location: T | null): void {
		throw new Error('Method not implemented.');
	}

	refilter(): void {
		this.model.refilter();
	}

	private getCompressedNode(element: T | null): ICompressedTreeNode<T> | null {
		if (element === null) {
			return null;
		}

		const node = this.nodes.get(element);

		if (!node) {
			throw new Error(`Tree element not found: ${element}`);
		}

		return node;
	}
}
