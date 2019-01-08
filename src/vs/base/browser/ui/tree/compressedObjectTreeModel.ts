/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISpliceable } from 'vs/base/common/sequence';
import { Iterator, ISequence } from 'vs/base/common/iterator';
import { Event } from 'vs/base/common/event';
import { ITreeModel, ITreeNode, ITreeElement, ICollapseStateChangeEvent } from 'vs/base/browser/ui/tree/tree';
import { IObjectTreeModelOptions, ObjectTreeModel } from 'vs/base/browser/ui/tree/objectTreeModel';

export interface ICompressedObjectTreeModelOptions<T, TFilterData> extends IObjectTreeModelOptions<T[], TFilterData> { }

export class CompressedObjectTreeModel<T extends NonNullable<any>, TFilterData extends NonNullable<any> = void> implements ITreeModel<T | null, TFilterData, T | null> {

	readonly rootRef = null;

	private model: ObjectTreeModel<T[], TFilterData>;

	get onDidChangeCollapseState(): Event<ICollapseStateChangeEvent<T, TFilterData>> {
		throw new Error('not implemented');
	}

	get onDidChangeRenderNodeCount(): Event<ITreeNode<T, TFilterData>> {
		throw new Error('not implemented');
	}

	get size(): number {
		throw new Error('not implemented');
	}

	constructor(list: ISpliceable<ITreeNode<T[], TFilterData>>, options: ICompressedObjectTreeModelOptions<T, TFilterData> = {}) {
		this.model = new ObjectTreeModel(list, options);
	}

	setChildren(
		element: T | null,
		children: ISequence<ITreeElement<T>> | undefined,
		onDidCreateNode?: (node: ITreeNode<T, TFilterData>) => void,
		onDidDeleteNode?: (node: ITreeNode<T, TFilterData>) => void
	): Iterator<ITreeElement<T | null>> {
		throw new Error('not implemented');
	}

	getParentElement(ref: T | null = null): T | null {
		throw new Error('not implemented');
	}

	getFirstElementChild(ref: T | null = null): T | null | undefined {
		throw new Error('not implemented');
	}

	getLastElementAncestor(ref: T | null = null): T | null | undefined {
		throw new Error('not implemented');
	}

	getListIndex(element: T): number {
		throw new Error('not implemented');
	}

	isCollapsible(element: T): boolean {
		throw new Error('not implemented');
	}

	isCollapsed(element: T): boolean {
		throw new Error('not implemented');
	}

	setCollapsed(element: T, collapsed?: boolean, recursive?: boolean): boolean {
		throw new Error('not implemented');
	}

	getNode(element: T | null = null): ITreeNode<T | null, TFilterData> {
		throw new Error('not implemented');
	}

	getNodeLocation(node: ITreeNode<T, TFilterData>): T {
		throw new Error('not implemented');
	}

	getParentNodeLocation(element: T): T | null {
		throw new Error('not implemented');
	}

	refilter(): void {
		this.model.refilter();
	}
}
