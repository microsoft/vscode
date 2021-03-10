/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, dispose } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { deepFreeze } from 'vs/base/common/objects';
import { URI } from 'vs/base/common/uri';
import { CellKind, INotebookDocumentPropertiesChangeData, MainThreadNotebookShape } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostDocuments } from 'vs/workbench/api/common/extHostDocuments';
import { ExtHostDocumentsAndEditors, IExtHostModelAddedData } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import * as extHostTypeConverters from 'vs/workbench/api/common/extHostTypeConverters';
import * as extHostTypes from 'vs/workbench/api/common/extHostTypes';
import { IMainCellDto, IOutputDto, IOutputItemDto, NotebookCellMetadata, NotebookCellsChangedEventDto, NotebookCellsChangeType, NotebookCellsSplice2 } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import * as vscode from 'vscode';

class RawContentChangeEvent {

	constructor(readonly start: number, readonly deletedCount: number, readonly deletedItems: vscode.NotebookCell[], readonly items: ExtHostCell[]) { }

	static asApiEvents(events: RawContentChangeEvent[]): readonly vscode.NotebookCellsChangeData[] {
		return events.map(event => {
			return {
				start: event.start,
				deletedCount: event.deletedCount,
				deletedItems: event.deletedItems,
				items: event.items.map(data => data.cell)
			};
		});
	}
}

export class ExtHostCell {

	static asModelAddData(notebook: vscode.NotebookDocument, cell: IMainCellDto): IExtHostModelAddedData {
		return {
			EOL: cell.eol,
			lines: cell.source,
			modeId: cell.language,
			uri: cell.uri,
			isDirty: false,
			versionId: 1,
			notebook
		};
	}

	private _onDidDispose = new Emitter<void>();
	readonly onDidDispose: Event<void> = this._onDidDispose.event;

	private _outputs: extHostTypes.NotebookCellOutput[];
	private _metadata: extHostTypes.NotebookCellMetadata;

	private _internalMetadata: NotebookCellMetadata;
	readonly handle: number;
	readonly uri: URI;
	readonly cellKind: CellKind;

	private _cell: vscode.NotebookCell | undefined;

	constructor(
		private readonly _notebook: ExtHostNotebookDocument,
		private readonly _extHostDocument: ExtHostDocumentsAndEditors,
		private readonly _cellData: IMainCellDto,
	) {
		this.handle = _cellData.handle;
		this.uri = URI.revive(_cellData.uri);
		this.cellKind = _cellData.cellKind;
		this._outputs = _cellData.outputs.map(extHostTypeConverters.NotebookCellOutput.to);
		this._internalMetadata = _cellData.metadata ?? {};
		this._metadata = extHostTypeConverters.NotebookCellMetadata.to(this._internalMetadata);
	}

	dispose() {
		this._onDidDispose.fire();
		this._onDidDispose.dispose();
	}

	get internalMetadata(): NotebookCellMetadata {
		return this._internalMetadata;
	}

	get cell(): vscode.NotebookCell {
		if (!this._cell) {
			const that = this;
			const data = this._extHostDocument.getDocument(this.uri);
			if (!data) {
				throw new Error(`MISSING extHostDocument for notebook cell: ${this.uri}`);
			}
			this._cell = Object.freeze<vscode.NotebookCell>({
				get index() { return that._notebook.getCellIndex(that); },
				notebook: that._notebook.notebookDocument,
				kind: extHostTypeConverters.NotebookCellKind.to(this._cellData.cellKind),
				document: data.document,
				get outputs() { return that._outputs.slice(0); },
				get metadata() { return that._metadata; },
				get previousResult() { return {}; }
			});
		}
		return this._cell;
	}

	setOutputs(newOutputs: IOutputDto[]): void {
		this._outputs = newOutputs.map(extHostTypeConverters.NotebookCellOutput.to);
	}

