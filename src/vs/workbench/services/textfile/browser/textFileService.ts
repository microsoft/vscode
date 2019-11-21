/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { Emitter, AsyncEmitter } from 'vs/base/common/event';
import * as platform from 'vs/base/common/platform';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IResult, ITextFileOperationResult, ITextFileService, ITextFileStreamContent, ITextFileEditorModelManager, ITextFileEditorModel, ModelState, ITextFileContent, IResourceEncodings, IReadTextFileOptions, IWriteTextFileOptions, toBufferOrReadable, TextFileOperationError, TextFileOperationResult, FileOperationWillRunEvent, FileOperationDidRunEvent, ITextFileSaveOptions } from 'vs/workbench/services/textfile/common/textfiles';
import { SaveReason, IRevertOptions } from 'vs/workbench/common/editor';
import { ILifecycleService, ShutdownReason, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IFileService, FileOperationError, FileOperationResult, HotExitConfiguration, IFileStatWithMetadata, ICreateFileOptions, FileOperation } from 'vs/platform/files/common/files';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IUntitledTextEditorService } from 'vs/workbench/services/untitled/common/untitledTextEditorService';
import { UntitledTextEditorModel } from 'vs/workbench/common/editor/untitledTextEditorModel';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ResourceMap } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { createTextBufferFactoryFromSnapshot, createTextBufferFactoryFromStream } from 'vs/editor/common/model/textModel';
import { IModelService } from 'vs/editor/common/services/modelService';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { isEqualOrParent, isEqual, joinPath, dirname, extname, basename, toLocalResource } from 'vs/base/common/resources';
import { IDialogService, IFileDialogService, ISaveDialogOptions, IConfirmation, ConfirmResult } from 'vs/platform/dialogs/common/dialogs';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { coalesce } from 'vs/base/common/arrays';
import { trim } from 'vs/base/common/strings';
import { VSBuffer } from 'vs/base/common/buffer';
import { ITextSnapshot } from 'vs/editor/common/model';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { PLAINTEXT_MODE_ID } from 'vs/editor/common/modes/modesRegistry';
import { IFilesConfigurationService, AutoSaveMode } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { CancellationToken } from 'vs/base/common/cancellation';

/**
 * The workbench file service implementation implements the raw file service spec and adds additional methods on top.
 */
export abstract class AbstractTextFileService extends Disposable implements ITextFileService {

	_serviceBrand: undefined;

	//#region events

	private _onWillRunOperation = this._register(new AsyncEmitter<FileOperationWillRunEvent>());
	readonly onWillRunOperation = this._onWillRunOperation.event;

	private _onDidRunOperation = this._register(new Emitter<FileOperationDidRunEvent>());
	readonly onDidRunOperation = this._onDidRunOperation.event;

	//#endregion

	private _models: TextFileEditorModelManager;
	get models(): ITextFileEditorModelManager { return this._models; }

	abstract get encoding(): IResourceEncodings;

	constructor(
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IFileService protected readonly fileService: IFileService,
		@IUntitledTextEditorService protected readonly untitledTextEditorService: IUntitledTextEditorService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IModeService private readonly modeService: IModeService,
		@IModelService private readonly modelService: IModelService,
		@IWorkbenchEnvironmentService protected readonly environmentService: IWorkbenchEnvironmentService,
		@INotificationService private readonly notificationService: INotificationService,
		@IBackupFileService private readonly backupFileService: IBackupFileService,
		@IHistoryService private readonly historyService: IHistoryService,
		@IDialogService private readonly dialogService: IDialogService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IEditorService private readonly editorService: IEditorService,
		@ITextResourceConfigurationService protected readonly textResourceConfigurationService: ITextResourceConfigurationService,
		@IFilesConfigurationService protected readonly filesConfigurationService: IFilesConfigurationService
	) {
		super();

		this._models = this._register(instantiationService.createInstance(TextFileEditorModelManager));

		this.registerListeners();
	}

	//#region event handling

