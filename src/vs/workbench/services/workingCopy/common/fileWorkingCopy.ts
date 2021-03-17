/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { ETAG_DISABLED, FileChangesEvent, FileChangeType, FileOperationError, FileOperationResult, FileSystemProviderCapabilities, IFileService, IFileStatWithMetadata, IFileStreamContent } from 'vs/platform/files/common/files';
import { ISaveOptions, IRevertOptions, SaveReason } from 'vs/workbench/common/editor';
import { IWorkingCopy, IWorkingCopyBackup, WorkingCopyCapabilities } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { TaskSequentializer, timeout } from 'vs/base/common/async';
import { ILogService } from 'vs/platform/log/common/log';
import { DefaultEndOfLine, ITextBufferFactory, ITextSnapshot } from 'vs/editor/common/model';
import { assertIsDefined } from 'vs/base/common/types';
import { ITextFileEditorModel, ITextFileService, snapshotToString } from 'vs/workbench/services/textfile/common/textfiles';
import { newWriteableBufferStream, VSBuffer, VSBufferReadableStream } from 'vs/base/common/buffer';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { IBackupFileService, IResolvedBackup } from 'vs/workbench/services/backup/common/backup';
import { isWindows } from 'vs/base/common/platform';

export interface IFileWorkingCopyModelContentChangedEvent {

	/**
	 * Flag that indicates that this event was generated while undoing.
	 */
	readonly isUndoing: boolean;

	/**
	 * Flag that indicates that this event was generated while redoing.
	 */
	readonly isRedoing: boolean;
}

/**
 * The underlying model of a file working copy provides some
 * methods for the working copy to function. The model is
 * typically only available after the working copy has been
 * resolved via it's `load` method.
 */
export interface IFileWorkingCopyModel {

	/**
	 * An even that fires whenever the content of the file working
	 * copy model changes.
	 */
	readonly onDidChangeContent: Event<IFileWorkingCopyModelContentChangedEvent>;

	/**
	 * Returns a snapshot of the current content of the working copy
	 * to be used for creating a backup when the working copy is dirty.
	 *
	 * TODO this should be using `serialize` and convert internally.
	 */
	snapshot(): ITextSnapshot | undefined;

	/**
	 * Snapshots the model's current content for writing.
	 */
	snapshot2(): Promise<VSBufferReadableStream>;

	/**
	 * Updates the model with the provided contents.
	 *
	 * @param contents
	 */
	update(contents: VSBufferReadableStream): void;

	/**
	 * TODO should find a better name here
	 */
	getAlternativeVersionId(): number;

	/**
	 * Close the current undo-redo element.
	 * This offers a way to create an undo/redo stop point.
	 */
	pushStackElement(): void;
}

/**
 * A file based `IWorkingCopy` is backed by a `URI` from a
 * known file system provider. Given this assumption, a lot
 * of functionality can be built on top, such as saving in
 * a secure way to prevent data loss.
 */
export interface IFileWorkingCopy<T extends IFileWorkingCopyModel> extends IWorkingCopy {

	/**
	 * Provides access to the underlying model of this file
	 * based working copy. As long as the file working copy
	 * has not been loaded, the model is `undefined`.
	 */
	readonly model: T | undefined;
}

export interface IResolvedFileWorkingCopy<T extends IFileWorkingCopyModel> extends IFileWorkingCopy<T> {

	/**
	 * A resolved file working copy has a resolved model `T`.
	 */
	readonly model: T;
}

export interface IFileWorkingCopyDelegate<T extends IFileWorkingCopyModel> {

	/**
	 * The `URI` of the delegate must be supported by a registered
	 * file system provider.
	 */
	readonly resource: URI;

	/**
	 * Human readable name of the working copy.
	 */
	readonly name: string;

	/**
	 * Asks the file working copy delegate to create a model from the given
	 * content.
	 *
	 * @param contents the content of the model to create it
	 */
	createModel(contents: VSBufferReadableStream): T;
}

/**
 * States the file working copy can be in.
 */
