/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { StoredFileWorkingCopy, StoredFileWorkingCopyState, IStoredFileWorkingCopy, IStoredFileWorkingCopyModel, IStoredFileWorkingCopyModelFactory, IStoredFileWorkingCopyResolveOptions, IStoredFileWorkingCopySaveEvent as IBaseStoredFileWorkingCopySaveEvent } from 'vs/workbench/services/workingCopy/common/storedFileWorkingCopy';
import { ResourceMap } from 'vs/base/common/map';
import { Promises, ResourceQueue } from 'vs/base/common/async';
import { FileChangesEvent, FileChangeType, FileOperation, IFileService, IFileSystemProviderCapabilitiesChangeEvent, IFileSystemProviderRegistrationEvent } from 'vs/platform/files/common/files';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { VSBufferReadableStream } from 'vs/base/common/buffer';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILogService } from 'vs/platform/log/common/log';
import { joinPath } from 'vs/base/common/resources';
import { IWorkingCopyFileService, WorkingCopyFileEvent } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IWorkingCopyBackupService } from 'vs/workbench/services/workingCopy/common/workingCopyBackup';
import { BaseFileWorkingCopyManager, IBaseFileWorkingCopyManager } from 'vs/workbench/services/workingCopy/common/abstractFileWorkingCopyManager';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IElevatedFileService } from 'vs/workbench/services/files/common/elevatedFileService';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { IWorkingCopyEditorService } from 'vs/workbench/services/workingCopy/common/workingCopyEditorService';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { isWeb } from 'vs/base/common/platform';
import { onUnexpectedError } from 'vs/base/common/errors';
import { SnapshotContext } from 'vs/workbench/services/workingCopy/common/fileWorkingCopy';

/**
 * The only one that should be dealing with `IStoredFileWorkingCopy` and handle all
 * operations that are working copy related, such as save/revert, backup
 * and resolving.
 */
export interface IStoredFileWorkingCopyManager<M extends IStoredFileWorkingCopyModel> extends IBaseFileWorkingCopyManager<M, IStoredFileWorkingCopy<M>> {

	/**
	 * An event for when a stored file working copy was resolved.
	 */
	readonly onDidResolve: Event<IStoredFileWorkingCopy<M>>;

	/**
	 * An event for when a stored file working copy changed it's dirty state.
	 */
	readonly onDidChangeDirty: Event<IStoredFileWorkingCopy<M>>;

	/**
	 * An event for when a stored file working copy changed it's readonly state.
	 */
	readonly onDidChangeReadonly: Event<IStoredFileWorkingCopy<M>>;

	/**
	 * An event for when a stored file working copy changed it's orphaned state.
	 */
	readonly onDidChangeOrphaned: Event<IStoredFileWorkingCopy<M>>;

	/**
	 * An event for when a stored file working copy failed to save.
	 */
	readonly onDidSaveError: Event<IStoredFileWorkingCopy<M>>;

	/**
	 * An event for when a stored file working copy successfully saved.
	 */
	readonly onDidSave: Event<IStoredFileWorkingCopySaveEvent<M>>;

	/**
	 * An event for when a stored file working copy was reverted.
	 */
	readonly onDidRevert: Event<IStoredFileWorkingCopy<M>>;

	/**
	 * An event for when a stored file working copy is removed from the manager.
	 */
	readonly onDidRemove: Event<URI>;

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
	resolve(resource: URI, options?: IStoredFileWorkingCopyManagerResolveOptions): Promise<IStoredFileWorkingCopy<M>>;

	/**
	 * Waits for the stored file working copy to be ready to be disposed. There may be
	 * conditions under which the stored file working copy cannot be disposed, e.g. when
	 * it is dirty. Once the promise is settled, it is safe to dispose.
	 */
	canDispose(workingCopy: IStoredFileWorkingCopy<M>): true | Promise<true>;
}

export interface IStoredFileWorkingCopySaveEvent<M extends IStoredFileWorkingCopyModel> extends IBaseStoredFileWorkingCopySaveEvent {

	/**
	 * The stored file working copy that was successfully saved.
	 */
	readonly workingCopy: IStoredFileWorkingCopy<M>;
}

export interface IStoredFileWorkingCopyManagerResolveOptions extends IStoredFileWorkingCopyResolveOptions {

