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
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { constObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { LineRange } from '../../../../../editor/common/core/ranges/lineRange.js';
import { DetailedLineRangeMapping } from '../../../../../editor/common/diff/rangeMapping.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { createTextBufferFactoryFromSnapshot } from '../../../../../editor/common/model/textModel.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IUndoRedoService } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { IFilesConfigurationService } from '../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { stringToSnapshot } from '../../../../services/textfile/common/textfiles.js';
import { IAiEditTelemetryService } from '../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { AbstractChatEditingModifiedFileEntry } from './chatEditingModifiedFileEntry.js';
import { ChatEditingTextModelContentProvider } from './chatEditingTextModelContentProviders.js';
/**
 * Represents a file that has been deleted by the chat editing session.
 * Unlike ChatEditingModifiedDocumentEntry, this doesn't maintain a live model
 * since the file no longer exists on disk.
 */
let ChatEditingDeletedFileEntry = class ChatEditingDeletedFileEntry extends AbstractChatEditingModifiedFileEntry {
    constructor(resource, originalContent, _multiDiffEntryDelegate, telemetryInfo, _languageId, _modelService, _languageService, configService, fileConfigService, chatService, fileService, undoRedoService, instantiationService, aiEditTelemetryService) {
        super(resource, telemetryInfo, 2 /* ChatEditKind.Deleted */, configService, fileConfigService, chatService, fileService, undoRedoService, instantiationService, aiEditTelemetryService);
        this._multiDiffEntryDelegate = _multiDiffEntryDelegate;
        this._languageId = _languageId;
        this._modelService = _modelService;
        this._languageService = _languageService;
        this.linesAdded = constObservable(0);
        this._changesCount = observableValue(this, 1);
        this.changesCount = this._changesCount;
        this.isDeletion = true;
        this._originalContent = originalContent;
        this.initialContent = originalContent;
        this.originalURI = ChatEditingTextModelContentProvider.getFileURI(telemetryInfo.sessionResource, this.entryId, resource.path);
        this.diffInfo = constObservable(this._diffInfo());
        this.linesRemoved = constObservable(this._getOrCreateOriginalModel().getLineCount());
    }
    dispose() {
        this._originalModel?.dispose();
        this._modifiedModel?.dispose();
        super.dispose();
    }
    /**
     * Gets or creates the original model for diff display.
     */
    _getOrCreateOriginalModel() {
        if (!this._originalModel || this._originalModel.isDisposed()) {
            this._originalModel = this._modelService.createModel(createTextBufferFactoryFromSnapshot(stringToSnapshot(this._originalContent)), this._languageService.createById(this._languageId), this.originalURI, false);
        }
        return this._originalModel;
    }
    /**
     * Gets or creates an empty model representing the deleted state.
     */
    _getOrCreateModifiedModel() {
        if (!this._modifiedModel || this._modifiedModel.isDisposed()) {
            // Create empty model - file is deleted so content is empty
            this._modifiedModel = this._modelService.createModel('', this._languageService.createById(this._languageId), this.modifiedURI.with({ scheme: 'deleted-file' }), false);
        }
        return this._modifiedModel;
    }
    _diffInfo() {
        // For deleted files, return a simple diff showing all content removed
        const originalModel = this._getOrCreateOriginalModel();
        this._getOrCreateModifiedModel(); // Ensure the modified model exists for the diff view
        const originalLineCount = originalModel.getLineCount();
        return {
            changes: [new DetailedLineRangeMapping(new LineRange(1, originalLineCount + 1), new LineRange(1, 1), undefined)],
            quitEarly: false,
            identical: false,
            moves: []
        };
    }
    getDiffInfo() {
        return Promise.resolve(this._diffInfo());
    }
    equalsSnapshot(snapshot) {
        return !!snapshot &&
            isEqual(this.modifiedURI, snapshot.resource) &&
            this._languageId === snapshot.languageId &&
            this._originalContent === snapshot.original &&
            snapshot.current === '' &&
            this.state.get() === snapshot.state;
    }
    createSnapshot(chatSessionResource, requestId, undoStop) {
        return {
            resource: this.modifiedURI,
            languageId: this._languageId,
            snapshotUri: this.originalURI,
            original: this._originalContent,
            current: '', // File is deleted, so current content is empty
            state: this.state.get(),
            telemetryInfo: this._telemetryInfo,
            isDeleted: true,
        };
    }
    async restoreFromSnapshot(snapshot, restoreToDisk = true) {
        this._stateObs.set(snapshot.state, undefined);
        if (restoreToDisk && snapshot.current !== '') {
            // Restore file to disk with the snapshot content
            await this._fileService.writeFile(this.modifiedURI, VSBuffer.fromString(snapshot.current));
        }
    }
    async resetToInitialContent() {
        // Restore the file with original content
        await this._fileService.writeFile(this.modifiedURI, VSBuffer.fromString(this._originalContent));
    }
    resetEditTrackerToInitialContent() {
        return Promise.resolve();
    }
    async _areOriginalAndModifiedIdentical() {
        // A deleted file is never identical to its original (unless original was empty)
        return this._originalContent === '';
    }
    _createUndoRedoElement(response) {
        return {
            type: 0 /* UndoRedoElementType.Resource */,
            resource: this.modifiedURI,
            label: 'Chat File Deletion',
            code: 'chat.delete',
            undo: async () => {
                // Restore the file
                await this._fileService.writeFile(this.modifiedURI, VSBuffer.fromString(this._originalContent));
            },
            redo: async () => {
                // Delete the file again
                await this._fileService.del(this.modifiedURI, { useTrash: false });
            }
        };
    }
    async acceptAgentEdits(_uri, _edits, isLastEdits, _responseModel) {
        // For deleted files, there are no incremental edits - the file is just deleted
        transaction((tx) => {
            this._waitsForLastEdits.set(!isLastEdits, tx);
            this._stateObs.set(0 /* ModifiedFileEntryState.Modified */, tx);
            if (isLastEdits) {
                this._resetEditsState(tx);
                this._rewriteRatioObs.set(1, tx);
            }
        });
    }
    async _doAccept() {
        // File deletion is already done - just collapse the entry
        this._multiDiffEntryDelegate.collapse(undefined);
    }
    async _doReject() {
        // Restore the file from original content
        await this._fileService.writeFile(this.modifiedURI, VSBuffer.fromString(this._originalContent));
        this._multiDiffEntryDelegate.collapse(undefined);
    }
    _createEditorIntegration(_editor) {
        // Deleted files don't need complex editor integration since there's nothing to navigate
        return {
            currentIndex: observableValue(this, 0),
            reveal: () => { },
            next: () => false,
            previous: () => false,
            enableAccessibleDiffView: () => { },
            acceptNearestChange: async () => { },
            rejectNearestChange: async () => { },
            toggleDiff: async () => { },
            dispose: () => { }
        };
    }
    async computeEditsFromSnapshots(_beforeSnapshot, _afterSnapshot) {
        // For deleted files, we don't compute incremental edits
        return [];
    }
    async save() {
        // Nothing to save - file is deleted
    }
    async revertToDisk() {
        // Nothing to revert - file is deleted
    }
};
ChatEditingDeletedFileEntry = __decorate([
    __param(5, IModelService),
    __param(6, ILanguageService),
    __param(7, IConfigurationService),
    __param(8, IFilesConfigurationService),
    __param(9, IChatService),
    __param(10, IFileService),
    __param(11, IUndoRedoService),
    __param(12, IInstantiationService),
    __param(13, IAiEditTelemetryService)
], ChatEditingDeletedFileEntry);
export { ChatEditingDeletedFileEntry };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRpbmdEZWxldGVkRmlsZUVudHJ5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nRGVsZXRlZEZpbGVFbnRyeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLGVBQWUsRUFBNkIsZUFBZSxFQUFFLFdBQVcsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3BJLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUVsRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFFbEYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFFN0YsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFdEYsT0FBTyxFQUFFLG1DQUFtQyxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDdEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM3RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQW9CLGdCQUFnQixFQUF1QixNQUFNLHFEQUFxRCxDQUFDO0FBRTlILE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDZFQUE2RSxDQUFDO0FBQ3pILE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3JGLE9BQU8sRUFB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