export const enum FileWorkingCopyState {

	/**
	 * A file working copy is saved.
	 */
	SAVED,

	/**
	 * A file working copy is dirty.
	 */
	DIRTY,

	/**
	 * A file working copy is currently being saved but
	 * this operation has not completed yet.
	 */
	PENDING_SAVE,

	/**
	 * A file working copy is in conflict mode when changes
	 * cannot be saved because the underlying file has changed.
	 * Models in conflict mode are always dirty.
	 */
	CONFLICT,

	/**
	 * A file working copy is in orphan state when the underlying
	 * file has been deleted.
	 */
	ORPHAN,

	/**
	 * Any error that happens during a save that is not causing
	 * the `FileWorkingCopyState.CONFLICT` state.
	 * File working copies in error mode are always dirty.
	 */
	ERROR
}

/**
 * Metadata associated with a file working copy backup.
 */
interface IFileWorkingCopyBackupMetaData {
	mtime: number;
	ctime: number;
	size: number;
	etag: string;
	orphaned: boolean;
}

export interface IFileWorkingCopySaveOptions extends ISaveOptions {

	/**
	 * Save the file working copy with an attempt to unlock it.
	 */
	writeUnlock?: boolean;

	/**
	 * Save the file working copy with elevated privileges.
	 *
	 * Note: This may not be supported in all environments.
	 */
	writeElevated?: boolean;

	/**
	 * Allows to write to a file working copy even if it has been
	 * modified on disk. This should only be triggered from an
	 * explicit user action.
	 */
	ignoreModifiedSince?: boolean;

	/**
	 * If set, will bubble up the file working copy save error to
	 * the caller instead of handling it.
	 */
	ignoreErrorHandler?: boolean;
}

export interface IFileWorkingCopyLoadOptions {

	/**
	 * The contents to use for the file working copy if known. If not
	 * provided, the contents will be retrieved from the underlying
	 * resource or backup if present.
	 */
	contents?: VSBufferReadableStream;

	/**
	 * Go to disk bypassing any cache of the file working copy if any.
	 */
	forceReadFromDisk?: boolean;
}

export class FileWorkingCopy<T extends IFileWorkingCopyModel> extends Disposable implements IFileWorkingCopy<T>  {

	readonly capabilities: WorkingCopyCapabilities = WorkingCopyCapabilities.None;

	get resource() { return this.delegate.resource; }
	get name() { return this.delegate.name; }

	private _model: T | undefined = undefined;
	get model(): T | undefined { return this._model; }

	//#region events

	private readonly _onDidChangeContent = this._register(new Emitter<void>());
	readonly onDidChangeContent = this._onDidChangeContent.event;

	private readonly _onDidLoad = this._register(new Emitter<void>());
	readonly onDidLoad = this._onDidLoad.event;

