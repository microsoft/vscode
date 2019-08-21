/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import * as errors from 'vs/base/common/errors';
import * as objects from 'vs/base/common/objects';
import { Event, Emitter } from 'vs/base/common/event';
import * as platform from 'vs/base/common/platform';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IResult, ITextFileOperationResult, ITextFileService, ITextFileStreamContent, IAutoSaveConfiguration, AutoSaveMode, SaveReason, ITextFileEditorModelManager, ITextFileEditorModel, ModelState, ISaveOptions, AutoSaveContext, IWillMoveEvent, ITextFileContent, IResourceEncodings, IReadTextFileOptions, IWriteTextFileOptions, toBufferOrReadable, TextFileOperationError, TextFileOperationResult } from 'vs/workbench/services/textfile/common/textfiles';
import { ConfirmResult, IRevertOptions } from 'vs/workbench/common/editor';
import { ILifecycleService, ShutdownReason, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IFileService, IFilesConfiguration, FileOperationError, FileOperationResult, AutoSaveConfiguration, HotExitConfiguration, IFileStatWithMetadata, ICreateFileOptions } from 'vs/platform/files/common/files';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { UntitledEditorModel } from 'vs/workbench/common/editor/untitledEditorModel';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';
import { IInstantiationService, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { ResourceMap } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { createTextBufferFactoryFromSnapshot, createTextBufferFactoryFromStream } from 'vs/editor/common/model/textModel';
import { IModelService } from 'vs/editor/common/services/modelService';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { isEqualOrParent, isEqual, joinPath, dirname, extname, basename, toLocalResource } from 'vs/base/common/resources';
import { getConfirmMessage, IDialogService, IFileDialogService, ISaveDialogOptions, IConfirmation } from 'vs/platform/dialogs/common/dialogs';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { coalesce } from 'vs/base/common/arrays';
import { trim } from 'vs/base/common/strings';
import { VSBuffer } from 'vs/base/common/buffer';
import { ITextSnapshot } from 'vs/editor/common/model';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { PLAINTEXT_MODE_ID } from 'vs/editor/common/modes/modesRegistry';

/**
 * The workbench file service implementation implements the raw file service spec and adds additional methods on top.
 */
export abstract class TextFileService extends Disposable implements ITextFileService {

	_serviceBrand!: ServiceIdentifier<any>;

	private readonly _onAutoSaveConfigurationChange: Emitter<IAutoSaveConfiguration> = this._register(new Emitter<IAutoSaveConfiguration>());
	readonly onAutoSaveConfigurationChange: Event<IAutoSaveConfiguration> = this._onAutoSaveConfigurationChange.event;

	private readonly _onFilesAssociationChange: Emitter<void> = this._register(new Emitter<void>());
	readonly onFilesAssociationChange: Event<void> = this._onFilesAssociationChange.event;

	private readonly _onWillMove = this._register(new Emitter<IWillMoveEvent>());
	readonly onWillMove: Event<IWillMoveEvent> = this._onWillMove.event;

	private _models: TextFileEditorModelManager;
	get models(): ITextFileEditorModelManager { return this._models; }

	abstract get encoding(): IResourceEncodings;

	private currentFilesAssociationConfig: { [key: string]: string; };
	private configuredAutoSaveDelay?: number;
	private configuredAutoSaveOnFocusChange: boolean | undefined;
	private configuredAutoSaveOnWindowChange: boolean | undefined;
	private configuredHotExit: string | undefined;
	private autoSaveContext: IContextKey<string>;

	constructor(
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IFileService protected readonly fileService: IFileService,
		@IUntitledEditorService protected readonly untitledEditorService: IUntitledEditorService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IModeService private readonly modeService: IModeService,
		@IModelService private readonly modelService: IModelService,
		@IWorkbenchEnvironmentService protected readonly environmentService: IWorkbenchEnvironmentService,
		@INotificationService private readonly notificationService: INotificationService,
		@IBackupFileService private readonly backupFileService: IBackupFileService,
		@IWindowsService private readonly windowsService: IWindowsService,
		@IHistoryService private readonly historyService: IHistoryService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IDialogService private readonly dialogService: IDialogService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IEditorService private readonly editorService: IEditorService,
		@ITextResourceConfigurationService protected readonly textResourceConfigurationService: ITextResourceConfigurationService
	) {
		super();

		this._models = this._register(instantiationService.createInstance(TextFileEditorModelManager));
		this.autoSaveContext = AutoSaveContext.bindTo(contextKeyService);

		const configuration = configurationService.getValue<IFilesConfiguration>();
		this.currentFilesAssociationConfig = configuration && configuration.files && configuration.files.associations;

		this.onFilesConfigurationChange(configuration);

		this.registerListeners();
	}

	//#region event handling

	private registerListeners(): void {

		// Lifecycle
		this.lifecycleService.onBeforeShutdown(event => event.veto(this.onBeforeShutdown(event.reason)));
		this.lifecycleService.onShutdown(this.dispose, this);

		// Files configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('files')) {
				this.onFilesConfigurationChange(this.configurationService.getValue<IFilesConfiguration>());
			}
		}));
	}

	protected onBeforeShutdown(reason: ShutdownReason): boolean | Promise<boolean> {

		// Dirty files need treatment on shutdown
		const dirty = this.getDirty();
		if (dirty.length) {

			// If auto save is enabled, save all files and then check again for dirty files
			// We DO NOT run any save participant if we are in the shutdown phase for performance reasons
			if (this.getAutoSaveMode() !== AutoSaveMode.OFF) {
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
		if (this.isHotExitEnabled) {
			return this.backupBeforeShutdown(dirty, reason).then(didBackup => {
				if (didBackup) {
					return this.noVeto({ cleanUpBackups: false }); // no veto and no backup cleanup (since backup was successful)
				}

				// since a backup did not happen, we have to confirm for the dirty files now
				return this.confirmBeforeShutdown();
			}, errors => {
				const firstError = errors[0];
				this.notificationService.error(nls.localize('files.backup.failSave', "Files that are dirty could not be written to the backup location (Error: {0}). Try saving your files first and then exit.", firstError.message));

				return true; // veto, the backups failed
			});
		}

		// Otherwise just confirm from the user what to do with the dirty files
		return this.confirmBeforeShutdown();
	}

	private async backupBeforeShutdown(dirtyToBackup: URI[], reason: ShutdownReason): Promise<boolean> {
		const windowCount = await this.windowsService.getWindowCount();

		// When quit is requested skip the confirm callback and attempt to backup all workspaces.
		// When quit is not requested the confirm callback should be shown when the window being
		// closed is the only VS Code window open, except for on Mac where hot exit is only
		// ever activated when quit is requested.

		let doBackup: boolean | undefined;
		switch (reason) {
			case ShutdownReason.CLOSE:
				if (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY && this.configuredHotExit === HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE) {
					doBackup = true; // backup if a folder is open and onExitAndWindowClose is configured
				} else if (windowCount > 1 || platform.isMacintosh) {
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
				if (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY && this.configuredHotExit === HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE) {
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
			.filter(untitled => this.untitledEditorService.exists(untitled))
			.map(async untitled => (await this.untitledEditorService.loadOrCreate({ resource: untitled })).backup()));
	}

	private async confirmBeforeShutdown(): Promise<boolean> {
		const confirm = await this.confirmSave();

		// Save
		if (confirm === ConfirmResult.SAVE) {
			const result = await this.saveAll(true /* includeUntitled */, { skipSaveParticipants: true });

			if (result.results.some(r => !r.success)) {
				return true; // veto if some saves failed
			}

			return this.noVeto({ cleanUpBackups: true });
		}

		// Don't Save
		else if (confirm === ConfirmResult.DONT_SAVE) {

			// Make sure to revert untitled so that they do not restore
			// see https://github.com/Microsoft/vscode/issues/29572
			this.untitledEditorService.revertAll();

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

	protected onFilesConfigurationChange(configuration: IFilesConfiguration): void {
		const wasAutoSaveEnabled = (this.getAutoSaveMode() !== AutoSaveMode.OFF);

		const autoSaveMode = (configuration && configuration.files && configuration.files.autoSave) || AutoSaveConfiguration.OFF;
		this.autoSaveContext.set(autoSaveMode);
		switch (autoSaveMode) {
			case AutoSaveConfiguration.AFTER_DELAY:
				this.configuredAutoSaveDelay = configuration && configuration.files && configuration.files.autoSaveDelay;
				this.configuredAutoSaveOnFocusChange = false;
				this.configuredAutoSaveOnWindowChange = false;
				break;

			case AutoSaveConfiguration.ON_FOCUS_CHANGE:
				this.configuredAutoSaveDelay = undefined;
				this.configuredAutoSaveOnFocusChange = true;
				this.configuredAutoSaveOnWindowChange = false;
				break;

			case AutoSaveConfiguration.ON_WINDOW_CHANGE:
				this.configuredAutoSaveDelay = undefined;
				this.configuredAutoSaveOnFocusChange = false;
				this.configuredAutoSaveOnWindowChange = true;
				break;

			default:
				this.configuredAutoSaveDelay = undefined;
				this.configuredAutoSaveOnFocusChange = false;
				this.configuredAutoSaveOnWindowChange = false;
				break;
		}

		// Emit as event
		this._onAutoSaveConfigurationChange.fire(this.getAutoSaveConfiguration());

		// save all dirty when enabling auto save
		if (!wasAutoSaveEnabled && this.getAutoSaveMode() !== AutoSaveMode.OFF) {
			this.saveAll();
		}

		// Check for change in files associations
		const filesAssociation = configuration && configuration.files && configuration.files.associations;
		if (!objects.equals(this.currentFilesAssociationConfig, filesAssociation)) {
			this.currentFilesAssociationConfig = filesAssociation;
			this._onFilesAssociationChange.fire();
		}

		// Hot exit
		const hotExitMode = configuration && configuration.files && configuration.files.hotExit;
		if (hotExitMode === HotExitConfiguration.OFF || hotExitMode === HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE) {
			this.configuredHotExit = hotExitMode;
		} else {
			this.configuredHotExit = HotExitConfiguration.ON_EXIT;
		}
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
			value: await createTextBufferFactoryFromStream(stream.value, undefined, options && options.acceptTextOnly ? throwOnBinary : undefined)
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
		const stat = await this.doCreate(resource, value, options);

		// If we had an existing model for the given resource, load
		// it again to make sure it is up to date with the contents
		// we just wrote into the underlying resource by calling
		// revert()
		const existingModel = this.models.get(resource);
		if (existingModel && !existingModel.isDisposed()) {
			await existingModel.revert();
		}

		return stat;
	}

	protected doCreate(resource: URI, value?: string | ITextSnapshot, options?: ICreateFileOptions): Promise<IFileStatWithMetadata> {
		return this.fileService.createFile(resource, toBufferOrReadable(value), options);
	}

	async write(resource: URI, value: string | ITextSnapshot, options?: IWriteTextFileOptions): Promise<IFileStatWithMetadata> {
		return this.fileService.writeFile(resource, toBufferOrReadable(value), options);
	}

	async delete(resource: URI, options?: { useTrash?: boolean, recursive?: boolean }): Promise<void> {
		const dirtyFiles = this.getDirty().filter(dirty => isEqualOrParent(dirty, resource));

		await this.revertAll(dirtyFiles, { soft: true });

		return this.fileService.del(resource, options);
	}

	async move(source: URI, target: URI, overwrite?: boolean): Promise<IFileStatWithMetadata> {

		// await onWillMove event joiners
		await this.notifyOnWillMove(source, target);

		// find all models that related to either source or target (can be many if resource is a folder)
		const sourceModels: ITextFileEditorModel[] = [];
		const conflictingModels: ITextFileEditorModel[] = [];
		for (const model of this.getFileModels()) {
			const resource = model.getResource();

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
			const sourceModelResource = sourceModel.getResource();

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
		await this.revertAll(dirtyModels.map(dirtyModel => dirtyModel.getResource()), { soft: true });

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

		return stat;
	}

	private async notifyOnWillMove(source: URI, target: URI): Promise<void> {
		const waitForPromises: Promise<unknown>[] = [];

		// fire event
		this._onWillMove.fire({
			oldResource: source,
			newResource: target,
			waitUntil(promise: Promise<unknown>) {
				waitForPromises.push(promise.then(undefined, errors.onUnexpectedError));
			}
		});

		// prevent async waitUntil-calls
		Object.freeze(waitForPromises);

		await Promise.all(waitForPromises);
	}

	//#endregion

	//#region save/revert

	async save(resource: URI, options?: ISaveOptions): Promise<boolean> {

		// Run a forced save if we detect the file is not dirty so that save participants can still run
		if (options && options.force && this.fileService.canHandleResource(resource) && !this.isDirty(resource)) {
			const model = this._models.get(resource);
			if (model) {
				options.reason = SaveReason.EXPLICIT;

				await model.save(options);

				return !model.isDirty();
			}
		}

		const result = await this.saveAll([resource], options);

		return result.results.length === 1 && !!result.results[0].success;
	}

	async confirmSave(resources?: URI[]): Promise<ConfirmResult> {
		if (this.environmentService.isExtensionDevelopment) {
			if (!this.environmentService.args['extension-development-confirm-save']) {
				return ConfirmResult.DONT_SAVE; // no veto when we are in extension dev mode because we cannot assume we run interactive (e.g. tests)
			}
		}

		const resourcesToConfirm = this.getDirty(resources);
		if (resourcesToConfirm.length === 0) {
			return ConfirmResult.DONT_SAVE;
		}

		const message = resourcesToConfirm.length === 1 ? nls.localize('saveChangesMessage', "Do you want to save the changes you made to {0}?", basename(resourcesToConfirm[0]))
			: getConfirmMessage(nls.localize('saveChangesMessages', "Do you want to save the changes to the following {0} files?", resourcesToConfirm.length), resourcesToConfirm);

		const buttons: string[] = [
			resourcesToConfirm.length > 1 ? nls.localize({ key: 'saveAll', comment: ['&& denotes a mnemonic'] }, "&&Save All") : nls.localize({ key: 'save', comment: ['&& denotes a mnemonic'] }, "&&Save"),
			nls.localize({ key: 'dontSave', comment: ['&& denotes a mnemonic'] }, "Do&&n't Save"),
			nls.localize('cancel', "Cancel")
		];

		const index = await this.dialogService.show(Severity.Warning, message, buttons, {
			cancelId: 2,
			detail: nls.localize('saveChangesDetail', "Your changes will be lost if you don't save them.")
		});

		switch (index) {
			case 0: return ConfirmResult.SAVE;
			case 1: return ConfirmResult.DONT_SAVE;
			default: return ConfirmResult.CANCEL;
		}
	}

	async confirmOverwrite(resource: URI): Promise<boolean> {
		const confirm: IConfirmation = {
			message: nls.localize('confirmOverwrite', "'{0}' already exists. Do you want to replace it?", basename(resource)),
			detail: nls.localize('irreversible', "A file or folder with the same name already exists in the folder {0}. Replacing it will overwrite its current contents.", basename(dirname(resource))),
			primaryButton: nls.localize({ key: 'replaceButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Replace"),
			type: 'warning'
		};

		return (await this.dialogService.confirm(confirm)).confirmed;
	}

	saveAll(includeUntitled?: boolean, options?: ISaveOptions): Promise<ITextFileOperationResult>;
	saveAll(resources: URI[], options?: ISaveOptions): Promise<ITextFileOperationResult>;
	saveAll(arg1?: boolean | URI[], options?: ISaveOptions): Promise<ITextFileOperationResult> {

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

	private async doSaveAll(fileResources: URI[], untitledResources: URI[], options?: ISaveOptions): Promise<ITextFileOperationResult> {

		// Handle files first that can just be saved
		const result = await this.doSaveAllFiles(fileResources, options);

		// Preflight for untitled to handle cancellation from the dialog
		const targetsForUntitled: URI[] = [];
		for (const untitled of untitledResources) {
			if (this.untitledEditorService.exists(untitled)) {
				let targetUri: URI;

				// Untitled with associated file path don't need to prompt
				if (this.untitledEditorService.hasAssociatedFilePath(untitled)) {
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
				success: !!uri
			});
		}));

		return result;
	}

	protected async promptForPath(resource: URI, defaultUri: URI, availableFileSystems?: string[]): Promise<URI | undefined> {

		// Help user to find a name for the file by opening it first
		await this.editorService.openEditor({ resource, options: { revealIfOpened: true, preserveFocus: true, } });

		return this.fileDialogService.pickFileToSave(this.getSaveDialogOptions(defaultUri, availableFileSystems));
	}

	private getSaveDialogOptions(defaultUri: URI, availableFileSystems?: string[]): ISaveDialogOptions {
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

	private async doSaveAllFiles(resources?: URI[], options: ISaveOptions = Object.create(null)): Promise<ITextFileOperationResult> {
		const dirtyFileModels = this.getDirtyFileModels(Array.isArray(resources) ? resources : undefined /* Save All */)
			.filter(model => {
				if ((model.hasState(ModelState.CONFLICT) || model.hasState(ModelState.ERROR)) && (options.reason === SaveReason.AUTO || options.reason === SaveReason.FOCUS_CHANGE || options.reason === SaveReason.WINDOW_CHANGE)) {
					return false; // if model is in save conflict or error, do not save unless save reason is explicit or not provided at all
				}

				return true;
			});

		const mapResourceToResult = new ResourceMap<IResult>();
		dirtyFileModels.forEach(m => {
			mapResourceToResult.set(m.getResource(), {
				source: m.getResource()
			});
		});

		await Promise.all(dirtyFileModels.map(async model => {
			await model.save(options);

			if (!model.isDirty()) {
				const result = mapResourceToResult.get(model.getResource());
				if (result) {
					result.success = true;
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

	async saveAs(resource: URI, targetResource?: URI, options?: ISaveOptions): Promise<URI | undefined> {

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

	private async doSaveAs(resource: URI, target: URI, options?: ISaveOptions): Promise<URI> {

		// Retrieve text model from provided resource if any
		let model: ITextFileEditorModel | UntitledEditorModel | undefined;
		if (this.fileService.canHandleResource(resource)) {
			model = this._models.get(resource);
		} else if (resource.scheme === Schemas.untitled && this.untitledEditorService.exists(resource)) {
			model = await this.untitledEditorService.loadOrCreate({ resource });
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

	private async doSaveTextFileAs(sourceModel: ITextFileEditorModel | UntitledEditorModel, resource: URI, target: URI, options?: ISaveOptions): Promise<boolean> {

		// Prefer an existing model if it is already loaded for the given target resource
		let targetExists: boolean = false;
		let targetModel = this.models.get(target);
		if (targetModel && targetModel.isResolved()) {
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
			if (sourceModel instanceof UntitledEditorModel && sourceModel.hasAssociatedFilePath && targetExists && isEqual(target, toLocalResource(sourceModel.getResource(), this.environmentService.configuration.remoteAuthority))) {
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

	private suggestFileName(untitledResource: URI): URI {
		const untitledFileName = this.untitledEditorService.suggestFileName(untitledResource);
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
		const result = await this.revertAll([resource], options);

		return result.results.length === 1 && !!result.results[0].success;
	}

	async revertAll(resources?: URI[], options?: IRevertOptions): Promise<ITextFileOperationResult> {

		// Revert files first
		const revertOperationResult = await this.doRevertAllFiles(resources, options);

		// Revert untitled
		const untitledReverted = this.untitledEditorService.revertAll(resources);
		untitledReverted.forEach(untitled => revertOperationResult.results.push({ source: untitled, success: true }));

		return revertOperationResult;
	}

	private async doRevertAllFiles(resources?: URI[], options?: IRevertOptions): Promise<ITextFileOperationResult> {
		const fileModels = options && options.force ? this.getFileModels(resources) : this.getDirtyFileModels(resources);

		const mapResourceToResult = new ResourceMap<IResult>();
		fileModels.forEach(m => {
			mapResourceToResult.set(m.getResource(), {
				source: m.getResource()
			});
		});

		await Promise.all(fileModels.map(async model => {
			try {
				await model.revert(options && options.soft);

				if (!model.isDirty()) {
					const result = mapResourceToResult.get(model.getResource());
					if (result) {
						result.success = true;
					}
				}
			} catch (error) {

				// FileNotFound means the file got deleted meanwhile, so still record as successful revert
				if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
					const result = mapResourceToResult.get(model.getResource());
					if (result) {
						result.success = true;
					}
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
		const dirty = this.getDirtyFileModels(resources).map(m => m.getResource());

		// Add untitled ones
		dirty.push(...this.untitledEditorService.getDirty(resources));

		return dirty;
	}

	isDirty(resource?: URI): boolean {

		// Check for dirty file
		if (this._models.getAll(resource).some(model => model.isDirty())) {
			return true;
		}

		// Check for dirty untitled
		return this.untitledEditorService.getDirty().some(dirty => !resource || dirty.toString() === resource.toString());
	}

	//#endregion

	//#region config

	getAutoSaveMode(): AutoSaveMode {
		if (this.configuredAutoSaveOnFocusChange) {
			return AutoSaveMode.ON_FOCUS_CHANGE;
		}

		if (this.configuredAutoSaveOnWindowChange) {
			return AutoSaveMode.ON_WINDOW_CHANGE;
		}

		if (this.configuredAutoSaveDelay && this.configuredAutoSaveDelay > 0) {
			return this.configuredAutoSaveDelay <= 1000 ? AutoSaveMode.AFTER_SHORT_DELAY : AutoSaveMode.AFTER_LONG_DELAY;
		}

		return AutoSaveMode.OFF;
	}

	getAutoSaveConfiguration(): IAutoSaveConfiguration {
		return {
			autoSaveDelay: this.configuredAutoSaveDelay && this.configuredAutoSaveDelay > 0 ? this.configuredAutoSaveDelay : undefined,
			autoSaveFocusChange: !!this.configuredAutoSaveOnFocusChange,
			autoSaveApplicationChange: !!this.configuredAutoSaveOnWindowChange
		};
	}

	get isHotExitEnabled(): boolean {
		return !this.environmentService.isExtensionDevelopment && this.configuredHotExit !== HotExitConfiguration.OFF;
	}

	//#endregion

	dispose(): void {

		// Clear all caches
		this._models.clear();

		super.dispose();
	}
}
