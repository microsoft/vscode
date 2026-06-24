/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, dispose, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IUntitledFileWorkingCopy, IUntitledFileWorkingCopyInitialContents, IUntitledFileWorkingCopyModel, IUntitledFileWorkingCopyModelFactory, IUntitledFileWorkingCopySaveDelegate, UntitledFileWorkingCopy } from './untitledFileWorkingCopy.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { Schemas } from '../../../../base/common/network.js';
import { IWorkingCopyService } from './workingCopyService.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkingCopyBackupService } from './workingCopyBackup.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { BaseFileWorkingCopyManager, IBaseFileWorkingCopyManager } from './abstractFileWorkingCopyManager.js';
import { ResourceMap } from '../../../../base/common/map.js';

export interface IUntitledFileWorkingCopySaveEvent {

	/**
	 * The source untitled file working copy that was saved. It is disposed at this point.
	 */
	readonly source: URI;

	/**
	 * The target file working copy the untitled was saved to. Is never untitled.
	 */
	readonly target: URI;
}

/**
 * The only one that should be dealing with `IUntitledFileWorkingCopy` and
 * handle all operations that are working copy related, such as save/revert,
 * backup and resolving.
 */
export interface IUntitledFileWorkingCopyManager<M extends IUntitledFileWorkingCopyModel> extends IBaseFileWorkingCopyManager<M, IUntitledFileWorkingCopy<M>> {

	/**
	 * An event for when an untitled file working copy was saved.
	 * At the point the event fires, the untitled file working copy is
	 * disposed.
	 */
	readonly onDidSave: Event<IUntitledFileWorkingCopySaveEvent>;

	/**
	 * An event for when a untitled file working copy changed it's dirty state.
	 */
	readonly onDidChangeDirty: Event<IUntitledFileWorkingCopy<M>>;

	/**
	 * An event for when a untitled file working copy is about to be disposed.
	 */
	readonly onWillDispose: Event<IUntitledFileWorkingCopy<M>>;

	/**
	 * Create a new untitled file working copy with optional initial contents.
	 *
	 * Note: Callers must `dispose` the working copy when no longer needed.
	 */
	resolve(options?: INewUntitledFileWorkingCopyOptions): Promise<IUntitledFileWorkingCopy<M>>;

	/**
	 * Create a new untitled file working copy with optional initial contents
	 * and associated resource. The associated resource will be used when
	 * saving and will not require to ask the user for a file path.
	 *
	 * Note: Callers must `dispose` the working copy when no longer needed.
	 */
	resolve(options?: INewUntitledFileWorkingCopyWithAssociatedResourceOptions): Promise<IUntitledFileWorkingCopy<M>>;

	/**
	 * Creates a new untitled file working copy with optional initial contents
	 * with the provided resource or return an existing untitled file working
	 * copy otherwise.
	 *
	 * Note: Callers must `dispose` the working copy when no longer needed.
	 */
	resolve(options?: INewOrExistingUntitledFileWorkingCopyOptions): Promise<IUntitledFileWorkingCopy<M>>;

	/**
	 * Internal method: triggers the onDidSave event.
	 */
	notifyDidSave(source: URI, target: URI): void;
}

export interface INewUntitledFileWorkingCopyOptions {

	/**
	 * Initial value of the untitled file working copy
	 * with support to indicate whether this should turn
	 * the working copy dirty or not.
	 */
	contents?: IUntitledFileWorkingCopyInitialContents;
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
	associatedResource: { authority?: string; path?: string; query?: string; fragment?: string };
}

export interface INewOrExistingUntitledFileWorkingCopyOptions extends INewUntitledFileWorkingCopyOptions {

	/**
	 * A resource to identify the untitled file working copy
	 * to create or return if already existing.
	 *
	 * Note: the resource will not be used unless the scheme is `untitled`.
	 */
	untitledResource: URI;

	/**
	 * A flag that will prevent the working copy from appearing dirty in the UI
	 * and not show a confirmation dialog when closed with unsaved content.
	 */
	isScratchpad?: boolean;
}

type IInternalUntitledFileWorkingCopyOptions = INewUntitledFileWorkingCopyOptions & INewUntitledFileWorkingCopyWithAssociatedResourceOptions & INewOrExistingUntitledFileWorkingCopyOptions;

export class UntitledFileWorkingCopyManager<M extends IUntitledFileWorkingCopyModel> extends BaseFileWorkingCopyManager<M, IUntitledFileWorkingCopy<M>> implements IUntitledFileWorkingCopyManager<M> {

	//#region Events

	private readonly _onDidSave = this._register(new Emitter<IUntitledFileWorkingCopySaveEvent>());
	readonly onDidSave = this._onDidSave.event;

