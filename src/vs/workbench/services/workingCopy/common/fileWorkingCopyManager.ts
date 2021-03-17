/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { IFileWorkingCopy, IFileWorkingCopyModel } from 'vs/workbench/services/workingCopy/common/fileWorkingCopy';
import { SaveReason } from 'vs/workbench/common/editor';
import { ResourceMap } from 'vs/base/common/map';
import { ResourceQueue } from 'vs/base/common/async';
import { FileChangesEvent, FileChangeType, IFileService } from 'vs/platform/files/common/files';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { onUnexpectedError } from 'vs/base/common/errors';
import { URI } from 'vs/base/common/uri';
import { VSBufferReadableStream } from 'vs/base/common/buffer';

/**
 * The only one that should be dealing with `IFileWorkingCopy` and handle all
 * operations that are working copy related, such as save/revert, backup
 * and loading.
 */
export interface IFileWorkingCopyManager<T extends IFileWorkingCopyModel> {
	readonly onDidCreate: Event<IFileWorkingCopy<T>>;
	readonly onDidLoad: Event<IFileWorkingCopy<T>>;
	readonly onDidChangeDirty: Event<IFileWorkingCopy<T>>;
	readonly onDidSaveError: Event<IFileWorkingCopy<T>>;
	readonly onDidSave: Event<IFileWorkingCopySaveEvent<T>>;
	readonly onDidRevert: Event<IFileWorkingCopy<T>>;

	readonly fileWorkingCopies: IFileWorkingCopy<T>[];
}

export interface IFileWorkingCopySaveEvent<T extends IFileWorkingCopyModel> {
	workingCopy: IFileWorkingCopy<T>;
	reason: SaveReason;
}

export interface IFileWorkingCopyLoadOrCreateOptions {

	/**
	 * The contents to use for the file working copy if known.
	 * If not provided, the contents will be retrieved from the
	 * underlying resource or backup if present.
	 */
	contents?: VSBufferReadableStream;

	/**
	 * If the file working copy was already loaded before,
	 * allows to trigger a reload of it to fetch the latest contents:
	 * - async: resolve() will return immediately and trigger
	 * a reload that will run in the background.
	 * - sync: resolve() will only return resolved when the
	 * file working copy has finished reloading.
	 */
	reload?: {
		async: boolean
	};
}

export interface IFileWorkingCopyManagerDelegate<T extends IFileWorkingCopyModel> {

	createFileWorkingCopy(resource: URI): IFileWorkingCopy<T>;
}

export class FileWorkingCopyManager<T extends IFileWorkingCopyModel> extends Disposable {

	//#region Events

	private readonly _onDidCreate = this._register(new Emitter<IFileWorkingCopy<T>>());
	readonly onDidCreate = this._onDidCreate.event;

	private readonly _onDidLoad = this._register(new Emitter<IFileWorkingCopy<T>>());
	readonly onDidLoad = this._onDidLoad.event;

