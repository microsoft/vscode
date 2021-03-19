/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { FileWorkingCopy, IFileWorkingCopy, IFileWorkingCopyModel, IFileWorkingCopyModelFactory } from 'vs/workbench/services/workingCopy/common/fileWorkingCopy';
import { SaveReason } from 'vs/workbench/common/editor';
import { ResourceMap } from 'vs/base/common/map';
import { ResourceQueue } from 'vs/base/common/async';
import { FileChangesEvent, FileChangeType, IFileService } from 'vs/platform/files/common/files';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { VSBufferReadableStream } from 'vs/base/common/buffer';
import { ILabelService } from 'vs/platform/label/common/label';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';

/**
 * The only one that should be dealing with `IFileWorkingCopy` and handle all
 * operations that are working copy related, such as save/revert, backup
 * and resolving.
 */
export interface IFileWorkingCopyManager<T extends IFileWorkingCopyModel> extends IDisposable {

	/**
	 * An event for when a file working copy was created.
	 */
	readonly onDidCreate: Event<IFileWorkingCopy<T>>;

	/**
	 * An event for when a file working copy was resolved.
	 */
	readonly onDidResolve: Event<IFileWorkingCopy<T>>;

	/**
	 * An event for when a file working copy changed it's dirty state.
	 */
	readonly onDidChangeDirty: Event<IFileWorkingCopy<T>>;

	/**
	 * An event for when a file working copy failed to save.
	 */
	readonly onDidSaveError: Event<IFileWorkingCopy<T>>;

	/**
	 * An event for when a file working copy successfully saved.
	 */
	readonly onDidSave: Event<IFileWorkingCopySaveEvent<T>>;

	/**
	 * An event for when a file working copy was reverted.
	 */
	readonly onDidRevert: Event<IFileWorkingCopy<T>>;

	/**
	 * Access to all known file working copies within the manager.
	 */
	readonly workingCopies: IFileWorkingCopy<T>[];

	/**
	 * Returns the file working copy for the provided resource
	 * or `undefined` if none.
	 */
	get(resource: URI): IFileWorkingCopy<T> | undefined;

	/**
	 * Allows to resolve a file working copy. Callers must dispose the working
	 * copy when no longer needed.
	 */
	resolve(resource: URI, options?: IFileWorkingCopyResolveOptions): Promise<IFileWorkingCopy<T>>;

	/**
	 * Waits for the file working copy to be ready to be disposed. There may be
	 * conditions under which the file working copy cannot be disposed, e.g. when
	 * it is dirty. Once the promise is settled, it is safe to dispose.
	 *
	 * TODO@bpasero this is a bit fishy, should this not be inside the working copy
	 * itself?
	 */
	canDispose(workingCopy: IFileWorkingCopy<T>): true | Promise<true>;
}

export interface IFileWorkingCopySaveEvent<T extends IFileWorkingCopyModel> {

	/**
	 * The file working copy that was successfully saved.
	 */
	workingCopy: IFileWorkingCopy<T>;

	/**
	 * The reason why the file working copy was saved.
	 */
	reason: SaveReason;
}

export interface IFileWorkingCopyResolveOptions {

	/**
	 * The contents to use for the file working copy if known.
	 * If not provided, the contents will be retrieved from the
	 * underlying resource or backup if present.
	 *
	 * If contents are provided, the file working copy will be marked
	 * as dirty right from the beginning.
	 */
	contents?: VSBufferReadableStream;

	/**
	 * If the file working copy was already resolved before,
	 * allows to trigger a reload of it to fetch the latest contents:
	 * - async: resolve() will return immediately and trigger
	 *          a reload that will run in the background.
	 * -  sync: resolve() will only return resolved when the
	 *          file working copy has finished reloading.
	 */
	reload?: {
		async: boolean
	};
}

export class FileWorkingCopyManager<T extends IFileWorkingCopyModel> extends Disposable implements IFileWorkingCopyManager<T> {

	//#region Events

	private readonly _onDidCreate = this._register(new Emitter<IFileWorkingCopy<T>>());
	readonly onDidCreate = this._onDidCreate.event;

	private readonly _onDidResolve = this._register(new Emitter<IFileWorkingCopy<T>>());
	readonly onDidResolve = this._onDidResolve.event;