	private registerListeners(): void {

		// Lifecycle
		this.lifecycleService.onBeforeShutdown(event => event.veto(this.onBeforeShutdown(event.reason)));
		this.lifecycleService.onShutdown(this.dispose, this);

		// Auto save changes
		this._register(this.filesConfigurationService.onAutoSaveConfigurationChange(() => this.onAutoSaveConfigurationChange()));
	}

	private onAutoSaveConfigurationChange(): void {

		// save all dirty when enabling auto save
		if (this.filesConfigurationService.getAutoSaveMode() !== AutoSaveMode.OFF) {
			this.saveAll();
		}
	}

	protected onBeforeShutdown(reason: ShutdownReason): boolean | Promise<boolean> {

		// Dirty files need treatment on shutdown
		const dirty = this.getDirty();
		if (dirty.length) {

			// If auto save is enabled, save all files and then check again for dirty files
			// We DO NOT run any save participant if we are in the shutdown phase for performance reasons
			if (this.filesConfigurationService.getAutoSaveMode() !== AutoSaveMode.OFF) {
				return this.saveAll(false /* files only */, { skipSaveParticipants: true }).then(() => {

					// If we still have dirty files, we either have untitled ones or files that cannot be saved
					const remainingDirty = this.getDirty();
					if (remainingDirty.length) {
						return this.handleDirtyBeforeShutdown(remainingDirty, reason);
					}

					return false;
				});
			}

			// Auto save is not enabled
			return this.handleDirtyBeforeShutdown(dirty, reason);
		}

		// No dirty files: no veto
		return this.noVeto({ cleanUpBackups: true });
	}

	private handleDirtyBeforeShutdown(dirty: URI[], reason: ShutdownReason): boolean | Promise<boolean> {

		// If hot exit is enabled, backup dirty files and allow to exit without confirmation
		if (this.filesConfigurationService.isHotExitEnabled) {
			return this.backupBeforeShutdown(dirty, reason).then(didBackup => {
				if (didBackup) {
					return this.noVeto({ cleanUpBackups: false }); // no veto and no backup cleanup (since backup was successful)
				}

				// since a backup did not happen, we have to confirm for the dirty files now
				return this.confirmBeforeShutdown();
			}, error => {
				this.notificationService.error(nls.localize('files.backup.failSave', "Files that are dirty could not be written to the backup location (Error: {0}). Try saving your files first and then exit.", error.message));

				return true; // veto, the backups failed
			});
		}

		// Otherwise just confirm from the user what to do with the dirty files
		return this.confirmBeforeShutdown();
	}

	private async backupBeforeShutdown(dirtyToBackup: URI[], reason: ShutdownReason): Promise<boolean> {
		// When quit is requested skip the confirm callback and attempt to backup all workspaces.
		// When quit is not requested the confirm callback should be shown when the window being
		// closed is the only VS Code window open, except for on Mac where hot exit is only
		// ever activated when quit is requested.

		let doBackup: boolean | undefined;
		switch (reason) {
			case ShutdownReason.CLOSE:
				if (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY && this.filesConfigurationService.hotExitConfiguration === HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE) {
					doBackup = true; // backup if a folder is open and onExitAndWindowClose is configured
				} else if (await this.getWindowCount() > 1 || platform.isMacintosh) {
					doBackup = false; // do not backup if a window is closed that does not cause quitting of the application
				} else {
					doBackup = true; // backup if last window is closed on win/linux where the application quits right after
				}
				break;

			case ShutdownReason.QUIT:
				doBackup = true; // backup because next start we restore all backups
				break;

			case ShutdownReason.RELOAD:
				doBackup = true; // backup because after window reload, backups restore
				break;

			case ShutdownReason.LOAD:
				if (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY && this.filesConfigurationService.hotExitConfiguration === HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE) {
					doBackup = true; // backup if a folder is open and onExitAndWindowClose is configured
				} else {
					doBackup = false; // do not backup because we are switching contexts
				}
				break;
		}

		if (!doBackup) {
			return false;
		}

		await this.backupAll(dirtyToBackup);

		return true;
	}

	protected abstract getWindowCount(): Promise<number>;

