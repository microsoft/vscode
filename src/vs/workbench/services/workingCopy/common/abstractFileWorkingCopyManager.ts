/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Disposable, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { Promises } from 'vs/base/common/async';
import { IFileService } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import { ILogService } from 'vs/platform/log/common/log';
import { IWorkingCopyBackupService } from 'vs/workbench/services/workingCopy/common/workingCopyBackup';
import { IBaseFileWorkingCopy, IBaseFileWorkingCopyModel } from 'vs/workbench/services/workingCopy/common/abstractFileWorkingCopy';
import { FileWorkingCopy } from 'vs/workbench/services/workingCopy/common/fileWorkingCopy';
import { UntitledFileWorkingCopy } from 'vs/workbench/services/workingCopy/common/untitledFileWorkingCopy';
import { IConfirmation, IDialogService, IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { basename, dirname, isEqual, joinPath, toLocalResource } from 'vs/base/common/resources';
import { IUriIdentityService } from 'vs/workbench/services/uriIdentity/common/uriIdentity';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IWorkingCopyFileService } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import { VSBufferReadableStream } from 'vs/base/common/buffer';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { isValidBasename } from 'vs/base/common/extpath';
import { ISaveOptions } from 'vs/workbench/common/editor';

export interface IBaseFileWorkingCopyManager<M extends IBaseFileWorkingCopyModel, W extends IBaseFileWorkingCopy<M>> extends IDisposable {

	/**
	 * Access to all known file working copies within the manager.
	 */
	readonly workingCopies: readonly W[];

	/**
	 * Returns the file working copy for the provided resource
	 * or `undefined` if none.
	 */
	get(resource: URI): W | undefined;

	/**
	 * Disposes all working copies of the manager and disposes the manager. This
	 * method is different from `dispose` in that it will unregister any working
	 * copy from the `IWorkingCopyService`. Since this impact things like backups,
	 * the method is `async` because it needs to trigger `save` for any dirty
	 * working copy to preserve the data.
	 *
	 * Callers should make sure to e.g. close any editors associated with the
	 * working copy.
	 */
	destroy(): Promise<void>;
}

export interface IBaseFileWorkingCopySaveAsOptions extends ISaveOptions {

	/**
	 * Optional target resource to suggest to the user in case
	 * no taget resource is provided to save to.
	 */
	suggestedTarget?: URI;
}

export abstract class BaseFileWorkingCopyManager<M extends IBaseFileWorkingCopyModel, W extends IBaseFileWorkingCopy<M>> extends Disposable implements IBaseFileWorkingCopyManager<M, W> {

	private readonly mapResourceToWorkingCopy = new ResourceMap<W>();

	constructor(
		protected readonly workingCopyTypeId: string,
		@IFileService protected readonly fileService: IFileService,
		@ILogService protected readonly logService: ILogService,
		@IWorkingCopyBackupService private readonly workingCopyBackupService: IWorkingCopyBackupService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IUriIdentityService protected readonly uriIdentityService: IUriIdentityService,
		@IWorkingCopyFileService protected readonly workingCopyFileService: IWorkingCopyFileService,
		@IDialogService private readonly dialogService: IDialogService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IPathService private readonly pathService: IPathService
	) {
		super();
	}

	protected has(resource: URI): boolean {
		return this.mapResourceToWorkingCopy.has(resource);
	}

	protected add(resource: URI, workingCopy: W): void {
		this.mapResourceToWorkingCopy.set(resource, workingCopy);
	}

	protected remove(resource: URI): void {
		this.mapResourceToWorkingCopy.delete(resource);
	}

	//#region Get / Get all

	get workingCopies(): W[] {
		return [...this.mapResourceToWorkingCopy.values()];
	}

	get(resource: URI): W | undefined {
		return this.mapResourceToWorkingCopy.get(resource);
	}

