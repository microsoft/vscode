/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { readonly } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ISplice } from 'vs/base/common/sequence';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { CellKind, CellOutputKind, ExtHostNotebookShape, IMainContext, MainContext, MainThreadNotebookShape, NotebookCellOutputsSplice, MainThreadDocumentsShape, INotebookEditorPropertiesChangeData, INotebookDocumentsAndEditorsDelta } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { CellEditType, CellUri, diff, ICellEditOperation, ICellInsertEdit, IErrorOutput, INotebookDisplayOrder, INotebookEditData, IOrderedMimeType, IStreamOutput, ITransformedDisplayOutputDto, mimeTypeSupportedByCore, NotebookCellsChangedEvent, NotebookCellsSplice2, sortMimeTypes, ICellDeleteEdit, notebookDocumentMetadataDefaults, NotebookCellsChangeType, NotebookDataDto } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import * as extHostTypes from 'vs/workbench/api/common/extHostTypes';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ExtHostDocumentData } from 'vs/workbench/api/common/extHostDocumentData';
import { NotImplementedProxy } from 'vs/base/common/types';
import * as typeConverters from 'vs/workbench/api/common/extHostTypeConverters';
import { asWebviewUri, WebviewInitData } from 'vs/workbench/api/common/shared/webview';

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

interface INotebookEventEmitter {
	emitModelChange(events: vscode.NotebookCellsChangeEvent): void;
	emitCellOutputsChange(event: vscode.NotebookCellOutputsChangeEvent): void;
	emitCellLanguageChange(event: vscode.NotebookCellLanguageChangeEvent): void;
}

export class ExtHostCell extends Disposable implements vscode.NotebookCell {

	// private originalSource: string[];
	private _outputs: any[];
	private _onDidChangeOutputs = new Emitter<ISplice<vscode.CellOutput>[]>();
	onDidChangeOutputs: Event<ISplice<vscode.CellOutput>[]> = this._onDidChangeOutputs.event;
	// private _textDocument: vscode.TextDocument | undefined;
	// private _initalVersion: number = -1;
	private _outputMapping = new Set<vscode.CellOutput>();
	private _metadata: vscode.NotebookCellMetadata;

	private _metadataChangeListener: IDisposable;

	private _documentData: ExtHostDocumentData;

	get document(): vscode.TextDocument {
		return this._documentData.document;
	}

	get source() {
		// todo@jrieken remove this
		return this._documentData.getText();
	}

	constructor(
		private readonly viewType: string,
		private readonly documentUri: URI,
		readonly handle: number,
		readonly uri: URI,
		content: string,
		public readonly cellKind: CellKind,
		public language: string,
		outputs: any[],
		_metadata: vscode.NotebookCellMetadata | undefined,
		private _proxy: MainThreadNotebookShape,
	) {
		super();
		this._documentData = new ExtHostDocumentData(
			new class extends NotImplementedProxy<MainThreadDocumentsShape>('document') { },
			uri,
			content.split(/\r|\n|\r\n/g), '\n',
			language, 0, false
		);

		this._outputs = outputs;

		const observableMetadata = getObservable(_metadata || {});
		this._metadata = observableMetadata.proxy;
		this._metadataChangeListener = this._register(observableMetadata.onDidChange(() => {
			this.updateMetadata();
		}));
	}

	get outputs() {
		return this._outputs;
	}

	set outputs(newOutputs: vscode.CellOutput[]) {
		let diffs = diff<vscode.CellOutput>(this._outputs || [], newOutputs || [], (a) => {
			return this._outputMapping.has(a);
		});

		diffs.forEach(diff => {
			for (let i = diff.start; i < diff.start + diff.deleteCount; i++) {
				this._outputMapping.delete(this._outputs[i]);
			}

			diff.toInsert.forEach(output => {
				this._outputMapping.add(output);
			});
		});

		this._outputs = newOutputs;
		this._onDidChangeOutputs.fire(diffs);
	}

	get metadata() {
		return this._metadata;
	}

	set metadata(newMetadata: vscode.NotebookCellMetadata) {
		// Don't apply metadata defaults here, 'undefined' means 'inherit from document metadata'
		this._metadataChangeListener.dispose();
		const observableMetadata = getObservable(newMetadata);
		this._metadata = observableMetadata.proxy;
		this._metadataChangeListener = this._register(observableMetadata.onDidChange(() => {
			this.updateMetadata();
		}));

		this.updateMetadata();
	}

	private updateMetadata(): Promise<void> {
		return this._proxy.$updateNotebookCellMetadata(this.viewType, this.documentUri, this.handle, this._metadata);
	}

	attachTextDocument(document: ExtHostDocumentData) {
		this._documentData = document;
		// this._initalVersion = this._documentData.version;
	}

	detachTextDocument() {
		// no-op? keep stale document until new comes along?

		// if (this._textDocument && this._textDocument.version !== this._initalVersion) {
		// 	this.originalSource = this._textDocument.getText().split(/\r|\n|\r\n/g);
		// }
		// this._textDocument = undefined;
		// this._initalVersion = -1;
	}
}

export class ExtHostNotebookDocument extends Disposable implements vscode.NotebookDocument {
	private static _handlePool: number = 0;
	readonly handle = ExtHostNotebookDocument._handlePool++;

