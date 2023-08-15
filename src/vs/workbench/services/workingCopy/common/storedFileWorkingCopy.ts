/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { ETAG_DISABLED, FileOperationError, FileOperationResult, IFileService, IFileStatWithMetadata, IFileStreamContent, IWriteFileOptions, NotModifiedSinceFileOperationError } from 'vs/platform/files/common/files';
import { ISaveOptions, IRevertOptions, SaveReason } from 'vs/workbench/common/editor';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { IWorkingCopyBackup, IWorkingCopyBackupMeta, IWorkingCopySaveEvent, WorkingCopyCapabilities } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { raceCancellation, TaskSequentializer, timeout } from 'vs/base/common/async';
import { ILogService } from 'vs/platform/log/common/log';
import { assertIsDefined } from 'vs/base/common/types';
import { IWorkingCopyFileService } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import { VSBufferReadableStream } from 'vs/base/common/buffer';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { IWorkingCopyBackupService, IResolvedWorkingCopyBackup } from 'vs/workbench/services/workingCopy/common/workingCopyBackup';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { hash } from 'vs/base/common/hash';
import { isErrorWithActions, toErrorMessage } from 'vs/base/common/errorMessage';
import { IAction, toAction } from 'vs/base/common/actions';
import { isWindows } from 'vs/base/common/platform';
import { IWorkingCopyEditorService } from 'vs/workbench/services/workingCopy/common/workingCopyEditorService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IElevatedFileService } from 'vs/workbench/services/files/common/elevatedFileService';
import { IResourceWorkingCopy, ResourceWorkingCopy } from 'vs/workbench/services/workingCopy/common/resourceWorkingCopy';
import { IFileWorkingCopy, IFileWorkingCopyModel, IFileWorkingCopyModelFactory } from 'vs/workbench/services/workingCopy/common/fileWorkingCopy';
import { IMarkdownString } from 'vs/base/common/htmlContent';

/**
 * Stored file specific working copy model factory.
 */
export interface IStoredFileWorkingCopyModelFactory<M extends IStoredFileWorkingCopyModel> extends IFileWorkingCopyModelFactory<M> { }

/**
 * The underlying model of a stored file working copy provides some
 * methods for the stored file working copy to function. The model is
 * typically only available after the working copy has been
 * resolved via it's `resolve()` method.
 */
export interface IStoredFileWorkingCopyModel extends IFileWorkingCopyModel {

	readonly onDidChangeContent: Event<IStoredFileWorkingCopyModelContentChangedEvent>;

	/**
	 * A version ID of the model. If a `onDidChangeContent` is fired
	 * from the model and the last known saved `versionId` matches
	 * with the `model.versionId`, the stored file working copy will
	 * discard any dirty state.
	 *
	 * A use case is the following:
	 * - a stored file working copy gets edited and thus dirty
	 * - the user triggers undo to revert the changes
	 * - at this point the `versionId` should match the one we had saved
	 *
	 * This requires the model to be aware of undo/redo operations.
	 */
	readonly versionId: unknown;

	/**
	 * Close the current undo-redo element. This offers a way
	 * to create an undo/redo stop point.
	 *
	 * This method may for example be called right before the
	 * save is triggered so that the user can always undo back
	 * to the state before saving.
	 */
	pushStackElement(): void;

	/**
	 * Optionally allows a stored file working copy model to
	 * implement the `save` method. This allows to implement
	 * a more efficient save logic compared to the default
	 * which is to ask the model for a `snapshot` and then
	 * writing that to the model's resource.
	 */
	save?(options: IWriteFileOptions, token: CancellationToken): Promise<IFileStatWithMetadata>;
}

export interface IStoredFileWorkingCopyModelContentChangedEvent {

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
 * A stored file based `IWorkingCopy` is backed by a `URI` from a
 * known file system provider. Given this assumption, a lot
 * of functionality can be built on top, such as saving in
 * a secure way to prevent data loss.
 */
export interface IStoredFileWorkingCopy<M extends IStoredFileWorkingCopyModel> extends IResourceWorkingCopy, IFileWorkingCopy<M> {

	/**
	 * An event for when a stored file working copy was resolved.
	 */
	readonly onDidResolve: Event<void>;

	/**
	 * An event for when a stored file working copy was saved successfully.
	 */
	readonly onDidSave: Event<IStoredFileWorkingCopySaveEvent>;

