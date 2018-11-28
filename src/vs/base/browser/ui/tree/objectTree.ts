/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterator, ISequence } from 'vs/base/common/iterator';
import { AbstractTree, ITreeOptions } from 'vs/base/browser/ui/tree/abstractTree';
import { ISpliceable } from 'vs/base/common/sequence';
import { ITreeNode, ITreeModel, ITreeElement } from 'vs/base/browser/ui/tree/tree';
import { ObjectTreeModel } from 'vs/base/browser/ui/tree/objectTreeModel';

export class ObjectTree<T extends NonNullable<any>, TFilterData = void> extends AbstractTree<T | null, TFilterData, T | null> {

	protected model: ObjectTreeModel<T, TFilterData>;

	setChildren(
		element: T | null,
		children?: ISequence<ITreeElement<T>>,
		onDidCreateNode?: (node: ITreeNode<T, TFilterData>) => void,
		onDidDeleteNode?: (node: ITreeNode<T, TFilterData>) => void
	): Iterator<ITreeElement<T>> {
		return this.model.setChildren(element, children, onDidCreateNode, onDidDeleteNode);
	}

	protected createModel(view: ISpliceable<ITreeNode<T, TFilterData>>, options: ITreeOptions<T, TFilterData>): ITreeModel<T, TFilterData, T> {
		return new ObjectTreeModel(view, options);
	}
}