	private _cells: ExtHostCell[] = [];

	private _cellDisposableMapping = new Map<number, DisposableStore>();

	get cells() {
		return this._cells;
	}

	private _languages: string[] = [];

	get languages() {
		return this._languages = [];
	}

	set languages(newLanguages: string[]) {
		this._languages = newLanguages;
		this._proxy.$updateNotebookLanguages(this.viewType, this.uri, this._languages);
	}

	private _metadata: Required<vscode.NotebookDocumentMetadata> = notebookDocumentMetadataDefaults;
	private _metadataChangeListener: IDisposable;

	get metadata() {
		return this._metadata;
	}

	set metadata(newMetadata: Required<vscode.NotebookDocumentMetadata>) {
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
			this.updateMetadata();
		}));

		this.updateMetadata();
	}

	private _displayOrder: string[] = [];

	get displayOrder() {
		return this._displayOrder;
	}

	set displayOrder(newOrder: string[]) {
		this._displayOrder = newOrder;
	}

	private _versionId = 0;

	get versionId() {
		return this._versionId;
	}

	private _disposed = false;

	constructor(
		private readonly _proxy: MainThreadNotebookShape,
		private _documentsAndEditors: ExtHostDocumentsAndEditors,
		private _emitter: INotebookEventEmitter,
		public viewType: string,
		public uri: URI,
		public renderingHandler: ExtHostNotebookOutputRenderingHandler
	) {
		super();

		const observableMetadata = getObservable(notebookDocumentMetadataDefaults);
		this._metadata = observableMetadata.proxy;
		this._metadataChangeListener = this._register(observableMetadata.onDidChange(() => {
			this.updateMetadata();
		}));
	}

	private updateMetadata() {
		this._proxy.$updateNotebookMetadata(this.viewType, this.uri, this._metadata);
	}

	dispose() {
		this._disposed = true;
		super.dispose();
		this._cellDisposableMapping.forEach(cell => cell.dispose());
	}

	get fileName() { return this.uri.fsPath; }

	get isDirty() { return false; }

	accpetModelChanged(event: NotebookCellsChangedEvent): void {
		this._versionId = event.versionId;
		if (event.kind === NotebookCellsChangeType.ModelChange) {
			this.$spliceNotebookCells(event.change);
		} else if (event.kind === NotebookCellsChangeType.Move) {
			this.$moveCell(event.index, event.newIdx);
		} else if (event.kind === NotebookCellsChangeType.CellClearOutput) {
			this.$clearCellOutputs(event.index);
		} else if (event.kind === NotebookCellsChangeType.CellsClearOutput) {
			this.$clearAllCellOutputs();
		} else if (event.kind === NotebookCellsChangeType.ChangeLanguage) {
			this.$changeCellLanguage(event.index, event.language);
		}
	}

	private $spliceNotebookCells(splice: NotebookCellsSplice2): void {
		if (this._disposed) {
			return;
		}

		let contentChangeEvents: vscode.NotebookCellsChangeData[] = [];

		let cellDtos = splice[2];
		let newCells = cellDtos.map(cell => {
			const extCell = new ExtHostCell(this.viewType, this.uri, cell.handle, URI.revive(cell.uri), cell.source.join('\n'), cell.cellKind, cell.language, cell.outputs, cell.metadata, this._proxy);
			const documentData = this._documentsAndEditors.getDocument(URI.revive(cell.uri));

			if (documentData) {
				extCell.attachTextDocument(documentData);
			}

			if (!this._cellDisposableMapping.has(extCell.handle)) {
				this._cellDisposableMapping.set(extCell.handle, new DisposableStore());
			}

			let store = this._cellDisposableMapping.get(extCell.handle)!;

			store.add(extCell.onDidChangeOutputs((diffs) => {
				this.eventuallyUpdateCellOutputs(extCell, diffs);
			}));

			return extCell;
		});

		for (let j = splice[0]; j < splice[0] + splice[1]; j++) {
			this._cellDisposableMapping.get(this.cells[j].handle)?.dispose();
			this._cellDisposableMapping.delete(this.cells[j].handle);

		}

		this.cells.splice(splice[0], splice[1], ...newCells);

		const event: vscode.NotebookCellsChangeData = {
			start: splice[0],
			deletedCount: splice[1],
			items: newCells
		};

		contentChangeEvents.push(event);

		this._emitter.emitModelChange({
			document: this,
			changes: contentChangeEvents
		});
	}

	private $moveCell(index: number, newIdx: number): void {
		const cells = this.cells.splice(index, 1);
		this.cells.splice(newIdx, 0, ...cells);
		const changes: vscode.NotebookCellsChangeData[] = [{
			start: index,
			deletedCount: 1,
			items: []
		}, {
			start: newIdx,
			deletedCount: 0,
			items: cells
		}];
		this._emitter.emitModelChange({
			document: this,
			changes
		});
	}

	private $clearCellOutputs(index: number): void {
		const cell = this.cells[index];
		cell.outputs = [];
		const event: vscode.NotebookCellOutputsChangeEvent = { document: this, cells: [cell] };
		this._emitter.emitCellOutputsChange(event);
	}

	private $clearAllCellOutputs(): void {
		const modifedCells: vscode.NotebookCell[] = [];
		this.cells.forEach(cell => {
			if (cell.outputs.length !== 0) {
				cell.outputs = [];
				modifedCells.push(cell);
			}
		});
		const event: vscode.NotebookCellOutputsChangeEvent = { document: this, cells: modifedCells };
		this._emitter.emitCellOutputsChange(event);
	}

	private $changeCellLanguage(index: number, language: string): void {
		const cell = this.cells[index];
		cell.language = language;
		const event: vscode.NotebookCellLanguageChangeEvent = { document: this, cell, language };
		this._emitter.emitCellLanguageChange(event);
	}

	async eventuallyUpdateCellOutputs(cell: ExtHostCell, diffs: ISplice<vscode.CellOutput>[]) {
		let renderers = new Set<number>();
		let outputDtos: NotebookCellOutputsSplice[] = diffs.map(diff => {
			let outputs = diff.toInsert;

			let transformedOutputs = outputs.map(output => {
				if (output.outputKind === CellOutputKind.Rich) {
					const ret = this.transformMimeTypes(output);

					if (ret.orderedMimeTypes[ret.pickedMimeTypeIndex].isResolved) {
						renderers.add(ret.orderedMimeTypes[ret.pickedMimeTypeIndex].rendererId!);
					}
					return ret;
				} else {
					return output as IStreamOutput | IErrorOutput;
				}
			});

			return [diff.start, diff.deleteCount, transformedOutputs];
		});

		await this._proxy.$spliceNotebookCellOutputs(this.viewType, this.uri, cell.handle, outputDtos, Array.from(renderers));
		this._emitter.emitCellOutputsChange({
			document: this,
			cells: [cell]
		});
	}

	transformMimeTypes(output: vscode.CellDisplayOutput): ITransformedDisplayOutputDto {
		let mimeTypes = Object.keys(output.data);
		let coreDisplayOrder = this.renderingHandler.outputDisplayOrder;
		const sorted = sortMimeTypes(mimeTypes, coreDisplayOrder?.userOrder || [], this._displayOrder, coreDisplayOrder?.defaultOrder || []);

		let orderMimeTypes: IOrderedMimeType[] = [];

		sorted.forEach(mimeType => {
			let handlers = this.renderingHandler.findBestMatchedRenderer(mimeType);

			if (handlers.length) {
				let renderedOutput = handlers[0].render(this, output, mimeType);

				orderMimeTypes.push({
					mimeType: mimeType,
					isResolved: true,
					rendererId: handlers[0].handle,
					output: renderedOutput
				});

				for (let i = 1; i < handlers.length; i++) {
					orderMimeTypes.push({
						mimeType: mimeType,
						isResolved: false,
						rendererId: handlers[i].handle
					});
				}

				if (mimeTypeSupportedByCore(mimeType)) {
					orderMimeTypes.push({
						mimeType: mimeType,
						isResolved: false,
						rendererId: -1
					});
				}
			} else {
				orderMimeTypes.push({
					mimeType: mimeType,
					isResolved: false
				});
			}
		});

		return {
			outputKind: output.outputKind,
			data: output.data,
			orderedMimeTypes: orderMimeTypes,
			pickedMimeTypeIndex: 0
		};
	}

	getCell(cellHandle: number) {
		return this.cells.find(cell => cell.handle === cellHandle);
	}

	attachCellTextDocument(textDocument: ExtHostDocumentData) {
		let cell = this.cells.find(cell => cell.uri.toString() === textDocument.document.uri.toString());
		if (cell) {
			cell.attachTextDocument(textDocument);
		}
	}

	detachCellTextDocument(textDocument: ExtHostDocumentData) {
		let cell = this.cells.find(cell => cell.uri.toString() === textDocument.document.uri.toString());
		if (cell) {
			cell.detachTextDocument();
		}
	}
}

