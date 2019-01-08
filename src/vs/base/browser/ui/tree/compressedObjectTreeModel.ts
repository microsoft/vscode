/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISpliceable } from 'vs/base/common/sequence';
import { Iterator, ISequence } from 'vs/base/common/iterator';
import { Event } from 'vs/base/common/event';
import { ITreeModel, ITreeNode, ITreeElement, ICollapseStateChangeEvent } from 'vs/base/browser/ui/tree/tree';
import { IObjectTreeModelOptions, ObjectTreeModel } from 'vs/base/browser/ui/tree/objectTreeModel';
import { isUndefinedOrNull } from 'vs/base/common/types';

export interface ICompressedObjectTreeModelOptions<T, TFilterData> extends IObjectTreeModelOptions<T[], TFilterData> { }

export class CompressedObjectTreeModel<T extends NonNullable<any>, TFilterData extends NonNullable<any> = void> implements ITreeModel<T | null, TFilterData, T | null> {

	private model: ObjectTreeModel<T[], TFilterData>;
	private compressionMap: Map<T, T[]> = new Map<T, T[]>();

	get rootRef(): any {
		return this.model.rootRef;
	}

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
		const parentElements = this.model.getParentElement(this.compressionMap.get(ref));
		if (isUndefinedOrNull(parentElements)) {
			return parentElements;
		}

		return parentElements[parentElements.length - 1];
	}

	getFirstElementChild(ref: T | null = null): T | null | undefined {
		const childElements = this.model.getFirstElementChild(this.compressionMap.get(ref));
		if (isUndefinedOrNull(childElements)) {
			return childElements;
		}

		return childElements[childElements.length - 1];
	}

	getLastElementAncestor(ref: T | null = null): T | null | undefined {
		const ancestors = this.model.getLastElementAncestor(this.compressionMap.get(ref));
		if (isUndefinedOrNull(ancestors)) {
			return ancestors;
		}

		return ancestors[ancestors.length - 1];
	}

	getListIndex(element: T): number {
		return this.model.getListIndex(this.compressionMap.get(element));
	}

	isCollapsible(element: T): boolean {
		return this.model.isCollapsible(this.compressionMap.get(element));
	}

	isCollapsed(element: T): boolean {
		return this.model.isCollapsed(this.compressionMap.get(element));
	}

	setCollapsed(element: T, collapsed?: boolean, recursive?: boolean): boolean {
		return this.model.setCollapsed(this.compressionMap.get(element), collapsed, recursive);
	}

	getNode(element: T | null = null): ITreeNode<T | null, TFilterData> {
		throw new Error('not implemented');
	}

	getNodeLocation(node: ITreeNode<T, TFilterData>): T {
		throw new Error('not implemented');
	}

	getParentNodeLocation(element: T): T | null {
		const parentNodes = this.model.getParentNodeLocation(this.compressionMap.get(element));
		if (isUndefinedOrNull(parentNodes)) {
			return parentNodes;
		}

		return parentNodes[parentNodes.length - 1];
	}

	refilter(): void {
		this.model.refilter();
	}
}
