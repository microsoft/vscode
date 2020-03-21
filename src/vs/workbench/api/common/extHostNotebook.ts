/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ExtHostNotebookShape, IMainContext, MainThreadNotebookShape, MainContext, ICellDto, NotebookCellsSplice, NotebookCellOutputsSplice, CellKind, CellOutputKind } from 'vs/workbench/api/common/extHost.protocol';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { Disposable as VSCodeDisposable } from './extHostTypes';
import { URI, UriComponents } from 'vs/base/common/uri';
import { DisposableStore, Disposable } from 'vs/base/common/lifecycle';
import { readonly } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { INotebookDisplayOrder, ITransformedDisplayOutputDto, IOrderedMimeType, IStreamOutput, IErrorOutput, mimeTypeSupportedByCore, IOutput, sortMimeTypes, diff, CellUri } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ISplice } from 'vs/base/common/sequence';
import { ExtHostCommands } from 'vs/workbench/api/common/extHostCommands';

export class ExtHostCell implements vscode.NotebookCell {

	public source: string[];
	private _outputs: any[];
	private _onDidChangeOutputs = new Emitter<ISplice<vscode.CellOutput>[]>();
	onDidChangeOutputs: Event<ISplice<vscode.CellOutput>[]> = this._onDidChangeOutputs.event;
	private _textDocument: vscode.TextDocument | undefined;
	private _initalVersion: number = -1;
	private _outputMapping = new Set<vscode.CellOutput>();

