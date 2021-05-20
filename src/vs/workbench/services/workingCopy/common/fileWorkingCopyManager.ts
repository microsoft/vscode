/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { FileWorkingCopy, FileWorkingCopyState, IFileWorkingCopy, IFileWorkingCopyModel, IFileWorkingCopyModelFactory, IFileWorkingCopyResolveOptions } from 'vs/workbench/services/workingCopy/common/fileWorkingCopy';
import { SaveReason } from 'vs/workbench/common/editor';
import { ResourceMap } from 'vs/base/common/map';
import { Promises, ResourceQueue } from 'vs/base/common/async';
import { FileChangesEvent, FileChangeType, FileOperation, IFileService } from 'vs/platform/files/common/files';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { VSBufferReadableStream } from 'vs/base/common/buffer';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILogService } from 'vs/platform/log/common/log';
import { joinPath } from 'vs/base/common/resources';
import { IWorkingCopyFileService, WorkingCopyFileEvent } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import { IUriIdentityService } from 'vs/workbench/services/uriIdentity/common/uriIdentity';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IWorkingCopyBackupService } from 'vs/workbench/services/workingCopy/common/workingCopyBackup';
import { BaseFileWorkingCopyManager, IBaseFileWorkingCopyManager } from 'vs/workbench/services/workingCopy/common/abstractFileWorkingCopyManager';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IElevatedFileService } from 'vs/workbench/services/files/common/elevatedFileService';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IWorkingCopyEditorService } from 'vs/workbench/services/workingCopy/common/workingCopyEditorService';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';

/**
 * The only one that should be dealing with `IFileWorkingCopy` and handle all
 * operations that are working copy related, such as save/revert, backup
 * and resolving.
 */
export interface IFileWorkingCopyManager<M extends IFileWorkingCopyModel> extends IBaseFileWorkingCopyManager<M, IFileWorkingCopy<M>> {

	/**
	 * An event for when a file working copy was resolved.
	 */
	readonly onDidResolve: Event<IFileWorkingCopy<M>>;

	/**
	 * An event for when a file working copy changed it's dirty state.
	 */
	readonly onDidChangeDirty: Event<IFileWorkingCopy<M>>;

	/**
	 * An event for when a file working copy failed to save.
	 */
	readonly onDidSaveError: Event<IFileWorkingCopy<M>>;

	/**
	 * An event for when a file working copy successfully saved.
	 */
	readonly onDidSave: Event<IFileWorkingCopySaveEvent<M>>;

	/**
	 * An event for when a file working copy was reverted.
	 */
	readonly onDidRevert: Event<IFileWorkingCopy<M>>;

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
	 * @param options
	 */
	resolve(resource: URI, options?: IFileWorkingCopyManagerResolveOptions): Promise<IFileWorkingCopy<M>>;

	/**
	 * Waits for the file working copy to be ready to be disposed. There may be
	 * conditions under which the file working copy cannot be disposed, e.g. when
	 * it is dirty. Once the promise is settled, it is safe to dispose.
	 */
	canDispose(workingCopy: IFileWorkingCopy<M>): true | Promise<true>;


	/**
	 * @deprecated
	 */
	saveAs(source: URI, target: URI): Promise<IFileWorkingCopy<M> | undefined>;
	saveAs(source: URI, target: undefined): Promise<IFileWorkingCopy<M> | undefined>;
}

export interface IFileWorkingCopySaveEvent<M extends IFileWorkingCopyModel> {

	/**
	 * The file working copy that was successfully saved.
	 */
	workingCopy: IFileWorkingCopy<M>;

	/**
	 * The reason why the file working copy was saved.
	 */
	reason: SaveReason;
}

export interface IFileWorkingCopyManagerResolveOptions extends IFileWorkingCopyResolveOptions {

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

export class FileWorkingCopyManager<M extends IFileWorkingCopyModel> extends BaseFileWorkingCopyManager<M, IFileWorkingCopy<M>> implements IFileWorkingCopyManager<M> {

	//#region Events

	private readonly _onDidResolve = this._register(new Emitter<IFileWorkingCopy<M>>());
	readonly onDidResolve = this._onDidResolve.event;

