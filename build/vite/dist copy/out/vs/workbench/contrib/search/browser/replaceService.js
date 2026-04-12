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
var ReplaceService_1;
import * as nls from '../../../../nls.js';
import * as network from '../../../../base/common/network.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IReplaceService } from './replace.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ISearchViewModelWorkbenchService } from './searchTreeModel/searchViewModelWorkbenchService.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { createTextBufferFactoryFromSnapshot } from '../../../../editor/common/model/textModel.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { IBulkEditService, ResourceTextEdit } from '../../../../editor/browser/services/bulkEditService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { EditOperation } from '../../../../editor/common/core/editOperation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { dirname } from '../../../../base/common/resources.js';
import { Promises } from '../../../../base/common/async.js';
import { SaveSourceRegistry } from '../../../common/editor.js';
import { CellUri } from '../../notebook/common/notebookCommon.js';
import { INotebookEditorModelResolverService } from '../../notebook/common/notebookEditorModelResolverService.js';
import { isSearchTreeFileMatch, isSearchTreeMatch } from './searchTreeModel/searchTreeCommon.js';
import { isIMatchInNotebook } from './notebookSearch/notebookSearchModelBase.js';
const REPLACE_PREVIEW = 'replacePreview';
const toReplaceResource = (fileResource) => {
    return fileResource.with({ scheme: network.Schemas.internal, fragment: REPLACE_PREVIEW, query: JSON.stringify({ scheme: fileResource.scheme }) });
};
const toFileResource = (replaceResource) => {
    return replaceResource.with({ scheme: JSON.parse(replaceResource.query)['scheme'], fragment: '', query: '' });
};
let ReplacePreviewContentProvider = class ReplacePreviewContentProvider {
    static { this.ID = 'workbench.contrib.replacePreviewContentProvider'; }
    constructor(instantiationService, textModelResolverService) {
        this.instantiationService = instantiationService;
        this.textModelResolverService = textModelResolverService;
        this.textModelResolverService.registerTextModelContentProvider(network.Schemas.internal, this);
    }
    provideTextContent(uri) {
        if (uri.fragment === REPLACE_PREVIEW) {
            return this.instantiationService.createInstance(ReplacePreviewModel).resolve(uri);
        }
        return null;
    }
};
ReplacePreviewContentProvider = __decorate([
    __param(0, IInstantiationService),
    __param(1, ITextModelService)
], ReplacePreviewContentProvider);
export { ReplacePreviewContentProvider };
let ReplacePreviewModel = class ReplacePreviewModel extends Disposable {
    constructor(modelService, languageService, textModelResolverService, replaceService, searchWorkbenchService) {
        super();
        this.modelService = modelService;
        this.languageService = languageService;
        this.textModelResolverService = textModelResolverService;
        this.replaceService = replaceService;
        this.searchWorkbenchService = searchWorkbenchService;
    }
    async resolve(replacePreviewUri) {
        const fileResource = toFileResource(replacePreviewUri);
        const fileMatch = this.searchWorkbenchService.searchModel.searchResult.matches(false).filter(match => match.resource.toString() === fileResource.toString())[0];
        const ref = this._register(await this.textModelResolverService.createModelReference(fileResource));
        const sourceModel = ref.object.textEditorModel;
        const sourceModelLanguageId = sourceModel.getLanguageId();
        const replacePreviewModel = this.modelService.createModel(createTextBufferFactoryFromSnapshot(sourceModel.createSnapshot()), this.languageService.createById(sourceModelLanguageId), replacePreviewUri);
        this._register(fileMatch.onChange(({ forceUpdateModel }) => this.update(sourceModel, replacePreviewModel, fileMatch, forceUpdateModel)));
        this._register(this.searchWorkbenchService.searchModel.onReplaceTermChanged(() => this.update(sourceModel, replacePreviewModel, fileMatch)));
        this._register(fileMatch.onDispose(() => replacePreviewModel.dispose())); // TODO@Sandeep we should not dispose a model directly but rather the reference (depends on https://github.com/microsoft/vscode/issues/17073)
        this._register(replacePreviewModel.onWillDispose(() => this.dispose()));
        this._register(sourceModel.onWillDispose(() => this.dispose()));
        return replacePreviewModel;
    }
    update(sourceModel, replacePreviewModel, fileMatch, override = false) {
        if (!sourceModel.isDisposed() && !replacePreviewModel.isDisposed()) {
            this.replaceService.updateReplacePreview(fileMatch, override);
        }
    }
};
ReplacePreviewModel = __decorate([
    __param(0, IModelService),
    __param(1, ILanguageService),
    __param(2, ITextModelService),
    __param(3, IReplaceService),
    __param(4, ISearchViewModelWorkbenchService)
], ReplacePreviewModel);
let ReplaceService = class ReplaceService {
    static { ReplaceService_1 = this; }
    static { this.REPLACE_SAVE_SOURCE = SaveSourceRegistry.registerSource('searchReplace.source', nls.localize('searchReplace.source', "Search and Replace")); }
    constructor(textFileService, editorService, textModelResolverService, bulkEditorService, labelService, notebookEditorModelResolverService) {
        this.textFileService = textFileService;
        this.editorService = editorService;
        this.textModelResolverService = textModelResolverService;
        this.bulkEditorService = bulkEditorService;
        this.labelService = labelService;
        this.notebookEditorModelResolverService = notebookEditorModelResolverService;
    }
    async replace(arg, progress = undefined, resource = null) {
        const edits = this.createEdits(arg, resource);
        await this.bulkEditorService.apply(edits, { progress });
        const rawTextPromises = edits.map(async (e) => {
            if (e.resource.scheme === network.Schemas.vscodeNotebookCell) {
                const notebookResource = CellUri.parse(e.resource)?.notebook;
                if (notebookResource) {
                    let ref;
                    try {
                        ref = await this.notebookEditorModelResolverService.resolve(notebookResource);
                        await ref.object.save({ source: ReplaceService_1.REPLACE_SAVE_SOURCE });
                    }
                    finally {
                        ref?.dispose();
                    }
                }
                return;
            }
            else {
                return this.textFileService.files.get(e.resource)?.save({ source: ReplaceService_1.REPLACE_SAVE_SOURCE });
            }
        });
        return Promises.settled(rawTextPromises);
    }
    async openReplacePreview(element, preserveFocus, sideBySide, pinned) {
        const fileMatch = isSearchTreeMatch(element) ? element.parent() : element;
        const editor = await this.editorService.openEditor({
            original: { resource: fileMatch.resource },
            modified: { resource: toReplaceResource(fileMatch.resource) },
            label: nls.localize('fileReplaceChanges', "{0} ↔ {1} (Replace Preview)", fileMatch.name(), fileMatch.name()),
            description: this.labelService.getUriLabel(dirname(fileMatch.resource), { relative: true }),
            options: {
                preserveFocus,
                pinned,
                revealIfVisible: true
            }
        });
        const input = editor?.input;
        const disposable = fileMatch.onDispose(() => {
            input?.dispose();
            disposable.dispose();
        });
        await this.updateReplacePreview(fileMatch);
        if (editor) {
            const editorControl = editor.getControl();
            if (isSearchTreeMatch(element) && editorControl) {
                editorControl.revealLineInCenter(element.range().startLineNumber, 1 /* ScrollType.Immediate */);
            }
        }
    }
    async updateReplacePreview(fileMatch, override = false) {
        const replacePreviewUri = toReplaceResource(fileMatch.resource);
        const [sourceModelRef, replaceModelRef] = await Promise.all([this.textModelResolverService.createModelReference(fileMatch.resource), this.textModelResolverService.createModelReference(replacePreviewUri)]);
        const sourceModel = sourceModelRef.object.textEditorModel;
        const replaceModel = replaceModelRef.object.textEditorModel;
        // If model is disposed do not update
        try {
            if (sourceModel && replaceModel) {
                if (override) {
                    replaceModel.setValue(sourceModel.getValue());
                }
                else {
                    replaceModel.undo();
                }
                this.applyEditsToPreview(fileMatch, replaceModel);
            }
        }
        finally {
            sourceModelRef.dispose();
            replaceModelRef.dispose();
        }
    }
    applyEditsToPreview(fileMatch, replaceModel) {
        const resourceEdits = this.createEdits(fileMatch, replaceModel.uri);
        const modelEdits = [];
        for (const resourceEdit of resourceEdits) {
            modelEdits.push(EditOperation.replaceMove(Range.lift(resourceEdit.textEdit.range), resourceEdit.textEdit.text));
        }
        replaceModel.pushEditOperations([], modelEdits.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range)), () => []);
    }
    createEdits(arg, resource = null) {
        const edits = [];
        if (isSearchTreeMatch(arg)) {
            if (!arg.isReadonly) {
                if (isIMatchInNotebook(arg)) {
                    // only apply edits if it's not a webview match, since webview matches are read-only
                    const match = arg;
                    edits.push(this.createEdit(match, match.replaceString, match.cell?.uri));
                }
                else {
                    const match = arg;
                    edits.push(this.createEdit(match, match.replaceString, resource));
                }
            }
        }
        if (isSearchTreeFileMatch(arg)) {
            arg = [arg];
        }
        if (arg instanceof Array) {
            arg.forEach(element => {
                const fileMatch = element;
                if (fileMatch.count() > 0) {
                    edits.push(...fileMatch.matches().flatMap(match => this.createEdits(match, resource)));
                }
            });
        }
        return edits;
    }
    createEdit(match, text, resource = null) {
        const fileMatch = match.parent();
        return new ResourceTextEdit(resource ?? fileMatch.resource, { range: match.range(), text }, undefined, undefined);
    }
};
ReplaceService = ReplaceService_1 = __decorate([
    __param(0, ITextFileService),
    __param(1, IEditorService),
    __param(2, ITextModelService),
    __param(3, IBulkEditService),
    __param(4, ILabelService),
    __param(5, INotebookEditorModelResolverService)
], ReplaceService);
export { ReplaceService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwbGFjZVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zZWFyY2gvYnJvd3Nlci9yZXBsYWNlU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUUxQyxPQUFPLEtBQUssT0FBTyxNQUFNLG9DQUFvQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxVQUFVLEVBQWMsTUFBTSxzQ0FBc0MsQ0FBQztBQUM5RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBQy9DLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNsRixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDNUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDbkYsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFeEcsT0FBTyxFQUFFLGlCQUFpQixFQUE2QixNQUFNLHVEQUF1RCxDQUFDO0FBSXJILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxtQ0FBbUMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzVHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsYUFBYSxFQUF3QixNQUFNLGlEQUFpRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFB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