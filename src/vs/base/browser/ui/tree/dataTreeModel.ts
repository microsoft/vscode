/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./tree';
import { TreeModel, ITreeNode, ITreeElement } from 'vs/base/browser/ui/tree/treeModel';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ISpliceable } from 'vs/base/common/sequence';
import { ISequence, getSequenceIterator, Iterator } from 'vs/base/common/iterator';

export interface IDataProvider<T> {
	hasChildren(element: T): boolean;
	getChildren(element: T): Promise<ISequence<T>>;
	getParent(element: T): Promise<T>;
}

export class DataTree<T> {

	private model: TreeModel<T>;
	// private items = new Map<T, ITreeElement<T>>();
	private disposables: IDisposable[] = [];

	private _root: T;

	get root(): T {
		return this._root;
	}

	set root(root: T) {
		this._root = root;

		if (!this.dataSource.hasChildren(root)) {
			this.model.splice([0], Number.POSITIVE_INFINITY);
			return;
		}

		this.model.splice([0], Number.POSITIVE_INFINITY);
		this.dataSource.getChildren(root).then(children => {
			const childrenElements = Iterator.map<T, ITreeElement<T>>(getSequenceIterator(children), element => ({
				element,
				collapsed: true,
				children
			}));


			// this.model.splice([0], Number.POSITIVE_INFINITY, children);
		});
	}

	constructor(
		private dataSource: IDataProvider<T>,
		list: ISpliceable<ITreeNode<T>>,
		root: T
	) {
		this.model = new TreeModel<T>(list);
		this.root = root;
	}

	async refresh(element: T, recursive = false): Promise<void> {

	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		this.model.splice([0], Number.POSITIVE_INFINITY);
	}
}