export class NotebookEditorCellEditBuilder implements vscode.NotebookEditorCellEdit {
	private _finalized: boolean = false;
	private readonly _documentVersionId: number;
	private _collectedEdits: ICellEditOperation[] = [];
	private _renderers = new Set<number>();

	constructor(
		readonly editor: ExtHostNotebookEditor
	) {
		this._documentVersionId = editor.document.versionId;
	}

	finalize(): INotebookEditData {
		this._finalized = true;
		return {
			documentVersionId: this._documentVersionId,
			edits: this._collectedEdits,
			renderers: Array.from(this._renderers)
		};
	}

	private _throwIfFinalized() {
		if (this._finalized) {
			throw new Error('Edit is only valid while callback runs');
		}
	}

	insert(index: number, content: string | string[], language: string, type: CellKind, outputs: vscode.CellOutput[], metadata: vscode.NotebookCellMetadata | undefined): void {
		this._throwIfFinalized();

		const sourceArr = Array.isArray(content) ? content : content.split(/\r|\n|\r\n/g);
		let cell = {
			source: sourceArr,
			language,
			cellKind: type,
			outputs: (outputs as any[]), // TODO@rebornix
			metadata
		};

		const transformedOutputs = outputs.map(output => {
			if (output.outputKind === CellOutputKind.Rich) {
				const ret = this.editor.document.transformMimeTypes(output);

				if (ret.orderedMimeTypes[ret.pickedMimeTypeIndex].isResolved) {
					this._renderers.add(ret.orderedMimeTypes[ret.pickedMimeTypeIndex].rendererId!);
				}
				return ret;
			} else {
				return output as IStreamOutput | IErrorOutput;
			}
		});

		cell.outputs = transformedOutputs;

		this._collectedEdits.push({
			editType: CellEditType.Insert,
			index,
			cells: [cell]
		});
	}

