/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event, PauseableEmitter } from 'vs/base/common/event';
import { Disposable, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { INotebookTextModel, NotebookCellOutputsSplice, NotebookDocumentMetadata, NotebookCellMetadata, ICellEditOperation, CellEditType, CellUri, diff, NotebookCellsChangeType, ICellDto2, TransientOptions, NotebookTextModelChangedEvent, IOutputDto, ICellOutput, IOutputItemDto, ISelectionState, NullablePartialNotebookCellMetadata, NotebookCellInternalMetadata, NullablePartialNotebookCellInternalMetadata, NotebookTextModelWillAddRemoveEvent, NotebookCellTextModelSplice, ICell, NotebookCellCollapseState, NotebookCellDefaultCollapseConfig, CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IUndoRedoService, UndoRedoElementType, IUndoRedoElement, IResourceUndoRedoElement, UndoRedoGroup, IWorkspaceUndoRedoElement } from 'vs/platform/undoRedo/common/undoRedo';
import { MoveCellEdit, SpliceCellsEdit, CellMetadataEdit } from 'vs/workbench/contrib/notebook/common/model/cellEdit';
import { ISequence, LcsDiff } from 'vs/base/common/diff/diff';
import { hash } from 'vs/base/common/hash';
import { NotebookCellOutputTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellOutputTextModel';
import { IModelService } from 'vs/editor/common/services/model';
import { Schemas } from 'vs/base/common/network';
import { isEqual } from 'vs/base/common/resources';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ITextModel } from 'vs/editor/common/model';
import { TextModel } from 'vs/editor/common/model/textModel';
import { isDefined } from 'vs/base/common/types';
import { ILanguageDetectionService } from 'vs/workbench/services/languageDetection/common/languageDetectionWorkerService';


class StackOperation implements IWorkspaceUndoRedoElement {
	type: UndoRedoElementType.Workspace;

	public get code() {
		return this._operations.length === 1 ? this._operations[0].code : 'undoredo.notebooks.stackOperation';
	}

	private _operations: IUndoRedoElement[] = [];
	private _beginSelectionState: ISelectionState | undefined = undefined;
	private _resultSelectionState: ISelectionState | undefined = undefined;
	private _beginAlternativeVersionId: string;
	private _resultAlternativeVersionId: string;
	public get label() {
		return this._operations.length === 1 ? this._operations[0].label : 'edit';
	}

	constructor(
		readonly textModel: NotebookTextModel,
		readonly undoRedoGroup: UndoRedoGroup | undefined,
		private _pauseableEmitter: PauseableEmitter<NotebookTextModelChangedEvent>,
		private _postUndoRedo: (alternativeVersionId: string) => void,
		selectionState: ISelectionState | undefined,
		beginAlternativeVersionId: string
	) {
		this.type = UndoRedoElementType.Workspace;
		this._beginSelectionState = selectionState;
		this._beginAlternativeVersionId = beginAlternativeVersionId;
		this._resultAlternativeVersionId = beginAlternativeVersionId;
	}
	get resources(): readonly URI[] {
		return [this.textModel.uri];
	}

	get isEmpty(): boolean {
		return this._operations.length === 0;
	}

	pushEndState(alternativeVersionId: string, selectionState: ISelectionState | undefined) {
		// https://github.com/microsoft/vscode/issues/207523
		this._resultAlternativeVersionId = alternativeVersionId;
		this._resultSelectionState = selectionState || this._resultSelectionState;
	}

	pushEditOperation(element: IUndoRedoElement, beginSelectionState: ISelectionState | undefined, resultSelectionState: ISelectionState | undefined, alternativeVersionId: string) {
		if (this._operations.length === 0) {
			this._beginSelectionState = this._beginSelectionState ?? beginSelectionState;
		}
		this._operations.push(element);
		this._resultSelectionState = resultSelectionState;
		this._resultAlternativeVersionId = alternativeVersionId;
	}

	async undo(): Promise<void> {
		this._pauseableEmitter.pause();
		try {
			for (let i = this._operations.length - 1; i >= 0; i--) {
				await this._operations[i].undo();
			}
			this._postUndoRedo(this._beginAlternativeVersionId);
			this._pauseableEmitter.fire({
				rawEvents: [],
				synchronous: undefined,
				versionId: this.textModel.versionId,
				endSelectionState: this._beginSelectionState
			});
		} finally {
			this._pauseableEmitter.resume();
		}
	}

	async redo(): Promise<void> {
		this._pauseableEmitter.pause();
		try {
			for (let i = 0; i < this._operations.length; i++) {
				await this._operations[i].redo();
			}
			this._postUndoRedo(this._resultAlternativeVersionId);
			this._pauseableEmitter.fire({
				rawEvents: [],
				synchronous: undefined,
				versionId: this.textModel.versionId,
				endSelectionState: this._resultSelectionState
			});
		} finally {
			this._pauseableEmitter.resume();
		}

	}
}

class NotebookOperationManager {
	private _pendingStackOperation: StackOperation | null = null;
	constructor(
		private readonly _textModel: NotebookTextModel,
		private _undoService: IUndoRedoService,
		private _pauseableEmitter: PauseableEmitter<NotebookTextModelChangedEvent>,
		private _postUndoRedo: (alternativeVersionId: string) => void
	) {
	}

	isUndoStackEmpty(): boolean {
		return this._pendingStackOperation === null || this._pendingStackOperation.isEmpty;
	}

	pushStackElement(alternativeVersionId: string, selectionState: ISelectionState | undefined) {
		if (this._pendingStackOperation && !this._pendingStackOperation.isEmpty) {
			this._pendingStackOperation.pushEndState(alternativeVersionId, selectionState);
			this._undoService.pushElement(this._pendingStackOperation, this._pendingStackOperation.undoRedoGroup);
		}
		this._pendingStackOperation = null;
	}
	private _getOrCreateEditStackElement(beginSelectionState: ISelectionState | undefined, undoRedoGroup: UndoRedoGroup | undefined, alternativeVersionId: string) {
		return this._pendingStackOperation ??= new StackOperation(this._textModel, undoRedoGroup, this._pauseableEmitter, this._postUndoRedo, beginSelectionState, alternativeVersionId || '');
	}

	pushEditOperation(element: IUndoRedoElement, beginSelectionState: ISelectionState | undefined, resultSelectionState: ISelectionState | undefined, alternativeVersionId: string, undoRedoGroup: UndoRedoGroup | undefined) {
		const pendingStackOperation = this._getOrCreateEditStackElement(beginSelectionState, undoRedoGroup, alternativeVersionId);
		pendingStackOperation.pushEditOperation(element, beginSelectionState, resultSelectionState, alternativeVersionId);
	}
}

type TransformedEdit = {
	edit: ICellEditOperation;
	cellIndex: number;
	end: number | undefined;
	originalIndex: number;
};

class NotebookEventEmitter extends PauseableEmitter<NotebookTextModelChangedEvent> {
	get isEmpty() {
		return this._eventQueue.isEmpty();
	}

	isDirtyEvent() {
		for (const e of this._eventQueue) {
			for (let i = 0; i < e.rawEvents.length; i++) {
				if (!e.rawEvents[i].transient) {
					return true;
				}
			}
		}

		return false;
	}
}

export class NotebookTextModel extends Disposable implements INotebookTextModel {

	private _isDisposed = false;
	private readonly _onWillDispose: Emitter<void> = this._register(new Emitter<void>());
	private readonly _onWillAddRemoveCells = this._register(new Emitter<NotebookTextModelWillAddRemoveEvent>());
	private readonly _onDidChangeContent = this._register(new Emitter<NotebookTextModelChangedEvent>());
	readonly onWillDispose: Event<void> = this._onWillDispose.event;
	readonly onWillAddRemoveCells = this._onWillAddRemoveCells.event;
	readonly onDidChangeContent = this._onDidChangeContent.event;
	private _cellhandlePool: number = 0;
	private readonly _cellListeners: Map<number, IDisposable> = new Map();
	private _cells: NotebookCellTextModel[] = [];
	private _defaultCollapseConfig: NotebookCellDefaultCollapseConfig | undefined;

	metadata: NotebookDocumentMetadata = {};
	transientOptions: TransientOptions = { transientCellMetadata: {}, transientDocumentMetadata: {}, transientOutputs: false, cellContentMetadata: {} };
	private _versionId = 0;

	/**
	 * This alternative id is only for non-cell-content changes.
	 */
	private _notebookSpecificAlternativeId = 0;

	/**
	 * Unlike, versionId, this can go down (via undo) or go to previous values (via redo)
	 */
	private _alternativeVersionId: string = '1';
	private _operationManager: NotebookOperationManager;
	private _pauseableEmitter: NotebookEventEmitter;

	get length() {
		return this._cells.length;
	}

	get cells(): readonly NotebookCellTextModel[] {
		return this._cells;
	}

	get versionId() {
		return this._versionId;
	}

	get alternativeVersionId(): string {
		return this._alternativeVersionId;
	}

	get notebookType() {
		return this.viewType;
	}

	constructor(
		readonly viewType: string,
		readonly uri: URI,
		cells: ICellDto2[],
		metadata: NotebookDocumentMetadata,
		options: TransientOptions,
		@IUndoRedoService private readonly _undoService: IUndoRedoService,
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@ILanguageDetectionService private readonly _languageDetectionService: ILanguageDetectionService
	) {
		super();
		this.transientOptions = options;
		this.metadata = metadata;
		this._initialize(cells);

		const maybeUpdateCellTextModel = (textModel: ITextModel) => {
			if (textModel.uri.scheme === Schemas.vscodeNotebookCell && textModel instanceof TextModel) {
				const cellUri = CellUri.parse(textModel.uri);
				if (cellUri && isEqual(cellUri.notebook, this.uri)) {
					const cellIdx = this._getCellIndexByHandle(cellUri.handle);
					if (cellIdx >= 0) {
						const cell = this.cells[cellIdx];
						if (cell) {
							cell.textModel = textModel;
						}
					}
				}
			}
		};
		this._register(_modelService.onModelAdded(e => maybeUpdateCellTextModel(e)));

		this._pauseableEmitter = new NotebookEventEmitter({
			merge: (events: NotebookTextModelChangedEvent[]) => {
				const first = events[0];

				const rawEvents = first.rawEvents;
				let versionId = first.versionId;
				let endSelectionState = first.endSelectionState;
				let synchronous = first.synchronous;

				for (let i = 1; i < events.length; i++) {
					rawEvents.push(...events[i].rawEvents);
					versionId = events[i].versionId;
					endSelectionState = events[i].endSelectionState !== undefined ? events[i].endSelectionState : endSelectionState;
					synchronous = events[i].synchronous !== undefined ? events[i].synchronous : synchronous;
				}

				return { rawEvents, versionId, endSelectionState, synchronous };
			}
		});

		this._register(this._pauseableEmitter.event(e => {
			if (e.rawEvents.length) {
				this._onDidChangeContent.fire(e);
			}
		}));

		this._operationManager = new NotebookOperationManager(
			this,
			this._undoService,
			this._pauseableEmitter,
			(alternativeVersionId: string) => {
				this._increaseVersionId(true);
				this._overwriteAlternativeVersionId(alternativeVersionId);
			}
		);
	}

	setCellCollapseDefault(collapseConfig: NotebookCellDefaultCollapseConfig | undefined) {
		this._defaultCollapseConfig = collapseConfig;
	}

	_initialize(cells: ICellDto2[], triggerDirty?: boolean) {
		this._cells = [];
		this._versionId = 0;
		this._notebookSpecificAlternativeId = 0;

		const mainCells = cells.map(cell => {
			const cellHandle = this._cellhandlePool++;
			const cellUri = CellUri.generate(this.uri, cellHandle);
			const collapseState = this._getDefaultCollapseState(cell);
			return new NotebookCellTextModel(cellUri, cellHandle, cell.source, cell.language, cell.mime, cell.cellKind, cell.outputs, cell.metadata, cell.internalMetadata, collapseState, this.transientOptions, this._languageService, this._languageDetectionService);
		});

		for (let i = 0; i < mainCells.length; i++) {
			const dirtyStateListener = mainCells[i].onDidChangeContent((e) => {
				this._bindCellContentHandler(mainCells[i], e);
			});

			this._cellListeners.set(mainCells[i].handle, dirtyStateListener);
			this._register(mainCells[i]);
		}

		this._cells.splice(0, 0, ...mainCells);
		this._alternativeVersionId = this._generateAlternativeId();

		if (triggerDirty) {
			this._pauseableEmitter.fire({
				rawEvents: [{ kind: NotebookCellsChangeType.Unknown, transient: false }],
				versionId: this.versionId,
				synchronous: true,
				endSelectionState: undefined
			});
		}
	}

	private _bindCellContentHandler(cell: NotebookCellTextModel, e: 'content' | 'language' | 'mime') {
		this._increaseVersionId(e === 'content');
		switch (e) {
			case 'content':
				this._pauseableEmitter.fire({
					rawEvents: [{ kind: NotebookCellsChangeType.ChangeCellContent, index: this._getCellIndexByHandle(cell.handle), transient: false }],
					versionId: this.versionId,
					synchronous: true,
					endSelectionState: undefined
				});
				break;

			case 'language':
				this._pauseableEmitter.fire({
					rawEvents: [{ kind: NotebookCellsChangeType.ChangeCellLanguage, index: this._getCellIndexByHandle(cell.handle), language: cell.language, transient: false }],
					versionId: this.versionId,
					synchronous: true,
					endSelectionState: undefined
				});
				break;

			case 'mime':
				this._pauseableEmitter.fire({
					rawEvents: [{ kind: NotebookCellsChangeType.ChangeCellMime, index: this._getCellIndexByHandle(cell.handle), mime: cell.mime, transient: false }],
					versionId: this.versionId,
					synchronous: true,
					endSelectionState: undefined
				});
				break;
		}
	}

	private _generateAlternativeId() {
		return `${this._notebookSpecificAlternativeId}_` + this.cells.map(cell => cell.handle + ',' + cell.alternativeId).join(';');
	}

	override dispose() {
		if (this._isDisposed) {
			// NotebookEditorModel can be disposed twice, don't fire onWillDispose again
			return;
		}

		this._isDisposed = true;
		this._onWillDispose.fire();
		this._undoService.removeElements(this.uri);

		dispose(this._cellListeners.values());
		this._cellListeners.clear();

		dispose(this._cells);
		this._cells = [];
		super.dispose();
	}

	pushStackElement() {
		// https://github.com/microsoft/vscode/issues/207523
	}

	private _getCellIndexByHandle(handle: number) {
		return this.cells.findIndex(c => c.handle === handle);
	}

	private _getCellIndexWithOutputIdHandleFromEdits(outputId: string, rawEdits: ICellEditOperation[]) {
		const edit = rawEdits.find(e => 'outputs' in e && e.outputs.some(o => o.outputId === outputId));
		if (edit) {
			if ('index' in edit) {
				return edit.index;
			} else if ('handle' in edit) {
				const cellIndex = this._getCellIndexByHandle(edit.handle);
				this._assertIndex(cellIndex);
				return cellIndex;
			}
		}

		return -1;
	}

	private _getCellIndexWithOutputIdHandle(outputId: string) {
		return this.cells.findIndex(c => !!c.outputs.find(o => o.outputId === outputId));
	}

	reset(cells: ICellDto2[], metadata: NotebookDocumentMetadata, transientOptions: TransientOptions): void {
		this.transientOptions = transientOptions;
		const edits = NotebookTextModel.computeEdits(this, cells);

		this.applyEdits(
			[
				...edits,
				{ editType: CellEditType.DocumentMetadata, metadata }
			],
			true,
			undefined, () => undefined,
			undefined,
			false
		);
	}

	static computeEdits(model: NotebookTextModel, cells: ICellDto2[]) {
		const edits: ICellEditOperation[] = [];

		const commonPrefix = this._commonPrefix(model.cells, model.cells.length, 0, cells, cells.length, 0);

		if (commonPrefix > 0) {
			for (let i = 0; i < commonPrefix; i++) {
				edits.push(
					{
						editType: CellEditType.Metadata,
						index: i,
						metadata: cells[i].metadata ?? {}
					},
					...this._computeOutputEdit(i, model.cells[i].outputs, cells[i].outputs)
				);
			}
		}

		if (model.cells.length === cells.length && commonPrefix === model.cells.length) {
			return edits;
		}

		const commonSuffix = this._commonSuffix(model.cells, model.cells.length - commonPrefix, commonPrefix, cells, cells.length - commonPrefix, commonPrefix);

		if (commonSuffix > 0) {
			edits.push({ editType: CellEditType.Replace, index: commonPrefix, count: model.cells.length - commonPrefix - commonSuffix, cells: cells.slice(commonPrefix, cells.length - commonSuffix) });
		} else if (commonPrefix > 0) {
			edits.push({ editType: CellEditType.Replace, index: commonPrefix, count: model.cells.length - commonPrefix, cells: cells.slice(commonPrefix) });
		} else {
			edits.push({ editType: CellEditType.Replace, index: 0, count: model.cells.length, cells });
		}

		if (commonSuffix > 0) {
			// has same suffix
			for (let i = commonSuffix; i > 0; i--) {
				edits.push(
					{
						editType: CellEditType.Metadata,
						index: model.cells.length - i,
						metadata: cells[cells.length - i].metadata ?? {}
					},
					...this._computeOutputEdit(model.cells.length - i, model.cells[model.cells.length - i].outputs, cells[cells.length - i].outputs)
				);
			}
		}

		return edits;
	}

	private static _computeOutputEdit(index: number, a: ICellOutput[], b: IOutputDto[]): ICellEditOperation[] {
		if (a.length !== b.length) {
			return [
				{
					editType: CellEditType.Output,
					index: index,
					outputs: b,
					append: false
				}
			];
		}

		if (a.length === 0) {
			// no output
			return [];
		}

		// same length
		return b.map((output, i) => {
			return {
				editType: CellEditType.OutputItems,
				outputId: a[i].outputId,
				items: output.outputs,
				append: false
			};
		});
	}

	private static _commonPrefix(a: readonly NotebookCellTextModel[], aLen: number, aDelta: number, b: ICellDto2[], bLen: number, bDelta: number): number {
		const maxResult = Math.min(aLen, bLen);
		let result = 0;
		for (let i = 0; i < maxResult && a[aDelta + i].fastEqual(b[bDelta + i]); i++) {
			result++;
		}

		return result;
	}

	private static _commonSuffix(a: readonly NotebookCellTextModel[], aLen: number, aDelta: number, b: ICellDto2[], bLen: number, bDelta: number): number {
		const maxResult = Math.min(aLen, bLen);
		let result = 0;
		for (let i = 0; i < maxResult && a[aDelta + aLen - i - 1].fastEqual(b[bDelta + bLen - i - 1]); i++) {
			result++;
		}
		return result;
	}

	applyEdits(rawEdits: ICellEditOperation[], synchronous: boolean, beginSelectionState: ISelectionState | undefined, endSelectionsComputer: () => ISelectionState | undefined, undoRedoGroup: UndoRedoGroup | undefined, computeUndoRedo: boolean): boolean {
		this._pauseableEmitter.pause();
		this._operationManager.pushStackElement(this._alternativeVersionId, undefined);

		try {
			this._doApplyEdits(rawEdits, synchronous, computeUndoRedo, beginSelectionState, undoRedoGroup);
			return true;
		} finally {
			if (!this._pauseableEmitter.isEmpty) {
				// Update selection and versionId after applying edits.
				const endSelections = endSelectionsComputer();
				this._increaseVersionId(this._operationManager.isUndoStackEmpty() && !this._pauseableEmitter.isDirtyEvent());

				// Finalize undo element
				this._operationManager.pushStackElement(this._alternativeVersionId, endSelections);

				// Broadcast changes
				this._pauseableEmitter.fire({ rawEvents: [], versionId: this.versionId, synchronous: synchronous, endSelectionState: endSelections });
			}
			this._pauseableEmitter.resume();
		}
	}

	private _doApplyEdits(rawEdits: ICellEditOperation[], synchronous: boolean, computeUndoRedo: boolean, beginSelectionState: ISelectionState | undefined, undoRedoGroup: UndoRedoGroup | undefined): void {
		const editsWithDetails = rawEdits.map((edit, index) => {
			let cellIndex: number = -1;
			if ('index' in edit) {
				cellIndex = edit.index;
			} else if ('handle' in edit) {
				cellIndex = this._getCellIndexByHandle(edit.handle);
				this._assertIndex(cellIndex);
			} else if ('outputId' in edit) {
				cellIndex = this._getCellIndexWithOutputIdHandle(edit.outputId);
				if (this._indexIsInvalid(cellIndex)) {
					// The referenced output may have been created in this batch of edits
					cellIndex = this._getCellIndexWithOutputIdHandleFromEdits(edit.outputId, rawEdits.slice(0, index));
				}

				if (this._indexIsInvalid(cellIndex)) {
					// It's possible for an edit to refer to an output which was just cleared, ignore it without throwing
					return null;
				}
			} else if (edit.editType !== CellEditType.DocumentMetadata) {
				throw new Error('Invalid cell edit');
			}

			return {
				edit,
				cellIndex,
				end:
					(edit.editType === CellEditType.DocumentMetadata)
						? undefined
						: (edit.editType === CellEditType.Replace ? edit.index + edit.count : cellIndex),
				originalIndex: index
			};
		}).filter(isDefined);

		// compress all edits which have no side effects on cell index
		const edits = this._mergeCellEdits(editsWithDetails)
			.sort((a, b) => {
				if (a.end === undefined) {
					return -1;
				}

				if (b.end === undefined) {
					return -1;
				}

				return b.end - a.end || b.originalIndex - a.originalIndex;
			}).reduce((prev, curr) => {
				if (!prev.length) {
					// empty
					prev.push([curr]);
				} else {
					const last = prev[prev.length - 1];
					const index = last[0].cellIndex;

					if (curr.cellIndex === index) {
						last.push(curr);
					} else {
						prev.push([curr]);
					}
				}

				return prev;
			}, [] as TransformedEdit[][]).map(editsOnSameIndex => {
				const replaceEdits: TransformedEdit[] = [];
				const otherEdits: TransformedEdit[] = [];

				editsOnSameIndex.forEach(edit => {
					if (edit.edit.editType === CellEditType.Replace) {
						replaceEdits.push(edit);
					} else {
						otherEdits.push(edit);
					}
				});

				return [...otherEdits.reverse(), ...replaceEdits];
			});

		const flattenEdits = edits.flat();

		for (const { edit, cellIndex } of flattenEdits) {
			switch (edit.editType) {
				case CellEditType.Replace:
					this._replaceCells(edit.index, edit.count, edit.cells, synchronous, computeUndoRedo, beginSelectionState, undoRedoGroup);
					break;
				case CellEditType.Output: {
					this._assertIndex(cellIndex);
					const cell = this._cells[cellIndex];
					if (edit.append) {
						this._spliceNotebookCellOutputs(cell, { start: cell.outputs.length, deleteCount: 0, newOutputs: edit.outputs.map(op => new NotebookCellOutputTextModel(op)) }, true, computeUndoRedo);
					} else {
						this._spliceNotebookCellOutputs2(cell, edit.outputs, computeUndoRedo);
					}
					break;
				}
				case CellEditType.OutputItems:
					{
						this._assertIndex(cellIndex);
						const cell = this._cells[cellIndex];
						if (edit.append) {
							this._appendNotebookCellOutputItems(cell, edit.outputId, edit.items);
						} else {
							this._replaceNotebookCellOutputItems(cell, edit.outputId, edit.items);
						}
					}
					break;

				case CellEditType.Metadata:
					this._assertIndex(edit.index);
					this._changeCellMetadata(this._cells[edit.index], edit.metadata, computeUndoRedo, beginSelectionState, undoRedoGroup);
					break;
				case CellEditType.PartialMetadata:
					this._assertIndex(cellIndex);
					this._changeCellMetadataPartial(this._cells[cellIndex], edit.metadata, computeUndoRedo, beginSelectionState, undoRedoGroup);
					break;
				case CellEditType.PartialInternalMetadata:
					this._assertIndex(cellIndex);
					this._changeCellInternalMetadataPartial(this._cells[cellIndex], edit.internalMetadata);
					break;
				case CellEditType.CellLanguage:
					this._assertIndex(edit.index);
					this._changeCellLanguage(this._cells[edit.index], edit.language, computeUndoRedo, beginSelectionState, undoRedoGroup);
					break;
				case CellEditType.DocumentMetadata:
					this._updateNotebookCellMetadata(edit.metadata, computeUndoRedo, beginSelectionState, undoRedoGroup);
					break;
				case CellEditType.Move:
					this._moveCellToIdx(edit.index, edit.length, edit.newIdx, synchronous, computeUndoRedo, beginSelectionState, undefined, undoRedoGroup);
					break;
			}
		}
	}

	private _mergeCellEdits(rawEdits: TransformedEdit[]): TransformedEdit[] {
		const mergedEdits: TransformedEdit[] = [];

		rawEdits.forEach(edit => {
			if (mergedEdits.length) {
				const last = mergedEdits[mergedEdits.length - 1];

				if (last.edit.editType === CellEditType.Output
					&& last.edit.append
					&& edit.edit.editType === CellEditType.Output
					&& edit.edit.append
					&& last.cellIndex === edit.cellIndex
				) {
					last.edit.outputs = [...last.edit.outputs, ...edit.edit.outputs];
				} else if (last.edit.editType === CellEditType.Output
					&& !last.edit.append // last cell is not append
					&& last.edit.outputs.length === 0 // last cell is clear outputs
					&& edit.edit.editType === CellEditType.Output
					&& edit.edit.append
					&& last.cellIndex === edit.cellIndex
				) {
					last.edit.append = false;
					last.edit.outputs = edit.edit.outputs;
				} else {
					mergedEdits.push(edit);
				}
			} else {
				mergedEdits.push(edit);
			}
		});

		return mergedEdits;
	}

	private _getDefaultCollapseState(cellDto: ICellDto2): NotebookCellCollapseState | undefined {
		const defaultConfig = cellDto.cellKind === CellKind.Code ? this._defaultCollapseConfig?.codeCell : this._defaultCollapseConfig?.markupCell;
		return cellDto.collapseState ?? (defaultConfig ?? undefined);
	}

	private _replaceCells(index: number, count: number, cellDtos: ICellDto2[], synchronous: boolean, computeUndoRedo: boolean, beginSelectionState: ISelectionState | undefined, undoRedoGroup: UndoRedoGroup | undefined): void {

		if (count === 0 && cellDtos.length === 0) {
			return;
		}

		const oldViewCells = this._cells.slice(0);
		const oldSet = new Set();
		oldViewCells.forEach(cell => {
			oldSet.add(cell.handle);
		});

		// prepare remove
		for (let i = index; i < Math.min(index + count, this._cells.length); i++) {
			const cell = this._cells[i];
			this._cellListeners.get(cell.handle)?.dispose();
			this._cellListeners.delete(cell.handle);
		}

		// prepare add
		const cells = cellDtos.map(cellDto => {
			const cellHandle = this._cellhandlePool++;
			const cellUri = CellUri.generate(this.uri, cellHandle);
			const collapseState = this._getDefaultCollapseState(cellDto);
			const cell = new NotebookCellTextModel(
				cellUri, cellHandle,
				cellDto.source, cellDto.language, cellDto.mime, cellDto.cellKind, cellDto.outputs || [], cellDto.metadata, cellDto.internalMetadata, collapseState, this.transientOptions,
				this._languageService,
				this._languageDetectionService
			);
			const textModel = this._modelService.getModel(cellUri);
			if (textModel && textModel instanceof TextModel) {
				cell.textModel = textModel;
				cell.language = cellDto.language;
				cell.textModel.setValue(cellDto.source);
				cell.resetTextBuffer(cell.textModel.getTextBuffer());
			}
			const dirtyStateListener = cell.onDidChangeContent((e) => {
				this._bindCellContentHandler(cell, e);
			});
			this._cellListeners.set(cell.handle, dirtyStateListener);
			this._register(cell);
			return cell;
		});

		// compute change
		const cellsCopy = this._cells.slice(0);
		cellsCopy.splice(index, count, ...cells);
		const diffs = diff(this._cells, cellsCopy, cell => {
			return oldSet.has(cell.handle);
		}).map(diff => {
			return [diff.start, diff.deleteCount, diff.toInsert] as [number, number, NotebookCellTextModel[]];
		});
		this._onWillAddRemoveCells.fire({ rawEvent: { kind: NotebookCellsChangeType.ModelChange, changes: diffs } });

		// make change
		this._cells = cellsCopy;

		const undoDiff = diffs.map(diff => {
			const deletedCells = oldViewCells.slice(diff[0], diff[0] + diff[1]);

			return [diff[0], deletedCells, diff[2]] as [number, NotebookCellTextModel[], NotebookCellTextModel[]];
		});

		if (computeUndoRedo) {
			this._operationManager.pushEditOperation(new SpliceCellsEdit(this.uri, undoDiff, {
				insertCell: (index, cell, endSelections) => { this._insertNewCell(index, [cell], true, endSelections); },
				deleteCell: (index, endSelections) => { this._removeCell(index, 1, true, endSelections); },
				replaceCell: (index, count, cells, endSelections) => { this._replaceNewCells(index, count, cells, true, endSelections); },
			}, undefined, undefined), beginSelectionState, undefined, this._alternativeVersionId, undoRedoGroup);
		}

		// should be deferred
		this._pauseableEmitter.fire({
			rawEvents: [{ kind: NotebookCellsChangeType.ModelChange, changes: diffs, transient: false }],
			versionId: this.versionId,
			synchronous: synchronous,
			endSelectionState: undefined
		});
	}

	private _increaseVersionId(transient: boolean): void {
		this._versionId = this._versionId + 1;
		if (!transient) {
			this._notebookSpecificAlternativeId = this._versionId;
		}
		this._alternativeVersionId = this._generateAlternativeId();
	}

	private _overwriteAlternativeVersionId(newAlternativeVersionId: string): void {
		this._alternativeVersionId = newAlternativeVersionId;
		this._notebookSpecificAlternativeId = Number(newAlternativeVersionId.substring(0, newAlternativeVersionId.indexOf('_')));
	}

	private _updateNotebookCellMetadata(metadata: NotebookDocumentMetadata, computeUndoRedo: boolean, beginSelectionState: ISelectionState | undefined, undoRedoGroup: UndoRedoGroup | undefined) {
		const oldMetadata = this.metadata;
		const triggerDirtyChange = this._isDocumentMetadataChanged(this.metadata, metadata);

		if (triggerDirtyChange) {
			if (computeUndoRedo) {
				const that = this;
				this._operationManager.pushEditOperation(new class implements IResourceUndoRedoElement {
					readonly type: UndoRedoElementType.Resource = UndoRedoElementType.Resource;
					get resource() {
						return that.uri;
					}
					readonly label = 'Update Cell Metadata';
					readonly code = 'undoredo.textBufferEdit';
					undo() {
						that._updateNotebookCellMetadata(oldMetadata, false, beginSelectionState, undoRedoGroup);
					}
					redo() {
						that._updateNotebookCellMetadata(metadata, false, beginSelectionState, undoRedoGroup);
					}
				}(), beginSelectionState, undefined, this._alternativeVersionId, undoRedoGroup);
			}
		}

		this.metadata = metadata;
		this._pauseableEmitter.fire({
			rawEvents: [{ kind: NotebookCellsChangeType.ChangeDocumentMetadata, metadata: this.metadata, transient: !triggerDirtyChange }],
			versionId: this.versionId,
			synchronous: true,
			endSelectionState: undefined
		});
	}

	private _insertNewCell(index: number, cells: NotebookCellTextModel[], synchronous: boolean, endSelections: ISelectionState | undefined): void {
		for (let i = 0; i < cells.length; i++) {
			const dirtyStateListener = cells[i].onDidChangeContent((e) => {
				this._bindCellContentHandler(cells[i], e);
			});

			this._cellListeners.set(cells[i].handle, dirtyStateListener);
		}

		const changes: NotebookCellTextModelSplice<ICell>[] = [[index, 0, cells]];
		this._onWillAddRemoveCells.fire({ rawEvent: { kind: NotebookCellsChangeType.ModelChange, changes } });
		this._cells.splice(index, 0, ...cells);
		this._pauseableEmitter.fire({
			rawEvents: [{ kind: NotebookCellsChangeType.ModelChange, changes, transient: false }],
			versionId: this.versionId,
			synchronous: synchronous,
			endSelectionState: endSelections
		});

		return;
	}

	private _removeCell(index: number, count: number, synchronous: boolean, endSelections: ISelectionState | undefined) {
		for (let i = index; i < index + count; i++) {
			const cell = this._cells[i];
			this._cellListeners.get(cell.handle)?.dispose();
			this._cellListeners.delete(cell.handle);
		}
		const changes: NotebookCellTextModelSplice<ICell>[] = [[index, count, []]];
		this._onWillAddRemoveCells.fire({ rawEvent: { kind: NotebookCellsChangeType.ModelChange, changes } });
		this._cells.splice(index, count);
		this._pauseableEmitter.fire({
			rawEvents: [{ kind: NotebookCellsChangeType.ModelChange, changes, transient: false }],
			versionId: this.versionId,
			synchronous: synchronous,
			endSelectionState: endSelections
		});
	}

	private _replaceNewCells(index: number, count: number, cells: NotebookCellTextModel[], synchronous: boolean, endSelections: ISelectionState | undefined) {
		for (let i = index; i < index + count; i++) {
			const cell = this._cells[i];
			this._cellListeners.get(cell.handle)?.dispose();
			this._cellListeners.delete(cell.handle);
		}

		for (let i = 0; i < cells.length; i++) {
			const dirtyStateListener = cells[i].onDidChangeContent((e) => {
				this._bindCellContentHandler(cells[i], e);
			});

			this._cellListeners.set(cells[i].handle, dirtyStateListener);
		}

		const changes: NotebookCellTextModelSplice<ICell>[] = [[index, count, cells]];
		this._onWillAddRemoveCells.fire({ rawEvent: { kind: NotebookCellsChangeType.ModelChange, changes } });
		this._cells.splice(index, count, ...cells);
		this._pauseableEmitter.fire({
			rawEvents: [{ kind: NotebookCellsChangeType.ModelChange, changes, transient: false }],
			versionId: this.versionId,
			synchronous: synchronous,
			endSelectionState: endSelections
		});
	}

	private _isDocumentMetadataChanged(a: NotebookDocumentMetadata, b: NotebookDocumentMetadata) {
		const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
		for (const key of keys) {
			if (key === 'custom') {
				if (!this._customMetadataEqual(a[key], b[key])
					&&
					!(this.transientOptions.transientDocumentMetadata[key as keyof NotebookDocumentMetadata])
				) {
					return true;
				}
			} else if (
				(a[key as keyof NotebookDocumentMetadata] !== b[key as keyof NotebookDocumentMetadata])
				&&
				!(this.transientOptions.transientDocumentMetadata[key as keyof NotebookDocumentMetadata])
			) {
				return true;
			}
		}

		return false;
	}

	private _isCellMetadataChanged(a: NotebookCellMetadata, b: NotebookCellMetadata) {
		const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
		for (const key of keys) {
			if (
				(a[key as keyof NotebookCellMetadata] !== b[key as keyof NotebookCellMetadata])
				&&
				!(this.transientOptions.transientCellMetadata[key as keyof NotebookCellMetadata])
			) {
				return true;
			}
		}

		return false;
	}

	private _customMetadataEqual(a: any, b: any) {
		if (!a && !b) {
			// both of them are nullish or undefined
			return true;
		}

		if (!a || !b) {
			return false;
		}

		const aProps = Object.getOwnPropertyNames(a);
		const bProps = Object.getOwnPropertyNames(b);

		if (aProps.length !== bProps.length) {
			return false;
		}

		for (let i = 0; i < aProps.length; i++) {
			const propName = aProps[i];
			if (a[propName] !== b[propName]) {
				return false;
			}
		}

		return true;
	}

	private _changeCellMetadataPartial(cell: NotebookCellTextModel, metadata: NullablePartialNotebookCellMetadata, computeUndoRedo: boolean, beginSelectionState: ISelectionState | undefined, undoRedoGroup: UndoRedoGroup | undefined) {
		const newMetadata: NotebookCellMetadata = {
			...cell.metadata
		};
		let k: keyof NullablePartialNotebookCellMetadata;
		for (k in metadata) {
			const value = metadata[k] ?? undefined;
			newMetadata[k] = value as any;
		}

		return this._changeCellMetadata(cell, newMetadata, computeUndoRedo, beginSelectionState, undoRedoGroup);
	}

	private _changeCellMetadata(cell: NotebookCellTextModel, metadata: NotebookCellMetadata, computeUndoRedo: boolean, beginSelectionState: ISelectionState | undefined, undoRedoGroup: UndoRedoGroup | undefined) {
		const triggerDirtyChange = this._isCellMetadataChanged(cell.metadata, metadata);

		if (triggerDirtyChange) {
			if (computeUndoRedo) {
				const index = this._cells.indexOf(cell);
				this._operationManager.pushEditOperation(new CellMetadataEdit(this.uri, index, Object.freeze(cell.metadata), Object.freeze(metadata), {
					updateCellMetadata: (index, newMetadata) => {
						const cell = this._cells[index];
						if (!cell) {
							return;
						}
						this._changeCellMetadata(cell, newMetadata, false, beginSelectionState, undoRedoGroup);
					}
				}), beginSelectionState, undefined, this._alternativeVersionId, undoRedoGroup);
			}
		}

		// should be deferred
		cell.metadata = metadata;
		this._pauseableEmitter.fire({
			rawEvents: [{ kind: NotebookCellsChangeType.ChangeCellMetadata, index: this._cells.indexOf(cell), metadata: cell.metadata, transient: !triggerDirtyChange }],
			versionId: this.versionId,
			synchronous: true,
			endSelectionState: undefined
		});
	}

	private _changeCellInternalMetadataPartial(cell: NotebookCellTextModel, internalMetadata: NullablePartialNotebookCellInternalMetadata) {
		const newInternalMetadata: NotebookCellInternalMetadata = {
			...cell.internalMetadata
		};
		let k: keyof NotebookCellInternalMetadata;
		for (k in internalMetadata) {
			const value = internalMetadata[k] ?? undefined;
			newInternalMetadata[k] = value as any;
		}

		cell.internalMetadata = newInternalMetadata;
		this._pauseableEmitter.fire({
			rawEvents: [{ kind: NotebookCellsChangeType.ChangeCellInternalMetadata, index: this._cells.indexOf(cell), internalMetadata: cell.internalMetadata, transient: true }],
			versionId: this.versionId,
			synchronous: true,
			endSelectionState: undefined
		});
	}

	private _changeCellLanguage(cell: NotebookCellTextModel, languageId: string, computeUndoRedo: boolean, beginSelectionState: ISelectionState | undefined, undoRedoGroup: UndoRedoGroup | undefined) {
		if (cell.language === languageId) {
			return;
		}

		const oldLanguage = cell.language;
		cell.language = languageId;

		if (computeUndoRedo) {
			const that = this;
			this._operationManager.pushEditOperation(new class implements IResourceUndoRedoElement {
				readonly type: UndoRedoElementType.Resource = UndoRedoElementType.Resource;
				get resource() {
					return that.uri;
				}
				readonly label = 'Update Cell Language';
				readonly code = 'undoredo.textBufferEdit';
				undo() {
					that._changeCellLanguage(cell, oldLanguage, false, beginSelectionState, undoRedoGroup);
				}
				redo() {
					that._changeCellLanguage(cell, languageId, false, beginSelectionState, undoRedoGroup);
				}
			}(), beginSelectionState, undefined, this._alternativeVersionId, undoRedoGroup);
		}

		this._pauseableEmitter.fire({
			rawEvents: [{ kind: NotebookCellsChangeType.ChangeCellLanguage, index: this._cells.indexOf(cell), language: languageId, transient: false }],
			versionId: this.versionId,
			synchronous: true,
			endSelectionState: undefined
		});
	}

	private _spliceNotebookCellOutputs2(cell: NotebookCellTextModel, outputs: IOutputDto[], computeUndoRedo: boolean): void {
		if (outputs.length === 0 && cell.outputs.length === 0) {
			return;
		}

		if (outputs.length <= 1) {
			this._spliceNotebookCellOutputs(cell, { start: 0, deleteCount: cell.outputs.length, newOutputs: outputs.map(op => new NotebookCellOutputTextModel(op)) }, false, computeUndoRedo);
			return;
		}

		const diff = new LcsDiff(new OutputSequence(cell.outputs), new OutputSequence(outputs));
		const diffResult = diff.ComputeDiff(false);
		const splices: NotebookCellOutputsSplice[] = diffResult.changes.map(change => ({
			start: change.originalStart,
			deleteCount: change.originalLength,
			// create cell output text model only when it's inserted into the notebook document
			newOutputs: outputs.slice(change.modifiedStart, change.modifiedStart + change.modifiedLength).map(op => new NotebookCellOutputTextModel(op))
		}));
		splices.reverse().forEach(splice => {
			this._spliceNotebookCellOutputs(cell, splice, false, computeUndoRedo);
		});
	}

	private _spliceNotebookCellOutputs(cell: NotebookCellTextModel, splice: NotebookCellOutputsSplice, append: boolean, computeUndoRedo: boolean): void {
		cell.spliceNotebookCellOutputs(splice);
		this._pauseableEmitter.fire({
			rawEvents: [{
				kind: NotebookCellsChangeType.Output,
				index: this._cells.indexOf(cell),
				outputs: cell.outputs.map(output => output.asDto()) ?? [],
				append,
				transient: this.transientOptions.transientOutputs,
			}],
			versionId: this.versionId,
			synchronous: true,
			endSelectionState: undefined
		});
	}

	private _appendNotebookCellOutputItems(cell: NotebookCellTextModel, outputId: string, items: IOutputItemDto[]) {
		if (cell.changeOutputItems(outputId, true, items)) {
			this._pauseableEmitter.fire({
				rawEvents: [{
					kind: NotebookCellsChangeType.OutputItem,
					index: this._cells.indexOf(cell),
					outputId: outputId,
					outputItems: items,
					append: true,
					transient: this.transientOptions.transientOutputs

				}],
				versionId: this.versionId,
				synchronous: true,
				endSelectionState: undefined
			});
		}
	}

	private _replaceNotebookCellOutputItems(cell: NotebookCellTextModel, outputId: string, items: IOutputItemDto[]) {
		if (cell.changeOutputItems(outputId, false, items)) {
			this._pauseableEmitter.fire({
				rawEvents: [{
					kind: NotebookCellsChangeType.OutputItem,
					index: this._cells.indexOf(cell),
					outputId: outputId,
					outputItems: items,
					append: false,
					transient: this.transientOptions.transientOutputs

				}],
				versionId: this.versionId,
				synchronous: true,
				endSelectionState: undefined
			});
		}
	}

	private _moveCellToIdx(index: number, length: number, newIdx: number, synchronous: boolean, pushedToUndoStack: boolean, beforeSelections: ISelectionState | undefined, endSelections: ISelectionState | undefined, undoRedoGroup: UndoRedoGroup | undefined): boolean {
		if (pushedToUndoStack) {
			this._operationManager.pushEditOperation(new MoveCellEdit(this.uri, index, length, newIdx, {
				moveCell: (fromIndex: number, length: number, toIndex: number, beforeSelections: ISelectionState | undefined, endSelections: ISelectionState | undefined) => {
					this._moveCellToIdx(fromIndex, length, toIndex, true, false, beforeSelections, endSelections, undoRedoGroup);
				},
			}, beforeSelections, endSelections), beforeSelections, endSelections, this._alternativeVersionId, undoRedoGroup);
		}

		this._assertIndex(index);
		this._assertIndex(newIdx);

		const cells = this._cells.splice(index, length);
		this._cells.splice(newIdx, 0, ...cells);
		this._pauseableEmitter.fire({
			rawEvents: [{ kind: NotebookCellsChangeType.Move, index, length, newIdx, cells, transient: false }],
			versionId: this.versionId,
			synchronous: synchronous,
			endSelectionState: endSelections
		});

		return true;
	}

	private _assertIndex(index: number) {
		if (this._indexIsInvalid(index)) {
			throw new Error(`model index out of range ${index}`);
		}
	}

	private _indexIsInvalid(index: number): boolean {
		return index < 0 || index >= this._cells.length;
	}
}

class OutputSequence implements ISequence {
	constructor(readonly outputs: IOutputDto[]) {
	}

	getElements(): Int32Array | number[] | string[] {
		return this.outputs.map(output => {
			return hash(output.outputs.map(output => ({
				mime: output.mime,
				data: output.data
			})));
		});
	}

}
