/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { mapObservableArrayCached, derived, derivedObservableWithCache, observableFromEvent, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { isDefined } from '../../../../../base/common/types.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { EditorResourceAccessor } from '../../../../common/editor.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { DocumentWithSourceAnnotatedEdits, CombineStreamedChanges, MinimizeEditsProcessor } from './documentWithAnnotatedEdits.js';
let AnnotatedDocuments = class AnnotatedDocuments extends Disposable {
    constructor(_workspace, _instantiationService) {
        super();
        this._workspace = _workspace;
        this._instantiationService = _instantiationService;
        const uriVisibilityProvider = this._instantiationService.createInstance(UriVisibilityProvider);
        this._states = mapObservableArrayCached(this, this._workspace.documents, (doc, store) => {
            const docIsVisible = derived(reader => uriVisibilityProvider.isVisible(doc.uri, reader));
            const wasEverVisible = derivedObservableWithCache(this, (reader, lastVal) => lastVal || docIsVisible.read(reader));
            return wasEverVisible.map(v => v ? store.add(this._instantiationService.createInstance(AnnotatedDocument, doc, docIsVisible)) : undefined);
        });
        this.documents = this._states.map((vals, reader) => vals.map(v => v.read(reader)).filter(isDefined));
        this.documents.recomputeInitiallyAndOnChange(this._store);
    }
};
AnnotatedDocuments = __decorate([
    __param(1, IInstantiationService)
], AnnotatedDocuments);
export { AnnotatedDocuments };
let UriVisibilityProvider = class UriVisibilityProvider {
    constructor(_editorGroupsService) {
        this._editorGroupsService = _editorGroupsService;
        const onDidAddGroupSignal = observableSignalFromEvent(this, this._editorGroupsService.onDidAddGroup);
        const onDidRemoveGroupSignal = observableSignalFromEvent(this, this._editorGroupsService.onDidRemoveGroup);
        const groups = derived(this, reader => {
            onDidAddGroupSignal.read(reader);
            onDidRemoveGroupSignal.read(reader);
            return this._editorGroupsService.groups;
        });
        this.visibleUris = mapObservableArrayCached(this, groups, g => {
            const editors = observableFromEvent(this, g.onDidModelChange, () => g.editors);
            return editors.map(e => e.map(editor => EditorResourceAccessor.getCanonicalUri(editor)));
        }).map((editors, reader) => {
            const map = new Map();
            for (const urisObs of editors) {
                for (const uri of urisObs.read(reader)) {
                    if (isDefined(uri)) {
                        map.set(uri.toString(), uri);
                    }
                }
            }
            return map;
        });
    }
    isVisible(uri, reader) {
        return this.visibleUris.read(reader).has(uri.toString());
    }
};
UriVisibilityProvider = __decorate([
    __param(0, IEditorGroupsService)
], UriVisibilityProvider);
export { UriVisibilityProvider };
let AnnotatedDocument = class AnnotatedDocument extends Disposable {
    constructor(document, isVisible, _instantiationService) {
        super();
        this.document = document;
        this.isVisible = isVisible;
        this._instantiationService = _instantiationService;
        let processedDoc = this._store.add(new DocumentWithSourceAnnotatedEdits(document));
        // Combine streaming edits into one and make edit smaller
        processedDoc = this._store.add(this._instantiationService.createInstance((CombineStreamedChanges), processedDoc));
        // Remove common suffix and prefix from edits
        processedDoc = this._store.add(new MinimizeEditsProcessor(processedDoc));
        this.documentWithAnnotations = processedDoc;
    }
};
AnnotatedDocument = __decorate([
    __param(2, IInstantiationService)
], AnnotatedDocument);
export { AnnotatedDocument };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW5ub3RhdGVkRG9jdW1lbnRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZWRpdFRlbGVtZXRyeS9icm93c2VyL2hlbHBlcnMvYW5ub3RhdGVkRG9jdW1lbnRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRSxPQUFPLEVBQWUsd0JBQXdCLEVBQUUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLG1CQUFtQixFQUFFLHlCQUF5QixFQUFXLE1BQU0sMENBQTBDLENBQUM7QUFDL0wsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRWhFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3RFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ2pHLE9BQU8sRUFBK0MsZ0NBQWdDLEVBQUUsc0JBQXNCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQU96SyxJQUFNLGtCQUFrQixHQUF4QixNQUFNLGtCQUFtQixTQUFRLFVBQVU7SUFJakQsWUFDa0IsVUFBK0IsRUFDUixxQkFBNEM7UUFFcEYsS0FBSyxFQUFFLENBQUM7UUFIUyxlQUFVLEdBQVYsVUFBVSxDQUFxQjtRQUNSLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBdUI7UUFJcEYsTUFBTSxxQkFBcUIsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsY0FBYyxDQUFDLHFCQUFxQixDQUFDLENBQUM7UUFFL0YsSUFBSSxDQUFDLE9BQU8sR0FBRyx3QkFBd0IsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLFVB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