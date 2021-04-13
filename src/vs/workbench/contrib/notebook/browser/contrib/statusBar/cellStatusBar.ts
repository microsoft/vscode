/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { flatten } from 'vs/base/common/arrays';
import { Throttler } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICellViewModel, INotebookEditor, INotebookEditorContribution } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { registerNotebookContribution } from 'vs/workbench/contrib/notebook/browser/notebookEditorExtensions';
import { NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { INotebookCellStatusBarService } from 'vs/workbench/contrib/notebook/common/notebookCellStatusBarService';
import { INotebookCellStatusBarItemList } from 'vs/workbench/contrib/notebook/common/notebookCommon';

export class NotebookStatusBarController extends Disposable implements INotebookEditorContribution {
	static id: string = 'workbench.notebook.statusBar';

	private readonly _visibleCells = new Map<number, CellStatusBarHelper>();

	constructor(
		private readonly _notebookEditor: INotebookEditor,
		@INotebookCellStatusBarService private readonly _notebookCellStatusBarService: INotebookCellStatusBarService
	) {
		super();
		this._updateVisibleCells();
		this._register(this._notebookEditor.onDidChangeVisibleRanges(this._updateVisibleCells, this));
		this._register(this._notebookEditor.onDidChangeModel(this._updateEverything, this));
		this._register(this._notebookCellStatusBarService.onDidChangeProviders(this._updateEverything, this));
		this._register(this._notebookCellStatusBarService.onDidChangeItems(this._updateEverything, this));
	}

	private _updateEverything(): void {
		this._visibleCells.forEach(cell => cell.dispose());
		this._visibleCells.clear();
		this._updateVisibleCells();
	}

	private _updateVisibleCells(): void {
		const vm = this._notebookEditor.viewModel;
		if (!vm) {
			return;
		}

		const newVisibleCells = new Set<number>();
		this._notebookEditor.visibleRanges.forEach(range => {
			const cells = this._notebookEditor.getCells({ start: range.start, end: range.end + 1 });
			cells.forEach(cell => {
				if (!this._visibleCells.has(cell.handle)) {
					const helper = new CellStatusBarHelper(vm, cell, this._notebookCellStatusBarService);
					this._visibleCells.set(cell.handle, helper);
				}
				newVisibleCells.add(cell.handle);
			});
		});

		for (let handle of this._visibleCells.keys()) {
			if (!newVisibleCells.has(handle)) {
				this._visibleCells.get(handle)?.dispose();
				this._visibleCells.delete(handle);
			}
		}
	}

	dispose(): void {
		this._visibleCells.forEach(cell => cell.dispose());
		this._visibleCells.clear();
	}
}

class CellStatusBarHelper extends Disposable {
	private _currentItemIds: string[] = [];
	private _currentItemLists: INotebookCellStatusBarItemList[] = [];

	private readonly _cancelTokenSource: CancellationTokenSource;

	private readonly _updateThrottler = new Throttler();

	constructor(
		private readonly _notebookViewModel: NotebookViewModel,
		private readonly _cell: ICellViewModel,
		private readonly _notebookCellStatusBarService: INotebookCellStatusBarService
	) {
		super();

		this._cancelTokenSource = this._register(new CancellationTokenSource());

		this._updateSoon();
		this._register(this._cell.model.onDidChangeContent(() => this._updateSoon()));
		this._register(this._cell.model.onDidChangeLanguage(() => this._updateSoon()));
		this._register(this._cell.model.onDidChangeMetadata(() => this._updateSoon()));
		this._register(this._cell.model.onDidChangeOutputs(() => this._updateSoon()));
	}

	private _updateSoon(): void {
		this._updateThrottler.queue(() => this._update());
	}

	private async _update() {
		const cellIndex = this._notebookViewModel.getCellIndex(this._cell);
		const docUri = this._notebookViewModel.notebookDocument.uri;
		const viewType = this._notebookViewModel.notebookDocument.viewType;
		const itemLists = await this._notebookCellStatusBarService.getStatusBarItemsForCell(docUri, cellIndex, viewType, this._cancelTokenSource.token);
		if (this._cancelTokenSource.token.isCancellationRequested) {
			itemLists.forEach(itemList => itemList.dispose && itemList.dispose());
			return;
		}

		const items = flatten(itemLists.map(itemList => itemList.items));
		const newIds = this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items }]);

		this._currentItemLists.forEach(itemList => itemList.dispose && itemList.dispose());
		this._currentItemLists = itemLists;
		this._currentItemIds = newIds;
	}

	dispose() {
		super.dispose();

		this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items: [] }]);
		this._currentItemLists.forEach(itemList => itemList.dispose && itemList.dispose());
	}
}

registerNotebookContribution(NotebookStatusBarController.id, NotebookStatusBarController);
