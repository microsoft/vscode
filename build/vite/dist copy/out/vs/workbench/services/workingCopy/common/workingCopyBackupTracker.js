/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Promises } from '../../../../base/common/async.js';
/**
 * The working copy backup tracker deals with:
 * - restoring backups that exist
 * - creating backups for modified working copies
 * - deleting backups for saved working copies
 * - handling backups on shutdown
 */
export class WorkingCopyBackupTracker extends Disposable {
    constructor(workingCopyBackupService, workingCopyService, logService, lifecycleService, filesConfigurationService, workingCopyEditorService, editorService) {
        super();
        this.workingCopyBackupService = workingCopyBackupService;
        this.workingCopyService = workingCopyService;
        this.logService = logService;
        this.lifecycleService = lifecycleService;
        this.filesConfigurationService = filesConfigurationService;
        this.workingCopyEditorService = workingCopyEditorService;
        this.editorService = editorService;
        // A map from working copy to a version ID we compute on each content
        // change. This version ID allows to e.g. ask if a backup for a specific
        // content has been made before closing.
        this.mapWorkingCopyToContentVersion = new Map();
        // A map of scheduled pending backup operations for working copies
        // Given https://github.com/microsoft/vscode/issues/158038, we explicitly
        // do not store `IWorkingCopy` but the identifier in the map, since it
        // looks like GC is not running for the working copy otherwise.
        this.pendingBackupOperations = new Map();
        this.suspended = false;
        //#endregion
        //#region Backup Restorer
        this.unrestoredBackups = new Set();
        this._isReady = false;
        this.whenReady = this.resolveBackupsToRestore();
        // Fill in initial modified working copies
        for (const workingCopy of this.workingCopyService.modifiedWorkingCopies) {
            this.onDidRegister(workingCopy);
        }
        this.registerListeners();
    }
    registerListeners() {
        // Working Copy events
        this._register(this.workingCopyService.onDidRegister(workingCopy => this.onDidRegister(workingCopy)));
        this._register(this.workingCopyService.onDidUnregister(workingCopy => this.onDidUnregister(workingCopy)));
        this._register(this.workingCopyService.onDidChangeDirty(workingCopy => this.onDidChangeDirty(workingCopy)));
        this._register(this.workingCopyService.onDidChangeContent(workingCopy => this.onDidChangeContent(workingCopy)));
        // Lifecycle
        this._register(this.lifecycleService.onBeforeShutdown(event => event.finalVeto(() => this.onFinalBeforeShutdown(event.reason), 'veto.backups')));
        this._register(this.lifecycleService.onWillShutdown(() => this.onWillShutdown()));
        // Once a handler registers, restore backups
        this._register(this.workingCopyEditorService.onDidRegisterHandler(handler => this.restoreBackups(handler)));
    }
    onWillShutdown() {
        // Here we know that we will shutdown. Any backup operation that is
        // already scheduled or being scheduled from this moment on runs
        // at the risk of corrupting a backup because the backup operation
        // might terminate at any given time now. As such, we need to disable
        // this tracker from performing more backups by cancelling pending
        // operations and suspending the tracker without resuming.
        this.cancelBackupOperations();
        this.suspendBackupOperations();
    }
    //#region Backup Creator
    // Delay creation of backups when content changes to avoid too much
    // load on the backup service when the user is typing into the editor
    // Since we always schedule a backup, even when auto save is on, we
    // have different scheduling delays based on auto save configuration.
    // With 'delayed' we avoid a (not critical but also not really wanted)
    // race between saving (after 1s per default) and making a backup of
    // the working copy.
    static { this.DEFAULT_BACKUP_SCHEDULE_DELAYS = {
        ['default']: 1000,
        ['delayed']: 2000
    }; }
    onDidRegister(workingCopy) {
        if (this.suspended) {
            this.logService.warn(`[backup tracker] suspended, ignoring register event`, workingCopy.resource.toString(), workingCopy.typeId);
            return;
        }
        if (workingCopy.isModified()) {
            this.scheduleBackup(workingCopy);
        }
    }
    onDidUnregister(workingCopy) {
        // Remove from content version map
        this.mapWorkingCopyToContentVersion.delete(workingCopy);
        // Check suspended
        if (this.suspended) {
            this.logService.warn(`[backup tracker] suspended, ignoring unregister event`, workingCopy.resource.toString(), workingCopy.typeId);
            return;
        }
        // Discard backup
        this.discardBackup(workingCopy);
    }
    onDidChangeDirty(workingCopy) {
        if (this.suspended) {
            this.logService.warn(`[backup tracker] suspended, ignoring dirty change event`, workingCopy.resource.toString(), workingCopy.typeId);
            return;
        }
        if (workingCopy.isDirty()) {
            this.scheduleBackup(workingCopy);
        }
        else {
            this.discardBackup(workingCopy);
        }
    }
    onDidChangeContent(workingCopy) {
        // Increment content version ID
        const contentVersionId = this.getContentVersion(workingCopy);
        this.mapWorkingCopyToContentVersion.set(workingCopy, contentVersionId + 1);
        // Check suspended
        if (this.suspended) {
            this.logService.warn(`[backup tracker] suspended, ignoring content change event`, workingCopy.resource.toString(), workingCopy.typeId);
            return;
        }
        // Schedule backup for modified working copies
        if (workingCopy.isModified()) {
            // this listener will make sure that the backup is
            // pushed out for as long as the user is still changing
            // the content of the working copy.
            this.scheduleBackup(workingCopy);
        }
    }
    scheduleBackup(workingCopy) {
        // Clear any running backup operation
        this.cancelBackupOperation(workingCopy);
        this.logService.trace(`[backup tracker] scheduling backup`, workingCopy.resource.toString(), workingCopy.typeId);
        // Schedule new backup
        const workingCopyIdentifier = { resource: workingCopy.resource, typeId: workingCopy.typeId };
        const cts = new CancellationTokenSource();
        const handle = setTimeout(async () => {
            if (cts.token.isCancellationRequested) {
                return;
            }
            // Backup if modified
            if (workingCopy.isModified()) {
                this.logService.trace(`[backup tracker] creating backup`, workingCopy.resource.toString(), workingCopy.typeId);
                try {
                    const backup = await workingCopy.backup(cts.token);
                    if (cts.token.isCancellationRequested) {
                        return;
                    }
                    if (workingCopy.isModified()) {
                        this.logService.trace(`[backup tracker] storing backup`, workingCopy.resource.toString(), workingCopy.typeId);
                        await this.workingCopyBackupService.backup(workingCopy, backup.content, this.getContentVersion(workingCopy), backup.meta, cts.token);
                    }
                }
                catch (error) {
                    this.logService.error(error);
                }
            }
            // Clear disposable unless we got canceled which would
            // indicate another operation has started meanwhile
            if (!cts.token.isCancellationRequested) {
                this.doClearPendingBackupOperation(workingCopyIdentifier);
            }
        }, this.getBackupScheduleDelay(workingCopy));
        // Keep in map for disposal as needed
        this.pendingBackupOperations.set(workingCopyIdentifier, {
            cancel: () => {
                this.logService.trace(`[backup tracker] clearing pending backup creation`, workingCopy.resource.toString(), workingCopy.typeId);
                cts.cancel();
            },
            disposable: toDisposable(() => {
                cts.dispose();
                clearTimeout(handle);
            })
        });
    }
    getBackupScheduleDelay(workingCopy) {
        if (typeof workingCopy.backupDelay === 'number') {
            return workingCopy.backupDelay; // respect working copy override
        }
        let backupScheduleDelay;
        if (workingCopy.capabilities & 2 /* WorkingCopyCapabilities.Untitled */) {
            backupScheduleDelay = 'default'; // auto-save is never on for untitled working copies
        }
        else {
            backupScheduleDelay = this.filesConfigurationService.hasShortAutoSaveDelay(workingCopy.resource) ? 'delayed' : 'default';
        }
        return WorkingCopyBackupTracker.DEFAULT_BACKUP_SCHEDULE_DELAYS[backupScheduleDelay];
    }
    getContentVersion(workingCopy) {
        return this.mapWorkingCopyToContentVersion.get(workingCopy) || 0;
    }
    discardBackup(workingCopy) {
        // Clear any running backup operation
        this.cancelBackupOperation(workingCopy);
        // Schedule backup discard asap
        const workingCopyIdentifier = { resource: workingCopy.resource, typeId: workingCopy.typeId };
        const cts = new CancellationTokenSource();
        this.doDiscardBackup(workingCopyIdentifier, cts);
        // Keep in map for disposal as needed
        this.pendingBackupOperations.set(workingCopyIdentifier, {
            cancel: () => {
                this.logService.trace(`[backup tracker] clearing pending backup discard`, workingCopy.resource.toString(), workingCopy.typeId);
                cts.cancel();
            },
            disposable: cts
        });
    }
    async doDiscardBackup(workingCopyIdentifier, cts) {
        this.logService.trace(`[backup tracker] discarding backup`, workingCopyIdentifier.resource.toString(), workingCopyIdentifier.typeId);
        // Discard backup
        try {
            await this.workingCopyBackupService.discardBackup(workingCopyIdentifier, cts.token);
        }
        catch (error) {
            this.logService.error(error);
        }
        // Clear disposable unless we got canceled which would
        // indicate another operation has started meanwhile
        if (!cts.token.isCancellationRequested) {
            this.doClearPendingBackupOperation(workingCopyIdentifier);
        }
    }
    cancelBackupOperation(workingCopy) {
        // Given a working copy we want to find the matching
        // identifier in our pending operations map because
        // we cannot use the working copy directly, as the
        // identifier might have different object identity.
        let workingCopyIdentifier = undefined;
        for (const [identifier] of this.pendingBackupOperations) {
            if (identifier.resource.toString() === workingCopy.resource.toString() && identifier.typeId === workingCopy.typeId) {
                workingCopyIdentifier = identifier;
                break;
            }
        }
        if (workingCopyIdentifier) {
            this.doClearPendingBackupOperation(workingCopyIdentifier, { cancel: true });
        }
    }
    doClearPendingBackupOperation(workingCopyIdentifier, options) {
        const pendingBackupOperation = this.pendingBackupOperations.get(workingCopyIdentifier);
        if (!pendingBackupOperation) {
            return;
        }
        if (options?.cancel) {
            pendingBackupOperation.cancel();
        }
        pendingBackupOperation.disposable.dispose();
        this.pendingBackupOperations.delete(workingCopyIdentifier);
    }
    cancelBackupOperations() {
        for (const [, operation] of this.pendingBackupOperations) {
            operation.cancel();
            operation.disposable.dispose();
        }
        this.pendingBackupOperations.clear();
    }
    suspendBackupOperations() {
        this.suspended = true;
        return { resume: () => this.suspended = false };
    }
    get isReady() { return this._isReady; }
    async resolveBackupsToRestore() {
        // Wait for resolving backups until we are restored to reduce startup pressure
        await this.lifecycleService.when(3 /* LifecyclePhase.Restored */);
        // Remember each backup that needs to restore
        for (const backup of await this.workingCopyBackupService.getBackups()) {
            this.unrestoredBackups.add(backup);
        }
        this._isReady = true;
    }
    async restoreBackups(handler) {
        // Wait for backups to be resolved
        await this.whenReady;
        // Figure out already opened editors for backups vs
        // non-opened.
        const openedEditorsForBackups = new Set();
        const nonOpenedEditorsForBackups = new Set();
        // Ensure each backup that can be handled has an
        // associated editor.
        const restoredBackups = new Set();
        for (const unrestoredBackup of this.unrestoredBackups) {
            const canHandleUnrestoredBackup = await handler.handles(unrestoredBackup);
            if (!canHandleUnrestoredBackup) {
                continue;
            }
            // Collect already opened editors for backup
            let hasOpenedEditorForBackup = false;
            for (const { editor } of this.editorService.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */)) {
                const isUnrestoredBackupOpened = handler.isOpen(unrestoredBackup, editor);
                if (isUnrestoredBackupOpened) {
                    openedEditorsForBackups.add(editor);
                    hasOpenedEditorForBackup = true;
                }
            }
            // Otherwise, make sure to create at least one editor
            // for the backup to show
            if (!hasOpenedEditorForBackup) {
                nonOpenedEditorsForBackups.add(await handler.createEditor(unrestoredBackup));
            }
            // Remember as (potentially) restored
            restoredBackups.add(unrestoredBackup);
        }
        // Ensure editors are opened for each backup without editor
        // in the background without stealing focus
        if (nonOpenedEditorsForBackups.size > 0) {
            await this.editorService.openEditors([...nonOpenedEditorsForBackups].map(nonOpenedEditorForBackup => ({
                editor: nonOpenedEditorForBackup,
                options: {
                    pinned: true,
                    preserveFocus: true,
                    inactive: true
                }
            })));
            for (const nonOpenedEditorForBackup of nonOpenedEditorsForBackups) {
                openedEditorsForBackups.add(nonOpenedEditorForBackup);
            }
        }
        // Then, resolve each opened editor to make sure the working copy
        // is loaded and the modified editor appears properly.
        // We only do that for editors that are not active in a group
        // already to prevent calling `resolve` twice!
        await Promises.settled([...openedEditorsForBackups].map(async (openedEditorForBackup) => {
            if (this.editorService.isVisible(openedEditorForBackup)) {
                return;
            }
            return openedEditorForBackup.resolve();
        }));
        // Finally, remove all handled backups from the list
        for (const restoredBackup of restoredBackups) {
            this.unrestoredBackups.delete(restoredBackup);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2luZ0NvcHlCYWNrdXBUcmFja2VyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weUJhY2t1cFRyYWNrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLFVBQVUsRUFBZSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUs3RixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUdsRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFLNUQ7Ozs7OztHQU1HO0FBQ0gsTUFBTSxPQUFnQix3QkFBeUIsU0FBUSxVQUFVO0lBRWhFLFlBQ29CLHdCQUFtRCxFQUNuRCxrQkFBdUMsRUFDdkMsVUFBdUIsRUFDekIsZ0JBQW1DLEVBQ2pDLHlCQUFxRCxFQUN2RCx3QkFBbUQsRUFDakQsYUFBNkI7UUFFaEQsS0FBSyxFQUFFLENBQUM7UUFSVyw2QkFBd0IsR0FBeEIsd0JBQXdCLENBQTJCO1FBQ25ELHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBcUI7UUFDdkMsZUFBVSxHQUFWLFVBQVUsQ0FBYTtRQUN6QixxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQW1CO1FBQ2pDLDhCQUF5QixHQUF6Qix5QkFBeUIsQ0FBNEI7UUFDdkQsNkJBQXdCLEdBQXhCLHdCQUF3QixDQUEyQjtRQUNqRCxrQkFBYSxHQUFiLGFBQWEsQ0FBZ0I7UUE0RGpELHFFQUFxRTtRQUNyRSx3RUFBd0U7UUFDeEUsd0NBQXdDO1FBQ3ZCLG1DQUE4QixHQUFHLElBQUksR0FBRyxFQUF3QixDQUFDO1FBRWxGLGtFQUFrRTtRQUNsRSx5RUFBeUU7UUFDekUsc0VBQXNFO1FBQ3RFLCtEQUErRDtRQUM1Qyw0QkFBdUIsR0FBRyxJQUFJLEdB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