	private readonly _onDidChangeDirty = this._register(new Emitter<IUntitledFileWorkingCopy<M>>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	private readonly _onWillDispose = this._register(new Emitter<IUntitledFileWorkingCopy<M>>());
	readonly onWillDispose = this._onWillDispose.event;

	//#endregion

	private readonly mapResourceToWorkingCopyListeners = new ResourceMap<IDisposable>();

	constructor(
		private readonly workingCopyTypeId: string,
		private readonly modelFactory: IUntitledFileWorkingCopyModelFactory<M>,
		private readonly saveDelegate: IUntitledFileWorkingCopySaveDelegate<M>,
		@IFileService fileService: IFileService,
		@ILabelService private readonly labelService: ILabelService,
		@ILogService logService: ILogService,
		@IWorkingCopyBackupService workingCopyBackupService: IWorkingCopyBackupService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService
	) {
		super(fileService, logService, workingCopyBackupService);
	}

	//#region Resolve

	resolve(options?: INewUntitledFileWorkingCopyOptions): Promise<IUntitledFileWorkingCopy<M>>;
	resolve(options?: INewUntitledFileWorkingCopyWithAssociatedResourceOptions): Promise<IUntitledFileWorkingCopy<M>>;
	resolve(options?: INewOrExistingUntitledFileWorkingCopyOptions): Promise<IUntitledFileWorkingCopy<M>>;
	async resolve(options?: IInternalUntitledFileWorkingCopyOptions): Promise<IUntitledFileWorkingCopy<M>> {
		const workingCopy = this.doCreateOrGet(options);
		await workingCopy.resolve();

		return workingCopy;
	}

	private doCreateOrGet(options: IInternalUntitledFileWorkingCopyOptions = Object.create(null)): IUntitledFileWorkingCopy<M> {
		const massagedOptions = this.massageOptions(options);

		// Return existing instance if asked for it
		if (massagedOptions.untitledResource) {
			const existingWorkingCopy = this.get(massagedOptions.untitledResource);
			if (existingWorkingCopy) {
				return existingWorkingCopy;
			}
		}

		// Create new instance otherwise
		return this.doCreate(massagedOptions);
	}

	private massageOptions(options: IInternalUntitledFileWorkingCopyOptions): IInternalUntitledFileWorkingCopyOptions {
		const massagedOptions: IInternalUntitledFileWorkingCopyOptions = Object.create(null);

		// Handle associated resource
		if (options.associatedResource) {
			massagedOptions.untitledResource = URI.from({
				scheme: Schemas.untitled,
				authority: options.associatedResource.authority,
				fragment: options.associatedResource.fragment,
				path: options.associatedResource.path,
				query: options.associatedResource.query
			});
			massagedOptions.associatedResource = options.associatedResource;
		}

		// Handle untitled resource
		else {
			if (options.untitledResource?.scheme === Schemas.untitled) {
				massagedOptions.untitledResource = options.untitledResource;
			}
			massagedOptions.isScratchpad = options.isScratchpad;
		}

		// Take over initial value
		massagedOptions.contents = options.contents;

		return massagedOptions;
	}

	private doCreate(options: IInternalUntitledFileWorkingCopyOptions): IUntitledFileWorkingCopy<M> {

		// Create a new untitled resource if none is provided
		let untitledResource = options.untitledResource;
		if (!untitledResource) {
			let counter = 1;
			do {
				untitledResource = URI.from({
					scheme: Schemas.untitled,
					path: options.isScratchpad ? `Scratchpad-${counter}` : `Untitled-${counter}`,
					query: this.workingCopyTypeId ?
						`typeId=${this.workingCopyTypeId}` : // distinguish untitled resources among others by encoding the `typeId` as query param
						undefined							 // keep untitled resources for text files as they are (when `typeId === ''`)
				});
				counter++;
			} while (this.has(untitledResource));
		}

		// Create new working copy with provided options
		const workingCopy = new UntitledFileWorkingCopy(
			this.workingCopyTypeId,
			untitledResource,
			this.labelService.getUriBasenameLabel(untitledResource),
			!!options.associatedResource,
			!!options.isScratchpad,
			options.contents,
			this.modelFactory,
			this.saveDelegate,
			this.workingCopyService,
			this.workingCopyBackupService,
			this.logService
		);

		// Register
		this.registerWorkingCopy(workingCopy);

		return workingCopy;
	}

	private registerWorkingCopy(workingCopy: IUntitledFileWorkingCopy<M>): void {

		// Install working copy listeners
		const workingCopyListeners = new DisposableStore();
		workingCopyListeners.add(workingCopy.onDidChangeDirty(() => this._onDidChangeDirty.fire(workingCopy)));
		workingCopyListeners.add(workingCopy.onWillDispose(() => this._onWillDispose.fire(workingCopy)));

		// Keep for disposal
		this.mapResourceToWorkingCopyListeners.set(workingCopy.resource, workingCopyListeners);

		// Add to cache
		this.add(workingCopy.resource, workingCopy);

		// If the working copy is dirty right from the beginning,
		// make sure to emit this as an event
		if (workingCopy.isDirty()) {
			this._onDidChangeDirty.fire(workingCopy);
		}
	}

	protected override remove(resource: URI): boolean {
		const removed = super.remove(resource);

		// Dispose any existing working copy listeners
		const workingCopyListener = this.mapResourceToWorkingCopyListeners.get(resource);
		if (workingCopyListener) {
			dispose(workingCopyListener);
			this.mapResourceToWorkingCopyListeners.delete(resource);
		}

		return removed;
	}

	//#endregion

	//#region Lifecycle

	override dispose(): void {
		super.dispose();

		// Dispose the working copy change listeners
		dispose(this.mapResourceToWorkingCopyListeners.values());
		this.mapResourceToWorkingCopyListeners.clear();
	}

	//#endregion

	notifyDidSave(source: URI, target: URI): void {
		this._onDidSave.fire({ source, target });
	}
}
