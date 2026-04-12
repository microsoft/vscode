/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { localize } from '../../../../nls.js';
import { DisposableStore, dispose } from '../../../../base/common/lifecycle.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { StoredFileWorkingCopy } from './storedFileWorkingCopy.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { Promises, ResourceQueue } from '../../../../base/common/async.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILifecycleService } from '../../lifecycle/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { joinPath } from '../../../../base/common/resources.js';
import { IWorkingCopyFileService } from './workingCopyFileService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IWorkingCopyBackupService } from './workingCopyBackup.js';
import { BaseFileWorkingCopyManager } from './abstractFileWorkingCopyManager.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IElevatedFileService } from '../../files/common/elevatedFileService.js';
import { IFilesConfigurationService } from '../../filesConfiguration/common/filesConfigurationService.js';
import { IWorkingCopyEditorService } from './workingCopyEditorService.js';
import { IWorkingCopyService } from './workingCopyService.js';
import { isWeb } from '../../../../base/common/platform.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
let StoredFileWorkingCopyManager = class StoredFileWorkingCopyManager extends BaseFileWorkingCopyManager {
    constructor(workingCopyTypeId, modelFactory, fileService, lifecycleService, labelService, logService, workingCopyFileService, workingCopyBackupService, uriIdentityService, filesConfigurationService, workingCopyService, notificationService, workingCopyEditorService, editorService, elevatedFileService, progressService) {
        super(fileService, logService, workingCopyBackupService);
        this.workingCopyTypeId = workingCopyTypeId;
        this.modelFactory = modelFactory;
        this.lifecycleService = lifecycleService;
        this.labelService = labelService;
        this.workingCopyFileService = workingCopyFileService;
        this.uriIdentityService = uriIdentityService;
        this.filesConfigurationService = filesConfigurationService;
        this.workingCopyService = workingCopyService;
        this.notificationService = notificationService;
        this.workingCopyEditorService = workingCopyEditorService;
        this.editorService = editorService;
        this.elevatedFileService = elevatedFileService;
        this.progressService = progressService;
        //#region Events
        this._onDidResolve = this._register(new Emitter());
        this.onDidResolve = this._onDidResolve.event;
        this._onDidChangeDirty = this._register(new Emitter());
        this.onDidChangeDirty = this._onDidChangeDirty.event;
        this._onDidChangeReadonly = this._register(new Emitter());
        this.onDidChangeReadonly = this._onDidChangeReadonly.event;
        this._onDidChangeOrphaned = this._register(new Emitter());
        this.onDidChangeOrphaned = this._onDidChangeOrphaned.event;
        this._onDidSaveError = this._register(new Emitter());
        this.onDidSaveError = this._onDidSaveError.event;
        this._onDidSave = this._register(new Emitter());
        this.onDidSave = this._onDidSave.event;
        this._onDidRevert = this._register(new Emitter());
        this.onDidRevert = this._onDidRevert.event;
        this._onDidRemove = this._register(new Emitter());
        this.onDidRemove = this._onDidRemove.event;
        //#endregion
        this.mapResourceToWorkingCopyListeners = new ResourceMap();
        this.mapResourceToPendingWorkingCopyResolve = new ResourceMap();
        this.workingCopyResolveQueue = this._register(new ResourceQueue());
        //#endregion
        //#region Working Copy File Events
        this.mapCorrelationIdToWorkingCopiesToRestore = new Map();
        this.registerListeners();
    }
    registerListeners() {
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
        }
        else {
            this._register(this.lifecycleService.onWillShutdown(event => event.join(this.onWillShutdownDesktop(), { id: 'join.fileWorkingCopyManager', label: localize('join.fileWorkingCopyManager', "Saving working copies") })));
        }
    }
    onBeforeShutdownWeb() {
        if (this.workingCopies.some(workingCopy => workingCopy.hasState(2 /* StoredFileWorkingCopyState.PENDING_SAVE */))) {
            // stored file working copies are pending to be saved:
            // veto because web does not support long running shutdown
            return true;
        }
        return false;
    }
    async onWillShutdownDesktop() {
        let pendingSavedWorkingCopies;
        // As long as stored file working copies are pending to be saved, we prolong the shutdown
        // until that has happened to ensure we are not shutting down in the middle of
        // writing to the working copy (https://github.com/microsoft/vscode/issues/116600).
        while ((pendingSavedWorkingCopies = this.workingCopies.filter(workingCopy => workingCopy.hasState(2 /* StoredFileWorkingCopyState.PENDING_SAVE */))).length > 0) {
            await Promises.settled(pendingSavedWorkingCopies.map(workingCopy => workingCopy.joinState(2 /* StoredFileWorkingCopyState.PENDING_SAVE */)));
        }
    }
    //#region Resolve from file or file provider changes
    onDidChangeFileSystemProviderCapabilities(e) {
        // Resolve working copies again for file systems that changed
        // capabilities to fetch latest metadata (e.g. readonly)
        // into all working copies.
        this.queueWorkingCopyReloads(e.scheme);
    }
    onDidChangeFileSystemProviderRegistrations(e) {
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
    onDidFilesChange(e) {
        // Trigger a resolve for any update or add event that impacts
        // the working copy. We also consider the added event
        // because it could be that a file was added and updated
        // right after.
        this.queueWorkingCopyReloads(e);
    }
    queueWorkingCopyReloads(schemeOrEvent) {
        for (const workingCopy of this.workingCopies) {
            if (workingCopy.isDirty()) {
                continue; // never reload dirty working copies
            }
            let resolveWorkingCopy = false;
            if (typeof schemeOrEvent === 'string') {
                resolveWorkingCopy = schemeOrEvent === workingCopy.resource.scheme;
            }
            else {
                resolveWorkingCopy = schemeOrEvent.contains(workingCopy.resource, 0 /* FileChangeType.UPDATED */, 1 /* FileChangeType.ADDED */);
            }
            if (resolveWorkingCopy) {
                this.queueWorkingCopyReload(workingCopy);
            }
        }
    }
    queueWorkingCopyReload(workingCopy) {
        // Resolves a working copy to update (use a queue to prevent accumulation of
        // resolve when the resolving actually takes long. At most we only want the
        // queue to have a size of 2 (1 running resolve and 1 queued resolve).
        const queueSize = this.workingCopyResolveQueue.queueSize(workingCopy.resource);
        if (queueSize <= 1) {
            this.workingCopyResolveQueue.queueFor(workingCopy.resource, async () => {
                try {
                    await this.reload(workingCopy);
                }
                catch (error) {
                    this.logService.error(error);
                }
            });
        }
    }
    onWillRunWorkingCopyFileOperation(e) {
        // Move / Copy: remember working copies to restore after the operation
        if (e.operation === 2 /* FileOperation.MOVE */ || e.operation === 3 /* FileOperation.COPY */) {
            e.waitUntil((async () => {
                const workingCopiesToRestore = [];
                for (const { source, target } of e.files) {
                    if (source) {
                        if (this.uriIdentityService.extUri.isEqual(source, target)) {
                            continue; // ignore if resources are considered equal
                        }
                        // Find all working copies that related to source (can be many if resource is a folder)
                        const sourceWorkingCopies = [];
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
                            let targetResource;
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
                                snapshot: sourceWorkingCopy.isDirty() ? await sourceWorkingCopy.model?.snapshot(1 /* SnapshotContext.Save */, CancellationToken.None) : undefined
                            });
                        }
                    }
                }
                this.mapCorrelationIdToWorkingCopiesToRestore.set(e.correlationId, workingCopiesToRestore);
            })());
        }
    }
    onDidFailWorkingCopyFileOperation(e) {
        // Move / Copy: restore dirty flag on working copies to restore that were dirty
        if ((e.operation === 2 /* FileOperation.MOVE */ || e.operation === 3 /* FileOperation.COPY */)) {
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
    onDidRunWorkingCopyFileOperation(e) {
        switch (e.operation) {
            // Create: Revert existing working copies
            case 0 /* FileOperation.CREATE */:
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
            case 2 /* FileOperation.MOVE */:
            case 3 /* FileOperation.COPY */:
                e.waitUntil((async () => {
                    const workingCopiesToRestore = this.mapCorrelationIdToWorkingCopiesToRestore.get(e.correlationId);
                    if (workingCopiesToRestore) {
                        this.mapCorrelationIdToWorkingCopiesToRestore.delete(e.correlationId);
                        await Promises.settled(workingCopiesToRestore.map(async (workingCopyToRestore) => {
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
    async reload(workingCopy) {
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
    async resolve(resource, options) {
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
    async doResolve(resourceOrWorkingCopy, options) {
        let workingCopy;
        let resource;
        if (URI.isUri(resourceOrWorkingCopy)) {
            resource = resourceOrWorkingCopy;
            workingCopy = this.get(resource);
        }
        else {
            resource = resourceOrWorkingCopy.resource;
            workingCopy = resourceOrWorkingCopy;
        }
        let workingCopyResolve;
        let didCreateWorkingCopy = false;
        const resolveOptions = {
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
                        }
                        catch (error) {
                            if (!workingCopy.isDisposed()) {
                                onUnexpectedError(error); // only log if the working copy is still around
                            }
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
            workingCopy = new StoredFileWorkingCopy(this.workingCopyTypeId, resource, this.labelService.getUriBasenameLabel(resource), this.modelFactory, async (options) => { await this.resolve(resource, { ...options, reload: { async: false } }); }, this.fileService, this.logService, this.workingCopyFileService, this.filesConfigurationService, this.workingCopyBackupService, this.workingCopyService, this.notificationService, this.workingCopyEditorService, this.editorService, this.elevatedFileService, this.progressService);
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
        }
        catch (error) {
            // Automatically dispose the working copy if we created
            // it because we cannot dispose a working copy we do not
            // own (https://github.com/microsoft/vscode/issues/138850)
            if (didCreateWorkingCopy) {
                workingCopy.dispose();
            }
            throw error;
        }
        finally {
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
    joinPendingResolves(resource) {
        const pendingWorkingCopyResolve = this.mapResourceToPendingWorkingCopyResolve.get(resource);
        if (!pendingWorkingCopyResolve) {
            return;
        }
        return this.doJoinPendingResolves(resource);
    }
    async doJoinPendingResolves(resource) {
        // While we have pending working copy resolves, ensure
        // to await the last one finishing before returning.
        // This prevents a race when multiple clients await
        // the pending resolve and then all trigger the resolve
        // at the same time.
        let currentWorkingCopyResolve;
        while (this.mapResourceToPendingWorkingCopyResolve.has(resource)) {
            const nextPendingWorkingCopyResolve = this.mapResourceToPendingWorkingCopyResolve.get(resource);
            if (nextPendingWorkingCopyResolve === currentWorkingCopyResolve) {
                return; // already awaited on - return
            }
            currentWorkingCopyResolve = nextPendingWorkingCopyResolve;
            try {
                await nextPendingWorkingCopyResolve;
            }
            catch (error) {
                // ignore any error here, it will bubble to the original requestor
            }
        }
    }
    registerWorkingCopy(workingCopy) {
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
    remove(resource) {
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
    canDispose(workingCopy) {
        // Quick return if working copy already disposed or not dirty and not resolving
        if (workingCopy.isDisposed() ||
            (!this.mapResourceToPendingWorkingCopyResolve.has(workingCopy.resource) && !workingCopy.isDirty())) {
            return true;
        }
        // Promise based return in all other cases
        return this.doCanDispose(workingCopy);
    }
    async doCanDispose(workingCopy) {
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
    dispose() {
        super.dispose();
        // Clear pending working copy resolves
        this.mapResourceToPendingWorkingCopyResolve.clear();
        // Dispose the working copy change listeners
        dispose(this.mapResourceToWorkingCopyListeners.values());
        this.mapResourceToWorkingCopyListeners.clear();
    }
};
StoredFileWorkingCopyManager = __decorate([
    __param(2, IFileService),
    __param(3, ILifecycleService),
    __param(4, ILabelService),
    __param(5, ILogService),
    __param(6, IWorkingCopyFileService),
    __param(7, IWorkingCopyBackupService),
    __param(8, IUriIdentityService),
    __param(9, IFilesConfigurationService),
    __param(10, IWorkingCopyService),
    __param(11, INotificationService),
    __param(12, IWorkingCopyEditorService),
    __param(13, IEditorService),
    __param(14, IElevatedFileService),
    __param(15, IProgressService)
], StoredFileWorkingCopyManager);
export { StoredFileWorkingCopyManager };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RvcmVkRmlsZVdvcmtpbmdDb3B5TWFuYWdlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vc3RvcmVkRmlsZVdvcmtpbmdDb3B5TWFuYWdlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM3RixPQUFPLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxxQkFBcUIsRUFBcU8sTUFBTSw0QkFBNEIsQ0FBQztBQUN0UyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDN0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxhQUFhLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRSxPQUFPLEVBQW1ELFlBQVksRUFBb0YsTUFBTSw0Q0FBNEMsQ0FBQztBQUM3TSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFckQsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLHVCQUF1QixFQUF3QixNQUFNLDZCQUE2QixDQUFDO0FBQzVGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzdGLE9BQU8sRUFB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