	/**
	 * An event indicating that a stored file working copy save operation failed.
	 */
	readonly onDidSaveError: Event<void>;

	/**
	 * An event for when the readonly state of the stored file working copy changes.
	 */
	readonly onDidChangeReadonly: Event<void>;

	/**
	 * Resolves a stored file working copy.
	 */
	resolve(options?: IStoredFileWorkingCopyResolveOptions): Promise<void>;

	/**
	 * Explicitly sets the working copy to be modified.
	 */
	markModified(): void;

	/**
	 * Whether the stored file working copy is in the provided `state`
	 * or not.
	 *
	 * @param state the `FileWorkingCopyState` to check on.
	 */
	hasState(state: StoredFileWorkingCopyState): boolean;

	/**
	 * Allows to join a state change away from the provided `state`.
	 *
	 * @param state currently only `FileWorkingCopyState.PENDING_SAVE`
	 * can be awaited on to resolve.
	 */
	joinState(state: StoredFileWorkingCopyState.PENDING_SAVE): Promise<void>;

	/**
	 * Whether we have a resolved model or not.
	 */
	isResolved(): this is IResolvedStoredFileWorkingCopy<M>;

	/**
	 * Whether the stored file working copy is readonly or not.
	 */
	isReadonly(): boolean | IMarkdownString;
}

export interface IResolvedStoredFileWorkingCopy<M extends IStoredFileWorkingCopyModel> extends IStoredFileWorkingCopy<M> {

	/**
	 * A resolved stored file working copy has a resolved model.
	 */
	readonly model: M;
}

/**
 * States the stored file working copy can be in.
 */
export const enum StoredFileWorkingCopyState {

	/**
	 * A stored file working copy is saved.
	 */
	SAVED,

	/**
	 * A stored file working copy is dirty.
	 */
	DIRTY,

	/**
	 * A stored file working copy is currently being saved but
	 * this operation has not completed yet.
	 */
	PENDING_SAVE,

	/**
	 * A stored file working copy is in conflict mode when changes
	 * cannot be saved because the underlying file has changed.
	 * Stored file working copies in conflict mode are always dirty.
	 */
	CONFLICT,

	/**
	 * A stored file working copy is in orphan state when the underlying
	 * file has been deleted.
	 */
	ORPHAN,

	/**
	 * Any error that happens during a save that is not causing
	 * the `StoredFileWorkingCopyState.CONFLICT` state.
	 * Stored file working copies in error mode are always dirty.
	 */
	ERROR
}

export interface IStoredFileWorkingCopySaveOptions extends ISaveOptions {

	/**
	 * Save the stored file working copy with an attempt to unlock it.
	 */
	readonly writeUnlock?: boolean;

	/**
	 * Save the stored file working copy with elevated privileges.
	 *
	 * Note: This may not be supported in all environments.
	 */
	readonly writeElevated?: boolean;

	/**
	 * Allows to write to a stored file working copy even if it has been
	 * modified on disk. This should only be triggered from an
	 * explicit user action.
	 */
	readonly ignoreModifiedSince?: boolean;

	/**
	 * If set, will bubble up the stored file working copy save error to
	 * the caller instead of handling it.
	 */
	readonly ignoreErrorHandler?: boolean;
}

export interface IStoredFileWorkingCopyResolver {

	/**
	 * Resolves the working copy in a safe way from an external
	 * working copy manager that can make sure multiple parallel
	 * resolves execute properly.
	 */
	(options?: IStoredFileWorkingCopyResolveOptions): Promise<void>;
}

export interface IStoredFileWorkingCopyResolveOptions {

	/**
	 * The contents to use for the stored file working copy if known. If not
	 * provided, the contents will be retrieved from the underlying
	 * resource or backup if present.
	 *
	 * If contents are provided, the stored file working copy will be marked
	 * as dirty right from the beginning.
	 */
	readonly contents?: VSBufferReadableStream;

	/**
	 * Go to disk bypassing any cache of the stored file working copy if any.
	 */
	readonly forceReadFromFile?: boolean;
}

/**
 * Metadata associated with a stored file working copy backup.
 */
interface IStoredFileWorkingCopyBackupMetaData extends IWorkingCopyBackupMeta {
	readonly mtime: number;
	readonly ctime: number;
	readonly size: number;
	readonly etag: string;
	readonly orphaned: boolean;
}

export interface IStoredFileWorkingCopySaveEvent extends IWorkingCopySaveEvent {

