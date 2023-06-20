/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, Throttler } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { NotebookVisibleCellObserver } from 'vs/workbench/contrib/notebook/browser/contrib/cellStatusBar/notebookVisibleCellObserver';
import { ICellViewModel, INotebookEditor, INotebookEditorContribution, INotebookViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { registerNotebookContribution } from 'vs/workbench/contrib/notebook/browser/notebookEditorExtensions';
import { INotebookCellStatusBarService } from 'vs/workbench/contrib/notebook/common/notebookCellStatusBarService';
import { INotebookCellStatusBarItemList } from 'vs/workbench/contrib/notebook/common/notebookCommon';

export class ContributedStatusBarItemController extends Disposable implements INotebookEditorContribution {
	static id: string = 'workbench.notebook.statusBar.contributed';

	private readonly _visibleCells = new Map<number, CellStatusBarHelper>();

	private readonly _observer: NotebookVisibleCellObserver;

	constructor(
		private readonly _notebookEditor: INotebookEditor,
		@INotebookCellStatusBarService private readonly _notebookCellStatusBarService: INotebookCellStatusBarService
	) {
		super();
		this._observer = this._register(new NotebookVisibleCellObserver(this._notebookEditor));
		this._register(this._observer.onDidChangeVisibleCells(this._updateVisibleCells, this));

		this._updateEverything();
		this._register(this._notebookCellStatusBarService.onDidChangeProviders(this._updateEverything, this));
		this._register(this._notebookCellStatusBarService.onDidChangeItems(this._updateEverything, this));
	}

	private _updateEverything(): void {
		const newCells = this._observer.visibleCells.filter(cell => !this._visibleCells.has(cell.handle));
		const visibleCellHandles = new Set(this._observer.visibleCells.map(item => item.handle));
		const currentCellHandles = Array.from(this._visibleCells.keys());
		const removedCells = currentCellHandles.filter(handle => !visibleCellHandles.has(handle));
		const itemsToUpdate = currentCellHandles.filter(handle => visibleCellHandles.has(handle));

		this._updateVisibleCells({ added: newCells, removed: removedCells.map(handle => ({ handle })) });
		itemsToUpdate.forEach(handle => this._visibleCells.get(handle)?.update());
	}

	private _updateVisibleCells(e: {
		added: ICellViewModel[];
		removed: { handle: number }[];
	}): void {
		const vm = this._notebookEditor._getViewModel();
		if (!vm) {
			return;
		}

		for (const newCell of e.added) {
			const helper = new CellStatusBarHelper(vm, newCell, this._notebookCellStatusBarService);
			this._visibleCells.set(newCell.handle, helper);
		}

		for (const oldCell of e.removed) {
			this._visibleCells.get(oldCell.handle)?.dispose();
			this._visibleCells.delete(oldCell.handle);
		}
	}

	override dispose(): void {
		super.dispose();

		this._visibleCells.forEach(cell => cell.dispose());
		this._visibleCells.clear();
	}
}

class CellStatusBarHelper extends Disposable {
	private _currentItemIds: string[] = [];
	private _currentItemLists: INotebookCellStatusBarItemList[] = [];

	private _activeToken: CancellationTokenSource | undefined;

	private readonly _updateThrottler = this._register(new Throttler());

	constructor(
		private readonly _notebookViewModel: INotebookViewModel,
		private readonly _cell: ICellViewModel,
		private readonly _notebookCellStatusBarService: INotebookCellStatusBarService
	) {
		super();

		this._register(toDisposable(() => this._activeToken?.dispose(true)));
		this._updateSoon();
		this._register(this._cell.model.onDidChangeContent(() => this._updateSoon()));
		this._register(this._cell.model.onDidChangeLanguage(() => this._updateSoon()));
		this._register(this._cell.model.onDidChangeMetadata(() => this._updateSoon()));
		this._register(this._cell.model.onDidChangeInternalMetadata(() => this._updateSoon()));
		this._register(this._cell.model.onDidChangeOutputs(() => this._updateSoon()));
	}

	public update(): void {
		this._updateSoon();
	}
	private _updateSoon(): void {
		// Wait a tick to make sure that the event is fired to the EH before triggering status bar providers
		this._register(disposableTimeout(() => {
			this._updateThrottler.queue(() => this._update());
		}, 0));
	}

	private async _update() {
		const cellIndex = this._notebookViewModel.getCellIndex(this._cell);
		const docUri = this._notebookViewModel.notebookDocument.uri;
		const viewType = this._notebookViewModel.notebookDocument.viewType;

		this._activeToken?.dispose(true);
		const tokenSource = this._activeToken = new CancellationTokenSource();
		const itemLists = await this._notebookCellStatusBarService.getStatusBarItemsForCell(docUri, cellIndex, viewType, tokenSource.token);
		if (tokenSource.token.isCancellationRequested) {
			itemLists.forEach(itemList => itemList.dispose && itemList.dispose());
			return;
		}

		const items = itemLists.map(itemList => itemList.items).flat();
		const newIds = this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items }]);

		this._currentItemLists.forEach(itemList => itemList.dispose && itemList.dispose());
		this._currentItemLists = itemLists;
		this._currentItemIds = newIds;
	}

	override dispose() {
		super.dispose();
		this._activeToken?.dispose(true);

		this._notebookViewModel.deltaCellStatusBarItems(this._currentItemIds, [{ handle: this._cell.handle, items: [] }]);
		this._currentItemLists.forEach(itemList => itemList.dispose && itemList.dispose());
	}
}

registerNotebookContribution(ContributedStatusBarItemController.id, ContributedStatusBarItemController);
