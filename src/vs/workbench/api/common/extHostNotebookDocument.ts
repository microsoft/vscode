/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { hash } from 'vs/base/common/hash';
import { Disposable, DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { joinPath } from 'vs/base/common/resources';
import { ISplice } from 'vs/base/common/sequence';
import { URI } from 'vs/base/common/uri';
import * as UUID from 'vs/base/common/uuid';
import { CellKind, INotebookDocumentPropertiesChangeData, IWorkspaceCellEditDto, MainThreadBulkEditsShape, MainThreadNotebookShape, NotebookCellOutputsSplice, WorkspaceEditType } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostDocumentsAndEditors, IExtHostModelAddedData } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { CellEditType, CellOutputKind, diff, IMainCellDto, IProcessedOutput, NotebookCellMetadata, NotebookCellsChangedEventDto, NotebookCellsChangeType, NotebookCellsSplice2, notebookDocumentMetadataDefaults } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import * as vscode from 'vscode';
import { Cache } from './cache';


interface IObservable<T> {
	proxy: T;
	onDidChange: Event<void>;
}

function getObservable<T extends Object>(obj: T): IObservable<T> {
	const onDidChange = new Emitter<void>();
	const proxy = new Proxy(obj, {
		set(target: T, p: PropertyKey, value: any, _receiver: any): boolean {
			target[p as keyof T] = value;
			onDidChange.fire();
			return true;
		}
	});

	return {
		proxy,
		onDidChange: onDidChange.event
	};
}

class RawContentChangeEvent {

	constructor(readonly start: number, readonly deletedCount: number, readonly deletedItems: ExtHostCell[], readonly items: ExtHostCell[]) { }

	static asApiEvent(event: RawContentChangeEvent): vscode.NotebookCellsChangeData {
		return Object.freeze({
			start: event.start,
			deletedCount: event.deletedCount,
			deletedItems: event.deletedItems.map(data => data.cell),
			items: event.items.map(data => data.cell)
		});
	}
}

export class ExtHostCell extends Disposable {

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

	private _onDidChangeOutputs = new Emitter<ISplice<IProcessedOutput>[]>();
	readonly onDidChangeOutputs: Event<ISplice<IProcessedOutput>[]> = this._onDidChangeOutputs.event;

	private _outputs: any[];
	private _outputMapping = new WeakMap<vscode.CellOutput, string | undefined /* output ID */>();

	private _metadata: vscode.NotebookCellMetadata;
	private _metadataChangeListener: IDisposable;

	readonly handle: number;
	readonly uri: URI;
	readonly cellKind: CellKind;

	private _cell: vscode.NotebookCell | undefined;

	constructor(
		private readonly _mainThreadBulkEdits: MainThreadBulkEditsShape,
		private readonly _notebook: ExtHostNotebookDocument,
		private readonly _extHostDocument: ExtHostDocumentsAndEditors,
		private readonly _cellData: IMainCellDto,
	) {
		super();

		this.handle = _cellData.handle;
		this.uri = URI.revive(_cellData.uri);
		this.cellKind = _cellData.cellKind;

		this._outputs = _cellData.outputs;
		for (const output of this._outputs) {
			this._outputMapping.set(output, output.outputId);
			delete output.outputId;
		}

		const observableMetadata = getObservable(_cellData.metadata ?? {});
		this._metadata = observableMetadata.proxy;
		this._metadataChangeListener = this._register(observableMetadata.onDidChange(() => {
			this._updateMetadata();
		}));
	}

	get cell(): vscode.NotebookCell {
		if (!this._cell) {
			const that = this;
			const document = this._extHostDocument.getDocument(this.uri)!.document;
			this._cell = Object.freeze({
				get index() { return that._notebook.getCellIndex(that); },
				notebook: that._notebook.notebookDocument,
				uri: that.uri,
				cellKind: this._cellData.cellKind,
				document,
				get language() { return document.languageId; },
				get outputs() { return that._outputs; },
				set outputs(value) { that._updateOutputs(value); },
				get metadata() { return that._metadata; },
				set metadata(value) {
					that.setMetadata(value);
					that._updateMetadata();
				},
			});
		}
		return this._cell;
	}

	dispose() {
		super.dispose();
		this._onDidDispose.fire();
	}

