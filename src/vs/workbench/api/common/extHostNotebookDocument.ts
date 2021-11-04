/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { deepFreeze, equals } from 'vs/base/common/objects';
import { URI } from 'vs/base/common/uri';
import * as extHostProtocol from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostDocuments } from 'vs/workbench/api/common/extHostDocuments';
import { ExtHostDocumentsAndEditors, IExtHostModelAddedData } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import * as extHostTypeConverters from 'vs/workbench/api/common/extHostTypeConverters';
import * as extHostTypes from 'vs/workbench/api/common/extHostTypes';
import * as notebookCommon from 'vs/workbench/contrib/notebook/common/notebookCommon';
import * as vscode from 'vscode';

class RawContentChangeEvent {

	constructor(readonly start: number, readonly deletedCount: number, readonly deletedItems: vscode.NotebookCell[], readonly items: ExtHostCell[]) { }

	static asApiEvents(events: RawContentChangeEvent[]): readonly vscode.NotebookCellsChangeData[] {
		return events.map(event => {
			return {
				start: event.start,
				deletedCount: event.deletedCount,
				deletedItems: event.deletedItems,
				items: event.items.map(data => data.apiCell)
			};
		});
	}
}

export class ExtHostCell {

	static asModelAddData(notebook: vscode.NotebookDocument, cell: extHostProtocol.NotebookCellDto): IExtHostModelAddedData {
		return {
			EOL: cell.eol,
			lines: cell.source,
			languageId: cell.language,
			uri: cell.uri,
			isDirty: false,
			versionId: 1,
			notebook
		};
	}

	private _outputs: vscode.NotebookCellOutput[];
	private _metadata: Readonly<notebookCommon.NotebookCellMetadata>;
	private _previousResult: Readonly<vscode.NotebookCellExecutionSummary | undefined>;

	private _internalMetadata: notebookCommon.NotebookCellInternalMetadata;
	readonly handle: number;
	readonly uri: URI;
	readonly cellKind: notebookCommon.CellKind;

	private _apiCell: vscode.NotebookCell | undefined;
	private _mime: string | undefined;

	constructor(
		readonly notebook: ExtHostNotebookDocument,
		private readonly _extHostDocument: ExtHostDocumentsAndEditors,
		private readonly _cellData: extHostProtocol.NotebookCellDto,
	) {
		this.handle = _cellData.handle;
		this.uri = URI.revive(_cellData.uri);
		this.cellKind = _cellData.cellKind;
		this._outputs = _cellData.outputs.map(extHostTypeConverters.NotebookCellOutput.to);
		this._internalMetadata = _cellData.internalMetadata ?? {};
		this._metadata = Object.freeze(_cellData.metadata ?? {});
		this._previousResult = Object.freeze(extHostTypeConverters.NotebookCellExecutionSummary.to(_cellData.internalMetadata ?? {}));
	}

	get internalMetadata(): notebookCommon.NotebookCellInternalMetadata {
		return this._internalMetadata;
	}

	get apiCell(): vscode.NotebookCell {
		if (!this._apiCell) {
			const that = this;
			const data = this._extHostDocument.getDocument(this.uri);
			if (!data) {
				throw new Error(`MISSING extHostDocument for notebook cell: ${this.uri}`);
			}
			this._apiCell = Object.freeze<vscode.NotebookCell>({
				get index() { return that.notebook.getCellIndex(that); },
				notebook: that.notebook.apiNotebook,
				kind: extHostTypeConverters.NotebookCellKind.to(this._cellData.cellKind),
				document: data.document,
				get mime() { return that._mime; },
				set mime(value: string | undefined) { that._mime = value; },
				get outputs() { return that._outputs.slice(0); },
				get metadata() { return that._metadata; },
				get executionSummary() { return that._previousResult; }
			});
		}
		return this._apiCell;
	}

	setOutputs(newOutputs: extHostProtocol.NotebookOutputDto[]): void {
		this._outputs = newOutputs.map(extHostTypeConverters.NotebookCellOutput.to);
	}

	setOutputItems(outputId: string, append: boolean, newOutputItems: extHostProtocol.NotebookOutputItemDto[]) {
		const newItems = newOutputItems.map(extHostTypeConverters.NotebookCellOutputItem.to);
		const output = this._outputs.find(op => op.id === outputId);
		if (output) {
			if (!append) {
				output.items.length = 0;
			}
			output.items.push(...newItems);
		}
	}

	setMetadata(newMetadata: notebookCommon.NotebookCellMetadata): void {
		this._metadata = Object.freeze(newMetadata);
	}

	setInternalMetadata(newInternalMetadata: notebookCommon.NotebookCellInternalMetadata): void {
		this._internalMetadata = newInternalMetadata;
		this._previousResult = Object.freeze(extHostTypeConverters.NotebookCellExecutionSummary.to(newInternalMetadata));
	}

	setMime(newMime: string | undefined) {

	}
}