	delete(index: number): void {
		this._throwIfFinalized();

		this._collectedEdits.push({
			editType: CellEditType.Delete,
			index,
			count: 1
		});
	}
}

export class ExtHostNotebookEditor extends Disposable implements vscode.NotebookEditor {
	private _viewColumn: vscode.ViewColumn | undefined;

	selection?: ExtHostCell = undefined;

	private _active: boolean = false;
	get active(): boolean {
		return this._active;
	}

	set active(_state: boolean) {
		throw readonly('active');
	}

	private _visible: boolean = false;
	get visible(): boolean {
		return this._visible;
	}

	set visible(_state: boolean) {
		throw readonly('visible');
	}

	_acceptVisibility(value: boolean) {
		this._visible = value;
	}

	_acceptActive(value: boolean) {
		this._active = value;
	}

	private _onDidDispose = new Emitter<void>();
	readonly onDidDispose: Event<void> = this._onDidDispose.event;
	onDidReceiveMessage: vscode.Event<any> = this._onDidReceiveMessage.event;

	constructor(
		private readonly viewType: string,
		readonly id: string,
		public uri: URI,
		private _proxy: MainThreadNotebookShape,
		private _onDidReceiveMessage: Emitter<any>,
		private _webviewInitData: WebviewInitData,
		public document: ExtHostNotebookDocument,
		private _documentsAndEditors: ExtHostDocumentsAndEditors
	) {
		super();
		this._register(this._documentsAndEditors.onDidAddDocuments(documents => {
			for (const documentData of documents) {
				let data = CellUri.parse(documentData.document.uri);
				if (data) {
					if (this.document.uri.toString() === data.notebook.toString()) {
						document.attachCellTextDocument(documentData);
					}
				}
			}
		}));

		this._register(this._documentsAndEditors.onDidRemoveDocuments(documents => {
			for (const documentData of documents) {
				let data = CellUri.parse(documentData.document.uri);
				if (data) {
					if (this.document.uri.toString() === data.notebook.toString()) {
						document.detachCellTextDocument(documentData);
					}
				}
			}
		}));
	}

	edit(callback: (editBuilder: NotebookEditorCellEditBuilder) => void): Thenable<boolean> {
		const edit = new NotebookEditorCellEditBuilder(this);
		callback(edit);
		return this._applyEdit(edit);
	}

	private _applyEdit(editBuilder: NotebookEditorCellEditBuilder): Promise<boolean> {
		const editData = editBuilder.finalize();

		// return when there is nothing to do
		if (editData.edits.length === 0) {
			return Promise.resolve(true);
		}

		let compressedEdits: ICellEditOperation[] = [];
		let compressedEditsIndex = -1;

		for (let i = 0; i < editData.edits.length; i++) {
			if (compressedEditsIndex < 0) {
				compressedEdits.push(editData.edits[i]);
				compressedEditsIndex++;
				continue;
			}

			let prevIndex = compressedEditsIndex;
			let prev = compressedEdits[prevIndex];

			if (prev.editType === CellEditType.Insert && editData.edits[i].editType === CellEditType.Insert) {
				if (prev.index === editData.edits[i].index) {
					prev.cells.push(...(editData.edits[i] as ICellInsertEdit).cells);
					continue;
				}
			}

			if (prev.editType === CellEditType.Delete && editData.edits[i].editType === CellEditType.Delete) {
				if (prev.index === editData.edits[i].index) {
					prev.count += (editData.edits[i] as ICellDeleteEdit).count;
					continue;
				}
			}

			compressedEdits.push(editData.edits[i]);
			compressedEditsIndex++;
		}

		return this._proxy.$tryApplyEdits(this.viewType, this.uri, editData.documentVersionId, compressedEdits, editData.renderers);
	}

	get viewColumn(): vscode.ViewColumn | undefined {
		return this._viewColumn;
	}

	set viewColumn(value) {
		throw readonly('viewColumn');
	}

	async postMessage(message: any): Promise<boolean> {
		return this._proxy.$postMessage(this.document.handle, message);
	}

	asWebviewUri(localResource: vscode.Uri): vscode.Uri {
		return asWebviewUri(this._webviewInitData, this.id, localResource);
	}
	dispose() {
		this._onDidDispose.fire();
		super.dispose();
	}
}

export class ExtHostNotebookOutputRenderer {
	private static _handlePool: number = 0;
	readonly handle = ExtHostNotebookOutputRenderer._handlePool++;

	constructor(
		public type: string,
		public filter: vscode.NotebookOutputSelector,
		public renderer: vscode.NotebookOutputRenderer
	) {

	}

	matches(mimeType: string): boolean {
		if (this.filter.subTypes) {
			if (this.filter.subTypes.indexOf(mimeType) >= 0) {
				return true;
			}
		}
		return false;
	}