	/**
	 * The resolved stat from the save operation.
	 */
	readonly stat: IFileStatWithMetadata;
}

export function isStoredFileWorkingCopySaveEvent(e: IWorkingCopySaveEvent): e is IStoredFileWorkingCopySaveEvent {
	const candidate = e as IStoredFileWorkingCopySaveEvent;

	return !!candidate.stat;
}

export class StoredFileWorkingCopy<M extends IStoredFileWorkingCopyModel> extends ResourceWorkingCopy implements IStoredFileWorkingCopy<M>  {

	readonly capabilities: WorkingCopyCapabilities = WorkingCopyCapabilities.None;

	private _model: M | undefined = undefined;
	get model(): M | undefined { return this._model; }

	//#region events

	private readonly _onDidChangeContent = this._register(new Emitter<void>());
	readonly onDidChangeContent = this._onDidChangeContent.event;

	private readonly _onDidResolve = this._register(new Emitter<void>());
	readonly onDidResolve = this._onDidResolve.event;

	private readonly _onDidChangeDirty = this._register(new Emitter<void>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	private readonly _onDidSaveError = this._register(new Emitter<void>());
	readonly onDidSaveError = this._onDidSaveError.event;

	private readonly _onDidSave = this._register(new Emitter<IStoredFileWorkingCopySaveEvent>());
	readonly onDidSave = this._onDidSave.event;

	private readonly _onDidRevert = this._register(new Emitter<void>());
	readonly onDidRevert = this._onDidRevert.event;

	private readonly _onDidChangeReadonly = this._register(new Emitter<void>());
	readonly onDidChangeReadonly = this._onDidChangeReadonly.event;

	//#endregion

	constructor(
		readonly typeId: string,
		resource: URI,
		readonly name: string,
		private readonly modelFactory: IStoredFileWorkingCopyModelFactory<M>,
		private readonly externalResolver: IStoredFileWorkingCopyResolver,
		@IFileService fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@IWorkingCopyFileService private readonly workingCopyFileService: IWorkingCopyFileService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@IWorkingCopyBackupService private readonly workingCopyBackupService: IWorkingCopyBackupService,
		@IWorkingCopyService workingCopyService: IWorkingCopyService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkingCopyEditorService private readonly workingCopyEditorService: IWorkingCopyEditorService,
		@IEditorService private readonly editorService: IEditorService,
		@IElevatedFileService private readonly elevatedFileService: IElevatedFileService
	) {
		super(resource, fileService);

		// Make known to working copy service
		this._register(workingCopyService.registerWorkingCopy(this));

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.filesConfigurationService.onReadonlyChange(() => this._onDidChangeReadonly.fire()));
	}

	//#region Dirty

	private dirty = false;
	private savedVersionId: unknown;

	isDirty(): this is IResolvedStoredFileWorkingCopy<M> {
		return this.dirty;
	}

	markModified(): void {
		this.setDirty(true); // stored file working copy tracks modified via dirty
	}

