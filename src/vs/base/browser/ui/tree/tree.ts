/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { IListOptions, List } from 'vs/base/browser/ui/list/listWidget';
import { TreeModel, ITreeListElement, ITreeElement } from 'vs/base/browser/ui/tree/treeModel';
import { IIterator, empty } from 'vs/base/common/iterator';
import { IDelegate, IRenderer } from 'vs/base/browser/ui/list/list';

export interface ITreeOptions<T> extends IListOptions<T> { }

const DefaultOptions: ITreeOptions<any> = {
	keyboardSupport: true,
	mouseSupport: true,
	multipleSelectionSupport: true
};

export class Tree<T> implements IDisposable {

	private view: List<ITreeListElement<T>>;
	private model: TreeModel<T>;

	constructor(
		container: HTMLElement,
		delegate: IDelegate<T>,
		renderers: IRenderer<T, any>[],
		options: ITreeOptions<T> = DefaultOptions
	) {
		// TODO map provided args into these
		const listDelegate: IDelegate<ITreeListElement<T>> = undefined;
		const listRenderers: IRenderer<ITreeListElement<T>, any>[] = [];
		const listOptions: ITreeOptions<ITreeListElement<T>> = undefined;

		this.view = new List(container, listDelegate, listRenderers, listOptions);
		this.model = new TreeModel<T>(this.view);
	}

	splice(location: number[], deleteCount: number, toInsert: IIterator<ITreeElement<T>> = empty()): IIterator<ITreeElement<T>> {
		return this.model.splice(location, deleteCount, toInsert);
	}

	dispose(): void {
		this.view.dispose();
	}
}