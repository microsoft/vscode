/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDiffResult, IDiffChange } from 'vs/base/common/diff/diff';
import { Emitter, type IValueWithChangeEvent } from 'vs/base/common/event';
import { Disposable, DisposableStore, dispose } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import type { URI } from 'vs/base/common/uri';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import type { ContextKeyValue } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { MultiDiffEditorItem } from 'vs/workbench/contrib/multiDiffEditor/browser/multiDiffSourceResolverService';
import { DiffElementCellViewModelBase, DiffElementPlaceholderViewModel, IDiffElementViewModelBase, SideBySideDiffElementViewModel, SingleSideDiffElementViewModel } from 'vs/workbench/contrib/notebook/browser/diff/diffElementViewModel';
import { NotebookDiffEditorEventDispatcher } from 'vs/workbench/contrib/notebook/browser/diff/eventDispatcher';
import { INotebookDiffViewModel, INotebookDiffViewModelUpdateEvent, NOTEBOOK_DIFF_ITEM_DIFF_STATE, NOTEBOOK_DIFF_ITEM_KIND } from 'vs/workbench/contrib/notebook/browser/diff/notebookDiffEditorBrowser';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellUri, INotebookDiffEditorModel, INotebookDiffResult } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { INotebookEditorWorkerService } from 'vs/workbench/contrib/notebook/common/services/notebookWorkerService';

export class NotebookDiffViewModel extends Disposable implements INotebookDiffViewModel, IValueWithChangeEvent<readonly MultiDiffEditorItem[]> {
	private readonly placeholderAndRelatedCells = new Map<DiffElementPlaceholderViewModel, DiffElementCellViewModelBase[]>();
	private readonly _items: IDiffElementViewModelBase[] = [];
	get items(): readonly IDiffElementViewModelBase[] {
		return this._items;
	}
	private readonly _onDidChangeItems = this._register(new Emitter<INotebookDiffViewModelUpdateEvent>());
	public readonly onDidChangeItems = this._onDidChangeItems.event;
	private readonly disposables = this._register(new DisposableStore());
	private _onDidChange = this._register(new Emitter<void>());
	private diffEditorItems: NotebookMultiDiffEditorItem[] = [];
	public onDidChange = this._onDidChange.event;
	get value(): readonly NotebookMultiDiffEditorItem[] {
		return this.diffEditorItems
			.filter(item => item.type !== 'placeholder')
			.filter(item => {
				if (this._includeUnchanged) {
					return true;
				}
				if (item instanceof NotebookMultiDiffEditorCellItem) {
					return item.type === 'unchanged' && item.containerType === 'unchanged' ? false : true;
				}
				if (item instanceof NotebookMultiDiffEditorMetadataItem) {
					return item.type === 'unchanged' && item.containerType === 'unchanged' ? false : true;
				}
				if (item instanceof NotebookMultiDiffEditorOutputItem) {
					return item.type === 'unchanged' && item.containerType === 'unchanged' ? false : true;
				}
				return true;
			})
			.filter(item => item instanceof NotebookMultiDiffEditorOutputItem ? !this.hideOutput : true)
			.filter(item => item instanceof NotebookMultiDiffEditorMetadataItem ? !this.hideCellMetadata : true);
	}

	private _hasUnchangedCells?: boolean;
	public get hasUnchangedCells() {
		return this._hasUnchangedCells === true;
	}
	private _includeUnchanged?: boolean;
	public get includeUnchanged() {
		return this._includeUnchanged === true;
	}
	public set includeUnchanged(value) {
		this._includeUnchanged = value;
		this._onDidChange.fire();
	}
	private hideOutput?: boolean;
	private hideCellMetadata?: boolean;

