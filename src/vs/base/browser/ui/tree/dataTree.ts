/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractTree, IAbstractTreeOptions } from 'vs/base/browser/ui/tree/abstractTree';
import { ISpliceable } from 'vs/base/common/sequence';
import { ITreeNode, ITreeModel, ITreeElement, ITreeRenderer, ITreeSorter, IDataSource } from 'vs/base/browser/ui/tree/tree';
import { ObjectTreeModel } from 'vs/base/browser/ui/tree/objectTreeModel';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { Iterator } from 'vs/base/common/iterator';

export interface IDataTreeOptions<T, TFilterData = void> extends IAbstractTreeOptions<T, TFilterData> {
	sorter?: ITreeSorter<T>;
}

export class DataTree<TInput, T, TFilterData = void> extends AbstractTree<T | null, TFilterData, TInput | T> {

	protected model: ObjectTreeModel<T | null, TFilterData>;

	private _input: TInput | undefined;

	get input(): TInput | undefined {
		return this._input;
	}

	set input(input: TInput | undefined) {
		this._input = input;
		this.refresh(input);
	}

	constructor(
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ITreeRenderer<any /* TODO@joao */, TFilterData, any>[],
		private dataSource: IDataSource<TInput, T>,
		options: IDataTreeOptions<T, TFilterData> = {}
	) {
		super(container, delegate, renderers, options);
	}

	refresh(element: TInput | T): void {
		if (!this._input) {
			throw new Error('Tree input not set');
		}

		this.model.setChildren((element === this.input ? null : element) as T, this.createIterator(element));
	}

	private createIterator(element: TInput | T): Iterator<ITreeElement<T>> {
		return Iterator.map(Iterator.fromArray(this.dataSource.getChildren(element)), element => ({
			element,
			children: this.createIterator(element)
		}));
	}

	protected createModel(view: ISpliceable<ITreeNode<T, TFilterData>>, options: IDataTreeOptions<T, TFilterData>): ITreeModel<T | null, TFilterData, T | null> {
		return new ObjectTreeModel(view, options);
	}
}