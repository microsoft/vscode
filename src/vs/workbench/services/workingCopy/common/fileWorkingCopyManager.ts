/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Promises } from '../../../../base/common/async.js';
import { VSBufferReadableStream } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { toLocalResource, joinPath, isEqual, basename, dirname } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileDialogService, IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ISaveOptions, SaveSourceRegistry } from '../../../common/editor.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IPathService } from '../../path/common/pathService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IStoredFileWorkingCopy, IStoredFileWorkingCopyModel, IStoredFileWorkingCopyModelFactory, IStoredFileWorkingCopyResolveOptions, StoredFileWorkingCopyState } from './storedFileWorkingCopy.js';
import { StoredFileWorkingCopyManager, IStoredFileWorkingCopyManager, IStoredFileWorkingCopyManagerResolveOptions } from './storedFileWorkingCopyManager.js';
import { IUntitledFileWorkingCopy, IUntitledFileWorkingCopyModel, IUntitledFileWorkingCopyModelFactory, UntitledFileWorkingCopy } from './untitledFileWorkingCopy.js';
import { INewOrExistingUntitledFileWorkingCopyOptions, INewUntitledFileWorkingCopyOptions, INewUntitledFileWorkingCopyWithAssociatedResourceOptions, IUntitledFileWorkingCopyManager, UntitledFileWorkingCopyManager } from './untitledFileWorkingCopyManager.js';
import { IWorkingCopyFileService } from './workingCopyFileService.js';
import { IBaseFileWorkingCopyManager } from './abstractFileWorkingCopyManager.js';
import { IFileWorkingCopy, SnapshotContext } from './fileWorkingCopy.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IElevatedFileService } from '../../files/common/elevatedFileService.js';
import { IFilesConfigurationService } from '../../filesConfiguration/common/filesConfigurationService.js';
import { ILifecycleService } from '../../lifecycle/common/lifecycle.js';
import { IWorkingCopyBackupService } from './workingCopyBackup.js';
import { IWorkingCopyEditorService } from './workingCopyEditorService.js';
import { IWorkingCopyService } from './workingCopyService.js';
import { Schemas } from '../../../../base/common/network.js';
import { IDecorationData, IDecorationsProvider, IDecorationsService } from '../../decorations/common/decorations.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { listErrorForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';

export interface IFileWorkingCopyManager<S extends IStoredFileWorkingCopyModel, U extends IUntitledFileWorkingCopyModel> extends IBaseFileWorkingCopyManager<S | U, IFileWorkingCopy<S | U>> {

	/**
	 * Provides access to the manager for stored file working copies.
	 */
	readonly stored: IStoredFileWorkingCopyManager<S>;

	/**
	 * Provides access to the manager for untitled file working copies.
	 */
	readonly untitled: IUntitledFileWorkingCopyManager<U>;

	/**
	 * Allows to resolve a stored file working copy. If the manager already knows
	 * about a stored file working copy with the same `URI`, it will return that
	 * existing stored file working copy. There will never be more than one
	 * stored file working copy per `URI` until the stored file working copy is
	 * disposed.
	 *
	 * Use the `IStoredFileWorkingCopyResolveOptions.reload` option to control the
	 * behaviour for when a stored file working copy was previously already resolved
	 * with regards to resolving it again from the underlying file resource
	 * or not.
	 *
	 * Note: Callers must `dispose` the working copy when no longer needed.
	 *
	 * @param resource used as unique identifier of the stored file working copy in
	 * case one is already known for this `URI`.
	 * @param options
	 */
	resolve(resource: URI, options?: IStoredFileWorkingCopyManagerResolveOptions): Promise<IStoredFileWorkingCopy<S>>;

	/**
	 * Create a new untitled file working copy with optional initial contents.
	 *
	 * Note: Callers must `dispose` the working copy when no longer needed.
	 */
	resolve(options?: INewUntitledFileWorkingCopyOptions): Promise<IUntitledFileWorkingCopy<U>>;

	/**
	 * Create a new untitled file working copy with optional initial contents
	 * and associated resource. The associated resource will be used when
	 * saving and will not require to ask the user for a file path.
	 *
	 * Note: Callers must `dispose` the working copy when no longer needed.
	 */
	resolve(options?: INewUntitledFileWorkingCopyWithAssociatedResourceOptions): Promise<IUntitledFileWorkingCopy<U>>;

