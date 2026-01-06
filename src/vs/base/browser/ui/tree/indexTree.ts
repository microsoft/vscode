/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IListVirtualDelegate } from '../list/list.js';
import { AbstractTree, IAbstractTreeOptions } from './abstractTree.js';
import { IndexTreeModel } from './indexTreeModel.js';
import { ITreeElement, ITreeModel, ITreeRenderer, TreeError } from './tree.js';
import { Iterable } from '../../../common/iterator.js';
import './media/tree.css';

export interface IIndexTreeOptions<T, TFilterData = void> extends IAbstractTreeOptions<T, TFilterData> { }

export class IndexTree<T, TFilterData = void> extends AbstractTree<T, TFilterData, number[]> {

	protected declare model: IndexTreeModel<T, TFilterData>;

	constructor(
		private readonly user: string,
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ITreeRenderer<T, TFilterData, any>[],
		private rootElement: T,
		options: IIndexTreeOptions<T, TFilterData> = {}
	) {
		super(user, container, delegate, renderers, options);
	}

	splice(location: number[], deleteCount: number, toInsert: Iterable<ITreeElement<T>> = Iterable.empty()): void {
		this.model.splice(location, deleteCount, toInsert);
	}

	rerender(location?: number[]): void {
		if (location === undefined) {
			this.view.rerender();
			return;
		}

		this.model.rerender(location);
	}

	updateElementHeight(location: number[], height: number): void {
		if (location.length === 0) {
			throw new TreeError(this.user, `Update element height failed: invalid location`);
		}

		const elementIndex = this.model.getListIndex(location);
		if (elementIndex === -1) {
			return;
		}

		this.view.updateElementHeight(elementIndex, height);
	}

	protected createModel(user: string, options: IIndexTreeOptions<T, TFilterData>): ITreeModel<T, TFilterData, number[]> {
		return new IndexTreeModel(user, this.rootElement, options);
	}
}
