/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBufferReadableStream } from 'vs/base/common/buffer';
import { Disposable, DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IUntitledFileWorkingCopy, IUntitledFileWorkingCopyModel, IUntitledFileWorkingCopyModelFactory, UntitledFileWorkingCopy } from 'vs/workbench/services/workingCopy/common/untitledFileWorkingCopy';
import { Event, Emitter } from 'vs/base/common/event';
import { ResourceMap } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { Promises } from 'vs/base/common/async';
import { ILogService } from 'vs/platform/log/common/log';
import { IWorkingCopyBackupService } from 'vs/workbench/services/workingCopy/common/workingCopyBackup';
import { IFileService } from 'vs/platform/files/common/files';

export interface INewUntitledFileWorkingCopyOptions {

	/**
	 * Initial value of the untitled file working copy.
	 *
	 * Note: An untitled file working copy with initial
	 * value is dirty right from the beginning.
	 */
	initialValue?: VSBufferReadableStream;
}

export interface INewUntitledFileWorkingCopyWithAssociatedResourceOptions extends INewUntitledFileWorkingCopyOptions {

	/**
	 * Resource components to associate with the untitled file working copy.
	 * When saving, the associated components will be used and the user
	 * is not being asked to provide a file path.
	 *
	 * Note: currently it is not possible to specify the `scheme` to use. The
	 * untitled file working copy will saved to the default local or remote resource.
	 */
	associatedResource: { authority: string; path: string; query: string; fragment: string; }
}

export interface IExistingUntitledFileWorkingCopyOptions extends INewUntitledFileWorkingCopyOptions {

	/**
	 * A resource to identify the untitled file working copy
	 * to create or return if already existing.
	 *
	 * Note: the resource will not be used unless the scheme is `untitled`.
	 */
	untitledResource: URI;
}

/**
 * The only one that should be dealing with `IUntitledFileWorkingCopy` and
 * handle all operations that are working copy related, such as save/revert,
 * backup and resolving.
 */
export interface IUntitledFileWorkingCopyManager<T extends IUntitledFileWorkingCopyModel> extends IDisposable {

	/**
	 * An event for when a untitled file working copy changed it's dirty state.
	 */
	readonly onDidChangeDirty: Event<IUntitledFileWorkingCopy<T>>;

	/**
	 * An event for when a untitled file working copy is about to be disposed.
	 */
	readonly onWillDispose: Event<IUntitledFileWorkingCopy<T>>;

	/**
	 * Access to all known untitled file working copies within the manager.
	 */
	readonly workingCopies: readonly IUntitledFileWorkingCopy<T>[];

	/**
	 * Returns an existing untitled file working copy if already created before
	 * or `undefined` otherwise.
	 */
	get(resource: URI): IUntitledFileWorkingCopy<T> | undefined;

	/**
	 * Resolves an untitled file working copy from the provided options.
	 */
	resolve(options?: INewUntitledFileWorkingCopyOptions): Promise<IUntitledFileWorkingCopy<T>>;
	resolve(options?: INewUntitledFileWorkingCopyWithAssociatedResourceOptions): Promise<IUntitledFileWorkingCopy<T>>;

	/**
	 * Resolves an untitled file working copy from the provided options
	 * unless an existing working copy already exists with that resource.
	 */
	resolve(options?: IExistingUntitledFileWorkingCopyOptions): Promise<IUntitledFileWorkingCopy<T>>;

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

type IInternalUntitledFileWorkingCopyOptions = IExistingUntitledFileWorkingCopyOptions & INewUntitledFileWorkingCopyWithAssociatedResourceOptions;

export class UntitledFileWorkingCopyManager<T extends IUntitledFileWorkingCopyModel> extends Disposable implements IUntitledFileWorkingCopyManager<T> {

	//#region Events