	private setDirty(dirty: boolean): void {
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

	private doSetDirty(dirty: boolean): () => void {
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
		} else {
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

	//#endregion

	//#region Resolve

	private lastResolvedFileStat: IFileStatWithMetadata | undefined;

	isResolved(): this is IResolvedStoredFileWorkingCopy<M> {
		return !!this.model;
	}

	async resolve(options?: IStoredFileWorkingCopyResolveOptions): Promise<void> {
		this.trace('resolve() - enter');

		// Return early if we are disposed
		if (this.isDisposed()) {
			this.trace('resolve() - exit - without resolving because file working copy is disposed');

			return;
		}

		// Unless there are explicit contents provided, it is important that we do not
		// resolve a working copy that is dirty or is in the process of saving to prevent
		// data loss.
		if (!options?.contents && (this.dirty || this.saveSequentializer.hasPending())) {
			this.trace('resolve() - exit - without resolving because file working copy is dirty or being saved');

			return;
		}

		return this.doResolve(options);
	}

	private async doResolve(options?: IStoredFileWorkingCopyResolveOptions): Promise<void> {

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

	private async resolveFromBuffer(buffer: VSBufferReadableStream): Promise<void> {
		this.trace('resolveFromBuffer()');

		// Try to resolve metdata from disk
		let mtime: number;
		let ctime: number;
		let size: number;
		let etag: string;
		try {
			const metadata = await this.fileService.stat(this.resource);
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
			locked: false
		}, true /* dirty (resolved from buffer) */);
	}

	private async resolveFromBackup(): Promise<boolean> {

		// Resolve backup if any
		const backup = await this.workingCopyBackupService.resolve<IStoredFileWorkingCopyBackupMetaData>(this);

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

	private async doResolveFromBackup(backup: IResolvedWorkingCopyBackup<IStoredFileWorkingCopyBackupMetaData>): Promise<void> {
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
			locked: false
		}, true /* dirty (resolved from backup) */);

		// Restore orphaned flag based on state
		if (backup.meta && backup.meta.orphaned) {
			this.setOrphaned(true);
		}
	}

	private async resolveFromFile(options?: IStoredFileWorkingCopyResolveOptions): Promise<void> {
		this.trace('resolveFromFile()');

		const forceReadFromFile = options?.forceReadFromFile;

		// Decide on etag
		let etag: string | undefined;
		if (forceReadFromFile) {
			etag = ETAG_DISABLED; // disable ETag if we enforce to read from disk
		} else if (this.lastResolvedFileStat) {
			etag = this.lastResolvedFileStat.etag; // otherwise respect etag to support caching
		}

		// Remember current version before doing any long running operation
		// to ensure we are not changing a working copy that was changed
		// meanwhile
		const currentVersionId = this.versionId;

		// Resolve Content
		try {
			const content = await this.fileService.readFileStream(this.resource, { etag });

			// Clear orphaned state when resolving was successful
			this.setOrphaned(false);

			// Return early if the working copy content has changed
			// meanwhile to prevent loosing any changes
			if (currentVersionId !== this.versionId) {
				this.trace('resolveFromFile() - exit - without resolving because file working copy content changed');

				return;
			}

			await this.resolveFromContent(content, false /* not dirty (resolved from file) */);
		} catch (error) {
			const result = error.fileOperationResult;

			// Apply orphaned state based on error code
			this.setOrphaned(result === FileOperationResult.FILE_NOT_FOUND);

			// NotModified status is expected and can be handled gracefully
			// if we are resolved. We still want to update our last resolved
			// stat to e.g. detect changes to the file's readonly state
			if (this.isResolved() && result === FileOperationResult.FILE_NOT_MODIFIED_SINCE) {
				if (error instanceof NotModifiedSinceFileOperationError) {
					this.updateLastResolvedFileStat(error.stat);
				}

				return;
			}

			// Unless we are forced to read from the file, ignore when a working copy has
			// been resolved once and the file was deleted meanwhile. Since we already have
			// the working copy resolved, we can return to this state and update the orphaned
			// flag to indicate that this working copy has no version on disk anymore.
			if (this.isResolved() && result === FileOperationResult.FILE_NOT_FOUND && !forceReadFromFile) {
				return;
			}

			// Otherwise bubble up the error
			throw error;
		}
	}

	private async resolveFromContent(content: IFileStreamContent, dirty: boolean): Promise<void> {
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

	private async doCreateModel(contents: VSBufferReadableStream): Promise<void> {
		this.trace('doCreateModel()');

		// Create model and dispose it when we get disposed
		this._model = this._register(await this.modelFactory.createModel(this.resource, contents, CancellationToken.None));

		// Model listeners
		this.installModelListeners(this._model);
	}

	private ignoreDirtyOnModelContentChange = false;

	private async doUpdateModel(contents: VSBufferReadableStream): Promise<void> {
		this.trace('doUpdateModel()');

		// Update model value in a block that ignores content change events for dirty tracking
		this.ignoreDirtyOnModelContentChange = true;
		try {
			await this.model?.update(contents, CancellationToken.None);
		} finally {
			this.ignoreDirtyOnModelContentChange = false;
		}
	}

	private installModelListeners(model: M): void {

		// See https://github.com/microsoft/vscode/issues/30189
		// This code has been extracted to a different method because it caused a memory leak
		// where `value` was captured in the content change listener closure scope.

		// Content Change
		this._register(model.onDidChangeContent(e => this.onModelContentChanged(model, e.isUndoing || e.isRedoing)));

		// Lifecycle
		this._register(model.onWillDispose(() => this.dispose()));
	}

	private onModelContentChanged(model: M, isUndoingOrRedoing: boolean): void {
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

	private async forceResolveFromFile(): Promise<void> {
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

	get backupDelay(): number | undefined {
		return this.model?.configuration?.backupDelay;
	}

	async backup(token: CancellationToken): Promise<IWorkingCopyBackup> {

		// Fill in metadata if we are resolved
		let meta: IStoredFileWorkingCopyBackupMetaData | undefined = undefined;
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
		let content: VSBufferReadableStream | undefined = undefined;
		if (this.isResolved()) {
			content = await raceCancellation(this.model.snapshot(token), token);
		}

		return { meta, content };
	}

	//#endregion

	//#region Save

	private versionId = 0;

	private static readonly UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD = 500;
	private lastContentChangeFromUndoRedo: number | undefined = undefined;

	private readonly saveSequentializer = new TaskSequentializer();

	private ignoreSaveFromSaveParticipants = false;

	async save(options: IStoredFileWorkingCopySaveOptions = Object.create(null)): Promise<boolean> {
		if (!this.isResolved()) {
			return false;
		}

		if (this.isReadonly()) {
			this.trace('save() - ignoring request for readonly resource');

			return false; // if working copy is readonly we do not attempt to save at all
		}

		if (
			(this.hasState(StoredFileWorkingCopyState.CONFLICT) || this.hasState(StoredFileWorkingCopyState.ERROR)) &&
			(options.reason === SaveReason.AUTO || options.reason === SaveReason.FOCUS_CHANGE || options.reason === SaveReason.WINDOW_CHANGE)
		) {
			this.trace('save() - ignoring auto save request for file working copy that is in conflict or error');

			return false; // if working copy is in save conflict or error, do not save unless save reason is explicit
		}

		// Actually do save
		this.trace('save() - enter');
		await this.doSave(options);
		this.trace('save() - exit');

		return this.hasState(StoredFileWorkingCopyState.SAVED);
	}

	private async doSave(options: IStoredFileWorkingCopySaveOptions): Promise<void> {
		if (typeof options.reason !== 'number') {
			options.reason = SaveReason.EXPLICIT;
		}

		let versionId = this.versionId;
		this.trace(`doSave(${versionId}) - enter with versionId ${versionId}`);

		// Return early if saved from within save participant to break recursion
		//
		// Scenario: a save participant triggers a save() on the working copy
		if (this.ignoreSaveFromSaveParticipants) {
			this.trace(`doSave(${versionId}) - exit - refusing to save() recursively from save participant`);

			return;
		}

		// Lookup any running pending save for this versionId and return it if found
		//
		// Scenario: user invoked the save action multiple times quickly for the same contents
		//           while the save was not yet finished to disk
		//
		if (this.saveSequentializer.hasPending(versionId)) {
			this.trace(`doSave(${versionId}) - exit - found a pending save for versionId ${versionId}`);

			return this.saveSequentializer.pending;
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
		if (this.saveSequentializer.hasPending()) {
			this.trace(`doSave(${versionId}) - exit - because busy saving`);

			// Indicate to the save sequentializer that we want to
			// cancel the pending operation so that ours can run
			// before the pending one finishes.
			// Currently this will try to cancel pending save
			// participants and pending snapshots from the
			// save operation, but not the actual save which does
			// not support cancellation yet.
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
					if (options.reason === SaveReason.AUTO && typeof this.lastContentChangeFromUndoRedo === 'number') {
						const timeFromUndoRedoToSave = Date.now() - this.lastContentChangeFromUndoRedo;
						if (timeFromUndoRedoToSave < StoredFileWorkingCopy.UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD) {
							await timeout(StoredFileWorkingCopy.UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD - timeFromUndoRedoToSave);
						}
					}

					// Run save participants unless save was cancelled meanwhile
					if (!saveCancellation.token.isCancellationRequested) {
						this.ignoreSaveFromSaveParticipants = true;
						try {
							await this.workingCopyFileService.runSaveParticipants(this, { reason: options.reason ?? SaveReason.EXPLICIT }, saveCancellation.token);
						} finally {
							this.ignoreSaveFromSaveParticipants = false;
						}
					}
				} catch (error) {
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

			// Save to Disk. We mark the save operation as currently pending with
			// the latest versionId because it might have changed from a save
			// participant triggering
			this.trace(`doSave(${versionId}) - before write()`);
			const lastResolvedFileStat = assertIsDefined(this.lastResolvedFileStat);
			const resolvedFileWorkingCopy = this;
			return this.saveSequentializer.setPending(versionId, (async () => {
				try {
					const writeFileOptions: IWriteFileOptions = {
						mtime: lastResolvedFileStat.mtime,
						etag: (options.ignoreModifiedSince || !this.filesConfigurationService.preventSaveConflicts(lastResolvedFileStat.resource)) ? ETAG_DISABLED : lastResolvedFileStat.etag,
						unlock: options.writeUnlock
					};

					let stat: IFileStatWithMetadata;

					// Delegate to working copy model save method if any
					if (typeof resolvedFileWorkingCopy.model.save === 'function') {
						stat = await resolvedFileWorkingCopy.model.save(writeFileOptions, saveCancellation.token);
					}

					// Otherwise ask for a snapshot and save via file services
					else {

						// Snapshot working copy model contents
						const snapshot = await raceCancellation(resolvedFileWorkingCopy.model.snapshot(saveCancellation.token), saveCancellation.token);

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

						// Write them to disk
						if (options?.writeElevated && this.elevatedFileService.isSupported(lastResolvedFileStat.resource)) {
							stat = await this.elevatedFileService.writeFileElevated(lastResolvedFileStat.resource, assertIsDefined(snapshot), writeFileOptions);
						} else {
							stat = await this.fileService.writeFile(lastResolvedFileStat.resource, assertIsDefined(snapshot), writeFileOptions);
						}
					}

					this.handleSaveSuccess(stat, versionId, options);
				} catch (error) {
					this.handleSaveError(error, versionId, options);
				}
			})(), () => saveCancellation.cancel());
		})(), () => saveCancellation.cancel());
	}

	private handleSaveSuccess(stat: IFileStatWithMetadata, versionId: number, options: IStoredFileWorkingCopySaveOptions): void {

		// Updated resolved stat with updated stat
		this.updateLastResolvedFileStat(stat);

		// Update dirty state unless working copy has changed meanwhile
		if (versionId === this.versionId) {
			this.trace(`handleSaveSuccess(${versionId}) - setting dirty to false because versionId did not change`);
			this.setDirty(false);
		} else {
			this.trace(`handleSaveSuccess(${versionId}) - not setting dirty to false because versionId did change meanwhile`);
		}

		// Update orphan state given save was successful
		this.setOrphaned(false);

		// Emit Save Event
		this._onDidSave.fire({ reason: options.reason, stat, source: options.source });
	}

	private handleSaveError(error: Error, versionId: number, options: IStoredFileWorkingCopySaveOptions): void {
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
		if ((error as FileOperationError).fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE) {
			this.inConflictMode = true;
		}

		// Show save error to user for handling
		this.doHandleSaveError(error);

		// Emit as event
		this._onDidSaveError.fire();
	}

	private doHandleSaveError(error: Error): void {
		const fileOperationError = error as FileOperationError;
		const primaryActions: IAction[] = [];

		let message: string;

		// Dirty write prevention
		if (fileOperationError.fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE) {
			message = localize('staleSaveError', "Failed to save '{0}': The content of the file is newer. Do you want to overwrite the file with your changes?", this.name);

			primaryActions.push(toAction({ id: 'fileWorkingCopy.overwrite', label: localize('overwrite', "Overwrite"), run: () => this.save({ ignoreModifiedSince: true }) }));
			primaryActions.push(toAction({ id: 'fileWorkingCopy.revert', label: localize('discard', "Discard"), run: () => this.revert() }));
		}

		// Any other save error
		else {
			const isWriteLocked = fileOperationError.fileOperationResult === FileOperationResult.FILE_WRITE_LOCKED;
			const triedToUnlock = isWriteLocked && (fileOperationError.options as IWriteFileOptions | undefined)?.unlock;
			const isPermissionDenied = fileOperationError.fileOperationResult === FileOperationResult.FILE_PERMISSION_DENIED;
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
						this.save({ writeElevated: true, writeUnlock: triedToUnlock, reason: SaveReason.EXPLICIT });
					}
				}));
			}