	setOutputItems(outputId: string, append: boolean, newOutputItems: IOutputItemDto[]) {
		const newItems = newOutputItems.map(extHostTypeConverters.NotebookCellOutputItem.to);
		const output = this._outputs.find(op => op.id === outputId);
		if (output) {
			if (!append) {
				output.outputs.length = 0;
			}
			output.outputs.push(...newItems);
		}
	}

	setMetadata(newMetadata: NotebookCellMetadata): void {
		this._internalMetadata = newMetadata;
		this._metadata = extHostTypeConverters.NotebookCellMetadata.to(newMetadata);
	}
}

export interface INotebookEventEmitter {
	emitModelChange(events: vscode.NotebookCellsChangeEvent): void;
	emitCellOutputsChange(event: vscode.NotebookCellOutputsChangeEvent): void;
	emitCellMetadataChange(event: vscode.NotebookCellMetadataChangeEvent): void;
}


export class ExtHostNotebookDocument extends Disposable {

	private static _handlePool: number = 0;
	readonly handle = ExtHostNotebookDocument._handlePool++;

	private _cells: ExtHostCell[] = [];

	private _cellDisposableMapping = new Map<number, DisposableStore>();

	private _notebook: vscode.NotebookDocument | undefined;
	private _versionId: number = 0;
	private _isDirty: boolean = false;
	private _backup?: vscode.NotebookDocumentBackup;
	private _disposed: boolean = false;

	constructor(
		private readonly _proxy: MainThreadNotebookShape,
		private readonly _textDocumentsAndEditors: ExtHostDocumentsAndEditors,
		private readonly _textDocuments: ExtHostDocuments,
		private readonly _emitter: INotebookEventEmitter,
		private readonly _viewType: string,
		private _metadata: extHostTypes.NotebookDocumentMetadata,
		readonly uri: URI,
	) {
		super();
	}

	dispose() {
		this._disposed = true;
		super.dispose();
		dispose(this._cellDisposableMapping.values());
	}


	get notebookDocument(): vscode.NotebookDocument {
		if (!this._notebook) {
			const that = this;
			this._notebook = Object.freeze({
				get uri() { return that.uri; },
				get version() { return that._versionId; },
				get fileName() { return that.uri.fsPath; },
				get viewType() { return that._viewType; },
				get isDirty() { return that._isDirty; },
				get isUntitled() { return that.uri.scheme === Schemas.untitled; },
				get cells(): ReadonlyArray<vscode.NotebookCell> { return that._cells.map(cell => cell.cell); },
				get metadata() { return that._metadata; },
				set metadata(_value: Required<vscode.NotebookDocumentMetadata>) { throw new Error('Use WorkspaceEdit to update metadata.'); },
				save() { return that._save(); }
			});
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

	acceptDocumentPropertiesChanged(data: INotebookDocumentPropertiesChangeData) {
		if (data.metadata) {
			this._metadata = this._metadata.with(data.metadata);
		}
	}

	acceptModelChanged(event: NotebookCellsChangedEventDto, isDirty: boolean): void {
		this._versionId = event.versionId;
		this._isDirty = isDirty;

		for (const rawEvent of event.rawEvents) {
			if (rawEvent.kind === NotebookCellsChangeType.Initialize) {
				this._spliceNotebookCells(rawEvent.changes, true);
			} if (rawEvent.kind === NotebookCellsChangeType.ModelChange) {
				this._spliceNotebookCells(rawEvent.changes, false);
			} else if (rawEvent.kind === NotebookCellsChangeType.Move) {
				this._moveCell(rawEvent.index, rawEvent.newIdx);
			} else if (rawEvent.kind === NotebookCellsChangeType.Output) {
				this._setCellOutputs(rawEvent.index, rawEvent.outputs);
			} else if (rawEvent.kind === NotebookCellsChangeType.OutputItem) {
				this._setCellOutputItems(rawEvent.index, rawEvent.outputId, rawEvent.append, rawEvent.outputItems);
			} else if (rawEvent.kind === NotebookCellsChangeType.ChangeLanguage) {
				this._changeCellLanguage(rawEvent.index, rawEvent.language);
			} else if (rawEvent.kind === NotebookCellsChangeType.ChangeCellMetadata) {
				this._changeCellMetadata(rawEvent.index, rawEvent.metadata);
			}
		}
	}

	private async _save(): Promise<boolean> {
		if (this._disposed) {
			return Promise.reject(new Error('Notebook has been closed'));
		}
		return this._proxy.$trySaveDocument(this.uri);
	}

	private _spliceNotebookCells(splices: NotebookCellsSplice2[], initialization: boolean): void {
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
					addedCellDocuments.push(ExtHostCell.asModelAddData(this.notebookDocument, cell));
				}

				if (!this._cellDisposableMapping.has(extCell.handle)) {
					const store = new DisposableStore();
					store.add(extCell);
					this._cellDisposableMapping.set(extCell.handle, store);
				}

				return extCell;
			});

