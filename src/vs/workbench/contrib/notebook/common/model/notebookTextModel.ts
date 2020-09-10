/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { INotebookTextModel, NotebookCellOutputsSplice, NotebookDocumentMetadata, NotebookCellMetadata, ICellEditOperation, CellEditType, CellUri, CellKind, IProcessedOutput, notebookDocumentMetadataDefaults, diff, NotebookCellsChangeType, ICellDto2, TransientOptions, NotebookTextModelChangedEvent } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ITextSnapshot } from 'vs/editor/common/model';
import { IUndoRedoService, UndoRedoElementType, IUndoRedoElement, IResourceUndoRedoElement } from 'vs/platform/undoRedo/common/undoRedo';
import { InsertCellEdit, DeleteCellEdit, MoveCellEdit, SpliceCellsEdit, CellMetadataEdit } from 'vs/workbench/contrib/notebook/common/model/cellEdit';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IModeService } from 'vs/editor/common/services/modeService';

export class NotebookTextModelSnapshot implements ITextSnapshot {

	private _index: number = -1;

	constructor(private _model: NotebookTextModel) { }

	read(): string | null {

		if (this._index === -1) {
			this._index++;
			return `{ "metadata": ${JSON.stringify(this._model.metadata)}, "languages": ${JSON.stringify(this._model.languages)}, "cells": [`;
		}

		if (this._index < this._model.cells.length) {
			const cell = this._model.cells[this._index];

			const data = {
				source: cell.getValue(),
				metadata: cell.metadata,
				cellKind: cell.cellKind,
				language: cell.language,
				outputs: cell.outputs
			};

			const rawStr = JSON.stringify(data);
			const isLastCell = this._index === this._model.cells.length - 1;

			this._index++;
			return isLastCell ? rawStr : (rawStr + ',');
		} else if (this._index === this._model.cells.length) {
			this._index++;
			return `]}`;
		} else {
			return null;
		}
	}

}

class StackOperation implements IResourceUndoRedoElement {
	type: UndoRedoElementType.Resource;

	private _operations: IUndoRedoElement[] = [];

	constructor(readonly resource: URI, readonly label: string) {
		this.type = UndoRedoElementType.Resource;
	}

	pushEditOperation(element: IUndoRedoElement) {
		this._operations.push(element);
	}

	undo(): void {
		this._operations.reverse().forEach(o => o.undo());
	}
	redo(): void | Promise<void> {
		this._operations.forEach(o => o.redo());
	}
}

export class NotebookOperationManager {
	private _pendingStackOperation: StackOperation | null = null;
	constructor(private _undoService: IUndoRedoService, private _resource: URI) {

	}

	pushStackElement(label: string) {
		if (this._pendingStackOperation) {
			this._undoService.pushElement(this._pendingStackOperation);
			this._pendingStackOperation = null;
			return;
		}

		this._pendingStackOperation = new StackOperation(this._resource, label);
	}

	pushEditOperation(element: IUndoRedoElement) {
		if (this._pendingStackOperation) {
			this._pendingStackOperation.pushEditOperation(element);
			return;
		}

		this._undoService.pushElement(element);
	}
}

class DelayedEmitter {
	constructor(
		private readonly _onDidChangeContent: Emitter<NotebookTextModelChangedEvent>,
		private readonly _increaseVersion: () => void,
		private readonly _textModel: NotebookTextModel

	) {

	}

	emit(data: NotebookTextModelChangedEvent) {
		this._increaseVersion();
		this._onDidChangeContent.fire(
			{
				...data,
				versionId: this._textModel.versionId
			}
		);
	}
}

export class NotebookTextModel extends Disposable implements INotebookTextModel {

	private readonly _onWillDispose: Emitter<void> = this._register(new Emitter<void>());
	private readonly _onDidChangeContent = this._register(new Emitter<NotebookTextModelChangedEvent>());
	readonly onWillDispose: Event<void> = this._onWillDispose.event;
	readonly onDidChangeContent = this._onDidChangeContent.event;
	private _cellhandlePool: number = 0;
	private _mapping: Map<number, NotebookCellTextModel> = new Map();
	private _cellListeners: Map<number, IDisposable> = new Map();
	private _cells: NotebookCellTextModel[] = [];
	private _languages: string[] = [];
	private _allLanguages: boolean = false;