	private originalCellViewModels: DiffElementCellViewModelBase[] = [];
	constructor(private readonly model: INotebookDiffEditorModel,
		private readonly notebookEditorWorkerService: INotebookEditorWorkerService,
		private readonly instantiationService: IInstantiationService,
		private readonly configurationService: IConfigurationService,
		private readonly eventDispatcher: NotebookDiffEditorEventDispatcher,
		private readonly notebookService: INotebookService,
		private readonly fontInfo?: FontInfo,
		private readonly excludeUnchangedPlaceholder?: boolean,
	) {
		super();
		this.hideOutput = this.model.modified.notebook.transientOptions.transientOutputs || this.configurationService.getValue<boolean>('notebook.diff.ignoreOutputs');
		this.hideCellMetadata = this.configurationService.getValue('notebook.diff.ignoreMetadata');

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			let triggerChange = false;
			if (e.affectsConfiguration('notebook.diff.ignoreMetadata')) {
				const newValue = this.configurationService.getValue<boolean>('notebook.diff.ignoreMetadata');

				if (newValue !== undefined && this.hideCellMetadata !== newValue) {
					this.hideCellMetadata = newValue;
					triggerChange = true;
				}
			}

			if (e.affectsConfiguration('notebook.diff.ignoreOutputs')) {
				const newValue = this.configurationService.getValue<boolean>('notebook.diff.ignoreOutputs');

				if (newValue !== undefined && this.hideOutput !== (newValue || this.model.modified.notebook.transientOptions.transientOutputs)) {
					this.hideOutput = newValue || !!(this.model.modified.notebook.transientOptions.transientOutputs);
					triggerChange = true;
				}
			}
			if (triggerChange) {
				this._onDidChange.fire();
			}
		}));
	}
	override dispose() {
		this.clear();
		super.dispose();
	}
	private clear() {
		this.disposables.clear();
		dispose(Array.from(this.placeholderAndRelatedCells.keys()));
		this.placeholderAndRelatedCells.clear();
		dispose(this.originalCellViewModels);
		this.originalCellViewModels = [];
		dispose(this._items);
		this._items.splice(0, this._items.length);
	}

	async computeDiff(token: CancellationToken): Promise<{ firstChangeIndex: number } | undefined> {
		const diffResult = await this.notebookEditorWorkerService.computeDiff(this.model.original.resource, this.model.modified.resource);
		if (token.isCancellationRequested) {
			// after await the editor might be disposed.
			return;
		}

		prettyChanges(this.model, diffResult.cellsDiff);

		const { cellDiffInfo, firstChangeIndex } = computeDiff(this.model, diffResult);
		if (isEqual(cellDiffInfo, this.originalCellViewModels, this.model)) {
			return;
		} else {
			this.updateViewModels(cellDiffInfo);
			this.updateDiffEditorItems();
			return { firstChangeIndex };
		}
	}

	private updateDiffEditorItems() {
		this.diffEditorItems = [];
		const originalSourceUri = this.model.original.resource!;
		const modifiedSourceUri = this.model.modified.resource!;
		this._hasUnchangedCells = false;
		this.items.forEach(item => {
			switch (item.type) {
				case 'delete': {
					this.diffEditorItems.push(new NotebookMultiDiffEditorCellItem(item.original!.uri, undefined, item.type, item.type));
					const originalMetadata = CellUri.generateCellPropertyUri(originalSourceUri, item.original!.handle, Schemas.vscodeNotebookCellMetadata);
					this.diffEditorItems.push(new NotebookMultiDiffEditorMetadataItem(originalMetadata, undefined, item.type, item.type));
					const originalOutput = CellUri.generateCellPropertyUri(originalSourceUri, item.original!.handle, Schemas.vscodeNotebookCellOutput);
					this.diffEditorItems.push(new NotebookMultiDiffEditorOutputItem(originalOutput, undefined, item.type, item.type));
					break;
				}
				case 'insert': {
					this.diffEditorItems.push(new NotebookMultiDiffEditorCellItem(undefined, item.modified!.uri, item.type, item.type));
					const modifiedMetadata = CellUri.generateCellPropertyUri(modifiedSourceUri, item.modified!.handle, Schemas.vscodeNotebookCellMetadata);
					this.diffEditorItems.push(new NotebookMultiDiffEditorMetadataItem(undefined, modifiedMetadata, item.type, item.type));
					const modifiedOutput = CellUri.generateCellPropertyUri(modifiedSourceUri, item.modified!.handle, Schemas.vscodeNotebookCellOutput);
					this.diffEditorItems.push(new NotebookMultiDiffEditorOutputItem(undefined, modifiedOutput, item.type, item.type));
					break;
				}
				case 'modified': {
					const cellType = item.checkIfInputModified() ? item.type : 'unchanged';
					const containerChanged = (item.checkIfInputModified() || item.checkMetadataIfModified() || item.checkIfOutputsModified()) ? item.type : 'unchanged';
					this.diffEditorItems.push(new NotebookMultiDiffEditorCellItem(item.original!.uri, item.modified!.uri, cellType, containerChanged));
					const originalMetadata = CellUri.generateCellPropertyUri(originalSourceUri, item.original!.handle, Schemas.vscodeNotebookCellMetadata);
					const modifiedMetadata = CellUri.generateCellPropertyUri(modifiedSourceUri, item.modified!.handle, Schemas.vscodeNotebookCellMetadata);
					this.diffEditorItems.push(new NotebookMultiDiffEditorMetadataItem(originalMetadata, modifiedMetadata, item.checkMetadataIfModified() ? item.type : 'unchanged', containerChanged));
					const originalOutput = CellUri.generateCellPropertyUri(originalSourceUri, item.original!.handle, Schemas.vscodeNotebookCellOutput);
					const modifiedOutput = CellUri.generateCellPropertyUri(modifiedSourceUri, item.modified!.handle, Schemas.vscodeNotebookCellOutput);
					this.diffEditorItems.push(new NotebookMultiDiffEditorOutputItem(originalOutput, modifiedOutput, item.checkIfOutputsModified() ? item.type : 'unchanged', containerChanged));
					break;
				}
				case 'unchanged': {
					this._hasUnchangedCells = true;
					this.diffEditorItems.push(new NotebookMultiDiffEditorCellItem(item.original!.uri, item.modified!.uri, item.type, item.type));
					const originalMetadata = CellUri.generateCellPropertyUri(originalSourceUri, item.original!.handle, Schemas.vscodeNotebookCellMetadata);
					const modifiedMetadata = CellUri.generateCellPropertyUri(modifiedSourceUri, item.modified!.handle, Schemas.vscodeNotebookCellMetadata);
					this.diffEditorItems.push(new NotebookMultiDiffEditorMetadataItem(originalMetadata, modifiedMetadata, item.type, item.type));
					const originalOutput = CellUri.generateCellPropertyUri(originalSourceUri, item.original!.handle, Schemas.vscodeNotebookCellOutput);
					const modifiedOutput = CellUri.generateCellPropertyUri(modifiedSourceUri, item.modified!.handle, Schemas.vscodeNotebookCellOutput);
					this.diffEditorItems.push(new NotebookMultiDiffEditorOutputItem(originalOutput, modifiedOutput, item.type, item.type));
					break;
				}
			}
		});

		this._onDidChange.fire();
	}

	private updateViewModels(cellDiffInfo: CellDiffInfo[]) {
		const cellViewModels = createDiffViewModels(this.instantiationService, this.configurationService, this.model, this.eventDispatcher, cellDiffInfo, this.fontInfo, this.notebookService);
		const oldLength = this._items.length;
		this.clear();
		this._items.splice(0, oldLength);

		let placeholder: DiffElementPlaceholderViewModel | undefined = undefined;
		this.originalCellViewModels = cellViewModels;
		cellViewModels.forEach((vm, index) => {
			if (vm.type === 'unchanged' && !this.excludeUnchangedPlaceholder) {
				if (!placeholder) {
					vm.displayIconToHideUnmodifiedCells = true;
					placeholder = new DiffElementPlaceholderViewModel(vm.mainDocumentTextModel, vm.editorEventDispatcher, vm.initData);
					this._items.push(placeholder);
					const placeholderItem = placeholder;

					this.disposables.add(placeholderItem.onUnfoldHiddenCells(() => {
						const hiddenCellViewModels = this.placeholderAndRelatedCells.get(placeholderItem);
						if (!Array.isArray(hiddenCellViewModels)) {
							return;
						}
						const start = this._items.indexOf(placeholderItem);
						this._items.splice(start, 1, ...hiddenCellViewModels);
						this._onDidChangeItems.fire({ start, deleteCount: 1, elements: hiddenCellViewModels });
					}));
					this.disposables.add(vm.onHideUnchangedCells(() => {
						const hiddenCellViewModels = this.placeholderAndRelatedCells.get(placeholderItem);
						if (!Array.isArray(hiddenCellViewModels)) {
							return;
						}
						const start = this._items.indexOf(vm);
						this._items.splice(start, hiddenCellViewModels.length, placeholderItem);
						this._onDidChangeItems.fire({ start, deleteCount: hiddenCellViewModels.length, elements: [placeholderItem] });
					}));
				}
				const hiddenCellViewModels = this.placeholderAndRelatedCells.get(placeholder) || [];
				hiddenCellViewModels.push(vm);
				this.placeholderAndRelatedCells.set(placeholder, hiddenCellViewModels);
				placeholder.hiddenCells.push(vm);
			} else {
				placeholder = undefined;
				this._items.push(vm);
			}
		});

		this._onDidChangeItems.fire({ start: 0, deleteCount: oldLength, elements: this._items });
	}
}


