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
var StoredFileWorkingCopy_1;
import { localize } from '../../../../nls.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { ETAG_DISABLED, IFileService, NotModifiedSinceFileOperationError } from '../../../../platform/files/common/files.js';
import { IWorkingCopyService } from './workingCopyService.js';
import { raceCancellation, TaskSequentializer, timeout } from '../../../../base/common/async.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { IWorkingCopyFileService } from './workingCopyFileService.js';
import { IFilesConfigurationService } from '../../filesConfiguration/common/filesConfigurationService.js';
import { IWorkingCopyBackupService } from './workingCopyBackup.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { hash } from '../../../../base/common/hash.js';
import { isErrorWithActions, toErrorMessage } from '../../../../base/common/errorMessage.js';
import { toAction } from '../../../../base/common/actions.js';
import { isWindows } from '../../../../base/common/platform.js';
import { IWorkingCopyEditorService } from './workingCopyEditorService.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IElevatedFileService } from '../../files/common/elevatedFileService.js';
import { ResourceWorkingCopy } from './resourceWorkingCopy.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { isCancellationError } from '../../../../base/common/errors.js';
/**
 * States the stored file working copy can be in.
 */
export var StoredFileWorkingCopyState;
(function (StoredFileWorkingCopyState) {
    /**
     * A stored file working copy is saved.
     */
    StoredFileWorkingCopyState[StoredFileWorkingCopyState["SAVED"] = 0] = "SAVED";
    /**
     * A stored file working copy is dirty.
     */
    StoredFileWorkingCopyState[StoredFileWorkingCopyState["DIRTY"] = 1] = "DIRTY";
    /**
     * A stored file working copy is currently being saved but
     * this operation has not completed yet.
     */
    StoredFileWorkingCopyState[StoredFileWorkingCopyState["PENDING_SAVE"] = 2] = "PENDING_SAVE";
    /**
     * A stored file working copy is in conflict mode when changes
     * cannot be saved because the underlying file has changed.
     * Stored file working copies in conflict mode are always dirty.
     */
    StoredFileWorkingCopyState[StoredFileWorkingCopyState["CONFLICT"] = 3] = "CONFLICT";
    /**
     * A stored file working copy is in orphan state when the underlying
     * file has been deleted.
     */
    StoredFileWorkingCopyState[StoredFileWorkingCopyState["ORPHAN"] = 4] = "ORPHAN";
    /**
     * Any error that happens during a save that is not causing
     * the `StoredFileWorkingCopyState.CONFLICT` state.
     * Stored file working copies in error mode are always dirty.
     */
    StoredFileWorkingCopyState[StoredFileWorkingCopyState["ERROR"] = 5] = "ERROR";
})(StoredFileWorkingCopyState || (StoredFileWorkingCopyState = {}));
export function isStoredFileWorkingCopySaveEvent(e) {
    const candidate = e;
    return !!candidate.stat;
}
let StoredFileWorkingCopy = class StoredFileWorkingCopy extends ResourceWorkingCopy {
    static { StoredFileWorkingCopy_1 = this; }
    get model() { return this._model; }
    //#endregion
    constructor(typeId, resource, name, modelFactory, externalResolver, fileService, logService, workingCopyFileService, filesConfigurationService, workingCopyBackupService, workingCopyService, notificationService, workingCopyEditorService, editorService, elevatedFileService, progressService) {
        super(resource, fileService);
        this.typeId = typeId;
        this.name = name;
        this.modelFactory = modelFactory;
        this.externalResolver = externalResolver;
        this.logService = logService;
        this.workingCopyFileService = workingCopyFileService;
        this.filesConfigurationService = filesConfigurationService;
        this.workingCopyBackupService = workingCopyBackupService;
        this.notificationService = notificationService;
        this.workingCopyEditorService = workingCopyEditorService;
        this.editorService = editorService;
        this.elevatedFileService = elevatedFileService;
        this.progressService = progressService;
        this.capabilities = 0 /* WorkingCopyCapabilities.None */;
        this._model = undefined;
        //#region events
        this._onDidChangeContent = this._register(new Emitter());
        this.onDidChangeContent = this._onDidChangeContent.event;
        this._onDidResolve = this._register(new Emitter());
        this.onDidResolve = this._onDidResolve.event;
        this._onDidChangeDirty = this._register(new Emitter());
        this.onDidChangeDirty = this._onDidChangeDirty.event;
        this._onDidSaveError = this._register(new Emitter());
        this.onDidSaveError = this._onDidSaveError.event;
        this._onDidSave = this._register(new Emitter());
        this.onDidSave = this._onDidSave.event;
        this._onDidRevert = this._register(new Emitter());
        this.onDidRevert = this._onDidRevert.event;
        this._onDidChangeReadonly = this._register(new Emitter());
        this.onDidChangeReadonly = this._onDidChangeReadonly.event;
        //#region Dirty
        this.dirty = false;
        this.ignoreDirtyOnModelContentChange = false;
        //#endregion
        //#region Save
        this.versionId = 0;
        this.lastContentChangeFromUndoRedo = undefined;
        this.saveSequentializer = new TaskSequentializer();
        this.ignoreSaveFromSaveParticipants = false;
        //#endregion
        //#region State
        this.inConflictMode = false;
        this.inErrorMode = false;
        // Make known to working copy service
        this._register(workingCopyService.registerWorkingCopy(this));
        this.registerListeners();
    }
    registerListeners() {
        this._register(this.filesConfigurationService.onDidChangeReadonly(() => this._onDidChangeReadonly.fire()));
    }
    isDirty() {
        return this.dirty;
    }
    markModified() {
        this.setDirty(true); // stored file working copy tracks modified via dirty
    }
    setDirty(dirty) {
        if (!this.isResolved()) {
            return; // only resolved working copies can be marked dirty
        }
        // Track dirty state and version id
        const wasDirty = this.dirty;
        this.doSetDirty(dirty);
        // Emit as Event if dirty changed
        if (dirty !== wasDirty) {
            this._onDidChangeDirty.fire();
        }
    }
    doSetDirty(dirty) {
        const wasDirty = this.dirty;
        const wasInConflictMode = this.inConflictMode;
        const wasInErrorMode = this.inErrorMode;
        const oldSavedVersionId = this.savedVersionId;
        if (!dirty) {
            this.dirty = false;
            this.inConflictMode = false;
            this.inErrorMode = false;
            // we remember the models alternate version id to remember when the version
            // of the model matches with the saved version on disk. we need to keep this
            // in order to find out if the model changed back to a saved version (e.g.
            // when undoing long enough to reach to a version that is saved and then to
            // clear the dirty flag)
            if (this.isResolved()) {
                this.savedVersionId = this.model.versionId;
            }
        }
        else {
            this.dirty = true;
        }
        // Return function to revert this call
        return () => {
            this.dirty = wasDirty;
            this.inConflictMode = wasInConflictMode;
            this.inErrorMode = wasInErrorMode;
            this.savedVersionId = oldSavedVersionId;
        };
    }
    isResolved() {
        return !!this.model;
    }
    async resolve(options) {
        this.trace('resolve() - enter');
        // Return early if we are disposed
        if (this.isDisposed()) {
            this.trace('resolve() - exit - without resolving because file working copy is disposed');
            return;
        }
        // Unless there are explicit contents provided, it is important that we do not
        // resolve a working copy that is dirty or is in the process of saving to prevent
        // data loss.
        if (!options?.contents && (this.dirty || this.saveSequentializer.isRunning())) {
            this.trace('resolve() - exit - without resolving because file working copy is dirty or being saved');
            return;
        }
        return this.doResolve(options);
    }
    async doResolve(options) {
        // First check if we have contents to use for the working copy
        if (options?.contents) {
            return this.resolveFromBuffer(options.contents);
        }
        // Second, check if we have a backup to resolve from (only for new working copies)
        const isNew = !this.isResolved();
        if (isNew) {
            const resolvedFromBackup = await this.resolveFromBackup();
            if (resolvedFromBackup) {
                return;
            }
        }
        // Finally, resolve from file resource
        return this.resolveFromFile(options);
    }
    async resolveFromBuffer(buffer) {
        this.trace('resolveFromBuffer()');
        // Try to resolve metdata from disk
        let mtime;
        let ctime;
        let size;
        let etag;
        try {
            const metadata = await this.fileService.stat(this.resource);
            mtime = metadata.mtime;
            ctime = metadata.ctime;
            size = metadata.size;
            etag = metadata.etag;
            // Clear orphaned state when resolving was successful
            this.setOrphaned(false);
        }
        catch (error) {
            // Put some fallback values in error case
            mtime = Date.now();
            ctime = Date.now();
            size = 0;
            etag = ETAG_DISABLED;
            // Apply orphaned state based on error code
            this.setOrphaned(error.fileOperationResult === 1 /* FileOperationResult.FILE_NOT_FOUND */);
        }
        // Resolve with buffer
        return this.resolveFromContent({
            resource: this.resource,
            name: this.name,
            mtime,
            ctime,
            size,
            etag,
            value: buffer,
            readonly: false,
            locked: false,
            executable: false
        }, true /* dirty (resolved from buffer) */);
    }
    async resolveFromBackup() {
        // Resolve backup if any
        const backup = await this.workingCopyBackupService.resolve(this);
        // Abort if someone else managed to resolve the working copy by now
        const isNew = !this.isResolved();
        if (!isNew) {
            this.trace('resolveFromBackup() - exit - withoutresolving because previously new file working copy got created meanwhile');
            return true; // imply that resolving has happened in another operation
        }
        // Try to resolve from backup if we have any
        if (backup) {
            await this.doResolveFromBackup(backup);
            return true;
        }
        // Otherwise signal back that resolving did not happen
        return false;
    }
    async doResolveFromBackup(backup) {
        this.trace('doResolveFromBackup()');
        // Resolve with backup
        await this.resolveFromContent({
            resource: this.resource,
            name: this.name,
            mtime: backup.meta ? backup.meta.mtime : Date.now(),
            ctime: backup.meta ? backup.meta.ctime : Date.now(),
            size: backup.meta ? backup.meta.size : 0,
            etag: backup.meta ? backup.meta.etag : ETAG_DISABLED, // etag disabled if unknown!
            value: backup.value,
            readonly: false,
            locked: false,
            executable: false
        }, true /* dirty (resolved from backup) */);
        // Restore orphaned flag based on state
        if (backup.meta?.orphaned) {
            this.setOrphaned(true);
        }
    }
    async resolveFromFile(options) {
        this.trace('resolveFromFile()');
        const forceReadFromFile = options?.forceReadFromFile;
        // Decide on etag
        let etag;
        if (forceReadFromFile) {
            etag = ETAG_DISABLED; // disable ETag if we enforce to read from disk
        }
        else if (this.lastResolvedFileStat) {
            etag = this.lastResolvedFileStat.etag; // otherwise respect etag to support caching
        }
        // Remember current version before doing any long running operation
        // to ensure we are not changing a working copy that was changed
        // meanwhile
        const currentVersionId = this.versionId;
        // Resolve Content
        try {
            const content = await this.fileService.readFileStream(this.resource, {
                etag,
                limits: options?.limits
            });
            // Clear orphaned state when resolving was successful
            this.setOrphaned(false);
            // Return early if the working copy content has changed
            // meanwhile to prevent loosing any changes
            if (currentVersionId !== this.versionId) {
                this.trace('resolveFromFile() - exit - without resolving because file working copy content changed');
                return;
            }
            await this.resolveFromContent(content, false /* not dirty (resolved from file) */);
        }
        catch (error) {
            const result = error.fileOperationResult;
            // Apply orphaned state based on error code
            this.setOrphaned(result === 1 /* FileOperationResult.FILE_NOT_FOUND */);
            // NotModified status is expected and can be handled gracefully
            // if we are resolved. We still want to update our last resolved
            // stat to e.g. detect changes to the file's readonly state
            if (this.isResolved() && result === 2 /* FileOperationResult.FILE_NOT_MODIFIED_SINCE */) {
                if (error instanceof NotModifiedSinceFileOperationError) {
                    this.updateLastResolvedFileStat(error.stat);
                }
                return;
            }
            // Unless we are forced to read from the file, ignore when a working copy has
            // been resolved once and the file was deleted meanwhile. Since we already have
            // the working copy resolved, we can return to this state and update the orphaned
            // flag to indicate that this working copy has no version on disk anymore.
            if (this.isResolved() && result === 1 /* FileOperationResult.FILE_NOT_FOUND */ && !forceReadFromFile) {
                return;
            }
            // Otherwise bubble up the error
            throw error;
        }
    }
    async resolveFromContent(content, dirty) {
        this.trace('resolveFromContent() - enter');
        // Return early if we are disposed
        if (this.isDisposed()) {
            this.trace('resolveFromContent() - exit - because working copy is disposed');
            return;
        }
        // Update our resolved disk stat
        this.updateLastResolvedFileStat({
            resource: this.resource,
            name: content.name,
            mtime: content.mtime,
            ctime: content.ctime,
            size: content.size,
            etag: content.etag,
            readonly: content.readonly,
            locked: content.locked,
            executable: false,
            isFile: true,
            isDirectory: false,
            isSymbolicLink: false,
            children: undefined
        });
        // Update existing model if we had been resolved
        if (this.isResolved()) {
            await this.doUpdateModel(content.value);
        }
        // Create new model otherwise
        else {
            await this.doCreateModel(content.value);
        }
        // Update working copy dirty flag. This is very important to call
        // in both cases of dirty or not because it conditionally updates
        // the `savedVersionId` to determine the version when to consider
        // the working copy as saved again (e.g. when undoing back to the
        // saved state)
        this.setDirty(!!dirty);
        // Emit as event
        this._onDidResolve.fire();
    }
    async doCreateModel(contents) {
        this.trace('doCreateModel()');
        // Create model and dispose it when we get disposed
        this._model = this._register(await this.modelFactory.createModel(this.resource, contents, CancellationToken.None));
        // Model listeners
        this.installModelListeners(this._model);
    }
    async doUpdateModel(contents) {
        this.trace('doUpdateModel()');
        // Update model value in a block that ignores content change events for dirty tracking
        this.ignoreDirtyOnModelContentChange = true;
        try {
            await this.model?.update(contents, CancellationToken.None);
        }
        finally {
            this.ignoreDirtyOnModelContentChange = false;
        }
    }
    installModelListeners(model) {
        // See https://github.com/microsoft/vscode/issues/30189
        // This code has been extracted to a different method because it caused a memory leak
        // where `value` was captured in the content change listener closure scope.
        // Content Change
        this._register(model.onDidChangeContent(e => this.onModelContentChanged(model, e.isUndoing || e.isRedoing)));
        // Lifecycle
        this._register(model.onWillDispose(() => this.dispose()));
    }
    onModelContentChanged(model, isUndoingOrRedoing) {
        this.trace(`onModelContentChanged() - enter`);
        // In any case increment the version id because it tracks the content state of the model at all times
        this.versionId++;
        this.trace(`onModelContentChanged() - new versionId ${this.versionId}`);
        // Remember when the user changed the model through a undo/redo operation.
        // We need this information to throttle save participants to fix
        // https://github.com/microsoft/vscode/issues/102542
        if (isUndoingOrRedoing) {
            this.lastContentChangeFromUndoRedo = Date.now();
        }
        // We mark check for a dirty-state change upon model content change, unless:
        // - explicitly instructed to ignore it (e.g. from model.resolve())
        // - the model is readonly (in that case we never assume the change was done by the user)
        if (!this.ignoreDirtyOnModelContentChange && !this.isReadonly()) {
            // The contents changed as a matter of Undo and the version reached matches the saved one
            // In this case we clear the dirty flag and emit a SAVED event to indicate this state.
            if (model.versionId === this.savedVersionId) {
                this.trace('onModelContentChanged() - model content changed back to last saved version');
                // Clear flags
                const wasDirty = this.dirty;
                this.setDirty(false);
                // Emit revert event if we were dirty
                if (wasDirty) {
                    this._onDidRevert.fire();
                }
            }
            // Otherwise the content has changed and we signal this as becoming dirty
            else {
                this.trace('onModelContentChanged() - model content changed and marked as dirty');
                // Mark as dirty
                this.setDirty(true);
            }
        }
        // Emit as event
        this._onDidChangeContent.fire();
    }
    async forceResolveFromFile() {
        if (this.isDisposed()) {
            return; // return early when the working copy is invalid
        }
        // We go through the resolver to make
        // sure this kind of `resolve` is properly
        // running in sequence with any other running
        // `resolve` if any, including subsequent runs
        // that are triggered right after.
        await this.externalResolver({
            forceReadFromFile: true
        });
    }
    //#endregion
    //#region Backup
    get backupDelay() {
        return this.model?.configuration?.backupDelay;
    }
    async backup(token) {
        // Fill in metadata if we are resolved
        let meta = undefined;
        if (this.lastResolvedFileStat) {
            meta = {
                mtime: this.lastResolvedFileStat.mtime,
                ctime: this.lastResolvedFileStat.ctime,
                size: this.lastResolvedFileStat.size,
                etag: this.lastResolvedFileStat.etag,
                orphaned: this.isOrphaned()
            };
        }
        // Fill in content if we are resolved
        let content = undefined;
        if (this.isResolved()) {
            content = await raceCancellation(this.model.snapshot(2 /* SnapshotContext.Backup */, token), token);
        }
        return { meta, content };
    }
    static { this.UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD = 500; }
    async save(options = Object.create(null)) {
        if (!this.isResolved()) {
            return false;
        }
        if (this.isReadonly()) {
            this.trace('save() - ignoring request for readonly resource');
            return false; // if working copy is readonly we do not attempt to save at all
        }
        if ((this.hasState(3 /* StoredFileWorkingCopyState.CONFLICT */) || this.hasState(5 /* StoredFileWorkingCopyState.ERROR */)) &&
            (options.reason === 2 /* SaveReason.AUTO */ || options.reason === 3 /* SaveReason.FOCUS_CHANGE */ || options.reason === 4 /* SaveReason.WINDOW_CHANGE */)) {
            this.trace('save() - ignoring auto save request for file working copy that is in conflict or error');
            return false; // if working copy is in save conflict or error, do not save unless save reason is explicit
        }
        // Actually do save
        this.trace('save() - enter');
        await this.doSave(options);
        this.trace('save() - exit');
        return this.hasState(0 /* StoredFileWorkingCopyState.SAVED */);
    }
    async doSave(options) {
        if (typeof options.reason !== 'number') {
            options.reason = 1 /* SaveReason.EXPLICIT */;
        }
        const versionId = this.versionId;
        this.trace(`doSave(${versionId}) - enter with versionId ${versionId}`);
        // Return early if saved from within save participant to break recursion
        //
        // Scenario: a save participant triggers a save() on the working copy
        if (this.ignoreSaveFromSaveParticipants) {
            this.trace(`doSave(${versionId}) - exit - refusing to save() recursively from save participant`);
            return;
        }
        // Lookup any running save for this versionId and return it if found
        //
        // Scenario: user invoked the save action multiple times quickly for the same contents
        //           while the save was not yet finished to disk
        //
        if (this.saveSequentializer.isRunning(versionId)) {
            this.trace(`doSave(${versionId}) - exit - found a running save for versionId ${versionId}`);
            return this.saveSequentializer.running;
        }
        // Return early if not dirty (unless forced)
        //
        // Scenario: user invoked save action even though the working copy is not dirty
        if (!options.force && !this.dirty) {
            this.trace(`doSave(${versionId}) - exit - because not dirty and/or versionId is different (this.isDirty: ${this.dirty}, this.versionId: ${this.versionId})`);
            return;
        }
        // Return if currently saving by storing this save request as the next save that should happen.
        // Never ever must 2 saves execute at the same time because this can lead to dirty writes and race conditions.
        //
        // Scenario A: auto save was triggered and is currently busy saving to disk. this takes long enough that another auto save
        //             kicks in.
        // Scenario B: save is very slow (e.g. network share) and the user manages to change the working copy and trigger another save
        //             while the first save has not returned yet.
        //
        if (this.saveSequentializer.isRunning()) {
            this.trace(`doSave(${versionId}) - exit - because busy saving`);
            // Indicate to the save sequentializer that we want to
            // cancel the running operation so that ours can run
            // before the running one finishes.
            // Currently this will try to cancel running save
            // participants and running snapshots from the
            // save operation, but not the actual save which does
            // not support cancellation yet.
            this.saveSequentializer.cancelRunning();
            // Queue this as the upcoming save and return
            return this.saveSequentializer.queue(() => this.doSave(options));
        }
        // Push all edit operations to the undo stack so that the user has a chance to
        // Ctrl+Z back to the saved version.
        if (this.isResolved()) {
            this.model.pushStackElement();
        }
        const saveCancellation = new CancellationTokenSource();
        return this.progressService.withProgress({
            title: localize('saveParticipants', "Saving '{0}'", this.name),
            location: 10 /* ProgressLocation.Window */,
            cancellable: true,
            delay: this.isDirty() ? 3000 : 5000
        }, progress => {
            return this.doSaveSequential(versionId, options, progress, saveCancellation);
        }, () => {
            saveCancellation.cancel();
        }).finally(() => {
            saveCancellation.dispose();
        });
    }
    doSaveSequential(versionId, options, progress, saveCancellation) {
        return this.saveSequentializer.run(versionId, (async () => {
            // A save participant can still change the working copy now
            // and since we are so close to saving we do not want to trigger
            // another auto save or similar, so we block this
            // In addition we update our version right after in case it changed
            // because of a working copy change
            // Save participants can also be skipped through API.
            if (this.isResolved() && !options.skipSaveParticipants && this.workingCopyFileService.hasSaveParticipants) {
                try {
                    // Measure the time it took from the last undo/redo operation to this save. If this
                    // time is below `UNDO_REDO_SAVE_PARTICIPANTS_THROTTLE_THRESHOLD`, we make sure to
                    // delay the save participant for the remaining time if the reason is auto save.
                    //
                    // This fixes the following issue:
                    // - the user has configured auto save with delay of 100ms or shorter
                    // - the user has a save participant enabled that modifies the file on each save
                    // - the user types into the file and the file gets saved
                    // - the user triggers undo operation
                    // - this will undo the save participant change but trigger the save participant right after
                    // - the user has no chance to undo over the save participant
                    //
                    // Reported as: https://github.com/microsoft/vscode/issues/102542
                    if (options.reason === 2 /* SaveReason.AUTO */ && typeof this.lastContentChangeFromUndoRedo === 'number') {
                        const timeFromUndoRedoToSave = Date.now() - this.lastContentChangeFromUndoRedo;
                        if (timeFromUndoRedoToSave < StoredFileWorkingCopy_1.UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD) {
                            await timeout(StoredFileWorkingCopy_1.UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD - timeFromUndoRedoToSave);
                        }
                    }
                    // Run save participants unless save was cancelled meanwhile
                    if (!saveCancellation.token.isCancellationRequested) {
                        this.ignoreSaveFromSaveParticipants = true;
                        try {
                            await this.workingCopyFileService.runSaveParticipants(this, { reason: options.reason ?? 1 /* SaveReason.EXPLICIT */, savedFrom: options.from }, progress, saveCancellation.token);
                        }
                        catch (err) {
                            if (isCancellationError(err) && !saveCancellation.token.isCancellationRequested) {
                                // participant wants to cancel this operation
                                saveCancellation.cancel();
                            }
                        }
                        finally {
                            this.ignoreSaveFromSaveParticipants = false;
                        }
                    }
                }
                catch (error) {
                    this.logService.error(`[stored file working copy] runSaveParticipants(${versionId}) - resulted in an error: ${error.toString()}`, this.resource.toString(), this.typeId);
                }
            }
            // It is possible that a subsequent save is cancelling this
            // running save. As such we return early when we detect that.
            if (saveCancellation.token.isCancellationRequested) {
                return;
            }
            // We have to protect against being disposed at this point. It could be that the save() operation
            // was triggerd followed by a dispose() operation right after without waiting. Typically we cannot
            // be disposed if we are dirty, but if we are not dirty, save() and dispose() can still be triggered
            // one after the other without waiting for the save() to complete. If we are disposed(), we risk
            // saving contents to disk that are stale (see https://github.com/microsoft/vscode/issues/50942).
            // To fix this issue, we will not store the contents to disk when we got disposed.
            if (this.isDisposed()) {
                return;
            }
            // We require a resolved working copy from this point on, since we are about to write data to disk.
            if (!this.isResolved()) {
                return;
            }
            // update versionId with its new value (if pre-save changes happened)
            versionId = this.versionId;
            // Clear error flag since we are trying to save again
            this.inErrorMode = false;
            // Save to Disk. We mark the save operation as currently running with
            // the latest versionId because it might have changed from a save
            // participant triggering
            progress.report({ message: localize('saveTextFile', "Writing into file...") });
            this.trace(`doSave(${versionId}) - before write()`);
            const lastResolvedFileStat = assertReturnsDefined(this.lastResolvedFileStat);
            const resolvedFileWorkingCopy = this;
            return this.saveSequentializer.run(versionId, (async () => {
                try {
                    const writeFileOptions = {
                        mtime: lastResolvedFileStat.mtime,
                        etag: (options.ignoreModifiedSince || !this.filesConfigurationService.preventSaveConflicts(lastResolvedFileStat.resource)) ? ETAG_DISABLED : lastResolvedFileStat.etag,
                        unlock: options.writeUnlock
                    };
                    let stat;
                    // Delegate to working copy model save method if any
                    if (typeof resolvedFileWorkingCopy.model.save === 'function') {
                        try {
                            stat = await resolvedFileWorkingCopy.model.save(writeFileOptions, saveCancellation.token);
                        }
                        catch (error) {
                            if (saveCancellation.token.isCancellationRequested) {
                                return undefined; // save was cancelled
                            }
                            throw error;
                        }
                    }
                    // Otherwise ask for a snapshot and save via file services
                    else {
                        // Snapshot working copy model contents
                        const snapshot = await raceCancellation(resolvedFileWorkingCopy.model.snapshot(1 /* SnapshotContext.Save */, saveCancellation.token), saveCancellation.token);
                        // It is possible that a subsequent save is cancelling this
                        // running save. As such we return early when we detect that
                        // However, we do not pass the token into the file service
                        // because that is an atomic operation currently without
                        // cancellation support, so we dispose the cancellation if
                        // it was not cancelled yet.
                        if (saveCancellation.token.isCancellationRequested) {
                            return;
                        }
                        else {
                            saveCancellation.dispose();
                        }
                        // Write them to disk
                        if (options?.writeElevated && this.elevatedFileService.isSupported(lastResolvedFileStat.resource)) {
                            stat = await this.elevatedFileService.writeFileElevated(lastResolvedFileStat.resource, assertReturnsDefined(snapshot), writeFileOptions);
                        }
                        else {
                            stat = await this.fileService.writeFile(lastResolvedFileStat.resource, assertReturnsDefined(snapshot), writeFileOptions);
                        }
                    }
                    this.handleSaveSuccess(stat, versionId, options);
                }
                catch (error) {
                    this.handleSaveError(error, versionId, options);
                }
            })(), () => saveCancellation.cancel());
        })(), () => saveCancellation.cancel());
    }
    handleSaveSuccess(stat, versionId, options) {
        // Updated resolved stat with updated stat
        this.updateLastResolvedFileStat(stat);
        // Update dirty state unless working copy has changed meanwhile
        if (versionId === this.versionId) {
            this.trace(`handleSaveSuccess(${versionId}) - setting dirty to false because versionId did not change`);
            this.setDirty(false);
        }
        else {
            this.trace(`handleSaveSuccess(${versionId}) - not setting dirty to false because versionId did change meanwhile`);
        }
        // Update orphan state given save was successful
        this.setOrphaned(false);
        // Emit Save Event
        this._onDidSave.fire({ reason: options.reason, stat, source: options.source });
    }
    handleSaveError(error, versionId, options) {
        (options.ignoreErrorHandler ? this.logService.trace : this.logService.error).apply(this.logService, [`[stored file working copy] handleSaveError(${versionId}) - exit - resulted in a save error: ${error.toString()}`, this.resource.toString(), this.typeId]);
        // Return early if the save() call was made asking to
        // handle the save error itself.
        if (options.ignoreErrorHandler) {
            throw error;
        }
        // In any case of an error, we mark the working copy as dirty to prevent data loss
        // It could be possible that the write corrupted the file on disk (e.g. when
        // an error happened after truncating the file) and as such we want to preserve
        // the working copy contents to prevent data loss.
        this.setDirty(true);
        // Flag as error state
        this.inErrorMode = true;
        // Look out for a save conflict
        if (error.fileOperationResult === 3 /* FileOperationResult.FILE_MODIFIED_SINCE */) {
            this.inConflictMode = true;
        }
        // Show save error to user for handling
        this.doHandleSaveError(error, options);
        // Emit as event
        this._onDidSaveError.fire();
    }
    doHandleSaveError(error, options) {
        const fileOperationError = error;
        const primaryActions = [];
        let message;
        // Dirty write prevention
        if (fileOperationError.fileOperationResult === 3 /* FileOperationResult.FILE_MODIFIED_SINCE */) {
            message = localize('staleSaveError', "Failed to save '{0}': The content of the file is newer. Do you want to overwrite the file with your changes?", this.name);
            primaryActions.push(toAction({ id: 'fileWorkingCopy.overwrite', label: localize('overwrite', "Overwrite"), run: () => this.save({ ...options, ignoreModifiedSince: true, reason: 1 /* SaveReason.EXPLICIT */ }) }));
            primaryActions.push(toAction({ id: 'fileWorkingCopy.revert', label: localize('revert', "Revert"), run: () => this.revert() }));
        }
        // Any other save error
        else {
            const isWriteLocked = fileOperationError.fileOperationResult === 5 /* FileOperationResult.FILE_WRITE_LOCKED */;
            const triedToUnlock = isWriteLocked && fileOperationError.options?.unlock;
            const isPermissionDenied = fileOperationError.fileOperationResult === 6 /* FileOperationResult.FILE_PERMISSION_DENIED */;
            const canSaveElevated = this.elevatedFileService.isSupported(this.resource);
            // Error with Actions
            if (isErrorWithActions(error)) {
                primaryActions.push(...error.actions);
            }
            // Save Elevated
            if (canSaveElevated && (isPermissionDenied || triedToUnlock)) {
                primaryActions.push(toAction({
                    id: 'fileWorkingCopy.saveElevated',
                    label: triedToUnlock ?
                        isWindows ? localize('overwriteElevated', "Overwrite as Admin...") : localize('overwriteElevatedSudo', "Overwrite as Sudo...") :
                        isWindows ? localize('saveElevated', "Retry as Admin...") : localize('saveElevatedSudo', "Retry as Sudo..."),
                    run: () => {
                        this.save({ ...options, writeElevated: true, writeUnlock: triedToUnlock, reason: 1 /* SaveReason.EXPLICIT */ });
                    }
                }));
            }
            // Unlock
            else if (isWriteLocked) {
                primaryActions.push(toAction({ id: 'fileWorkingCopy.unlock', label: localize('overwrite', "Overwrite"), run: () => this.save({ ...options, writeUnlock: true, reason: 1 /* SaveReason.EXPLICIT */ }) }));
            }
            // Retry
            else {
                primaryActions.push(toAction({ id: 'fileWorkingCopy.retry', label: localize('retry', "Retry"), run: () => this.save({ ...options, reason: 1 /* SaveReason.EXPLICIT */ }) }));
            }
            // Save As
            primaryActions.push(toAction({
                id: 'fileWorkingCopy.saveAs',
                label: localize('saveAs', "Save As..."),
                run: async () => {
                    const editor = this.workingCopyEditorService.findEditor(this);
                    if (editor) {
                        const result = await this.editorService.save(editor, { saveAs: true, reason: 1 /* SaveReason.EXPLICIT */ });
                        if (!result.success) {
                            this.doHandleSaveError(error, options); // show error again given the operation failed
                        }
                    }
                }
            }));
            // Revert
            primaryActions.push(toAction({ id: 'fileWorkingCopy.revert', label: localize('revert', "Revert"), run: () => this.revert() }));
            // Message
            if (isWriteLocked) {
                if (triedToUnlock && canSaveElevated) {
                    message = isWindows ?
                        localize('readonlySaveErrorAdmin', "Failed to save '{0}': File is read-only. Select 'Overwrite as Admin' to retry as administrator.", this.name) :
                        localize('readonlySaveErrorSudo', "Failed to save '{0}': File is read-only. Select 'Overwrite as Sudo' to retry as superuser.", this.name);
                }
                else {
                    message = localize('readonlySaveError', "Failed to save '{0}': File is read-only. Select 'Overwrite' to attempt to make it writeable.", this.name);
                }
            }
            else if (canSaveElevated && isPermissionDenied) {
                message = isWindows ?
                    localize('permissionDeniedSaveError', "Failed to save '{0}': Insufficient permissions. Select 'Retry as Admin' to retry as administrator.", this.name) :
                    localize('permissionDeniedSaveErrorSudo', "Failed to save '{0}': Insufficient permissions. Select 'Retry as Sudo' to retry as superuser.", this.name);
            }
            else {
                message = localize({ key: 'genericSaveError', comment: ['{0} is the resource that failed to save and {1} the error message'] }, "Failed to save '{0}': {1}", this.name, toErrorMessage(error, false));
            }
        }
        // Show to the user as notification
        const handle = this.notificationService.notify({ id: `${hash(this.resource.toString())}`, severity: Severity.Error, message, actions: { primary: primaryActions } });
        // Remove automatically when we get saved/reverted
        const listener = this._register(Event.once(Event.any(this.onDidSave, this.onDidRevert))(() => handle.close()));
        this._register(Event.once(handle.onDidClose)(() => listener.dispose()));
    }
    updateLastResolvedFileStat(newFileStat) {
        const oldReadonly = this.isReadonly();
        // First resolve - just take
        if (!this.lastResolvedFileStat) {
            this.lastResolvedFileStat = newFileStat;
        }
        // Subsequent resolve - make sure that we only assign it if the mtime
        // is equal or has advanced.
        // This prevents race conditions from resolving and saving. If a save
        // comes in late after a revert was called, the mtime could be out of
        // sync.
        else if (this.lastResolvedFileStat.mtime <= newFileStat.mtime) {
            this.lastResolvedFileStat = newFileStat;
        }
        // In all other cases update only the readonly and locked flags
        else {
            this.lastResolvedFileStat = { ...this.lastResolvedFileStat, readonly: newFileStat.readonly, locked: newFileStat.locked };
        }
        // Signal that the readonly state changed
        if (this.isReadonly() !== oldReadonly) {
            this._onDidChangeReadonly.fire();
        }
    }
    //#endregion
    //#region Revert
    async revert(options) {
        if (!this.isResolved() || (!this.dirty && !options?.force)) {
            return; // ignore if not resolved or not dirty and not enforced
        }
        this.trace('revert()');
        // Unset flags
        const wasDirty = this.dirty;
        const undoSetDirty = this.doSetDirty(false);
        // Force read from disk unless reverting soft
        const softUndo = options?.soft;
        if (!softUndo) {
            try {
                await this.forceResolveFromFile();
            }
            catch (error) {
                // FileNotFound means the file got deleted meanwhile, so ignore it
                if (error.fileOperationResult !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                    // Set flags back to previous values, we are still dirty if revert failed
                    undoSetDirty();
                    throw error;
                }
            }
        }
        // Emit file change event
        this._onDidRevert.fire();
        // Emit dirty change event
        if (wasDirty) {
            this._onDidChangeDirty.fire();
        }
    }
    hasState(state) {
        switch (state) {
            case 3 /* StoredFileWorkingCopyState.CONFLICT */:
                return this.inConflictMode;
            case 1 /* StoredFileWorkingCopyState.DIRTY */:
                return this.dirty;
            case 5 /* StoredFileWorkingCopyState.ERROR */:
                return this.inErrorMode;
            case 4 /* StoredFileWorkingCopyState.ORPHAN */:
                return this.isOrphaned();
            case 2 /* StoredFileWorkingCopyState.PENDING_SAVE */:
                return this.saveSequentializer.isRunning();
            case 0 /* StoredFileWorkingCopyState.SAVED */:
                return !this.dirty;
        }
    }
    async joinState(state) {
        return this.saveSequentializer.running;
    }
    //#endregion
    //#region Utilities
    isReadonly() {
        return this.filesConfigurationService.isReadonly(this.resource, this.lastResolvedFileStat);
    }
    trace(msg) {
        this.logService.trace(`[stored file working copy] ${msg}`, this.resource.toString(), this.typeId);
    }
    //#endregion
    //#region Dispose
    dispose() {
        this.trace('dispose()');
        // State
        this.inConflictMode = false;
        this.inErrorMode = false;
        // Free up model for GC
        this._model = undefined;
        super.dispose();
    }
};
StoredFileWorkingCopy = StoredFileWorkingCopy_1 = __decorate([
    __param(5, IFileService),
    __param(6, ILogService),
    __param(7, IWorkingCopyFileService),
    __param(8, IFilesConfigurationService),
    __param(9, IWorkingCopyBackupService),
    __param(10, IWorkingCopyService),
    __param(11, INotificationService),
    __param(12, IWorkingCopyEditorService),
    __param(13, IEditorService),
    __param(14, IElevatedFileService),
    __param(15, IProgressService)
], StoredFileWorkingCopy);
export { StoredFileWorkingCopy };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RvcmVkRmlsZVdvcmtpbmdDb3B5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi9zdG9yZWRGaWxlV29ya2luZ0NvcHkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUU5QyxPQUFPLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxhQUFhLEVBQTRELFlBQVksRUFBZ0Usa0NBQWtDLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUVyUCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUU5RCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsa0JBQWtCLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDakcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBRXRFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQzFHLE9BQU8sRUFBRSx5QkFBeUIsRUFBOEIsTUFBTSx3QkFBd0IsQ0FBQztBQUMvRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsUUFBUSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUcsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxjQUFjLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM3RixPQUFPLEVBQVcsUUFBUSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDdkUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzFFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNqRixPQUFPLEVBQXdCLG1CQUFtQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFHckYsT0FBTyxFQUFhLGdCQUFnQixFQUFtQyxNQUFNLGtEQUFrRCxDQUFDO0FBQ2hJLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBbUp4RTs7R0FFRztBQUNILE1BQU0sQ0FBTixJQUFrQiwwQkFxQ2pCO0FBckNELFdBQWtCLDBCQUEwQjtJQUUzQzs7T0FFRztJQUNILDZFQUFLLENBQUE7SUFFTDs7T0FFRztJQUNILDZFQUFLLENBQUE7SUFFTDs7O09BR0c7SUFDSCwyRkFBWSxDQUFBO0lBRVo7Ozs7T0FJRztJQUNILG1GQUFRLENBQUE7SUFFUjs7O09BR0c7SUFDSCwrRUFBTSxDQUFBO0lBRU47Ozs7T0FJRztJQUNILDZFQUFLLENBQUE7QUFDTixDQUFDLEVBckNpQiwwQkFBMEIsS0FBMUIsMEJBQTBCLFFBcUMzQztBQTJGRCxNQUFNLFVBQVUsZ0NBQWdDLENBQUMsQ0FBd0I7SUFDeEUsTUFBTSxTQUFTLEdBQUcsQ0FBb0MsQ0FBQztJQUV2RCxPQUFPLENBQUMsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDO0FBQ3pCLENBQUM7QUFFTSxJQUFNLHFCQUFxQixHQUEzQixNQUFNLHFCQUE2RCxTQUFRLG1CQUFtQjs7SUFLcEcsSUFBSSxLQUFLLEtBQW9CLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7SUF5QmxELFlBQVk7SUFFWixZQUNVLE1BQWMsRUFDdkIsUUFBYSxFQUNKLElBQVksRUFDSixZQUFtRCxFQUNuRCxnQkFBZ0QsRUFDbkQsV0FBeUIsRUFDMUIsVUFBd0MsRUFDNUIsc0JBQWdFLEVBQzdELHlCQUFzRSxFQUN2RSx3QkFBb0UsRUFDMUUsa0JBQXVDLEVBQ3RDLG1CQUEwRCxFQUNyRCx3QkFBb0UsRUFDL0UsYUFBOEMsRUFDeEMsbUJBQTBELEVBQzlELGVBQWtEO1FBRXBFLEtBQUssQ0FBQyxRQUFRLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFqQnBCLFdBQU0sR0FBTixNQUFNLENBQVE7UUFFZCxTQUFJLEdBQUosSUFBSSxDQUFRO1FBQ0osaUJBQVksR0FBWixZQUFZLENBQXVDO1FBQ25ELHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBZ0M7UUFFbkMsZUFBVSxHQUFWLFVBQVUsQ0FBYTtRQUNYLDJCQUFzQixHQUF0QixzQkFBc0IsQ0FBeUI7UUFDNUMsOEJBQXlCLEdBQXpCLHlCQUF5QixDQUE0QjtRQUN0RCw2QkFBd0IsR0FBeEIsd0JBQXdCLENBQTJCO1FBRXhELHdCQUFtQixHQUFuQixtQkFBbUIsQ0FBc0I7UUFDcEMsNkJBQXdCLEdBQXhCLHdCQUF3QixDQUEyQjtRQUM5RCxrQkFBYSxHQUFiLGFBQWEsQ0FBZ0I7UUFDdkIsd0JBQW1CLEdBQW5CLG1CQUFtQixDQUFzQjtRQUM3QyxvQkFBZSxHQUFmLGVBQWUsQ0FBa0I7UUE5QzVELGlCQUFZLHdDQUF5RDtRQUV0RSxXQUFNLEdBQWtCLFNBQVMsQ0FBQztRQUcxQyxnQkFBZ0I7UUFFQyx3QkFBbUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUNsRSx1QkFBa0IsR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsS0FBSyxDQUFDO1FBRTVDLGtCQUFhLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBUSxDQUFDLENBQUM7UUFDNUQsaUJBQVksR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQztRQUVoQyxzQkFBaUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUNoRSxxQkFBZ0IsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDO1FBRXhDLG9CQUFlLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBUSxDQUFDLENBQUM7UUFDOUQsbUJBQWMsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQztRQUVwQyxlQUFVLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBbUMsQ0FBQyxDQUFDO1FBQ3BGLGNBQVMsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQztRQUUxQixpQkFBWSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEsQ0FBQyxDQUFDO1FBQzNELGdCQUFXLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUM7UUFFOUIseUJBQW9CLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBUSxDQUFDLENBQUM7UUFDbkUsd0JBQW1CLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEtBQUssQ0FBQztRQWtDL0QsZUFBZTtRQUVQLFVBQUssR0FBRyxLQUFLLENBQUM7UUFzVWQsb0NBQStCLEdBQUcsS0FBSyxDQUFDO1FBeUhoRCxZQUFZO1FBRVosY0FBYztRQUVOLGNBQVMsR0FBRyxDQUFDLENBQUM7UUFHZCxrQ0FBNkIsR0FBdUIsU0FBUyxDQUFDO1FBRXJELHVCQUFrQixHQUFHLElBQUksa0JBQWtCLEVBQUUsQ0FBQztRQUV2RCxtQ0FBOEIsR0FBRyxLQUFLLENBQUM7UUFvZC9DLFlBQVk7UUFFWixlQUFlO1FBRVAsbUJBQWMsR0FBRyxLQUFLLENBQUM7UUFDdkIsZ0JBQVcsR0FBRyxLQUFLLENBQUM7UUEvNkIzQixxQ0FBcUM7UUFDckMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxrQkFBa0IsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBRTdELElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO0lBQzFCLENBQUM7SUFFTyxpQkFBaUI7UUFDeEIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMseUJBQXlCLENBQUMsbUJBQW1CLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM1RyxDQUFDO0lBT0QsT0FBTztRQUNOLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQztJQUNuQixDQUFDO0lBRUQsWUFBWTtRQUNYLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxxREFBcUQ7SUFDM0UsQ0FBQztJQUVPLFFBQVEsQ0FBQyxLQUFjO1FBQzlCLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQztZQUN4QixPQUFPLENBQUMsbURBQW1EO1FBQzVELENBQUM7UUFFRCxtQ0FBbUM7UUFDbkMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztRQUM1QixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRXZCLGlDQUFpQztRQUNqQyxJQUFJLEtBQUssS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUN4QixJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDL0IsQ0FBQztJQUNGLENBQUM7SUFFTyxVQUFVLENBQUMsS0FBYztRQUNoQyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDO1FBQzVCLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQztRQUM5QyxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDO1FBQ3hDLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQztRQUU5QyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDWixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztZQUNuQixJQUFJLENBQUMsY0FBYyxHQUFHLEtBQUssQ0FBQztZQUM1QixJQUFJLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztZQUV6QiwyRUFBMkU7WUFDM0UsNEVBQTRFO1lBQzVFLDBFQUEwRTtZQUMxRSwyRUFBMkU7WUFDM0Usd0JBQXdCO1lBQ3hCLElBQUksSUFBSSxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUM7Z0JBQ3ZCLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUM7WUFDNUMsQ0FBQztRQUNGLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUM7UUFDbkIsQ0FBQztRQUVELHNDQUFzQztRQUN0QyxPQUFPLEdBQUcsRUFBRTtZQUNYLElBQUksQ0FBQyxLQUFLLEdBQUcsUUFBUSxDQUFDO1lBQ3RCLElBQUksQ0FBQyxjQUFjLEdBQUcsaUJBQWlCLENBQUM7WUFDeEMsSUFBSSxDQUFDLFdBQVcsR0FBRyxjQUFjLENBQUM7WUFDbEMsSUFBSSxDQUFDLGNBQWMsR0FBRyxpQkFBaUIsQ0FBQztRQUN6QyxDQUFDLENBQUM7SUFDSCxDQUFDO0lBUUQsVUFBVTtRQUNULE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7SUFDckIsQ0FBQztJQUVELEtBQUssQ0FBQyxPQUFPLENBQUMsT0FBOEM7UUFDM0QsSUFBSSxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBRWhDLGtDQUFrQztRQUNsQyxJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDO1lBQ3ZCLElBQUksQ0FBQyxLQUFLLENBQUMsNEVBQTRFLENBQUMsQ0FBQztZQUV6RixPQUFPO1FBQ1IsQ0FBQztRQUVELDhFQUE4RTtRQUM5RSxpRkFBaUY7UUFDakYsYUFBYTtRQUNiLElBQUksQ0FBQyxPQUFPLEVBQUUsUUFBUSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssSUFBSSxJQUFJLENBQUMsa0JBQWtCLENBQUMsU0FBUyxFQUFFLENBQUMsRUFBRSxDQUFDO1lBQy9FLElBQUksQ0FBQyxLQUFLLENBQUMsd0ZBQXdGLENBQUMsQ0FBQztZQUVyRyxPQUFPO1FBQ1IsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNoQyxDQUFDO0lBRU8sS0FBSyxDQUFDLFNBQVMsQ0FBQyxPQUE4QztRQUVyRSw4REFBOEQ7UUFDOUQsSUFBSSxPQUFPLEVBQUUsUUFBUSxFQUFFLENBQUM7WUFDdkIsT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2pELENBQUM7UUFFRCxrRkFBa0Y7UUFDbEYsTUFBTSxLQUFLLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7UUFDakMsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUNYLE1BQU0sa0JBQWtCLEdBQUcsTUFBTSxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUMxRCxJQUFJLGtCQUFrQixFQUFFLENBQUM7Z0JBQ3hCLE9BQU87WUFDUixDQUFDO1FBQ0YsQ0FBQztRQUVELHNDQUFzQztRQUN0QyxPQUFPLElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDdEMsQ0FBQztJQUVPLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxNQUE4QjtRQUM3RCxJQUFJLENBQUMsS0FBSyxDQUFDLHFCQUFxQixDQUFDLENBQUM7UUFFbEMsbUNBQW1DO1FBQ25DLElBQUksS0FBYSxDQUFDO1FBQ2xCLElBQUksS0FBYSxDQUFDO1FBQ2xCLElBQUksSUFBWSxDQUFDO1FBQ2pCLElBQUksSUFBWSxDQUFDO1FBQ2pCLElBQUksQ0FBQztZQUNKLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzVELEtBQUssR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDO1lBQ3ZCLEtBQUssR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDO1lBQ3ZCLElBQUksR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDO1lBQ3JCLElBQUksR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDO1lBRXJCLHFEQUFxRDtZQUNyRCxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3pCLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBRWhCLHlDQUF5QztZQUN6QyxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ25CLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDbkIsSUFBSSxHQUFHLENBQUMsQ0FBQztZQUNULElBQUksR0FBRyxhQUFhLENBQUM7WUFFckIsMkNBQTJDO1lBQzNDLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLG1CQUFtQiwrQ0FBdUMsQ0FBQyxDQUFDO1FBQ3BGLENBQUM7UUFFRCxzQkFBc0I7UUFDdEIsT0FBTyxJQUFJLENBQUMsa0JBQWtCLENBQUM7WUFDOUIsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO1lBQ3ZCLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSTtZQUNmLEtBQUs7WUFDTCxLQUFLO1lBQ0wsSUFBSTtZQUNKLElBQUk7WUFDSixLQUFLLEVBQUUsTUFBTTtZQUNiLFFBQVEsRUFBRSxLQUFLO1lBQ2YsTUFBTSxFQUFFLEtBQUs7WUFDYixVQUFVLEVBQUUsS0FBSztTQUNqQixFQUFFLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO0lBQzdDLENBQUM7SUFFTyxLQUFLLENBQUMsaUJBQWlCO1FBRTlCLHdCQUF3QjtRQUN4QixNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxPQUFPLENBQXVDLElBQUksQ0FBQyxDQUFDO1FBRXZHLG1FQUFtRTtRQUNuRSxNQUFNLEtBQUssR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNqQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDWixJQUFJLENBQUMsS0FBSyxDQUFDLDhHQUE4RyxDQUFDLENBQUM7WUFFM0gsT0FBTyxJQUFJLENBQUMsQ0FBQyx5REFBeUQ7UUFDdkUsQ0FBQztRQUVELDRDQUE0QztRQUM1QyxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQ1osTUFBTSxJQUFJLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFdkMsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBRUQsc0RBQXNEO1FBQ3RELE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVPLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxNQUF3RTtRQUN6RyxJQUFJLENBQUMsS0FBSyxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFFcEMsc0JBQXNCO1FBQ3RCLE1BQU0sSUFBSSxDQUFDLGtCQUFrQixDQUFDO1lBQzdCLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUTtZQUN2QixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7WUFDZixLQUFLLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUU7WUFDbkQsS0FBSyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO1lBQ25ELElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN4QyxJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLGFBQWEsRUFBRSw0QkFBNEI7WUFDbEYsS0FBSyxFQUFFLE1BQU0sQ0FBQyxLQUFLO1lBQ25CLFFBQVEsRUFBRSxLQUFLO1lBQ2YsTUFBTSxFQUFFLEtBQUs7WUFDYixVQUFVLEVBQUUsS0FBSztTQUNqQixFQUFFLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1FBRTVDLHVDQUF1QztRQUN2QyxJQUFJLE1BQU0sQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLENBQUM7WUFDM0IsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN4QixDQUFDO0lBQ0YsQ0FBQztJQUVPLEtBQUssQ0FBQyxlQUFlLENBQUMsT0FBOEM7UUFDM0UsSUFBSSxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBRWhDLE1BQU0saUJBQWlCLEdBQUcsT0FBTyxFQUFFLGlCQUFpQixDQUFDO1FBRXJELGlCQUFpQjtRQUNqQixJQUFJLElBQXdCLENBQUM7UUFDN0IsSUFBSSxpQkFBaUIsRUFBRSxDQUFDO1lBQ3ZCLElBQUksR0FBRyxhQUFhLENBQUMsQ0FBQywrQ0FBK0M7UUFDdEUsQ0FBQzthQUFNLElBQUksSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDdEMsSUFBSSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyw0Q0FBNEM7UUFDcEYsQ0FBQztRQUVELG1FQUFtRTtRQUNuRSxnRUFBZ0U7UUFDaEUsWUFBWTtRQUNaLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQztRQUV4QyxrQkFBa0I7UUFDbEIsSUFBSSxDQUFDO1lBQ0osTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFO2dCQUNwRSxJQUFJO2dCQUNKLE1BQU0sRUFBRSxPQUFPLEVBQUUsTUFBTTthQUN2QixDQUFDLENBQUM7WUFFSCxxREFBcUQ7WUFDckQsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUV4Qix1REFBdUQ7WUFDdkQsMkNBQTJDO1lBQzNDLElBQUksZ0JBQWdCLEtBQUssSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUN6QyxJQUFJLENBQUMsS0FBSyxDQUFDLHdGQUF3RixDQUFDLENBQUM7Z0JBRXJHLE9BQU87WUFDUixDQUFDO1lBRUQsTUFBTSxJQUFJLENBQUMsa0JBQWtCLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDO1FBQ3BGLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2hCLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQztZQUV6QywyQ0FBMkM7WUFDM0MsSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLCtDQUF1QyxDQUFDLENBQUM7WUFFaEUsK0RBQStEO1lBQy9ELGdFQUFnRTtZQUNoRSwyREFBMkQ7WUFDM0QsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLElBQUksTUFBTSx3REFBZ0QsRUFBRSxDQUFDO2dCQUNqRixJQUFJLEtBQUssWUFBWSxrQ0FBa0MsRUFBRSxDQUFDO29CQUN6RCxJQUFJLENBQUMsMEJBQTBCLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUM3QyxDQUFDO2dCQUVELE9BQU87WUFDUixDQUFDO1lBRUQsNkVBQTZFO1lBQzdFLCtFQUErRTtZQUMvRSxpRkFBaUY7WUFDakYsMEVBQTBFO1lBQzFFLElBQUksSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLE1BQU0sK0NBQXVDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO2dCQUM5RixPQUFPO1lBQ1IsQ0FBQztZQUVELGdDQUFnQztZQUNoQyxNQUFNLEtBQUssQ0FBQztRQUNiLENBQUM7SUFDRixDQUFDO0lBRU8sS0FBSyxDQUFDLGtCQUFrQixDQUFDLE9BQTJCLEVBQUUsS0FBYztRQUMzRSxJQUFJLENBQUMsS0FBSyxDQUFDLDhCQUE4QixDQUFDLENBQUM7UUFFM0Msa0NBQWtDO1FBQ2xDLElBQUksSUFBSSxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUM7WUFDdkIsSUFBSSxDQUFDLEtBQUssQ0FBQyxnRUFBZ0UsQ0FBQyxDQUFDO1lBRTdFLE9BQU87UUFDUixDQUFDO1FBRUQsZ0NBQWdDO1FBQ2hDLElBQUksQ0FBQywwQkFBMEIsQ0FBQztZQUMvQixRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7WUFDdkIsSUFBSSxFQUFFLE9BQU8sQ0FBQyxJQUFJO1lBQ2xCLEtBQUssRUFBRSxPQUFPLENBQUMsS0FBSztZQUNwQixLQUFLLEVBQUUsT0FBTyxDQUFDLEtBQUs7WUFDcEIsSUFBSSxFQUFFLE9BQU8sQ0FBQyxJQUFJO1lBQ2xCLElBQUksRUFBRSxPQUFPLENBQUMsSUFBSTtZQUNsQixRQUFRLEVBQUUsT0FBTyxDQUFDLFFBQVE7WUFDMUIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxNQUFNO1lBQ3RCLFVBQVUsRUFBRSxLQUFLO1lBQ2pCLE1BQU0sRUFBRSxJQUFJO1lBQ1osV0FBVyxFQUFFLEtBQUs7WUFDbEIsY0FBYyxFQUFFLEtBQUs7WUFDckIsUUFBUSxFQUFFLFNBQVM7U0FDbkIsQ0FBQyxDQUFDO1FBRUgsZ0RBQWdEO1FBQ2hELElBQUksSUFBSSxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUM7WUFDdkIsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN6QyxDQUFDO1FBRUQsNkJBQTZCO2FBQ3hCLENBQUM7WUFDTCxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3pDLENBQUM7UUFFRCxpRUFBaUU7UUFDakUsaUVBQWlFO1FBQ2pFLGlFQUFpRTtRQUNqRSxpRUFBaUU7UUFDakUsZUFBZTtRQUNmLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRXZCLGdCQUFnQjtRQUNoQixJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxDQUFDO0lBQzNCLENBQUM7SUFFTyxLQUFLLENBQUMsYUFBYSxDQUFDLFFBQWdDO1FBQzNELElBQUksQ0FBQyxLQUFLLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUU5QixtREFBbUQ7UUFDbkQsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxRQUFRLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUVuSCxrQkFBa0I7UUFDbEIsSUFBSSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBSU8sS0FBSyxDQUFDLGFBQWEsQ0FBQyxRQUFnQztRQUMzRCxJQUFJLENBQUMsS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFFOUIsc0ZBQXNGO1FBQ3RGLElBQUksQ0FBQywrQkFBK0IsR0FBRyxJQUFJLENBQUM7UUFDNUMsSUFBSSxDQUFDO1lBQ0osTUFBTSxJQUFJLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxRQUFRLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDNUQsQ0FBQztnQkFBUyxDQUFDO1lBQ1YsSUFBSSxDQUFDLCtCQUErQixHQUFHLEtBQUssQ0FBQztRQUM5QyxDQUFDO0lBQ0YsQ0FBQztJQUVPLHFCQUFxQixDQUFDLEtBQVE7UUFFckMsdURBQXVEO1FBQ3ZELHFGQUFxRjtRQUNyRiwyRUFBMkU7UUFFM0UsaUJBQWlCO1FBQ2pCLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsU0FBUyxJQUFJLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFN0csWUFBWTtRQUNaLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzNELENBQUM7SUFFTyxxQkFBcUIsQ0FBQyxLQUFRLEVBQUUsa0JBQTJCO1FBQ2xFLElBQUksQ0FBQyxLQUFLLENBQUMsaUNBQWlDLENBQUMsQ0FBQztRQUU5QyxxR0FBcUc7UUFDckcsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxLQUFLLENBQUMsMkNBQTJDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBRXhFLDBFQUEwRTtRQUMxRSxnRUFBZ0U7UUFDaEUsb0RBQW9EO1FBQ3BELElBQUksa0JBQWtCLEVBQUUsQ0FBQztZQUN4QixJQUFJLENBQUMsNkJBQTZCLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ2pELENBQUM7UUFFRCw0RUFBNEU7UUFDNUUsbUVBQW1FO1FBQ25FLHlGQUF5RjtRQUN6RixJQUFJLENBQUMsSUFBSSxDQUFDLCtCQUErQixJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUM7WUFFakUseUZBQXlGO1lBQ3pGLHNGQUFzRjtZQUN0RixJQUFJLEtBQUssQ0FBQyxTQUFTLEtBQUssSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO2dCQUM3QyxJQUFJLENBQUMsS0FBSyxDQUFDLDRFQUE0RSxDQUFDLENBQUM7Z0JBRXpGLGNBQWM7Z0JBQ2QsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztnQkFDNUIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFFckIscUNBQXFDO2dCQUNyQyxJQUFJLFFBQVEsRUFBRSxDQUFDO29CQUNkLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQzFCLENBQUM7WUFDRixDQUFDO1lBRUQseUVBQXlFO2lCQUNwRSxDQUFDO2dCQUNMLElBQUksQ0FBQyxLQUFLLENBQUMscUVBQXFFLENBQUMsQ0FBQztnQkFFbEYsZ0JBQWdCO2dCQUNoQixJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3JCLENBQUM7UUFDRixDQUFDO1FBRUQsZ0JBQWdCO1FBQ2hCLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNqQyxDQUFDO0lBRU8sS0FBSyxDQUFDLG9CQUFvQjtRQUNqQyxJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDO1lBQ3ZCLE9BQU8sQ0FBQyxnREFBZ0Q7UUFDekQsQ0FBQztRQUVELHFDQUFxQztRQUNyQywwQ0FBMEM7UUFDMUMsNkNBQTZDO1FBQzdDLDhDQUE4QztRQUM5QyxrQ0FBa0M7UUFFbEMsTUFBTSxJQUFJLENBQUMsZ0JBQWdCLENBQUM7WUFDM0IsaUJBQWlCLEVBQUUsSUFBSTtTQUN2QixDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsWUFBWTtJQUVaLGdCQUFnQjtJQUVoQixJQUFJLFdBQVc7UUFDZCxPQUFPLElBQUksQ0FBQyxLQUFLLEVBQUUsYUFBYSxFQUFFLFdBQVcsQ0FBQztJQUMvQyxDQUFDO0lBRUQsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUF3QjtRQUVwQyxzQ0FBc0M7UUFDdEMsSUFBSSxJQUFJLEdBQXFELFNBQVMsQ0FBQztRQUN2RSxJQUFJLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1lBQy9CLElBQUksR0FBRztnQkFDTixLQUFLLEVBQUUsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEtBQUs7Z0JBQ3RDLEtBQUssRUFBRSxJQUFJLENBQUMsb0JBQW9CLENBQUMsS0FBSztnQkFDdEMsSUFBSSxFQUFFLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJO2dCQUNwQyxJQUFJLEVBQUUsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUk7Z0JBQ3BDLFFBQVEsRUFBRSxJQUFJLENBQUMsVUFBVSxFQUFFO2FBQzNCLENBQUM7UUFDSCxDQUFDO1FBRUQscUNBQXFDO1FBQ3JDLElBQUksT0FBTyxHQUF1QyxTQUFTLENBQUM7UUFDNUQsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQztZQUN2QixPQUFPLEdBQUcsTUFBTSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsaUNBQXlCLEtBQUssQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzdGLENBQUM7UUFFRCxPQUFPLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxDQUFDO0lBQzFCLENBQUM7YUFRdUIsNkRBQXdELEdBQUcsR0FBRyxBQUFOLENBQU87SUFPdkYsS0FBSyxDQUFDLElBQUksQ0FBQyxVQUErQyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztRQUM1RSxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUM7WUFDeEIsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBRUQsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQztZQUN2QixJQUFJLENBQUMsS0FBSyxDQUFDLGlEQUFpRCxDQUFDLENBQUM7WUFFOUQsT0FBTyxLQUFLLENBQUMsQ0FBQywrREFBK0Q7UUFDOUUsQ0FBQztRQUVELElBQ0MsQ0FBQyxJQUFJLENBQUMsUUFBUSw2Q0FBcUMsSUFBSSxJQUFJLENBQUMsUUFBUSwwQ0FBa0MsQ0FBQztZQUN2RyxDQUFDLE9BQU8sQ0FBQyxNQUFNLDRCQUFvQixJQUFJLE9BQU8sQ0FBQyxNQUFNLG9DQUE0QixJQUFJLE9BQU8sQ0FBQyxNQUFNLHFDQUE2QixDQUFDLEVBQ2hJLENBQUM7WUFDRixJQUFJLENBQUMsS0FBSyxDQUFDLHdGQUF3RixDQUFDLENBQUM7WUFFckcsT0FBTyxLQUFLLENBQUMsQ0FBQywyRkFBMkY7UUFDMUcsQ0FBQztRQUVELG1CQUFtQjtRQUNuQixJQUFJLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDN0IsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzNCLElBQUksQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLENBQUM7UUFFNUIsT0FBTyxJQUFJLENBQUMsUUFBUSwwQ0FBa0MsQ0FBQztJQUN4RCxDQUFDO0lBRU8sS0FBSyxDQUFDLE1BQU0sQ0FBQyxPQUE0QztRQUNoRSxJQUFJLE9BQU8sT0FBTyxDQUFDLE1BQU0sS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUN4QyxPQUFPLENBQUMsTUFBTSw4QkFBc0IsQ0FBQztRQUN0QyxDQUFDO1FBRUQsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQztRQUNqQyxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsU0FBUyw0QkFBNEIsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUV2RSx3RUFBd0U7UUFDeEUsRUFBRTtRQUNGLHFFQUFxRTtRQUNyRSxJQUFJLElBQUksQ0FBQyw4QkFBOEIsRUFBRSxDQUFDO1lBQ3pDLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxTQUFTLGlFQUFpRSxDQUFDLENBQUM7WUFFakcsT0FBTztRQUNSLENBQUM7UUFFRCxvRUFBb0U7UUFDcEUsRUFBRTtRQUNGLHNGQUFzRjtRQUN0Rix3REFBd0Q7UUFDeEQsRUFBRTtRQUNGLElBQUksSUFBSSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1lBQ2xELElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxTQUFTLGlEQUFpRCxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBRTVGLE9BQU8sSUFBSSxDQUFDLGtCQUFrQixDQUFDLE9BQU8sQ0FBQztRQUN4QyxDQUFDO1FBRUQsNENBQTRDO1FBQzVDLEVBQUU7UUFDRiwrRUFBK0U7UUFDL0UsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDbkMsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLFNBQVMsNkVBQTZFLElBQUksQ0FBQyxLQUFLLHFCQUFxQixJQUFJLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQztZQUU3SixPQUFPO1FBQ1IsQ0FBQztRQUVELCtGQUErRjtRQUMvRiw4R0FBOEc7UUFDOUcsRUFBRTtRQUNGLDBIQUEwSDtRQUMxSCx3QkFBd0I7UUFDeEIsOEhBQThIO1FBQzlILHlEQUF5RDtRQUN6RCxFQUFFO1FBQ0YsSUFBSSxJQUFJLENBQUMsa0JBQWtCLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQztZQUN6QyxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsU0FBUyxnQ0FBZ0MsQ0FBQyxDQUFDO1lBRWhFLHNEQUFzRDtZQUN0RCxvREFBb0Q7WUFDcEQsbUNBQW1DO1lBQ25DLGlEQUFpRDtZQUNqRCw4Q0FBOEM7WUFDOUMscURBQXFEO1lBQ3JELGdDQUFnQztZQUNoQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsYUFBYSxFQUFFLENBQUM7WUFFeEMsNkNBQTZDO1lBQzdDLE9BQU8sSUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDbEUsQ0FBQztRQUVELDhFQUE4RTtRQUM5RSxvQ0FBb0M7UUFDcEMsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQztZQUN2QixJQUFJLENBQUMsS0FBSyxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFDL0IsQ0FBQztRQUVELE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSx1QkFBdUIsRUFBRSxDQUFDO1FBRXZELE9BQU8sSUFBSSxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUM7WUFDeEMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQztZQUM5RCxRQUFRLGtDQUF5QjtZQUNqQyxXQUFXLEVBQUUsSUFBSTtZQUNqQixLQUFLLEVBQUUsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUk7U0FDbkMsRUFBRSxRQUFRLENBQUMsRUFBRTtZQUNiLE9BQU8sSUFBSSxDQUFDLGdCQUFnQixDQUFDLFNBQVMsRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLGdCQUFnQixDQUFDLENBQUM7UUFDOUUsQ0FBQyxFQUFFLEdBQUcsRUFBRTtZQUNQLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQzNCLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUU7WUFDZixnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUM1QixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFTyxnQkFBZ0IsQ0FBQyxTQUFpQixFQUFFLE9BQTRDLEVBQUUsUUFBa0MsRUFBRSxnQkFBeUM7UUFDdEssT0FBTyxJQUFJLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxDQUFDLEtBQUssSUFBSSxFQUFFO1lBRXpELDJEQUEyRDtZQUMzRCxnRUFBZ0U7WUFDaEUsaURBQWlEO1lBQ2pELG1FQUFtRTtZQUNuRSxtQ0FBbUM7WUFDbkMscURBQXFEO1lBQ3JELElBQUksSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLG9CQUFvQixJQUFJLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO2dCQUMzRyxJQUFJLENBQUM7b0JBRUosbUZBQW1GO29CQUNuRixrRkFBa0Y7b0JBQ2xGLGdGQUFnRjtvQkFDaEYsRUFBRTtvQkFDRixrQ0FBa0M7b0JBQ2xDLHFFQUFxRTtvQkFDckUsZ0ZBQWdGO29CQUNoRix5REFBeUQ7b0JBQ3pELHFDQUFxQztvQkFDckMsNEZBQTRGO29CQUM1Riw2REFBNkQ7b0JBQzdELEVBQUU7b0JBQ0YsaUVBQWlFO29CQUNqRSxJQUFJLE9BQU8sQ0FBQyxNQUFNLDRCQUFvQixJQUFJLE9BQU8sSUFBSSxDQUFDLDZCQUE2QixLQUFLLFFBQVEsRUFBRSxDQUFDO3dCQUNsRyxNQUFNLHNCQUFzQixHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUMsNkJBQTZCLENBQUM7d0JBQy9FLElBQUksc0JBQXNCLEdBQUcsdUJBQXFCLENBQUMsd0RBQXdELEVBQUUsQ0FBQzs0QkFDN0csTUFBTSxPQUFPLENBQUMsdUJBQXFCLENBQUMsd0RBQXdELEdBQUcsc0JBQXNCLENBQUMsQ0FBQzt3QkFDeEgsQ0FBQztvQkFDRixDQUFDO29CQUVELDREQUE0RDtvQkFDNUQsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO3dCQUNyRCxJQUFJLENBQUMsOEJBQThCLEdBQUcsSUFBSSxDQUFDO3dCQUMzQyxJQUFJLENBQUM7NEJBQ0osTUFBTSxJQUFJLENBQUMsc0JBQXNCLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxNQUFNLCtCQUF1QixFQUFFLFNBQVMsRUFBRSxPQUFPLENBQUMsSUFBSSxFQUFFLEVBQUUsUUFBUSxFQUFFLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxDQUFDO3dCQUMzSyxDQUFDO3dCQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7NEJBQ2QsSUFBSSxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO2dDQUNqRiw2Q0FBNkM7Z0NBQzdDLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxDQUFDOzRCQUMzQixDQUFDO3dCQUNGLENBQUM7Z0NBQVMsQ0FBQzs0QkFDVixJQUFJLENBQUMsOEJBQThCLEdBQUcsS0FBSyxDQUFDO3dCQUM3QyxDQUFDO29CQUNGLENBQUM7Z0JBQ0YsQ0FBQztnQkFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO29CQUNoQixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxrREFBa0QsU0FBUyw2QkFBNkIsS0FBSyxDQUFDLFFBQVEsRUFBRSxFQUFFLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQzFLLENBQUM7WUFDRixDQUFDO1lBRUQsMkRBQTJEO1lBQzNELDZEQUE2RDtZQUM3RCxJQUFJLGdCQUFnQixDQUFDLEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO2dCQUNwRCxPQUFPO1lBQ1IsQ0FBQztZQUVELGlHQUFpRztZQUNqRyxrR0FBa0c7WUFDbEcsb0dBQW9HO1lBQ3BHLGdHQUFnRztZQUNoRyxpR0FBaUc7WUFDakcsa0ZBQWtGO1lBQ2xGLElBQUksSUFBSSxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUM7Z0JBQ3ZCLE9BQU87WUFDUixDQUFDO1lBRUQsbUdBQW1HO1lBQ25HLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQztnQkFDeEIsT0FBTztZQUNSLENBQUM7WUFFRCxxRUFBcUU7WUFDckUsU0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUM7WUFFM0IscURBQXFEO1lBQ3JELElBQUksQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDO1lBRXpCLHFFQUFxRTtZQUNyRSxpRUFBaUU7WUFDakUseUJBQXlCO1lBQ3pCLFFBQVEsQ0FBQyxNQUFNLENBQUMsRUFBRSxPQUFPLEVBQUUsUUFBUSxDQUFDLGNBQWMsRUFBRSxzQkFBc0IsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUMvRSxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsU0FBUyxvQkFBb0IsQ0FBQyxDQUFDO1lBQ3BELE1BQU0sb0JBQW9CLEdBQUcsb0JBQW9CLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUM7WUFDN0UsTUFBTSx1QkFBdUIsR0FBRyxJQUFJLENBQUM7WUFDckMsT0FBTyxJQUFJLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxDQUFDLEtBQUssSUFBSSxFQUFFO2dCQUN6RCxJQUFJLENBQUM7b0JBQ0osTUFBTSxnQkFBZ0IsR0FBc0I7d0JBQzNDLEtBQUssRUFBRSxvQkFBb0IsQ0FBQyxLQUFLO3dCQUNqQyxJQUFJLEVBQUUsQ0FBQyxPQUFPLENBQUMsbUJBQW1CLElBQUksQ0FBQyxJQUFJLENBQUMseUJBQXlCLENBQUMsb0JBQW9CLENBQUMsb0JBQW9CLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJO3dCQUN0SyxNQUFNLEVBQUUsT0FBTyxDQUFDLFdBQVc7cUJBQzNCLENBQUM7b0JBRUYsSUFBSSxJQUEyQixDQUFDO29CQUVoQyxvREFBb0Q7b0JBQ3BELElBQUksT0FBTyx1QkFBdUIsQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFLLFVBQVUsRUFBRSxDQUFDO3dCQUM5RCxJQUFJLENBQUM7NEJBQ0osSUFBSSxHQUFHLE1BQU0sdUJBQXVCLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsQ0FBQzt3QkFDM0YsQ0FBQzt3QkFBQyxPQUFPLEtBQUssRUFBRSxDQUFDOzRCQUNoQixJQUFJLGdCQUFnQixDQUFDLEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO2dDQUNwRCxPQUFPLFNBQVMsQ0FBQyxDQUFDLHFCQUFxQjs0QkFDeEMsQ0FBQzs0QkFFRCxNQUFNLEtBQUssQ0FBQzt3QkFDYixDQUFDO29CQUNGLENBQUM7b0JBRUQsMERBQTBEO3lCQUNyRCxDQUFDO3dCQUVMLHVDQUF1Qzt3QkFDdkMsTUFBTSxRQUFRLEdBQUcsTUFBTSxnQkFBZ0IsQ0FBQyx1QkFBdUIsQ0FBQyxLQUFLLENBQUMsUUFBUSwrQkFBdUIsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLEVBQUUsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLENBQUM7d0JBRXRKLDJEQUEyRDt3QkFDM0QsNERBQTREO3dCQUM1RCwwREFBMEQ7d0JBQzFELHdEQUF3RDt3QkFDeEQsMERBQTBEO3dCQUMxRCw0QkFBNEI7d0JBQzVCLElBQUksZ0JBQWdCLENBQUMsS0FBSyxDQUFDLHVCQUF1QixFQUFFLENBQUM7NEJBQ3BELE9BQU87d0JBQ1IsQ0FBQzs2QkFBTSxDQUFDOzRCQUNQLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxDQUFDO3dCQUM1QixDQUFDO3dCQUVELHFCQUFxQjt3QkFDckIsSUFBSSxPQUFPLEVBQUUsYUFBYSxJQUFJLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxXQUFXLENBQUMsb0JBQW9CLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQzs0QkFDbkcsSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLG1CQUFtQixDQUFDLGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLFFBQVEsRUFBRSxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO3dCQUMxSSxDQUFDOzZCQUFNLENBQUM7NEJBQ1AsSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsb0JBQW9CLENBQUMsUUFBUSxFQUFFLG9CQUFvQixDQUFDLFFBQVEsQ0FBQyxFQUFFLGdCQUFnQixDQUFDLENBQUM7d0JBQzFILENBQUM7b0JBQ0YsQ0FBQztvQkFFRCxJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDbEQsQ0FBQztnQkFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO29CQUNoQixJQUFJLENBQUMsZUFBZSxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUM7Z0JBQ2pELENBQUM7WUFDRixDQUFDLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDeEMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQ3hDLENBQUM7SUFFTyxpQkFBaUIsQ0FBQyxJQUEyQixFQUFFLFNBQWlCLEVBQUUsT0FBNEM7UUFFckgsMENBQTBDO1FBQzFDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUV0QywrREFBK0Q7UUFDL0QsSUFBSSxTQUFTLEtBQUssSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2xDLElBQUksQ0FBQyxLQUFLLENBQUMscUJBQXFCLFNBQVMsNkRBQTZELENBQUMsQ0FBQztZQUN4RyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3RCLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsU0FBUyx1RUFBdUUsQ0FBQyxDQUFDO1FBQ25ILENBQUM7UUFFRCxnREFBZ0Q7UUFDaEQsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUV4QixrQkFBa0I7UUFDbEIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQ2hGLENBQUM7SUFFTyxlQUFlLENBQUMsS0FBWSxFQUFFLFNBQWlCLEVBQUUsT0FBNEM7UUFDcEcsQ0FBQyxPQUFPLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUMsOENBQThDLFNBQVMsd0NBQXdDLEtBQUssQ0FBQyxRQUFRLEVBQUUsRUFBRSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFFaFEscURBQXFEO1FBQ3JELGdDQUFnQztRQUNoQyxJQUFJLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQ2hDLE1BQU0sS0FBSyxDQUFDO1FBQ2IsQ0FBQztRQUVELGtGQUFrRjtRQUNsRiw0RUFBNEU7UUFDNUUsK0VBQStFO1FBQy9FLGtEQUFrRDtRQUNsRCxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRXBCLHNCQUFzQjtRQUN0QixJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQztRQUV4QiwrQkFBK0I7UUFDL0IsSUFBSyxLQUE0QixDQUFDLG1CQUFtQixvREFBNEMsRUFBRSxDQUFDO1lBQ25HLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDO1FBQzVCLENBQUM7UUFFRCx1Q0FBdUM7UUFDdkMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQztRQUV2QyxnQkFBZ0I7UUFDaEIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUM3QixDQUFDO0lBRU8saUJBQWlCLENBQUMsS0FBWSxFQUFFLE9BQTRDO1FBQ25GLE1BQU0sa0JBQWtCLEdBQUcsS0FBMkIsQ0FBQztRQUN2RCxNQUFNLGNBQWMsR0FBYyxFQUFFLENBQUM7UUFFckMsSUFBSSxPQUFlLENBQUM7UUFFcEIseUJBQXlCO1FBQ3pCLElBQUksa0JBQWtCLENBQUMsbUJBQW1CLG9EQUE0QyxFQUFFLENBQUM7WUFDeEYsT0FBTyxHQUFHLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSw4R0FBOEcsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFaEssY0FBYyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLEVBQUUsMkJBQTJCLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxXQUFXLEVBQUUsV0FBVyxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxHQUFHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxJQUFJLEVBQUUsTUFBTSw2QkFBcUIsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDNU0sY0FBYyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLEVBQUUsd0JBQXdCLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNoSSxDQUFDO1FBRUQsdUJBQXVCO2FBQ2xCLENBQUM7WUFDTCxNQUFNLGFBQWEsR0FBRyxrQkFBa0IsQ0FBQyxtQkFBbUIsa0RBQTBDLENBQUM7WUFDdkcsTUFBTSxhQUFhLEdBQUcsYUFBYSxJQUFLLGtCQUFrQixDQUFDLE9BQXlDLEVBQUUsTUFBTSxDQUFDO1lBQzdHLE1BQU0sa0JBQWtCLEdBQUcsa0JBQWtCLENBQUMsbUJBQW1CLHVEQUErQyxDQUFDO1lBQ2pILE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRTVFLHFCQUFxQjtZQUNyQixJQUFJLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQy9CLGNBQWMsQ0FBQyxJQUFJLENBQUMsR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDdkMsQ0FBQztZQUVELGdCQUFnQjtZQUNoQixJQUFJLGVBQWUsSUFBSSxDQUFDLGtCQUFrQixJQUFJLGFBQWEsQ0FBQyxFQUFFLENBQUM7Z0JBQzlELGNBQWMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDO29CQUM1QixFQUFFLEVBQUUsOEJBQThCO29CQUNsQyxLQUFLLEVBQUUsYUFBYSxDQUFDLENBQUM7d0JBQ3JCLFNBQVMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLG1CQUFtQixFQUFFLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7d0JBQ2hJLFNBQVMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLGNBQWMsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsa0JBQWtCLEVBQUUsa0JBQWtCLENBQUM7b0JBQzdHLEdBQUcsRUFBRSxHQUFHLEVBQUU7d0JBQ1QsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsT0FBTyxFQUFFLGFBQWEsRUFBRSxJQUFJLEVBQUUsV0FBVyxFQUFFLGFBQWEsRUFBRSxNQUFNLDZCQUFxQixFQUFFLENBQUMsQ0FBQztvQkFDekcsQ0FBQztpQkFDRCxDQUFDLENBQUMsQ0FBQztZQUNMLENBQUM7WUFFRCxTQUFTO2lCQUNKLElBQUksYUFBYSxFQUFFLENBQUM7Z0JBQ3hCLGNBQWMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxFQUFFLHdCQUF3QixFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxPQUFPLEVBQUUsV0FBVyxFQUFFLElBQUksRUFBRSxNQUFNLDZCQUFxQixFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNsTSxDQUFDO1lBRUQsUUFBUTtpQkFDSCxDQUFDO2dCQUNMLGNBQWMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxFQUFFLHVCQUF1QixFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxPQUFPLEVBQUUsTUFBTSw2QkFBcUIsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDdEssQ0FBQztZQUVELFVBQVU7WUFDVixjQUFjLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQztnQkFDNUIsRUFBRSxFQUFFLHdCQUF3QjtnQkFDNUIsS0FBSyxFQUFFLFFBQVEsQ0FBQyxRQUFRLEVBQUUsWUFBWSxDQUFDO2dCQUN2QyxHQUFHLEVBQUUsS0FBSyxJQUFJLEVBQUU7b0JBQ2YsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLHdCQUF3QixDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDOUQsSUFBSSxNQUFNLEVBQUUsQ0FBQzt3QkFDWixNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsTUFBTSw2QkFBcUIsRUFBRSxDQUFDLENBQUM7d0JBQ3BHLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7NEJBQ3JCLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQyw4Q0FBOEM7d0JBQ3ZGLENBQUM7b0JBQ0YsQ0FBQztnQkFDRixDQUFDO2FBQ0QsQ0FBQyxDQUFDLENBQUM7WUFFSixTQUFTO1lBQ1QsY0FBYyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLEVBQUUsd0JBQXdCLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUUvSCxVQUFVO1lBQ1YsSUFBSSxhQUFhLEVBQUUsQ0FBQztnQkFDbkIsSUFBSSxhQUFhLElBQUksZUFBZSxFQUFFLENBQUM7b0JBQ3RDLE9BQU8sR0FBRyxTQUFTLENBQUMsQ0FBQzt3QkFDcEIsUUFBUSxDQUFDLHdCQUF3QixFQUFFLGlHQUFpRyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO3dCQUNsSixRQUFRLENBQUMsdUJBQXVCLEVBQUUsNEZBQTRGLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUM3SSxDQUFDO3FCQUFNLENBQUM7b0JBQ1AsT0FBTyxHQUFHLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSw4RkFBOEYsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3BKLENBQUM7WUFDRixDQUFDO2lCQUFNLElBQUksZUFBZSxJQUFJLGtCQUFrQixFQUFFLENBQUM7Z0JBQ2xELE9BQU8sR0FBRyxTQUFTLENBQUMsQ0FBQztvQkFDcEIsUUFBUSxDQUFDLDJCQUEyQixFQUFFLG9HQUFvRyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUN4SixRQUFRLENBQUMsK0JBQStCLEVBQUUsK0ZBQStGLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3hKLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxPQUFPLEdBQUcsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLGtCQUFrQixFQUFFLE9BQU8sRUFBRSxDQUFDLG1FQUFtRSxDQUFDLEVBQUUsRUFBRSwyQkFBMkIsRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUN2TSxDQUFDO1FBQ0YsQ0FBQztRQUVELG1DQUFtQztRQUNuQyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxFQUFFLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLENBQUMsRUFBRSxFQUFFLFFBQVEsRUFBRSxRQUFRLENBQUMsS0FBSyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRXJLLGtEQUFrRDtRQUNsRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDL0csSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ3pFLENBQUM7SUFFTywwQkFBMEIsQ0FBQyxXQUFrQztRQUNwRSxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7UUFFdEMsNEJBQTRCO1FBQzVCLElBQUksQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztZQUNoQyxJQUFJLENBQUMsb0JBQW9CLEdBQUcsV0FBVyxDQUFDO1FBQ3pDLENBQUM7UUFFRCxxRUFBcUU7UUFDckUsNEJBQTRCO1FBQzVCLHFFQUFxRTtRQUNyRSxxRUFBcUU7UUFDckUsUUFBUTthQUNILElBQUksSUFBSSxDQUFDLG9CQUFvQixDQUFDLEtBQUssSUFBSSxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDL0QsSUFBSSxDQUFDLG9CQUFvQixHQUFHLFdBQVcsQ0FBQztRQUN6QyxDQUFDO1FBRUQsK0RBQStEO2FBQzFELENBQUM7WUFDTCxJQUFJLENBQUMsb0JBQW9CLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxRQUFRLEVBQUUsV0FBVyxDQUFDLFFBQVEsRUFBRSxNQUFNLEVBQUUsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQzFILENBQUM7UUFFRCx5Q0FBeUM7UUFDekMsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLEtBQUssV0FBVyxFQUFFLENBQUM7WUFDdkMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2xDLENBQUM7SUFDRixDQUFDO0lBRUQsWUFBWTtJQUVaLGdCQUFnQjtJQUVoQixLQUFLLENBQUMsTUFBTSxDQUFDLE9BQXdCO1FBQ3BDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLElBQUksQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUM1RCxPQUFPLENBQUMsdURBQXVEO1FBQ2hFLENBQUM7UUFFRCxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRXZCLGNBQWM7UUFDZCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDO1FBQzVCLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFNUMsNkNBQTZDO1FBQzdDLE1BQU0sUUFBUSxHQUFHLE9BQU8sRUFBRSxJQUFJLENBQUM7UUFDL0IsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2YsSUFBSSxDQUFDO2dCQUNKLE1BQU0sSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDbkMsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBRWhCLGtFQUFrRTtnQkFDbEUsSUFBSyxLQUE0QixDQUFDLG1CQUFtQiwrQ0FBdUMsRUFBRSxDQUFDO29CQUU5Rix5RUFBeUU7b0JBQ3pFLFlBQVksRUFBRSxDQUFDO29CQUVmLE1BQU0sS0FBSyxDQUFDO2dCQUNiLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELHlCQUF5QjtRQUN6QixJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxDQUFDO1FBRXpCLDBCQUEwQjtRQUMxQixJQUFJLFFBQVEsRUFBRSxDQUFDO1lBQ2QsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxDQUFDO1FBQy9CLENBQUM7SUFDRixDQUFDO0lBU0QsUUFBUSxDQUFDLEtBQWlDO1FBQ3pDLFFBQVEsS0FBSyxFQUFFLENBQUM7WUFDZjtnQkFDQyxPQUFPLElBQUksQ0FBQyxjQUFjLENBQUM7WUFDNUI7Z0JBQ0MsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDO1lBQ25CO2dCQUNDLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQztZQUN6QjtnQkFDQyxPQUFPLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUMxQjtnQkFDQyxPQUFPLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUM1QztnQkFDQyxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztRQUNyQixDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQyxTQUFTLENBQUMsS0FBOEM7UUFDN0QsT0FBTyxJQUFJLENBQUMsa0JBQWtCLENBQUMsT0FBTyxDQUFDO0lBQ3hDLENBQUM7SUFFRCxZQUFZO0lBRVosbUJBQW1CO0lBRW5CLFVBQVU7UUFDVCxPQUFPLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQztJQUM1RixDQUFDO0lBRU8sS0FBSyxDQUFDLEdBQVc7UUFDeEIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsOEJBQThCLEdBQUcsRUFBRSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ25HLENBQUM7SUFFRCxZQUFZO0lBRVosaUJBQWlCO0lBRVIsT0FBTztRQUNmLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUM7UUFFeEIsUUFBUTtRQUNSLElBQUksQ0FBQyxjQUFjLEdBQUcsS0FBSyxDQUFDO1FBQzVCLElBQUksQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDO1FBRXpCLHVCQUF1QjtRQUN2QixJQUFJLENBQUMsTUFBTSxHQUFHLFNBQVMsQ0FBQztRQUV4QixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDakIsQ0FBQzs7QUFyaENXLHFCQUFxQjtJQXNDL0IsV0FBQSxZQUFZLENBQUE7SUFDWixXQUFBLFdBQVcsQ0FBQTtJQUNYLFdBQUEsdUJBQXVCLENBQUE7SUFDdkIsV0FBQSwwQkFBMEIsQ0FBQTtJQUMxQixXQUFBLHlCQUF5QixDQUFBO0lBQ3pCLFlBQUEsbUJBQW1CLENBQUE7SUFDbkIsWUFBQSxvQkFBb0IsQ0FBQTtJQUNwQixZQUFBLHlCQUF5QixDQUFBO0lBQ3pCLFlBQUEsY0FBYyxDQUFBO0lBQ2QsWUFBQSxvQkFBb0IsQ0FBQTtJQUNwQixZQUFBLGdCQUFnQixDQUFBO0dBaEROLHFCQUFxQixDQXdoQ2pDIn0=