	get languages() {
		return this._languages;
	}

	get resolvedLanguages() {
		if (this._allLanguages) {
			return this._modeService.getRegisteredModes();
		}

		return this._languages;
	}

	metadata: NotebookDocumentMetadata = notebookDocumentMetadataDefaults;
	transientOptions: TransientOptions = { transientMetadata: {}, transientOutputs: false };
	private _versionId = 0;
	private _operationManager: NotebookOperationManager;
	private _eventEmitter: DelayedEmitter;

	get cells(): readonly NotebookCellTextModel[] {
		return this._cells;
	}

	get versionId() {
		return this._versionId;
	}

	constructor(
		readonly viewType: string,
		readonly supportBackup: boolean,
		readonly uri: URI,
		cells: ICellDto2[],
		languages: string[],
		metadata: NotebookDocumentMetadata,
		options: TransientOptions,
		@IUndoRedoService private _undoService: IUndoRedoService,
		@ITextModelService private _modelService: ITextModelService,
		@IModeService private readonly _modeService: IModeService,
	) {
		super();
		this.transientOptions = options;
		this.metadata = metadata;
		this.updateLanguages(languages);
		this._initialize(cells);

		this._operationManager = new NotebookOperationManager(this._undoService, uri);
		this._eventEmitter = new DelayedEmitter(
			this._onDidChangeContent,
			() => { this._increaseVersionId(); },
			this
		);
	}

	private _initialize(cells: ICellDto2[]) {
		this._cells = [];
		this._versionId = 0;

		const mainCells = cells.map(cell => {
			const cellHandle = this._cellhandlePool++;
			const cellUri = CellUri.generate(this.uri, cellHandle);
			return new NotebookCellTextModel(cellUri, cellHandle, cell.source, cell.language, cell.cellKind, cell.outputs || [], cell.metadata, this.transientOptions, this._modelService);
		});

		for (let i = 0; i < mainCells.length; i++) {
			this._mapping.set(mainCells[i].handle, mainCells[i]);
			const dirtyStateListener = mainCells[i].onDidChangeContent(() => {
				this._eventEmitter.emit({ kind: NotebookCellsChangeType.ChangeCellContent, versionId: this.versionId, synchronous: true, transient: false });
			});

			this._cellListeners.set(mainCells[i].handle, dirtyStateListener);
		}

		this._cells.splice(0, 0, ...mainCells);
		this._increaseVersionId();
	}

	dispose() {
		this._onWillDispose.fire();
		dispose(this._cellListeners.values());
		dispose(this._cells);
		super.dispose();
	}

	createCellTextModel(
		source: string,
		language: string,
		cellKind: CellKind,
		outputs: IProcessedOutput[],
		metadata: NotebookCellMetadata | undefined
	) {
		const cellHandle = this._cellhandlePool++;
		const cellUri = CellUri.generate(this.uri, cellHandle);
		return new NotebookCellTextModel(cellUri, cellHandle, source, language, cellKind, outputs || [], metadata || {}, this.transientOptions, this._modelService);
	}

	pushStackElement(label: string) {
		this._operationManager.pushStackElement(label);
	}

	pushEditOperations(modelVersionId: number, rawEdits: ICellEditOperation[], synchronous: boolean) {
		// this._eventEmitter.beginDeferredEmit();
		this.pushStackElement('edit');
		// every edit should push a pending element into `edit` undo stack element.
		this.applyEdit(modelVersionId, rawEdits, synchronous);
		this.pushStackElement('edit');
		// this._eventEmitter.endDeferredEmit();

	}