	private readonly _onDidChangeDirty = this._register(new Emitter<IFileWorkingCopy<T>>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	private readonly _onDidSaveError = this._register(new Emitter<IFileWorkingCopy<T>>());
	readonly onDidSaveError = this._onDidSaveError.event;

	private readonly _onDidSave = this._register(new Emitter<IFileWorkingCopySaveEvent<T>>());
	readonly onDidSave = this._onDidSave.event;

	private readonly _onDidRevert = this._register(new Emitter<IFileWorkingCopy<T>>());
	readonly onDidRevert = this._onDidRevert.event;

	//#endregion

	private readonly mapResourceToWorkingCopy = new ResourceMap<IFileWorkingCopy<T>>();
	private readonly mapResourceToWorkingCopyListeners = new ResourceMap<IDisposable>();
	private readonly mapResourceToDisposeListener = new ResourceMap<IDisposable>();
	private readonly mapResourceToPendingWorkingCopyResolve = new ResourceMap<Promise<void>>();

	private readonly workingCopyResolveQueue = this._register(new ResourceQueue());

	constructor(
		private readonly modelFactory: IFileWorkingCopyModelFactory<T>,
		@IFileService private readonly fileService: IFileService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@ILabelService private readonly labelService: ILabelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Update working copies from file change events
		this._register(this.fileService.onDidFilesChange(e => this.onDidFilesChange(e)));

		// Lifecycle
		this.lifecycleService.onShutdown(() => this.dispose());
	}

	private onDidFilesChange(e: FileChangesEvent): void {
		for (const workingCopy of this.workingCopies) {
			if (workingCopy.isDirty() || !workingCopy.isResolved()) {
				continue; // require a resolved, saved working copy to continue
			}

			// Trigger a resolve for any update or add event that impacts
			// the working copy. We also consider the added event
			// because it could be that a file was added and updated
			// right after.
			if (e.contains(workingCopy.resource, FileChangeType.UPDATED, FileChangeType.ADDED)) {
				this.queueWorkingCopyResolve(workingCopy);
			}
		}
	}

	private queueWorkingCopyResolve(workingCopy: IFileWorkingCopy<T>): void {

		// Resolves a working copy to update (use a queue to prevent accumulation of
		// resolve when the resolving actually takes long. At most we only want the
		// queue to have a size of 2 (1 running resolve and 1 queued resolve).
		const queue = this.workingCopyResolveQueue.queueFor(workingCopy.resource);
		if (queue.size <= 1) {
			queue.queue(async () => {
				try {
					await workingCopy.resolve();
				} catch (error) {
					this.logService.error(error);
				}
			});
		}
	}

	get workingCopies(): IFileWorkingCopy<T>[] {
		return [...this.mapResourceToWorkingCopy.values()];
	}

	get(resource: URI): IFileWorkingCopy<T> | undefined {
		return this.mapResourceToWorkingCopy.get(resource);
	}

	async resolve(resource: URI, options?: IFileWorkingCopyResolveOptions): Promise<IFileWorkingCopy<T>> {

		// Await a pending working copy resolve first before proceeding
		// to ensure that we never resolve a working copy more than once
		// in parallel
		const pendingResolve = this.joinPendingResolve(resource);
		if (pendingResolve) {
			await pendingResolve;
		}

		let workingCopyResolve: Promise<void>;
		let workingCopy = this.get(resource);
		let didCreateWorkingCopy = false;

		// Working copy exists
		if (workingCopy) {

			// Always reload if contents are provided
			if (options?.contents) {
				workingCopyResolve = workingCopy.resolve(options);
			}

			// Reload async or sync based on options
			else if (options?.reload) {

				// async reload: trigger a reload but return immediately
				if (options.reload.async) {
					workingCopy.resolve(options);
					workingCopyResolve = Promise.resolve();
				}

				// sync reload: do not return until working copy reloaded
				else {
					workingCopyResolve = workingCopy.resolve(options);
				}
			}

			// Do not reload
			else {
				workingCopyResolve = Promise.resolve();
			}
		}

		// File working copy does not exist
		else {
			didCreateWorkingCopy = true;

			const newWorkingCopy = workingCopy = this.instantiationService.createInstance(FileWorkingCopy, resource, this.labelService.getUriBasenameLabel(resource), this.modelFactory) as unknown as IFileWorkingCopy<T>;
			workingCopyResolve = workingCopy.resolve(options);

			this.registerWorkingCopy(newWorkingCopy);
		}

		// Store pending resolve to avoid race conditions
		this.mapResourceToPendingWorkingCopyResolve.set(resource, workingCopyResolve);

		// Make known to manager (if not already known)
		this.add(resource, workingCopy);

		// Emit some events if we created the working copy
		if (didCreateWorkingCopy) {
			this._onDidCreate.fire(workingCopy);

			// If the working copy is dirty right from the beginning,
			// make sure to emit this as an event
			if (workingCopy.isDirty()) {
				this._onDidChangeDirty.fire(workingCopy);
			}
		}

		try {

			// Wait for working copy to resolve
			await workingCopyResolve;

			// Remove from pending resolves
			this.mapResourceToPendingWorkingCopyResolve.delete(resource);

			// File working copy can be dirty if a backup was restored, so we make sure to
			// have this event delivered if we created the working copy here
			if (didCreateWorkingCopy && workingCopy.isDirty()) {
				this._onDidChangeDirty.fire(workingCopy);
			}

			return workingCopy;
		} catch (error) {

			// Free resources of this invalid working copy
			if (workingCopy) {
				workingCopy.dispose();
			}

			// Remove from pending resolves
			this.mapResourceToPendingWorkingCopyResolve.delete(resource);

			throw error;
		}
	}

	private joinPendingResolve(resource: URI): Promise<void> | undefined {
		const pendingWorkingCopyResolve = this.mapResourceToPendingWorkingCopyResolve.get(resource);
		if (pendingWorkingCopyResolve) {
			return pendingWorkingCopyResolve.then(undefined, error => {/* ignore any error here, it will bubble to the original requestor*/ });
		}

		return undefined;
	}

	private registerWorkingCopy(workingCopy: IFileWorkingCopy<T>): void {

		// Install working copy listeners
		const workingCopyListeners = new DisposableStore();
		workingCopyListeners.add(workingCopy.onDidResolve(() => this._onDidResolve.fire(workingCopy)));
		workingCopyListeners.add(workingCopy.onDidChangeDirty(() => this._onDidChangeDirty.fire(workingCopy)));
		workingCopyListeners.add(workingCopy.onDidSaveError(() => this._onDidSaveError.fire(workingCopy)));
		workingCopyListeners.add(workingCopy.onDidSave(reason => this._onDidSave.fire({ workingCopy: workingCopy, reason })));
		workingCopyListeners.add(workingCopy.onDidRevert(() => this._onDidRevert.fire(workingCopy)));

		// Keep for disposal
		this.mapResourceToWorkingCopyListeners.set(workingCopy.resource, workingCopyListeners);
	}

	private add(resource: URI, workingCopy: IFileWorkingCopy<T>): void {
		const knownWorkingCopy = this.mapResourceToWorkingCopy.get(resource);
		if (knownWorkingCopy === workingCopy) {
			return; // already cached
		}

		// dispose any previously stored dispose listener for this resource
		const disposeListener = this.mapResourceToDisposeListener.get(resource);
		if (disposeListener) {
			disposeListener.dispose();
		}

		// store in cache but remove when working copy gets disposed
		this.mapResourceToWorkingCopy.set(resource, workingCopy);
		this.mapResourceToDisposeListener.set(resource, workingCopy.onWillDispose(() => this.remove(resource)));
	}

	private remove(resource: URI): void {
		this.mapResourceToWorkingCopy.delete(resource);

		const disposeListener = this.mapResourceToDisposeListener.get(resource);
		if (disposeListener) {
			dispose(disposeListener);
			this.mapResourceToDisposeListener.delete(resource);
		}

		const workingCopyListener = this.mapResourceToWorkingCopyListeners.get(resource);
		if (workingCopyListener) {
			dispose(workingCopyListener);
			this.mapResourceToWorkingCopyListeners.delete(resource);
		}
	}

	private clear(): void {

		// working copy caches
		this.mapResourceToWorkingCopy.clear();
		this.mapResourceToPendingWorkingCopyResolve.clear();

		// dispose the dispose listeners
		this.mapResourceToDisposeListener.forEach(listener => listener.dispose());
		this.mapResourceToDisposeListener.clear();

		// dispose the working copy change listeners
		this.mapResourceToWorkingCopyListeners.forEach(listener => listener.dispose());
		this.mapResourceToWorkingCopyListeners.clear();
	}

	canDispose(workingCopy: IFileWorkingCopy<T>): true | Promise<true> {

		// quick return if working copy already disposed or not dirty and not resolving
		if (
			workingCopy.isDisposed() ||
			(!this.mapResourceToPendingWorkingCopyResolve.has(workingCopy.resource) && !workingCopy.isDirty())
		) {
			return true;
		}

		// promise based return in all other cases
		return this.doCanDispose(workingCopy);
	}

	private async doCanDispose(workingCopy: IFileWorkingCopy<T>): Promise<true> {

		// if we have a pending working copy resolve, await it first and then try again
		const pendingResolve = this.joinPendingResolve(workingCopy.resource);
		if (pendingResolve) {
			await pendingResolve;

			return this.canDispose(workingCopy);
		}

		// dirty working copy: we do not allow to dispose dirty working copys
		// to prevent data loss cases. dirty working copys can only be disposed when
		// they are either saved or reverted
		if (workingCopy.isDirty()) {
			await Event.toPromise(workingCopy.onDidChangeDirty);

			return this.canDispose(workingCopy);
		}

		return true;
	}

	dispose(): void {
		super.dispose();

		this.clear();
	}
}