	private readonly _onDidChangeDirty = this._register(new Emitter<IFileWorkingCopy<M>>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	private readonly _onDidSaveError = this._register(new Emitter<IFileWorkingCopy<M>>());
	readonly onDidSaveError = this._onDidSaveError.event;

	private readonly _onDidSave = this._register(new Emitter<IFileWorkingCopySaveEvent<M>>());
	readonly onDidSave = this._onDidSave.event;

	private readonly _onDidRevert = this._register(new Emitter<IFileWorkingCopy<M>>());
	readonly onDidRevert = this._onDidRevert.event;

	//#endregion

	private readonly mapResourceToWorkingCopyListeners = new ResourceMap<IDisposable>();
	private readonly mapResourceToPendingWorkingCopyResolve = new ResourceMap<Promise<void>>();

	private readonly workingCopyResolveQueue = this._register(new ResourceQueue());

	constructor(
		private readonly workingCopyTypeId: string,
		private readonly modelFactory: IFileWorkingCopyModelFactory<M>,
		@IFileService fileService: IFileService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@ILabelService private readonly labelService: ILabelService,
		@ILogService logService: ILogService,
		@IWorkingCopyFileService private readonly workingCopyFileService: IWorkingCopyFileService,
		@IWorkingCopyBackupService workingCopyBackupService: IWorkingCopyBackupService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkingCopyEditorService private readonly workingCopyEditorService: IWorkingCopyEditorService,
		@IEditorService private readonly editorService: IEditorService,
		@IElevatedFileService private readonly elevatedFileService: IElevatedFileService
	) {
		super(fileService, logService, workingCopyBackupService);

		this.registerListeners();
	}

	private registerListeners(): void {

		// Update working copies from file change events
		this._register(this.fileService.onDidFilesChange(e => this.onDidFilesChange(e)));

		// Working copy operations
		this._register(this.workingCopyFileService.onWillRunWorkingCopyFileOperation(e => this.onWillRunWorkingCopyFileOperation(e)));
		this._register(this.workingCopyFileService.onDidFailWorkingCopyFileOperation(e => this.onDidFailWorkingCopyFileOperation(e)));
		this._register(this.workingCopyFileService.onDidRunWorkingCopyFileOperation(e => this.onDidRunWorkingCopyFileOperation(e)));

		// Lifecycle
		this.lifecycleService.onWillShutdown(event => event.join(this.onWillShutdown(), 'join.fileWorkingCopyManager'));
	}

	private async onWillShutdown(): Promise<void> {
		let fileWorkingCopies: IFileWorkingCopy<M>[];

		// As long as file working copies are pending to be saved, we prolong the shutdown
		// until that has happened to ensure we are not shutting down in the middle of
		// writing to the working copy (https://github.com/microsoft/vscode/issues/116600).
		while ((fileWorkingCopies = this.workingCopies.filter(workingCopy => workingCopy.hasState(FileWorkingCopyState.PENDING_SAVE))).length > 0) {
			await Promises.settled(fileWorkingCopies.map(workingCopy => workingCopy.joinState(FileWorkingCopyState.PENDING_SAVE)));
		}
	}

	//#region Resolve from file changes

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

	private queueWorkingCopyResolve(workingCopy: IFileWorkingCopy<M>): void {

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

	//#endregion

	//#region Working Copy File Events

	private readonly mapCorrelationIdToWorkingCopiesToRestore = new Map<number, { source: URI, target: URI, snapshot?: VSBufferReadableStream; }[]>();

	private onWillRunWorkingCopyFileOperation(e: WorkingCopyFileEvent): void {

		// Move / Copy: remember working copies to restore after the operation
		if (e.operation === FileOperation.MOVE || e.operation === FileOperation.COPY) {
			e.waitUntil((async () => {
				const workingCopiesToRestore: { source: URI, target: URI, snapshot?: VSBufferReadableStream; }[] = [];

				for (const { source, target } of e.files) {
					if (source) {
						if (this.uriIdentityService.extUri.isEqual(source, target)) {
							continue; // ignore if resources are considered equal
						}

						// Find all working copies that related to source (can be many if resource is a folder)
						const sourceWorkingCopies: IFileWorkingCopy<M>[] = [];
						for (const workingCopy of this.workingCopies) {
							if (this.uriIdentityService.extUri.isEqualOrParent(workingCopy.resource, source)) {
								sourceWorkingCopies.push(workingCopy);
							}
						}

						// Remember each source working copy to load again after move is done
						// with optional content to restore if it was dirty
						for (const sourceWorkingCopy of sourceWorkingCopies) {
							const sourceResource = sourceWorkingCopy.resource;

							// If the source is the actual working copy, just use target as new resource
							let targetResource: URI;
							if (this.uriIdentityService.extUri.isEqual(sourceResource, source)) {
								targetResource = target;
							}

							// Otherwise a parent folder of the source is being moved, so we need
							// to compute the target resource based on that
							else {
								targetResource = joinPath(target, sourceResource.path.substr(source.path.length + 1));
							}

							workingCopiesToRestore.push({
								source: sourceResource,
								target: targetResource,
								snapshot: sourceWorkingCopy.isDirty() ? await sourceWorkingCopy.model?.snapshot(CancellationToken.None) : undefined
							});
						}
					}
				}

				this.mapCorrelationIdToWorkingCopiesToRestore.set(e.correlationId, workingCopiesToRestore);
			})());
		}
	}

	private onDidFailWorkingCopyFileOperation(e: WorkingCopyFileEvent): void {

		// Move / Copy: restore dirty flag on working copies to restore that were dirty
		if ((e.operation === FileOperation.MOVE || e.operation === FileOperation.COPY)) {
			const workingCopiesToRestore = this.mapCorrelationIdToWorkingCopiesToRestore.get(e.correlationId);
			if (workingCopiesToRestore) {
				this.mapCorrelationIdToWorkingCopiesToRestore.delete(e.correlationId);

				workingCopiesToRestore.forEach(workingCopy => {

					// Snapshot presence means this working copy used to be dirty and so we restore that
					// flag. we do NOT have to restore the content because the working copy was only soft
					// reverted and did not loose its original dirty contents.
					if (workingCopy.snapshot) {
						this.get(workingCopy.source)?.markDirty();
					}
				});
			}
		}
	}

	private onDidRunWorkingCopyFileOperation(e: WorkingCopyFileEvent): void {
		switch (e.operation) {

			// Create: Revert existing working copies
			case FileOperation.CREATE:
				e.waitUntil((async () => {
					for (const { target } of e.files) {
						const workingCopy = this.get(target);
						if (workingCopy && !workingCopy.isDisposed()) {
							await workingCopy.revert();
						}
					}
				})());
				break;

			// Move/Copy: restore working copies that were loaded before the operation took place
			case FileOperation.MOVE:
			case FileOperation.COPY:
				e.waitUntil((async () => {
					const workingCopiesToRestore = this.mapCorrelationIdToWorkingCopiesToRestore.get(e.correlationId);
					if (workingCopiesToRestore) {
						this.mapCorrelationIdToWorkingCopiesToRestore.delete(e.correlationId);

						await Promises.settled(workingCopiesToRestore.map(async workingCopyToRestore => {

							// Restore the working copy at the target. if we have previous dirty content, we pass it
							// over to be used, otherwise we force a reload from disk. this is important
							// because we know the file has changed on disk after the move and the working copy might
							// have still existed with the previous state. this ensures that the working copy is not
							// tracking a stale state.
							await this.resolve(workingCopyToRestore.target, {
								reload: { async: false }, // enforce a reload
								contents: workingCopyToRestore.snapshot
							});
						}));
					}
				})());
				break;
		}
	}

	//#endregion

	//#region Resolve

	async resolve(resource: URI, options?: IFileWorkingCopyManagerResolveOptions): Promise<IFileWorkingCopy<M>> {

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

				// Async reload: trigger a reload but return immediately
				if (options.reload.async) {
					workingCopy.resolve(options);
					workingCopyResolve = Promise.resolve();
				}

				// Sync reload: do not return until working copy reloaded
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

			workingCopy = new FileWorkingCopy(
				this.workingCopyTypeId,
				resource,
				this.labelService.getUriBasenameLabel(resource),
				this.modelFactory,
				this.fileService, this.logService, this.textFileService, this.filesConfigurationService,
				this.workingCopyBackupService, this.workingCopyService, this.notificationService, this.workingCopyEditorService,
				this.editorService, this.elevatedFileService
			);

			workingCopyResolve = workingCopy.resolve(options);

			this.registerWorkingCopy(workingCopy);
		}

		// Store pending resolve to avoid race conditions
		this.mapResourceToPendingWorkingCopyResolve.set(resource, workingCopyResolve);

		// Make known to manager (if not already known)
		this.add(resource, workingCopy);

		// Emit some events if we created the working copy
		if (didCreateWorkingCopy) {

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

	private registerWorkingCopy(workingCopy: IFileWorkingCopy<M>): void {

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

	protected override remove(resource: URI): void {
		super.remove(resource);

		// Dispose any exsting working copy listeners
		const workingCopyListener = this.mapResourceToWorkingCopyListeners.get(resource);
		if (workingCopyListener) {
			dispose(workingCopyListener);
			this.mapResourceToWorkingCopyListeners.delete(resource);
		}
	}

	//#endregion

	//#region Lifecycle

	canDispose(workingCopy: IFileWorkingCopy<M>): true | Promise<true> {

		// Quick return if working copy already disposed or not dirty and not resolving
		if (
			workingCopy.isDisposed() ||
			(!this.mapResourceToPendingWorkingCopyResolve.has(workingCopy.resource) && !workingCopy.isDirty())
		) {
			return true;
		}

		// Promise based return in all other cases
		return this.doCanDispose(workingCopy);
	}

	private async doCanDispose(workingCopy: IFileWorkingCopy<M>): Promise<true> {

		// If we have a pending working copy resolve, await it first and then try again
		const pendingResolve = this.joinPendingResolve(workingCopy.resource);
		if (pendingResolve) {
			await pendingResolve;

			return this.canDispose(workingCopy);
		}

		// Dirty working copy: we do not allow to dispose dirty working copys
		// to prevent data loss cases. dirty working copys can only be disposed when
		// they are either saved or reverted
		if (workingCopy.isDirty()) {
			await Event.toPromise(workingCopy.onDidChangeDirty);

			return this.canDispose(workingCopy);
		}

		return true;
	}

	override dispose(): void {
		super.dispose();

		// Clear pending working copy resolves
		this.mapResourceToPendingWorkingCopyResolve.clear();

		// Dispose the working copy change listeners
		dispose(this.mapResourceToWorkingCopyListeners.values());
		this.mapResourceToWorkingCopyListeners.clear();
	}

	//#endregion


	//#region Save As...

	/**
	 * @deprecated TODO@bpasero remove
	 */
	async saveAs(source: URI, target?: URI): Promise<IFileWorkingCopy<M> | undefined> {

		// If not provided, ask user for target
		if (!target) {
			target = await this.fileDialogService.pickFileToSave(source);

			if (!target) {
				return undefined; // user canceled
			}
		}

		// Do it
		return this.doSaveAs(source, target);
	}

	private async doSaveAs(source: URI, target: URI): Promise<IFileWorkingCopy<M> | undefined> {
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
		return this.doSaveAsWorkingCopy(source, sourceContents, target);
	}

	private async doSaveAsWorkingCopy(source: URI, sourceContents: VSBufferReadableStream, target: URI): Promise<IFileWorkingCopy<M>> {

		// Prefer an existing working copy if it is already resolved
		// for the given target resource
		let targetExists = false;
		let targetWorkingCopy = this.get(target);
		if (targetWorkingCopy?.isResolved()) {
			targetExists = true;
		}

		// Otherwise create the target working copy empty if
		// it does not exist already and resolve it from there
		else {
			targetExists = await this.fileService.exists(target);

			// Create target file adhoc if it does not exist yet
			if (!targetExists) {
				await this.workingCopyFileService.create([{ resource: target }], CancellationToken.None);
			}

			// At this point we need to resolve the target working copy
			// and we have to do an explicit check if the source URI
			// equals the target via URI identity. If they match and we
			// have had an existing working copy with the source, we
			// prefer that one over resolving the target. Otherwiese we
			// would potentially introduce a
			if (this.uriIdentityService.extUri.isEqual(source, target) && this.get(source)) {
				targetWorkingCopy = await this.resolve(source);
			} else {
				targetWorkingCopy = await this.resolve(target);
			}
		}

		// Take over content from source to target
		await targetWorkingCopy.model?.update(sourceContents, CancellationToken.None);

		// Save target
		await targetWorkingCopy.save({ force: true  /* force to save, even if not dirty (https://github.com/microsoft/vscode/issues/99619) */ });

		// Revert the source
		await this.doRevert(source);

		return targetWorkingCopy;
	}

	private async doRevert(resource: URI): Promise<void> {
		const workingCopy = this.get(resource);
		if (!workingCopy) {
			return undefined;
		}

		return workingCopy.revert();
	}

	//#endregion
}