	/**
	 * Creates a new untitled file working copy with optional initial contents
	 * with the provided resource or return an existing untitled file working
	 * copy otherwise.
	 *
	 * Note: Callers must `dispose` the working copy when no longer needed.
	 */
	resolve(options?: INewOrExistingUntitledFileWorkingCopyOptions): Promise<IUntitledFileWorkingCopy<U>>;

	/**
	 * Implements "Save As" for file based working copies. The API is `URI` based
	 * because it works even without resolved file working copies. If a file working
	 * copy exists for any given `URI`, the implementation will deal with them properly
	 * (e.g. dirty contents of the source will be written to the target and the source
	 * will be reverted).
	 *
	 * Note: it is possible that the returned file working copy has a different `URI`
	 * than the `target` that was passed in. Based on URI identity, the file working
	 * copy may chose to return an existing file working copy with different casing
	 * to respect file systems that are case insensitive.
	 *
	 * Note: Callers must `dispose` the working copy when no longer needed.
	 *
	 * Note: Untitled file working copies are being disposed when saved.
	 *
	 * @param source the source resource to save as
	 * @param target the optional target resource to save to. if not defined, the user
	 * will be asked for input
	 * @returns the target stored working copy that was saved to or `undefined` in case of
	 * cancellation
	 */
	saveAs(source: URI, target: URI, options?: ISaveOptions): Promise<IStoredFileWorkingCopy<S> | undefined>;
	saveAs(source: URI, target: undefined, options?: IFileWorkingCopySaveAsOptions): Promise<IStoredFileWorkingCopy<S> | undefined>;
}

export interface IFileWorkingCopySaveAsOptions extends ISaveOptions {

	/**
	 * Optional target resource to suggest to the user in case
	 * no target resource is provided to save to.
	 */
	suggestedTarget?: URI;
}

export class FileWorkingCopyManager<S extends IStoredFileWorkingCopyModel, U extends IUntitledFileWorkingCopyModel> extends Disposable implements IFileWorkingCopyManager<S, U> {

	readonly onDidCreate: Event<IFileWorkingCopy<S | U>>;

	private static readonly FILE_WORKING_COPY_SAVE_CREATE_SOURCE = SaveSourceRegistry.registerSource('fileWorkingCopyCreate.source', localize('fileWorkingCopyCreate.source', "File Created"));
	private static readonly FILE_WORKING_COPY_SAVE_REPLACE_SOURCE = SaveSourceRegistry.registerSource('fileWorkingCopyReplace.source', localize('fileWorkingCopyReplace.source', "File Replaced"));

	readonly stored: IStoredFileWorkingCopyManager<S>;
	readonly untitled: IUntitledFileWorkingCopyManager<U>;

	constructor(
		private readonly workingCopyTypeId: string,
		private readonly storedWorkingCopyModelFactory: IStoredFileWorkingCopyModelFactory<S>,
		private readonly untitledWorkingCopyModelFactory: IUntitledFileWorkingCopyModelFactory<U>,
		@IFileService private readonly fileService: IFileService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@ILabelService labelService: ILabelService,
		@ILogService private readonly logService: ILogService,
		@IWorkingCopyFileService private readonly workingCopyFileService: IWorkingCopyFileService,
		@IWorkingCopyBackupService workingCopyBackupService: IWorkingCopyBackupService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@IWorkingCopyService workingCopyService: IWorkingCopyService,
		@INotificationService notificationService: INotificationService,
		@IWorkingCopyEditorService workingCopyEditorService: IWorkingCopyEditorService,
		@IEditorService editorService: IEditorService,
		@IElevatedFileService elevatedFileService: IElevatedFileService,
		@IPathService private readonly pathService: IPathService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IDialogService private readonly dialogService: IDialogService,
		@IDecorationsService private readonly decorationsService: IDecorationsService,
		@IProgressService progressService: IProgressService
	) {
		super();

		// Stored file working copies manager
		this.stored = this._register(new StoredFileWorkingCopyManager(
			this.workingCopyTypeId,
			this.storedWorkingCopyModelFactory,
			fileService, lifecycleService, labelService, logService, workingCopyFileService,
			workingCopyBackupService, uriIdentityService, filesConfigurationService, workingCopyService,
			notificationService, workingCopyEditorService, editorService, elevatedFileService, progressService
		));

		// Untitled file working copies manager
		this.untitled = this._register(new UntitledFileWorkingCopyManager(
			this.workingCopyTypeId,
			this.untitledWorkingCopyModelFactory,
			async (workingCopy, options) => {
				const result = await this.saveAs(workingCopy.resource, undefined, options);

				return result ? true : false;
			},
			fileService, labelService, logService, workingCopyBackupService, workingCopyService
		));

		// Events
		this.onDidCreate = Event.any<IFileWorkingCopy<S | U>>(this.stored.onDidCreate, this.untitled.onDidCreate);

		// Decorations
		this.provideDecorations();
	}

