/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Emitter } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { assertIsDefined, withNullAsUndefined } from 'vs/base/common/types';
import { EncodingMode, ITextFileService, TextFileEditorModelState, ITextFileEditorModel, ITextFileStreamContent, ITextFileResolveOptions, IResolvedTextFileEditorModel, ITextFileSaveOptions, TextFileResolveReason, ITextFileEditorModelSaveEvent } from 'vs/workbench/services/textfile/common/textfiles';
import { IRevertOptions, SaveReason, SaveSourceRegistry } from 'vs/workbench/common/editor';
import { BaseTextEditorModel } from 'vs/workbench/common/editor/textEditorModel';
import { IWorkingCopyBackupService, IResolvedWorkingCopyBackup } from 'vs/workbench/services/workingCopy/common/workingCopyBackup';
import { IFileService, FileOperationError, FileOperationResult, FileChangesEvent, FileChangeType, IFileStatWithMetadata, ETAG_DISABLED, FileSystemProviderCapabilities, NotModifiedSinceFileOperationError } from 'vs/platform/files/common/files';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IModelService } from 'vs/editor/common/services/model';
import { timeout, TaskSequentializer } from 'vs/base/common/async';
import { ITextBufferFactory, ITextModel } from 'vs/editor/common/model';
import { ILogService } from 'vs/platform/log/common/log';
import { basename } from 'vs/base/common/path';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { IWorkingCopyBackup, WorkingCopyCapabilities, NO_TYPE_ID, IWorkingCopyBackupMeta } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { ILabelService } from 'vs/platform/label/common/label';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { UTF16be, UTF16le, UTF8, UTF8_with_bom } from 'vs/workbench/services/textfile/common/encoding';
import { createTextBufferFactoryFromStream } from 'vs/editor/common/model/textModel';
import { ILanguageDetectionService } from 'vs/workbench/services/languageDetection/common/languageDetectionWorkerService';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { extUri } from 'vs/base/common/resources';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

interface IBackupMetaData extends IWorkingCopyBackupMeta {
	mtime: number;
	ctime: number;
	size: number;
	etag: string;
	orphaned: boolean;
}

/**
 * The text file editor model listens to changes to its underlying code editor model and saves these changes through the file service back to the disk.
 */
export class TextFileEditorModel extends BaseTextEditorModel implements ITextFileEditorModel {

	private static readonly TEXTFILE_SAVE_ENCODING_SOURCE = SaveSourceRegistry.registerSource('textFileEncoding.source', localize('textFileCreate.source', "File Encoding Changed"));

	//#region Events

	private readonly _onDidChangeContent = this._register(new Emitter<void>());
	readonly onDidChangeContent = this._onDidChangeContent.event;

	private readonly _onDidResolve = this._register(new Emitter<TextFileResolveReason>());
	readonly onDidResolve = this._onDidResolve.event;

	private readonly _onDidChangeDirty = this._register(new Emitter<void>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	private readonly _onDidSaveError = this._register(new Emitter<void>());
	readonly onDidSaveError = this._onDidSaveError.event;

	private readonly _onDidSave = this._register(new Emitter<ITextFileEditorModelSaveEvent>());
	readonly onDidSave = this._onDidSave.event;

	private readonly _onDidRevert = this._register(new Emitter<void>());
	readonly onDidRevert = this._onDidRevert.event;

	private readonly _onDidChangeEncoding = this._register(new Emitter<void>());
	readonly onDidChangeEncoding = this._onDidChangeEncoding.event;

	private readonly _onDidChangeOrphaned = this._register(new Emitter<void>());
	readonly onDidChangeOrphaned = this._onDidChangeOrphaned.event;

	private readonly _onDidChangeReadonly = this._register(new Emitter<void>());
	readonly onDidChangeReadonly = this._onDidChangeReadonly.event;

	//#endregion

	readonly typeId = NO_TYPE_ID; // IMPORTANT: never change this to not break existing assumptions (e.g. backups)

	readonly capabilities = WorkingCopyCapabilities.None;

	readonly name = basename(this.labelService.getUriLabel(this.resource));
	private resourceHasExtension: boolean = !!extUri.extname(this.resource);

	private contentEncoding: string | undefined; // encoding as reported from disk

	private versionId = 0;
	private bufferSavedVersionId: number | undefined;
	private ignoreDirtyOnModelContentChange = false;

	private static readonly UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD = 500;
	private lastModelContentChangeFromUndoRedo: number | undefined = undefined;

	private lastResolvedFileStat: IFileStatWithMetadata | undefined;

	private readonly saveSequentializer = new TaskSequentializer();

	private dirty = false;
	private inConflictMode = false;
	private inOrphanMode = false;
	private inErrorMode = false;

	constructor(
		readonly resource: URI,
		private preferredEncoding: string | undefined,		// encoding as chosen by the user
		private preferredLanguageId: string | undefined,	// language id as chosen by the user
		@ILanguageService languageService: ILanguageService,
		@IModelService modelService: IModelService,
		@IFileService private readonly fileService: IFileService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IWorkingCopyBackupService private readonly workingCopyBackupService: IWorkingCopyBackupService,
		@ILogService private readonly logService: ILogService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@ILabelService private readonly labelService: ILabelService,
		@ILanguageDetectionService languageDetectionService: ILanguageDetectionService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IPathService private readonly pathService: IPathService,
		@IExtensionService private readonly extensionService: IExtensionService
	) {
		super(modelService, languageService, languageDetectionService, accessibilityService);

		// Make known to working copy service
		this._register(this.workingCopyService.registerWorkingCopy(this));

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.fileService.onDidFilesChange(e => this.onDidFilesChange(e)));
		this._register(this.filesConfigurationService.onFilesAssociationChange(() => this.onFilesAssociationChange()));
	}

