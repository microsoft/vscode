/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { ExtHostDocumentsShape, IMainContext, MainContext, MainThreadDocumentsShape } from './extHost.protocol.js';
import { ExtHostDocumentData, setWordDefinitionFor } from './extHostDocumentData.js';
import { ExtHostDocumentsAndEditors } from './extHostDocumentsAndEditors.js';
import * as TypeConverters from './extHostTypeConverters.js';
import type * as vscode from 'vscode';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { deepFreeze } from '../../../base/common/objects.js';
import { TextDocumentChangeReason } from './extHostTypes.js';
import { ISerializedModelContentChangedEvent } from '../../../editor/common/textModelEvents.js';

export class ExtHostDocuments implements ExtHostDocumentsShape {

	private readonly _onDidAddDocument = new Emitter<vscode.TextDocument>();
	private readonly _onDidRemoveDocument = new Emitter<vscode.TextDocument>();
	private readonly _onDidChangeDocument = new Emitter<Omit<vscode.TextDocumentChangeEvent, 'detailedReason'>>();
	private readonly _onDidChangeDocumentWithReason = new Emitter<vscode.TextDocumentChangeEvent>();
	private readonly _onDidSaveDocument = new Emitter<vscode.TextDocument>();

	readonly onDidAddDocument: Event<vscode.TextDocument> = this._onDidAddDocument.event;
	readonly onDidRemoveDocument: Event<vscode.TextDocument> = this._onDidRemoveDocument.event;
	readonly onDidChangeDocument: Event<vscode.TextDocumentChangeEvent> = this._onDidChangeDocument.event as Event<vscode.TextDocumentChangeEvent>;
	readonly onDidChangeDocumentWithReason: Event<vscode.TextDocumentChangeEvent> = this._onDidChangeDocumentWithReason.event;
	readonly onDidSaveDocument: Event<vscode.TextDocument> = this._onDidSaveDocument.event;

	private readonly _toDispose = new DisposableStore();
	private _proxy: MainThreadDocumentsShape;
	private _documentsAndEditors: ExtHostDocumentsAndEditors;
	private _documentLoader = new Map<string, Promise<ExtHostDocumentData>>();

