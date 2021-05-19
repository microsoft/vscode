/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Promises } from 'vs/base/common/async';
import { VSBufferReadableStream } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { toLocalResource, joinPath, isEqual, basename, dirname } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IFileDialogService, IDialogService, IConfirmation } from 'vs/platform/dialogs/common/dialogs';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ISaveOptions } from 'vs/workbench/common/editor';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { IUriIdentityService } from 'vs/workbench/services/uriIdentity/common/uriIdentity';
import { IFileWorkingCopy, IFileWorkingCopyModel, IFileWorkingCopyModelFactory, IFileWorkingCopyResolveOptions } from 'vs/workbench/services/workingCopy/common/fileWorkingCopy';
import { FileWorkingCopyManager, IFileWorkingCopyManager } from 'vs/workbench/services/workingCopy/common/fileWorkingCopyManager';
import { IUntitledFileWorkingCopy, IUntitledFileWorkingCopyModel, IUntitledFileWorkingCopyModelFactory, UntitledFileWorkingCopy } from 'vs/workbench/services/workingCopy/common/untitledFileWorkingCopy';
import { INewOrExistingUntitledFileWorkingCopyOptions, INewUntitledFileWorkingCopyOptions, INewUntitledFileWorkingCopyWithAssociatedResourceOptions, IUntitledFileWorkingCopyManager, UntitledFileWorkingCopyManager } from 'vs/workbench/services/workingCopy/common/untitledFileWorkingCopyManager';
import { IWorkingCopyFileService } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import { isValidBasename } from 'vs/base/common/extpath';

export interface IFileWorkingCopyManager2<F extends IFileWorkingCopyModel, U extends IUntitledFileWorkingCopyModel> extends IDisposable {

	/**
	 * Provides access to the manager for titled file working copies.
	 */
	readonly files: IFileWorkingCopyManager<F>;

	/**
	 * Provides access to the manager for untitled file working copies.
	 */
	readonly untitled: IUntitledFileWorkingCopyManager<U>;

	/**
	 * Allows to resolve a file working copy. If the manager already knows
	 * about a file working copy with the same `URI`, it will return that
	 * existing file working copy. There will never be more than one
	 * file working copy per `URI` until the file working copy is disposed.
	 *
	 * Use the `IFileWorkingCopyResolveOptions.reload` option to control the
	 * behaviour for when a file working copy was previously already resolved
	 * with regards to resolving it again from the underlying file resource
	 * or not.
	 *
	 * Note: Callers must `dispose` the working copy when no longer needed.
	 *
	 * @param resource used as unique identifier of the file working copy in
	 * case one is already known for this `URI`.
	 */
	resolve(resource: URI, options?: IFileWorkingCopyResolveOptions): Promise<IFileWorkingCopy<F>>;

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
	 * @returns the target working copy that was saved to or `undefined` in case of
	 * cancellation
	 */
	saveAs(source: URI, target: URI, options?: ISaveOptions): Promise<IFileWorkingCopy<IFileWorkingCopyModel> | undefined>;
	saveAs(source: URI, target: undefined, options?: IFileWorkingCopySaveAsOptions): Promise<IFileWorkingCopy<IFileWorkingCopyModel> | undefined>;

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

export interface IFileWorkingCopySaveAsOptions extends ISaveOptions {

	/**
	 * Optional target resource to suggest to the user in case
	 * no taget resource is provided to save to.
	 */
	suggestedTarget?: URI;
}

export class FileWorkingCopyManager2<F extends IFileWorkingCopyModel, U extends IUntitledFileWorkingCopyModel> extends Disposable implements IFileWorkingCopyManager2<F, U> {

	readonly files: IFileWorkingCopyManager<F>;
	readonly untitled: IUntitledFileWorkingCopyManager<U>;

	constructor(
		private readonly workingCopyTypeId: string,
		private readonly fileModelFactory: IFileWorkingCopyModelFactory<F>,
		private readonly untitledFileModelFactory: IUntitledFileWorkingCopyModelFactory<U>,
		@IFileService private readonly fileService: IFileService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IWorkingCopyFileService private readonly workingCopyFileService: IWorkingCopyFileService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IDialogService private readonly dialogService: IDialogService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IPathService private readonly pathService: IPathService
	) {
		super();

		// File manager
		this.files = this._register(this.instantiationService.createInstance(FileWorkingCopyManager, this.workingCopyTypeId, this.fileModelFactory)) as unknown as IFileWorkingCopyManager<F>;

		// Untitled manager
		this.untitled = this._register(this.instantiationService.createInstance(UntitledFileWorkingCopyManager, this.workingCopyTypeId, this.untitledFileModelFactory, async (workingCopy, options) => {
			const result = await this.saveAs(workingCopy.resource, undefined, options);

			return result ? true : false;
		})) as unknown as IUntitledFileWorkingCopyManager<U>;
	}