	private backupAll(dirtyToBackup: URI[]): Promise<void> {

		// split up between files and untitled
		const filesToBackup: ITextFileEditorModel[] = [];
		const untitledToBackup: URI[] = [];
		dirtyToBackup.forEach(dirty => {
			if (this.fileService.canHandleResource(dirty)) {
				const model = this.models.get(dirty);
				if (model) {
					filesToBackup.push(model);
				}
			} else if (dirty.scheme === Schemas.untitled) {
				untitledToBackup.push(dirty);
			}
		});

		return this.doBackupAll(filesToBackup, untitledToBackup);
	}

	private async doBackupAll(dirtyFileModels: ITextFileEditorModel[], untitledResources: URI[]): Promise<void> {

		// Handle file resources first
		await Promise.all(dirtyFileModels.map(model => model.backup()));

		// Handle untitled resources
		await Promise.all(untitledResources
			.filter(untitled => this.untitledTextEditorService.exists(untitled))
			.map(async untitled => (await this.untitledTextEditorService.loadOrCreate({ resource: untitled })).backup()));
	}

	private async confirmBeforeShutdown(): Promise<boolean> {
		const confirm = await this.fileDialogService.showSaveConfirm(this.getDirty());

		// Save
		if (confirm === ConfirmResult.SAVE) {
			const result = await this.saveAll(true /* includeUntitled */, { skipSaveParticipants: true });

			if (result.results.some(r => r.error)) {
				return true; // veto if some saves failed
			}

			return this.noVeto({ cleanUpBackups: true });
		}

		// Don't Save
		else if (confirm === ConfirmResult.DONT_SAVE) {

			// Make sure to revert untitled so that they do not restore
			// see https://github.com/Microsoft/vscode/issues/29572
			this.untitledTextEditorService.revertAll();

			return this.noVeto({ cleanUpBackups: true });
		}

		// Cancel
		else if (confirm === ConfirmResult.CANCEL) {
			return true; // veto
		}

		return false;
	}

	private noVeto(options: { cleanUpBackups: boolean }): boolean | Promise<boolean> {
		if (!options.cleanUpBackups) {
			return false;
		}

		if (this.lifecycleService.phase < LifecyclePhase.Restored) {
			return false; // if editors have not restored, we are not up to speed with backups and thus should not clean them
		}

		return this.cleanupBackupsBeforeShutdown().then(() => false, () => false);
	}

	protected async cleanupBackupsBeforeShutdown(): Promise<void> {
		if (this.environmentService.isExtensionDevelopment) {
			return;
		}

		await this.backupFileService.discardAllWorkspaceBackups();
	}

	//#endregion

	//#region primitives (read, create, move, delete, update)

	async read(resource: URI, options?: IReadTextFileOptions): Promise<ITextFileContent> {
		const content = await this.fileService.readFile(resource, options);

		// in case of acceptTextOnly: true, we check the first
		// chunk for possibly being binary by looking for 0-bytes
		// we limit this check to the first 512 bytes
		this.validateBinary(content.value, options);

		return {
			...content,
			encoding: 'utf8',
			value: content.value.toString()
		};
	}

	async readStream(resource: URI, options?: IReadTextFileOptions): Promise<ITextFileStreamContent> {
		const stream = await this.fileService.readFileStream(resource, options);

		// in case of acceptTextOnly: true, we check the first
		// chunk for possibly being binary by looking for 0-bytes
		// we limit this check to the first 512 bytes
		let checkedForBinary = false;
		const throwOnBinary = (data: VSBuffer): Error | undefined => {
			if (!checkedForBinary) {
				checkedForBinary = true;

				this.validateBinary(data, options);
			}

			return undefined;
		};

		return {
			...stream,
			encoding: 'utf8',
			value: await createTextBufferFactoryFromStream(stream.value, undefined, options?.acceptTextOnly ? throwOnBinary : undefined)
		};
	}

