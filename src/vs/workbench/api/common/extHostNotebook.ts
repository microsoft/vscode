/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ExtHostNotebookShape, IMainContext, MainThreadNotebookShape, MainContext, MainThreadDocumentsShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { Disposable as VSCodeDisposable } from './extHostTypes';
import { URI } from 'vs/base/common/uri';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { readonly } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
// import { ExtHostDocumentData } from 'vs/workbench/api/common/extHostDocumentData';

export class ExtHostCell implements vscode.NotebookCell {

	private static _handlePool: number = 0;
	readonly handle = ExtHostCell._handlePool++;
	public source: string[];
	private _outputs: any[];
	private _onDidChangeOutputs = new Emitter<void>();
	onDidChangeOutputs: Event<void> = this._onDidChangeOutputs.event;
	private _textDocument: vscode.TextDocument | undefined;
	private _initalVersion: number = -1;

	constructor(
		private _content: string,
		public cell_type: 'markdown' | 'code',
		public language: string,
		outputs: any[]
	) {
		this.source = this._content.split(/\r|\n|\r\n/g);
		this._outputs = outputs;
	}

	get outputs() {
		return this._outputs;
	}

	set outputs(newOutputs: any[]) {
		this._outputs = newOutputs;
		this._onDidChangeOutputs.fire();
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

export class ExtHostNotebookDocument implements vscode.NotebookDocument {
	private static _handlePool: number = 0;
	readonly handle = ExtHostNotebookDocument._handlePool++;

	private _cells: ExtHostCell[] = [];

	get cells() {
		return this._cells;
	}

	set cells(newCells: ExtHostCell[]) {
		this._cells = newCells;
		this._cells.forEach(cell => {
			cell.onDidChangeOutputs(() => {
				this._proxy.$updateNotebookCell(this.handle, {
					handle: cell.handle,
					source: cell.source,
					language: cell.language,
					cell_type: cell.cell_type,
					outputs: cell.outputs
				});
			});
		});

	}

	constructor(
		private readonly _proxy: MainThreadNotebookShape,
		public uri: URI
	) {

	}

	get fileName() { return this.uri.fsPath; }

	get isDirty() { return false; }

	async $updateCells(): Promise<void> {
		return await this._proxy.$updateNotebookCells(this.handle, this.cells.map(cell => ({
			handle: cell.handle,
			source: cell.source,
			language: cell.language,
			cell_type: cell.cell_type,
			outputs: cell.outputs
		})));
	}

	getActiveCell(cellHandle: number) {
		return this.cells.find(cell => cell.handle === cellHandle);
	}

	attachCellTextDocument(cellHandle: number, textDocument: vscode.TextDocument) {
		let cell = this.cells.find(cell => cell.handle === cellHandle);

		if (cell) {
			cell.attachTextDocument(textDocument);
		}
	}

	detachCellTextDocument(cellHandle: number, textDocument: vscode.TextDocument) {
		let cell = this.cells.find(cell => cell.handle === cellHandle);

		if (cell) {
			cell.detachTextDocument(textDocument);
		}
	}
}

export class ExtHostNotebookEditor implements vscode.NotebookEditor {
	private _viewColumn: vscode.ViewColumn | undefined;

	constructor(
		private viewType: string,
		private readonly _proxy: MainThreadNotebookShape,
		readonly id: string,
		public uri: URI,
		public document: ExtHostNotebookDocument,
		private readonly documentsProxy: MainThreadDocumentsShape,
		private _documentsAndEditors: ExtHostDocumentsAndEditors
	) {
		let regex = new RegExp(`notebook\\+${viewType}-(\\d+)-(\\d+)`);
		this._documentsAndEditors.onDidAddDocuments(documents => {
			for (const data of documents) {
				let textDocument = data.document;
				let authority = textDocument.uri.authority;

				if (authority !== '') {
					let matches = regex.exec(authority);
					if (matches) {
						const notebookHandle = matches[1];
						const cellHandle = matches[2];

						if (Number(notebookHandle) === this.document.handle) {
							document.attachCellTextDocument(Number(cellHandle), textDocument);
						}
					}
				}
			}
		});

		this._documentsAndEditors.onDidRemoveDocuments(documents => {
			for (const data of documents) {
				let textDocument = data.document;
				let authority = textDocument.uri.authority;

				if (authority !== '') {
					let matches = regex.exec(authority);
					if (matches) {
						const notebookHandle = matches[1];
						const cellHandle = matches[2];

						if (Number(notebookHandle) === this.document.handle) {
							document.detachCellTextDocument(Number(cellHandle), textDocument);
						}
					}
				}
			}
		});
	}

	createCell(content: string, language: string, type: 'markdown' | 'code', outputs: vscode.CellOutput[]): vscode.NotebookCell {
		let cell = new ExtHostCell(content, type, language, outputs);
		return cell;
	}

	get viewColumn(): vscode.ViewColumn | undefined {
		return this._viewColumn;
	}

	set viewColumn(value) {
		throw readonly('viewColumn');
	}
}

export class ExtHostNotebookController implements ExtHostNotebookShape {
	private static _handlePool: number = 0;

	private readonly _proxy: MainThreadNotebookShape;
	private readonly _documentsProxy: MainThreadDocumentsShape;
	private readonly _notebookProviders = new Map<string, { readonly provider: vscode.NotebookProvider, readonly extension: IExtensionDescription }>();
	private readonly _localStore = new DisposableStore();
	private readonly _documents = new Map<string, ExtHostNotebookDocument>();


	constructor(mainContext: IMainContext, private _documentsAndEditors: ExtHostDocumentsAndEditors) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadNotebook);
		this._documentsProxy = mainContext.getProxy(MainContext.MainThreadDocuments);

	}

	public registerNotebookProvider(
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

	async $resolveNotebook(viewType: string, uri: URI): Promise<number | undefined> {
		let provider = this._notebookProviders.get(viewType);

		if (provider) {
			if (!this._documents.has(URI.revive(uri).toString())) {
				let document = new ExtHostNotebookDocument(this._proxy, uri);
				await this._proxy.$createNotebookDocument(
					document.handle,
					uri
				);

				this._documents.set(URI.revive(uri).toString(), document);
			}

			let editor = new ExtHostNotebookEditor(
				viewType,
				this._proxy,
				`${ExtHostNotebookController._handlePool++}`,
				uri,
				this._documents.get(URI.revive(uri).toString())!,
				this._documentsProxy,
				this._documentsAndEditors
			);
			await provider.provider.resolveNotebook(editor);
			await editor.document.$updateCells();
			return editor.document.handle;
		}

		return Promise.resolve(undefined);
	}

	async $executeNotebook(viewType: string, uri: URI): Promise<void> {
		let provider = this._notebookProviders.get(viewType);

		if (provider) {
			// return provider.provider.executeNotebook(uri);
		}
	}

	async $executeNotebookCell(viewType: string, uri: URI, cellHandle: number): Promise<void> {
		let provider = this._notebookProviders.get(viewType);

		if (provider) {
			let document = this._documents.get(URI.revive(uri).toString());
			let cell = document?.getActiveCell(cellHandle);

			if (cell) {
				return provider.provider.executeCell(document!, cell!);
			}
		}

	}

}
