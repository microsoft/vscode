/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./tree';
import { TreeModel, ITreeNode, ITreeElement } from 'vs/base/browser/ui/tree/treeModel';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ISpliceable } from 'vs/base/common/sequence';
import { ISequence, getSequenceIterator, Iterator } from 'vs/base/common/iterator';

export interface IDataTreeElement<T> {
	element: T;
	collapsed?: boolean; // defaults to true
}

export enum DataTreeNodeState {
	Idle,
	Refreshing
}

export interface IDataTreeNode<T> {
	element: T;
	state: DataTreeNodeState;
}

export interface IDataTreeProvider<T> {
	hasChildren(element: T): boolean;
	getChildren(element: T): Promise<ISequence<IDataTreeElement<T>>>;
	getParent(element: T): Promise<T>;
}

export class DataTreeModel<T> {

	private model: TreeModel<IDataTreeNode<T>>;
	// private items = new Map<T, ITreeElement<T>>();
	private disposables: IDisposable[] = [];

	constructor(
		private dataSource: IDataTreeProvider<T>,
		list: ISpliceable<ITreeNode<IDataTreeNode<T>>>
	) {
		this.model = new TreeModel<IDataTreeNode<T>>(list);
	}

	setInput(root: T): Promise<void> {
		if (!this.dataSource.hasChildren(root)) {
			this.model.splice([0], Number.POSITIVE_INFINITY);
			return Promise.resolve();
		}

		this.model.splice([0], Number.POSITIVE_INFINITY);

		return this.dataSource.getChildren(root).then(children => {
			const nodes = Iterator.map<IDataTreeElement<T>, ITreeElement<IDataTreeNode<T>>>(
				getSequenceIterator(children),
				({ element, collapsed }) => ({
					element: {
						element,
						state: DataTreeNodeState.Idle
					},
					collapsed: typeof collapsed === 'boolean' ? collapsed : true
				})
			);

			this.model.splice([0], Number.POSITIVE_INFINITY, nodes);
		});
	}

	async refresh(element: T, recursive = false): Promise<void> {

	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		this.model.splice([0], Number.POSITIVE_INFINITY);
	}
}