	applyEdit(modelVersionId: number, rawEdits: ICellEditOperation[], synchronous: boolean): boolean {
		if (modelVersionId !== this._versionId) {
			return false;
		}

		const edits = rawEdits.map((edit, index) => {
			return {
				edit,
				end:
					edit.editType === CellEditType.DocumentMetadata
						? undefined
						: (edit.editType === CellEditType.Replace ? edit.index + edit.count : edit.index),
				originalIndex: index,
			};
		}).sort((a, b) => {
			if (a.end === undefined) {
				return -1;
			}

			if (b.end === undefined) {
				return -1;
			}

			return b.end - a.end || b.originalIndex - a.originalIndex;
		});

		for (const { edit } of edits) {
			switch (edit.editType) {
				case CellEditType.Replace:
					this._replaceCells(edit.index, edit.count, edit.cells, synchronous);
					break;
				case CellEditType.Output:
					//TODO@joh,@rebornix no event, no undo stop (?)
					this._assertIndex(edit.index);
					const cell = this._cells[edit.index];
					// TODO@rebornix, we should do diff first
					this._spliceNotebookCellOutputs(cell.handle, [[0, cell.outputs.length, edit.outputs]]);
					break;
				case CellEditType.Metadata:
					this._assertIndex(edit.index);
					this._changeCellMetadata(this._cells[edit.index].handle, edit.metadata, true);
					break;
				case CellEditType.CellLanguage:
					this._assertIndex(edit.index);
					this._changeCellLanguage(this._cells[edit.index].handle, edit.language);
					break;
				case CellEditType.DocumentMetadata:
					this._updateNotebookMetadata(edit.metadata);
					break;
			}
		}

		return true;
	}


	handleUnknownEdit(label: string | undefined, undo: () => void, redo: () => void): void {
		this._operationManager.pushEditOperation({
			type: UndoRedoElementType.Resource,
			resource: this.uri,
			label: label ?? nls.localize('defaultEditLabel', "Edit"),
			undo: async () => {
				undo();
			},
			redo: async () => {
				redo();
			},
		});

		this._eventEmitter.emit({
			kind: NotebookCellsChangeType.Unknown,
			transient: false,
			synchronous: true,
			versionId: this._versionId,
		});
	}

	handleUnknownChange() {
		this._eventEmitter.emit({
			kind: NotebookCellsChangeType.Unknown,
			transient: false,
			synchronous: true,
			versionId: this._versionId,
		});
	}

	createSnapshot(preserveBOM?: boolean): ITextSnapshot {
		return new NotebookTextModelSnapshot(this);
	}

	private _replaceCells(index: number, count: number, cellDtos: ICellDto2[], synchronous: boolean): void {

		if (count === 0 && cellDtos.length === 0) {
			return;
		}

		const oldViewCells = this._cells.slice(0);
		const oldMap = new Map(this._mapping);

		// prepare remove
		for (let i = index; i < index + count; i++) {
			const cell = this._cells[i];
			this._cellListeners.get(cell.handle)?.dispose();
			this._cellListeners.delete(cell.handle);
		}

		// prepare add
		const cells = cellDtos.map(cellDto => {
			const cellHandle = this._cellhandlePool++;
			const cellUri = CellUri.generate(this.uri, cellHandle);
			const cell = new NotebookCellTextModel(
				cellUri, cellHandle,
				cellDto.source, cellDto.language, cellDto.cellKind, cellDto.outputs || [], cellDto.metadata, this.transientOptions,
				this._modelService
			);
			const dirtyStateListener = cell.onDidChangeContent(() => {
				this._eventEmitter.emit({ kind: NotebookCellsChangeType.ChangeCellContent, versionId: this.versionId, synchronous: true, transient: false });
			});
			this._cellListeners.set(cell.handle, dirtyStateListener);
			this._mapping.set(cell.handle, cell);
			return cell;
		});

		// make change
		this._cells.splice(index, count, ...cells);
		const diffs = diff(oldViewCells, this._cells, cell => {
			return oldMap.has(cell.handle);
		}).map(diff => {
			return [diff.start, diff.deleteCount, diff.toInsert] as [number, number, NotebookCellTextModel[]];
		});

		const undoDiff = diffs.map(diff => {
			const deletedCells = this._cells.slice(diff[0], diff[0] + diff[1]);

			return [diff[0], deletedCells, diff[2]] as [number, NotebookCellTextModel[], NotebookCellTextModel[]];
		});

		this._operationManager.pushEditOperation(new SpliceCellsEdit(this.uri, undoDiff, {
			insertCell: (index, cell, endSelections?: number[]) => { this._insertNewCell(index, [cell], true, endSelections); },
			deleteCell: (index, endSelections?: number[]) => { this._removeCell(index, 1, true, endSelections); },
		}, undefined, undefined));

		// should be deferred
		this._eventEmitter.emit({
			kind: NotebookCellsChangeType.ModelChange,
			versionId: this._versionId,
			changes: diffs,
			synchronous,
			transient: false
		});
	}