			// Unlock
			else if (isWriteLocked) {
				primaryActions.push(toAction({ id: 'fileWorkingCopy.unlock', label: localize('overwrite', "Overwrite"), run: () => this.save({ writeUnlock: true, reason: SaveReason.EXPLICIT }) }));
			}

			// Retry
			else {
				primaryActions.push(toAction({ id: 'fileWorkingCopy.retry', label: localize('retry', "Retry"), run: () => this.save({ reason: SaveReason.EXPLICIT }) }));
			}

			// Save As
			primaryActions.push(toAction({
				id: 'fileWorkingCopy.saveAs',
				label: localize('saveAs', "Save As..."),
				run: async () => {
					const editor = this.workingCopyEditorService.findEditor(this);
					if (editor) {
						const result = await this.editorService.save(editor, { saveAs: true, reason: SaveReason.EXPLICIT });
						if (!result.success) {
							this.doHandleSaveError(error); // show error again given the operation failed
						}
					}
				}
			}));

			// Discard
			primaryActions.push(toAction({ id: 'fileWorkingCopy.revert', label: localize('discard', "Discard"), run: () => this.revert() }));

			// Message
			if (isWriteLocked) {
				if (triedToUnlock && canSaveElevated) {
					message = isWindows ?
						localize('readonlySaveErrorAdmin', "Failed to save '{0}': File is read-only. Select 'Overwrite as Admin' to retry as administrator.", this.name) :
						localize('readonlySaveErrorSudo', "Failed to save '{0}': File is read-only. Select 'Overwrite as Sudo' to retry as superuser.", this.name);
				} else {
					message = localize('readonlySaveError', "Failed to save '{0}': File is read-only. Select 'Overwrite' to attempt to make it writeable.", this.name);
				}
			} else if (canSaveElevated && isPermissionDenied) {
				message = isWindows ?
					localize('permissionDeniedSaveError', "Failed to save '{0}': Insufficient permissions. Select 'Retry as Admin' to retry as administrator.", this.name) :
					localize('permissionDeniedSaveErrorSudo', "Failed to save '{0}': Insufficient permissions. Select 'Retry as Sudo' to retry as superuser.", this.name);
			} else {
				message = localize({ key: 'genericSaveError', comment: ['{0} is the resource that failed to save and {1} the error message'] }, "Failed to save '{0}': {1}", this.name, toErrorMessage(error, false));
			}
		}

