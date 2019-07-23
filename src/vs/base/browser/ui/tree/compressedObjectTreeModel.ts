/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISpliceable } from 'vs/base/common/sequence';
import { Iterator, ISequence } from 'vs/base/common/iterator';
import { Event } from 'vs/base/common/event';
import { ITreeModel, ITreeNode, ITreeElement, ICollapseStateChangeEvent, ITreeModelSpliceEvent } from 'vs/base/browser/ui/tree/tree';
import { IObjectTreeModelOptions, ObjectTreeModel, IObjectTreeModel } from 'vs/base/browser/ui/tree/objectTreeModel';

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

export interface ICompressedTreeModelOptions<T, TFilterData> extends IObjectTreeModelOptions<ICompressedTreeNode<T>, TFilterData> { }

export class CompressedTreeModel<T extends NonNullable<any>, TFilterData extends NonNullable<any> = void> implements ITreeModel<ICompressedTreeNode<T> | null, TFilterData, T | null> {

	readonly rootRef = null;

	get onDidSplice(): Event<ITreeModelSpliceEvent<ICompressedTreeNode<T> | null, TFilterData>> { return this.model.onDidSplice; }
	get onDidChangeCollapseState(): Event<ICollapseStateChangeEvent<ICompressedTreeNode<T>, TFilterData>> { return this.model.onDidChangeCollapseState; }
	get onDidChangeRenderNodeCount(): Event<ITreeNode<ICompressedTreeNode<T>, TFilterData>> { return this.model.onDidChangeRenderNodeCount; }

	private model: ObjectTreeModel<ICompressedTreeNode<T>, TFilterData>;
	private nodes = new Map<T | null, ICompressedTreeNode<T>>();

	get size(): number { return this.nodes.size; }

	constructor(list: ISpliceable<ITreeNode<ICompressedTreeNode<T>, TFilterData>>, options: ICompressedTreeModelOptions<T, TFilterData> = {}) {
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
		const compressedNode = this.getCompressedNode(location);
		return this.model.getFirstElementChild(compressedNode);
	}

	getLastElementAncestor(location?: T | null | undefined): ICompressedTreeNode<T> | null | undefined {
		const compressedNode = typeof location === 'undefined' ? undefined : this.getCompressedNode(location);
		return this.model.getLastElementAncestor(compressedNode);
	}

	isCollapsible(location: T | null): boolean {
		const compressedNode = this.getCompressedNode(location);
		return this.model.isCollapsible(compressedNode);
	}

	isCollapsed(location: T | null): boolean {
		const compressedNode = this.getCompressedNode(location);
		return this.model.isCollapsed(compressedNode);
	}

	setCollapsed(location: T | null, collapsed?: boolean | undefined, recursive?: boolean | undefined): boolean {
		const compressedNode = this.getCompressedNode(location);
		return this.model.setCollapsed(compressedNode, collapsed, recursive);
	}

	expandTo(location: T | null): void {
		const compressedNode = this.getCompressedNode(location);
		this.model.expandTo(compressedNode);
	}

	rerender(location: T | null): void {
		const compressedNode = this.getCompressedNode(location);
		this.model.rerender(compressedNode);
	}

	refilter(): void {
		this.model.refilter();
	}