	constructor(mainContext: IMainContext, documentsAndEditors: ExtHostDocumentsAndEditors) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadDocuments);
		this._documentsAndEditors = documentsAndEditors;

		this._documentsAndEditors.onDidRemoveDocuments(documents => {
			for (const data of documents) {
				this._onDidRemoveDocument.fire(data.document);
			}
		}, undefined, this._toDispose);
		this._documentsAndEditors.onDidAddDocuments(documents => {
			for (const data of documents) {
				this._onDidAddDocument.fire(data.document);
			}
		}, undefined, this._toDispose);
	}

	public dispose(): void {
		this._toDispose.dispose();
	}

	public getAllDocumentData(): ExtHostDocumentData[] {
		return [...this._documentsAndEditors.allDocuments()];
	}

	public getDocumentData(resource: vscode.Uri): ExtHostDocumentData | undefined {
		if (!resource) {
			return undefined;
		}
		const data = this._documentsAndEditors.getDocument(resource);
		if (data) {
			return data;
		}
		return undefined;
	}

	public getDocument(resource: vscode.Uri): vscode.TextDocument {
		const data = this.getDocumentData(resource);
		if (!data?.document) {
			throw new Error(`Unable to retrieve document from URI '${resource}'`);
		}
		return data.document;
	}

	public ensureDocumentData(uri: URI, options?: { encoding?: string }): Promise<ExtHostDocumentData> {

		const cached = this._documentsAndEditors.getDocument(uri);
		if (cached && (!options?.encoding || cached.document.encoding === options.encoding)) {
			return Promise.resolve(cached);
		}

		let promise = this._documentLoader.get(uri.toString());
		if (!promise) {
			promise = this._proxy.$tryOpenDocument(uri, options).then(uriData => {
				this._documentLoader.delete(uri.toString());
				const canonicalUri = URI.revive(uriData);
				return assertReturnsDefined(this._documentsAndEditors.getDocument(canonicalUri));
			}, err => {
				this._documentLoader.delete(uri.toString());
				return Promise.reject(err);
			});
			this._documentLoader.set(uri.toString(), promise);
		} else {
			if (options?.encoding) {
				promise = promise.then(data => {
					if (data.document.encoding !== options.encoding) {
						return this.ensureDocumentData(uri, options);
					}
					return data;
				});
			}
		}

		return promise;
	}

	public createDocumentData(options?: { language?: string; content?: string; encoding?: string }): Promise<URI> {
		return this._proxy.$tryCreateDocument(options).then(data => URI.revive(data));
	}

	public $acceptModelLanguageChanged(uriComponents: UriComponents, newLanguageId: string): void {
		const uri = URI.revive(uriComponents);
		const data = this._documentsAndEditors.getDocument(uri);
		if (!data) {
			throw new Error('unknown document');
		}
		// Treat a language change as a remove + add

		this._onDidRemoveDocument.fire(data.document);
		data._acceptLanguageId(newLanguageId);
		this._onDidAddDocument.fire(data.document);
	}

	public $acceptModelSaved(uriComponents: UriComponents): void {
		const uri = URI.revive(uriComponents);
		const data = this._documentsAndEditors.getDocument(uri);
		if (!data) {
			throw new Error('unknown document');
		}
		this.$acceptDirtyStateChanged(uriComponents, false);
		this._onDidSaveDocument.fire(data.document);
	}

	public $acceptDirtyStateChanged(uriComponents: UriComponents, isDirty: boolean): void {
		const uri = URI.revive(uriComponents);
		const data = this._documentsAndEditors.getDocument(uri);
		if (!data) {
			throw new Error('unknown document');
		}
		data._acceptIsDirty(isDirty);
		this._onDidChangeDocument.fire({
			document: data.document,
			contentChanges: [],
			reason: undefined,
		});
		this._onDidChangeDocumentWithReason.fire({
			document: data.document,
			contentChanges: [],
			reason: undefined,
			detailedReason: undefined,
		});
	}

	public $acceptEncodingChanged(uriComponents: UriComponents, encoding: string): void {
		const uri = URI.revive(uriComponents);
		const data = this._documentsAndEditors.getDocument(uri);
		if (!data) {
			throw new Error('unknown document');
		}
		data._acceptEncoding(encoding);
		this._onDidChangeDocument.fire({
			document: data.document,
			contentChanges: [],
			reason: undefined,
		});
		this._onDidChangeDocumentWithReason.fire({
			document: data.document,
			contentChanges: [],
			reason: undefined,
			detailedReason: undefined,
		});
	}

	public $acceptModelChanged(uriComponents: UriComponents, events: ISerializedModelContentChangedEvent, isDirty: boolean): void {
		const uri = URI.revive(uriComponents);
		const data = this._documentsAndEditors.getDocument(uri);
		if (!data) {
			throw new Error('unknown document');
		}
		data._acceptIsDirty(isDirty);
		data.onEvents(events);

		let reason: vscode.TextDocumentChangeReason | undefined = undefined;
		if (events.isUndoing) {
			reason = TextDocumentChangeReason.Undo;
		} else if (events.isRedoing) {
			reason = TextDocumentChangeReason.Redo;
		}

		this._onDidChangeDocument.fire(deepFreeze<Omit<vscode.TextDocumentChangeEvent, 'detailedReason'>>({
			document: data.document,
			contentChanges: events.changes.map((change) => {
				return {
					range: TypeConverters.Range.to(change.range),
					rangeOffset: change.rangeOffset,
					rangeLength: change.rangeLength,
					text: change.text
				};
			}),
			reason,
		}));
		this._onDidChangeDocumentWithReason.fire(deepFreeze<vscode.TextDocumentChangeEvent>({
			document: data.document,
			contentChanges: events.changes.map((change) => {
				return {
					range: TypeConverters.Range.to(change.range),
					rangeOffset: change.rangeOffset,
					rangeLength: change.rangeLength,
					text: change.text
				};
			}),
			reason,
			detailedReason: events.detailedReason ? {
				source: events.detailedReason.source as string,
				metadata: events.detailedReason,
			} : undefined,
		}));
	}

	public setWordDefinitionFor(languageId: string, wordDefinition: RegExp | undefined): void {
		setWordDefinitionFor(languageId, wordDefinition);
	}
}
