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
var InteractiveEditorInput_1;
import { Event } from '../../../../base/common/event.js';
import * as paths from '../../../../base/common/path.js';
import { isEqual, joinPath } from '../../../../base/common/resources.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../editor/common/languages/modesRegistry.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IInteractiveDocumentService } from './interactiveDocumentService.js';
import { IInteractiveHistoryService } from './interactiveHistoryService.js';
import { NotebookSetting } from '../../notebook/common/notebookCommon.js';
import { NotebookEditorInput } from '../../notebook/common/notebookEditorInput.js';
import { INotebookService } from '../../notebook/common/notebookService.js';
let InteractiveEditorInput = class InteractiveEditorInput extends EditorInput {
    static { InteractiveEditorInput_1 = this; }
    static create(instantiationService, resource, inputResource, title, language) {
        return instantiationService.createInstance(InteractiveEditorInput_1, resource, inputResource, title, language);
    }
    static { this.windowNames = {}; }
    static setName(notebookUri, title) {
        if (title) {
            this.windowNames[notebookUri.path] = title;
        }
    }
    static { this.ID = 'workbench.input.interactive'; }
    get editorId() {
        return 'interactive';
    }
    get typeId() {
        return InteractiveEditorInput_1.ID;
    }
    get language() {
        return this._inputModelRef?.object.textEditorModel.getLanguageId() ?? this._initLanguage;
    }
    get notebookEditorInput() {
        return this._notebookEditorInput;
    }
    get editorInputs() {
        return [this._notebookEditorInput];
    }
    get resource() {
        return this._resource;
    }
    get inputResource() {
        return this._inputResource;
    }
    get primary() {
        return this._notebookEditorInput;
    }
    constructor(resource, inputResource, title, languageId, instantiationService, textModelService, interactiveDocumentService, historyService, _notebookService, _fileDialogService, configurationService) {
        const input = NotebookEditorInput.getOrCreate(instantiationService, resource, undefined, 'interactive', {});
        super();
        this._notebookService = _notebookService;
        this._fileDialogService = _fileDialogService;
        this.isScratchpad = configurationService.getValue(NotebookSetting.InteractiveWindowPromptToSave) !== true;
        this._notebookEditorInput = input;
        this._register(this._notebookEditorInput);
        this.name = title ?? InteractiveEditorInput_1.windowNames[resource.path] ?? paths.basename(resource.path, paths.extname(resource.path));
        this._initLanguage = languageId;
        this._resource = resource;
        this._inputResource = inputResource;
        this._inputResolver = null;
        this._editorModelReference = null;
        this._inputModelRef = null;
        this._textModelService = textModelService;
        this._interactiveDocumentService = interactiveDocumentService;
        this._historyService = historyService;
        this._registerListeners();
    }
    _registerListeners() {
        const oncePrimaryDisposed = Event.once(this.primary.onWillDispose);
        this._register(oncePrimaryDisposed(() => {
            if (!this.isDisposed()) {
                this.dispose();
            }
        }));
        // Re-emit some events from the primary side to the outside
        this._register(this.primary.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
        this._register(this.primary.onDidChangeLabel(() => this._onDidChangeLabel.fire()));
        // Re-emit some events from both sides to the outside
        this._register(this.primary.onDidChangeCapabilities(() => this._onDidChangeCapabilities.fire()));
    }
    get capabilities() {
        const scratchPad = this.isScratchpad ? 512 /* EditorInputCapabilities.Scratchpad */ : 0;
        return 4 /* EditorInputCapabilities.Untitled */
            | 2 /* EditorInputCapabilities.Readonly */
            | scratchPad;
    }
    async _resolveEditorModel() {
        if (!this._editorModelReference) {
            this._editorModelReference = await this._notebookEditorInput.resolve();
        }
        return this._editorModelReference;
    }
    async resolve() {
        if (this._editorModelReference) {
            return this._editorModelReference;
        }
        if (this._inputResolver) {
            return this._inputResolver;
        }
        this._inputResolver = this._resolveEditorModel();
        return this._inputResolver;
    }
    async resolveInput(language) {
        if (this._inputModelRef) {
            return this._inputModelRef.object.textEditorModel;
        }
        const resolvedLanguage = language ?? this._initLanguage ?? PLAINTEXT_LANGUAGE_ID;
        this._interactiveDocumentService.willCreateInteractiveDocument(this.resource, this.inputResource, resolvedLanguage);
        this._inputModelRef = await this._textModelService.createModelReference(this.inputResource);
        return this._inputModelRef.object.textEditorModel;
    }
    async save(group, options) {
        if (this._editorModelReference) {
            if (this.hasCapability(4 /* EditorInputCapabilities.Untitled */)) {
                return this.saveAs(group, options);
            }
            else {
                await this._editorModelReference.save(options);
            }
            return this;
        }
        return undefined;
    }
    async saveAs(group, options) {
        if (!this._editorModelReference) {
            return undefined;
        }
        const provider = this._notebookService.getContributedNotebookType('interactive');
        if (!provider) {
            return undefined;
        }
        const filename = this.getName() + '.ipynb';
        const pathCandidate = joinPath(await this._fileDialogService.defaultFilePath(), filename);
        const target = await this._fileDialogService.pickFileToSave(pathCandidate, options?.availableFileSystems);
        if (!target) {
            return undefined; // save cancelled
        }
        const saved = await this._editorModelReference.saveAs(target);
        if (saved && 'resource' in saved && saved.resource) {
            this._notebookService.getNotebookTextModel(saved.resource)?.dispose();
        }
        return saved;
    }
    matches(otherInput) {
        if (super.matches(otherInput)) {
            return true;
        }
        if (otherInput instanceof InteractiveEditorInput_1) {
            return isEqual(this.resource, otherInput.resource) && isEqual(this.inputResource, otherInput.inputResource);
        }
        return false;
    }
    getName() {
        return this.name;
    }
    isDirty() {
        if (this.isScratchpad) {
            return false;
        }
        return this._editorModelReference?.isDirty() ?? false;
    }
    isModified() {
        return this._editorModelReference?.isModified() ?? false;
    }
    async revert(_group, options) {
        if (this._editorModelReference && this._editorModelReference.isDirty()) {
            await this._editorModelReference.revert(options);
        }
    }
    dispose() {
        // we support closing the interactive window without prompt, so the editor model should not be dirty
        this._editorModelReference?.revert({ soft: true });
        this._notebookEditorInput?.dispose();
        this._editorModelReference?.dispose();
        this._editorModelReference = null;
        this._interactiveDocumentService.willRemoveInteractiveDocument(this.resource, this.inputResource);
        this._inputModelRef?.dispose();
        this._inputModelRef = null;
        super.dispose();
    }
    get historyService() {
        return this._historyService;
    }
};
InteractiveEditorInput = InteractiveEditorInput_1 = __decorate([
    __param(4, IInstantiationService),
    __param(5, ITextModelService),
    __param(6, IInteractiveDocumentService),
    __param(7, IInteractiveHistoryService),
    __param(8, INotebookService),
    __param(9, IFileDialogService),
    __param(10, IConfigurationService)
], InteractiveEditorInput);
export { InteractiveEditorInput };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZXJhY3RpdmVFZGl0b3JJbnB1dC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2ludGVyYWN0aXZlL2Jyb3dzZXIvaW50ZXJhY3RpdmVFZGl0b3JJbnB1dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRXpELE9BQU8sS0FBSyxLQUFLLE1BQU0saUNBQWlDLENBQUM7QUFDekQsT0FBTyxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUV6RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUM3RixPQUFPLEVBQTRCLGlCQUFpQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDcEgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDcEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFbkcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzVFLE9BQU8sRUFBZ0MsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDeEcsT0FBTyxFQUFpQyxtQkFBbUIsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ2xILE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRXJFLElBQU0sc0JBQXNCLEdBQTVCLE1BQU0sc0JBQXVCLFNBQVEs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