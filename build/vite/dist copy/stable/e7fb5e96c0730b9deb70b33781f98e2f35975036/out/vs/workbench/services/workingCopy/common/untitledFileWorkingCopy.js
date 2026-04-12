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
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkingCopyService } from './workingCopyService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { raceCancellation } from '../../../../base/common/async.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkingCopyBackupService } from './workingCopyBackup.js';
import { emptyStream } from '../../../../base/common/stream.js';
let UntitledFileWorkingCopy = class UntitledFileWorkingCopy extends Disposable {
    get model() { return this._model; }
    //#endregion
    constructor(typeId, resource, name, hasAssociatedFilePath, isScratchpad, initialContents, modelFactory, saveDelegate, workingCopyService, workingCopyBackupService, logService) {
        super();
        this.typeId = typeId;
        this.resource = resource;
        this.name = name;
        this.hasAssociatedFilePath = hasAssociatedFilePath;
        this.isScratchpad = isScratchpad;
        this.initialContents = initialContents;
        this.modelFactory = modelFactory;
        this.saveDelegate = saveDelegate;
        this.workingCopyBackupService = workingCopyBackupService;
        this.logService = logService;
        this._model = undefined;
        //#region Events
        this._onDidChangeContent = this._register(new Emitter());
        this.onDidChangeContent = this._onDidChangeContent.event;
        this._onDidChangeDirty = this._register(new Emitter());
        this.onDidChangeDirty = this._onDidChangeDirty.event;
        this._onDidSave = this._register(new Emitter());
        this.onDidSave = this._onDidSave.event;
        this._onDidRevert = this._register(new Emitter());
        this.onDidRevert = this._onDidRevert.event;
        this._onWillDispose = this._register(new Emitter());
        this.onWillDispose = this._onWillDispose.event;
        this.capabilities = this.isScratchpad ? 2 /* WorkingCopyCapabilities.Untitled */ | 4 /* WorkingCopyCapabilities.Scratchpad */ : 2 /* WorkingCopyCapabilities.Untitled */;
        this.modified = this.hasAssociatedFilePath || Boolean(this.initialContents && this.initialContents.markModified !== false);
        // Make known to working copy service
        this._register(workingCopyService.registerWorkingCopy(this));
    }
    isDirty() {
        return this.modified && !this.isScratchpad; // Scratchpad working copies are never dirty
    }
    isModified() {
        return this.modified;
    }
    setModified(modified) {
        if (this.modified === modified) {
            return;
        }
        this.modified = modified;
        if (!this.isScratchpad) {
            this._onDidChangeDirty.fire();
        }
    }
    //#endregion
    //#region Resolve
    async resolve() {
        this.trace('resolve()');
        if (this.isResolved()) {
            this.trace('resolve() - exit (already resolved)');
            // return early if the untitled file working copy is already
            // resolved assuming that the contents have meanwhile changed
            // in the underlying model. we only resolve untitled once.
            return;
        }
        let untitledContents;
        // Check for backups or use initial value or empty
        const backup = await this.workingCopyBackupService.resolve(this);
        if (backup) {
            this.trace('resolve() - with backup');
            untitledContents = backup.value;
        }
        else if (this.initialContents?.value) {
            this.trace('resolve() - with initial contents');
            untitledContents = this.initialContents.value;
        }
        else {
            this.trace('resolve() - empty');
            untitledContents = emptyStream();
        }
        // Create model
        await this.doCreateModel(untitledContents);
        // Untitled associated to file path are modified right away as well as untitled with content
        this.setModified(this.hasAssociatedFilePath || !!backup || Boolean(this.initialContents && this.initialContents.markModified !== false));
        // If we have initial contents, make sure to emit this
        // as the appropriate events to the outside.
        if (!!backup || this.initialContents) {
            this._onDidChangeContent.fire();
        }
    }
    async doCreateModel(contents) {
        this.trace('doCreateModel()');
        // Create model and dispose it when we get disposed
        this._model = this._register(await this.modelFactory.createModel(this.resource, contents, CancellationToken.None));
        // Model listeners
        this.installModelListeners(this._model);
    }
    installModelListeners(model) {
        // Content Change
        this._register(model.onDidChangeContent(e => this.onModelContentChanged(e)));
        // Lifecycle
        this._register(model.onWillDispose(() => this.dispose()));
    }
    onModelContentChanged(e) {
        // Mark the untitled file working copy as non-modified once its
        // in case provided by the change event and in case we do not
        // have an associated path set
        if (!this.hasAssociatedFilePath && e.isInitial) {
            this.setModified(false);
        }
        // Turn modified otherwise
        else {
            this.setModified(true);
        }
        // Emit as general content change event
        this._onDidChangeContent.fire();
    }
    isResolved() {
        return !!this.model;
    }
    //#endregion
    //#region Backup
    get backupDelay() {
        return this.model?.configuration?.backupDelay;
    }
    async backup(token) {
        let content = undefined;
        // Make sure to check whether this working copy has been
        // resolved or not and fallback to the initial value -
        // if any - to prevent backing up an unresolved working
        // copy and loosing the initial value.
        if (this.isResolved()) {
            content = await raceCancellation(this.model.snapshot(2 /* SnapshotContext.Backup */, token), token);
        }
        else if (this.initialContents) {
            content = this.initialContents.value;
        }
        return { content };
    }
    //#endregion
    //#region Save
    async save(options) {
        this.trace('save()');
        const result = await this.saveDelegate(this, options);
        // Emit Save Event
        if (result) {
            this._onDidSave.fire({ reason: options?.reason, source: options?.source });
        }
        return result;
    }
    //#endregion
    //#region Revert
    async revert() {
        this.trace('revert()');
        // No longer modified
        this.setModified(false);
        // Emit as event
        this._onDidRevert.fire();
        // A reverted untitled file working copy is invalid
        // because it has no actual source on disk to revert to.
        // As such we dispose the model.
        this.dispose();
    }
    //#endregion
    dispose() {
        this.trace('dispose()');
        this._onWillDispose.fire();
        super.dispose();
    }
    trace(msg) {
        this.logService.trace(`[untitled file working copy] ${msg}`, this.resource.toString(), this.typeId);
    }
};
UntitledFileWorkingCopy = __decorate([
    __param(8, IWorkingCopyService),
    __param(9, IWorkingCopyBackupService),
    __param(10, ILogService)
], UntitledFileWorkingCopy);
export { UntitledFileWorkingCopy };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidW50aXRsZWRGaWxlV29ya2luZ0NvcHkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3VudGl0bGVkRmlsZVdvcmtpbmdDb3B5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBUyxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUlsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFbEUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDOUQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFNUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDcEUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ25FLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQTJFekQsSUFBTSx1QkFBdUIsR0FBN0IsTUFBTSx1QkFBaUUsU0FBUSxVQUFVO0lBSy9GLElBQUksS0FBSyxLQUFvQixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBbUJsRCxZQUFZO0lBRVosWUFDVSxNQUFjLEVBQ2QsUUFBYSxFQUNiLElBQVksRUFDWixxQkFBOEIsRUFDdEIsWUFBcUIsRUFDckIsZUFBb0UsRUFDcEUsWUFBcUQsRUFDckQsWUFBcUQsRUFDakQsa0JBQXVDLEVBQ2pDLHdCQUFvRSxFQUNsRixVQUF3QztRQUVyRCxLQUFLLEVBQUUsQ0FBQztRQVpDLFdBQU0sR0FBTixNQUFNLENBQVE7UUFDZCxhQUFRLEdBQVIsUUFBUSxD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