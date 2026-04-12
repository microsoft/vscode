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
var BulkFileOperations_1, BulkEditPreviewProvider_1;
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { createTextBufferFactoryFromSnapshot } from '../../../../../editor/common/model/textModel.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { coalesceInPlace } from '../../../../../base/common/arrays.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { EditOperation } from '../../../../../editor/common/core/editOperation.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ConflictDetector } from '../conflicts.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { localize } from '../../../../../nls.js';
import { extUri } from '../../../../../base/common/resources.js';
import { ResourceFileEdit, ResourceTextEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { SnippetParser } from '../../../../../editor/contrib/snippet/browser/snippetParser.js';
import { MicrotaskDelay } from '../../../../../base/common/symbols.js';
import { Schemas } from '../../../../../base/common/network.js';
export class CheckedStates {
    constructor() {
        this._states = new WeakMap();
        this._checkedCount = 0;
        this._onDidChange = new Emitter();
        this.onDidChange = this._onDidChange.event;
    }
    dispose() {
        this._onDidChange.dispose();
    }
    get checkedCount() {
        return this._checkedCount;
    }
    isChecked(obj) {
        return this._states.get(obj) ?? false;
    }
    updateChecked(obj, value) {
        const valueNow = this._states.get(obj);
        if (valueNow === value) {
            return;
        }
        if (valueNow === undefined) {
            if (value) {
                this._checkedCount += 1;
            }
        }
        else {
            if (value) {
                this._checkedCount += 1;
            }
            else {
                this._checkedCount -= 1;
            }
        }
        this._states.set(obj, value);
        this._onDidChange.fire(obj);
    }
}
export class BulkTextEdit {
    constructor(parent, textEdit) {
        this.parent = parent;
        this.textEdit = textEdit;
    }
}
export var BulkFileOperationType;
(function (BulkFileOperationType) {
    BulkFileOperationType[BulkFileOperationType["TextEdit"] = 1] = "TextEdit";
    BulkFileOperationType[BulkFileOperationType["Create"] = 2] = "Create";
    BulkFileOperationType[BulkFileOperationType["Delete"] = 4] = "Delete";
    BulkFileOperationType[BulkFileOperationType["Rename"] = 8] = "Rename";
})(BulkFileOperationType || (BulkFileOperationType = {}));
export class BulkFileOperation {
    constructor(uri, parent) {
        this.uri = uri;
        this.parent = parent;
        this.type = 0;
        this.textEdits = [];
        this.originalEdits = new Map();
    }
    addEdit(index, type, edit) {
        this.type |= type;
        this.originalEdits.set(index, edit);
        if (edit instanceof ResourceTextEdit) {
            this.textEdits.push(new BulkTextEdit(this, edit));
        }
        else if (type === 8 /* BulkFileOperationType.Rename */) {
            this.newUri = edit.newResource;
        }
    }
    needsConfirmation() {
        for (const [, edit] of this.originalEdits) {
            if (!this.parent.checked.isChecked(edit)) {
                return true;
            }
        }
        return false;
    }
}
export class BulkCategory {
    static { this._defaultMetadata = Object.freeze({
        label: localize('default', "Other"),
        icon: Codicon.symbolFile,
        needsConfirmation: false
    }); }
    static keyOf(metadata) {
        return metadata?.label || '<default>';
    }
    constructor(metadata = BulkCategory._defaultMetadata) {
        this.metadata = metadata;
        this.operationByResource = new Map();
    }
    get fileOperations() {
        return this.operationByResource.values();
    }
}
let BulkFileOperations = BulkFileOperations_1 = class BulkFileOperations {
    static async create(accessor, bulkEdit) {
        const result = accessor.get(IInstantiationService).createInstance(BulkFileOperations_1, bulkEdit);
        return await result._init();
    }
    constructor(_bulkEdit, _fileService, instaService) {
        this._bulkEdit = _bulkEdit;
        this._fileService = _fileService;
        this.checked = new CheckedStates();
        this.fileOperations = [];
        this.categories = [];
        this.conflicts = instaService.createInstance(ConflictDetector, _bulkEdit);
    }
    dispose() {
        this.checked.dispose();
        this.conflicts.dispose();
    }
    async _init() {
        const operationByResource = new Map();
        const operationByCategory = new Map();
        const newToOldUri = new ResourceMap();
        for (let idx = 0; idx < this._bulkEdit.length; idx++) {
            const edit = this._bulkEdit[idx];
            let uri;
            let type;
            // store inital checked state
            this.checked.updateChecked(edit, !edit.metadata?.needsConfirmation);
            if (edit instanceof ResourceTextEdit) {
                type = 1 /* BulkFileOperationType.TextEdit */;
                uri = edit.resource;
            }
            else if (edit instanceof ResourceFileEdit) {
                if (edit.newResource && edit.oldResource) {
                    type = 8 /* BulkFileOperationType.Rename */;
                    uri = edit.oldResource;
                    if (edit.options?.overwrite === undefined && edit.options?.ignoreIfExists && await this._fileService.exists(uri)) {
                        // noop -> "soft" rename to something that already exists
                        continue;
                    }
                    // map newResource onto oldResource so that text-edit appear for
                    // the same file element
                    newToOldUri.set(edit.newResource, uri);
                }
                else if (edit.oldResource) {
                    type = 4 /* BulkFileOperationType.Delete */;
                    uri = edit.oldResource;
                    if (edit.options?.ignoreIfNotExists && !await this._fileService.exists(uri)) {
                        // noop -> "soft" delete something that doesn't exist
                        continue;
                    }
                }
                else if (edit.newResource) {
                    type = 2 /* BulkFileOperationType.Create */;
                    uri = edit.newResource;
                    if (edit.options?.overwrite === undefined && edit.options?.ignoreIfExists && await this._fileService.exists(uri)) {
                        // noop -> "soft" create something that already exists
                        continue;
                    }
                }
                else {
                    // invalid edit -> skip
                    continue;
                }
            }
            else {
                // unsupported edit
                continue;
            }
            const insert = (uri, map) => {
                let key = extUri.getComparisonKey(uri, true);
                let operation = map.get(key);
                // rename
                if (!operation && newToOldUri.has(uri)) {
                    uri = newToOldUri.get(uri);
                    key = extUri.getComparisonKey(uri, true);
                    operation = map.get(key);
                }
                if (!operation) {
                    operation = new BulkFileOperation(uri, this);
                    map.set(key, operation);
                }
                operation.addEdit(idx, type, edit);
            };
            insert(uri, operationByResource);
            // insert into "this" category
            const key = BulkCategory.keyOf(edit.metadata);
            let category = operationByCategory.get(key);
            if (!category) {
                category = new BulkCategory(edit.metadata);
                operationByCategory.set(key, category);
            }
            insert(uri, category.operationByResource);
        }
        operationByResource.forEach(value => this.fileOperations.push(value));
        operationByCategory.forEach(value => this.categories.push(value));
        // "correct" invalid parent-check child states that is
        // unchecked file edits (rename, create, delete) uncheck
        // all edits for a file, e.g no text change without rename
        for (const file of this.fileOperations) {
            if (file.type !== 1 /* BulkFileOperationType.TextEdit */) {
                let checked = true;
                for (const edit of file.originalEdits.values()) {
                    if (edit instanceof ResourceFileEdit) {
                        checked = checked && this.checked.isChecked(edit);
                    }
                }
                if (!checked) {
                    for (const edit of file.originalEdits.values()) {
                        this.checked.updateChecked(edit, checked);
                    }
                }
            }
        }
        // sort (once) categories atop which have unconfirmed edits
        this.categories.sort((a, b) => {
            if (a.metadata.needsConfirmation === b.metadata.needsConfirmation) {
                return a.metadata.label.localeCompare(b.metadata.label);
            }
            else if (a.metadata.needsConfirmation) {
                return -1;
            }
            else {
                return 1;
            }
        });
        return this;
    }
    getWorkspaceEdit() {
        const result = [];
        let allAccepted = true;
        for (let i = 0; i < this._bulkEdit.length; i++) {
            const edit = this._bulkEdit[i];
            if (this.checked.isChecked(edit)) {
                result[i] = edit;
                continue;
            }
            allAccepted = false;
        }
        if (allAccepted) {
            return this._bulkEdit;
        }
        // not all edits have been accepted
        coalesceInPlace(result);
        return result;
    }
    async getFileEditOperation(edit) {
        const content = await edit.options.contents;
        if (!content) {
            return undefined;
        }
        return EditOperation.replaceMove(Range.lift({ startLineNumber: 0, startColumn: 0, endLineNumber: Number.MAX_VALUE, endColumn: 0 }), content.toString());
    }
    async getFileEdits(uri) {
        for (const file of this.fileOperations) {
            if (file.uri.toString() === uri.toString()) {
                const result = [];
                let ignoreAll = false;
                for (const edit of file.originalEdits.values()) {
                    if (edit instanceof ResourceFileEdit) {
                        result.push(this.getFileEditOperation(edit));
                    }
                    else if (edit instanceof ResourceTextEdit) {
                        if (this.checked.isChecked(edit)) {
                            result.push(Promise.resolve(EditOperation.replaceMove(Range.lift(edit.textEdit.range), !edit.textEdit.insertAsSnippet ? edit.textEdit.text : SnippetParser.asInsertText(edit.textEdit.text))));
                        }
                    }
                    else if (!this.checked.isChecked(edit)) {
                        // UNCHECKED WorkspaceFileEdit disables all text edits
                        ignoreAll = true;
                    }
                }
                if (ignoreAll) {
                    return [];
                }
                return (await Promise.all(result)).filter(r => r !== undefined).sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));
            }
        }
        return [];
    }
    getUriOfEdit(edit) {
        for (const file of this.fileOperations) {
            for (const value of file.originalEdits.values()) {
                if (value === edit) {
                    return file.uri;
                }
            }
        }
        throw new Error('invalid edit');
    }
};
BulkFileOperations = BulkFileOperations_1 = __decorate([
    __param(1, IFileService),
    __param(2, IInstantiationService)
], BulkFileOperations);
export { BulkFileOperations };
let BulkEditPreviewProvider = class BulkEditPreviewProvider {
    static { BulkEditPreviewProvider_1 = this; }
    static { this.Schema = 'vscode-bulkeditpreview-editor'; }
    static { this.emptyPreview = URI.from({ scheme: this.Schema, fragment: 'empty' }); }
    static fromPreviewUri(uri) {
        return URI.parse(uri.query);
    }
    constructor(_operations, _languageService, _modelService, _textModelResolverService) {
        this._operations = _operations;
        this._languageService = _languageService;
        this._modelService = _modelService;
        this._textModelResolverService = _textModelResolverService;
        this._disposables = new DisposableStore();
        this._modelPreviewEdits = new Map();
        this._instanceId = generateUuid();
        this._disposables.add(this._textModelResolverService.registerTextModelContentProvider(BulkEditPreviewProvider_1.Schema, this));
        this._ready = this._init();
    }
    dispose() {
        this._disposables.dispose();
    }
    asPreviewUri(uri) {
        const path = uri.scheme === Schemas.untitled ? `/${uri.path}` : uri.path;
        return URI.from({ scheme: BulkEditPreviewProvider_1.Schema, authority: this._instanceId, path, query: uri.toString() });
    }
    async _init() {
        for (const operation of this._operations.fileOperations) {
            await this._applyTextEditsToPreviewModel(operation.uri);
        }
        this._disposables.add(Event.debounce(this._operations.checked.onDidChange, (_last, e) => e, MicrotaskDelay)(e => {
            const uri = this._operations.getUriOfEdit(e);
            this._applyTextEditsToPreviewModel(uri);
        }));
    }
    async _applyTextEditsToPreviewModel(uri) {
        const model = await this._getOrCreatePreviewModel(uri);
        // undo edits that have been done before
        const undoEdits = this._modelPreviewEdits.get(model.id);
        if (undoEdits) {
            model.applyEdits(undoEdits);
        }
        // apply new edits and keep (future) undo edits
        const newEdits = await this._operations.getFileEdits(uri);
        const newUndoEdits = model.applyEdits(newEdits, true);
        this._modelPreviewEdits.set(model.id, newUndoEdits);
    }
    async _getOrCreatePreviewModel(uri) {
        const previewUri = this.asPreviewUri(uri);
        let model = this._modelService.getModel(previewUri);
        if (!model) {
            try {
                // try: copy existing
                const ref = await this._textModelResolverService.createModelReference(uri);
                const sourceModel = ref.object.textEditorModel;
                model = this._modelService.createModel(createTextBufferFactoryFromSnapshot(sourceModel.createSnapshot()), this._languageService.createById(sourceModel.getLanguageId()), previewUri);
                ref.dispose();
            }
            catch {
                // create NEW model
                model = this._modelService.createModel('', this._languageService.createByFilepathOrFirstLine(previewUri), previewUri);
            }
            // this is a little weird but otherwise editors and other cusomers
            // will dispose my models before they should be disposed...
            // And all of this is off the eventloop to prevent endless recursion
            queueMicrotask(async () => {
                this._disposables.add(await this._textModelResolverService.createModelReference(model.uri));
            });
        }
        return model;
    }
    async provideTextContent(previewUri) {
        if (previewUri.toString() === BulkEditPreviewProvider_1.emptyPreview.toString()) {
            return this._modelService.createModel('', null, previewUri);
        }
        await this._ready;
        return this._modelService.getModel(previewUri);
    }
};
BulkEditPreviewProvider = BulkEditPreviewProvider_1 = __decorate([
    __param(1, ILanguageService),
    __param(2, IModelService),
    __param(3, ITextModelService)
], BulkEditPreviewProvider);
export { BulkEditPreviewProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVsa0VkaXRQcmV2aWV3LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYnVsa0VkaXQvYnJvd3Nlci9wcmV2aWV3L2J1bGtFZGl0UHJldmlldy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUE2QixpQkFBaUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ3hILE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDL0UsT0FBTyxFQUFFLG1DQUFtQyxFQUFFLE1BQU0saURBQWlELENBQUM7QUFFdEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDbkUsT0FBTyxFQUFFLGFBQWEsRUFBd0IsTUFBTSxvREFBb0QsQ0FBQztBQUN6RyxPQUFPLEVBQW9CLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDeEgsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDckUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDbkQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFP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