	private readonly _onDidChangeDirty = this._register(new Emitter<IFileWorkingCopy<T>>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	private readonly _onDidSaveError = this._register(new Emitter<IFileWorkingCopy<T>>());
	readonly onDidSaveError = this._onDidSaveError.event;

	private readonly _onDidSave = this._register(new Emitter<IFileWorkingCopySaveEvent<T>>());
	readonly onDidSave = this._onDidSave.event;

	private readonly _onDidRevert = this._register(new Emitter<IFileWorkingCopy<T>>());
	readonly onDidRevert = this._onDidRevert.event;

	//#endregion

	private readonly mapResourceToFileWorkingCopy = new ResourceMap<IFileWorkingCopy<T>>();
	private readonly mapResourceToFileWorkingCopyListeners = new ResourceMap<IDisposable>();
	private readonly mapResourceToDisposeListener = new ResourceMap<IDisposable>();
	private readonly mapResourceToPendingFileWorkingCopyLoaders = new ResourceMap<Promise<IFileWorkingCopy<T>>>();

	private readonly fileWorkingCopyLoadQueue = this._register(new ResourceQueue());

	get fileWorkingCopies(): IFileWorkingCopy<T>[] {
		return [...this.mapResourceToFileWorkingCopy.values()];
	}

	constructor(
		private readonly delegate: IFileWorkingCopyManagerDelegate<T>,
		@IFileService private readonly fileService: IFileService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Update file working copies from file change events
		this._register(this.fileService.onDidFilesChange(e => this.onDidFilesChange(e)));

		// Lifecycle
		this.lifecycleService.onShutdown(() => this.dispose);
	}

	private onDidFilesChange(e: FileChangesEvent): void {
		for (const fileWorkingCopy of this.fileWorkingCopies) {
			if (fileWorkingCopy.isDirty() || !fileWorkingCopy.isResolved()) {
				continue; // require a resolved, saved file working copy to continue
			}

			// Trigger a load for any update or add event that impacts
			// the file working copy. We also consider the added event
			// because it could be that a file was added and updated
			// right after.
			if (e.contains(fileWorkingCopy.resource, FileChangeType.UPDATED, FileChangeType.ADDED)) {
				this.queueFileWorkingCopyLoad(fileWorkingCopy);
			}
		}
	}

	private queueFileWorkingCopyLoad(fileWorkingCopy: IFileWorkingCopy<T>): void {

		// Load file working copy to update (use a queue to prevent accumulation of
		// loads when the load actually takes long. At most we only want the queue
		// to have a size of 2 (1 running load and 1 queued load).
		const queue = this.fileWorkingCopyLoadQueue.queueFor(fileWorkingCopy.resource);
		if (queue.size <= 1) {
			queue.queue(async () => {
				try {
					await fileWorkingCopy.load();
				} catch (error) {
					onUnexpectedError(error);
				}
			});
		}
	}

	get(resource: URI): IFileWorkingCopy<T> | undefined {
		return this.mapResourceToFileWorkingCopy.get(resource);
	}

	async resolve(resource: URI, options?: IFileWorkingCopyLoadOrCreateOptions): Promise<IFileWorkingCopy<T>> {

		// Await a pending file working copy load first before proceeding
		// to ensure that we never load a file working copy more than once
		// in parallel
		const pendingResolve = this.joinPendingResolve(resource);
		if (pendingResolve) {
			await pendingResolve;
		}

		let fileWorkingCopyPromise: Promise<IFileWorkingCopy<T>>;
		let fileWorkingCopy = this.get(resource);
		let didCreateFileWorkingCopy = false;

		// File working copy exists
		if (fileWorkingCopy) {

			// Always reload if contents are provided
			if (options?.contents) {
				fileWorkingCopyPromise = fileWorkingCopy.load(options);
			}

			// Reload async or sync based on options
			else if (options?.reload) {

				// async reload: trigger a reload but return immediately
				if (options.reload.async) {
					fileWorkingCopyPromise = Promise.resolve(fileWorkingCopy);
					fileWorkingCopy.load(options);
				}

				// sync reload: do not return until file working copy reloaded
				else {
					fileWorkingCopyPromise = fileWorkingCopy.load(options);
				}
			}

			// Do not reload
			else {
				fileWorkingCopyPromise = Promise.resolve(fileWorkingCopy);
			}
		}

		// File working copy does not exist
		else {
			didCreateFileWorkingCopy = true;

			const newFileWorkingCopy = fileWorkingCopy = this.delegate.createFileWorkingCopy(resource);
			fileWorkingCopyPromise = fileWorkingCopy.load(options);

			this.registerFileWorkingCopy(newFileWorkingCopy);
		}

		// Store pending loads to avoid race conditions
		this.mapResourceToPendingFileWorkingCopyLoaders.set(resource, fileWorkingCopyPromise);

		// Make known to manager (if not already known)
		this.add(resource, fileWorkingCopy);

		// Emit some events if we created the file working copy
		if (didCreateFileWorkingCopy) {
			this._onDidCreate.fire(fileWorkingCopy);

			// If the file working copy is dirty right from the beginning,
			// make sure to emit this as an event
			if (fileWorkingCopy.isDirty()) {
				this._onDidChangeDirty.fire(fileWorkingCopy);
			}
		}

		try {
			const resolvedFileWorkingCopy = await fileWorkingCopyPromise;

			// Remove from pending loads
			this.mapResourceToPendingFileWorkingCopyLoaders.delete(resource);

			// File working copy can be dirty if a backup was restored, so we make sure to
			// have this event delivered if we created the file working copy here
			if (didCreateFileWorkingCopy && resolvedFileWorkingCopy.isDirty()) {
				this._onDidChangeDirty.fire(resolvedFileWorkingCopy);
			}

			return resolvedFileWorkingCopy;
		} catch (error) {

			// Free resources of this invalid file working copy
			if (fileWorkingCopy) {
				fileWorkingCopy.dispose();
			}

			// Remove from pending loads
			this.mapResourceToPendingFileWorkingCopyLoaders.delete(resource);

			throw error;
		}
	}

	private joinPendingResolve(resource: URI): Promise<void> | undefined {
		const pendingFileWorkingCopyLoad = this.mapResourceToPendingFileWorkingCopyLoaders.get(resource);
		if (pendingFileWorkingCopyLoad) {
			return pendingFileWorkingCopyLoad.then(undefined, error => {/* ignore any error here, it will bubble to the original requestor*/ });
		}

		return undefined;
	}

	private registerFileWorkingCopy(fileWorkingCopy: IFileWorkingCopy<T>): void {

		// Install file working copy listeners
		const fileWorkingCopyListeners = new DisposableStore();
		fileWorkingCopyListeners.add(fileWorkingCopy.onDidLoad(reason => this._onDidLoad.fire(fileWorkingCopy)));
		fileWorkingCopyListeners.add(fileWorkingCopy.onDidChangeDirty(() => this._onDidChangeDirty.fire(fileWorkingCopy)));
		fileWorkingCopyListeners.add(fileWorkingCopy.onDidSaveError(() => this._onDidSaveError.fire(fileWorkingCopy)));
		fileWorkingCopyListeners.add(fileWorkingCopy.onDidSave(reason => this._onDidSave.fire({ workingCopy: fileWorkingCopy, reason })));
		fileWorkingCopyListeners.add(fileWorkingCopy.onDidRevert(() => this._onDidRevert.fire(fileWorkingCopy)));

		// Keep for disposal
		this.mapResourceToFileWorkingCopyListeners.set(fileWorkingCopy.resource, fileWorkingCopyListeners);
	}

	protected add(resource: URI, fileWorkingCopy: IFileWorkingCopy<T>): void {
		const knownFileWorkingCopy = this.mapResourceToFileWorkingCopy.get(resource);
		if (knownFileWorkingCopy === fileWorkingCopy) {
			return; // already cached
		}

		// dispose any previously stored dispose listener for this resource
		const disposeListener = this.mapResourceToDisposeListener.get(resource);
		if (disposeListener) {
			disposeListener.dispose();
		}

		// store in cache but remove when file working copy gets disposed
		this.mapResourceToFileWorkingCopy.set(resource, fileWorkingCopy);
		this.mapResourceToDisposeListener.set(resource, fileWorkingCopy.onDispose(() => this.remove(resource)));
	}

	protected remove(resource: URI): void {
		this.mapResourceToFileWorkingCopy.delete(resource);

		const disposeListener = this.mapResourceToDisposeListener.get(resource);
		if (disposeListener) {
			dispose(disposeListener);
			this.mapResourceToDisposeListener.delete(resource);
		}

		const fileWorkingCopyListener = this.mapResourceToFileWorkingCopyListeners.get(resource);
		if (fileWorkingCopyListener) {
			dispose(fileWorkingCopyListener);
			this.mapResourceToFileWorkingCopyListeners.delete(resource);
		}
	}

	clear(): void {

		// file working copy caches
		this.mapResourceToFileWorkingCopy.clear();
		this.mapResourceToPendingFileWorkingCopyLoaders.clear();

		// dispose the dispose listeners
		this.mapResourceToDisposeListener.forEach(listener => listener.dispose());
		this.mapResourceToDisposeListener.clear();

		// dispose the file working copy change listeners
		this.mapResourceToFileWorkingCopyListeners.forEach(listener => listener.dispose());
		this.mapResourceToFileWorkingCopyListeners.clear();
	}

	canDispose(fileWorkingCopy: IFileWorkingCopy<T>): true | Promise<true> {

		// quick return if file working copy already disposed or not dirty and not loading
		if (
			fileWorkingCopy.isDisposed() ||
			(!this.mapResourceToPendingFileWorkingCopyLoaders.has(fileWorkingCopy.resource) && !fileWorkingCopy.isDirty())
		) {
			return true;
		}

		// promise based return in all other cases
		return this.doCanDispose(fileWorkingCopy);
	}

	private async doCanDispose(fileWorkingCopy: IFileWorkingCopy<T>): Promise<true> {

		// if we have a pending file working copy load, await it first and then try again
		const pendingResolve = this.joinPendingResolve(fileWorkingCopy.resource);
		if (pendingResolve) {
			await pendingResolve;

			return this.canDispose(fileWorkingCopy);
		}

		// dirty file working copy: we do not allow to dispose dirty file working copys
		// to prevent data loss cases. dirty file working copys can only be disposed when
		// they are either saved or reverted
		if (fileWorkingCopy.isDirty()) {
			await Event.toPromise(fileWorkingCopy.onDidChangeDirty);

			return this.canDispose(fileWorkingCopy);
		}

		return true;
	}

	dispose(): void {
		super.dispose();

		this.clear();
	}
}