	private validateBinary(buffer: VSBuffer, options?: IReadTextFileOptions): void {
		if (!options || !options.acceptTextOnly) {
			return; // no validation needed
		}

		// in case of acceptTextOnly: true, we check the first
		// chunk for possibly being binary by looking for 0-bytes
		// we limit this check to the first 512 bytes
		for (let i = 0; i < buffer.byteLength && i < 512; i++) {
			if (buffer.readUInt8(i) === 0) {
				throw new TextFileOperationError(nls.localize('fileBinaryError', "File seems to be binary and cannot be opened as text"), TextFileOperationResult.FILE_IS_BINARY, options);
			}
		}
	}

	async create(resource: URI, value?: string | ITextSnapshot, options?: ICreateFileOptions): Promise<IFileStatWithMetadata> {

		// before event
		await this._onWillRunOperation.fireAsync({ operation: FileOperation.CREATE, target: resource }, CancellationToken.None);

		const stat = await this.doCreate(resource, value, options);

		// If we had an existing model for the given resource, load
		// it again to make sure it is up to date with the contents
		// we just wrote into the underlying resource by calling
		// revert()
		const existingModel = this.models.get(resource);
		if (existingModel && !existingModel.isDisposed()) {
			await existingModel.revert();
		}

		// after event
		this._onDidRunOperation.fire(new FileOperationDidRunEvent(FileOperation.CREATE, resource));

		return stat;
	}

	protected doCreate(resource: URI, value?: string | ITextSnapshot, options?: ICreateFileOptions): Promise<IFileStatWithMetadata> {
		return this.fileService.createFile(resource, toBufferOrReadable(value), options);
	}

	async write(resource: URI, value: string | ITextSnapshot, options?: IWriteTextFileOptions): Promise<IFileStatWithMetadata> {
		return this.fileService.writeFile(resource, toBufferOrReadable(value), options);
	}

	async delete(resource: URI, options?: { useTrash?: boolean, recursive?: boolean }): Promise<void> {

		// before event
		await this._onWillRunOperation.fireAsync({ operation: FileOperation.DELETE, target: resource }, CancellationToken.None);

		const dirtyFiles = this.getDirty().filter(dirty => isEqualOrParent(dirty, resource));
		await this.revertAll(dirtyFiles, { soft: true });

		await this.fileService.del(resource, options);

		// after event
		this._onDidRunOperation.fire(new FileOperationDidRunEvent(FileOperation.DELETE, resource));
	}

	async move(source: URI, target: URI, overwrite?: boolean): Promise<IFileStatWithMetadata> {

		// before event
		await this._onWillRunOperation.fireAsync({ operation: FileOperation.MOVE, target, source }, CancellationToken.None);

		// find all models that related to either source or target (can be many if resource is a folder)
		const sourceModels: ITextFileEditorModel[] = [];
		const conflictingModels: ITextFileEditorModel[] = [];
		for (const model of this.getFileModels()) {
			const resource = model.resource;

			if (isEqualOrParent(resource, target, false /* do not ignorecase, see https://github.com/Microsoft/vscode/issues/56384 */)) {
				conflictingModels.push(model);
			}

			if (isEqualOrParent(resource, source)) {
				sourceModels.push(model);
			}
		}

		// remember each source model to load again after move is done
		// with optional content to restore if it was dirty
		type ModelToRestore = { resource: URI; snapshot?: ITextSnapshot };
		const modelsToRestore: ModelToRestore[] = [];
		for (const sourceModel of sourceModels) {
			const sourceModelResource = sourceModel.resource;

			// If the source is the actual model, just use target as new resource
			let modelToRestoreResource: URI;
			if (isEqual(sourceModelResource, source)) {
				modelToRestoreResource = target;
			}

			// Otherwise a parent folder of the source is being moved, so we need
			// to compute the target resource based on that
			else {
				modelToRestoreResource = joinPath(target, sourceModelResource.path.substr(source.path.length + 1));
			}

			const modelToRestore: ModelToRestore = { resource: modelToRestoreResource };
			if (sourceModel.isDirty()) {
				modelToRestore.snapshot = sourceModel.createSnapshot();
			}

			modelsToRestore.push(modelToRestore);
		}

		// in order to move, we need to soft revert all dirty models,
		// both from the source as well as the target if any
		const dirtyModels = [...sourceModels, ...conflictingModels].filter(model => model.isDirty());
		await this.revertAll(dirtyModels.map(dirtyModel => dirtyModel.resource), { soft: true });

		// now we can rename the source to target via file operation
		let stat: IFileStatWithMetadata;
		try {
			stat = await this.fileService.move(source, target, overwrite);
		} catch (error) {

			// in case of any error, ensure to set dirty flag back
			dirtyModels.forEach(dirtyModel => dirtyModel.makeDirty());

			throw error;
		}

		// finally, restore models that we had loaded previously
		await Promise.all(modelsToRestore.map(async modelToRestore => {

			// restore the model, forcing a reload. this is important because
			// we know the file has changed on disk after the move and the
			// model might have still existed with the previous state. this
			// ensures we are not tracking a stale state.
			const restoredModel = await this.models.loadOrCreate(modelToRestore.resource, { reload: { async: false } });

			// restore previous dirty content if any and ensure to mark
			// the model as dirty
			if (modelToRestore.snapshot && restoredModel.isResolved()) {
				this.modelService.updateModel(restoredModel.textEditorModel, createTextBufferFactoryFromSnapshot(modelToRestore.snapshot));

				restoredModel.makeDirty();
			}
		}));

		// after event
		this._onDidRunOperation.fire(new FileOperationDidRunEvent(FileOperation.MOVE, target, source));

		return stat;
	}