/**
 * making sure that swapping cells are always translated to `insert+delete`.
 */
export function prettyChanges(model: INotebookDiffEditorModel, diffResult: IDiffResult) {
	const changes = diffResult.changes;
	for (let i = 0; i < diffResult.changes.length - 1; i++) {
		// then we know there is another change after current one
		const curr = changes[i];
		const next = changes[i + 1];
		const x = curr.originalStart;
		const y = curr.modifiedStart;

		if (
			curr.originalLength === 1
			&& curr.modifiedLength === 0
			&& next.originalStart === x + 2
			&& next.originalLength === 0
			&& next.modifiedStart === y + 1
			&& next.modifiedLength === 1
			&& model.original.notebook.cells[x].getHashValue() === model.modified.notebook.cells[y + 1].getHashValue()
			&& model.original.notebook.cells[x + 1].getHashValue() === model.modified.notebook.cells[y].getHashValue()
		) {
			// this is a swap
			curr.originalStart = x;
			curr.originalLength = 0;
			curr.modifiedStart = y;
			curr.modifiedLength = 1;

			next.originalStart = x + 1;
			next.originalLength = 1;
			next.modifiedStart = y + 2;
			next.modifiedLength = 0;

			i++;
		}
	}
}

type CellDiffInfo = {
	originalCellIndex: number;
	modifiedCellIndex: number;
	type: 'unchanged' | 'modified';
} |
{
	originalCellIndex: number;
	type: 'delete';
} |
{
	modifiedCellIndex: number;
	type: 'insert';
};
function computeDiff(model: INotebookDiffEditorModel, diffResult: INotebookDiffResult) {
	const cellChanges = diffResult.cellsDiff.changes;
	const cellDiffInfo: CellDiffInfo[] = [];
	const originalModel = model.original.notebook;
	const modifiedModel = model.modified.notebook;
	let originalCellIndex = 0;
	let modifiedCellIndex = 0;

	let firstChangeIndex = -1;

	for (let i = 0; i < cellChanges.length; i++) {
		const change = cellChanges[i];
		// common cells

		for (let j = 0; j < change.originalStart - originalCellIndex; j++) {
			const originalCell = originalModel.cells[originalCellIndex + j];
			const modifiedCell = modifiedModel.cells[modifiedCellIndex + j];
			if (originalCell.getHashValue() === modifiedCell.getHashValue()) {
				cellDiffInfo.push({
					originalCellIndex: originalCellIndex + j,
					modifiedCellIndex: modifiedCellIndex + j,
					type: 'unchanged'
				});
			} else {
				if (firstChangeIndex === -1) {
					firstChangeIndex = cellDiffInfo.length;
				}
				cellDiffInfo.push({
					originalCellIndex: originalCellIndex + j,
					modifiedCellIndex: modifiedCellIndex + j,
					type: 'modified'
				});
			}
		}

		const modifiedLCS = computeModifiedLCS(change, originalModel, modifiedModel);
		if (modifiedLCS.length && firstChangeIndex === -1) {
			firstChangeIndex = cellDiffInfo.length;
		}

		cellDiffInfo.push(...modifiedLCS);
		originalCellIndex = change.originalStart + change.originalLength;
		modifiedCellIndex = change.modifiedStart + change.modifiedLength;
	}

	for (let i = originalCellIndex; i < originalModel.cells.length; i++) {
		cellDiffInfo.push({
			originalCellIndex: i,
			modifiedCellIndex: i - originalCellIndex + modifiedCellIndex,
			type: 'unchanged'
		});
	}

	return {
		cellDiffInfo,
		firstChangeIndex
	};
}
function isEqual(cellDiffInfo: CellDiffInfo[], viewModels: DiffElementCellViewModelBase[], model: INotebookDiffEditorModel) {
	if (cellDiffInfo.length !== viewModels.length) {
		return false;
	}
	const originalModel = model.original.notebook;
	const modifiedModel = model.modified.notebook;
	for (let i = 0; i < viewModels.length; i++) {
		const a = cellDiffInfo[i];
		const b = viewModels[i];
		if (a.type !== b.type) {
			return false;
		}
		switch (a.type) {
			case 'delete': {
				if (originalModel.cells[a.originalCellIndex].handle !== b.original?.handle) {
					return false;
				}
				continue;
			}
			case 'insert': {
				if (modifiedModel.cells[a.modifiedCellIndex].handle !== b.modified?.handle) {
					return false;
				}
				continue;
			}
			default: {
				if (originalModel.cells[a.originalCellIndex].handle !== b.original?.handle) {
					return false;
				}
				if (modifiedModel.cells[a.modifiedCellIndex].handle !== b.modified?.handle) {
					return false;
				}
				continue;
			}
		}
	}

	return true;
}

