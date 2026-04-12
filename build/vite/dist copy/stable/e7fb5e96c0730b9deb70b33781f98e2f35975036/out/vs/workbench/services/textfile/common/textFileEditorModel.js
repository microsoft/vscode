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
var TextFileEditorModel_1;
import { localize } from '../../../../nls.js';
import { Emitter } from '../../../../base/common/event.js';
import { mark } from '../../../../base/common/performance.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { ITextFileService } from './textfiles.js';
import { SaveSourceRegistry } from '../../../common/editor.js';
import { BaseTextEditorModel } from '../../../common/editor/textEditorModel.js';
import { IWorkingCopyBackupService } from '../../workingCopy/common/workingCopyBackup.js';
import { IFileService, ETAG_DISABLED, NotModifiedSinceFileOperationError } from '../../../../platform/files/common/files.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { timeout, TaskSequentializer } from '../../../../base/common/async.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { basename } from '../../../../base/common/path.js';
import { IWorkingCopyService } from '../../workingCopy/common/workingCopyService.js';
import { NO_TYPE_ID } from '../../workingCopy/common/workingCopy.js';
import { IFilesConfigurationService } from '../../filesConfiguration/common/filesConfigurationService.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { UTF16be, UTF16le, UTF8, UTF8_with_bom } from './encoding.js';
import { createTextBufferFactoryFromStream } from '../../../../editor/common/model/textModel.js';
import { ILanguageDetectionService } from '../../languageDetection/common/languageDetectionWorkerService.js';
import { IPathService } from '../../path/common/pathService.js';
import { extUri } from '../../../../base/common/resources.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../editor/common/languages/modesRegistry.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { EditSources } from '../../../../editor/common/textModelEditSource.js';
/**
 * The text file editor model listens to changes to its underlying code editor model and saves these changes through the file service back to the disk.
 */
