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
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { LinkedList } from '../../../../base/common/linkedList.js';
import { ResourceMap, ResourceSet } from '../../../../base/common/map.js';
import { isCodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { IBulkEditService, ResourceFileEdit, ResourceTextEdit } from '../../../../editor/browser/services/bulkEditService.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Progress } from '../../../../platform/progress/common/progress.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { UndoRedoGroup } from '../../../../platform/undoRedo/common/undoRedo.js';
import { BulkCellEdits, ResourceNotebookCellEdit } from './bulkCellEdits.js';
import { BulkFileEdits } from './bulkFileEdits.js';
import { BulkTextEdits } from './bulkTextEdits.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { IWorkingCopyService } from '../../../services/workingCopy/common/workingCopyService.js';
import { OpaqueEdits, ResourceAttachmentEdit } from './opaqueEdits.js';
import { isMacintosh } from '../../../../base/common/platform.js';
function liftEdits(edits) {
    return edits.map(edit => {
        if (ResourceTextEdit.is(edit)) {
            return ResourceTextEdit.lift(edit);
        }
        if (ResourceFileEdit.is(edit)) {
            return ResourceFileEdit.lift(edit);
        }
        if (ResourceNotebookCellEdit.is(edit)) {
            return ResourceNotebookCellEdit.lift(edit);
        }
        if (ResourceAttachmentEdit.is(edit)) {
            return ResourceAttachmentEdit.lift(edit);
        }
        throw new Error('Unsupported edit');
    });
}
let BulkEdit = class BulkEdit {
    constructor(_label, _code, _editor, _progress, _token, _edits, _undoRedoGroup, _undoRedoSource, _confirmBeforeUndo, _instaService, _logService) {
        this._label = _label;
        this._code = _code;
        this._editor = _editor;
        this._progress = _progress;
        this._token = _token;
        this._edits = _edits;
        this._undoRedoGroup = _undoRedoGroup;
        this._undoRedoSource = _undoRedoSource;
        this._confirmBeforeUndo = _confirmBeforeUndo;
        this._instaService = _instaService;
        this._logService = _logService;
    }
    ariaMessage() {
        const otherResources = new ResourceMap();
        const textEditResources = new ResourceMap();
        let textEditCount = 0;
        for (const edit of this._edits) {
            if (edit instanceof ResourceTextEdit) {
                textEditCount += 1;
                textEditResources.set(edit.resource, true);
            }
            else if (edit instanceof ResourceFileEdit) {
                otherResources.set(edit.oldResource ?? edit.newResource, true);
            }
        }
        if (this._edits.length === 0) {
            return localize('summary.0', "Made no edits");
        }
        else if (otherResources.size === 0) {
            if (textEditCount > 1 && textEditResources.size > 1) {
                return localize('summary.nm', "Made {0} text edits in {1} files", textEditCount, textEditResources.size);
            }
            else {
                return localize('summary.n0', "Made {0} text edits in one file", textEditCount);
            }
        }
        else {
            return localize('summary.textFiles', "Made {0} text edits in {1} files, also created or deleted {2} files", textEditCount, textEditResources.size, otherResources.size);
        }
    }
    async perform(reason) {
        if (this._edits.length === 0) {
            return [];
        }
        const ranges = [1];
        for (let i = 1; i < this._edits.length; i++) {
            if (Object.getPrototypeOf(this._edits[i - 1]) === Object.getPrototypeOf(this._edits[i])) {
                ranges[ranges.length - 1]++;
            }
            else {
                ranges.push(1);
            }
        }
        // Show infinte progress when there is only 1 item since we do not know how long it takes
        const increment = this._edits.length > 1 ? 0 : undefined;
        this._progress.report({ increment, total: 100 });
        // Increment by percentage points since progress API expects that
        const progress = { report: _ => this._progress.report({ increment: 100 / this._edits.length }) };
        const resources = [];
        let index = 0;
        for (const range of ranges) {
            if (this._token.isCancellationRequested) {
                break;
            }
            const group = this._edits.slice(index, index + range);
            if (group[0] instanceof ResourceFileEdit) {
                resources.push(await this._performFileEdits(group, this._undoRedoGroup, this._undoRedoSource, this._confirmBeforeUndo, progress));
            }
            else if (group[0] instanceof ResourceTextEdit) {
                resources.push(await this._performTextEdits(group, this._undoRedoGroup, this._undoRedoSource, progress, reason));
            }
            else if (group[0] instanceof ResourceNotebookCellEdit) {
                resources.push(await this._performCellEdits(group, this._undoRedoGroup, this._undoRedoSource, progress));
            }
            else if (group[0] instanceof ResourceAttachmentEdit) {
                resources.push(await this._performOpaqueEdits(group, this._undoRedoGroup, this._undoRedoSource, progress));
            }
            else {
                console.log('UNKNOWN EDIT');
            }
            index = index + range;
        }
        return resources.flat();
    }
    async _performFileEdits(edits, undoRedoGroup, undoRedoSource, confirmBeforeUndo, progress) {
        this._logService.debug('_performFileEdits', JSON.stringify(edits));
        const model = this._instaService.createInstance(BulkFileEdits, this._label || localize('workspaceEdit', "Workspace Edit"), this._code || 'undoredo.workspaceEdit', undoRedoGroup, undoRedoSource, confirmBeforeUndo, progress, this._token, edits);
        return await model.apply();
    }
    async _performTextEdits(edits, undoRedoGroup, undoRedoSource, progress, reason) {
        this._logService.debug('_performTextEdits', JSON.stringify(edits));
        const model = this._instaService.createInstance(BulkTextEdits, this._label || localize('workspaceEdit', "Workspace Edit"), this._code || 'undoredo.workspaceEdit', this._editor, undoRedoGroup, undoRedoSource, progress, this._token, edits);
        return await model.apply(reason);
    }
    async _performCellEdits(edits, undoRedoGroup, undoRedoSource, progress) {
        this._logService.debug('_performCellEdits', JSON.stringify(edits));
        const model = this._instaService.createInstance(BulkCellEdits, undoRedoGroup, undoRedoSource, progress, this._token, edits);
        return await model.apply();
    }
    async _performOpaqueEdits(edits, undoRedoGroup, undoRedoSource, progress) {
        this._logService.debug('_performOpaqueEdits', JSON.stringify(edits));
        const model = this._instaService.createInstance(OpaqueEdits, undoRedoGroup, undoRedoSource, progress, this._token, edits);
        return await model.apply();
    }
};
BulkEdit = __decorate([
    __param(9, IInstantiationService),
    __param(10, ILogService)
], BulkEdit);
let BulkEditService = class BulkEditService {
    constructor(_instaService, _logService, _editorService, _lifecycleService, _dialogService, _workingCopyService, _configService) {
        this._instaService = _instaService;
        this._logService = _logService;
        this._editorService = _editorService;
        this._lifecycleService = _lifecycleService;
        this._dialogService = _dialogService;
        this._workingCopyService = _workingCopyService;
        this._configService = _configService;
        this._activeUndoRedoGroups = new LinkedList();
    }
    setPreviewHandler(handler) {
        this._previewHandler = handler;
        return toDisposable(() => {
            if (this._previewHandler === handler) {
                this._previewHandler = undefined;
            }
        });
    }
    hasPreviewHandler() {
        return Boolean(this._previewHandler);
    }
    async apply(editsIn, options) {
        let edits = liftEdits(Array.isArray(editsIn) ? editsIn : editsIn.edits);
        if (edits.length === 0) {
            return { ariaSummary: localize('nothing', "Made no edits"), isApplied: false };
        }
        if (this._previewHandler && (options?.showPreview || edits.some(value => value.metadata?.needsConfirmation))) {
            edits = await this._previewHandler(edits, options);
        }
        let codeEditor = options?.editor;
        // try to find code editor
        if (!codeEditor) {
            const candidate = this._editorService.activeTextEditorControl;
            if (isCodeEditor(candidate)) {
                codeEditor = candidate;
            }
            else if (isDiffEditor(candidate)) {
                codeEditor = candidate.getModifiedEditor();
            }
        }
        if (codeEditor && codeEditor.getOption(104 /* EditorOption.readOnly */)) {
            // If the code editor is readonly still allow bulk edits to be applied #68549
            codeEditor = undefined;
        }
        // undo-redo-group: if a group id is passed then try to find it
        // in the list of active edits. otherwise (or when not found)
        // create a separate undo-redo-group
        let undoRedoGroup;
        let undoRedoGroupRemove = () => { };
        if (typeof options?.undoRedoGroupId === 'number') {
            for (const candidate of this._activeUndoRedoGroups) {
                if (candidate.id === options.undoRedoGroupId) {
                    undoRedoGroup = candidate;
                    break;
                }
            }
        }
        if (!undoRedoGroup) {
            undoRedoGroup = new UndoRedoGroup();
            undoRedoGroupRemove = this._activeUndoRedoGroups.push(undoRedoGroup);
        }
        const label = options?.quotableLabel || options?.label;
        const bulkEdit = this._instaService.createInstance(BulkEdit, label, options?.code, codeEditor, options?.progress ?? Progress.None, options?.token ?? CancellationToken.None, edits, undoRedoGroup, options?.undoRedoSource, !!options?.confirmBeforeUndo);
        let listener;
        try {
            listener = this._lifecycleService.onBeforeShutdown(e => e.veto(this._shouldVeto(label, e.reason), 'veto.blukEditService'));
            const resources = await bulkEdit.perform(options?.reason);
            // when enabled (option AND setting) loop over all dirty working copies and trigger save
            // for those that were involved in this bulk edit operation.
            if (options?.respectAutoSaveConfig && this._configService.getValue(autoSaveSetting) === true && resources.length > 1) {
                await this._saveAll(resources);
            }
            return { ariaSummary: bulkEdit.ariaMessage(), isApplied: edits.length > 0 };
        }
        catch (err) {
            // console.log('apply FAILED');
            // console.log(err);
            this._logService.error(err);
            throw err;
        }
        finally {
            listener?.dispose();
            undoRedoGroupRemove();
        }
    }
    async _saveAll(resources) {
        const set = new ResourceSet(resources);
        const saves = this._workingCopyService.dirtyWorkingCopies.map(async (copy) => {
            if (set.has(copy.resource)) {
                await copy.save();
            }
        });
        const result = await Promise.allSettled(saves);
        for (const item of result) {
            if (item.status === 'rejected') {
                this._logService.warn(item.reason);
            }
        }
    }
    async _shouldVeto(label, reason) {
        let message;
        switch (reason) {
            case 1 /* ShutdownReason.CLOSE */:
                message = localize('closeTheWindow.message', "Are you sure you want to close the window?");
                break;
            case 4 /* ShutdownReason.LOAD */:
                message = localize('changeWorkspace.message', "Are you sure you want to change the workspace?");
                break;
            case 3 /* ShutdownReason.RELOAD */:
                message = localize('reloadTheWindow.message', "Are you sure you want to reload the window?");
                break;
            default:
                message = isMacintosh ? localize('quitMessageMac', "Are you sure you want to quit?") : localize('quitMessage', "Are you sure you want to exit?");
                break;
        }
        const result = await this._dialogService.confirm({
            message,
            detail: localize('areYouSureQuiteBulkEdit.detail', "'{0}' is in progress.", label || localize('fileOperation', "File operation")),
        });
        return !result.confirmed;
    }
};
BulkEditService = __decorate([
    __param(0, IInstantiationService),
    __param(1, ILogService),
    __param(2, IEditorService),
    __param(3, ILifecycleService),
    __param(4, IDialogService),
    __param(5, IWorkingCopyService),
    __param(6, IConfigurationService)
], BulkEditService);
export { BulkEditService };
registerSingleton(IBulkEditService, BulkEditService, 1 /* InstantiationType.Delayed */);
const autoSaveSetting = 'files.refactoring.autoSave';
Registry.as(Extensions.Configuration).registerConfiguration({
    id: 'files',
    properties: {
        [autoSaveSetting]: {
            description: localize('refactoring.autoSave', "Controls if files that were part of a refactoring are saved automatically"),
            default: true,
            type: 'boolean'
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVsa0VkaXRTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYnVsa0VkaXQvYnJvd3Nlci9idWxrRWRpdFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDNUUsT0FBTyxFQUFlLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsV0FBVyxFQUFFLFdBQVcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRTFFLE9BQU8sRUFBZSxZQUFZLEVBQUUsWUFBWSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEcsT0FBTyxFQUE4RCxnQkFBZ0IsRUFBZ0IsZ0JBQWdCLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUd4TSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLFVBQVUsRUFBMEIsTUFBTSxvRUFBb0UsQ0FBQztBQUN4SCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDaEYsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQTRCLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxRQUFRLEVBQUUs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