	private readonly _onDidChangeDirty = this._register(new Emitter<void>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	private readonly _onDidSaveError = this._register(new Emitter<void>());
	readonly onDidSaveError = this._onDidSaveError.event;

	private readonly _onDidSave = this._register(new Emitter<SaveReason>());
	readonly onDidSave = this._onDidSave.event;

	private readonly _onDidRevert = this._register(new Emitter<void>());
	readonly onDidRevert = this._onDidRevert.event;

	private readonly _onDidChangeOrphaned = this._register(new Emitter<void>());
	readonly onDidChangeOrphaned = this._onDidChangeOrphaned.event;

	//#endregion

	constructor(
		private readonly delegate: IFileWorkingCopyDelegate<T>,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@IBackupFileService private readonly backupFileService: IBackupFileService
	) {
		super();

		if (!fileService.canHandleResource(delegate.resource)) {
			throw new Error(`The file working copy resource ${delegate.resource.toString(true)} does not have an associated file system provider.`);
		}

		this.registerListeners();
	}

	//#region Orphaned Tracking

	private inOrphanMode = false;

	private registerListeners(): void {
		this._register(this.fileService.onDidFilesChange(e => this.onDidFilesChange(e)));
	}

	private async onDidFilesChange(e: FileChangesEvent): Promise<void> {
		let fileEventImpactsUs = false;
		let newInOrphanModeGuess: boolean | undefined;

		// If we are currently orphaned, we check if the file was added back
		if (this.inOrphanMode) {
			const modelFileAdded = e.contains(this.resource, FileChangeType.ADDED);
			if (modelFileAdded) {
				newInOrphanModeGuess = false;
				fileEventImpactsUs = true;
			}
		}

		// Otherwise we check if the file was deleted
		else {
			const modelFileDeleted = e.contains(this.resource, FileChangeType.DELETED);
			if (modelFileDeleted) {
				newInOrphanModeGuess = true;
				fileEventImpactsUs = true;
			}
		}

		if (fileEventImpactsUs && this.inOrphanMode !== newInOrphanModeGuess) {
			let newInOrphanModeValidated: boolean = false;
			if (newInOrphanModeGuess) {
				// We have received reports of users seeing delete events even though the file still
				// exists (network shares issue: https://github.com/microsoft/vscode/issues/13665).
				// Since we do not want to mark the working copy as orphaned, we have to check if the
				// file is really gone and not just a faulty file event.
				await timeout(100);

				if (this.isDisposed()) {
					newInOrphanModeValidated = true;
				} else {
					const exists = await this.fileService.exists(this.resource);
					newInOrphanModeValidated = !exists;
				}
			}

			if (this.inOrphanMode !== newInOrphanModeValidated && !this.isDisposed()) {
				this.setOrphaned(newInOrphanModeValidated);
			}
		}
	}

	private setOrphaned(orphaned: boolean): void {
		if (this.inOrphanMode !== orphaned) {
			this.inOrphanMode = orphaned;
			this._onDidChangeOrphaned.fire();
		}
	}

	//#endregion

	//#region Dirty

	private dirty = false;
	private bufferSavedVersionId: number | undefined;

	setDirty(dirty: boolean): void {
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

	private doSetDirty(dirty: boolean): () => void {
		const wasDirty = this.dirty;
		const wasInConflictMode = this.inConflictMode;
		const wasInErrorMode = this.inErrorMode;
		const oldBufferSavedVersionId = this.bufferSavedVersionId;

		if (!dirty) {
			this.dirty = false;
			this.inConflictMode = false;
			this.inErrorMode = false;
			this.updateSavedVersionId();
		} else {
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

	isDirty(): this is IResolvedFileWorkingCopy<T> {
		return this.dirty;
	}

	//#endregion

	//#region Load

	private lastResolvedFileStat: IFileStatWithMetadata | undefined;

	async load(options?: IFileWorkingCopyLoadOptions): Promise<IFileWorkingCopy<T>> {
		this.logService.trace('[file working copy] load() - enter', this.resource.toString(true));

		// Return early if we are disposed
		if (this.isDisposed()) {
			this.logService.trace('[file working copy] load() - exit - without loading because file working copy is disposed', this.resource.toString(true));

			return this;
		}

		// Unless there are explicit contents provided, it is important that we do not
		// load a model that is dirty or is in the process of saving to prevent data
		// loss.
		if (!options?.contents && (this.dirty || this.saveSequentializer.hasPending())) {
			this.logService.trace('[file working copy] load() - exit - without loading because model is dirty or being saved', this.resource.toString(true));

			return this;
		}

		return this.doLoad(options);
	}

	private async doLoad(options?: IFileWorkingCopyLoadOptions): Promise<IFileWorkingCopy<T>> {

		// First check if we have contents to use for the file working copy
		if (options?.contents) {
			return this.loadFromBuffer(options.contents, options);
		}

		// Second, check if we have a backup to load from (only for new file working copies)
		const isNewModel = !this.isResolved();
		if (isNewModel) {
			const loadedFromBackup = await this.loadFromBackup(options);
			if (loadedFromBackup) {
				return loadedFromBackup;
			}
		}

		// Finally, load from file resource
		return this.loadFromFile(options);
	}

	private async loadFromBuffer(buffer: VSBufferReadableStream, options?: IFileWorkingCopyLoadOptions): Promise<IFileWorkingCopy<T>> {
		this.logService.trace('[file working copy] loadFromBuffer()', this.resource.toString(true));

		// Try to resolve metdata from disk
		let mtime: number;
		let ctime: number;
		let size: number;
		let etag: string;
		try {
			const metadata = await this.fileService.resolve(this.resource, { resolveMetadata: true });
			mtime = metadata.mtime;
			ctime = metadata.ctime;
			size = metadata.size;
			etag = metadata.etag;

			// Clear orphaned state when resolving was successful
			this.setOrphaned(false);
		} catch (error) {

			// Put some fallback values in error case
			mtime = Date.now();
			ctime = Date.now();
			size = 0;
			etag = ETAG_DISABLED;

			// Apply orphaned state based on error code
			this.setOrphaned(error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND);
		}

		// Load with buffer
		this.loadFromContent({
			resource: this.resource,
			name: this.name,
			mtime,
			ctime,
			size,
			etag,
			value: buffer
		}, true /* dirty (loaded from buffer) */, options);

		return this;
	}

	private async loadFromBackup(options?: IFileWorkingCopyLoadOptions): Promise<IFileWorkingCopy<T> | undefined> {

		// Resolve backup if any
		const backup = await this.backupFileService.resolve<IFileWorkingCopyBackupMetaData>(this.resource);

		// Abort if someone else managed to resolve the model by now
		let isNewModel = !this.isResolved();
		if (!isNewModel) {
			this.logService.trace('[file working copy] loadFromBackup() - exit - without loading because previously new model got created meanwhile', this.resource.toString(true));

			return this; // imply that loading has happened in another operation
		}

		// Try to load from backup if we have any
		if (backup) {
			return this.doLoadFromBackup(backup, options);
		}

		// Otherwise signal back that loading did not happen
		return undefined;
	}

	private doLoadFromBackup(backup: IResolvedBackup<IFileWorkingCopyBackupMetaData>, options?: IFileWorkingCopyLoadOptions): IFileWorkingCopy<T> {
		this.logService.trace('[file working copy] doLoadFromBackup()', this.resource.toString(true));

		// Load with backup
		this.loadFromContent({
			resource: this.resource,
			name: this.name,
			mtime: backup.meta ? backup.meta.mtime : Date.now(),
			ctime: backup.meta ? backup.meta.ctime : Date.now(),
			size: backup.meta ? backup.meta.size : 0,
			etag: backup.meta ? backup.meta.etag : ETAG_DISABLED, // etag disabled if unknown!
			value: this.textBufferFactoryToStream(backup.value)
		}, true /* dirty (loaded from backup) */, options);

		// Restore orphaned flag based on state
		if (backup.meta && backup.meta.orphaned) {
			this.setOrphaned(true);
		}

		return this;
	}

	private async loadFromFile(options?: IFileWorkingCopyLoadOptions): Promise<IFileWorkingCopy<T>> {
		this.logService.trace('[file working copy] loadFromFile()', this.resource.toString(true));

		const forceReadFromDisk = options?.forceReadFromDisk;

		// Decide on etag
		let etag: string | undefined;
		if (forceReadFromDisk) {
			etag = ETAG_DISABLED; // disable ETag if we enforce to read from disk
		} else if (this.lastResolvedFileStat) {
			etag = this.lastResolvedFileStat.etag; // otherwise respect etag to support caching
		}

		// Remember current version before doing any long running operation
		// to ensure we are not changing a model that was changed meanwhile
		const currentVersionId = this.versionId;

		// Resolve Content
		try {
			const content = await this.fileService.readFileStream(this.resource, { etag });

			// Clear orphaned state when loading was successful
			this.setOrphaned(false);

			// Return early if the model content has changed
			// meanwhile to prevent loosing any changes
			if (currentVersionId !== this.versionId) {
				this.logService.trace('[file working copy] loadFromFile() - exit - without loading because model content changed', this.resource.toString(true));

				return this;
			}

			return this.loadFromContent(content, false /* not dirty (loaded from file) */, options);
		} catch (error) {
			const result = error.fileOperationResult;

			// Apply orphaned state based on error code
			this.setOrphaned(result === FileOperationResult.FILE_NOT_FOUND);

			// NotModified status is expected and can be handled gracefully
			if (result === FileOperationResult.FILE_NOT_MODIFIED_SINCE) {
				return this;
			}

			// Ignore when a model has been resolved once and the file was deleted meanwhile. Since
			// we already have the model loaded, we can return to this state and update the orphaned
			// flag to indicate that this model has no version on disk anymore.
			if (this.isResolved() && result === FileOperationResult.FILE_NOT_FOUND) {
				return this;
			}

			// Otherwise bubble up the error
			throw error;
		}
	}

	private loadFromContent(content: IFileStreamContent, dirty: boolean, options?: IFileWorkingCopyLoadOptions): IFileWorkingCopy<T> {
		this.logService.trace('[file working copy] loadFromContent() - enter', this.resource.toString(true));

		// Return early if we are disposed
		if (this.isDisposed()) {
			this.logService.trace('[file working copy] loadFromContent() - exit - because model is disposed', this.resource.toString(true));

			return this;
		}

		// Update our resolved disk stat model
		this.updateLastResolvedFileStat({
			resource: this.resource,
			name: content.name,
			mtime: content.mtime,
			ctime: content.ctime,
			size: content.size,
			etag: content.etag,
			isFile: true,
			isDirectory: false,
			isSymbolicLink: false
		});

		// Update Existing Model
		if (this.isResolved()) {
			this.doUpdateModel(content.value);
		}

		// Create New Model
		else {
			this.doCreateModel(content.value);
		}

		// Update model dirty flag. This is very important to call
		// in both cases of dirty or not because it conditionally
		// updates the `bufferSavedVersionId` to determine the
		// version when to consider the model as saved again (e.g.
		// when undoing back to the saved state)
		this.setDirty(!!dirty);

		// Emit as event
		this._onDidLoad.fire();

		return this;
	}

	private doCreateModel(contents: VSBufferReadableStream): void {
		this.logService.trace('[file working copy] doCreateModel()', this.resource.toString(true));

		// Create model
		this._model = this.delegate.createModel(contents);

		// Model Listeners
		this.installModelListeners(this._model);
	}

	private ignoreDirtyOnModelContentChange = false;

	private doUpdateModel(contents: VSBufferReadableStream): void {
		this.logService.trace('[file working copy] doUpdateModel()', this.resource.toString(true));

		// Update model value in a block that ignores content change events for dirty tracking
		this.ignoreDirtyOnModelContentChange = true;
		try {
			this.model?.update(contents);
		} finally {
			this.ignoreDirtyOnModelContentChange = false;
		}
	}

	private installModelListeners(model: IFileWorkingCopyModel): void {

		// See https://github.com/microsoft/vscode/issues/30189
		// This code has been extracted to a different method because it caused a memory leak
		// where `value` was captured in the content change listener closure scope.

		// Content Change
		this._register(model.onDidChangeContent(e => this.onModelContentChanged(model, e.isUndoing || e.isRedoing)));
	}

	private onModelContentChanged(model: IFileWorkingCopyModel, isUndoingOrRedoing: boolean): void {
		this.logService.trace(`[file working copy] onModelContentChanged() - enter`, this.resource.toString(true));

		// In any case increment the version id because it tracks the textual content state of the model at all times
		this.versionId++;
		this.logService.trace(`[file working copy] onModelContentChanged() - new versionId ${this.versionId}`, this.resource.toString(true));

		// Remember when the user changed the model through a undo/redo operation.
		// We need this information to throttle save participants to fix
		// https://github.com/microsoft/vscode/issues/102542
		if (isUndoingOrRedoing) {
			this.lastModelContentChangeFromUndoRedo = Date.now();
		}

		// We mark check for a dirty-state change upon model content change, unless:
		// - explicitly instructed to ignore it (e.g. from model.load())
		// - the model is readonly (in that case we never assume the change was done by the user)
		if (!this.ignoreDirtyOnModelContentChange && !this.isReadonly()) {

			// The contents changed as a matter of Undo and the version reached matches the saved one
			// In this case we clear the dirty flag and emit a SAVED event to indicate this state.
			if (model.getAlternativeVersionId() === this.bufferSavedVersionId) {
				this.logService.trace('[file working copy] onModelContentChanged() - model content changed back to last saved version', this.resource.toString(true));

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
				this.logService.trace('[file working copy] onModelContentChanged() - model content changed and marked as dirty', this.resource.toString(true));

				// Mark as dirty
				this.setDirty(true);
			}
		}

		// Emit as event
		this._onDidChangeContent.fire();
	}

	//#endregion

	//#region Backup

	async backup(token: CancellationToken): Promise<IWorkingCopyBackup> {

		// Fill in metadata if we are resolved
		let meta: IFileWorkingCopyBackupMetaData | undefined = undefined;
		if (this.lastResolvedFileStat) {
			meta = {
				mtime: this.lastResolvedFileStat.mtime,
				ctime: this.lastResolvedFileStat.ctime,
				size: this.lastResolvedFileStat.size,
				etag: this.lastResolvedFileStat.etag,
				orphaned: this.inOrphanMode
			};
		}

		return { meta, content: this.model?.snapshot() };
	}

	//#endregion

	//#region Save

	private versionId = 0;

	private static readonly UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD = 500;
	private lastModelContentChangeFromUndoRedo: number | undefined = undefined;

	private readonly saveSequentializer = new TaskSequentializer();

	async save(options: IFileWorkingCopySaveOptions = Object.create(null)): Promise<boolean> {
		if (!this.isResolved()) {
			return false;
		}

		if (this.isReadonly()) {
			this.logService.trace('[file working copy] save() - ignoring request for readonly resource', this.resource.toString(true));

			return false; // if file working copy is readonly we do not attempt to save at all
		}

		if (
			(this.hasState(FileWorkingCopyState.CONFLICT) || this.hasState(FileWorkingCopyState.ERROR)) &&
			(options.reason === SaveReason.AUTO || options.reason === SaveReason.FOCUS_CHANGE || options.reason === SaveReason.WINDOW_CHANGE)
		) {
			this.logService.trace('[file working copy] save() - ignoring auto save request for file working copy that is in conflict or error', this.resource.toString(true));

			return false; // if file working copy is in save conflict or error, do not save unless save reason is explicit
		}

		// Actually do save
		this.logService.trace('[file working copy] save() - enter', this.resource.toString(true));
		await this.doSave(options);
		this.logService.trace('[file working copy] save() - exit', this.resource.toString(true));

		return true;
	}

	private async doSave(options: IFileWorkingCopySaveOptions): Promise<void> {
		if (typeof options.reason !== 'number') {
			options.reason = SaveReason.EXPLICIT;
		}

		let versionId = this.versionId;
		this.logService.trace(`[file working copy] doSave(${versionId}) - enter with versionId ${versionId}`, this.resource.toString(true));

		// Lookup any running pending save for this versionId and return it if found
		//
		// Scenario: user invoked the save action multiple times quickly for the same contents
		//           while the save was not yet finished to disk
		//
		if (this.saveSequentializer.hasPending(versionId)) {
			this.logService.trace(`[file working copy] doSave(${versionId}) - exit - found a pending save for versionId ${versionId}`, this.resource.toString(true));

			return this.saveSequentializer.pending;
		}

		// Return early if not dirty (unless forced)
		//
		// Scenario: user invoked save action even though the file working copy is not dirty
		if (!options.force && !this.dirty) {
			this.logService.trace(`[file working copy] doSave(${versionId}) - exit - because not dirty and/or versionId is different (this.isDirty: ${this.dirty}, this.versionId: ${this.versionId})`, this.resource.toString(true));

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
		if (this.saveSequentializer.hasPending()) {
			this.logService.trace(`[file working copy] doSave(${versionId}) - exit - because busy saving`, this.resource.toString(true));

			// Indicate to the save sequentializer that we want to
			// cancel the pending operation so that ours can run
			// before the pending one finishes.
			// Currently this will try to cancel pending save
			// participants but never a pending save.
			this.saveSequentializer.cancelPending();

			// Register this as the next upcoming save and return
			return this.saveSequentializer.setNext(() => this.doSave(options));
		}

		// Push all edit operations to the undo stack so that the user has a chance to
		// Ctrl+Z back to the saved version.
		if (this.isResolved()) {
			this.model.pushStackElement();
		}

		const saveCancellation = new CancellationTokenSource();

		return this.saveSequentializer.setPending(versionId, (async () => {

			// A save participant can still change the file working copy now
			// and since we are so close to saving we do not want to trigger
			// another auto save or similar, so we block this
			// In addition we update our version right after in case it changed
			// because of a file working copy change
			// Save participants can also be skipped through API.
			if (this.isResolved() && !options.skipSaveParticipants && this.isTextFileModel(this.model)) {
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
					if (options.reason === SaveReason.AUTO && typeof this.lastModelContentChangeFromUndoRedo === 'number') {
						const timeFromUndoRedoToSave = Date.now() - this.lastModelContentChangeFromUndoRedo;
						if (timeFromUndoRedoToSave < FileWorkingCopy.UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD) {
							await timeout(FileWorkingCopy.UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD - timeFromUndoRedoToSave);
						}
					}

					// Run save participants unless save was cancelled meanwhile
					if (!saveCancellation.token.isCancellationRequested) {
						await this.textFileService.files.runSaveParticipants(this.model, { reason: options.reason ?? SaveReason.EXPLICIT }, saveCancellation.token);
					}
				} catch (error) {
					this.logService.error(`[file working copy] runSaveParticipants(${versionId}) - resulted in an error: ${error.toString()}`, this.resource.toString(true));
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
			} else {
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

			// We require a resolved file working copy from this point on, since we are about to write data to disk.
			if (!this.isResolved()) {
				return;
			}

			// update versionId with its new value (if pre-save changes happened)
			versionId = this.versionId;

			// Clear error flag since we are trying to save again
			this.inErrorMode = false;

			// Save to Disk. We mark the save operation as currently pending with
			// the latest versionId because it might have changed from a save
			// participant triggering
			this.logService.trace(`[file working copy] doSave(${versionId}) - before write()`, this.resource.toString(true));
			const lastResolvedFileStat = assertIsDefined(this.lastResolvedFileStat);
			const resolvedFileWorkingCopy = this;
			return this.saveSequentializer.setPending(versionId, (async () => {
				try {
					const stat = await this.fileService.writeFile(lastResolvedFileStat.resource, await resolvedFileWorkingCopy.model.snapshot2(), {
						mtime: lastResolvedFileStat.mtime,
						etag: (options.ignoreModifiedSince || !this.filesConfigurationService.preventSaveConflicts(lastResolvedFileStat.resource)) ? ETAG_DISABLED : lastResolvedFileStat.etag,
						unlock: options.writeUnlock
					});

					this.handleSaveSuccess(stat, versionId, options);
				} catch (error) {
					this.handleSaveError(error, versionId, options);
				}
			})());
		})(), () => saveCancellation.cancel());
	}

	private handleSaveSuccess(stat: IFileStatWithMetadata, versionId: number, options: IFileWorkingCopySaveOptions): void {

		// Updated resolved stat with updated stat
		this.updateLastResolvedFileStat(stat);

		// Update dirty state unless file working copy has changed meanwhile
		if (versionId === this.versionId) {
			this.logService.trace(`[file working copy] handleSaveSuccess(${versionId}) - setting dirty to false because versionId did not change`, this.resource.toString(true));
			this.setDirty(false);
		} else {
			this.logService.trace(`[file working copy] handleSaveSuccess(${versionId}) - not setting dirty to false because versionId did change meanwhile`, this.resource.toString(true));
		}

		// Update orphan state given save was successful
		this.setOrphaned(false);

		// Emit Save Event
		this._onDidSave.fire(options.reason ?? SaveReason.EXPLICIT);
	}

	private handleSaveError(error: Error, versionId: number, options: IFileWorkingCopySaveOptions): void {
		this.logService.error(`[file working copy] handleSaveError(${versionId}) - exit - resulted in a save error: ${error.toString()}`, this.resource.toString(true));

		// Return early if the save() call was made asking to
		// handle the save error itself.
		if (options.ignoreErrorHandler) {
			throw error;
		}

		// In any case of an error, we mark the file working copy as dirty to prevent data loss
		// It could be possible that the write corrupted the file on disk (e.g. when
		// an error happened after truncating the file) and as such we want to preserve
		// the file working copy contents to prevent data loss.
		this.setDirty(true);

		// Flag as error state in the file working copy
		this.inErrorMode = true;

		// Look out for a save conflict
		if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE) {
			this.inConflictMode = true;
		}

		// Delegate to save error handler
		let throwError = true;
		if (this.isTextFileModel(this.model)) {
			this.textFileService.files.saveErrorHandler.onSaveError(error, this.model);
			throwError = false;
		}

		// Emit as event
		this._onDidSaveError.fire();

		if (throwError) {
			throw error;
		}
	}

	private updateSavedVersionId(): void {

		// we remember the models alternate version id to remember when the version
		// of the model matches with the saved version on disk. we need to keep this
		// in order to find out if the model changed back to a saved version (e.g.
		// when undoing long enough to reach to a version that is saved and then to
		// clear the dirty flag)
		if (this.isResolved()) {
			this.bufferSavedVersionId = this.model.getAlternativeVersionId();
		}
	}

	private updateLastResolvedFileStat(newFileStat: IFileStatWithMetadata): void {

		// First resolve - just take
		if (!this.lastResolvedFileStat) {
			this.lastResolvedFileStat = newFileStat;
		}

		// Subsequent resolve - make sure that we only assign it if the mtime
		// is equal or has advanced.
		// This prevents race conditions from loading and saving. If a save
		// comes in late after a revert was called, the mtime could be out of
		// sync.
		else if (this.lastResolvedFileStat.mtime <= newFileStat.mtime) {
			this.lastResolvedFileStat = newFileStat;
		}
	}

	//#endregion

	//#region Revert

	async revert(options?: IRevertOptions): Promise<void> {
		if (!this.isResolved()) {
			return;
		}

		// Unset flags
		const wasDirty = this.dirty;
		const undoSetDirty = this.doSetDirty(false);

		// Force read from disk unless reverting soft
		const softUndo = options?.soft;
		if (!softUndo) {
			try {
				await this.load({ forceReadFromDisk: true });
			} catch (error) {

				// FileNotFound means the file got deleted meanwhile, so ignore it
				if ((error as FileOperationError).fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {

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

	//#endregion

	//#region State

	private inConflictMode = false;
	private inErrorMode = false;

	hasState(state: FileWorkingCopyState): boolean {
		switch (state) {
			case FileWorkingCopyState.CONFLICT:
				return this.inConflictMode;
			case FileWorkingCopyState.DIRTY:
				return this.dirty;
			case FileWorkingCopyState.ERROR:
				return this.inErrorMode;
			case FileWorkingCopyState.ORPHAN:
				return this.inOrphanMode;
			case FileWorkingCopyState.PENDING_SAVE:
				return this.saveSequentializer.hasPending();
			case FileWorkingCopyState.SAVED:
				return !this.dirty;
		}
	}

	joinState(state: FileWorkingCopyState.PENDING_SAVE): Promise<void> {
		return this.saveSequentializer.pending ?? Promise.resolve();
	}

	//#endregion

	//#region Utilities

	isResolved(): this is IResolvedFileWorkingCopy<T> {
		return !!this.model;
	}

	isReadonly(): boolean {
		return this.fileService.hasCapability(this.resource, FileSystemProviderCapabilities.Readonly);
	}

	getStat(): IFileStatWithMetadata | undefined {
		return this.lastResolvedFileStat;
	}

	//#endregion

	//#region Dispose

	private disposed = false;

	private isDisposed(): boolean {
		return this.disposed;
	}

	dispose(): void {
		this.logService.trace('[file working copy] dispose()', this.resource.toString(true));

		this.disposed = true;
		this.inConflictMode = false;
		this.inOrphanMode = false;
		this.inErrorMode = false;

		super.dispose();
	}

	//#endregion

	//#region Remainders of text file model world (TODO@bpasero callers have to be handled in a generic way)

	private isTextFileModel(model: unknown): model is ITextFileEditorModel {
		const textFileModel = this.textFileService.files.get(this.resource);

		return !!(textFileModel && this.model && (textFileModel as unknown) === (this.model as unknown));
	}

	private textBufferFactoryToStream(factory: ITextBufferFactory): VSBufferReadableStream {
		const stream = newWriteableBufferStream();

		const contents = snapshotToString(factory.create(isWindows ? DefaultEndOfLine.CRLF : DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
		stream.end(VSBuffer.fromString(contents));

		return stream;
	}

	//#endregion
}