	render(document: ExtHostNotebookDocument, output: vscode.CellDisplayOutput, mimeType: string): string {
		let html = this.renderer.render(document, output, mimeType);

		return html;
	}
}

export interface ExtHostNotebookOutputRenderingHandler {
	outputDisplayOrder: INotebookDisplayOrder | undefined;
	findBestMatchedRenderer(mimeType: string): ExtHostNotebookOutputRenderer[];
}

export class ExtHostNotebookController implements ExtHostNotebookShape, ExtHostNotebookOutputRenderingHandler {
	private readonly _proxy: MainThreadNotebookShape;
	private readonly _notebookContentProviders = new Map<string, { readonly provider: vscode.NotebookContentProvider, readonly extension: IExtensionDescription; }>();
	private readonly _notebookKernels = new Map<string, { readonly kernel: vscode.NotebookKernel, readonly extension: IExtensionDescription; }>();
	private readonly _documents = new Map<string, ExtHostNotebookDocument>();
	private readonly _unInitializedDocuments = new Map<string, ExtHostNotebookDocument>();
	private readonly _editors = new Map<string, { editor: ExtHostNotebookEditor, onDidReceiveMessage: Emitter<any>; }>();
	private readonly _notebookOutputRenderers = new Map<number, ExtHostNotebookOutputRenderer>();
	private readonly _onDidChangeNotebookCells = new Emitter<vscode.NotebookCellsChangeEvent>();
	readonly onDidChangeNotebookCells = this._onDidChangeNotebookCells.event;
	private readonly _onDidChangeCellOutputs = new Emitter<vscode.NotebookCellOutputsChangeEvent>();
	readonly onDidChangeCellOutputs = this._onDidChangeCellOutputs.event;
	private readonly _onDidChangeCellLanguage = new Emitter<vscode.NotebookCellLanguageChangeEvent>();
	readonly onDidChangeCellLanguage = this._onDidChangeCellLanguage.event;
	private readonly _onDidChangeActiveNotebookEditor = new Emitter<vscode.NotebookEditor | undefined>();
	readonly onDidChangeActiveNotebookEditor = this._onDidChangeActiveNotebookEditor.event;

	private _outputDisplayOrder: INotebookDisplayOrder | undefined;

	get outputDisplayOrder(): INotebookDisplayOrder | undefined {
		return this._outputDisplayOrder;
	}

	private _activeNotebookDocument: ExtHostNotebookDocument | undefined;

	get activeNotebookDocument() {
		return this._activeNotebookDocument;
	}

	private _activeNotebookEditor: ExtHostNotebookEditor | undefined;

	get activeNotebookEditor() {
		return this._activeNotebookEditor;
	}

	private _onDidOpenNotebookDocument = new Emitter<vscode.NotebookDocument>();
	onDidOpenNotebookDocument: Event<vscode.NotebookDocument> = this._onDidOpenNotebookDocument.event;
	private _onDidCloseNotebookDocument = new Emitter<vscode.NotebookDocument>();
	onDidCloseNotebookDocument: Event<vscode.NotebookDocument> = this._onDidCloseNotebookDocument.event;
	visibleNotebookEditors: ExtHostNotebookEditor[] = [];
	private _onDidChangeVisibleNotebookEditors = new Emitter<vscode.NotebookEditor[]>();
	onDidChangeVisibleNotebookEditors = this._onDidChangeVisibleNotebookEditors.event;

