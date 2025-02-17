/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import * as extHostProtocol from './extHost.protocol.js';
import { ExtHostDocuments } from './extHostDocuments.js';
import { ExtHostDocumentsAndEditors } from './extHostDocumentsAndEditors.js';
import * as extHostTypeConverters from './extHostTypeConverters.js';
import { NotebookRange } from './extHostTypes.js';
import * as notebookCommon from '../../contrib/notebook/common/notebookCommon.js';
import * as vscode from 'vscode';

class RawContentChangeEvent {

	constructor(
		readonly start: number,
		readonly deletedCount: number,
		readonly deletedItems: vscode.NotebookCell[],
		readonly items: ExtHostCell[]
	) { }

	asApiEvent(): vscode.NotebookDocumentContentChange {
		return {
			range: new NotebookRange(this.start, this.start + this.deletedCount),
			addedCells: this.items.map(cell => cell.apiCell),
			removedCells: this.deletedItems,
		};
	}
}

export class ExtHostCell {

	static asModelAddData(cell: extHostProtocol.NotebookCellDto): extHostProtocol.IModelAddedData {
		return {
			EOL: cell.eol,
			lines: cell.source,
			languageId: cell.language,
			uri: cell.uri,
			isDirty: false,
			versionId: 1,
			encoding: 'utf8'
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
			const apiCell: vscode.NotebookCell = {
				get index() { return that.notebook.getCellIndex(that); },
				notebook: that.notebook.apiNotebook,
				kind: extHostTypeConverters.NotebookCellKind.to(this._cellData.cellKind),
				document: data.document,
				get mime() { return that._mime; },
				set mime(value: string | undefined) { that._mime = value; },
				get outputs() { return that._outputs.slice(0); },
				get metadata() { return that._metadata; },
				get executionSummary() { return that._previousResult; }
			};
			this._apiCell = Object.freeze(apiCell);
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

			if (output.items.length > 1 && output.items.every(item => notebookCommon.isTextStreamMime(item.mime))) {
				// Look for the mimes in the items, and keep track of their order.
				// Merge the streams into one output item, per mime type.
				const mimeOutputs = new Map<string, Uint8Array[]>();
				const mimeTypes: string[] = [];
				output.items.forEach(item => {
					let items: Uint8Array[];
					if (mimeOutputs.has(item.mime)) {
						items = mimeOutputs.get(item.mime)!;
					} else {
						items = [];
						mimeOutputs.set(item.mime, items);
						mimeTypes.push(item.mime);
					}
					items.push(item.data);
				});
				output.items.length = 0;
				mimeTypes.forEach(mime => {
					const compressed = notebookCommon.compressOutputItemStreams(mimeOutputs.get(mime)!);
					output.items.push({
						mime,
						data: compressed.data.buffer
					});
				});
			}
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


export class ExtHostNotebookDocument {

	private static _handlePool: number = 0;
	readonly handle = ExtHostNotebookDocument._handlePool++;

	private readonly _cells: ExtHostCell[] = [];

	private readonly _notebookType: string;

	private _notebook: vscode.NotebookDocument | undefined;
	private _metadata: Record<string, any>;
	private _versionId: number = 0;
	private _isDirty: boolean = false;
	private _disposed: boolean = false;

	constructor(
		private readonly _proxy: extHostProtocol.MainThreadNotebookDocumentsShape,
		private readonly _textDocumentsAndEditors: ExtHostDocumentsAndEditors,
		private readonly _textDocuments: ExtHostDocuments,
		readonly uri: URI,
		data: extHostProtocol.INotebookModelAddedData
	) {
		this._notebookType = data.viewType;
		this._metadata = Object.freeze(data.metadata ?? Object.create(null));
		this._spliceNotebookCells([[0, 0, data.cells]], true /* init -> no event*/, undefined);
		this._versionId = data.versionId;
	}

	dispose() {
		this._disposed = true;
	}

	get versionId(): number {
		return this._versionId;
	}

	get apiNotebook(): vscode.NotebookDocument {
		if (!this._notebook) {
			const that = this;
			const apiObject: vscode.NotebookDocument = {
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
				},
				[Symbol.for('debug.description')]() {
					return `NotebookDocument(${this.uri.toString()})`;
				}
			};
			this._notebook = Object.freeze(apiObject);
		}
		return this._notebook;
	}

	acceptDocumentPropertiesChanged(data: extHostProtocol.INotebookDocumentPropertiesChangeData) {
		if (data.metadata) {
			this._metadata = Object.freeze({ ...this._metadata, ...data.metadata });
		}
	}

	acceptDirty(isDirty: boolean): void {
		this._isDirty = isDirty;
	}

	acceptModelChanged(event: extHostProtocol.NotebookCellsChangedEventDto, isDirty: boolean, newMetadata: notebookCommon.NotebookDocumentMetadata | undefined): vscode.NotebookDocumentChangeEvent {
		this._versionId = event.versionId;
		this._isDirty = isDirty;
		this.acceptDocumentPropertiesChanged({ metadata: newMetadata });

		const result = {
			notebook: this.apiNotebook,
			metadata: newMetadata,
			cellChanges: <vscode.NotebookDocumentCellChange[]>[],
			contentChanges: <vscode.NotebookDocumentContentChange[]>[],
		};

		type RelaxedCellChange = Partial<vscode.NotebookDocumentCellChange> & { cell: vscode.NotebookCell };
		const relaxedCellChanges: RelaxedCellChange[] = [];

		// -- apply change and populate content changes

		for (const rawEvent of event.rawEvents) {
			if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ModelChange) {
				this._spliceNotebookCells(rawEvent.changes, false, result.contentChanges);

			} else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.Move) {
				this._moveCells(rawEvent.index, rawEvent.length, rawEvent.newIdx, result.contentChanges);

			} else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.Output) {
				this._setCellOutputs(rawEvent.index, rawEvent.outputs);
				relaxedCellChanges.push({ cell: this._cells[rawEvent.index].apiCell, outputs: this._cells[rawEvent.index].apiCell.outputs });

			} else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.OutputItem) {
				this._setCellOutputItems(rawEvent.index, rawEvent.outputId, rawEvent.append, rawEvent.outputItems);
				relaxedCellChanges.push({ cell: this._cells[rawEvent.index].apiCell, outputs: this._cells[rawEvent.index].apiCell.outputs });

			} else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellLanguage) {
				this._changeCellLanguage(rawEvent.index, rawEvent.language);
				relaxedCellChanges.push({ cell: this._cells[rawEvent.index].apiCell, document: this._cells[rawEvent.index].apiCell.document });

			} else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellContent) {
				relaxedCellChanges.push({ cell: this._cells[rawEvent.index].apiCell, document: this._cells[rawEvent.index].apiCell.document });

			} else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellMime) {
				this._changeCellMime(rawEvent.index, rawEvent.mime);
			} else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellMetadata) {
				this._changeCellMetadata(rawEvent.index, rawEvent.metadata);
				relaxedCellChanges.push({ cell: this._cells[rawEvent.index].apiCell, metadata: this._cells[rawEvent.index].apiCell.metadata });

			} else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellInternalMetadata) {
				this._changeCellInternalMetadata(rawEvent.index, rawEvent.internalMetadata);
				relaxedCellChanges.push({ cell: this._cells[rawEvent.index].apiCell, executionSummary: this._cells[rawEvent.index].apiCell.executionSummary });
			}
		}

		// -- compact cellChanges

		const map = new Map<vscode.NotebookCell, number>();
		for (let i = 0; i < relaxedCellChanges.length; i++) {
			const relaxedCellChange = relaxedCellChanges[i];
			const existing = map.get(relaxedCellChange.cell);
			if (existing === undefined) {
				const newLen = result.cellChanges.push({
					document: undefined,
					executionSummary: undefined,
					metadata: undefined,
					outputs: undefined,
					...relaxedCellChange,
				});
				map.set(relaxedCellChange.cell, newLen - 1);
			} else {
				result.cellChanges[existing] = {
					...result.cellChanges[existing],
					...relaxedCellChange
				};
			}
		}

		// Freeze event properties so handlers cannot accidentally modify them
		Object.freeze(result);
		Object.freeze(result.cellChanges);
		Object.freeze(result.contentChanges);

		return result;
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

	private _spliceNotebookCells(splices: notebookCommon.NotebookCellTextModelSplice<extHostProtocol.NotebookCellDto>[], initialization: boolean, bucket: vscode.NotebookDocumentContentChange[] | undefined): void {
		if (this._disposed) {
			return;
		}

		const contentChangeEvents: RawContentChangeEvent[] = [];
		const addedCellDocuments: extHostProtocol.IModelAddedData[] = [];
		const removedCellDocuments: URI[] = [];

		splices.reverse().forEach(splice => {
			const cellDtos = splice[2];
			const newCells = cellDtos.map(cell => {

				const extCell = new ExtHostCell(this, this._textDocumentsAndEditors, cell);
				if (!initialization) {
					addedCellDocuments.push(ExtHostCell.asModelAddData(cell));
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

		if (bucket) {
			for (const changeEvent of contentChangeEvents) {
				bucket.push(changeEvent.asApiEvent());
			}
		}
	}

	private _moveCells(index: number, length: number, newIdx: number, bucket: vscode.NotebookDocumentContentChange[]): void {
		const cells = this._cells.splice(index, length);
		this._cells.splice(newIdx, 0, ...cells);
		const changes = [
			new RawContentChangeEvent(index, length, cells.map(c => c.apiCell), []),
			new RawContentChangeEvent(newIdx, 0, [], cells)
		];
		for (const change of changes) {
			bucket.push(change.asApiEvent());
		}
	}

	private _setCellOutputs(index: number, outputs: extHostProtocol.NotebookOutputDto[]): void {
		const cell = this._cells[index];
		cell.setOutputs(outputs);
	}

	private _setCellOutputItems(index: number, outputId: string, append: boolean, outputItems: extHostProtocol.NotebookOutputItemDto[]): void {
		const cell = this._cells[index];
		cell.setOutputItems(outputId, append, outputItems);
	}

	private _changeCellLanguage(index: number, newLanguageId: string): void {
		const cell = this._cells[index];
		if (cell.apiCell.document.languageId !== newLanguageId) {
			this._textDocuments.$acceptModelLanguageChanged(cell.uri, newLanguageId);
		}
	}

	private _changeCellMime(index: number, newMime: string | undefined): void {
		const cell = this._cells[index];
		cell.apiCell.mime = newMime;
	}

	private _changeCellMetadata(index: number, newMetadata: notebookCommon.NotebookCellMetadata): void {
		const cell = this._cells[index];
		cell.setMetadata(newMetadata);
	}

	private _changeCellInternalMetadata(index: number, newInternalMetadata: notebookCommon.NotebookCellInternalMetadata): void {
		const cell = this._cells[index];
		cell.setInternalMetadata(newInternalMetadata);
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