			for (let j = splice[0]; j < splice[0] + splice[1]; j++) {
				this._cellDisposableMapping.get(this._cells[j].handle)?.dispose();
				this._cellDisposableMapping.delete(this._cells[j].handle);
			}

			const changeEvent = new RawContentChangeEvent(splice[0], splice[1], [], newCells);
			const deletedItems = this._cells.splice(splice[0], splice[1], ...newCells);
			for (let cell of deletedItems) {
				removedCellDocuments.push(cell.uri);
				changeEvent.deletedItems.push(cell.cell);
			}

			contentChangeEvents.push(changeEvent);
		});

		this._textDocumentsAndEditors.acceptDocumentsAndEditorsDelta({
			addedDocuments: addedCellDocuments,
			removedDocuments: removedCellDocuments
		});

		if (!initialization) {
			this._emitter.emitModelChange(deepFreeze({
				document: this.notebookDocument,
				changes: RawContentChangeEvent.asApiEvents(contentChangeEvents)
			}));
		}
	}

	private _moveCell(index: number, newIdx: number): void {
		const cells = this._cells.splice(index, 1);
		this._cells.splice(newIdx, 0, ...cells);
		const changes = [
			new RawContentChangeEvent(index, 1, cells.map(c => c.cell), []),
			new RawContentChangeEvent(newIdx, 0, [], cells)
		];
		this._emitter.emitModelChange(deepFreeze({
			document: this.notebookDocument,
			changes: RawContentChangeEvent.asApiEvents(changes)
		}));
	}

	private _setCellOutputs(index: number, outputs: IOutputDto[]): void {
		const cell = this._cells[index];
		cell.setOutputs(outputs);
		this._emitter.emitCellOutputsChange(deepFreeze({ document: this.notebookDocument, cells: [cell.cell] }));
	}

	private _setCellOutputItems(index: number, outputId: string, append: boolean, outputItems: IOutputItemDto[]): void {
		const cell = this._cells[index];
		cell.setOutputItems(outputId, append, outputItems);
		this._emitter.emitCellOutputsChange(deepFreeze({ document: this.notebookDocument, cells: [cell.cell] }));
	}

	private _changeCellLanguage(index: number, newModeId: string): void {
		const cell = this._cells[index];
		if (cell.cell.document.languageId !== newModeId) {
			this._textDocuments.$acceptModelModeChanged(cell.uri, newModeId);
		}
	}

	private _changeCellMetadata(index: number, newMetadata: NotebookCellMetadata | undefined): void {
		const cell = this._cells[index];
		cell.setMetadata(newMetadata || {});
		this._emitter.emitCellMetadataChange(deepFreeze({ document: this.notebookDocument, cell: cell.cell }));
	}

	getCellFromIndex(index: number): ExtHostCell | undefined {
		return this._cells[index];
	}

	getCell(cellHandle: number): ExtHostCell | undefined {
		return this._cells.find(cell => cell.handle === cellHandle);
	}

	getCellByIndex(index: number): ExtHostCell | undefined {
		return this._cells[index];
	}

	getCellIndex(cell: ExtHostCell): number {
		return this._cells.indexOf(cell);
	}
}