	private async onDidFilesChange(e: FileChangesEvent): Promise<void> {
		let fileEventImpactsModel = false;
		let newInOrphanModeGuess: boolean | undefined;

		// If we are currently orphaned, we check if the model file was added back
		if (this.inOrphanMode) {
			const modelFileAdded = e.contains(this.resource, FileChangeType.ADDED);
			if (modelFileAdded) {
				newInOrphanModeGuess = false;
				fileEventImpactsModel = true;
			}
		}

		// Otherwise we check if the model file was deleted
		else {
			const modelFileDeleted = e.contains(this.resource, FileChangeType.DELETED);
			if (modelFileDeleted) {
				newInOrphanModeGuess = true;
				fileEventImpactsModel = true;
			}
		}

		if (fileEventImpactsModel && this.inOrphanMode !== newInOrphanModeGuess) {
			let newInOrphanModeValidated: boolean = false;
			if (newInOrphanModeGuess) {
				// We have received reports of users seeing delete events even though the file still
				// exists (network shares issue: https://github.com/microsoft/vscode/issues/13665).
				// Since we do not want to mark the model as orphaned, we have to check if the
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

	private onFilesAssociationChange(): void {
		if (!this.isResolved()) {
			return;
		}

		const firstLineText = this.getFirstLineText(this.textEditorModel);
		const languageSelection = this.getOrCreateLanguage(this.resource, this.languageService, this.preferredLanguageId, firstLineText);

		this.modelService.setMode(this.textEditorModel, languageSelection);
	}

	override setLanguageId(languageId: string, source?: string): void {
		super.setLanguageId(languageId, source);

		this.preferredLanguageId = languageId;
	}

	//#region Backup

	async backup(token: CancellationToken): Promise<IWorkingCopyBackup> {

		// Fill in metadata if we are resolved
		let meta: IBackupMetaData | undefined = undefined;
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
		const content = await this.textFileService.getEncodedReadable(this.resource, withNullAsUndefined(this.createSnapshot()), { encoding: UTF8 });

		return { meta, content };
	}

	//#endregion

	//#region Revert

	async revert(options?: IRevertOptions): Promise<void> {
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
			} catch (error) {

				// FileNotFound means the file got deleted meanwhile, so ignore it
				if ((<FileOperationError>error).fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {

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

	override async resolve(options?: ITextFileResolveOptions): Promise<void> {
		this.trace('resolve() - enter');

		// Return early if we are disposed
		if (this.isDisposed()) {
			this.trace('resolve() - exit - without resolving because model is disposed');

			return;
		}

		// Unless there are explicit contents provided, it is important that we do not
		// resolve a model that is dirty or is in the process of saving to prevent data
		// loss.
		if (!options?.contents && (this.dirty || this.saveSequentializer.hasPending())) {
			this.trace('resolve() - exit - without resolving because model is dirty or being saved');

			return;
		}

		return this.doResolve(options);
	}

	private async doResolve(options?: ITextFileResolveOptions): Promise<void> {

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

	private async resolveFromBuffer(buffer: ITextBufferFactory, options?: ITextFileResolveOptions): Promise<void> {
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
			readonly: false
		}, true /* dirty (resolved from buffer) */, options);
	}

	private async resolveFromBackup(options?: ITextFileResolveOptions): Promise<boolean> {

		// Resolve backup if any
		const backup = await this.workingCopyBackupService.resolve<IBackupMetaData>(this);

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

	private async doResolveFromBackup(backup: IResolvedWorkingCopyBackup<IBackupMetaData>, encoding: string, options?: ITextFileResolveOptions): Promise<void> {
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
			readonly: false
		}, true /* dirty (resolved from backup) */, options);

		// Restore orphaned flag based on state
		if (backup.meta?.orphaned) {
			this.setOrphaned(true);
		}
	}

	private async resolveFromFile(options?: ITextFileResolveOptions): Promise<void> {
		this.trace('resolveFromFile()');

		const forceReadFromFile = options?.forceReadFromFile;
		const allowBinary = this.isResolved() /* always allow if we resolved previously */ || options?.allowBinary;

		// Decide on etag
		let etag: string | undefined;
		if (forceReadFromFile) {
			etag = ETAG_DISABLED; // disable ETag if we enforce to read from disk
		} else if (this.lastResolvedFileStat) {
			etag = this.lastResolvedFileStat.etag; // otherwise respect etag to support caching
		}

		// Remember current version before doing any long running operation
		// to ensure we are not changing a model that was changed meanwhile
		const currentVersionId = this.versionId;

		// Resolve Content
		try {
			const content = await this.textFileService.readStream(this.resource, { acceptTextOnly: !allowBinary, etag, encoding: this.preferredEncoding });

			// Clear orphaned state when resolving was successful
			this.setOrphaned(false);

			// Return early if the model content has changed
			// meanwhile to prevent loosing any changes
			if (currentVersionId !== this.versionId) {
				this.trace('resolveFromFile() - exit - without resolving because model content changed');

				return;
			}

			return this.resolveFromContent(content, false /* not dirty (resolved from file) */, options);
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

			// Unless we are forced to read from the file, Ignore when a model has been resolved once
			// and the file was deleted meanwhile. Since we already have the model resolved, we can return
			// to this state and update the orphaned flag to indicate that this model has no version on
			// disk anymore.
			if (this.isResolved() && result === FileOperationResult.FILE_NOT_FOUND && !forceReadFromFile) {
				return;
			}

			// Otherwise bubble up the error
			throw error;
		}
	}

	private resolveFromContent(content: ITextFileStreamContent, dirty: boolean, options?: ITextFileResolveOptions): void {
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
		} else if (oldEncoding !== this.contentEncoding) {
			this._onDidChangeEncoding.fire();
		}

		// Update Existing Model
		if (this.textEditorModel) {
			this.doUpdateTextModel(content.value);
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
		this._onDidResolve.fire(options?.reason ?? TextFileResolveReason.OTHER);
	}

	private doCreateTextModel(resource: URI, value: ITextBufferFactory): void {
		this.trace('doCreateTextModel()');

		// Create model
		const textModel = this.createTextEditorModel(value, resource, this.preferredLanguageId);

		// Model Listeners
		this.installModelListeners(textModel);

		// Detect language from content
		this.autoDetectLanguage();
	}

	private doUpdateTextModel(value: ITextBufferFactory): void {
		this.trace('doUpdateTextModel()');

		// Update model value in a block that ignores content change events for dirty tracking
		this.ignoreDirtyOnModelContentChange = true;
		try {
			this.updateTextEditorModel(value, this.preferredLanguageId);
		} finally {
			this.ignoreDirtyOnModelContentChange = false;
		}
	}

	protected override installModelListeners(model: ITextModel): void {

		// See https://github.com/microsoft/vscode/issues/30189
		// This code has been extracted to a different method because it caused a memory leak
		// where `value` was captured in the content change listener closure scope.

		this._register(model.onDidChangeContent(e => this.onModelContentChanged(model, e.isUndoing || e.isRedoing)));
		this._register(model.onDidChangeLanguage(() => this.onMaybeShouldChangeEncoding())); // detect possible encoding change via language specific settings

		super.installModelListeners(model);
	}

	private onModelContentChanged(model: ITextModel, isUndoingOrRedoing: boolean): void {
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

	protected override async autoDetectLanguage(): Promise<void> {

		// Wait to be ready to detect language
		await this.extensionService?.whenInstalledExtensionsRegistered();

		// Only perform language detection conditionally
		const languageId = this.getLanguageId();
		if (
			this.resource.scheme === this.pathService.defaultUriScheme &&	// make sure to not detect language for non-user visible documents
			(!languageId || languageId === PLAINTEXT_LANGUAGE_ID) &&		// only run on files with plaintext language set or no language set at all
			!this.resourceHasExtension										// only run if this particular file doesn't have an extension
		) {
			return super.autoDetectLanguage();
		}
	}

	private async forceResolveFromFile(): Promise<void> {
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

	isDirty(): this is IResolvedTextFileEditorModel {
		return this.dirty;
	}

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

	//#endregion

	//#region Save

	async save(options: ITextFileSaveOptions = Object.create(null)): Promise<boolean> {
		if (!this.isResolved()) {
			return false;
		}

		if (this.isReadonly()) {
			this.trace('save() - ignoring request for readonly resource');

			return false; // if model is readonly we do not attempt to save at all
		}

		if (
			(this.hasState(TextFileEditorModelState.CONFLICT) || this.hasState(TextFileEditorModelState.ERROR)) &&
			(options.reason === SaveReason.AUTO || options.reason === SaveReason.FOCUS_CHANGE || options.reason === SaveReason.WINDOW_CHANGE)
		) {
			this.trace('save() - ignoring auto save request for model that is in conflict or error');

			return false; // if model is in save conflict or error, do not save unless save reason is explicit
		}

		// Actually do save and log
		this.trace('save() - enter');
		await this.doSave(options);
		this.trace('save() - exit');

		return this.hasState(TextFileEditorModelState.SAVED);
	}

	private async doSave(options: ITextFileSaveOptions): Promise<void> {
		if (typeof options.reason !== 'number') {
			options.reason = SaveReason.EXPLICIT;
		}

		let versionId = this.versionId;
		this.trace(`doSave(${versionId}) - enter with versionId ${versionId}`);

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
		if (this.saveSequentializer.hasPending()) {
			this.trace(`doSave(${versionId}) - exit - because busy saving`);

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
			this.textEditorModel.pushStackElement();
		}

		const saveCancellation = new CancellationTokenSource();

		return this.saveSequentializer.setPending(versionId, (async () => {

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
					if (options.reason === SaveReason.AUTO && typeof this.lastModelContentChangeFromUndoRedo === 'number') {
						const timeFromUndoRedoToSave = Date.now() - this.lastModelContentChangeFromUndoRedo;
						if (timeFromUndoRedoToSave < TextFileEditorModel.UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD) {
							await timeout(TextFileEditorModel.UNDO_REDO_SAVE_PARTICIPANTS_AUTO_SAVE_THROTTLE_THRESHOLD - timeFromUndoRedoToSave);
						}
					}

					// Run save participants unless save was cancelled meanwhile
					if (!saveCancellation.token.isCancellationRequested) {
						await this.textFileService.files.runSaveParticipants(this, { reason: options.reason ?? SaveReason.EXPLICIT }, saveCancellation.token);
					}
				} catch (error) {
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

			// We require a resolved model from this point on, since we are about to write data to disk.
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
			const resolvedTextFileEditorModel = this;
			return this.saveSequentializer.setPending(versionId, (async () => {
				try {
					const stat = await this.textFileService.write(lastResolvedFileStat.resource, resolvedTextFileEditorModel.createSnapshot(), {
						mtime: lastResolvedFileStat.mtime,
						encoding: this.getEncoding(),
						etag: (options.ignoreModifiedSince || !this.filesConfigurationService.preventSaveConflicts(lastResolvedFileStat.resource, resolvedTextFileEditorModel.getLanguageId())) ? ETAG_DISABLED : lastResolvedFileStat.etag,
						unlock: options.writeUnlock,
						writeElevated: options.writeElevated
					});

					this.handleSaveSuccess(stat, versionId, options);
				} catch (error) {
					this.handleSaveError(error, versionId, options);
				}
			})());
		})(), () => saveCancellation.cancel());
	}

	private handleSaveSuccess(stat: IFileStatWithMetadata, versionId: number, options: ITextFileSaveOptions): void {

		// Updated resolved stat with updated stat
		this.updateLastResolvedFileStat(stat);

		// Update dirty state unless model has changed meanwhile
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

	private handleSaveError(error: Error, versionId: number, options: ITextFileSaveOptions): void {
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
		if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE) {
			this.inConflictMode = true;
		}

		// Show to user
		this.textFileService.files.saveErrorHandler.onSaveError(error, this);

		// Emit as event
		this._onDidSaveError.fire();
	}

	private updateSavedVersionId(): void {
		// we remember the models alternate version id to remember when the version
		// of the model matches with the saved version on disk. we need to keep this
		// in order to find out if the model changed back to a saved version (e.g.
		// when undoing long enough to reach to a version that is saved and then to
		// clear the dirty flag)
		if (this.isResolved()) {
			this.bufferSavedVersionId = this.textEditorModel.getAlternativeVersionId();
		}
	}

	private updateLastResolvedFileStat(newFileStat: IFileStatWithMetadata): void {
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

		// Signal that the readonly state changed
		if (this.isReadonly() !== oldReadonly) {
			this._onDidChangeReadonly.fire();
		}
	}

	//#endregion

	hasState(state: TextFileEditorModelState): boolean {
		switch (state) {
			case TextFileEditorModelState.CONFLICT:
				return this.inConflictMode;
			case TextFileEditorModelState.DIRTY:
				return this.dirty;
			case TextFileEditorModelState.ERROR:
				return this.inErrorMode;
			case TextFileEditorModelState.ORPHAN:
				return this.inOrphanMode;
			case TextFileEditorModelState.PENDING_SAVE:
				return this.saveSequentializer.hasPending();
			case TextFileEditorModelState.SAVED:
				return !this.dirty;
		}
	}

	async joinState(state: TextFileEditorModelState.PENDING_SAVE): Promise<void> {
		return this.saveSequentializer.pending;
	}

	override getLanguageId(this: IResolvedTextFileEditorModel): string;
	override getLanguageId(): string | undefined;
	override getLanguageId(): string | undefined {
		if (this.textEditorModel) {
			return this.textEditorModel.getLanguageId();
		}

		return this.preferredLanguageId;
	}

	//#region Encoding

	private async onMaybeShouldChangeEncoding(): Promise<void> {

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

		// Re-open with new encoding
		return this.setEncodingInternal(encoding, EncodingMode.Decode);
	}

	private hasEncodingSetExplicitly: boolean = false;

	setEncoding(encoding: string, mode: EncodingMode): Promise<void> {

		// Remember that an explicit encoding was set
		this.hasEncodingSetExplicitly = true;

		return this.setEncodingInternal(encoding, mode);
	}

	private async setEncodingInternal(encoding: string, mode: EncodingMode): Promise<void> {

		// Encode: Save with encoding
		if (mode === EncodingMode.Encode) {
			this.updatePreferredEncoding(encoding);

			// Save
			if (!this.isDirty()) {
				this.versionId++; // needs to increment because we change the model potentially
				this.setDirty(true);
			}

			if (!this.inConflictMode) {
				await this.save({ source: TextFileEditorModel.TEXTFILE_SAVE_ENCODING_SOURCE });
			}
		}

		// Decode: Resolve with encoding
		else {
			if (!this.isNewEncoding(encoding)) {
				return; // return early if the encoding is already the same
			}

			if (this.isDirty() && !this.inConflictMode) {
				await this.save();
			}

			this.updatePreferredEncoding(encoding);

			await this.forceResolveFromFile();
		}
	}

	updatePreferredEncoding(encoding: string | undefined): void {
		if (!this.isNewEncoding(encoding)) {
			return;
		}

		this.preferredEncoding = encoding;

		// Emit
		this._onDidChangeEncoding.fire();
	}

	private isNewEncoding(encoding: string | undefined): boolean {
		if (this.preferredEncoding === encoding) {
			return false; // return early if the encoding is already the same
		}

		if (!this.preferredEncoding && this.contentEncoding === encoding) {
			return false; // also return if we don't have a preferred encoding but the content encoding is already the same
		}

		return true;
	}

	getEncoding(): string | undefined {
		return this.preferredEncoding || this.contentEncoding;
	}

	//#endregion

	private trace(msg: string): void {
		this.logService.trace(`[text file model] ${msg}`, this.resource.toString());
	}

	override isResolved(): this is IResolvedTextFileEditorModel {
		return !!this.textEditorModel;
	}

	override isReadonly(): boolean {
		return this.lastResolvedFileStat?.readonly || this.fileService.hasCapability(this.resource, FileSystemProviderCapabilities.Readonly);
	}

	override dispose(): void {
		this.trace('dispose()');

		this.inConflictMode = false;
		this.inOrphanMode = false;
		this.inErrorMode = false;

		super.dispose();
	}
}