export interface INotebookEventEmitter {
	emitModelChange(events: vscode.NotebookCellsChangeEvent): void;
	emitCellOutputsChange(event: vscode.NotebookCellOutputsChangeEvent): void;
	emitCellMetadataChange(event: vscode.NotebookCellMetadataChangeEvent): void;
	emitCellExecutionStateChange(event: vscode.NotebookCellExecutionStateChangeEvent): void;
}


export class ExtHostNotebookDocument {

	private static _handlePool: number = 0;
	readonly handle = ExtHostNotebookDocument._handlePool++;

	private readonly _cells: ExtHostCell[] = [];

	private readonly _notebookType: string;

	private _notebook: vscode.NotebookDocument | undefined;
	private _metadata: Record<string, any>;
	private _versionId: number = 0;
	private _isDirty: boolean = false;
	private _backup?: vscode.NotebookDocumentBackup;
	private _disposed: boolean = false;

	constructor(
		private readonly _proxy: extHostProtocol.MainThreadNotebookDocumentsShape,
		private readonly _textDocumentsAndEditors: ExtHostDocumentsAndEditors,
		private readonly _textDocuments: ExtHostDocuments,
		private readonly _emitter: INotebookEventEmitter,
		readonly uri: URI,
		data: extHostProtocol.INotebookModelAddedData
	) {
		this._notebookType = data.viewType;
		this._metadata = Object.freeze(data.metadata ?? Object.create(null));
		this._spliceNotebookCells([[0, 0, data.cells]], true /* init -> no event*/);
		this._versionId = data.versionId;
	}

	dispose() {
		this._disposed = true;
	}

	get apiNotebook(): vscode.NotebookDocument {
		if (!this._notebook) {
			const that = this;
			this._notebook = {
				get uri() { return that.uri; },
				get version() { return that._versionId; },
				get notebookType() { return that._notebookType; },
				get isDirty() { return that._isDirty; },
				get isUntitled() { return that.uri.scheme === Schemas.untitled; },
				get isClosed() { return that._disposed; },
				get metadata() { return that._metadata; },
				get cellCount() { return that._cells.length; },
				cellAt(index) {
					index = that._validateIndex(index);
					return that._cells[index].apiCell;
				},
				getCells(range) {
					const cells = range ? that._getCells(range) : that._cells;
					return cells.map(cell => cell.apiCell);
				},
				save() {
					return that._save();
				}
			};
		}
		return this._notebook;
	}

	updateBackup(backup: vscode.NotebookDocumentBackup): void {
		this._backup?.delete();
		this._backup = backup;
	}

	disposeBackup(): void {
		this._backup?.delete();
		this._backup = undefined;
	}

	acceptDocumentPropertiesChanged(data: extHostProtocol.INotebookDocumentPropertiesChangeData) {
		if (data.metadata) {
			this._metadata = Object.freeze({ ...this._metadata, ...data.metadata });
		}
	}

	acceptDirty(isDirty: boolean): void {
		this._isDirty = isDirty;
	}