	//#endregion

	//#region save/revert

	async save(resource: URI, options?: ITextFileSaveOptions): Promise<boolean> {

		// Run a forced save if we detect the file is not dirty so that save participants can still run
		if (options?.force && this.fileService.canHandleResource(resource) && !this.isDirty(resource)) {
			const model = this._models.get(resource);
			if (model) {
				options.reason = SaveReason.EXPLICIT;

				await model.save(options);

				return !model.isDirty();
			}
		}

		return !(await this.saveAll([resource], options)).results.some(result => result.error);
	}

	saveAll(includeUntitled?: boolean, options?: ITextFileSaveOptions): Promise<ITextFileOperationResult>;
	saveAll(resources: URI[], options?: ITextFileSaveOptions): Promise<ITextFileOperationResult>;
	saveAll(arg1?: boolean | URI[], options?: ITextFileSaveOptions): Promise<ITextFileOperationResult> {

		// get all dirty
		let toSave: URI[] = [];
		if (Array.isArray(arg1)) {
			toSave = this.getDirty(arg1);
		} else {
			toSave = this.getDirty();
		}

		// split up between files and untitled
		const filesToSave: URI[] = [];
		const untitledToSave: URI[] = [];
		toSave.forEach(resourceToSave => {
			if ((Array.isArray(arg1) || arg1 === true /* includeUntitled */) && resourceToSave.scheme === Schemas.untitled) {
				untitledToSave.push(resourceToSave);
			} else {
				filesToSave.push(resourceToSave);
			}
		});

		return this.doSaveAll(filesToSave, untitledToSave, options);
	}

	private async doSaveAll(fileResources: URI[], untitledResources: URI[], options?: ITextFileSaveOptions): Promise<ITextFileOperationResult> {

		// Handle files first that can just be saved
		const result = await this.doSaveAllFiles(fileResources, options);

		// Preflight for untitled to handle cancellation from the dialog
		const targetsForUntitled: URI[] = [];
		for (const untitled of untitledResources) {
			if (this.untitledTextEditorService.exists(untitled)) {
				let targetUri: URI;

				// Untitled with associated file path don't need to prompt
				if (this.untitledTextEditorService.hasAssociatedFilePath(untitled)) {
					targetUri = toLocalResource(untitled, this.environmentService.configuration.remoteAuthority);
				}

				// Otherwise ask user
				else {
					const targetPath = await this.promptForPath(untitled, this.suggestFileName(untitled));
					if (!targetPath) {
						return { results: [...fileResources, ...untitledResources].map(r => ({ source: r })) };
					}

					targetUri = targetPath;
				}

				targetsForUntitled.push(targetUri);
			}
		}

		// Handle untitled
		await Promise.all(targetsForUntitled.map(async (target, index) => {
			const uri = await this.saveAs(untitledResources[index], target);

			result.results.push({
				source: untitledResources[index],
				target: uri,
				error: !uri // the operation was canceled or failed, so mark as error
			});
		}));

		return result;
	}