	setOutputs(newOutputs: vscode.CellOutput[]): void {
		this._outputs = newOutputs;
	}

	private _updateOutputs(newOutputs: vscode.CellOutput[]) {
		const rawDiffs = diff<vscode.CellOutput>(this._outputs || [], newOutputs || [], (a) => {
			return this._outputMapping.has(a);
		});

		const transformedDiffs: ISplice<IProcessedOutput>[] = rawDiffs.map(diff => {
			for (let i = diff.start; i < diff.start + diff.deleteCount; i++) {
				this._outputMapping.delete(this._outputs[i]);
			}

			return {
				deleteCount: diff.deleteCount,
				start: diff.start,
				toInsert: diff.toInsert.map((output): IProcessedOutput => {
					if (output.outputKind === CellOutputKind.Rich) {
						const uuid = UUID.generateUuid();
						this._outputMapping.set(output, uuid);
						return { ...output, outputId: uuid };
					}

					this._outputMapping.set(output, undefined);
					return output;
				})
			};
		});

		this._outputs = newOutputs;
		this._onDidChangeOutputs.fire(transformedDiffs);
	}

	setMetadata(newMetadata: vscode.NotebookCellMetadata): void {
		// Don't apply metadata defaults here, 'undefined' means 'inherit from document metadata'
		this._metadataChangeListener.dispose();
		const observableMetadata = getObservable(newMetadata);
		this._metadata = observableMetadata.proxy;
		this._metadataChangeListener = this._register(observableMetadata.onDidChange(() => {
			this._updateMetadata();
		}));
	}

	private _updateMetadata(): Promise<boolean> {
		const index = this._notebook.notebookDocument.cells.indexOf(this.cell);
		const edit: IWorkspaceCellEditDto = {
			_type: WorkspaceEditType.Cell,
			metadata: undefined,
			resource: this._notebook.uri,
			notebookVersionId: this._notebook.notebookDocument.version,
			edit: { editType: CellEditType.Metadata, index, metadata: this._metadata }
		};

		return this._mainThreadBulkEdits.$tryApplyWorkspaceEdit({ edits: [edit] });
	}
}

export interface INotebookEventEmitter {
	emitModelChange(events: vscode.NotebookCellsChangeEvent): void;
	emitDocumentMetadataChange(event: vscode.NotebookDocumentMetadataChangeEvent): void;
	emitCellOutputsChange(event: vscode.NotebookCellOutputsChangeEvent): void;
	emitCellLanguageChange(event: vscode.NotebookCellLanguageChangeEvent): void;
	emitCellMetadataChange(event: vscode.NotebookCellMetadataChangeEvent): void;
}

function hashPath(resource: URI): string {
	const str = resource.scheme === Schemas.file || resource.scheme === Schemas.untitled ? resource.fsPath : resource.toString();
	return hash(str) + '';
}

export class ExtHostNotebookDocument extends Disposable {

	private static _handlePool: number = 0;
	readonly handle = ExtHostNotebookDocument._handlePool++;

	private _cells: ExtHostCell[] = [];

	private _cellDisposableMapping = new Map<number, DisposableStore>();

	private _notebook: vscode.NotebookDocument | undefined;
	private _metadata: Required<vscode.NotebookDocumentMetadata>;
	private _metadataChangeListener: IDisposable;
	private _versionId = 0;
	private _isDirty: boolean = false;
	private _backupCounter = 1;
	private _backup?: vscode.NotebookDocumentBackup;
	private _disposed = false;
	private _languages: string[] = [];

	private readonly _edits = new Cache<vscode.NotebookDocumentEditEvent>('notebook documents');

	constructor(
		private readonly _proxy: MainThreadNotebookShape,
		private readonly _documentsAndEditors: ExtHostDocumentsAndEditors,
		private readonly _mainThreadBulkEdits: MainThreadBulkEditsShape,
		private readonly _emitter: INotebookEventEmitter,
		private readonly _viewType: string,
		private readonly _contentOptions: vscode.NotebookDocumentContentOptions,
		metadata: Required<vscode.NotebookDocumentMetadata>,
		public readonly uri: URI,
		private readonly _storagePath: URI | undefined
	) {
		super();

		const observableMetadata = getObservable(metadata);
		this._metadata = observableMetadata.proxy;
		this._metadataChangeListener = this._register(observableMetadata.onDidChange(() => {
			this._tryUpdateMetadata();
		}));
	}

