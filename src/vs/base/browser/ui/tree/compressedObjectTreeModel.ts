/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISpliceable } from 'vs/base/common/sequence';
import { Iterator, ISequence } from 'vs/base/common/iterator';
import { Event, Emitter } from 'vs/base/common/event';
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

export interface ICompressedObjectTreeModelOptions<T, TFilterData> extends IObjectTreeModelOptions<T[], TFilterData> { }

export class CompressedObjectTreeModel<T extends NonNullable<any>, TFilterData extends NonNullable<any> = void> implements ITreeModel<T | null, TFilterData, T | null> {

	readonly rootRef = null;

	private _onDidSplice = new Emitter<ITreeModelSpliceEvent<T | null, TFilterData>>();
	readonly onDidSplice: Event<ITreeModelSpliceEvent<T | null, TFilterData>> = this._onDidSplice.event;

	private _onDidChangeCollapseState = new Emitter<ICollapseStateChangeEvent<T, TFilterData>>();
	readonly onDidChangeCollapseState: Event<ICollapseStateChangeEvent<T, TFilterData>> = this._onDidChangeCollapseState.event;

	private _onDidChangeRenderNodeCount = new Emitter<ITreeNode<T, TFilterData>>();
	readonly onDidChangeRenderNodeCount: Event<ITreeNode<T, TFilterData>> = this._onDidChangeRenderNodeCount.event;

	private model: ObjectTreeModel<T[], TFilterData>;
	private map = new Map<T, T[]>();

	constructor(list: ISpliceable<ITreeNode<T[], TFilterData>>, options: ICompressedObjectTreeModelOptions<T, TFilterData> = {}) {
		this.model = new ObjectTreeModel(list, options);
	}

	setChildren(
		element: T | null,
		children: ISequence<ITreeElement<T>> | undefined
	): Iterator<ITreeElement<T | null>> {
		if (element !== null && !this.map.has(element)) {
			throw new Error('missing element');
		}

		const compressedElement = element === null ? null : this.map.get(element)!;
		const compressedChildren = this.compress(Iterator.from(children));
		const deleted = this.model.setChildren(compressedElement, compressedChildren);
		return this.decompress(deleted);
	}

	private compress(iterator: Iterator<ITreeElement<T>>): Iterator<ITreeElement<T[]>> {
		throw new Error('todo');
	}

	private decompress(sequence: Iterator<ITreeElement<T[]>>): Iterator<ITreeElement<T>> {
		throw new Error('todo');
	}

	getListIndex(location: T | null): number {
		throw new Error('Method not implemented.');
	}

	getListRenderCount(location: T | null): number {
		throw new Error('Method not implemented.');
	}

	getNode(location?: T | null | undefined): ITreeNode<T | null, any> {
		throw new Error('Method not implemented.');
	}

	getNodeLocation(node: ITreeNode<T | null, any>): T | null {
		throw new Error('Method not implemented.');
	}

	getParentNodeLocation(location: T | null): T | null {
		throw new Error('Method not implemented.');
	}

	getParentElement(location: T | null): T | null {
		throw new Error('Method not implemented.');
	}

	getFirstElementChild(location: T | null): T | null | undefined {
		throw new Error('Method not implemented.');
	}

	getLastElementAncestor(location?: T | null | undefined): T | null | undefined {
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
}