	protected async promptForPath(resource: URI, defaultUri: URI, availableFileSystems?: readonly string[]): Promise<URI | undefined> {

		// Help user to find a name for the file by opening it first
		await this.editorService.openEditor({ resource, options: { revealIfOpened: true, preserveFocus: true } });

		return this.fileDialogService.pickFileToSave(this.getSaveDialogOptions(defaultUri, availableFileSystems));
	}

	private getSaveDialogOptions(defaultUri: URI, availableFileSystems?: readonly string[]): ISaveDialogOptions {
		const options: ISaveDialogOptions = {
			defaultUri,
			title: nls.localize('saveAsTitle', "Save As"),
			availableFileSystems,
		};

		// Filters are only enabled on Windows where they work properly
		if (!platform.isWindows) {
			return options;
		}

		interface IFilter { name: string; extensions: string[]; }

		// Build the file filter by using our known languages
		const ext: string | undefined = defaultUri ? extname(defaultUri) : undefined;
		let matchingFilter: IFilter | undefined;
		const filters: IFilter[] = coalesce(this.modeService.getRegisteredLanguageNames().map(languageName => {
			const extensions = this.modeService.getExtensions(languageName);
			if (!extensions || !extensions.length) {
				return null;
			}

			const filter: IFilter = { name: languageName, extensions: extensions.slice(0, 10).map(e => trim(e, '.')) };

			if (ext && extensions.indexOf(ext) >= 0) {
				matchingFilter = filter;

				return null; // matching filter will be added last to the top
			}

			return filter;
		}));

		// Filters are a bit weird on Windows, based on having a match or not:
		// Match: we put the matching filter first so that it shows up selected and the all files last
		// No match: we put the all files filter first
		const allFilesFilter = { name: nls.localize('allFiles', "All Files"), extensions: ['*'] };
		if (matchingFilter) {
			filters.unshift(matchingFilter);
			filters.unshift(allFilesFilter);
		} else {
			filters.unshift(allFilesFilter);
		}

		// Allow to save file without extension
		filters.push({ name: nls.localize('noExt', "No Extension"), extensions: [''] });

		options.filters = filters;

		return options;
	}

	private async doSaveAllFiles(resources?: URI[], options: ITextFileSaveOptions = Object.create(null)): Promise<ITextFileOperationResult> {
		const dirtyFileModels = this.getDirtyFileModels(Array.isArray(resources) ? resources : undefined /* Save All */)
			.filter(model => {
				if ((model.hasState(ModelState.CONFLICT) || model.hasState(ModelState.ERROR)) && (options.reason === SaveReason.AUTO || options.reason === SaveReason.FOCUS_CHANGE || options.reason === SaveReason.WINDOW_CHANGE)) {
					return false; // if model is in save conflict or error, do not save unless save reason is explicit or not provided at all
				}

				return true;
			});

		const mapResourceToResult = new ResourceMap<IResult>();
		dirtyFileModels.forEach(dirtyModel => {
			mapResourceToResult.set(dirtyModel.resource, {
				source: dirtyModel.resource
			});
		});

		await Promise.all(dirtyFileModels.map(async model => {
			await model.save(options);

			// If model is still dirty, mark the resulting operation as error
			if (model.isDirty()) {
				const result = mapResourceToResult.get(model.resource);
				if (result) {
					result.error = true;
				}
			}
		}));

		return { results: mapResourceToResult.values() };
	}

	private getFileModels(arg1?: URI | URI[]): ITextFileEditorModel[] {
		if (Array.isArray(arg1)) {
			const models: ITextFileEditorModel[] = [];
			arg1.forEach(resource => {
				models.push(...this.getFileModels(resource));
			});

			return models;
		}

		return this._models.getAll(arg1);
	}