	dispose() {
		this._disposed = true;
		super.dispose();
		dispose(this._cellDisposableMapping.values());
	}

	private _updateMetadata(newMetadata: Required<vscode.NotebookDocumentMetadata>) {
		this._metadataChangeListener.dispose();
		newMetadata = {
			...notebookDocumentMetadataDefaults,
			...newMetadata
		};
		if (this._metadataChangeListener) {
			this._metadataChangeListener.dispose();
		}

		const observableMetadata = getObservable(newMetadata);
		this._metadata = observableMetadata.proxy;
		this._metadataChangeListener = this._register(observableMetadata.onDidChange(() => {
			this._tryUpdateMetadata();
		}));

		this._tryUpdateMetadata();
	}

	private _tryUpdateMetadata() {
		const edit: IWorkspaceCellEditDto = {
			_type: WorkspaceEditType.Cell,
			metadata: undefined,
			edit: { editType: CellEditType.DocumentMetadata, metadata: this._metadata },
			resource: this.uri,
			notebookVersionId: this.notebookDocument.version,
		};

		return this._mainThreadBulkEdits.$tryApplyWorkspaceEdit({ edits: [edit] });
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
				get languages() { return that._languages; },
				set languages(value: string[]) { that._trySetLanguages(value); },
				get metadata() { return that._metadata; },
				set metadata(value: Required<vscode.NotebookDocumentMetadata>) { that._updateMetadata(value); },
				get contentOptions() { return that._contentOptions; }
			});
		}
		return this._notebook;
	}

	private _trySetLanguages(newLanguages: string[]) {
		this._languages = newLanguages;
		this._proxy.$updateNotebookLanguages(this._viewType, this.uri, this._languages);
	}

	getNewBackupUri(): URI {
		if (!this._storagePath) {
			throw new Error('Backup requires a valid storage path');
		}
		const fileName = hashPath(this.uri) + (this._backupCounter++);
		return joinPath(this._storagePath, fileName);
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
		const newMetadata = {
			...notebookDocumentMetadataDefaults,
			...data.metadata
		};

		if (this._metadataChangeListener) {
			this._metadataChangeListener.dispose();
		}

		const observableMetadata = getObservable(newMetadata);
		this._metadata = observableMetadata.proxy;
		this._metadataChangeListener = this._register(observableMetadata.onDidChange(() => {
			this._tryUpdateMetadata();
		}));

		this._emitter.emitDocumentMetadataChange({ document: this.notebookDocument });
	}

	acceptModelChanged(event: NotebookCellsChangedEventDto, isDirty: boolean): void {
		this._versionId = event.versionId;
		this._isDirty = isDirty;
		event.rawEvents.forEach(e => {
			if (e.kind === NotebookCellsChangeType.Initialize) {
				this._spliceNotebookCells(e.changes, true);
			} if (e.kind === NotebookCellsChangeType.ModelChange) {
				this._spliceNotebookCells(e.changes, false);
			} else if (e.kind === NotebookCellsChangeType.Move) {
				this._moveCell(e.index, e.newIdx);
			} else if (e.kind === NotebookCellsChangeType.Output) {
				this._setCellOutputs(e.index, e.outputs);
			} else if (e.kind === NotebookCellsChangeType.ChangeLanguage) {
				this._changeCellLanguage(e.index, e.language);
			} else if (e.kind === NotebookCellsChangeType.ChangeCellMetadata) {
				this._changeCellMetadata(e.index, e.metadata);
			}
		});
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

				const extCell = new ExtHostCell(this._mainThreadBulkEdits, this, this._documentsAndEditors, cell);

				if (!initialization) {
					addedCellDocuments.push(ExtHostCell.asModelAddData(this.notebookDocument, cell));
				}

				if (!this._cellDisposableMapping.has(extCell.handle)) {
					const store = new DisposableStore();
					store.add(extCell);
					this._cellDisposableMapping.set(extCell.handle, store);
				}

				const store = this._cellDisposableMapping.get(extCell.handle)!;

				store.add(extCell.onDidChangeOutputs((diffs) => {
					this.eventuallyUpdateCellOutputs(extCell, diffs);
				}));

				return extCell;
			});

			for (let j = splice[0]; j < splice[0] + splice[1]; j++) {
				this._cellDisposableMapping.get(this._cells[j].handle)?.dispose();
				this._cellDisposableMapping.delete(this._cells[j].handle);
			}

			const deletedItems = this._cells.splice(splice[0], splice[1], ...newCells);
			for (let cell of deletedItems) {
				removedCellDocuments.push(cell.uri);
			}

			contentChangeEvents.push(new RawContentChangeEvent(splice[0], splice[1], deletedItems, newCells));
		});

		this._documentsAndEditors.acceptDocumentsAndEditorsDelta({
			addedDocuments: addedCellDocuments,
			removedDocuments: removedCellDocuments
		});

		if (!initialization) {
			this._emitter.emitModelChange({
				document: this.notebookDocument,
				changes: contentChangeEvents.map(RawContentChangeEvent.asApiEvent)
			});
		}
	}

	private _moveCell(index: number, newIdx: number): void {
		const cells = this._cells.splice(index, 1);
		this._cells.splice(newIdx, 0, ...cells);
		const changes: vscode.NotebookCellsChangeData[] = [{
			start: index,
			deletedCount: 1,
			deletedItems: cells.map(data => data.cell),
			items: []
		}, {
			start: newIdx,
			deletedCount: 0,
			deletedItems: [],
			items: cells.map(data => data.cell)
		}];
		this._emitter.emitModelChange({
			document: this.notebookDocument,
			changes
		});
	}

	private _setCellOutputs(index: number, outputs: IProcessedOutput[]): void {
		const cell = this._cells[index];
		cell.setOutputs(outputs);
		this._emitter.emitCellOutputsChange({ document: this.notebookDocument, cells: [cell.cell] });
	}

	private _changeCellLanguage(index: number, language: string): void {
		const cell = this._cells[index];
		const event: vscode.NotebookCellLanguageChangeEvent = { document: this.notebookDocument, cell: cell.cell, language };
		this._emitter.emitCellLanguageChange(event);
	}

	private _changeCellMetadata(index: number, newMetadata: NotebookCellMetadata | undefined): void {
		const cell = this._cells[index];
		cell.setMetadata(newMetadata || {});
		const event: vscode.NotebookCellMetadataChangeEvent = { document: this.notebookDocument, cell: cell.cell };
		this._emitter.emitCellMetadataChange(event);
	}

	async eventuallyUpdateCellOutputs(cell: ExtHostCell, diffs: ISplice<IProcessedOutput>[]) {
		const outputDtos: NotebookCellOutputsSplice[] = diffs.map(diff => {
			const outputs = diff.toInsert;
			return [diff.start, diff.deleteCount, outputs];
		});

		if (!outputDtos.length) {
			return;
		}

		await this._proxy.$spliceNotebookCellOutputs(this._viewType, this.uri, cell.handle, outputDtos);
		this._emitter.emitCellOutputsChange({
			document: this.notebookDocument,
			cells: [cell.cell]
		});
	}

	getCell(cellHandle: number): ExtHostCell | undefined {
		return this._cells.find(cell => cell.handle === cellHandle);
	}

	getCellIndex(cell: ExtHostCell): number {
		return this._cells.indexOf(cell);
	}

	addEdit(item: vscode.NotebookDocumentEditEvent): number {
		return this._edits.add([item]);
	}

	async undo(editId: number, isDirty: boolean): Promise<void> {
		await this.getEdit(editId).undo();
		// if (!isDirty) {
		// 	this.disposeBackup();
		// }
	}

	async redo(editId: number, isDirty: boolean): Promise<void> {
		await this.getEdit(editId).redo();
		// if (!isDirty) {
		// 	this.disposeBackup();
		// }
	}

	private getEdit(editId: number): vscode.NotebookDocumentEditEvent {
		const edit = this._edits.get(editId, 0);
		if (!edit) {
			throw new Error('No edit found');
		}

		return edit;
	}

	disposeEdits(editIds: number[]): void {
		for (const id of editIds) {
			this._edits.delete(id);
		}
	}
}