	resort(location: T | null = null, recursive = true): void {
		const compressedNode = this.getCompressedNode(location);
		this.model.resort(compressedNode, recursive);
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

export type ElementMapper<T> = (elements: T[]) => T;
export const DefaultElementMapper: ElementMapper<any> = elements => elements[elements.length - 1];

export type NodeMapper<T, TFilterData> = (node: ITreeNode<ICompressedTreeNode<T> | null, TFilterData>) => ITreeNode<T | null, TFilterData>;

function mapNode<T, TFilterData>(elementMapper: ElementMapper<T>, node: ITreeNode<ICompressedTreeNode<T> | null, TFilterData>): ITreeNode<T | null, TFilterData> {
	return {
		...node,
		element: node.element === null ? null : elementMapper(node.element.elements),
		children: node.children.map(child => mapNode(elementMapper, child)),
		parent: typeof node.parent === 'undefined' ? node.parent : mapNode(elementMapper, node.parent)
	};
}

function createNodeMapper<T, TFilterData>(elementMapper: ElementMapper<T>): NodeMapper<T, TFilterData> {
	return node => mapNode(elementMapper, node);
}

export interface ICompressedObjectTreeModelOptions<T, TFilterData> extends ICompressedTreeModelOptions<T, TFilterData> {
	readonly elementMapper?: ElementMapper<T>;
}

export class CompressedObjectTreeModel<T extends NonNullable<any>, TFilterData extends NonNullable<any> = void> implements IObjectTreeModel<T, TFilterData> {

	readonly rootRef = null;

	get onDidSplice(): Event<ITreeModelSpliceEvent<T | null, TFilterData>> {
		return Event.map(this.model.onDidSplice, ({ insertedNodes, deletedNodes }) => ({
			insertedNodes: insertedNodes.map(this.mapNode),
			deletedNodes: deletedNodes.map(this.mapNode),
		}));
	}

	get onDidChangeCollapseState(): Event<ICollapseStateChangeEvent<T | null, TFilterData>> {
		return Event.map(this.model.onDidChangeCollapseState, ({ node, deep }) => ({
			node: this.mapNode(node),
			deep
		}));
	}

	get onDidChangeRenderNodeCount(): Event<ITreeNode<T | null, TFilterData>> {
		return Event.map(this.model.onDidChangeRenderNodeCount, this.mapNode);
	}

	private mapElement: ElementMapper<T | null>;
	private mapNode: NodeMapper<T | null, TFilterData>;
	private model: CompressedTreeModel<T, TFilterData>;

	constructor(
		list: ISpliceable<ITreeNode<ICompressedTreeNode<T>, TFilterData>>,
		options: ICompressedObjectTreeModelOptions<T, TFilterData> = {}
	) {
		this.mapElement = options.elementMapper || DefaultElementMapper;
		this.mapNode = createNodeMapper(this.mapElement);
		this.model = new CompressedTreeModel(list, options);
	}

	setChildren(
		element: T | null,
		children: ISequence<ITreeElement<T>> | undefined
	): Iterator<ITreeElement<T>> {
		this.model.setChildren(element, children);

		// TODO
		return Iterator.empty();
	}

	getListIndex(location: T | null): number {
		return this.model.getListIndex(location);
	}

	getListRenderCount(location: T | null): number {
		return this.model.getListRenderCount(location);
	}

	getNode(location?: T | null | undefined): ITreeNode<T | null, any> {
		return this.mapNode(this.model.getNode(location));
	}

	getNodeLocation(node: ITreeNode<T | null, any>): T | null {
		return node.element;
	}

	getParentNodeLocation(location: T | null): T | null {
		return this.model.getParentNodeLocation(location);
	}

	getParentElement(location: T | null): T | null {
		const result = this.model.getParentElement(location);

		if (result === null) {
			return result;
		}

		return this.mapElement(result.elements);
	}

	getFirstElementChild(location: T | null): T | null | undefined {
		const result = this.model.getFirstElementChild(location);

		if (result === null || typeof result === 'undefined') {
			return result;
		}

		return this.mapElement(result.elements);
	}

	getLastElementAncestor(location?: T | null | undefined): T | null | undefined {
		const result = this.model.getLastElementAncestor(location);

		if (result === null || typeof result === 'undefined') {
			return result;
		}

		return this.mapElement(result.elements);
	}

	isCollapsible(location: T | null): boolean {
		return this.model.isCollapsible(location);
	}

	isCollapsed(location: T | null): boolean {
		return this.model.isCollapsed(location);
	}

	setCollapsed(location: T | null, collapsed?: boolean | undefined, recursive?: boolean | undefined): boolean {
		return this.model.setCollapsed(location, collapsed, recursive);
	}

	expandTo(location: T | null): void {
		return this.model.expandTo(location);
	}

	rerender(location: T | null): void {
		return this.model.rerender(location);
	}

	refilter(): void {
		return this.model.refilter();
	}

	resort(element: T | null = null, recursive = true): void {
		return this.model.resort(element, recursive);
	}
}