	private readonly _onDidChangeDirty = this._register(new Emitter<IUntitledFileWorkingCopy<T>>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	private readonly _onWillDispose = this._register(new Emitter<IUntitledFileWorkingCopy<T>>());
	readonly onWillDispose = this._onWillDispose.event;

	//#endregion

	private readonly mapResourceToWorkingCopy = new ResourceMap<IUntitledFileWorkingCopy<T>>();

	constructor(
		private readonly workingCopyTypeId: string,
		private readonly modelFactory: IUntitledFileWorkingCopyModelFactory<T>,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILabelService private readonly labelService: ILabelService,
		@ILogService private readonly logService: ILogService,
		@IWorkingCopyBackupService private readonly workingCopyBackupService: IWorkingCopyBackupService,
		@IFileService private readonly fileService: IFileService
	) {
		super();
	}

	//#region Get / Get all

	get workingCopies(): IUntitledFileWorkingCopy<T>[] {
		return [...this.mapResourceToWorkingCopy.values()];
	}

	get(resource: URI): IUntitledFileWorkingCopy<T> | undefined {
		return this.mapResourceToWorkingCopy.get(resource);
	}

	//#endregion

	//#region Resolve / Create

	async resolve(options?: IInternalUntitledFileWorkingCopyOptions): Promise<IUntitledFileWorkingCopy<T>> {
		const workingCopy = this.doCreateOrGet(options);
		await workingCopy.resolve();

		return workingCopy;
	}

	private doCreateOrGet(options: IInternalUntitledFileWorkingCopyOptions = Object.create(null)): IUntitledFileWorkingCopy<T> {
		const massagedOptions = this.massageOptions(options);

		// Return existing instance if asked for it
		if (massagedOptions.untitledResource && this.mapResourceToWorkingCopy.has(massagedOptions.untitledResource)) {
			return this.mapResourceToWorkingCopy.get(massagedOptions.untitledResource)!;
		}

		// Create new instance otherwise
		return this.doCreate(massagedOptions);
	}

	private massageOptions(options: IInternalUntitledFileWorkingCopyOptions): IInternalUntitledFileWorkingCopyOptions {
		const massagedOptions: IInternalUntitledFileWorkingCopyOptions = Object.create(null);

		// Figure out associated and untitled resource
		if (options.associatedResource) {
			massagedOptions.untitledResource = URI.from({
				scheme: Schemas.untitled,
				authority: options.associatedResource.authority,
				fragment: options.associatedResource.fragment,
				path: options.associatedResource.path,
				query: options.associatedResource.query
			});
			massagedOptions.associatedResource = options.associatedResource;
		} else {
			if (options.untitledResource?.scheme === Schemas.untitled) {
				massagedOptions.untitledResource = options.untitledResource;
			}
		}

		// Take over initial value
		massagedOptions.initialValue = options.initialValue;

		return massagedOptions;
	}

	private doCreate(options: IInternalUntitledFileWorkingCopyOptions): IUntitledFileWorkingCopy<T> {

		// Create a new untitled resource if none is provided
		let untitledResource = options.untitledResource;
		if (!untitledResource) {
			let counter = 1;
			do {
				untitledResource = URI.from({ scheme: Schemas.untitled, path: `Untitled-${counter}` });
				counter++;
			} while (this.mapResourceToWorkingCopy.has(untitledResource));
		}

		// Create new working copy with provided options
		const workingCopy = this.instantiationService.createInstance(
			UntitledFileWorkingCopy,
			this.workingCopyTypeId,
			untitledResource,
			this.labelService.getUriBasenameLabel(untitledResource),
			!!options.associatedResource,
			options.initialValue,
			this.modelFactory
		) as unknown as IUntitledFileWorkingCopy<T>;

		this.registerWorkingCopy(workingCopy);

		return workingCopy;
	}

	private registerWorkingCopy(workingCopy: IUntitledFileWorkingCopy<T>): void {

		// Install working copy listeners
		const listeners = new DisposableStore();
		listeners.add(workingCopy.onDidChangeDirty(() => this._onDidChangeDirty.fire(workingCopy)));
		listeners.add(workingCopy.onWillDispose(() => this._onWillDispose.fire(workingCopy)));

		// Remove from cache on dispose
		Event.once(workingCopy.onWillDispose)(() => {

			// Registry
			this.mapResourceToWorkingCopy.delete(workingCopy.resource);

			// Listeners
			listeners.dispose();
		});

		// Add to cache
		this.mapResourceToWorkingCopy.set(workingCopy.resource, workingCopy);

		// If the working copy is dirty right from the beginning,
		// make sure to emit this as an event
		if (workingCopy.isDirty()) {
			this._onDidChangeDirty.fire(workingCopy);
		}
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
		const workingCopies = Array.from(this.mapResourceToWorkingCopy.values());

		// Make sure all dirty working copies are saved to disk
		try {
			await Promises.settled(workingCopies.map(async workingCopy => {
				if (workingCopy.isDirty()) {
					await this.saveWithFallback(workingCopy);
				}
			}));
		} catch (error) {
			this.logService.error(error);
		}

		// Dispose all working copies
		dispose(workingCopies);

		// Finally dispose manager
		this.dispose();
	}

	private async saveWithFallback(workingCopy: IUntitledFileWorkingCopy<T>): Promise<void> {

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

		//#endregion
	}
}