	//#region decorations

	private provideDecorations(): void {

		// File working copy decorations
		const provider = this._register(new class extends Disposable implements IDecorationsProvider {

			readonly label = localize('fileWorkingCopyDecorations', "File Working Copy Decorations");

			private readonly _onDidChange = this._register(new Emitter<URI[]>());
			readonly onDidChange = this._onDidChange.event;

			constructor(private readonly stored: IStoredFileWorkingCopyManager<S>) {
				super();

				this.registerListeners();
			}

			private registerListeners(): void {

				// Creates
				this._register(this.stored.onDidResolve(workingCopy => {
					if (workingCopy.isReadonly() || workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN)) {
						this._onDidChange.fire([workingCopy.resource]);
					}
				}));

				// Removals: once a stored working copy is no longer
				// under our control, make sure to signal this as
				// decoration change because from this point on we
				// have no way of updating the decoration anymore.
				this._register(this.stored.onDidRemove(workingCopyUri => this._onDidChange.fire([workingCopyUri])));

				// Changes
				this._register(this.stored.onDidChangeReadonly(workingCopy => this._onDidChange.fire([workingCopy.resource])));
				this._register(this.stored.onDidChangeOrphaned(workingCopy => this._onDidChange.fire([workingCopy.resource])));
			}

			provideDecorations(uri: URI): IDecorationData | undefined {
				const workingCopy = this.stored.get(uri);
				if (!workingCopy || workingCopy.isDisposed()) {
					return undefined;
				}

				const isReadonly = workingCopy.isReadonly();
				const isOrphaned = workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN);

				// Readonly + Orphaned
				if (isReadonly && isOrphaned) {
					return {
						color: listErrorForeground,
						letter: Codicon.lockSmall,
						strikethrough: true,
						tooltip: localize('readonlyAndDeleted', "Deleted, Read-only"),
					};
				}

				// Readonly
				else if (isReadonly) {
					return {
						letter: Codicon.lockSmall,
						tooltip: localize('readonly', "Read-only"),
					};
				}

				// Orphaned
				else if (isOrphaned) {
					return {
						color: listErrorForeground,
						strikethrough: true,
						tooltip: localize('deleted', "Deleted"),
					};
				}

				return undefined;
			}
		}(this.stored));

		this._register(this.decorationsService.registerDecorationsProvider(provider));
	}

	//#endregion

	//#region get / get all

	get workingCopies(): (IUntitledFileWorkingCopy<U> | IStoredFileWorkingCopy<S>)[] {
		return [...this.stored.workingCopies, ...this.untitled.workingCopies];
	}

	get(resource: URI): IUntitledFileWorkingCopy<U> | IStoredFileWorkingCopy<S> | undefined {
		return this.stored.get(resource) ?? this.untitled.get(resource);
	}

	//#endregion

	//#region resolve

	resolve(options?: INewUntitledFileWorkingCopyOptions): Promise<IUntitledFileWorkingCopy<U>>;
	resolve(options?: INewUntitledFileWorkingCopyWithAssociatedResourceOptions): Promise<IUntitledFileWorkingCopy<U>>;
	resolve(options?: INewOrExistingUntitledFileWorkingCopyOptions): Promise<IUntitledFileWorkingCopy<U>>;
	resolve(resource: URI, options?: IStoredFileWorkingCopyResolveOptions): Promise<IStoredFileWorkingCopy<S>>;
	resolve(arg1?: URI | INewUntitledFileWorkingCopyOptions | INewUntitledFileWorkingCopyWithAssociatedResourceOptions | INewOrExistingUntitledFileWorkingCopyOptions, arg2?: IStoredFileWorkingCopyResolveOptions): Promise<IUntitledFileWorkingCopy<U> | IStoredFileWorkingCopy<S>> {
		if (URI.isUri(arg1)) {

			// Untitled: via untitled manager
			if (arg1.scheme === Schemas.untitled) {
				return this.untitled.resolve({ untitledResource: arg1 });
			}

			// else: via stored file manager
			else {
				return this.stored.resolve(arg1, arg2);
			}
		}

		return this.untitled.resolve(arg1);
	}

	//#endregion

	//#region Save

	async saveAs(source: URI, target?: URI, options?: IFileWorkingCopySaveAsOptions): Promise<IStoredFileWorkingCopy<S> | undefined> {

		// Get to target resource
		if (!target) {
			const workingCopy = this.get(source);
			if (workingCopy instanceof UntitledFileWorkingCopy && workingCopy.hasAssociatedFilePath) {
				target = await this.suggestSavePath(source);
			} else {
				target = await this.fileDialogService.pickFileToSave(await this.suggestSavePath(options?.suggestedTarget ?? source), options?.availableFileSystems);
			}
		}

		if (!target) {
			return; // user canceled
		}

		// Ensure target is not marked as readonly and prompt otherwise
		if (this.filesConfigurationService.isReadonly(target)) {
			const confirmed = await this.confirmMakeWriteable(target);
			if (!confirmed) {
				return;
			} else {
				this.filesConfigurationService.updateReadonly(target, false);
			}
		}

		// Just save if target is same as working copies own resource
		// and we are not saving an untitled file working copy
		if (this.fileService.hasProvider(source) && isEqual(source, target)) {
			return this.doSave(source, { ...options, force: true  /* force to save, even if not dirty (https://github.com/microsoft/vscode/issues/99619) */ });
		}

		// If the target is different but of same identity, we
		// move the source to the target, knowing that the
		// underlying file system cannot have both and then save.
		// However, this will only work if the source exists
		// and is not orphaned, so we need to check that too.
		if (this.fileService.hasProvider(source) && this.uriIdentityService.extUri.isEqual(source, target) && (await this.fileService.exists(source))) {

			// Move via working copy file service to enable participants
			await this.workingCopyFileService.move([{ file: { source, target } }], CancellationToken.None);

			// At this point we don't know whether we have a
			// working copy for the source or the target URI so we
			// simply try to save with both resources.
			return (await this.doSave(source, options)) ?? (await this.doSave(target, options));
		}

		// Perform normal "Save As"
		return this.doSaveAs(source, target, options);
	}

	private async doSave(resource: URI, options?: ISaveOptions): Promise<IStoredFileWorkingCopy<S> | undefined> {

		// Save is only possible with stored file working copies,
		// any other have to go via `saveAs` flow.
		const storedFileWorkingCopy = this.stored.get(resource);
		if (storedFileWorkingCopy) {
			const success = await storedFileWorkingCopy.save(options);
			if (success) {
				return storedFileWorkingCopy;
			}
		}

		return undefined;
	}

	private async doSaveAs(source: URI, target: URI, options?: IFileWorkingCopySaveAsOptions): Promise<IStoredFileWorkingCopy<S> | undefined> {
		let sourceContents: VSBufferReadableStream;

		// If the source is an existing file working copy, we can directly
		// use that to copy the contents to the target destination
		const sourceWorkingCopy = this.get(source);
		if (sourceWorkingCopy?.isResolved()) {
			sourceContents = await sourceWorkingCopy.model.snapshot(SnapshotContext.Save, CancellationToken.None);
		}

		// Otherwise we resolve the contents from the underlying file
		else {
			sourceContents = (await this.fileService.readFileStream(source)).value;
		}

		// Resolve target
		const { targetFileExists, targetStoredFileWorkingCopy } = await this.doResolveSaveTarget(source, target);

		// Confirm to overwrite if we have an untitled file working copy with associated path where
		// the file actually exists on disk and we are instructed to save to that file path.
		// This can happen if the file was created after the untitled file was opened.
		// See https://github.com/microsoft/vscode/issues/67946
		if (
			sourceWorkingCopy instanceof UntitledFileWorkingCopy &&
			sourceWorkingCopy.hasAssociatedFilePath &&
			targetFileExists &&
			this.uriIdentityService.extUri.isEqual(target, toLocalResource(sourceWorkingCopy.resource, this.environmentService.remoteAuthority, this.pathService.defaultUriScheme))
		) {
			const overwrite = await this.confirmOverwrite(target);
			if (!overwrite) {
				return undefined;
			}
		}

		// Take over content from source to target
		await targetStoredFileWorkingCopy.model?.update(sourceContents, CancellationToken.None);

		// Set source options depending on target exists or not
		if (!options?.source) {
			options = {
				...options,
				source: targetFileExists ? FileWorkingCopyManager.FILE_WORKING_COPY_SAVE_REPLACE_SOURCE : FileWorkingCopyManager.FILE_WORKING_COPY_SAVE_CREATE_SOURCE
			};
		}

		// Save target
		const success = await targetStoredFileWorkingCopy.save({
			...options,
			from: source,
			force: true  /* force to save, even if not dirty (https://github.com/microsoft/vscode/issues/99619) */
		});
		if (!success) {
			return undefined;
		}

		// Revert the source
		try {
			await sourceWorkingCopy?.revert();
		} catch (error) {

			// It is possible that reverting the source fails, for example
			// when a remote is disconnected and we cannot read it anymore.
			// However, this should not interrupt the "Save As" flow, so
			// we gracefully catch the error and just log it.

			this.logService.error(error);
		}

		// Events
		if (source.scheme === Schemas.untitled) {
			this.untitled.notifyDidSave(source, target);
		}

		return targetStoredFileWorkingCopy;
	}

	private async doResolveSaveTarget(source: URI, target: URI): Promise<{ targetFileExists: boolean; targetStoredFileWorkingCopy: IStoredFileWorkingCopy<S> }> {

		// Prefer an existing stored file working copy if it is already resolved
		// for the given target resource
		let targetFileExists = false;
		let targetStoredFileWorkingCopy = this.stored.get(target);
		if (targetStoredFileWorkingCopy?.isResolved()) {
			targetFileExists = true;
		}

		// Otherwise create the target working copy empty if
		// it does not exist already and resolve it from there
		else {
			targetFileExists = await this.fileService.exists(target);

			// Create target file adhoc if it does not exist yet
			if (!targetFileExists) {
				await this.workingCopyFileService.create([{ resource: target }], CancellationToken.None);
			}

			// At this point we need to resolve the target working copy
			// and we have to do an explicit check if the source URI
			// equals the target via URI identity. If they match and we
			// have had an existing working copy with the source, we
			// prefer that one over resolving the target. Otherwise we
			// would potentially introduce a
			if (this.uriIdentityService.extUri.isEqual(source, target) && this.get(source)) {
				targetStoredFileWorkingCopy = await this.stored.resolve(source);
			} else {
				targetStoredFileWorkingCopy = await this.stored.resolve(target);
			}
		}

		return { targetFileExists, targetStoredFileWorkingCopy };
	}

	private async confirmOverwrite(resource: URI): Promise<boolean> {
		const { confirmed } = await this.dialogService.confirm({
			type: 'warning',
			message: localize('confirmOverwrite', "'{0}' already exists. Do you want to replace it?", basename(resource)),
			detail: localize('overwriteIrreversible', "A file or folder with the name '{0}' already exists in the folder '{1}'. Replacing it will overwrite its current contents.", basename(resource), basename(dirname(resource))),
			primaryButton: localize({ key: 'replaceButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Replace")
		});

		return confirmed;
	}

	private async confirmMakeWriteable(resource: URI): Promise<boolean> {
		const { confirmed } = await this.dialogService.confirm({
			type: 'warning',
			message: localize('confirmMakeWriteable', "'{0}' is marked as read-only. Do you want to save anyway?", basename(resource)),
			detail: localize('confirmMakeWriteableDetail', "Paths can be configured as read-only via settings."),
			primaryButton: localize({ key: 'makeWriteableButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Save Anyway")
		});

		return confirmed;
	}

	private async suggestSavePath(resource: URI): Promise<URI> {

		// 1.) Just take the resource as is if the file service can handle it
		if (this.fileService.hasProvider(resource)) {
			return resource;
		}

		// 2.) Pick the associated file path for untitled working copies if any
		const workingCopy = this.get(resource);
		if (workingCopy instanceof UntitledFileWorkingCopy && workingCopy.hasAssociatedFilePath) {
			return toLocalResource(resource, this.environmentService.remoteAuthority, this.pathService.defaultUriScheme);
		}

		const defaultFilePath = await this.fileDialogService.defaultFilePath();

		// 3.) Pick the working copy name if valid joined with default path
		if (workingCopy) {
			const candidatePath = joinPath(defaultFilePath, workingCopy.name);
			if (await this.pathService.hasValidBasename(candidatePath, workingCopy.name)) {
				return candidatePath;
			}
		}

		// 4.) Finally fallback to the name of the resource joined with default path
		return joinPath(defaultFilePath, basename(resource));
	}

	//#endregion

	//#region Lifecycle

	async destroy(): Promise<void> {
		await Promises.settled([
			this.stored.destroy(),
			this.untitled.destroy()
		]);
	}

	//#endregion
}