let TextFileEditorModel = class TextFileEditorModel extends BaseTextEditorModel {
    static { TextFileEditorModel_1 = this; }
    static { this.TEXTFILE_SAVE_ENCODING_SOURCE = SaveSourceRegistry.registerSource('textFileEncoding.source', localize('textFileCreate.source', "File Encoding Changed")); }
    static { this.UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD = 500; }
    constructor(resource, preferredEncoding, // encoding as chosen by the user
    preferredLanguageId, languageService, modelService, fileService, textFileService, workingCopyBackupService, logService, workingCopyService, filesConfigurationService, labelService, languageDetectionService, accessibilityService, pathService, extensionService, progressService) {
        super(modelService, languageService, languageDetectionService, accessibilityService);
        this.resource = resource;
        this.preferredEncoding = preferredEncoding;
        this.preferredLanguageId = preferredLanguageId;
        this.fileService = fileService;
        this.textFileService = textFileService;
        this.workingCopyBackupService = workingCopyBackupService;
        this.logService = logService;
        this.workingCopyService = workingCopyService;
        this.filesConfigurationService = filesConfigurationService;
        this.labelService = labelService;
        this.pathService = pathService;
        this.extensionService = extensionService;
        this.progressService = progressService;
        //#region Events
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
        this._onDidChangeEncoding = this._register(new Emitter());
        this.onDidChangeEncoding = this._onDidChangeEncoding.event;
        this._onDidChangeOrphaned = this._register(new Emitter());
        this.onDidChangeOrphaned = this._onDidChangeOrphaned.event;
        this._onDidChangeReadonly = this._register(new Emitter());
        this.onDidChangeReadonly = this._onDidChangeReadonly.event;
        //#endregion
        this.typeId = NO_TYPE_ID; // IMPORTANT: never change this to not break existing assumptions (e.g. backups)
        this.capabilities = 0 /* WorkingCopyCapabilities.None */;
        this.versionId = 0;
        this.ignoreDirtyOnModelContentChange = false;
        this.ignoreSaveFromSaveParticipants = false;
        this.lastModelContentChangeFromUndoRedo = undefined;
        this.saveSequentializer = new TaskSequentializer();
        this.dirty = false;
        this.inConflictMode = false;
        this.inOrphanMode = false;
        this.inErrorMode = false;
        this.hasEncodingSetExplicitly = false;
        this.name = basename(this.labelService.getUriLabel(this.resource));
        this.resourceHasExtension = !!extUri.extname(this.resource);
        // Make known to working copy service
        this._register(this.workingCopyService.registerWorkingCopy(this));
        this.registerListeners();
    }
    registerListeners() {
        this._register(this.fileService.onDidFilesChange(e => this.onDidFilesChange(e)));
        this._register(this.filesConfigurationService.onDidChangeFilesAssociation(() => this.onDidChangeFilesAssociation()));
        this._register(this.filesConfigurationService.onDidChangeReadonly(() => this._onDidChangeReadonly.fire()));
    }
    async onDidFilesChange(e) {
        let fileEventImpactsModel = false;
        let newInOrphanModeGuess;
        // If we are currently orphaned, we check if the model file was added back
        if (this.inOrphanMode) {
            const modelFileAdded = e.contains(this.resource, 1 /* FileChangeType.ADDED */);
            if (modelFileAdded) {
                newInOrphanModeGuess = false;
                fileEventImpactsModel = true;
            }
        }
        // Otherwise we check if the model file was deleted
        else {
            const modelFileDeleted = e.contains(this.resource, 2 /* FileChangeType.DELETED */);
            if (modelFileDeleted) {
                newInOrphanModeGuess = true;
                fileEventImpactsModel = true;
            }
        }
        if (fileEventImpactsModel && this.inOrphanMode !== newInOrphanModeGuess) {
            let newInOrphanModeValidated = false;
            if (newInOrphanModeGuess) {
                // We have received reports of users seeing delete events even though the file still
                // exists (network shares issue: https://github.com/microsoft/vscode/issues/13665).
                // Since we do not want to mark the model as orphaned, we have to check if the
                // file is really gone and not just a faulty file event.
                await timeout(100, CancellationToken.None);
                if (this.isDisposed()) {
                    newInOrphanModeValidated = true;
                }
                else {
                    const exists = await this.fileService.exists(this.resource);
                    newInOrphanModeValidated = !exists;
                }
            }
            if (this.inOrphanMode !== newInOrphanModeValidated && !this.isDisposed()) {
                this.setOrphaned(newInOrphanModeValidated);
            }
        }
    }
    setOrphaned(orphaned) {
        if (this.inOrphanMode !== orphaned) {
            this.inOrphanMode = orphaned;
            this._onDidChangeOrphaned.fire();
        }
    }
    onDidChangeFilesAssociation() {
        if (!this.isResolved()) {
            return;
        }
        const firstLineText = this.getFirstLineText(this.textEditorModel);
        const languageSelection = this.getOrCreateLanguage(this.resource, this.languageService, this.preferredLanguageId, firstLineText);
        this.textEditorModel.setLanguage(languageSelection);
    }
    setLanguageId(languageId, source) {
        super.setLanguageId(languageId, source);
        this.preferredLanguageId = languageId;
    }
    //#region Backup
    async backup(token) {
        // Fill in metadata if we are resolved
        let meta = undefined;
        if (this.lastResolvedFileStat) {
            meta = {
                mtime: this.lastResolvedFileStat.mtime,
                ctime: this.lastResolvedFileStat.ctime,
                size: this.lastResolvedFileStat.size,
                etag: this.lastResolvedFileStat.etag,
                orphaned: this.inOrphanMode
            };
        }
        // Fill in content the same way we would do when
        // saving the file via the text file service
        // encoding support (hardcode UTF-8)
        const content = await this.textFileService.getEncodedReadable(this.resource, this.createSnapshot() ?? undefined, { encoding: UTF8 });
        return { meta, content };
    }
    //#endregion
    //#region Revert
    async revert(options) {
        if (!this.isResolved()) {
            return;
        }
        // Unset flags
        const wasDirty = this.dirty;
        const undo = this.doSetDirty(false);
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
                    undo();
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
    //#endregion
    //#region Resolve
    async resolve(options) {
        this.trace('resolve() - enter');
        mark('code/willResolveTextFileEditorModel');
        // Return early if we are disposed
        if (this.isDisposed()) {
            this.trace('resolve() - exit - without resolving because model is disposed');
            return;
        }
        // Unless there are explicit contents provided, it is important that we do not
        // resolve a model that is dirty or is in the process of saving to prevent data
        // loss.
        if (!options?.contents && (this.dirty || this.saveSequentializer.isRunning())) {
            this.trace('resolve() - exit - without resolving because model is dirty or being saved');
            return;
        }
        // Resolve either from backup or from file
        await this.doResolve(options);
        mark('code/didResolveTextFileEditorModel');
    }
    async doResolve(options) {
        // First check if we have contents to use for the model
        if (options?.contents) {
            return this.resolveFromBuffer(options.contents, options);
        }
        // Second, check if we have a backup to resolve from (only for new models)
        const isNewModel = !this.isResolved();
        if (isNewModel) {
            const resolvedFromBackup = await this.resolveFromBackup(options);
            if (resolvedFromBackup) {
                return;
            }
        }
        // Finally, resolve from file resource
        return this.resolveFromFile(options);
    }
    async resolveFromBuffer(buffer, options) {
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
        const preferredEncoding = await this.textFileService.encoding.getPreferredWriteEncoding(this.resource, this.preferredEncoding);
        // Resolve with buffer
        this.resolveFromContent({
            resource: this.resource,
            name: this.name,
            mtime,
            ctime,
            size,
            etag,
            value: buffer,
            encoding: preferredEncoding.encoding,
            readonly: false,
            locked: false,
            executable: false
        }, true /* dirty (resolved from buffer) */, options);
    }
    async resolveFromBackup(options) {
        // Resolve backup if any
        const backup = await this.workingCopyBackupService.resolve(this);
        // Resolve preferred encoding if we need it
        let encoding = UTF8;
        if (backup) {
            encoding = (await this.textFileService.encoding.getPreferredWriteEncoding(this.resource, this.preferredEncoding)).encoding;
        }
        // Abort if someone else managed to resolve the model by now
        const isNewModel = !this.isResolved();
        if (!isNewModel) {
            this.trace('resolveFromBackup() - exit - without resolving because previously new model got created meanwhile');
            return true; // imply that resolving has happened in another operation
        }
        // Try to resolve from backup if we have any
        if (backup) {
            await this.doResolveFromBackup(backup, encoding, options);
            return true;
        }
        // Otherwise signal back that resolving did not happen
        return false;
    }
    async doResolveFromBackup(backup, encoding, options) {
        this.trace('doResolveFromBackup()');
        // Resolve with backup
        this.resolveFromContent({
            resource: this.resource,
            name: this.name,
            mtime: backup.meta ? backup.meta.mtime : Date.now(),
            ctime: backup.meta ? backup.meta.ctime : Date.now(),
            size: backup.meta ? backup.meta.size : 0,
            etag: backup.meta ? backup.meta.etag : ETAG_DISABLED, // etag disabled if unknown!
            value: await createTextBufferFactoryFromStream(await this.textFileService.getDecodedStream(this.resource, backup.value, { encoding: UTF8 })),
            encoding,
            readonly: false,
            locked: false,
            executable: false
        }, true /* dirty (resolved from backup) */, options);
        // Restore orphaned flag based on state
        if (backup.meta?.orphaned) {
            this.setOrphaned(true);
        }
    }
    async resolveFromFile(options) {
        this.trace('resolveFromFile()');
        const forceReadFromFile = options?.forceReadFromFile;
        const allowBinary = this.isResolved() /* always allow if we resolved previously */ || options?.allowBinary;
        // Decide on etag
        let etag;
        if (forceReadFromFile) {
            etag = ETAG_DISABLED; // disable ETag if we enforce to read from disk
        }
        else if (this.lastResolvedFileStat) {
            etag = this.lastResolvedFileStat.etag; // otherwise respect etag to support caching
        }
        // Remember current version before doing any long running operation
        // to ensure we are not changing a model that was changed meanwhile
        const currentVersionId = this.versionId;
        // Resolve Content
        try {
            const content = await this.textFileService.readStream(this.resource, {
                acceptTextOnly: !allowBinary,
                etag,
                encoding: this.preferredEncoding,
                limits: options?.limits
            });
            // Clear orphaned state when resolving was successful
            this.setOrphaned(false);
            // Return early if the model content has changed
            // meanwhile to prevent loosing any changes
            if (currentVersionId !== this.versionId) {
                this.trace('resolveFromFile() - exit - without resolving because model content changed');
                return;
            }
            return this.resolveFromContent(content, false /* not dirty (resolved from file) */, options);
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
            // Unless we are forced to read from the file, Ignore when a model has been resolved once
            // and the file was deleted meanwhile. Since we already have the model resolved, we can return
            // to this state and update the orphaned flag to indicate that this model has no version on
            // disk anymore.
            if (this.isResolved() && result === 1 /* FileOperationResult.FILE_NOT_FOUND */ && !forceReadFromFile) {
                return;
            }
            // Otherwise bubble up the error
            throw error;
        }
    }
    resolveFromContent(content, dirty, options) {
        this.trace('resolveFromContent() - enter');
        // Return early if we are disposed
        if (this.isDisposed()) {
            this.trace('resolveFromContent() - exit - because model is disposed');
            return;
        }
        // Update our resolved disk stat model
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
        // Keep the original encoding to not loose it when saving
        const oldEncoding = this.contentEncoding;
        this.contentEncoding = content.encoding;
        // Handle events if encoding changed
        if (this.preferredEncoding) {
            this.updatePreferredEncoding(this.contentEncoding); // make sure to reflect the real encoding of the file (never out of sync)
        }
        else if (oldEncoding !== this.contentEncoding) {
            this._onDidChangeEncoding.fire();
        }
        // Update Existing Model
        if (this.textEditorModel) {
            this.doUpdateTextModel(content.value, EditSources.reloadFromDisk());
        }
        // Create New Model
        else {
            this.doCreateTextModel(content.resource, content.value);
        }
        // Update model dirty flag. This is very important to call
        // in both cases of dirty or not because it conditionally
        // updates the `bufferSavedVersionId` to determine the
        // version when to consider the model as saved again (e.g.
        // when undoing back to the saved state)
        this.setDirty(!!dirty);
        // Emit as event
        this._onDidResolve.fire(options?.reason ?? 3 /* TextFileResolveReason.OTHER */);
    }
    doCreateTextModel(resource, value) {
        this.trace('doCreateTextModel()');
        // Create model
        const textModel = this.createTextEditorModel(value, resource, this.preferredLanguageId);
        // Model Listeners
        this.installModelListeners(textModel);
        // Detect language from content
        this.autoDetectLanguage();
    }
    doUpdateTextModel(value, reason) {
        this.trace('doUpdateTextModel()');
        // Update model value in a block that ignores content change events for dirty tracking
        this.ignoreDirtyOnModelContentChange = true;
        try {
            this.updateTextEditorModel(value, this.preferredLanguageId, reason);
        }
        finally {
            this.ignoreDirtyOnModelContentChange = false;
        }
    }
    installModelListeners(model) {
        // See https://github.com/microsoft/vscode/issues/30189
        // This code has been extracted to a different method because it caused a memory leak
        // where `value` was captured in the content change listener closure scope.
        this._register(model.onDidChangeContent(e => this.onModelContentChanged(model, e.isUndoing || e.isRedoing)));
        this._register(model.onDidChangeLanguage(() => this.onMaybeShouldChangeEncoding())); // detect possible encoding change via language specific settings
        super.installModelListeners(model);
    }
    onModelContentChanged(model, isUndoingOrRedoing) {
        this.trace(`onModelContentChanged() - enter`);
        // In any case increment the version id because it tracks the textual content state of the model at all times
        this.versionId++;
        this.trace(`onModelContentChanged() - new versionId ${this.versionId}`);
        // Remember when the user changed the model through a undo/redo operation.
        // We need this information to throttle save participants to fix
        // https://github.com/microsoft/vscode/issues/102542
        if (isUndoingOrRedoing) {
            this.lastModelContentChangeFromUndoRedo = Date.now();
        }
        // We mark check for a dirty-state change upon model content change, unless:
        // - explicitly instructed to ignore it (e.g. from model.resolve())
        // - the model is readonly (in that case we never assume the change was done by the user)
        if (!this.ignoreDirtyOnModelContentChange && !this.isReadonly()) {
            // The contents changed as a matter of Undo and the version reached matches the saved one
            // In this case we clear the dirty flag and emit a SAVED event to indicate this state.
            if (model.getAlternativeVersionId() === this.bufferSavedVersionId) {
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
        // Detect language from content
        this.autoDetectLanguage();
    }
    async autoDetectLanguage() {
        // Wait to be ready to detect language
        await this.extensionService?.whenInstalledExtensionsRegistered();
        // Only perform language detection conditionally
        const languageId = this.getLanguageId();
        if (this.resource.scheme === this.pathService.defaultUriScheme && // make sure to not detect language for non-user visible documents
            (!languageId || languageId === PLAINTEXT_LANGUAGE_ID) && // only run on files with plaintext language set or no language set at all
            !this.resourceHasExtension // only run if this particular file doesn't have an extension
        ) {
            return super.autoDetectLanguage();
        }
    }
    async forceResolveFromFile() {
        if (this.isDisposed()) {
            return; // return early when the model is invalid
        }
        // We go through the text file service to make
        // sure this kind of `resolve` is properly
        // running in sequence with any other running
        // `resolve` if any, including subsequent runs
        // that are triggered right after.
        await this.textFileService.files.resolve(this.resource, {
            reload: { async: false },
            forceReadFromFile: true
        });
    }
    //#endregion
    //#region Dirty
    isDirty() {
        return this.dirty;
    }
    isModified() {
        return this.isDirty();
    }
    setDirty(dirty) {
        if (!this.isResolved()) {
            return; // only resolved models can be marked dirty
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
        const oldBufferSavedVersionId = this.bufferSavedVersionId;
        if (!dirty) {
            this.dirty = false;
            this.inConflictMode = false;
            this.inErrorMode = false;
            this.updateSavedVersionId();
        }
        else {
            this.dirty = true;
        }
        // Return function to revert this call
        return () => {
            this.dirty = wasDirty;
            this.inConflictMode = wasInConflictMode;
            this.inErrorMode = wasInErrorMode;
            this.bufferSavedVersionId = oldBufferSavedVersionId;
        };
    }
    //#endregion
    //#region Save
    async save(options = Object.create(null)) {
        if (!this.isResolved()) {
            return false;
        }
        if (this.isReadonly()) {
            this.trace('save() - ignoring request for readonly resource');
            return false; // if model is readonly we do not attempt to save at all
        }
        if ((this.hasState(3 /* TextFileEditorModelState.CONFLICT */) || this.hasState(5 /* TextFileEditorModelState.ERROR */)) &&
            (options.reason === 2 /* SaveReason.AUTO */ || options.reason === 3 /* SaveReason.FOCUS_CHANGE */ || options.reason === 4 /* SaveReason.WINDOW_CHANGE */)) {
            this.trace('save() - ignoring auto save request for model that is in conflict or error');
            return false; // if model is in save conflict or error, do not save unless save reason is explicit
        }
        // Actually do save and log
        this.trace('save() - enter');
        await this.doSave(options);
        this.trace('save() - exit');
        return this.hasState(0 /* TextFileEditorModelState.SAVED */);
    }
    async doSave(options) {
        if (typeof options.reason !== 'number') {
            options.reason = 1 /* SaveReason.EXPLICIT */;
        }
        const versionId = this.versionId;
        this.trace(`doSave(${versionId}) - enter with versionId ${versionId}`);
        // Return early if saved from within save participant to break recursion
        //
        // Scenario: a save participant triggers a save() on the model
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
        // Scenario: user invoked save action even though the model is not dirty
        if (!options.force && !this.dirty) {
            this.trace(`doSave(${versionId}) - exit - because not dirty and/or versionId is different (this.isDirty: ${this.dirty}, this.versionId: ${this.versionId})`);
            return;
        }
        // Return if currently saving by storing this save request as the next save that should happen.
        // Never ever must 2 saves execute at the same time because this can lead to dirty writes and race conditions.
        //
        // Scenario A: auto save was triggered and is currently busy saving to disk. this takes long enough that another auto save
        //             kicks in.
        // Scenario B: save is very slow (e.g. network share) and the user manages to change the buffer and trigger another save
        //             while the first save has not returned yet.
        //
        if (this.saveSequentializer.isRunning()) {
            this.trace(`doSave(${versionId}) - exit - because busy saving`);
            // Indicate to the save sequentializer that we want to
            // cancel the running operation so that ours can run
            // before the running one finishes.
            // Currently this will try to cancel running save
            // participants but never a running save.
            this.saveSequentializer.cancelRunning();
            // Queue this as the upcoming save and return
            return this.saveSequentializer.queue(() => this.doSave(options));
        }
        // Push all edit operations to the undo stack so that the user has a chance to
        // Ctrl+Z back to the saved version.
        if (this.isResolved()) {
            this.textEditorModel.pushStackElement();
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
            // A save participant can still change the model now and since we are so close to saving
            // we do not want to trigger another auto save or similar, so we block this
            // In addition we update our version right after in case it changed because of a model change
            //
            // Save participants can also be skipped through API.
            if (this.isResolved() && !options.skipSaveParticipants) {
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
                    if (options.reason === 2 /* SaveReason.AUTO */ && typeof this.lastModelContentChangeFromUndoRedo === 'number') {
                        const timeFromUndoRedoToSave = Date.now() - this.lastModelContentChangeFromUndoRedo;
                        if (timeFromUndoRedoToSave < TextFileEditorModel_1.UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD) {
                            await timeout(TextFileEditorModel_1.UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD - timeFromUndoRedoToSave);
                        }
                    }
                    // Run save participants unless save was cancelled meanwhile
                    if (!saveCancellation.token.isCancellationRequested) {
                        this.ignoreSaveFromSaveParticipants = true;
                        try {
                            await this.textFileService.files.runSaveParticipants(this, { reason: options.reason ?? 1 /* SaveReason.EXPLICIT */, savedFrom: options.from }, progress, saveCancellation.token);
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
                    this.logService.error(`[text file model] runSaveParticipants(${versionId}) - resulted in an error: ${error.toString()}`, this.resource.toString());
                }
            }
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
            // We have to protect against being disposed at this point. It could be that the save() operation
            // was triggerd followed by a dispose() operation right after without waiting. Typically we cannot
            // be disposed if we are dirty, but if we are not dirty, save() and dispose() can still be triggered
            // one after the other without waiting for the save() to complete. If we are disposed(), we risk
            // saving contents to disk that are stale (see https://github.com/microsoft/vscode/issues/50942).
            // To fix this issue, we will not store the contents to disk when we got disposed.
            if (this.isDisposed()) {
                return;
            }
            // We require a resolved model from this point on, since we are about to write data to disk.
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
            const resolvedTextFileEditorModel = this;
            return this.saveSequentializer.run(versionId, (async () => {
                try {
                    const stat = await this.textFileService.write(lastResolvedFileStat.resource, resolvedTextFileEditorModel.createSnapshot(), {
                        mtime: lastResolvedFileStat.mtime,
                        encoding: this.getEncoding(),
                        etag: (options.ignoreModifiedSince || !this.filesConfigurationService.preventSaveConflicts(lastResolvedFileStat.resource, resolvedTextFileEditorModel.getLanguageId())) ? ETAG_DISABLED : lastResolvedFileStat.etag,
                        unlock: options.writeUnlock,
                        writeElevated: options.writeElevated
                    });
                    this.handleSaveSuccess(stat, versionId, options);
                }
                catch (error) {
                    this.handleSaveError(error, versionId, options);
                }
            })());
        })(), () => saveCancellation.cancel());
    }
    handleSaveSuccess(stat, versionId, options) {
        // Updated resolved stat with updated stat
        this.updateLastResolvedFileStat(stat);
        // Update dirty state unless model has changed meanwhile
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
        (options.ignoreErrorHandler ? this.logService.trace : this.logService.error).apply(this.logService, [`[text file model] handleSaveError(${versionId}) - exit - resulted in a save error: ${error.toString()}`, this.resource.toString()]);
        // Return early if the save() call was made asking to
        // handle the save error itself.
        if (options.ignoreErrorHandler) {
            throw error;
        }
        // In any case of an error, we mark the model as dirty to prevent data loss
        // It could be possible that the write corrupted the file on disk (e.g. when
        // an error happened after truncating the file) and as such we want to preserve
        // the model contents to prevent data loss.
        this.setDirty(true);
        // Flag as error state in the model
        this.inErrorMode = true;
        // Look out for a save conflict
        if (error.fileOperationResult === 3 /* FileOperationResult.FILE_MODIFIED_SINCE */) {
            this.inConflictMode = true;
        }
        // Show to user
        this.textFileService.files.saveErrorHandler.onSaveError(error, this, options);
        // Emit as event
        this._onDidSaveError.fire();
    }
    updateSavedVersionId() {
        // we remember the models alternate version id to remember when the version
        // of the model matches with the saved version on disk. we need to keep this
        // in order to find out if the model changed back to a saved version (e.g.
        // when undoing long enough to reach to a version that is saved and then to
        // clear the dirty flag)
        if (this.isResolved()) {
            this.bufferSavedVersionId = this.textEditorModel.getAlternativeVersionId();
        }
    }
    updateLastResolvedFileStat(newFileStat) {
        const oldReadonly = this.isReadonly();
        // First resolve - just take
        if (!this.lastResolvedFileStat) {
            this.lastResolvedFileStat = newFileStat;
        }
        // Subsequent resolve - make sure that we only assign it if the mtime is equal or has advanced.
        // This prevents race conditions from resolving and saving. If a save comes in late after a revert
        // was called, the mtime could be out of sync.
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
    hasState(state) {
        switch (state) {
            case 3 /* TextFileEditorModelState.CONFLICT */:
                return this.inConflictMode;
            case 1 /* TextFileEditorModelState.DIRTY */:
                return this.dirty;
            case 5 /* TextFileEditorModelState.ERROR */:
                return this.inErrorMode;
            case 4 /* TextFileEditorModelState.ORPHAN */:
                return this.inOrphanMode;
            case 2 /* TextFileEditorModelState.PENDING_SAVE */:
                return this.saveSequentializer.isRunning();
            case 0 /* TextFileEditorModelState.SAVED */:
                return !this.dirty;
        }
    }
    async joinState(state) {
        return this.saveSequentializer.running;
    }
    getLanguageId() {
        if (this.textEditorModel) {
            return this.textEditorModel.getLanguageId();
        }
        return this.preferredLanguageId;
    }
    //#region Encoding
    async onMaybeShouldChangeEncoding() {
        // This is a bit of a hack but there is a narrow case where
        // per-language configured encodings are not working:
        //
        // On startup we may not yet have all languages resolved so
        // we pick a wrong encoding. We never used to re-apply the
        // encoding when the language was then resolved, because that
        // is an operation that is will have to fetch the contents
        // again from disk.
        //
        // To mitigate this issue, when we detect the model language
        // changes, we see if there is a specific encoding configured
        // for the new language and apply it, only if the model is
        // not dirty and only if the encoding was not explicitly set.
        //
        // (see https://github.com/microsoft/vscode/issues/127936)
        if (this.hasEncodingSetExplicitly) {
            this.trace('onMaybeShouldChangeEncoding() - ignoring because encoding was set explicitly');
            return; // never change the user's choice of encoding
        }
        if (this.contentEncoding === UTF8_with_bom || this.contentEncoding === UTF16be || this.contentEncoding === UTF16le) {
            this.trace('onMaybeShouldChangeEncoding() - ignoring because content encoding has a BOM');
            return; // never change an encoding that we can detect 100% via BOMs
        }
        const { encoding } = await this.textFileService.encoding.getPreferredReadEncoding(this.resource);
        if (typeof encoding !== 'string' || !this.isNewEncoding(encoding)) {
            this.trace(`onMaybeShouldChangeEncoding() - ignoring because preferred encoding ${encoding} is not new`);
            return; // return early if encoding is invalid or did not change
        }
        if (this.isDirty()) {
            this.trace('onMaybeShouldChangeEncoding() - ignoring because model is dirty');
            return; // return early to prevent accident saves in this case
        }
        this.logService.info(`Adjusting encoding based on configured language override to '${encoding}' for ${this.resource.toString(true)}.`);
        // Force resolve to pick up the new encoding
        return this.forceResolveFromFile();
    }
    setEncoding(encoding, mode) {
        // Remember that an explicit encoding was set
        this.hasEncodingSetExplicitly = true;
        return this.setEncodingInternal(encoding, mode);
    }
    async setEncodingInternal(encoding, mode) {
        // Encode: Save with encoding
        if (mode === 0 /* EncodingMode.Encode */) {
            this.updatePreferredEncoding(encoding);
            // Save
            if (!this.isDirty()) {
                this.versionId++; // needs to increment because we change the model potentially
                this.setDirty(true);
            }
            if (!this.inConflictMode) {
                await this.save({ source: TextFileEditorModel_1.TEXTFILE_SAVE_ENCODING_SOURCE });
            }
        }
        // Decode: Resolve with encoding
        else {
            if (!this.isNewEncoding(encoding)) {
                return; // return early if the encoding is already the same
            }
            if (this.isDirty()) {
                throw new Error('Cannot re-open a dirty text document with different encoding. Save it first.');
            }
            this.updatePreferredEncoding(encoding);
            await this.forceResolveFromFile();
        }
    }
    updatePreferredEncoding(encoding) {
        if (!this.isNewEncoding(encoding)) {
            return;
        }
        this.preferredEncoding = encoding;
        // Emit
        this._onDidChangeEncoding.fire();
    }
    isNewEncoding(encoding) {
        if (this.preferredEncoding === encoding) {
            return false; // return early if the encoding is already the same
        }
        if (!this.preferredEncoding && this.contentEncoding === encoding) {
            return false; // also return if we don't have a preferred encoding but the content encoding is already the same
        }
        return true;
    }
    getEncoding() {
        return this.preferredEncoding || this.contentEncoding;
    }
    //#endregion
    trace(msg) {
        this.logService.trace(`[text file model] ${msg}`, this.resource.toString());
    }
    isResolved() {
        return !!this.textEditorModel;
    }
    isReadonly() {
        return this.filesConfigurationService.isReadonly(this.resource, this.lastResolvedFileStat);
    }
    dispose() {
        this.trace('dispose()');
        this.inConflictMode = false;
        this.inOrphanMode = false;
        this.inErrorMode = false;
        super.dispose();
    }
};
TextFileEditorModel = TextFileEditorModel_1 = __decorate([
    __param(3, ILanguageService),
    __param(4, IModelService),
    __param(5, IFileService),
    __param(6, ITextFileService),
    __param(7, IWorkingCopyBackupService),
    __param(8, ILogService),
    __param(9, IWorkingCopyService),
    __param(10, IFilesConfigurationService),
    __param(11, ILabelService),
    __param(12, ILanguageDetectionService),
    __param(13, IAccessibilityService),
    __param(14, IPathService),
    __param(15, IExtensionService),
    __param(16, IProgressService)
], TextFileEditorModel);
export { TextFileEditorModel };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dEZpbGVFZGl0b3JNb2RlbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dEZpbGVFZGl0b3JNb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUUzRCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDOUQsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDeEUsT0FBTyxFQUFnQixnQkFBZ0IsRUFBK00sTUFBTSxnQkFBZ0IsQ0FBQztBQUM3USxPQUFPLEVBQThCLGtCQUFrQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDM0YsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDaEYsT0FBTyxFQUFFLHlCQUF5QixFQUE4QixNQUFNLCtDQUErQyxDQUFDO0FBQ3RILE9BQU8sRUFBRSxZQUFZLEVBQW9HLGFBQWEsRUFBRSxrQ0FBa0MsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQy9OLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFL0UsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMzRCxPQUFPLEVBQUUsbUJBQW1CLEVB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