	private _increaseVersionId(): void {
		this._versionId = this._versionId + 1;
	}

	updateLanguages(languages: string[]) {
		const allLanguages = languages.find(lan => lan === '*');
		this._allLanguages = allLanguages !== undefined;
		this._languages = languages;

		const resolvedLanguages = this.resolvedLanguages;
		if (resolvedLanguages.length && this._cells.length) {
			this._cells[0].language = resolvedLanguages[0];
		}
	}

	private _updateNotebookMetadata(metadata: NotebookDocumentMetadata) {
		this.metadata = metadata;
		this._eventEmitter.emit({ kind: NotebookCellsChangeType.ChangeDocumentMetadata, versionId: this.versionId, metadata: this.metadata, synchronous: true, transient: false });
	}

	private _insertNewCell(index: number, cells: NotebookCellTextModel[], synchronous: boolean, endSelections?: number[]): void {
		for (let i = 0; i < cells.length; i++) {
			this._mapping.set(cells[i].handle, cells[i]);
			const dirtyStateListener = cells[i].onDidChangeContent(() => {
				this._eventEmitter.emit({ kind: NotebookCellsChangeType.ChangeCellContent, versionId: this.versionId, synchronous: true, transient: false });
			});

			this._cellListeners.set(cells[i].handle, dirtyStateListener);
		}

		this._cells.splice(index, 0, ...cells);
		this._eventEmitter.emit({
			kind: NotebookCellsChangeType.ModelChange,
			versionId: this._versionId, changes:
				[[
					index,
					0,
					cells
				]],
			synchronous,
			endSelections: endSelections,
			transient: false
		});

		return;
	}

	private _removeCell(index: number, count: number, synchronous: boolean, endSelections?: number[]) {
		for (let i = index; i < index + count; i++) {
			const cell = this._cells[i];
			this._cellListeners.get(cell.handle)?.dispose();
			this._cellListeners.delete(cell.handle);
		}
		this._cells.splice(index, count);
		this._eventEmitter.emit({ kind: NotebookCellsChangeType.ModelChange, versionId: this._versionId, changes: [[index, count, []]], synchronous, endSelections, transient: false });
	}

	private _isCellMetadataChanged(a: NotebookCellMetadata, b: NotebookCellMetadata) {
		const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
		for (let key of keys) {
			if (
				(a[key as keyof NotebookCellMetadata] !== b[key as keyof NotebookCellMetadata])
				&&
				!(this.transientOptions.transientMetadata[key as keyof NotebookCellMetadata])
			) {
				return true;
			}
		}

		return false;
	}

	private _changeCellMetadata(handle: number, metadata: NotebookCellMetadata, pushUndoStop: boolean) {
		const cell = this._cells.find(cell => cell.handle === handle);

		if (!cell) {
			return;
		}

		const triggerDirtyChange = this._isCellMetadataChanged(cell.metadata, metadata);

		if (triggerDirtyChange) {
			if (pushUndoStop) {
				const index = this._cells.indexOf(cell);
				this._operationManager.pushEditOperation(new CellMetadataEdit(this.uri, index, Object.freeze(cell.metadata), Object.freeze(metadata), {
					updateCellMetadata: (index, newMetadata) => {
						const cell = this._cells[index];
						if (!cell) {
							return;
						}
						this._changeCellMetadata(cell.handle, newMetadata, false);
					}
				}));
			}
			// should be deferred
			cell.metadata = metadata;
		} else {
			cell.metadata = metadata;
		}

		this._eventEmitter.emit({ kind: NotebookCellsChangeType.ChangeCellMetadata, versionId: this._versionId, index: this._cells.indexOf(cell), metadata: cell.metadata, synchronous: true, transient: !triggerDirtyChange });
	}

	private _changeCellLanguage(handle: number, languageId: string) {
		const cell = this._mapping.get(handle);
		if (cell && cell.language !== languageId) {
			cell.language = languageId;

			this._eventEmitter.emit({ kind: NotebookCellsChangeType.ChangeLanguage, versionId: this._versionId, index: this._cells.indexOf(cell), language: languageId, synchronous: true, transient: false });
		}
	}