	constructor(mainContext: IMainContext, commands: ExtHostCommands, private _documentsAndEditors: ExtHostDocumentsAndEditors, private readonly _webviewInitData: WebviewInitData) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadNotebook);

		commands.registerArgumentProcessor({
			processArgument: arg => {
				if (arg && arg.$mid === 12) {
					const documentHandle = arg.notebookEditor?.notebookHandle;
					const cellHandle = arg.cell.handle;

					for (let value of this._editors) {
						if (value[1].editor.document.handle === documentHandle) {
							const cell = value[1].editor.document.getCell(cellHandle);
							if (cell) {
								return cell;
							}
						}
					}
				}
				return arg;
			}
		});
	}

	registerNotebookOutputRenderer(
		type: string,
		extension: IExtensionDescription,
		filter: vscode.NotebookOutputSelector,
		renderer: vscode.NotebookOutputRenderer
	): vscode.Disposable {
		let extHostRenderer = new ExtHostNotebookOutputRenderer(type, filter, renderer);
		this._notebookOutputRenderers.set(extHostRenderer.handle, extHostRenderer);
		this._proxy.$registerNotebookRenderer({ id: extension.identifier, location: extension.extensionLocation }, type, filter, extHostRenderer.handle, renderer.preloads || []);
		return new extHostTypes.Disposable(() => {
			this._notebookOutputRenderers.delete(extHostRenderer.handle);
			this._proxy.$unregisterNotebookRenderer(extHostRenderer.handle);
		});
	}

	findBestMatchedRenderer(mimeType: string): ExtHostNotebookOutputRenderer[] {
		let matches: ExtHostNotebookOutputRenderer[] = [];
		for (let renderer of this._notebookOutputRenderers) {
			if (renderer[1].matches(mimeType)) {
				matches.push(renderer[1]);
			}
		}

		return matches;
	}

	registerNotebookContentProvider(
		extension: IExtensionDescription,
		viewType: string,
		provider: vscode.NotebookContentProvider,
	): vscode.Disposable {

		if (this._notebookContentProviders.has(viewType)) {
			throw new Error(`Notebook provider for '${viewType}' already registered`);
		}

		// if ((<any>provider).executeCell) {
		// 	throw new Error('NotebookContentKernel.executeCell is removed, please use vscode.notebook.registerNotebookKernel instead.');
		// }

		this._notebookContentProviders.set(viewType, { extension, provider });
		this._proxy.$registerNotebookProvider({ id: extension.identifier, location: extension.extensionLocation }, viewType, provider.kernel ? { id: viewType, label: provider.kernel.label, extensionLocation: extension.extensionLocation, preloads: provider.kernel.preloads } : undefined);
		return new extHostTypes.Disposable(() => {
			this._notebookContentProviders.delete(viewType);
			this._proxy.$unregisterNotebookProvider(viewType);
		});
	}

	registerNotebookKernel(extension: IExtensionDescription, id: string, selectors: vscode.GlobPattern[], kernel: vscode.NotebookKernel): vscode.Disposable {
		if (this._notebookKernels.has(id)) {
			throw new Error(`Notebook kernel for '${id}' already registered`);
		}

		this._notebookKernels.set(id, { kernel, extension });
		const transformedSelectors = selectors.map(selector => typeConverters.GlobPattern.from(selector));

		this._proxy.$registerNotebookKernel({ id: extension.identifier, location: extension.extensionLocation }, id, kernel.label, transformedSelectors, kernel.preloads || []);
		return new extHostTypes.Disposable(() => {
			this._notebookKernels.delete(id);
			this._proxy.$unregisterNotebookKernel(id);
		});
	}

	async $resolveNotebookData(viewType: string, uri: UriComponents): Promise<NotebookDataDto | undefined> {
		const provider = this._notebookContentProviders.get(viewType);
		const revivedUri = URI.revive(uri);

		if (provider) {
			let document = this._documents.get(URI.revive(uri).toString());

			if (!document) {
				const that = this;
				document = this._unInitializedDocuments.get(revivedUri.toString()) ?? new ExtHostNotebookDocument(this._proxy, this._documentsAndEditors, {
					emitModelChange(event: vscode.NotebookCellsChangeEvent): void {
						that._onDidChangeNotebookCells.fire(event);
					},
					emitCellOutputsChange(event: vscode.NotebookCellOutputsChangeEvent): void {
						that._onDidChangeCellOutputs.fire(event);
					},
					emitCellLanguageChange(event: vscode.NotebookCellLanguageChangeEvent): void {
						that._onDidChangeCellLanguage.fire(event);
					}
				}, viewType, revivedUri, this);
				this._unInitializedDocuments.set(revivedUri.toString(), document);
			}

			const rawCells = await provider.provider.openNotebook(URI.revive(uri));
			const renderers = new Set<number>();
			const dto = {
				metadata: {
					...notebookDocumentMetadataDefaults,
					...rawCells.metadata
				},
				languages: rawCells.languages,
				cells: rawCells.cells.map(cell => {
					let transformedOutputs = cell.outputs.map(output => {
						if (output.outputKind === CellOutputKind.Rich) {
							// TODO display string[]
							const ret = this._transformMimeTypes(document!, (rawCells.metadata.displayOrder as string[]) || [], output);

							if (ret.orderedMimeTypes[ret.pickedMimeTypeIndex].isResolved) {
								renderers.add(ret.orderedMimeTypes[ret.pickedMimeTypeIndex].rendererId!);
							}
							return ret;
						} else {
							return output as IStreamOutput | IErrorOutput;
						}
					});

					return {
						language: cell.language,
						cellKind: cell.cellKind,
						metadata: cell.metadata,
						source: cell.source,
						outputs: transformedOutputs
					};
				}),
				renderers: [] as number[]
			};

			dto.renderers = [...renderers];
			return dto;
		}

		return;
	}

	private _transformMimeTypes(document: ExtHostNotebookDocument, displayOrder: string[], output: vscode.CellDisplayOutput): ITransformedDisplayOutputDto {
		let mimeTypes = Object.keys(output.data);
		let coreDisplayOrder = this.outputDisplayOrder;
		const sorted = sortMimeTypes(mimeTypes, coreDisplayOrder?.userOrder || [], displayOrder, coreDisplayOrder?.defaultOrder || []);

		let orderMimeTypes: IOrderedMimeType[] = [];

		sorted.forEach(mimeType => {
			let handlers = this.findBestMatchedRenderer(mimeType);

			if (handlers.length) {
				let renderedOutput = handlers[0].render(document, output, mimeType);

				orderMimeTypes.push({
					mimeType: mimeType,
					isResolved: true,
					rendererId: handlers[0].handle,
					output: renderedOutput
				});

				for (let i = 1; i < handlers.length; i++) {
					orderMimeTypes.push({
						mimeType: mimeType,
						isResolved: false,
						rendererId: handlers[i].handle
					});
				}

				if (mimeTypeSupportedByCore(mimeType)) {
					orderMimeTypes.push({
						mimeType: mimeType,
						isResolved: false,
						rendererId: -1
					});
				}
			} else {
				orderMimeTypes.push({
					mimeType: mimeType,
					isResolved: false
				});
			}
		});

		return {
			outputKind: output.outputKind,
			data: output.data,
			orderedMimeTypes: orderMimeTypes,
			pickedMimeTypeIndex: 0
		};
	}

	async $executeNotebook(viewType: string, uri: UriComponents, cellHandle: number | undefined, useAttachedKernel: boolean, token: CancellationToken): Promise<void> {
		let document = this._documents.get(URI.revive(uri).toString());

		if (!document) {
			return;
		}

		if (this._notebookContentProviders.has(viewType)) {
			const cell = cellHandle !== undefined ? document.getCell(cellHandle) : undefined;
			const provider = this._notebookContentProviders.get(viewType)!.provider;

			if (provider.kernel && useAttachedKernel) {
				if (cell) {
					return provider.kernel.executeCell(document, cell, token);
				} else {
					return provider.kernel.executeAllCells(document, token);
				}
			}
		}
	}

	async $executeNotebook2(kernelId: string, viewType: string, uri: UriComponents, cellHandle: number | undefined, token: CancellationToken): Promise<void> {
		let document = this._documents.get(URI.revive(uri).toString());

		if (!document || document.viewType !== viewType) {
			return;
		}

		let kernelInfo = this._notebookKernels.get(kernelId);

		if (!kernelInfo) {
			return;
		}

		let cell = cellHandle !== undefined ? document.getCell(cellHandle) : undefined;

		if (cell) {
			return kernelInfo.kernel.executeCell(document, cell, token);
		} else {
			return kernelInfo.kernel.executeAllCells(document, token);
		}
	}

	async $saveNotebook(viewType: string, uri: UriComponents, token: CancellationToken): Promise<boolean> {
		let document = this._documents.get(URI.revive(uri).toString());
		if (!document) {
			return false;
		}

		if (this._notebookContentProviders.has(viewType)) {
			try {
				await this._notebookContentProviders.get(viewType)!.provider.saveNotebook(document, token);
			} catch (e) {
				return false;
			}

			return true;
		}

		return false;
	}

	async $saveNotebookAs(viewType: string, uri: UriComponents, target: UriComponents, token: CancellationToken): Promise<boolean> {
		let document = this._documents.get(URI.revive(uri).toString());
		if (!document) {
			return false;
		}

		if (this._notebookContentProviders.has(viewType)) {
			try {
				await this._notebookContentProviders.get(viewType)!.provider.saveNotebookAs(URI.revive(target), document, token);
			} catch (e) {
				return false;
			}

			return true;
		}

		return false;
	}

	$acceptDisplayOrder(displayOrder: INotebookDisplayOrder): void {
		this._outputDisplayOrder = displayOrder;
	}

	// TODO: remove document - editor one on one mapping
	private _getEditorFromURI(uriComponents: UriComponents) {
		const uriStr = URI.revive(uriComponents).toString();
		let editor: { editor: ExtHostNotebookEditor, onDidReceiveMessage: Emitter<any>; } | undefined;
		this._editors.forEach(e => {
			if (e.editor.uri.toString() === uriStr) {
				editor = e;
			}
		});

		return editor;
	}

	$onDidReceiveMessage(editorId: string, message: any): void {
		let editor = this._editors.get(editorId);

		if (editor) {
			editor.onDidReceiveMessage.fire(message);
		}
	}

	$acceptModelChanged(uriComponents: UriComponents, event: NotebookCellsChangedEvent): void {
		const document = this._documents.get(URI.revive(uriComponents).toString());

		if (document) {
			document.accpetModelChanged(event);
		}
	}

	$acceptEditorPropertiesChanged(uriComponents: UriComponents, data: INotebookEditorPropertiesChangeData): void {
		let editor = this._getEditorFromURI(uriComponents);

		if (!editor) {
			return;
		}

		if (data.selections) {
			const cells = editor.editor.document.cells;

			if (data.selections.selections.length) {
				const firstCell = data.selections.selections[0];
				editor.editor.selection = cells.find(cell => cell.handle === firstCell);
			} else {
				editor.editor.selection = undefined;
			}
		}

		if (data.metadata) {
			editor.editor.document.metadata = {
				...notebookDocumentMetadataDefaults,
				...data.metadata
			};
		}
	}

	private _createExtHostEditor(document: ExtHostNotebookDocument, editorId: string, selections: number[]) {
		const onDidReceiveMessage = new Emitter<any>();
		const revivedUri = document.uri;

		let editor = new ExtHostNotebookEditor(
			document.viewType,
			editorId,
			revivedUri,
			this._proxy,
			onDidReceiveMessage,
			this._webviewInitData,
			document,
			this._documentsAndEditors
		);

		const cells = editor.document.cells;

		if (selections.length) {
			const firstCell = selections[0];
			editor.selection = cells.find(cell => cell.handle === firstCell);
		} else {
			editor.selection = undefined;
		}

		this._editors.get(editorId)?.editor.dispose();

		this._editors.set(editorId, { editor, onDidReceiveMessage });
	}

	async $acceptDocumentAndEditorsDelta(delta: INotebookDocumentsAndEditorsDelta) {
		let editorChanged = false;

		if (delta.removedDocuments) {
			delta.removedDocuments.forEach((uri) => {
				const revivedUri = URI.revive(uri);
				const revivedUriStr = revivedUri.toString();
				let document = this._documents.get(revivedUriStr);

				if (document) {
					document.dispose();
					this._documents.delete(revivedUriStr);
					this._onDidCloseNotebookDocument.fire(document);
				}

				[...this._editors.values()].forEach((e) => {
					if (e.editor.uri.toString() === revivedUriStr) {
						e.editor.dispose();
						e.onDidReceiveMessage.dispose();
						this._editors.delete(e.editor.id);
						editorChanged = true;
					}
				});
			});
		}

		if (delta.addedDocuments) {
			delta.addedDocuments.forEach(modelData => {
				const revivedUri = URI.revive(modelData.uri);
				const revivedUriStr = revivedUri.toString();
				const viewType = modelData.viewType;
				if (!this._documents.has(revivedUriStr)) {
					const that = this;
					let document = this._unInitializedDocuments.get(revivedUriStr) ?? new ExtHostNotebookDocument(this._proxy, this._documentsAndEditors, {
						emitModelChange(event: vscode.NotebookCellsChangeEvent): void {
							that._onDidChangeNotebookCells.fire(event);
						},
						emitCellOutputsChange(event: vscode.NotebookCellOutputsChangeEvent): void {
							that._onDidChangeCellOutputs.fire(event);
						},
						emitCellLanguageChange(event: vscode.NotebookCellLanguageChangeEvent): void {
							that._onDidChangeCellLanguage.fire(event);
						}
					}, viewType, revivedUri, this);

					this._unInitializedDocuments.delete(revivedUriStr);
					if (modelData.metadata) {
						document.metadata = {
							...notebookDocumentMetadataDefaults,
							...modelData.metadata
						};
					}

					document.accpetModelChanged({
						kind: NotebookCellsChangeType.ModelChange,
						versionId: modelData.versionId,
						change: [
							0,
							0,
							modelData.cells
						]
					});

					this._documents.get(revivedUriStr)?.dispose();
					this._documents.set(revivedUriStr, document);

					// create editor if populated
					if (modelData.attachedEditor) {
						this._createExtHostEditor(document, modelData.attachedEditor.id, modelData.attachedEditor.selections);
						editorChanged = true;
					}
				}

				const document = this._documents.get(revivedUriStr)!;
				this._onDidOpenNotebookDocument.fire(document);
			});
		}

		if (delta.addedEditors) {
			delta.addedEditors.forEach(editorModelData => {
				if (this._editors.has(editorModelData.id)) {
					return;
				}

				const revivedUri = URI.revive(editorModelData.documentUri);
				const document = this._documents.get(revivedUri.toString());

				if (document) {
					this._createExtHostEditor(document, editorModelData.id, editorModelData.selections);
					editorChanged = true;
				}
			});
		}

		const removedEditors: { editor: ExtHostNotebookEditor, onDidReceiveMessage: Emitter<any>; }[] = [];

		if (delta.removedEditors) {
			delta.removedEditors.forEach(editorid => {
				const editor = this._editors.get(editorid);

				if (editor) {
					editorChanged = true;
					this._editors.delete(editorid);

					if (this.activeNotebookEditor?.id === editor.editor.id) {
						this._activeNotebookEditor = undefined;
						this._activeNotebookDocument = undefined;
					}

					removedEditors.push(editor);
				}
			});
		}

		if (editorChanged) {
			removedEditors.forEach(e => {
				e.editor.dispose();
				e.onDidReceiveMessage.dispose();
			});
		}

		if (delta.visibleEditors) {
			this.visibleNotebookEditors = delta.visibleEditors.map(id => this._editors.get(id)?.editor).filter(editor => !!editor) as ExtHostNotebookEditor[];
			const visibleEditorsSet = new Set<string>();
			this.visibleNotebookEditors.forEach(editor => visibleEditorsSet.add(editor.id));

			[...this._editors.values()].forEach((e) => {
				const newValue = visibleEditorsSet.has(e.editor.id);
				e.editor._acceptVisibility(newValue);
			});

			this.visibleNotebookEditors = [...this._editors.values()].map(e => e.editor).filter(e => e.visible);
			this._onDidChangeVisibleNotebookEditors.fire(this.visibleNotebookEditors);
		}

		if (delta.newActiveEditor !== undefined) {
			if (delta.newActiveEditor) {
				this._activeNotebookEditor = this._editors.get(delta.newActiveEditor)?.editor;
				this._activeNotebookEditor?._acceptActive(true);
				this._activeNotebookDocument = this._activeNotebookEditor ? this._documents.get(this._activeNotebookEditor!.uri.toString()) : undefined;
			} else {
				this._activeNotebookEditor = undefined;
				this._activeNotebookDocument = undefined;
			}

			this._onDidChangeActiveNotebookEditor.fire(this._activeNotebookEditor);
		}

		[...this._editors.values()].forEach((e) => {
			if (e.editor !== this.activeNotebookEditor) {
				e.editor._acceptActive(false);
			}
		});
	}
}
