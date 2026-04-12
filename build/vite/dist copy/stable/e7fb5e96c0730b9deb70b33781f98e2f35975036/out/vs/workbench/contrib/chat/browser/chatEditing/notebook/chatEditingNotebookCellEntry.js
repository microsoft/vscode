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
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue, transaction } from '../../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { CellEditState } from '../../../../notebook/browser/notebookBrowser.js';
import { INotebookEditorService } from '../../../../notebook/browser/services/notebookEditorService.js';
import { CellKind } from '../../../../notebook/common/notebookCommon.js';
import { ChatEditingTextModelChangeService } from '../chatEditingTextModelChangeService.js';
/**
 * This is very closely similar to the ChatEditingModifiedDocumentEntry class.
 * Most of the code has been borrowed from there, as a cell is effectively a document.
 * Hence most of the same functionality applies.
 */
let ChatEditingNotebookCellEntry = class ChatEditingNotebookCellEntry extends Disposable {
    get isDisposed() {
        return this._store.isDisposed;
    }
    get isEditFromUs() {
        return this._textModelChangeService.isEditFromUs;
    }
    get allEditsAreFromUs() {
        return this._textModelChangeService.allEditsAreFromUs;
    }
    get diffInfo() {
        return this._textModelChangeService.diffInfo;
    }
    constructor(notebookUri, cell, modifiedModel, originalModel, isExternalEditInProgress, disposables, notebookEditorService, instantiationService) {
        super();
        this.notebookUri = notebookUri;
        this.cell = cell;
        this.modifiedModel = modifiedModel;
        this.originalModel = originalModel;
        this.notebookEditorService = notebookEditorService;
        this.instantiationService = instantiationService;
        this._maxModifiedLineNumber = observableValue(this, 0);
        this.maxModifiedLineNumber = this._maxModifiedLineNumber;
        this._stateObs = observableValue(this, 0 /* ModifiedFileEntryState.Modified */);
        this.state = this._stateObs;
        this.initialContent = this.originalModel.getValue();
        this._register(disposables);
        this._textModelChangeService = this._register(this.instantiationService.createInstance(ChatEditingTextModelChangeService, this.originalModel, this.modifiedModel, this.state, isExternalEditInProgress));
        this._register(this._textModelChangeService.onDidAcceptOrRejectAllHunks(action => {
            this.revertMarkdownPreviewState();
            this._stateObs.set(action, undefined);
        }));
        this._register(this._textModelChangeService.onDidUserEditModel(() => {
            const didResetToOriginalContent = this.modifiedModel.getValue() === this.initialContent;
            if (this._stateObs.get() === 0 /* ModifiedFileEntryState.Modified */ && didResetToOriginalContent) {
                this._stateObs.set(2 /* ModifiedFileEntryState.Rejected */, undefined);
            }
        }));
    }
    clearCurrentEditLineDecoration() {
        if (this.modifiedModel.isDisposed()) {
            return;
        }
        this._textModelChangeService.clearCurrentEditLineDecoration();
    }
    async acceptAgentEdits(textEdits, isLastEdits, responseModel) {
        const { maxLineNumber } = await this._textModelChangeService.acceptAgentEdits(this.modifiedModel.uri, textEdits, isLastEdits, responseModel);
        transaction((tx) => {
            if (!isLastEdits) {
                this._stateObs.set(0 /* ModifiedFileEntryState.Modified */, tx);
                this._maxModifiedLineNumber.set(maxLineNumber, tx);
            }
            else {
                this._maxModifiedLineNumber.set(0, tx);
            }
        });
    }
    revertMarkdownPreviewState() {
        if (this.cell.cellKind !== CellKind.Markup) {
            return;
        }
        const notebookEditor = this.notebookEditorService.retrieveExistingWidgetFromURI(this.notebookUri)?.value;
        if (notebookEditor) {
            const vm = notebookEditor.getCellByHandle(this.cell.handle);
            if (vm?.getEditState() === CellEditState.Editing &&
                (vm.editStateSource === 'chatEdit' || vm.editStateSource === 'chatEditNavigation')) {
                vm?.updateEditState(CellEditState.Preview, 'chatEdit');
            }
        }
    }
    async keep(change) {
        return this._textModelChangeService.diffInfo.get().keep(change);
    }
    async undo(change) {
        return this._textModelChangeService.diffInfo.get().undo(change);
    }
};
ChatEditingNotebookCellEntry = __decorate([
    __param(6, INotebookEditorService),
    __param(7, IInstantiationService)
], ChatEditingNotebookCellEntry);
export { ChatEditingNotebookCellEntry };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRpbmdOb3RlYm9va0NlbGxFbnRyeS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RWRpdGluZy9ub3RlYm9vay9jaGF0RWRpdGluZ05vdGVib29rQ2VsbEVudHJ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQW1CLE1BQU0sNENBQTRDLENBQUM7QUFDekYsT0FBTyxFQUFlLGVBQWUsRUFBRSxXQUFXLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQU14RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDaEYsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFFeEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBR3pFLE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRzVGOzs7O0dBSUc7QUFDSSxJQUFNLDRCQUE0QixHQUFsQyxNQUFNLDRCQUE2QixTQUFRLFVBQVU7SUFDM0QsSUFBVyxVQUFVO1FBQ3BCLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUM7SUFDL0IsQ0FBQztJQUVELElBQVcsWUFBWTtRQUN0QixPQUFPLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxZQUFZLENBQUM7SUFDbEQsQ0FBQztJQUVELElBQVcsaUJBQWlCO1FBQzNCLE9BQU8sSUFBSSxDQUFDLHVCQUF1QixDQUFDLGlCQUFpQixDQUFDO0lBQ3ZELENBQUM7SUFDRCxJQUFXLFFBQVE7UUFDbEIsT0FBTyxJQUFJLENBQUMsdUJBQXVCLENBQUMsUUFBUSxDQUFD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