function createDiffViewModels(instantiationService: IInstantiationService, configurationService: IConfigurationService, model: INotebookDiffEditorModel, eventDispatcher: NotebookDiffEditorEventDispatcher, computedCellDiffs: CellDiffInfo[], fontInfo: FontInfo | undefined, notebookService: INotebookService) {
	const originalModel = model.original.notebook;
	const modifiedModel = model.modified.notebook;
	const initData = {
		metadataStatusHeight: configurationService.getValue('notebook.diff.ignoreMetadata') ? 0 : 25,
		outputStatusHeight: configurationService.getValue<boolean>('notebook.diff.ignoreOutputs') || !!(modifiedModel.transientOptions.transientOutputs) ? 0 : 25,
		fontInfo
	};

	return computedCellDiffs.map(diff => {
		switch (diff.type) {
			case 'delete': {
				return new SingleSideDiffElementViewModel(
					originalModel,
					modifiedModel,
					originalModel.cells[diff.originalCellIndex],
					undefined,
					'delete',
					eventDispatcher,
					initData,
					notebookService
				);
			}
			case 'insert': {
				return new SingleSideDiffElementViewModel(
					modifiedModel,
					originalModel,
					undefined,
					modifiedModel.cells[diff.modifiedCellIndex],
					'insert',
					eventDispatcher,
					initData,
					notebookService
				);
			}
			case 'modified': {
				return new SideBySideDiffElementViewModel(
					model.modified.notebook,
					model.original.notebook,
					originalModel.cells[diff.originalCellIndex],
					modifiedModel.cells[diff.modifiedCellIndex],
					'modified',
					eventDispatcher,
					initData,
					notebookService
				);
			}
			case 'unchanged': {
				return new SideBySideDiffElementViewModel(
					model.modified.notebook,
					model.original.notebook,
					originalModel.cells[diff.originalCellIndex],
					modifiedModel.cells[diff.modifiedCellIndex],
					'unchanged', eventDispatcher,
					initData,
					notebookService
				);
			}
		}
	});
}

