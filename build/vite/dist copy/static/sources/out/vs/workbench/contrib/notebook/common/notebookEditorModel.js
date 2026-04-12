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
var SimpleNotebookEditorModel_1;
import { streamToBuffer } from '../../../../base/common/buffer.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { assertType, hasKey } from '../../../../base/common/types.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { FileOperationError } from '../../../../platform/files/common/files.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { EditorModel } from '../../../common/editor/editorModel.js';
import { NotebookCellsChangeType, NotebookSetting } from './notebookCommon.js';
import { INotebookLoggingService } from './notebookLoggingService.js';
import { INotebookService, SimpleNotebookProviderInfo } from './notebookService.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
//#region --- simple content provider
let SimpleNotebookEditorModel = SimpleNotebookEditorModel_1 = class SimpleNotebookEditorModel extends EditorModel {
    constructor(resource, _hasAssociatedFilePath, viewType, _workingCopyManager, scratchpad, _filesConfigurationService) {
        super();
        this.resource = resource;
        this._hasAssociatedFilePath = _hasAssociatedFilePath;
        this.viewType = viewType;
        this._workingCopyManager = _workingCopyManager;
        this._filesConfigurationService = _filesConfigurationService;
        this._onDidChangeDirty = this._register(new Emitter());
        this._onDidSave = this._register(new Emitter());
        this._onDidChangeOrphaned = this._register(new Emitter());
        this._onDidChangeReadonly = this._register(new Emitter());
        this._onDidRevertUntitled = this._register(new Emitter());
        this.onDidChangeDirty = this._onDidChangeDirty.event;
        this.onDidSave = this._onDidSave.event;
        this.onDidChangeOrphaned = this._onDidChangeOrphaned.event;
        this.onDidChangeReadonly = this._onDidChangeReadonly.event;
        this.onDidRevertUntitled = this._onDidRevertUntitled.event;
        this._workingCopyListeners = this._register(new DisposableStore());
        this.scratchPad = scratchpad;
    }
    dispose() {
        this._workingCopy?.dispose();
        super.dispose();
    }
    get notebook() {
        return this._workingCopy?.model?.notebookModel;
    }
    isResolved() {
        return Boolean(this._workingCopy?.model?.notebookModel);
    }
    async canDispose() {
        if (!this._workingCopy) {
            return true;
        }
        if (SimpleNotebookEditorModel_1._isStoredFileWorkingCopy(this._workingCopy)) {
            return this._workingCopyManager.stored.canDispose(this._workingCopy);
        }
        else {
            return true;
        }
    }
    isDirty() {
        return this._workingCopy?.isDirty() ?? false;
    }
    isModified() {
        return this._workingCopy?.isModified() ?? false;
    }
    isOrphaned() {
        return SimpleNotebookEditorModel_1._isStoredFileWorkingCopy(this._workingCopy) && this._workingCopy.hasState(4 /* StoredFileWorkingCopyState.ORPHAN */);
    }
    hasAssociatedFilePath() {
        return !SimpleNotebookEditorModel_1._isStoredFileWorkingCopy(this._workingCopy) && !!this._workingCopy?.hasAssociatedFilePath;
    }
    isReadonly() {
        if (SimpleNotebookEditorModel_1._isStoredFileWorkingCopy(this._workingCopy)) {
            return this._workingCopy?.isReadonly();
        }
        else {
            return this._filesConfigurationService.isReadonly(this.resource);
        }
    }
    get hasErrorState() {
        if (this._workingCopy && hasKey(this._workingCopy, { hasState: true })) {
            return this._workingCopy.hasState(5 /* StoredFileWorkingCopyState.ERROR */);
        }
        return false;
    }
    async revert(options) {
        assertType(this.isResolved());
        return this._workingCopy.revert(options);
    }
    async save(options) {
        assertType(this.isResolved());
        return this._workingCopy.save(options);
    }
    async load(options) {
        if (!this._workingCopy || !this._workingCopy.model) {
            if (this.resource.scheme === Schemas.untitled) {
                if (this._hasAssociatedFilePath) {
                    this._workingCopy = await this._workingCopyManager.resolve({ associatedResource: this.resource });
                }
                else {
                    this._workingCopy = await this._workingCopyManager.resolve({ untitledResource: this.resource, isScratchpad: this.scratchPad });
                }
                this._register(this._workingCopy.onDidRevert(() => this._onDidRevertUntitled.fire()));
            }
            else {
                this._workingCopy = await this._workingCopyManager.resolve(this.resource, {
                    limits: options?.limits,
                    reload: options?.forceReadFromFile ? { async: false, force: true } : undefined
                });
                this._workingCopyListeners.add(this._workingCopy.onDidSave(e => this._onDidSave.fire(e)));
                this._workingCopyListeners.add(this._workingCopy.onDidChangeOrphaned(() => this._onDidChangeOrphaned.fire()));
                this._workingCopyListeners.add(this._workingCopy.onDidChangeReadonly(() => this._onDidChangeReadonly.fire()));
            }
            this._workingCopyListeners.add(this._workingCopy.onDidChangeDirty(() => this._onDidChangeDirty.fire(), undefined));
            this._workingCopyListeners.add(this._workingCopy.onWillDispose(() => {
                this._workingCopyListeners.clear();
                this._workingCopy?.model?.dispose();
            }));
        }
        else {
            await this._workingCopyManager.resolve(this.resource, {
                reload: {
                    async: !options?.forceReadFromFile,
                    force: options?.forceReadFromFile
                },
                limits: options?.limits
            });
        }
        assertType(this.isResolved());
        return this;
    }
    async saveAs(target) {
        const newWorkingCopy = await this._workingCopyManager.saveAs(this.resource, target);
        if (!newWorkingCopy) {
            return undefined;
        }
        // this is a little hacky because we leave the new working copy alone. BUT
        // the newly created editor input will pick it up and claim ownership of it.
        return { resource: newWorkingCopy.resource };
    }
    static _isStoredFileWorkingCopy(candidate) {
        const isUntitled = candidate && candidate.capabilities & 2 /* WorkingCopyCapabilities.Untitled */;
        return !isUntitled;
    }
};
SimpleNotebookEditorModel = SimpleNotebookEditorModel_1 = __decorate([
    __param(5, IFilesConfigurationService)
], SimpleNotebookEditorModel);
export { SimpleNotebookEditorModel };
export class NotebookFileWorkingCopyModel extends Disposable {
    constructor(_notebookModel, _notebookService, _configurationService, _telemetryService, _notebookLogService) {
        super();
        this._notebookModel = _notebookModel;
        this._notebookService = _notebookService;
        this._configurationService = _configurationService;
        this._telemetryService = _telemetryService;
        this._notebookLogService = _notebookLogService;
        this._onDidChangeContent = this._register(new Emitter());
        this.onDidChangeContent = this._onDidChangeContent.event;
        this.configuration = undefined;
        this.onWillDispose = _notebookModel.onWillDispose.bind(_notebookModel);
        this._register(_notebookModel.onDidChangeContent(e => {
            for (const rawEvent of e.rawEvents) {
                if (rawEvent.kind === NotebookCellsChangeType.Initialize) {
                    continue;
                }
                if (rawEvent.transient) {
                    continue;
                }
                this._onDidChangeContent.fire({
                    isRedoing: false, //todo@rebornix forward this information from notebook model
                    isUndoing: false,
                    isInitial: false, //_notebookModel.cells.length === 0 // todo@jrieken non transient metadata?
                });
                break;
            }
        }));
        const saveWithReducedCommunication = this._configurationService.getValue(NotebookSetting.remoteSaving);
        if (saveWithReducedCommunication || _notebookModel.uri.scheme === Schemas.vscodeRemote) {
            this.configuration = {
                // Intentionally pick a larger delay for triggering backups to allow auto-save
                // to complete first on the optimized save path
                backupDelay: 10000
            };
        }
        // Override save behavior to avoid transferring the buffer across the wire 3 times
        if (saveWithReducedCommunication) {
            this.setSaveDelegate().catch(error => this._notebookLogService.error('WorkingCopyModel', `Failed to set save delegate: ${error}`));
        }
    }
    async setSaveDelegate() {
        // make sure we wait for a serializer to resolve before we try to handle saves in the EH
        await this.getNotebookSerializer();
        this.save = async (options, token) => {
            try {
                let serializer = this._notebookService.tryGetDataProviderSync(this.notebookModel.viewType)?.serializer;
                if (!serializer) {
                    this._notebookLogService.info('WorkingCopyModel', 'No serializer found for notebook model, checking if provider still needs to be resolved');
                    serializer = await this.getNotebookSerializer().catch(error => {
                        this._notebookLogService.error('WorkingCopyModel', `Failed to get notebook serializer: ${error}`);
                        // The serializer was set initially but somehow is no longer available
                        this.save = undefined;
                        throw new NotebookSaveError('Failed to get notebook serializer');
                    });
                }
                if (token.isCancellationRequested) {
                    throw new CancellationError();
                }
                const stat = await serializer.save(this._notebookModel.uri, this._notebookModel.versionId, options, token);
                return stat;
            }
            catch (error) {
                if (!token.isCancellationRequested && error.name !== 'Canceled') {
                    const isIPynb = this._notebookModel.viewType === 'jupyter-notebook' || this._notebookModel.viewType === 'interactive';
                    const errorMessage = getSaveErrorMessage(error);
                    this._telemetryService.publicLogError2('notebook/SaveError', {
                        isRemote: this._notebookModel.uri.scheme === Schemas.vscodeRemote,
                        isIPyNbWorkerSerializer: isIPynb && this._configurationService.getValue('ipynb.experimental.serialization'),
                        error: errorMessage
                    });
                }
                throw error;
            }
        };
    }
    dispose() {
        this._notebookModel.dispose();
        super.dispose();
    }
    get notebookModel() {
        return this._notebookModel;
    }
    async snapshot(context, token) {
        return this._notebookService.createNotebookTextDocumentSnapshot(this._notebookModel.uri, context, token);
    }
    async update(stream, token) {
        const serializer = await this.getNotebookSerializer();
        const bytes = await streamToBuffer(stream);
        const data = await serializer.dataToNotebook(bytes);
        if (token.isCancellationRequested) {
            throw new CancellationError();
        }
        this._notebookLogService.info('WorkingCopyModel', 'Notebook content updated from file system - ' + this._notebookModel.uri.toString());
        this._notebookModel.reset(data.cells, data.metadata, serializer.options);
    }
    async getNotebookSerializer() {
        const info = await this._notebookService.withNotebookDataProvider(this.notebookModel.viewType);
        if (!(info instanceof SimpleNotebookProviderInfo)) {
            const message = 'CANNOT open notebook with this provider';
            throw new NotebookSaveError(message);
        }
        return info.serializer;
    }
    get versionId() {
        return this._notebookModel.alternativeVersionId;
    }
    pushStackElement() {
        this._notebookModel.pushStackElement();
    }
}
let NotebookFileWorkingCopyModelFactory = class NotebookFileWorkingCopyModelFactory {
    constructor(_viewType, _notebookService, _configurationService, _telemetryService, _notebookLogService) {
        this._viewType = _viewType;
        this._notebookService = _notebookService;
        this._configurationService = _configurationService;
        this._telemetryService = _telemetryService;
        this._notebookLogService = _notebookLogService;
    }
    async createModel(resource, stream, token) {
        const notebookModel = this._notebookService.getNotebookTextModel(resource) ??
            await this._notebookService.createNotebookTextModel(this._viewType, resource, stream);
        return new NotebookFileWorkingCopyModel(notebookModel, this._notebookService, this._configurationService, this._telemetryService, this._notebookLogService);
    }
};
NotebookFileWorkingCopyModelFactory = __decorate([
    __param(1, INotebookService),
    __param(2, IConfigurationService),
    __param(3, ITelemetryService),
    __param(4, INotebookLoggingService)
], NotebookFileWorkingCopyModelFactory);
export { NotebookFileWorkingCopyModelFactory };
//#endregion
class NotebookSaveError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NotebookSaveError';
    }
}
function getSaveErrorMessage(error) {
    if (error.name === 'NotebookSaveError') {
        return error.message;
    }
    else if (error instanceof FileOperationError) {
        switch (error.fileOperationResult) {
            case 0 /* FileOperationResult.FILE_IS_DIRECTORY */:
                return 'File is a directory';
            case 1 /* FileOperationResult.FILE_NOT_FOUND */:
                return 'File not found';
            case 2 /* FileOperationResult.FILE_NOT_MODIFIED_SINCE */:
                return 'File not modified since';
            case 3 /* FileOperationResult.FILE_MODIFIED_SINCE */:
                return 'File modified since';
            case 4 /* FileOperationResult.FILE_MOVE_CONFLICT */:
                return 'File move conflict';
            case 5 /* FileOperationResult.FILE_WRITE_LOCKED */:
                return 'File write locked';
            case 6 /* FileOperationResult.FILE_PERMISSION_DENIED */:
                return 'File permission denied';
            case 7 /* FileOperationResult.FILE_TOO_LARGE */:
                return 'File too large';
            case 8 /* FileOperationResult.FILE_INVALID_PATH */:
                return 'File invalid path';
            case 9 /* FileOperationResult.FILE_NOT_DIRECTORY */:
                return 'File not directory';
            case 10 /* FileOperationResult.FILE_OTHER_ERROR */:
                return 'File other error';
        }
    }
    return 'Unknown error';
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tFZGl0b3JNb2RlbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0VkaXRvck1vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQTBCLGNBQWMsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRTNGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUVsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRXRFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBNEMsa0JBQWtCLEVBQXVCLE1BQU0sNENBQTRDLENBQUM7QUFDL0ksT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFdkYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRXBFLE9BQU8sRUFBNEUsdUJBQXVCLEVBQUUsZUFBZSxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDekosT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDdEUsT0FBTyxFQUF1QixnQkFBZ0IsRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ3pHLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDBFQUEwRSxDQUFDO0FBT3RILHFDQUFxQztB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