/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IModelChangedEvent } from 'vs/editor/common/model/mirrorTextModel';
import { ExtHostDocumentsShape, IMainContext, MainContext, MainThreadDocumentsShape } from 'vs/workbench/api/node/extHost.protocol';
import { ExtHostDocumentData, setWordDefinitionFor } from 'vs/workbench/api/node/extHostDocumentData';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/node/extHostDocumentsAndEditors';
import * as TypeConverters from 'vs/workbench/api/node/extHostTypeConverters';
import * as vscode from 'vscode';

export class ExtHostDocuments implements ExtHostDocumentsShape {

	private _onDidAddDocument = new Emitter<vscode.TextDocument>();
	private _onDidRemoveDocument = new Emitter<vscode.TextDocument>();
	private _onDidChangeDocument = new Emitter<vscode.TextDocumentChangeEvent>();
	private _onDidSaveDocument = new Emitter<vscode.TextDocument>();

	readonly onDidAddDocument: Event<vscode.TextDocument> = this._onDidAddDocument.event;
	readonly onDidRemoveDocument: Event<vscode.TextDocument> = this._onDidRemoveDocument.event;
	readonly onDidChangeDocument: Event<vscode.TextDocumentChangeEvent> = this._onDidChangeDocument.event;
	readonly onDidSaveDocument: Event<vscode.TextDocument> = this._onDidSaveDocument.event;

	private _toDispose: IDisposable[];
	private _proxy: MainThreadDocumentsShape;
	private _documentsAndEditors: ExtHostDocumentsAndEditors;
	private _documentLoader = new Map<string, Promise<ExtHostDocumentData>>();

	constructor(mainContext: IMainContext, documentsAndEditors: ExtHostDocumentsAndEditors) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadDocuments);
		this._documentsAndEditors = documentsAndEditors;

		this._toDispose = [
			this._documentsAndEditors.onDidRemoveDocuments(documents => {
				for (const data of documents) {
					this._onDidRemoveDocument.fire(data.document);
				}
			}),
			this._documentsAndEditors.onDidAddDocuments(documents => {
				for (const data of documents) {
					this._onDidAddDocument.fire(data.document);
				}
			})
		];
	}

	public dispose(): void {
		dispose(this._toDispose);
	}

	public getAllDocumentData(): ExtHostDocumentData[] {
		return this._documentsAndEditors.allDocuments();
	}

	public getDocumentData(resource: vscode.Uri): ExtHostDocumentData {
		if (!resource) {
			return undefined;
		}
		const data = this._documentsAndEditors.getDocument(resource.toString());
		if (data) {
			return data;
		}
		return undefined;
	}

	public ensureDocumentData(uri: URI): Promise<ExtHostDocumentData> {

		let cached = this._documentsAndEditors.getDocument(uri.toString());
		if (cached) {
			return Promise.resolve(cached);
		}

		let promise = this._documentLoader.get(uri.toString());
		if (!promise) {
			promise = this._proxy.$tryOpenDocument(uri).then(() => {
				this._documentLoader.delete(uri.toString());
				return this._documentsAndEditors.getDocument(uri.toString());
			}, err => {
				this._documentLoader.delete(uri.toString());
				return Promise.reject(err);
			});
			this._documentLoader.set(uri.toString(), promise);
		}

		return promise;
	}

	public createDocumentData(options?: { language?: string; content?: string }): Promise<URI> {
		return this._proxy.$tryCreateDocument(options).then(data => URI.revive(data));
	}

	public $acceptModelModeChanged(uriComponents: UriComponents, oldModeId: string, newModeId: string): void {
		const uri = URI.revive(uriComponents);
		const strURL = uri.toString();
		let data = this._documentsAndEditors.getDocument(strURL);

		// Treat a mode change as a remove + add

		this._onDidRemoveDocument.fire(data.document);
		data._acceptLanguageId(newModeId);
		this._onDidAddDocument.fire(data.document);
	}

	public $acceptModelSaved(uriComponents: UriComponents): void {
		const uri = URI.revive(uriComponents);
		const strURL = uri.toString();
		let data = this._documentsAndEditors.getDocument(strURL);
		this.$acceptDirtyStateChanged(uriComponents, false);
		this._onDidSaveDocument.fire(data.document);
	}

	public $acceptDirtyStateChanged(uriComponents: UriComponents, isDirty: boolean): void {
		const uri = URI.revive(uriComponents);
		const strURL = uri.toString();
		let data = this._documentsAndEditors.getDocument(strURL);
		data._acceptIsDirty(isDirty);
		this._onDidChangeDocument.fire({
			document: data.document,
			contentChanges: []
		});
	}

	public $acceptModelChanged(uriComponents: UriComponents, events: IModelChangedEvent, isDirty: boolean): void {
		const uri = URI.revive(uriComponents);
		const strURL = uri.toString();
		let data = this._documentsAndEditors.getDocument(strURL);
		data._acceptIsDirty(isDirty);
		data.onEvents(events);
		this._onDidChangeDocument.fire({
			document: data.document,
			contentChanges: events.changes.map((change) => {
				return {
					range: TypeConverters.Range.to(change.range),
					rangeOffset: change.rangeOffset,
					rangeLength: change.rangeLength,
					text: change.text
				};
			})
		});
	}

	public setWordDefinitionFor(modeId: string, wordDefinition: RegExp): void {
		setWordDefinitionFor(modeId, wordDefinition);
	}
}