	//#region resolve

	resolve(options?: INewUntitledFileWorkingCopyOptions): Promise<IUntitledFileWorkingCopy<U>>;
	resolve(options?: INewUntitledFileWorkingCopyWithAssociatedResourceOptions): Promise<IUntitledFileWorkingCopy<U>>;
	resolve(options?: INewOrExistingUntitledFileWorkingCopyOptions): Promise<IUntitledFileWorkingCopy<U>>;
	resolve(resource: URI, options?: IFileWorkingCopyResolveOptions): Promise<IFileWorkingCopy<F>>;
	resolve(arg1?: URI | INewUntitledFileWorkingCopyOptions | INewUntitledFileWorkingCopyWithAssociatedResourceOptions | INewOrExistingUntitledFileWorkingCopyOptions, arg2?: IFileWorkingCopyResolveOptions): Promise<IUntitledFileWorkingCopy<U> | IFileWorkingCopy<F>> {
		if (URI.isUri(arg1)) {
			return this.files.resolve(arg1, arg2);
		}

		return this.untitled.resolve(arg1);
	}

	//#endregion

	//#region Save

	async saveAs(source: URI, target?: URI, options?: IFileWorkingCopySaveAsOptions): Promise<IFileWorkingCopy<IFileWorkingCopyModel> | undefined> {

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

		// Just save if target is same as working copies own resource
		// and we are not saving an untitled file working copy
		if (this.fileService.canHandleResource(source) && isEqual(source, target)) {
			return this.doSave(source, { ...options, force: true  /* force to save, even if not dirty (https://github.com/microsoft/vscode/issues/99619) */ });
		}

		// If the target is different but of same identity, we
		// move the source to the target, knowing that the
		// underlying file system cannot have both and then save.
		// However, this will only work if the source exists
		// and is not orphaned, so we need to check that too.
		if (this.fileService.canHandleResource(source) && this.uriIdentityService.extUri.isEqual(source, target) && (await this.fileService.exists(source))) {

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

	private async doSave(resource: URI, options?: ISaveOptions): Promise<IFileWorkingCopy<IFileWorkingCopyModel> | undefined> {

		// Save is only possible with file working copies,
		// any other have to go via `saveAs` flow.
		const fileWorkingCopy = this.files.get(resource);
		if (fileWorkingCopy) {
			const success = await fileWorkingCopy.save(options);
			if (success) {
				return fileWorkingCopy;
			}
		}

		return undefined;
	}

	private async doSaveAs(source: URI, target: URI, options?: IFileWorkingCopySaveAsOptions): Promise<IFileWorkingCopy<IFileWorkingCopyModel> | undefined> {
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

		// Resolve target
		const { targetFileExists, targetFileWorkingCopy } = await this.doResolveSaveTarget(source, target);

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

	private get(resource: URI): IUntitledFileWorkingCopy<U> | IFileWorkingCopy<F> | undefined {
		return this.files.get(resource) ?? this.untitled.get(resource);
	}

	private async doResolveSaveTarget(source: URI, target: URI): Promise<{ targetFileExists: boolean, targetFileWorkingCopy: IFileWorkingCopy<IFileWorkingCopyModel> }> {

		// Prefer an existing file working copy if it is already resolved
		// for the given target resource
		let targetFileExists = false;
		let targetFileWorkingCopy = this.files.get(target);
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
			// prefer that one over resolving the target. Otherwise we
			// would potentially introduce a
			if (this.uriIdentityService.extUri.isEqual(source, target) && this.get(source)) {
				targetFileWorkingCopy = await this.files.resolve(source);
			} else {
				targetFileWorkingCopy = await this.files.resolve(target);
			}
		}

		return { targetFileExists, targetFileWorkingCopy };
	}

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

		// 1.) Just take the resource as is if the file service can handle it
		if (this.fileService.canHandleResource(resource)) {
			return resource;
		}

		// 2.) Pick the associated file path for untitled working copies if any
		const workingCopy = this.get(resource);
		if (workingCopy instanceof UntitledFileWorkingCopy && workingCopy.hasAssociatedFilePath) {
			return toLocalResource(resource, this.environmentService.remoteAuthority, this.pathService.defaultUriScheme);
		}

		// 3.) Pick the working copy name if valid joined with default path
		if (workingCopy && isValidBasename(workingCopy.name)) {
			return joinPath(await this.fileDialogService.defaultFilePath(), workingCopy.name);
		}

		// 4.) Finally fallback to the name of the resource joined with default path
		return joinPath(await this.fileDialogService.defaultFilePath(), basename(resource));
	}

	//#endregion

	//#region Lifecycle

	async destroy(): Promise<void> {
		await Promises.settled([
			this.files.destroy(),
			this.untitled.destroy()
		]);
	}

	//#endregion
}