	private getFile(resource: URI): W | undefined {
		const workingCopy = this.workingCopyService.get({ resource, typeId: this.workingCopyTypeId });
		if (workingCopy instanceof FileWorkingCopy) {
			return workingCopy as unknown as W;
		}

		return undefined;
	}

	//#endregion

	//#region Save

	async save(resource: URI, options?: ISaveOptions): Promise<W | undefined> {
		const workingCopy = this.get(resource);

		// Untitled
		if (workingCopy instanceof UntitledFileWorkingCopy) {
			let targetUri: URI | undefined;

			// Untitled with associated file path is taken as is
			if (workingCopy.hasAssociatedFilePath) {
				targetUri = await this.suggestSavePath(resource);
			}

			// Otherwise ask user for a target path to save to
			else {
				targetUri = await this.fileDialogService.pickFileToSave(await this.suggestSavePath(resource), options?.availableFileSystems);
			}

			// Save as if target provided
			if (targetUri) {
				return this.saveAs(resource, targetUri, options);
			}
		}

		// File
		else if (workingCopy) {
			const success = await workingCopy.save(options);
			if (success) {
				return workingCopy;
			}
		}

		return undefined;
	}

	async saveAs(source: URI, target?: URI, options?: IBaseFileWorkingCopySaveAsOptions): Promise<W | undefined> {

		// Get to target resource
		if (!target) {
			target = await this.fileDialogService.pickFileToSave(await this.suggestSavePath(options?.suggestedTarget ?? source), options?.availableFileSystems);
		}

		if (!target) {
			return; // user canceled
		}

		// Just save if target is same as working copies own resource
		if (isEqual(source, target)) {
			return this.save(source, { ...options, force: true  /* force to save, even if not dirty (https://github.com/microsoft/vscode/issues/99619) */ });
		}

		// If the target is different but of same identity, we
		// move the source to the target, knowing that the
		// underlying file system cannot have both and then save.
		// However, this will only work if the source exists
		// and is not orphaned, so we need to check that too.
		if (this.fileService.canHandleResource(source) && this.uriIdentityService.extUri.isEqual(source, target) && (await this.fileService.exists(source))) {
			await this.workingCopyFileService.move([{ file: { source, target } }], CancellationToken.None);

			// At this point we don't know whether we have a
			// working copy for the source or the target URI so we
			// simply try to save with both resources.
			let targetWorkingCopy = await this.save(source, options);
			if (!targetWorkingCopy) {
				targetWorkingCopy = await this.save(target, options);
			}

			return targetWorkingCopy;
		}

		// Do it
		return this.doSaveAs(source, target, options);
	}

	private async doSaveAs(source: URI, target: URI, options?: IBaseFileWorkingCopySaveAsOptions): Promise<W | undefined> {
		let sourceContents: VSBufferReadableStream;

		// If the source is an existing file working copy, we can directly
		// use that to copy the contents to the target destination
		const sourceWorkingCopy = this.get(source);
		if (sourceWorkingCopy?.isResolved()) {
			sourceContents = await sourceWorkingCopy.model.snapshot(CancellationToken.None);
		}

		// Otherwise we resolve the contents from the underlying file
		else {
			sourceContents = (await this.fileService.readFileStream(source)).value;
		}

		// Save the contents through working copy to benefit from save
		// participants and handling a potential already existing target
		return this.doSaveAsWorkingCopy(source, sourceWorkingCopy, sourceContents, target, options);
	}