	private getDirtyFileModels(resources?: URI | URI[]): ITextFileEditorModel[] {
		return this.getFileModels(resources).filter(model => model.isDirty());
	}

	async saveAs(resource: URI, targetResource?: URI, options?: ITextFileSaveOptions): Promise<URI | undefined> {

		// Get to target resource
		if (!targetResource) {
			let dialogPath = resource;
			if (resource.scheme === Schemas.untitled) {
				dialogPath = this.suggestFileName(resource);
			}

			targetResource = await this.promptForPath(resource, dialogPath, options ? options.availableFileSystems : undefined);
		}

		if (!targetResource) {
			return; // user canceled
		}

		// Just save if target is same as models own resource
		if (resource.toString() === targetResource.toString()) {
			await this.save(resource, options);

			return resource;
		}

		// Do it
		return this.doSaveAs(resource, targetResource, options);
	}

	private async doSaveAs(resource: URI, target: URI, options?: ITextFileSaveOptions): Promise<URI> {

		// Retrieve text model from provided resource if any
		let model: ITextFileEditorModel | UntitledTextEditorModel | undefined;
		if (this.fileService.canHandleResource(resource)) {
			model = this._models.get(resource);
		} else if (resource.scheme === Schemas.untitled && this.untitledTextEditorService.exists(resource)) {
			model = await this.untitledTextEditorService.loadOrCreate({ resource });
		}

		// We have a model: Use it (can be null e.g. if this file is binary and not a text file or was never opened before)
		let result: boolean;
		if (model) {
			result = await this.doSaveTextFileAs(model, resource, target, options);
		}

		// Otherwise we can only copy
		else {
			await this.fileService.copy(resource, target);

			result = true;
		}

		// Return early if the operation was not running
		if (!result) {
			return target;
		}

		// Revert the source
		await this.revert(resource);

		return target;
	}