function computeModifiedLCS(change: IDiffChange, originalModel: NotebookTextModel, modifiedModel: NotebookTextModel) {
	const result: CellDiffInfo[] = [];
	// modified cells
	const modifiedLen = Math.min(change.originalLength, change.modifiedLength);

	for (let j = 0; j < modifiedLen; j++) {
		const isTheSame = originalModel.cells[change.originalStart + j].equal(modifiedModel.cells[change.modifiedStart + j]);
		result.push({
			originalCellIndex: change.originalStart + j,
			modifiedCellIndex: change.modifiedStart + j,
			type: isTheSame ? 'unchanged' : 'modified'
		});
	}

	for (let j = modifiedLen; j < change.originalLength; j++) {
		// deletion
		result.push({
			originalCellIndex: change.originalStart + j,
			type: 'delete'
		});
	}

	for (let j = modifiedLen; j < change.modifiedLength; j++) {
		result.push({
			modifiedCellIndex: change.modifiedStart + j,
			type: 'insert'
		});
	}

	return result;
}


export abstract class NotebookMultiDiffEditorItem extends MultiDiffEditorItem {
	constructor(
		originalUri: URI | undefined,
		modifiedUri: URI | undefined,
		goToFileUri: URI | undefined,
		public readonly type: IDiffElementViewModelBase['type'],
		public readonly containerType: IDiffElementViewModelBase['type'],
		public kind: 'Cell' | 'Metadata' | 'Output',
		contextKeys?: Record<string, ContextKeyValue>,
	) {
		super(originalUri, modifiedUri, goToFileUri, contextKeys);
	}
}

