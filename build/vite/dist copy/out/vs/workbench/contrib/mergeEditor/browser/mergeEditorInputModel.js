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
var WorkspaceMergeEditorModeFactory_1;
import { assertFn } from '../../../../base/common/assert.js';
import { BugIndicatingError, onUnexpectedError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { derived, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import Severity from '../../../../base/common/severity.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { SaveSourceRegistry } from '../../../common/editor.js';
import { EditorModel } from '../../../common/editor/editorModel.js';
import { conflictMarkers } from './mergeMarkers/mergeMarkersController.js';
import { MergeDiffComputer } from './model/diffComputer.js';
import { MergeEditorModel } from './model/mergeEditorModel.js';
import { StorageCloseWithConflicts } from '../common/mergeEditor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
/* ================ Temp File ================ */
let TempFileMergeEditorModeFactory = class TempFileMergeEditorModeFactory {
    constructor(_mergeEditorTelemetry, _instantiationService, _textModelService, _modelService) {
        this._mergeEditorTelemetry = _mergeEditorTelemetry;
        this._instantiationService = _instantiationService;
        this._textModelService = _textModelService;
        this._modelService = _modelService;
    }
    async createInputModel(args) {
        const store = new DisposableStore();
        const [base, result, input1Data, input2Data,] = await Promise.all([
            this._textModelService.createModelReference(args.base),
            this._textModelService.createModelReference(args.result),
            toInputData(args.input1, this._textModelService, store),
            toInputData(args.input2, this._textModelService, store),
        ]);
        store.add(base);
        store.add(result);
        const tempResultUri = result.object.textEditorModel.uri.with({ scheme: 'merge-result' });
        const temporaryResultModel = this._modelService.createModel('', {
            languageId: result.object.textEditorModel.getLanguageId(),
            onDidChange: Event.None,
        }, tempResultUri);
        store.add(temporaryResultModel);
        const mergeDiffComputer = this._instantiationService.createInstance(MergeDiffComputer);
        const model = this._instantiationService.createInstance(MergeEditorModel, base.object.textEditorModel, input1Data, input2Data, temporaryResultModel, mergeDiffComputer, {
            resetResult: true,
        }, this._mergeEditorTelemetry);
        store.add(model);
        await model.onInitialized;
        return this._instantiationService.createInstance(TempFileMergeEditorInputModel, model, store, result.object, args.result);
    }
};
TempFileMergeEditorModeFactory = __decorate([
    __param(1, IInstantiationService),
    __param(2, ITextModelService),
    __param(3, IModelService)
], TempFileMergeEditorModeFactory);
export { TempFileMergeEditorModeFactory };
let TempFileMergeEditorInputModel = class TempFileMergeEditorInputModel extends EditorModel {
    constructor(model, disposable, result, resultUri, textFileService, dialogService, editorService) {
        super();
        this.model = model;
        this.disposable = disposable;
        this.result = result;
        this.resultUri = resultUri;
        this.textFileService = textFileService;
        this.dialogService = dialogService;
        this.editorService = editorService;
        this.savedAltVersionId = observableValue(this, this.model.resultTextModel.getAlternativeVersionId());
        this.altVersionId = observableFromEvent(this, e => this.model.resultTextModel.onDidChangeContent(e), () => /** @description getAlternativeVersionId */ this.model.resultTextModel.getAlternativeVersionId());
        this.isDirty = derived(this, (reader) => this.altVersionId.read(reader) !== this.savedAltVersionId.read(reader));
        this.finished = false;
    }
    dispose() {
        this.disposable.dispose();
        super.dispose();
    }
    async accept() {
        const value = await this.model.resultTextModel.getValue();
        this.result.textEditorModel.setValue(value);
        this.savedAltVersionId.set(this.model.resultTextModel.getAlternativeVersionId(), undefined);
        await this.textFileService.save(this.result.textEditorModel.uri);
        this.finished = true;
    }
    async _discard() {
        await this.textFileService.revert(this.model.resultTextModel.uri);
        this.savedAltVersionId.set(this.model.resultTextModel.getAlternativeVersionId(), undefined);
        this.finished = true;
    }
    shouldConfirmClose() {
        return true;
    }
    async confirmClose(inputModels) {
        assertFn(() => inputModels.some((m) => m === this));
        const someDirty = inputModels.some((m) => m.isDirty.get());
        let choice;
        if (someDirty) {
            const isMany = inputModels.length > 1;
            const message = isMany
                ? localize('messageN', 'Do you want keep the merge result of {0} files?', inputModels.length)
                : localize('message1', 'Do you want keep the merge result of {0}?', basename(inputModels[0].model.resultTextModel.uri));
            const hasUnhandledConflicts = inputModels.some((m) => m.model.hasUnhandledConflicts.get());
            const buttons = [
                {
                    label: hasUnhandledConflicts ?
                        localize({ key: 'saveWithConflict', comment: ['&& denotes a mnemonic'] }, "&&Save With Conflicts") :
                        localize({ key: 'save', comment: ['&& denotes a mnemonic'] }, "&&Save"),
                    run: () => 0 /* ConfirmResult.SAVE */
                },
                {
                    label: localize({ key: 'discard', comment: ['&& denotes a mnemonic'] }, "Do&&n't Save"),
                    run: () => 1 /* ConfirmResult.DONT_SAVE */
                }
            ];
            choice = (await this.dialogService.prompt({
                type: Severity.Info,
                message,
                detail: hasUnhandledConflicts
                    ? isMany
                        ? localize('detailNConflicts', "The files contain unhandled conflicts. The merge results will be lost if you don't save them.")
                        : localize('detail1Conflicts', "The file contains unhandled conflicts. The merge result will be lost if you don't save it.")
                    : isMany
                        ? localize('detailN', "The merge results will be lost if you don't save them.")
                        : localize('detail1', "The merge result will be lost if you don't save it."),
                buttons,
                cancelButton: {
                    run: () => 2 /* ConfirmResult.CANCEL */
                }
            })).result;
        }
        else {
            choice = 1 /* ConfirmResult.DONT_SAVE */;
        }
        if (choice === 0 /* ConfirmResult.SAVE */) {
            // save with conflicts
            await Promise.all(inputModels.map(m => m.accept()));
        }
        else if (choice === 1 /* ConfirmResult.DONT_SAVE */) {
            // discard changes
            await Promise.all(inputModels.map(m => m._discard()));
        }
        else {
            // cancel: stay in editor
        }
        return choice;
    }
    async save(options) {
        if (this.finished) {
            return;
        }
        // It does not make sense to save anything in the temp file mode.
        // The file stays dirty from the first edit on.
        (async () => {
            const { confirmed } = await this.dialogService.confirm({
                message: localize('saveTempFile.message', "Do you want to accept the merge result?"),
                detail: localize('saveTempFile.detail', "This will write the merge result to the original file and close the merge editor."),
                primaryButton: localize({ key: 'acceptMerge', comment: ['&& denotes a mnemonic'] }, '&&Accept Merge')
            });
            if (confirmed) {
                await this.accept();
                const editors = this.editorService.findEditors(this.resultUri).filter(e => e.editor.typeId === 'mergeEditor.Input');
                await this.editorService.closeEditors(editors);
            }
        })();
    }
    async revert(options) {
        // no op
    }
};
TempFileMergeEditorInputModel = __decorate([
    __param(4, ITextFileService),
    __param(5, IDialogService),
    __param(6, IEditorService)
], TempFileMergeEditorInputModel);
/* ================ Workspace ================ */
let WorkspaceMergeEditorModeFactory = class WorkspaceMergeEditorModeFactory {
    static { WorkspaceMergeEditorModeFactory_1 = this; }
    constructor(_mergeEditorTelemetry, _instantiationService, _textModelService, textFileService, _modelService, _languageService) {
        this._mergeEditorTelemetry = _mergeEditorTelemetry;
        this._instantiationService = _instantiationService;
        this._textModelService = _textModelService;
        this.textFileService = textFileService;
        this._modelService = _modelService;
        this._languageService = _languageService;
    }
    static { this.FILE_SAVED_SOURCE = SaveSourceRegistry.registerSource('merge-editor.source', localize('merge-editor.source', "Before Resolving Conflicts In Merge Editor")); }
    async createInputModel(args) {
        const store = new DisposableStore();
        let [base, result, input1Data, input2Data,] = await Promise.all([
            this._textModelService.createModelReference(args.base).then(v => ({
                object: v.object.textEditorModel,
                dispose: () => v.dispose(),
            })).catch(e => {
                onUnexpectedError(e);
                console.error(e); // Only file not found error should be handled ideally
                return undefined;
            }),
            this._textModelService.createModelReference(args.result),
            toInputData(args.input1, this._textModelService, store),
            toInputData(args.input2, this._textModelService, store),
        ]);
        if (base === undefined) {
            const tm = this._modelService.createModel('', this._languageService.createById(result.object.getLanguageId()));
            base = {
                dispose: () => { tm.dispose(); },
                object: tm
            };
        }
        store.add(base);
        store.add(result);
        const resultTextFileModel = this.textFileService.files.models.find(m => m.resource.toString() === result.object.textEditorModel.uri.toString());
        if (!resultTextFileModel) {
            throw new BugIndicatingError();
        }
        // So that "Don't save" does revert the file
        await resultTextFileModel.save({ source: WorkspaceMergeEditorModeFactory_1.FILE_SAVED_SOURCE });
        const lines = resultTextFileModel.textEditorModel.getLinesContent();
        const hasConflictMarkers = lines.some(l => l.startsWith(conflictMarkers.start));
        const resetResult = hasConflictMarkers;
        const mergeDiffComputer = this._instantiationService.createInstance(MergeDiffComputer);
        const model = this._instantiationService.createInstance(MergeEditorModel, base.object, input1Data, input2Data, result.object.textEditorModel, mergeDiffComputer, {
            resetResult
        }, this._mergeEditorTelemetry);
        store.add(model);
        await model.onInitialized;
        return this._instantiationService.createInstance(WorkspaceMergeEditorInputModel, model, store, resultTextFileModel, this._mergeEditorTelemetry);
    }
};
WorkspaceMergeEditorModeFactory = WorkspaceMergeEditorModeFactory_1 = __decorate([
    __param(1, IInstantiationService),
    __param(2, ITextModelService),
    __param(3, ITextFileService),
    __param(4, IModelService),
    __param(5, ILanguageService)
], WorkspaceMergeEditorModeFactory);
export { WorkspaceMergeEditorModeFactory };
let WorkspaceMergeEditorInputModel = class WorkspaceMergeEditorInputModel extends EditorModel {
    constructor(model, disposableStore, resultTextFileModel, telemetry, _dialogService, _storageService) {
        super();
        this.model = model;
        this.disposableStore = disposableStore;
        this.resultTextFileModel = resultTextFileModel;
        this.telemetry = telemetry;
        this._dialogService = _dialogService;
        this._storageService = _storageService;
        this.isDirty = observableFromEvent(this, Event.any(this.resultTextFileModel.onDidChangeDirty, this.resultTextFileModel.onDidSaveError), () => /** @description isDirty */ this.resultTextFileModel.isDirty());
        this.reported = false;
        this.dateTimeOpened = new Date();
    }
    dispose() {
        this.disposableStore.dispose();
        super.dispose();
        this.reportClose(false);
    }
    reportClose(accepted) {
        if (!this.reported) {
            const remainingConflictCount = this.model.unhandledConflictsCount.get();
            const durationOpenedMs = new Date().getTime() - this.dateTimeOpened.getTime();
            this.telemetry.reportMergeEditorClosed({
                durationOpenedSecs: durationOpenedMs / 1000,
                remainingConflictCount,
                accepted,
                conflictCount: this.model.conflictCount,
                combinableConflictCount: this.model.combinableConflictCount,
                conflictsResolvedWithBase: this.model.conflictsResolvedWithBase,
                conflictsResolvedWithInput1: this.model.conflictsResolvedWithInput1,
                conflictsResolvedWithInput2: this.model.conflictsResolvedWithInput2,
                conflictsResolvedWithSmartCombination: this.model.conflictsResolvedWithSmartCombination,
                manuallySolvedConflictCountThatEqualNone: this.model.manuallySolvedConflictCountThatEqualNone,
                manuallySolvedConflictCountThatEqualSmartCombine: this.model.manuallySolvedConflictCountThatEqualSmartCombine,
                manuallySolvedConflictCountThatEqualInput1: this.model.manuallySolvedConflictCountThatEqualInput1,
                manuallySolvedConflictCountThatEqualInput2: this.model.manuallySolvedConflictCountThatEqualInput2,
                manuallySolvedConflictCountThatEqualNoneAndStartedWithBase: this.model.manuallySolvedConflictCountThatEqualNoneAndStartedWithBase,
                manuallySolvedConflictCountThatEqualNoneAndStartedWithInput1: this.model.manuallySolvedConflictCountThatEqualNoneAndStartedWithInput1,
                manuallySolvedConflictCountThatEqualNoneAndStartedWithInput2: this.model.manuallySolvedConflictCountThatEqualNoneAndStartedWithInput2,
                manuallySolvedConflictCountThatEqualNoneAndStartedWithBothNonSmart: this.model.manuallySolvedConflictCountThatEqualNoneAndStartedWithBothNonSmart,
                manuallySolvedConflictCountThatEqualNoneAndStartedWithBothSmart: this.model.manuallySolvedConflictCountThatEqualNoneAndStartedWithBothSmart,
            });
            this.reported = true;
        }
    }
    async accept() {
        this.reportClose(true);
        await this.resultTextFileModel.save();
    }
    get resultUri() {
        return this.resultTextFileModel.resource;
    }
    async save(options) {
        await this.resultTextFileModel.save(options);
    }
    /**
     * If save resets the dirty state, revert must do so too.
    */
    async revert(options) {
        await this.resultTextFileModel.revert(options);
    }
    shouldConfirmClose() {
        // Always confirm
        return true;
    }
    async confirmClose(inputModels) {
        const isMany = inputModels.length > 1;
        const someDirty = inputModels.some(m => m.isDirty.get());
        const someUnhandledConflicts = inputModels.some(m => m.model.hasUnhandledConflicts.get());
        if (someDirty) {
            const message = isMany
                ? localize('workspace.messageN', 'Do you want to save the changes you made to {0} files?', inputModels.length)
                : localize('workspace.message1', 'Do you want to save the changes you made to {0}?', basename(inputModels[0].resultUri));
            const { result } = await this._dialogService.prompt({
                type: Severity.Info,
                message,
                detail: someUnhandledConflicts ?
                    isMany
                        ? localize('workspace.detailN.unhandled', "The files contain unhandled conflicts. Your changes will be lost if you don't save them.")
                        : localize('workspace.detail1.unhandled', "The file contains unhandled conflicts. Your changes will be lost if you don't save them.")
                    : isMany
                        ? localize('workspace.detailN.handled', "Your changes will be lost if you don't save them.")
                        : localize('workspace.detail1.handled', "Your changes will be lost if you don't save them."),
                buttons: [
                    {
                        label: someUnhandledConflicts
                            ? localize({ key: 'workspace.saveWithConflict', comment: ['&& denotes a mnemonic'] }, '&&Save with Conflicts')
                            : localize({ key: 'workspace.save', comment: ['&& denotes a mnemonic'] }, '&&Save'),
                        run: () => 0 /* ConfirmResult.SAVE */
                    },
                    {
                        label: localize({ key: 'workspace.doNotSave', comment: ['&& denotes a mnemonic'] }, "Do&&n't Save"),
                        run: () => 1 /* ConfirmResult.DONT_SAVE */
                    }
                ],
                cancelButton: {
                    run: () => 2 /* ConfirmResult.CANCEL */
                }
            });
            return result;
        }
        else if (someUnhandledConflicts && !this._storageService.getBoolean(StorageCloseWithConflicts, 0 /* StorageScope.PROFILE */, false)) {
            const { confirmed, checkboxChecked } = await this._dialogService.confirm({
                message: isMany
                    ? localize('workspace.messageN.nonDirty', 'Do you want to close {0} merge editors?', inputModels.length)
                    : localize('workspace.message1.nonDirty', 'Do you want to close the merge editor for {0}?', basename(inputModels[0].resultUri)),
                detail: someUnhandledConflicts ?
                    isMany
                        ? localize('workspace.detailN.unhandled.nonDirty', "The files contain unhandled conflicts.")
                        : localize('workspace.detail1.unhandled.nonDirty', "The file contains unhandled conflicts.")
                    : undefined,
                primaryButton: someUnhandledConflicts
                    ? localize({ key: 'workspace.closeWithConflicts', comment: ['&& denotes a mnemonic'] }, '&&Close with Conflicts')
                    : localize({ key: 'workspace.close', comment: ['&& denotes a mnemonic'] }, '&&Close'),
                checkbox: { label: localize('noMoreWarn', "Do not ask me again") }
            });
            if (checkboxChecked) {
                this._storageService.store(StorageCloseWithConflicts, true, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
            }
            return confirmed ? 0 /* ConfirmResult.SAVE */ : 2 /* ConfirmResult.CANCEL */;
        }
        else {
            // This shouldn't do anything
            return 0 /* ConfirmResult.SAVE */;
        }
    }
};
WorkspaceMergeEditorInputModel = __decorate([
    __param(4, IDialogService),
    __param(5, IStorageService)
], WorkspaceMergeEditorInputModel);
/* ================= Utils ================== */
async function toInputData(data, textModelService, store) {
    const ref = await textModelService.createModelReference(data.uri);
    store.add(ref);
    return {
        textModel: ref.object.textEditorModel,
        title: data.title,
        description: data.description,
        detail: data.detail,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVyZ2VFZGl0b3JJbnB1dE1vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWVyZ2VFZGl0b3IvYnJvd3Nlci9tZXJnZUVkaXRvcklucHV0TW9kZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMxRixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLGVBQWUsRUFBMkIsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRyxPQUFPLEVBQUUsT0FBTyxFQUFlLG1CQUFtQixFQUFFLGVBQWUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ25ILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLFFBQVEsTUFBTSxxQ0FBcUMsQ0FBQztBQUUzRCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDNUUsT0FBTyxFQUE0QixpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3BILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQWlCLGNBQWMsRUFBaUIsTUFBTSxnREFBZ0QsQ0FBQztBQUM5RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBa0Isa0JBQWtCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUMvRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0s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