	acceptModelChanged(event: extHostProtocol.NotebookCellsChangedEventDto, isDirty: boolean): void {
		this._versionId = event.versionId;
		this._isDirty = isDirty;

		for (const rawEvent of event.rawEvents) {
			if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ModelChange) {
				this._spliceNotebookCells(rawEvent.changes, false);
			} else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.Move) {
				this._moveCell(rawEvent.index, rawEvent.newIdx);
			} else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.Output) {
				this._setCellOutputs(rawEvent.index, rawEvent.outputs);
			} else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.OutputItem) {
				this._setCellOutputItems(rawEvent.index, rawEvent.outputId, rawEvent.append, rawEvent.outputItems);
			} else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeLanguage) {
				this._changeCellLanguage(rawEvent.index, rawEvent.language);
			} else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellMime) {
				this._changeCellMime(rawEvent.index, rawEvent.mime);
			} else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellMetadata) {
				this._changeCellMetadata(rawEvent.index, rawEvent.metadata);
			} else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellInternalMetadata) {
				this._changeCellInternalMetadata(rawEvent.index, rawEvent.internalMetadata);
			}
		}
	}

	private _validateIndex(index: number): number {
		index = index | 0;
		if (index < 0) {
			return 0;
		} else if (index >= this._cells.length) {
			return this._cells.length - 1;
		} else {
			return index;
		}
	}

	private _validateRange(range: vscode.NotebookRange): vscode.NotebookRange {
		let start = range.start | 0;
		let end = range.end | 0;
		if (start < 0) {
			start = 0;
		}
		if (end > this._cells.length) {
			end = this._cells.length;
		}
		return range.with({ start, end });
	}

	private _getCells(range: vscode.NotebookRange): ExtHostCell[] {
		range = this._validateRange(range);
		const result: ExtHostCell[] = [];
		for (let i = range.start; i < range.end; i++) {
			result.push(this._cells[i]);
		}
		return result;
	}

	private async _save(): Promise<boolean> {
		if (this._disposed) {
			return Promise.reject(new Error('Notebook has been closed'));
		}
		return this._proxy.$trySaveNotebook(this.uri);
	}

	private _spliceNotebookCells(splices: notebookCommon.NotebookCellTextModelSplice<extHostProtocol.NotebookCellDto>[], initialization: boolean): void {
		if (this._disposed) {
			return;
		}

		const contentChangeEvents: RawContentChangeEvent[] = [];
		const addedCellDocuments: IExtHostModelAddedData[] = [];
		const removedCellDocuments: URI[] = [];

		splices.reverse().forEach(splice => {
			const cellDtos = splice[2];
			const newCells = cellDtos.map(cell => {

				const extCell = new ExtHostCell(this, this._textDocumentsAndEditors, cell);
				if (!initialization) {
					addedCellDocuments.push(ExtHostCell.asModelAddData(this.apiNotebook, cell));
				}
				return extCell;
			});

			const changeEvent = new RawContentChangeEvent(splice[0], splice[1], [], newCells);
			const deletedItems = this._cells.splice(splice[0], splice[1], ...newCells);
			for (const cell of deletedItems) {
				removedCellDocuments.push(cell.uri);
				changeEvent.deletedItems.push(cell.apiCell);
			}

			contentChangeEvents.push(changeEvent);
		});

		this._textDocumentsAndEditors.acceptDocumentsAndEditorsDelta({
			addedDocuments: addedCellDocuments,
			removedDocuments: removedCellDocuments
		});

		if (!initialization) {
			this._emitter.emitModelChange(deepFreeze({
				document: this.apiNotebook,
				changes: RawContentChangeEvent.asApiEvents(contentChangeEvents)
			}));
		}
	}

	private _moveCell(index: number, newIdx: number): void {
		const cells = this._cells.splice(index, 1);
		this._cells.splice(newIdx, 0, ...cells);
		const changes = [
			new RawContentChangeEvent(index, 1, cells.map(c => c.apiCell), []),
			new RawContentChangeEvent(newIdx, 0, [], cells)
		];
		this._emitter.emitModelChange(deepFreeze({
			document: this.apiNotebook,
			changes: RawContentChangeEvent.asApiEvents(changes)
		}));
	}

	private _setCellOutputs(index: number, outputs: extHostProtocol.NotebookOutputDto[]): void {
		const cell = this._cells[index];
		cell.setOutputs(outputs);
		this._emitter.emitCellOutputsChange(deepFreeze({ document: this.apiNotebook, cells: [cell.apiCell] }));
	}

	private _setCellOutputItems(index: number, outputId: string, append: boolean, outputItems: extHostProtocol.NotebookOutputItemDto[]): void {
		const cell = this._cells[index];
		cell.setOutputItems(outputId, append, outputItems);
		this._emitter.emitCellOutputsChange(deepFreeze({ document: this.apiNotebook, cells: [cell.apiCell] }));
	}

	private _changeCellLanguage(index: number, newModeId: string): void {
		const cell = this._cells[index];
		if (cell.apiCell.document.languageId !== newModeId) {
			this._textDocuments.$acceptModelModeChanged(cell.uri, newModeId);
		}
	}

	private _changeCellMime(index: number, newMime: string | undefined): void {
		const cell = this._cells[index];
		cell.apiCell.mime = newMime;
	}

	private _changeCellMetadata(index: number, newMetadata: notebookCommon.NotebookCellMetadata): void {
		const cell = this._cells[index];

		const originalExtMetadata = cell.apiCell.metadata;
		cell.setMetadata(newMetadata);
		const newExtMetadata = cell.apiCell.metadata;

		if (!equals(originalExtMetadata, newExtMetadata)) {
			this._emitter.emitCellMetadataChange(deepFreeze({ document: this.apiNotebook, cell: cell.apiCell }));
		}
	}

	private _changeCellInternalMetadata(index: number, newInternalMetadata: notebookCommon.NotebookCellInternalMetadata): void {
		const cell = this._cells[index];

		const originalInternalMetadata = cell.internalMetadata;
		cell.setInternalMetadata(newInternalMetadata);

		if (originalInternalMetadata.runState !== newInternalMetadata.runState) {
			const executionState = newInternalMetadata.runState ?? extHostTypes.NotebookCellExecutionState.Idle;
			this._emitter.emitCellExecutionStateChange(deepFreeze({ document: this.apiNotebook, cell: cell.apiCell, state: executionState }));
		}
	}

	getCellFromApiCell(apiCell: vscode.NotebookCell): ExtHostCell | undefined {
		return this._cells.find(cell => cell.apiCell === apiCell);
	}

	getCellFromIndex(index: number): ExtHostCell | undefined {
		return this._cells[index];
	}

	getCell(cellHandle: number): ExtHostCell | undefined {
		return this._cells.find(cell => cell.handle === cellHandle);
	}

	getCellIndex(cell: ExtHostCell): number {
		return this._cells.indexOf(cell);
	}
}
