/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable, DisposableStore, dispose } from 'vs/base/common/lifecycle';
import { DiffElementCellViewModelBase, DiffElementPlaceholderViewModel, IDiffElementViewModelBase } from 'vs/workbench/contrib/notebook/browser/diff/diffElementViewModel';
import { INotebookDiffViewModel, INotebookDiffViewModelUpdateEvent } from 'vs/workbench/contrib/notebook/browser/diff/notebookDiffEditorBrowser';

export class NotebookDiffViewModel extends Disposable implements INotebookDiffViewModel {
	private readonly placeholderAndRelatedCells = new Map<DiffElementPlaceholderViewModel, DiffElementCellViewModelBase[]>();
	private readonly _items: IDiffElementViewModelBase[] = [];
	get items(): readonly IDiffElementViewModelBase[] {
		return this._items;
	}
	private readonly _onDidChangeItems = this._register(new Emitter<INotebookDiffViewModelUpdateEvent>());
	public readonly onDidChangeItems = this._onDidChangeItems.event;
	private readonly disposables = this._register(new DisposableStore());

	override dispose() {
		this.clear();
		super.dispose();
	}
	clear() {
		dispose(Array.from(this.placeholderAndRelatedCells.values()).flat());
		dispose(Array.from(this.placeholderAndRelatedCells.keys()));
		this.placeholderAndRelatedCells.clear();
		dispose(this._items);
		this._items.splice(0, this._items.length);
	}

	setViewModel(cellViewModels: DiffElementCellViewModelBase[]) {
		this.disposables.clear();
		const newViewModels: IDiffElementViewModelBase[] = [];
		let placeholder: DiffElementPlaceholderViewModel | undefined = undefined;
		cellViewModels.forEach((vm, index) => {
			if (vm.type === 'unchanged') {
				if (!placeholder) {
					vm.displayIconToHideUnmodifiedCells = true;
					placeholder = new DiffElementPlaceholderViewModel(vm.mainDocumentTextModel, vm.editorEventDispatcher, vm.initData);
					newViewModels.push(placeholder);
					const placeholderItem = placeholder;

					this.disposables.add(placeholderItem.onUnfoldHiddenCells(() => {
						const hiddenCellViewModels = this.placeholderAndRelatedCells.get(placeholderItem);
						if (!Array.isArray(hiddenCellViewModels)) {
							return;
						}
						newViewModels.splice(index, 1, ...hiddenCellViewModels);
						this._onDidChangeItems.fire({ start: index, deleteCount: 1, elements: hiddenCellViewModels });
					}));
					this.disposables.add(vm.onHideUnchangedCells(() => {
						const hiddenCellViewModels = this.placeholderAndRelatedCells.get(placeholderItem);
						if (!Array.isArray(hiddenCellViewModels)) {
							return;
						}
						newViewModels.splice(index, hiddenCellViewModels.length, placeholderItem);
						this._onDidChangeItems.fire({ start: index, deleteCount: hiddenCellViewModels.length, elements: [placeholderItem] });
					}));
				}
				const hiddenCellViewModels = this.placeholderAndRelatedCells.get(placeholder) || [];
				hiddenCellViewModels.push(vm);
				this.placeholderAndRelatedCells.set(placeholder, hiddenCellViewModels);
				placeholder.hiddenCells.push(vm);
			} else {
				placeholder = undefined;
				newViewModels.push(vm);
			}
		});

		const oldLength = this._items.length;
		this._items.splice(0, oldLength, ...newViewModels);
		this._onDidChangeItems.fire({ start: 0, deleteCount: oldLength, elements: newViewModels });
	}
}