	private async doSaveTextFileAs(sourceModel: ITextFileEditorModel | UntitledTextEditorModel, resource: URI, target: URI, options?: ITextFileSaveOptions): Promise<boolean> {

		// Prefer an existing model if it is already loaded for the given target resource
		let targetExists: boolean = false;
		let targetModel = this.models.get(target);
		if (targetModel?.isResolved()) {
			targetExists = true;
		}

		// Otherwise create the target file empty if it does not exist already and resolve it from there
		else {
			targetExists = await this.fileService.exists(target);

			// create target model adhoc if file does not exist yet
			if (!targetExists) {
				await this.create(target, '');
			}

			targetModel = await this.models.loadOrCreate(target);
		}

		try {

			// Confirm to overwrite if we have an untitled file with associated file where
			// the file actually exists on disk and we are instructed to save to that file
			// path. This can happen if the file was created after the untitled file was opened.
			// See https://github.com/Microsoft/vscode/issues/67946
			let write: boolean;
			if (sourceModel instanceof UntitledTextEditorModel && sourceModel.hasAssociatedFilePath && targetExists && isEqual(target, toLocalResource(sourceModel.resource, this.environmentService.configuration.remoteAuthority))) {
				write = await this.confirmOverwrite(target);
			} else {
				write = true;
			}

			if (!write) {
				return false;
			}

			// take over model value, encoding and mode (only if more specific) from source model
			targetModel.updatePreferredEncoding(sourceModel.getEncoding());
			if (sourceModel.isResolved() && targetModel.isResolved()) {
				this.modelService.updateModel(targetModel.textEditorModel, createTextBufferFactoryFromSnapshot(sourceModel.createSnapshot()));

				const sourceMode = sourceModel.textEditorModel.getLanguageIdentifier();
				const targetMode = targetModel.textEditorModel.getLanguageIdentifier();
				if (sourceMode.language !== PLAINTEXT_MODE_ID && targetMode.language === PLAINTEXT_MODE_ID) {
					targetModel.textEditorModel.setMode(sourceMode); // only use if more specific than plain/text
				}
			}

			// save model
			await targetModel.save(options);

			return true;
		} catch (error) {

			// binary model: delete the file and run the operation again
			if (
				(<TextFileOperationError>error).textFileOperationResult === TextFileOperationResult.FILE_IS_BINARY ||
				(<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_TOO_LARGE
			) {
				await this.fileService.del(target);

				return this.doSaveTextFileAs(sourceModel, resource, target, options);
			}

			throw error;
		}
	}

	private async confirmOverwrite(resource: URI): Promise<boolean> {
		const confirm: IConfirmation = {
			message: nls.localize('confirmOverwrite', "'{0}' already exists. Do you want to replace it?", basename(resource)),
			detail: nls.localize('irreversible', "A file or folder with the name '{0}' already exists in the folder '{1}'. Replacing it will overwrite its current contents.", basename(resource), basename(dirname(resource))),
			primaryButton: nls.localize({ key: 'replaceButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Replace"),
			type: 'warning'
		};

		return (await this.dialogService.confirm(confirm)).confirmed;
	}

	private suggestFileName(untitledResource: URI): URI {
		const untitledFileName = this.untitledTextEditorService.suggestFileName(untitledResource);
		const remoteAuthority = this.environmentService.configuration.remoteAuthority;
		const schemeFilter = remoteAuthority ? Schemas.vscodeRemote : Schemas.file;

		const lastActiveFile = this.historyService.getLastActiveFile(schemeFilter);
		if (lastActiveFile) {
			const lastDir = dirname(lastActiveFile);
			return joinPath(lastDir, untitledFileName);
		}

		const lastActiveFolder = this.historyService.getLastActiveWorkspaceRoot(schemeFilter);
		if (lastActiveFolder) {
			return joinPath(lastActiveFolder, untitledFileName);
		}

		return untitledResource.with({ path: untitledFileName });
	}

	async revert(resource: URI, options?: IRevertOptions): Promise<boolean> {
		return !(await this.revertAll([resource], options)).results.some(result => result.error);
	}

	async revertAll(resources?: URI[], options?: IRevertOptions): Promise<ITextFileOperationResult> {

		// Revert files first
		const revertOperationResult = await this.doRevertAllFiles(resources, options);

		// Revert untitled
		const untitledReverted = this.untitledTextEditorService.revertAll(resources);
		untitledReverted.forEach(untitled => revertOperationResult.results.push({ source: untitled }));

		return revertOperationResult;
	}

	private async doRevertAllFiles(resources?: URI[], options?: IRevertOptions): Promise<ITextFileOperationResult> {
		const fileModels = options?.force ? this.getFileModels(resources) : this.getDirtyFileModels(resources);

		const mapResourceToResult = new ResourceMap<IResult>();
		fileModels.forEach(fileModel => {
			mapResourceToResult.set(fileModel.resource, {
				source: fileModel.resource
			});
		});

		await Promise.all(fileModels.map(async model => {
			try {
				await model.revert(options);

				// If model is still dirty, mark the resulting operation as error
				if (model.isDirty()) {
					const result = mapResourceToResult.get(model.resource);
					if (result) {
						result.error = true;
					}
				}
			} catch (error) {

				// FileNotFound means the file got deleted meanwhile, so ignore it
				if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
					return;
				}

				// Otherwise bubble up the error
				else {
					throw error;
				}
			}
		}));

		return { results: mapResourceToResult.values() };
	}

	getDirty(resources?: URI[]): URI[] {

		// Collect files
		const dirty = this.getDirtyFileModels(resources).map(dirtyFileModel => dirtyFileModel.resource);

		// Add untitled ones
		dirty.push(...this.untitledTextEditorService.getDirty(resources));

		return dirty;
	}

	isDirty(resource?: URI): boolean {

		// Check for dirty file
		if (this._models.getAll(resource).some(model => model.isDirty())) {
			return true;
		}

		// Check for dirty untitled
		return this.untitledTextEditorService.getDirty().some(dirty => !resource || dirty.toString() === resource.toString());
	}

	//#endregion

	dispose(): void {

		// Clear all caches
		this._models.clear();

		super.dispose();
	}
}