	constructor(
		readonly handle: number,
		readonly uri: URI,
		private _content: string,
		public cellKind: CellKind,
		public language: string,
		outputs: any[],
		public metadata: vscode.NotebookCellMetadata | undefined,
	) {
		this.source = this._content.split(/\r|\n|\r\n/g);
		this._outputs = outputs;
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

	getContent(): string {
		if (this._textDocument && this._initalVersion !== this._textDocument?.version) {
			return this._textDocument.getText();
		} else {
			return this.source.join('\n');
		}
	}

	attachTextDocument(document: vscode.TextDocument) {
		this._textDocument = document;
		this._initalVersion = this._textDocument.version;
	}

	detachTextDocument(document: vscode.TextDocument) {
		if (this._textDocument && this._textDocument.version !== this._initalVersion) {
			this.source = this._textDocument.getText().split(/\r|\n|\r\n/g);
		}

		this._textDocument = undefined;
		this._initalVersion = -1;
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

	set cells(newCells: ExtHostCell[]) {
		let diffs = diff<ExtHostCell>(this._cells, newCells, (a) => {
			return this._cellDisposableMapping.has(a.handle);
		});

		diffs.forEach(diff => {
			for (let i = diff.start; i < diff.start + diff.deleteCount; i++) {
				this._cellDisposableMapping.get(this._cells[i].handle)?.clear();
				this._cellDisposableMapping.delete(this._cells[i].handle);
			}

			diff.toInsert.forEach(cell => {
				this._cellDisposableMapping.set(cell.handle, new DisposableStore());
				this._cellDisposableMapping.get(cell.handle)?.add(cell.onDidChangeOutputs((outputDiffs) => {
					this.eventuallyUpdateCellOutputs(cell, outputDiffs);
				}));
			});
		});

		this._cells = newCells;
		this.eventuallyUpdateCells(diffs);
	}

	private _languages: string[] = [];

	get languages() {
		return this._languages = [];
	}

	set languages(newLanguages: string[]) {
		this._languages = newLanguages;
		this._proxy.$updateNotebookLanguages(this.viewType, this.uri, this._languages);
	}

	private _metadata: vscode.NotebookDocumentMetadata | undefined = undefined;

	get metadata() {
		return this._metadata;
	}

	set metadata(newMetadata: vscode.NotebookDocumentMetadata | undefined) {
		this._metadata = newMetadata;
		this._proxy.$updateNotebookMetadata(this.viewType, this.uri, this._metadata);
	}

	private _displayOrder: string[] = [];

	get displayOrder() {
		return this._displayOrder;
	}

	set displayOrder(newOrder: string[]) {
		this._displayOrder = newOrder;
	}

	constructor(
		private readonly _proxy: MainThreadNotebookShape,
		public viewType: string,
		public uri: URI,
		public renderingHandler: ExtHostNotebookOutputRenderingHandler
	) {
		super();
	}

	dispose() {
		super.dispose();
		this._cellDisposableMapping.forEach(cell => cell.dispose());
	}

	get fileName() { return this.uri.fsPath; }

	get isDirty() { return false; }

	eventuallyUpdateCells(diffs: ISplice<ExtHostCell>[]) {
		let renderers = new Set<number>();
		let diffDtos: NotebookCellsSplice[] = [];

		diffDtos = diffs.map(diff => {
			let inserts = diff.toInsert;

			let cellDtos = inserts.map(cell => {
				let outputs: IOutput[] = [];
				if (cell.outputs.length) {
					outputs = cell.outputs.map(output => {
						if (output.outputKind === CellOutputKind.Rich) {
							const ret = this.transformMimeTypes(cell, output);

							if (ret.orderedMimeTypes[ret.pickedMimeTypeIndex].isResolved) {
								renderers.add(ret.orderedMimeTypes[ret.pickedMimeTypeIndex].rendererId!);
							}
							return ret;
						} else {
							return output as IStreamOutput | IErrorOutput;
						}
					});
				}

				return {
					uri: cell.uri,
					handle: cell.handle,
					source: cell.source,
					language: cell.language,
					cellKind: cell.cellKind,
					outputs: outputs,
					metadata: cell.metadata,
					isDirty: false
				};
			});

			return [diff.start, diff.deleteCount, cellDtos];
		});

		this._proxy.$spliceNotebookCells(
			this.viewType,
			this.uri,
			diffDtos,
			Array.from(renderers)
		);
	}

	eventuallyUpdateCellOutputs(cell: ExtHostCell, diffs: ISplice<vscode.CellOutput>[]) {
		let renderers = new Set<number>();
		let outputDtos: NotebookCellOutputsSplice[] = diffs.map(diff => {
			let outputs = diff.toInsert;

			let transformedOutputs = outputs.map(output => {
				if (output.outputKind === CellOutputKind.Rich) {
					const ret = this.transformMimeTypes(cell, output);

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

		this._proxy.$spliceNotebookCellOutputs(this.viewType, this.uri, cell.handle, outputDtos, Array.from(renderers));
	}

	insertCell(index: number, cell: ExtHostCell) {
		this.cells.splice(index, 0, cell);

		if (!this._cellDisposableMapping.has(cell.handle)) {
			this._cellDisposableMapping.set(cell.handle, new DisposableStore());
		}

		let store = this._cellDisposableMapping.get(cell.handle)!;

		store.add(cell.onDidChangeOutputs((diffs) => {
			this.eventuallyUpdateCellOutputs(cell, diffs);
		}));
	}

	deleteCell(index: number): boolean {
		if (index >= this.cells.length) {
			return false;
		}

		let cell = this.cells[index];
		this._cellDisposableMapping.get(cell.handle)?.dispose();
		this._cellDisposableMapping.delete(cell.handle);

		this.cells.splice(index, 1);
		return true;
	}


	transformMimeTypes(cell: ExtHostCell, output: vscode.CellDisplayOutput): ITransformedDisplayOutputDto {
		let mimeTypes = Object.keys(output.data);

		// TODO@rebornix, the document display order might be assigned a bit later. We need to postpone sending the outputs to the core side.
		let coreDisplayOrder = this.renderingHandler.outputDisplayOrder;
		const sorted = sortMimeTypes(mimeTypes, coreDisplayOrder?.userOrder || [], this._displayOrder, coreDisplayOrder?.defaultOrder || []);

		let orderMimeTypes: IOrderedMimeType[] = [];

		sorted.forEach(mimeType => {
			let handlers = this.renderingHandler.findBestMatchedRenderer(mimeType);

			if (handlers.length) {
				let renderedOutput = handlers[0].render(this, cell, output, mimeType);

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

	attachCellTextDocument(textDocument: vscode.TextDocument) {
		let cell = this.cells.find(cell => cell.uri.toString() === textDocument.uri.toString());
		if (cell) {
			cell.attachTextDocument(textDocument);
		}
	}

	detachCellTextDocument(textDocument: vscode.TextDocument) {
		let cell = this.cells.find(cell => cell.uri.toString() === textDocument.uri.toString());
		if (cell) {
			cell.detachTextDocument(textDocument);
		}
	}
}

export class ExtHostNotebookEditor extends Disposable implements vscode.NotebookEditor {
	private _viewColumn: vscode.ViewColumn | undefined;
	private static _cellhandlePool: number = 0;
	onDidReceiveMessage: vscode.Event<any> = this._onDidReceiveMessage.event;

	constructor(
		viewType: string,
		readonly id: string,
		public uri: URI,
		private _proxy: MainThreadNotebookShape,
		private _onDidReceiveMessage: Emitter<any>,
		public document: ExtHostNotebookDocument,
		private _documentsAndEditors: ExtHostDocumentsAndEditors
	) {
		super();
		this._register(this._documentsAndEditors.onDidAddDocuments(documents => {
			for (const { document: textDocument } of documents) {
				let data = CellUri.parse(textDocument.uri);
				if (data) {
					if (this.document.uri.toString() === data.notebook.toString()) {
						document.attachCellTextDocument(textDocument);
					}
				}
			}
		}));

		this._register(this._documentsAndEditors.onDidRemoveDocuments(documents => {
			for (const { document: textDocument } of documents) {
				let data = CellUri.parse(textDocument.uri);
				if (data) {
					if (this.document.uri.toString() === data.notebook.toString()) {
						document.detachCellTextDocument(textDocument);
					}
				}
			}
		}));
	}

	createCell(content: string, language: string, type: CellKind, outputs: vscode.CellOutput[], metadata: vscode.NotebookCellMetadata | undefined): vscode.NotebookCell {
		const handle = ExtHostNotebookEditor._cellhandlePool++;
		const uri = CellUri.generate(this.document.uri, handle);
		const cell = new ExtHostCell(handle, uri, content, type, language, outputs, metadata);
		return cell;
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

	render(document: ExtHostNotebookDocument, cell: ExtHostCell, output: vscode.CellOutput, mimeType: string): string {
		let html = this.renderer.render(document, cell, output, mimeType);

		return html;
	}
}

export interface ExtHostNotebookOutputRenderingHandler {
	outputDisplayOrder: INotebookDisplayOrder | undefined;
	findBestMatchedRenderer(mimeType: string): ExtHostNotebookOutputRenderer[];
}

export class ExtHostNotebookController implements ExtHostNotebookShape, ExtHostNotebookOutputRenderingHandler {
	private static _handlePool: number = 0;

	private readonly _proxy: MainThreadNotebookShape;
	private readonly _notebookProviders = new Map<string, { readonly provider: vscode.NotebookProvider, readonly extension: IExtensionDescription; }>();
	private readonly _documents = new Map<string, ExtHostNotebookDocument>();
	private readonly _editors = new Map<string, { editor: ExtHostNotebookEditor, onDidReceiveMessage: Emitter<any> }>();
	private readonly _notebookOutputRenderers = new Map<number, ExtHostNotebookOutputRenderer>();
	private _outputDisplayOrder: INotebookDisplayOrder | undefined;

	get outputDisplayOrder(): INotebookDisplayOrder | undefined {
		return this._outputDisplayOrder;
	}

	private _activeNotebookDocument: ExtHostNotebookDocument | undefined;

	get activeNotebookDocument() {
		return this._activeNotebookDocument;
	}

	constructor(mainContext: IMainContext, commands: ExtHostCommands, private _documentsAndEditors: ExtHostDocumentsAndEditors) {
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
		return new VSCodeDisposable(() => {
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

	registerNotebookProvider(
		extension: IExtensionDescription,
		viewType: string,
		provider: vscode.NotebookProvider,
	): vscode.Disposable {

		if (this._notebookProviders.has(viewType)) {
			throw new Error(`Notebook provider for '${viewType}' already registered`);
		}

		this._notebookProviders.set(viewType, { extension, provider });
		this._proxy.$registerNotebookProvider({ id: extension.identifier, location: extension.extensionLocation }, viewType);
		return new VSCodeDisposable(() => {
			this._notebookProviders.delete(viewType);
			this._proxy.$unregisterNotebookProvider(viewType);
		});
	}

	async $resolveNotebook(viewType: string, uri: UriComponents): Promise<number | undefined> {
		let provider = this._notebookProviders.get(viewType);

		if (provider) {
			if (!this._documents.has(URI.revive(uri).toString())) {
				let document = new ExtHostNotebookDocument(this._proxy, viewType, URI.revive(uri), this);
				await this._proxy.$createNotebookDocument(
					document.handle,
					viewType,
					uri
				);

				this._documents.set(URI.revive(uri).toString(), document);
			}

			const onDidReceiveMessage = new Emitter<any>();

			let editor = new ExtHostNotebookEditor(
				viewType,
				`${ExtHostNotebookController._handlePool++}`,
				URI.revive(uri),
				this._proxy,
				onDidReceiveMessage,
				this._documents.get(URI.revive(uri).toString())!,
				this._documentsAndEditors
			);

			this._editors.set(URI.revive(uri).toString(), { editor, onDidReceiveMessage });
			await provider.provider.resolveNotebook(editor);
			// await editor.document.$updateCells();
			return editor.document.handle;
		}

		return Promise.resolve(undefined);
	}

	async $executeNotebook(viewType: string, uri: UriComponents, cellHandle: number | undefined): Promise<void> {
		let provider = this._notebookProviders.get(viewType);

		if (!provider) {
			return;
		}

		let document = this._documents.get(URI.revive(uri).toString());

		if (!document) {
			return;
		}

		let cell = cellHandle !== undefined ? document.getCell(cellHandle) : undefined;
		return provider.provider.executeCell(document!, cell);
	}

	async $createEmptyCell(viewType: string, uri: URI, index: number, language: string, type: CellKind): Promise<ICellDto | undefined> {
		let provider = this._notebookProviders.get(viewType);

		if (provider) {
			let editor = this._editors.get(URI.revive(uri).toString());
			let document = this._documents.get(URI.revive(uri).toString());

			let rawCell = editor?.editor.createCell('', language, type, [], { editable: true }) as ExtHostCell;
			document?.insertCell(index, rawCell!);

			let allDocuments = this._documentsAndEditors.allDocuments();
			for (let { document: textDocument } of allDocuments) {
				let data = CellUri.parse(textDocument.uri);
				if (data) {
					if (uri.toString() === data.notebook.toString() && textDocument.uri.toString() === rawCell.uri.toString()) {
						rawCell.attachTextDocument(textDocument);
					}
				}
			}
			return {
				uri: rawCell.uri,
				handle: rawCell.handle,
				source: rawCell.source,
				language: rawCell.language,
				cellKind: rawCell.cellKind,
				metadata: rawCell.metadata,
				outputs: []
			};
		}

		return;
	}

	async $deleteCell(viewType: string, uri: UriComponents, index: number): Promise<boolean> {
		let provider = this._notebookProviders.get(viewType);

		if (!provider) {
			return false;
		}

		let document = this._documents.get(URI.revive(uri).toString());

		if (document) {
			return document.deleteCell(index);
		}

		return false;
	}

	async $saveNotebook(viewType: string, uri: UriComponents): Promise<boolean> {
		let provider = this._notebookProviders.get(viewType);
		let document = this._documents.get(URI.revive(uri).toString());

		if (provider && document) {
			return await provider.provider.save(document);
		}

		return false;
	}

	async $updateActiveEditor(viewType: string, uri: UriComponents): Promise<void> {
		this._activeNotebookDocument = this._documents.get(URI.revive(uri).toString());
	}

	async $destoryNotebookDocument(viewType: string, uri: UriComponents): Promise<boolean> {
		let provider = this._notebookProviders.get(viewType);

		if (!provider) {
			return false;
		}

		let document = this._documents.get(URI.revive(uri).toString());

		if (document) {
			document.dispose();
			this._documents.delete(URI.revive(uri).toString());
		}

		let editor = this._editors.get(URI.revive(uri).toString());

		if (editor) {
			editor.editor.dispose();
			editor.onDidReceiveMessage.dispose();
			this._editors.delete(URI.revive(uri).toString());
		}

		return true;
	}

	$acceptDisplayOrder(displayOrder: INotebookDisplayOrder): void {
		this._outputDisplayOrder = displayOrder;
	}

	$onDidReceiveMessage(uri: UriComponents, message: any): void {
		let editor = this._editors.get(URI.revive(uri).toString());

		if (editor) {
			editor.onDidReceiveMessage.fire(message);
		}
	}
}