		// Show to the user as notification
		const handle = this.notificationService.notify({ id: `${hash(this.resource.toString())}`, severity: Severity.Error, message, actions: { primary: primaryActions } });

		// Remove automatically when we get saved/reverted
		const listener = Event.once(Event.any(this.onDidSave, this.onDidRevert))(() => handle.close());
		Event.once(handle.onDidClose)(() => listener.dispose());
	}

	private updateLastResolvedFileStat(newFileStat: IFileStatWithMetadata): void {
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

		// Signal that the readonly state changed
		if (this.isReadonly() !== oldReadonly) {
			this._onDidChangeReadonly.fire();
		}
	}

	//#endregion

	//#region Revert

	async revert(options?: IRevertOptions): Promise<void> {
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

	hasState(state: StoredFileWorkingCopyState): boolean {
		switch (state) {
			case StoredFileWorkingCopyState.CONFLICT:
				return this.inConflictMode;
			case StoredFileWorkingCopyState.DIRTY:
				return this.dirty;
			case StoredFileWorkingCopyState.ERROR:
				return this.inErrorMode;
			case StoredFileWorkingCopyState.ORPHAN:
				return this.isOrphaned();
			case StoredFileWorkingCopyState.PENDING_SAVE:
				return this.saveSequentializer.hasPending();
			case StoredFileWorkingCopyState.SAVED:
				return !this.dirty;
		}
	}

	async joinState(state: StoredFileWorkingCopyState.PENDING_SAVE): Promise<void> {
		return this.saveSequentializer.pending;
	}

	//#endregion

	//#region Utilities

	isReadonly(): boolean | IMarkdownString {
		return this.filesConfigurationService.isReadonly(this.resource, this.lastResolvedFileStat);
	}

	private trace(msg: string): void {
		this.logService.trace(`[stored file working copy] ${msg}`, this.resource.toString(), this.typeId);
	}

	//#endregion

	//#region Dispose

	override dispose(): void {
		this.trace('dispose()');

		// State
		this.inConflictMode = false;
		this.inErrorMode = false;

		// Free up model for GC
		this._model = undefined;

		super.dispose();
	}

	//#endregion
}
