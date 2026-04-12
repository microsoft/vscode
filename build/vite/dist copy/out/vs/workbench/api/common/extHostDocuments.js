/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../base/common/event.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { MainContext } from './extHost.protocol.js';
import { setWordDefinitionFor } from './extHostDocumentData.js';
import * as TypeConverters from './extHostTypeConverters.js';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { deepFreeze } from '../../../base/common/objects.js';
import { TextDocumentChangeReason } from './extHostTypes.js';
export class ExtHostDocuments {
    constructor(mainContext, documentsAndEditors) {
        this._toDispose = new DisposableStore();
        this._onDidAddDocument = this._toDispose.add(new Emitter());
        this._onDidRemoveDocument = this._toDispose.add(new Emitter());
        this._onDidChangeDocument = this._toDispose.add(new Emitter());
        this._onDidChangeDocumentWithReason = this._toDispose.add(new Emitter());
        this._onDidSaveDocument = this._toDispose.add(new Emitter());
        this.onDidAddDocument = this._onDidAddDocument.event;
        this.onDidRemoveDocument = this._onDidRemoveDocument.event;
        this.onDidChangeDocument = this._onDidChangeDocument.event;
        this.onDidChangeDocumentWithReason = this._onDidChangeDocumentWithReason.event;
        this.onDidSaveDocument = this._onDidSaveDocument.event;
        this._documentLoader = new Map();
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
    dispose() {
        this._toDispose.dispose();
    }
    getAllDocumentData() {
        return [...this._documentsAndEditors.allDocuments()];
    }
    getDocumentData(resource) {
        if (!resource) {
            return undefined;
        }
        const data = this._documentsAndEditors.getDocument(resource);
        if (data) {
            return data;
        }
        return undefined;
    }
    getDocument(resource) {
        const data = this.getDocumentData(resource);
        if (!data?.document) {
            throw new Error(`Unable to retrieve document from URI '${resource}'`);
        }
        return data.document;
    }
    ensureDocumentData(uri, options) {
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
        }
        else {
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
    createDocumentData(options) {
        return this._proxy.$tryCreateDocument(options).then(data => URI.revive(data));
    }
    $acceptModelLanguageChanged(uriComponents, newLanguageId) {
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
    $acceptModelSaved(uriComponents) {
        const uri = URI.revive(uriComponents);
        const data = this._documentsAndEditors.getDocument(uri);
        if (!data) {
            throw new Error('unknown document');
        }
        this.$acceptDirtyStateChanged(uriComponents, false);
        this._onDidSaveDocument.fire(data.document);
    }
    $acceptDirtyStateChanged(uriComponents, isDirty) {
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
    $acceptEncodingChanged(uriComponents, encoding) {
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
    $acceptModelChanged(uriComponents, events, isDirty) {
        const uri = URI.revive(uriComponents);
        const data = this._documentsAndEditors.getDocument(uri);
        if (!data) {
            throw new Error('unknown document');
        }
        data._acceptIsDirty(isDirty);
        data.onEvents(events);
        let reason = undefined;
        if (events.isUndoing) {
            reason = TextDocumentChangeReason.Undo;
        }
        else if (events.isRedoing) {
            reason = TextDocumentChangeReason.Redo;
        }
        this._onDidChangeDocument.fire(deepFreeze({
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
        this._onDidChangeDocumentWithReason.fire(deepFreeze({
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
                source: events.detailedReason.source,
                metadata: events.detailedReason,
            } : undefined,
        }));
    }
    setWordDefinitionFor(languageId, wordDefinition) {
        setWordDefinitionFor(languageId, wordDefinition);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdERvY3VtZW50cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3REb2N1bWVudHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLDZCQUE2QixDQUFDO0FBQ2pFLE9BQU8sRUFBdUMsV0FBVyxFQUE0QixNQUFNLHVCQUF1QixDQUFDO0FBQ25ILE9BQU8sRUFBdUIsb0JBQW9CLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUVyRixPQUFPLEtBQUssY0FBYyxNQUFNLDRCQUE0QixDQUFDO0FBRTdELE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3JFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUc3RCxNQUFNLE9BQU8sZ0JBQWdCO0lBbUI1QixZQUFZLFdBQXlCLEVBQUUsbUJBQStDO1FBakJyRSxlQUFVLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUVuQyxzQkFBaUIsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxJQUFJLE9BQU8sRUFBdUIsQ0FBQyxDQUFDO1FBQzVFLHlCQUFvQixHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksT0FBTyxFQUF1QixDQUFDLENBQUM7UUFDL0UseUJBQW9CLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsSUFBSSxPQUFPLEVBQTBELENBQUMsQ0FBQztRQUNs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