	private async doSaveAsWorkingCopy(source: URI, sourceWorkingCopy: W | undefined, sourceContents: VSBufferReadableStream, target: URI, options?: IBaseFileWorkingCopySaveAsOptions): Promise<W | undefined> {

		// Prefer an existing file working copy if it is already resolved
		// for the given target resource
		let targetFileExists = false;
		let targetFileWorkingCopy = this.getFile(target);
		if (targetFileWorkingCopy?.isResolved()) {
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
			// prefer that one over resolving the target. Otherwiese we
			// would potentially introduce a
			if (this.uriIdentityService.extUri.isEqual(source, target) && this.get(source)) {
				targetFileWorkingCopy = await this.doResolve(source);
			} else {
				targetFileWorkingCopy = await this.doResolve(target);
			}
		}

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
		await targetFileWorkingCopy.model?.update(sourceContents, CancellationToken.None);

		// Save target
		await targetFileWorkingCopy.save({ ...options, force: true  /* force to save, even if not dirty (https://github.com/microsoft/vscode/issues/99619) */ });

		// Revert the source
		await sourceWorkingCopy?.revert();

		return targetFileWorkingCopy;
	}

	protected abstract doResolve(resource: URI): Promise<W>;

	private async confirmOverwrite(resource: URI): Promise<boolean> {
		const confirm: IConfirmation = {
			message: localize('confirmOverwrite', "'{0}' already exists. Do you want to replace it?", basename(resource)),
			detail: localize('irreversible', "A file or folder with the name '{0}' already exists in the folder '{1}'. Replacing it will overwrite its current contents.", basename(resource), basename(dirname(resource))),
			primaryButton: localize({ key: 'replaceButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Replace"),
			type: 'warning'
		};

		const result = await this.dialogService.confirm(confirm);
		return result.confirmed;
	}

	private async suggestSavePath(resource: URI): Promise<URI> {

		// Just take the resource as is if the file service can handle it
		if (this.fileService.canHandleResource(resource)) {
			return resource;
		}

		const remoteAuthority = this.environmentService.remoteAuthority;
		const workingCopy = this.get(resource);

		// Otherwise try to suggest a path that can be saved
		let suggestedFilename: string | undefined = undefined;
		if (workingCopy instanceof UntitledFileWorkingCopy) {

			// Untitled with associated file path
			if (workingCopy.hasAssociatedFilePath) {
				return toLocalResource(resource, remoteAuthority, this.pathService.defaultUriScheme);
			}

			// Untitled without associated file path: use name
			// of untitled working copy if it is a valid path name
			let untitledName = workingCopy.name;
			if (!isValidBasename(untitledName)) {
				untitledName = basename(resource);
			}

			suggestedFilename = untitledName;
		}

		// Fallback to basename of resource
		if (!suggestedFilename) {
			suggestedFilename = basename(resource);
		}

		// Try to place where last active file was if any
		// Otherwise fallback to user home
		return joinPath(await this.fileDialogService.defaultFilePath(), suggestedFilename);
	}

	//#endregion

	//#region Lifecycle

	override dispose(): void {
		super.dispose();

		// Clear working copy caches
		//
		// Note: we are not explicitly disposing the working copies
		// known to the manager because this can have unwanted side
		// effects such as backups getting discarded once the working
		// copy unregisters. We have an explicit `destroy`
		// for that purpose (https://github.com/microsoft/vscode/pull/123555)
		//
		this.mapResourceToWorkingCopy.clear();
	}

	async destroy(): Promise<void> {

		// Make sure all dirty working copies are saved to disk
		try {
			await Promises.settled(this.workingCopies.map(async workingCopy => {
				if (workingCopy.isDirty()) {
					await this.saveWithFallback(workingCopy);
				}
			}));
		} catch (error) {
			this.logService.error(error);
		}

		// Dispose all working copies
		dispose(this.mapResourceToWorkingCopy.values());

		// Finally dispose manager
		this.dispose();
	}

	private async saveWithFallback(workingCopy: W): Promise<void> {

		// First try regular save
		let saveFailed = false;
		try {
			await workingCopy.save();
		} catch (error) {
			saveFailed = true;
		}

		// Then fallback to backup if that exists
		if (saveFailed || workingCopy.isDirty()) {
			const backup = await this.workingCopyBackupService.resolve(workingCopy);
			if (backup) {
				await this.fileService.writeFile(workingCopy.resource, backup.value, { unlock: true });
			}
		}
	}

	//#endregion
}