class NotebookMultiDiffEditorCellItem extends NotebookMultiDiffEditorItem {
	constructor(
		originalUri: URI | undefined,
		modifiedUri: URI | undefined,
		type: IDiffElementViewModelBase['type'],
		containerType: IDiffElementViewModelBase['type'],
	) {
		super(originalUri, modifiedUri, modifiedUri || originalUri, type, containerType, 'Cell', {
			[NOTEBOOK_DIFF_ITEM_KIND.key]: 'Cell',
			[NOTEBOOK_DIFF_ITEM_DIFF_STATE.key]: type
		});
	}
}

class NotebookMultiDiffEditorMetadataItem extends NotebookMultiDiffEditorItem {
	constructor(
		originalUri: URI | undefined,
		modifiedUri: URI | undefined,
		type: IDiffElementViewModelBase['type'],
		containerType: IDiffElementViewModelBase['type'],
	) {
		super(originalUri, modifiedUri, modifiedUri || originalUri, type, containerType, 'Metadata', {
			[NOTEBOOK_DIFF_ITEM_KIND.key]: 'Metadata',
			[NOTEBOOK_DIFF_ITEM_DIFF_STATE.key]: type
		});
	}
}

class NotebookMultiDiffEditorOutputItem extends NotebookMultiDiffEditorItem {
	constructor(
		originalUri: URI | undefined,
		modifiedUri: URI | undefined,
		type: IDiffElementViewModelBase['type'],
		containerType: IDiffElementViewModelBase['type'],
	) {
		super(originalUri, modifiedUri, modifiedUri || originalUri, type, containerType, 'Output', {
			[NOTEBOOK_DIFF_ITEM_KIND.key]: 'Output',
			[NOTEBOOK_DIFF_ITEM_DIFF_STATE.key]: type
		});
	}
}
