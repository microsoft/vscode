/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { onUnexpectedError } from 'vs/base/common/errors';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import Event, { Emitter } from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Disposable } from 'vs/workbench/api/node/extHostTypes';
import * as TypeConverters from './extHostTypeConverters';
import { TPromise } from 'vs/base/common/winjs.base';
import * as vscode from 'vscode';
import { asWinJsPromise } from 'vs/base/common/async';
import { TextSource } from 'vs/editor/common/model/textSource';
import { MainContext, MainThreadDocumentsShape, ExtHostDocumentsShape } from './extHost.protocol';
import { ExtHostDocumentData, setWordDefinitionFor } from './extHostDocumentData';
import { ExtHostDocumentsAndEditors } from './extHostDocumentsAndEditors';

export class ExtHostDocuments extends ExtHostDocumentsShape {

	private static _handlePool: number = 0;

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
	private _documentLoader = new Map<string, TPromise<ExtHostDocumentData>>();
	private _documentContentProviders = new Map<number, vscode.TextDocumentContentProvider>();


	constructor(threadService: IThreadService, documentsAndEditors: ExtHostDocumentsAndEditors) {
		super();
		this._proxy = threadService.get(MainContext.MainThreadDocuments);
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

	public ensureDocumentData(uri: URI): TPromise<ExtHostDocumentData> {

		let cached = this._documentsAndEditors.getDocument(uri.toString());
		if (cached) {
			return TPromise.as(cached);
		}

		let promise = this._documentLoader.get(uri.toString());
		if (!promise) {
			promise = this._proxy.$tryOpenDocument(uri).then(() => {
				this._documentLoader.delete(uri.toString());
				return this._documentsAndEditors.getDocument(uri.toString());
			}, err => {
				this._documentLoader.delete(uri.toString());
				return TPromise.wrapError(err);
			});
			this._documentLoader.set(uri.toString(), promise);
		}

		return promise;
	}

	public createDocumentData(options?: { language?: string; content?: string }): TPromise<URI> {
		return this._proxy.$tryCreateDocument(options);
	}

	public registerTextDocumentContentProvider(scheme: string, provider: vscode.TextDocumentContentProvider): vscode.Disposable {
		if (scheme === 'file' || scheme === 'untitled') {
			throw new Error(`scheme '${scheme}' already registered`);
		}

		const handle = ExtHostDocuments._handlePool++;

		this._documentContentProviders.set(handle, provider);
		this._proxy.$registerTextContentProvider(handle, scheme);

		let subscription: IDisposable;
		if (typeof provider.onDidChange === 'function') {
			subscription = provider.onDidChange(uri => {
				if (this._documentsAndEditors.getDocument(uri.toString())) {
					this.$provideTextDocumentContent(handle, <URI>uri).then(value => {

						const document = this._documentsAndEditors.getDocument(uri.toString());
						if (!document) {
							// disposed in the meantime
							return;
						}

						// create lines and compare
						const textSource = TextSource.fromString(value, editorCommon.DefaultEndOfLine.CRLF);

						// broadcast event when content changed
						if (!document.equalLines(textSource)) {
							return this._proxy.$onVirtualDocumentChange(<URI>uri, textSource);
						}

					}, onUnexpectedError);
				}
			});
		}
		return new Disposable(() => {
			if (this._documentContentProviders.delete(handle)) {
				this._proxy.$unregisterTextContentProvider(handle);
			}
			if (subscription) {
				subscription.dispose();
				subscription = undefined;
			}
		});
	}

	public $provideTextDocumentContent(handle: number, uri: URI): TPromise<string> {
		const provider = this._documentContentProviders.get(handle);
		if (!provider) {
			return TPromise.wrapError<string>(`unsupported uri-scheme: ${uri.scheme}`);
		}
		return asWinJsPromise(token => provider.provideTextDocumentContent(uri, token));
	}

	public $acceptModelModeChanged(strURL: string, oldModeId: string, newModeId: string): void {
		let data = this._documentsAndEditors.getDocument(strURL);

		// Treat a mode change as a remove + add

		this._onDidRemoveDocument.fire(data.document);
		data._acceptLanguageId(newModeId);
		this._onDidAddDocument.fire(data.document);
	}

	public $acceptModelSaved(strURL: string): void {
		let data = this._documentsAndEditors.getDocument(strURL);
		data._acceptIsDirty(false);
		this._onDidSaveDocument.fire(data.document);
	}

	public $acceptModelDirty(strURL: string): void {
		let document = this._documentsAndEditors.getDocument(strURL);
		document._acceptIsDirty(true);
	}

	public $acceptModelReverted(strURL: string): void {
		let document = this._documentsAndEditors.getDocument(strURL);
		document._acceptIsDirty(false);
	}

	public $acceptModelChanged(strURL: string, events: editorCommon.IModelContentChangedEvent2[], isDirty: boolean): void {
		let data = this._documentsAndEditors.getDocument(strURL);
		data._acceptIsDirty(isDirty);
		data.onEvents(events);
		this._onDidChangeDocument.fire({
			document: data.document,
			contentChanges: events.map((e) => {
				return {
					range: TypeConverters.toRange(e.range),
					rangeLength: e.rangeLength,
					text: e.text
				};
			})
		});
	}

	public setWordDefinitionFor(modeId: string, wordDefinition: RegExp): void {
		setWordDefinitionFor(modeId, wordDefinition);
	}
}
