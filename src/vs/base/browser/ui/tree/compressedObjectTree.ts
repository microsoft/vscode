/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterator, ISequence } from 'vs/base/common/iterator';
import { AbstractTree, IAbstractTreeOptions } from 'vs/base/browser/ui/tree/abstractTree';
import { ISpliceable } from 'vs/base/common/sequence';
import { ITreeNode, ITreeModel, ITreeElement, ITreeRenderer, ITreeSorter, ICollapseStateChangeEvent } from 'vs/base/browser/ui/tree/tree';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { Event } from 'vs/base/common/event';
import { ICompressedTreeNode, CompressedObjectTreeModel } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';

export interface ICompressedObjectTreeOptions<T, TFilterData = void> extends IAbstractTreeOptions<ICompressedTreeNode<T>, TFilterData> {
	sorter?: ITreeSorter<ICompressedTreeNode<T>>;
}

export class CompressedObjectTree<T extends NonNullable<any>, TFilterData = void> extends AbstractTree<ICompressedTreeNode<T> | null, TFilterData, T | null> {

	protected model: CompressedObjectTreeModel<T, TFilterData>;

	get onDidChangeCollapseState(): Event<ICollapseStateChangeEvent<ICompressedTreeNode<T>, TFilterData>> { return this.model.onDidChangeCollapseState; }

	constructor(
		container: HTMLElement,
		delegate: IListVirtualDelegate<ICompressedTreeNode<T>>,
		renderers: ITreeRenderer<any /* TODO@joao */, TFilterData, any>[],
		options: ICompressedObjectTreeOptions<T, TFilterData> = {}
	) {
		super(container, delegate, renderers, options);
	}

	setChildren(
		element: T | null,
		children?: ISequence<ITreeElement<T>>,
		onDidCreateNode?: (node: ITreeNode<ICompressedTreeNode<T>, TFilterData>) => void,
		onDidDeleteNode?: (node: ITreeNode<ICompressedTreeNode<T>, TFilterData>) => void
	): Iterator<ITreeElement<T | null>> {
		return this.model.setChildren(element, children, onDidCreateNode, onDidDeleteNode);
	}

	rerender(element?: T): void {
		if (element === undefined) {
			this.view.rerender();
			return;
		}

		this.model.rerender(element);
	}

	resort(element: T, recursive = true): void {
		this.model.resort(element, recursive);
	}

	protected createModel(view: ISpliceable<ITreeNode<ICompressedTreeNode<T>, TFilterData>>, options: ICompressedObjectTreeOptions<T, TFilterData>): ITreeModel<ICompressedTreeNode<T> | null, TFilterData, T | null> {
		return new CompressedObjectTreeModel(view, options);
	}
}