	/**
	 * If the stored file working copy was already resolved before,
	 * allows to trigger a reload of it to fetch the latest contents.
	 */
	readonly reload?: {

		/**
		 * Controls whether the reload happens in the background
		 * or whether `resolve` will await the reload to happen.
		 */
		readonly async: boolean;

		/**
		 * Controls whether to force reading the contents from the
		 * underlying resource even if the resource did not change.
		 */
		readonly force?: boolean;
	};
}

export class StoredFileWorkingCopyManager<M extends IStoredFileWorkingCopyModel> extends BaseFileWorkingCopyManager<M, IStoredFileWorkingCopy<M>> implements IStoredFileWorkingCopyManager<M> {

	//#region Events

	private readonly _onDidResolve = this._register(new Emitter<IStoredFileWorkingCopy<M>>());
	readonly onDidResolve = this._onDidResolve.event;

	private readonly _onDidChangeDirty = this._register(new Emitter<IStoredFileWorkingCopy<M>>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	private readonly _onDidChangeReadonly = this._register(new Emitter<IStoredFileWorkingCopy<M>>());
	readonly onDidChangeReadonly = this._onDidChangeReadonly.event;

	private readonly _onDidChangeOrphaned = this._register(new Emitter<IStoredFileWorkingCopy<M>>());
	readonly onDidChangeOrphaned = this._onDidChangeOrphaned.event;

	private readonly _onDidSaveError = this._register(new Emitter<IStoredFileWorkingCopy<M>>());
	readonly onDidSaveError = this._onDidSaveError.event;

	private readonly _onDidSave = this._register(new Emitter<IStoredFileWorkingCopySaveEvent<M>>());
	readonly onDidSave = this._onDidSave.event;

	private readonly _onDidRevert = this._register(new Emitter<IStoredFileWorkingCopy<M>>());
	readonly onDidRevert = this._onDidRevert.event;

	private readonly _onDidRemove = this._register(new Emitter<URI>());
	readonly onDidRemove = this._onDidRemove.event;

	//#endregion

	private readonly mapResourceToWorkingCopyListeners = new ResourceMap<IDisposable>();
	private readonly mapResourceToPendingWorkingCopyResolve = new ResourceMap<Promise<void>>();

	private readonly workingCopyResolveQueue = this._register(new ResourceQueue());

	constructor(
		private readonly workingCopyTypeId: string,
		private readonly modelFactory: IStoredFileWorkingCopyModelFactory<M>,
		@IFileService fileService: IFileService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@ILabelService private readonly labelService: ILabelService,
		@ILogService logService: ILogService,
		@IWorkingCopyFileService private readonly workingCopyFileService: IWorkingCopyFileService,
		@IWorkingCopyBackupService workingCopyBackupService: IWorkingCopyBackupService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
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

		// File system provider changes
		this._register(this.fileService.onDidChangeFileSystemProviderCapabilities(e => this.onDidChangeFileSystemProviderCapabilities(e)));
		this._register(this.fileService.onDidChangeFileSystemProviderRegistrations(e => this.onDidChangeFileSystemProviderRegistrations(e)));

		// Working copy operations
		this._register(this.workingCopyFileService.onWillRunWorkingCopyFileOperation(e => this.onWillRunWorkingCopyFileOperation(e)));
		this._register(this.workingCopyFileService.onDidFailWorkingCopyFileOperation(e => this.onDidFailWorkingCopyFileOperation(e)));
		this._register(this.workingCopyFileService.onDidRunWorkingCopyFileOperation(e => this.onDidRunWorkingCopyFileOperation(e)));

		// Lifecycle
		if (isWeb) {
			this._register(this.lifecycleService.onBeforeShutdown(event => event.veto(this.onBeforeShutdownWeb(), 'veto.fileWorkingCopyManager')));
		} else {
			this._register(this.lifecycleService.onWillShutdown(event => event.join(this.onWillShutdownDesktop(), { id: 'join.fileWorkingCopyManager', label: localize('join.fileWorkingCopyManager', "Saving working copies") })));
		}
	}

	private onBeforeShutdownWeb(): boolean {
		if (this.workingCopies.some(workingCopy => workingCopy.hasState(StoredFileWorkingCopyState.PENDING_SAVE))) {
			// stored file working copies are pending to be saved:
			// veto because web does not support long running shutdown
			return true;
		}

		return false;
	}

	private async onWillShutdownDesktop(): Promise<void> {
		let pendingSavedWorkingCopies: IStoredFileWorkingCopy<M>[];

		// As long as stored file working copies are pending to be saved, we prolong the shutdown
		// until that has happened to ensure we are not shutting down in the middle of
		// writing to the working copy (https://github.com/microsoft/vscode/issues/116600).
		while ((pendingSavedWorkingCopies = this.workingCopies.filter(workingCopy => workingCopy.hasState(StoredFileWorkingCopyState.PENDING_SAVE))).length > 0) {
			await Promises.settled(pendingSavedWorkingCopies.map(workingCopy => workingCopy.joinState(StoredFileWorkingCopyState.PENDING_SAVE)));
		}
	}

	//#region Resolve from file or file provider changes

	private onDidChangeFileSystemProviderCapabilities(e: IFileSystemProviderCapabilitiesChangeEvent): void {

		// Resolve working copies again for file systems that changed
		// capabilities to fetch latest metadata (e.g. readonly)
		// into all working copies.
		this.queueWorkingCopyReloads(e.scheme);
	}

	private onDidChangeFileSystemProviderRegistrations(e: IFileSystemProviderRegistrationEvent): void {
		if (!e.added) {
			return; // only if added
		}

		// Resolve working copies again for file systems that registered
		// to account for capability changes: extensions may unregister
		// and register the same provider with different capabilities,
		// so we want to ensure to fetch latest metadata (e.g. readonly)
		// into all working copies.
		this.queueWorkingCopyReloads(e.scheme);
	}

	private onDidFilesChange(e: FileChangesEvent): void {

		// Trigger a resolve for any update or add event that impacts
		// the working copy. We also consider the added event
		// because it could be that a file was added and updated
		// right after.
		this.queueWorkingCopyReloads(e);
	}

	private queueWorkingCopyReloads(scheme: string): void;
	private queueWorkingCopyReloads(e: FileChangesEvent): void;
	private queueWorkingCopyReloads(schemeOrEvent: string | FileChangesEvent): void {
		for (const workingCopy of this.workingCopies) {
			if (workingCopy.isDirty()) {
				continue; // never reload dirty working copies
			}

			let resolveWorkingCopy = false;
			if (typeof schemeOrEvent === 'string') {
				resolveWorkingCopy = schemeOrEvent === workingCopy.resource.scheme;
			} else {
				resolveWorkingCopy = schemeOrEvent.contains(workingCopy.resource, FileChangeType.UPDATED, FileChangeType.ADDED);
			}

			if (resolveWorkingCopy) {
				this.queueWorkingCopyReload(workingCopy);
			}
		}
	}

	private queueWorkingCopyReload(workingCopy: IStoredFileWorkingCopy<M>): void {

		// Resolves a working copy to update (use a queue to prevent accumulation of
		// resolve when the resolving actually takes long. At most we only want the
		// queue to have a size of 2 (1 running resolve and 1 queued resolve).
		const queueSize = this.workingCopyResolveQueue.queueSize(workingCopy.resource);
		if (queueSize <= 1) {
			this.workingCopyResolveQueue.queueFor(workingCopy.resource, async () => {
				try {
					await this.reload(workingCopy);
				} catch (error) {
					this.logService.error(error);
				}
			});
		}
	}

	//#endregion

	//#region Working Copy File Events

	private readonly mapCorrelationIdToWorkingCopiesToRestore = new Map<number, { source: URI; target: URI; snapshot?: VSBufferReadableStream }[]>();

	private onWillRunWorkingCopyFileOperation(e: WorkingCopyFileEvent): void {

		// Move / Copy: remember working copies to restore after the operation
		if (e.operation === FileOperation.MOVE || e.operation === FileOperation.COPY) {
			e.waitUntil((async () => {
				const workingCopiesToRestore: { source: URI; target: URI; snapshot?: VSBufferReadableStream }[] = [];

				for (const { source, target } of e.files) {
					if (source) {
						if (this.uriIdentityService.extUri.isEqual(source, target)) {
							continue; // ignore if resources are considered equal
						}

						// Find all working copies that related to source (can be many if resource is a folder)
						const sourceWorkingCopies: IStoredFileWorkingCopy<M>[] = [];
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
								snapshot: sourceWorkingCopy.isDirty() ? await sourceWorkingCopy.model?.snapshot(SnapshotContext.Save, CancellationToken.None) : undefined
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

				for (const workingCopy of workingCopiesToRestore) {

					// Snapshot presence means this working copy used to be modified and so we restore that
					// flag. we do NOT have to restore the content because the working copy was only soft
					// reverted and did not loose its original modified contents.

					if (workingCopy.snapshot) {
						this.get(workingCopy.source)?.markModified();
					}
				}
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

							// From this moment on, only operate on the canonical resource
							// to fix a potential data loss issue:
							// https://github.com/microsoft/vscode/issues/211374
							const target = this.uriIdentityService.asCanonicalUri(workingCopyToRestore.target);

							// Restore the working copy at the target. if we have previous dirty content, we pass it
							// over to be used, otherwise we force a reload from disk. this is important
							// because we know the file has changed on disk after the move and the working copy might
							// have still existed with the previous state. this ensures that the working copy is not
							// tracking a stale state.
							await this.resolve(target, {
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

	//#region Reload & Resolve

	private async reload(workingCopy: IStoredFileWorkingCopy<M>): Promise<void> {

		// Await a pending working copy resolve first before proceeding
		// to ensure that we never resolve a working copy more than once
		// in parallel.
		await this.joinPendingResolves(workingCopy.resource);

		if (workingCopy.isDirty() || workingCopy.isDisposed() || !this.has(workingCopy.resource)) {
			return; // the working copy possibly got dirty or disposed, so return early then
		}

		// Trigger reload
		await this.doResolve(workingCopy, { reload: { async: false } });
	}

	async resolve(resource: URI, options?: IStoredFileWorkingCopyManagerResolveOptions): Promise<IStoredFileWorkingCopy<M>> {

		// Await a pending working copy resolve first before proceeding
		// to ensure that we never resolve a working copy more than once
		// in parallel.
		const pendingResolve = this.joinPendingResolves(resource);
		if (pendingResolve) {
			await pendingResolve;
		}

		// Trigger resolve
		return this.doResolve(resource, options);
	}

	private async doResolve(resourceOrWorkingCopy: URI | IStoredFileWorkingCopy<M>, options?: IStoredFileWorkingCopyManagerResolveOptions): Promise<IStoredFileWorkingCopy<M>> {
		let workingCopy: IStoredFileWorkingCopy<M> | undefined;
		let resource: URI;
		if (URI.isUri(resourceOrWorkingCopy)) {
			resource = resourceOrWorkingCopy;
			workingCopy = this.get(resource);
		} else {
			resource = resourceOrWorkingCopy.resource;
			workingCopy = resourceOrWorkingCopy;
		}

		let workingCopyResolve: Promise<void>;
		let didCreateWorkingCopy = false;

		const resolveOptions: IStoredFileWorkingCopyResolveOptions = {
			contents: options?.contents,
			forceReadFromFile: options?.reload?.force,
			limits: options?.limits
		};

		// Working copy exists
		if (workingCopy) {

			// Always reload if contents are provided
			if (options?.contents) {
				workingCopyResolve = workingCopy.resolve(resolveOptions);
			}

			// Reload async or sync based on options
			else if (options?.reload) {

				// Async reload: trigger a reload but return immediately
				if (options.reload.async) {
					workingCopyResolve = Promise.resolve();
					(async () => {
						try {
							await workingCopy.resolve(resolveOptions);
						} catch (error) {
							onUnexpectedError(error);
						}
					})();
				}

				// Sync reload: do not return until working copy reloaded
				else {
					workingCopyResolve = workingCopy.resolve(resolveOptions);
				}
			}

			// Do not reload
			else {
				workingCopyResolve = Promise.resolve();
			}
		}

		// Stored file working copy does not exist
		else {
			didCreateWorkingCopy = true;

			workingCopy = new StoredFileWorkingCopy(
				this.workingCopyTypeId,
				resource,
				this.labelService.getUriBasenameLabel(resource),
				this.modelFactory,
				async options => { await this.resolve(resource, { ...options, reload: { async: false } }); },
				this.fileService, this.logService, this.workingCopyFileService, this.filesConfigurationService,
				this.workingCopyBackupService, this.workingCopyService, this.notificationService, this.workingCopyEditorService,
				this.editorService, this.elevatedFileService
			);

			workingCopyResolve = workingCopy.resolve(resolveOptions);

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
			await workingCopyResolve;
		} catch (error) {

			// Automatically dispose the working copy if we created
			// it because we cannot dispose a working copy we do not
			// own (https://github.com/microsoft/vscode/issues/138850)
			if (didCreateWorkingCopy) {
				workingCopy.dispose();
			}

			throw error;
		} finally {

			// Remove from pending resolves
			this.mapResourceToPendingWorkingCopyResolve.delete(resource);
		}

		// Stored file working copy can be dirty if a backup was restored, so we make sure to
		// have this event delivered if we created the working copy here
		if (didCreateWorkingCopy && workingCopy.isDirty()) {
			this._onDidChangeDirty.fire(workingCopy);
		}

		return workingCopy;
	}

	private joinPendingResolves(resource: URI): Promise<void> | undefined {
		const pendingWorkingCopyResolve = this.mapResourceToPendingWorkingCopyResolve.get(resource);
		if (!pendingWorkingCopyResolve) {
			return;
		}

		return this.doJoinPendingResolves(resource);
	}

	private async doJoinPendingResolves(resource: URI): Promise<void> {

		// While we have pending working copy resolves, ensure
		// to await the last one finishing before returning.
		// This prevents a race when multiple clients await
		// the pending resolve and then all trigger the resolve
		// at the same time.
		let currentWorkingCopyResolve: Promise<void> | undefined;
		while (this.mapResourceToPendingWorkingCopyResolve.has(resource)) {
			const nextPendingWorkingCopyResolve = this.mapResourceToPendingWorkingCopyResolve.get(resource);
			if (nextPendingWorkingCopyResolve === currentWorkingCopyResolve) {
				return; // already awaited on - return
			}

			currentWorkingCopyResolve = nextPendingWorkingCopyResolve;
			try {
				await nextPendingWorkingCopyResolve;
			} catch (error) {
				// ignore any error here, it will bubble to the original requestor
			}
		}
	}

	private registerWorkingCopy(workingCopy: IStoredFileWorkingCopy<M>): void {

		// Install working copy listeners
		const workingCopyListeners = new DisposableStore();
		workingCopyListeners.add(workingCopy.onDidResolve(() => this._onDidResolve.fire(workingCopy)));
		workingCopyListeners.add(workingCopy.onDidChangeDirty(() => this._onDidChangeDirty.fire(workingCopy)));
		workingCopyListeners.add(workingCopy.onDidChangeReadonly(() => this._onDidChangeReadonly.fire(workingCopy)));
		workingCopyListeners.add(workingCopy.onDidChangeOrphaned(() => this._onDidChangeOrphaned.fire(workingCopy)));
		workingCopyListeners.add(workingCopy.onDidSaveError(() => this._onDidSaveError.fire(workingCopy)));
		workingCopyListeners.add(workingCopy.onDidSave(e => this._onDidSave.fire({ workingCopy, ...e })));
		workingCopyListeners.add(workingCopy.onDidRevert(() => this._onDidRevert.fire(workingCopy)));

		// Keep for disposal
		this.mapResourceToWorkingCopyListeners.set(workingCopy.resource, workingCopyListeners);
	}

	protected override remove(resource: URI): boolean {
		const removed = super.remove(resource);

		// Dispose any existing working copy listeners
		const workingCopyListener = this.mapResourceToWorkingCopyListeners.get(resource);
		if (workingCopyListener) {
			dispose(workingCopyListener);
			this.mapResourceToWorkingCopyListeners.delete(resource);
		}

		if (removed) {
			this._onDidRemove.fire(resource);
		}

		return removed;
	}

	//#endregion

	//#region Lifecycle

	canDispose(workingCopy: IStoredFileWorkingCopy<M>): true | Promise<true> {

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

	private async doCanDispose(workingCopy: IStoredFileWorkingCopy<M>): Promise<true> {

		// Await any pending resolves first before proceeding
		const pendingResolve = this.joinPendingResolves(workingCopy.resource);
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
}