	// TODO@rebornix, once adopted the new Edit API in ext host, the method should be private.
	_spliceNotebookCellOutputs(cellHandle: number, splices: NotebookCellOutputsSplice[]): void {
		const cell = this._mapping.get(cellHandle);
		if (cell) {
			cell.spliceNotebookCellOutputs(splices);

			this._eventEmitter.emit({
				kind: NotebookCellsChangeType.Output,
				versionId: this.versionId,
				index: this._cells.indexOf(cell),
				outputs: cell.outputs ?? [],
				transient: this.transientOptions.transientOutputs,
				synchronous: true
			});
		}
	}

	private _assertIndex(index: number) {
		if (index < 0 || index >= this._cells.length) {
			throw new Error(`model index out of range ${index}`);
		}
	}

	//#region Notebook Text Model Edit API

	insertCell(index: number, cell: NotebookCellTextModel, synchronous: boolean, pushUndoStop: boolean, beforeSelections: number[] | undefined, endSelections: number[] | undefined): void {
		if (pushUndoStop) {
			this._operationManager.pushEditOperation(new InsertCellEdit(this.uri, index, cell, {
				insertCell: (index, cell, endSelections) => { this._insertNewCell(index, [cell], true, endSelections); },
				deleteCell: (index, endSelections) => { this._removeCell(index, 1, true, endSelections); },
			}, beforeSelections, endSelections));
		}

		this._insertNewCell(index, [cell], synchronous, endSelections);
	}

	deleteCell(index: number, synchronous: boolean, pushUndoStop: boolean, beforeSelections: number[] | undefined, endSelections: number[] | undefined) {
		const cell = this._cells[index];
		if (pushUndoStop) {
			this._operationManager.pushEditOperation(new DeleteCellEdit(this.uri, index, cell, {
				insertCell: (index, cell, endSelections) => { this._insertNewCell(index, [cell], true, endSelections); },
				deleteCell: (index, endSelections) => { this._removeCell(index, 1, true, endSelections); },
			}, beforeSelections, endSelections));
		}

		this._removeCell(index, 1, synchronous, endSelections);
	}

	moveCellToIdx(index: number, length: number, newIdx: number, synchronous: boolean, pushedToUndoStack: boolean, beforeSelections: number[] | undefined, endSelections: number[] | undefined): boolean {
		if (pushedToUndoStack) {
			this._operationManager.pushEditOperation(new MoveCellEdit(this.uri, index, length, newIdx, {
				moveCell: (fromIndex: number, length: number, toIndex: number, beforeSelections: number[] | undefined, endSelections: number[] | undefined) => {
					this.moveCellToIdx(fromIndex, length, toIndex, true, false, beforeSelections, endSelections);
				},
			}, beforeSelections, endSelections));
		}

		this._assertIndex(index);
		this._assertIndex(newIdx);

		const cells = this._cells.splice(index, length);
		this._cells.splice(newIdx, 0, ...cells);
		this._eventEmitter.emit({ kind: NotebookCellsChangeType.Move, versionId: this._versionId, index, length, newIdx, cells, synchronous, endSelections, transient: false });

		return true;
	}

	async splitNotebookCell(index: number, newLinesContents: string[], endSelections: number[]) {
		const cell = this._cells[index];

		const ref = await cell.resolveTextModelRef();
		const textModel = ref.object.textEditorModel;

		textModel.applyEdits([
			{ range: textModel.getFullModelRange(), text: newLinesContents[0] }
		], false);

		ref.dispose();

		// create new cells based on the new text models
		const language = cell.language;
		const kind = cell.cellKind;
		let insertIndex = index + 1;
		const newCells = [];
		for (let j = 1; j < newLinesContents.length; j++, insertIndex++) {
			const cell = this.createCellTextModel(newLinesContents[j], language, kind, [], undefined);
			this.insertCell(insertIndex, cell, true, false, undefined, j === newLinesContents.length - 1 ? endSelections : undefined);
			newCells.push(cell);
		}
	}
	//#endregion


}
