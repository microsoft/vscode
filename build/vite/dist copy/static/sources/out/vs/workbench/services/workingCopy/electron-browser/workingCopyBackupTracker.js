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
import { IWorkingCopyBackupService } from '../common/workingCopyBackup.js';
import { IFilesConfigurationService } from '../../filesConfiguration/common/filesConfigurationService.js';
import { IWorkingCopyService } from '../common/workingCopyService.js';
import { ILifecycleService } from '../../lifecycle/common/lifecycle.js';
import { IFileDialogService, IDialogService, getFileNamesMessage } from '../../../../platform/dialogs/common/dialogs.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { HotExitConfiguration } from '../../../../platform/files/common/files.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { WorkingCopyBackupTracker } from '../common/workingCopyBackupTracker.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { Promises, raceCancellation } from '../../../../base/common/async.js';
import { IWorkingCopyEditorService } from '../common/workingCopyEditorService.js';
let NativeWorkingCopyBackupTracker = class NativeWorkingCopyBackupTracker extends WorkingCopyBackupTracker {
    static { this.ID = 'workbench.contrib.nativeWorkingCopyBackupTracker'; }
    constructor(workingCopyBackupService, filesConfigurationService, workingCopyService, lifecycleService, fileDialogService, dialogService, contextService, nativeHostService, logService, environmentService, progressService, workingCopyEditorService, editorService) {
        super(workingCopyBackupService, workingCopyService, logService, lifecycleService, filesConfigurationService, workingCopyEditorService, editorService);
        this.fileDialogService = fileDialogService;
        this.dialogService = dialogService;
        this.contextService = contextService;
        this.nativeHostService = nativeHostService;
        this.environmentService = environmentService;
        this.progressService = progressService;
    }
    async onFinalBeforeShutdown(reason) {
        // Important: we are about to shutdown and handle modified working copies
        // and backups. We do not want any pending backup ops to interfer with
        // this because there is a risk of a backup being scheduled after we have
        // acknowledged to shutdown and then might end up with partial backups
        // written to disk, or even empty backups or deletes after writes.
        // (https://github.com/microsoft/vscode/issues/138055)
        this.cancelBackupOperations();
        // For the duration of the shutdown handling, suspend backup operations
        // and only resume after we have handled backups. Similar to above, we
        // do not want to trigger backup tracking during our shutdown handling
        // but we must resume, in case of a veto afterwards.
        const { resume } = this.suspendBackupOperations();
        try {
            // Modified working copies need treatment on shutdown
            const modifiedWorkingCopies = this.workingCopyService.modifiedWorkingCopies;
            if (modifiedWorkingCopies.length) {
                return await this.onBeforeShutdownWithModified(reason, modifiedWorkingCopies);
            }
            // No modified working copies
            else {
                return await this.onBeforeShutdownWithoutModified();
            }
        }
        finally {
            resume();
        }
    }
    async onBeforeShutdownWithModified(reason, modifiedWorkingCopies) {
        // If auto save is enabled, save all non-untitled working copies
        // and then check again for modified copies
        const workingCopiesToAutoSave = modifiedWorkingCopies.filter(wc => !(wc.capabilities & 2 /* WorkingCopyCapabilities.Untitled */) && this.filesConfigurationService.getAutoSaveMode(wc.resource).mode !== 0 /* AutoSaveMode.OFF */);
        if (workingCopiesToAutoSave.length > 0) {
            // Save all modified working copies that can be auto-saved
            try {
                await this.doSaveAllBeforeShutdown(workingCopiesToAutoSave, 2 /* SaveReason.AUTO */);
            }
            catch (error) {
                this.logService.error(`[backup tracker] error saving modified working copies: ${error}`); // guard against misbehaving saves, we handle remaining modified below
            }
            // If we still have modified working copies, we either have untitled ones or working copies that cannot be saved
            const remainingModifiedWorkingCopies = this.workingCopyService.modifiedWorkingCopies;
            if (remainingModifiedWorkingCopies.length) {
                return this.handleModifiedBeforeShutdown(remainingModifiedWorkingCopies, reason);
            }
            return this.noVeto([...modifiedWorkingCopies]); // no veto (modified auto-saved)
        }
        // Auto save is not enabled
        return this.handleModifiedBeforeShutdown(modifiedWorkingCopies, reason);
    }
    async handleModifiedBeforeShutdown(modifiedWorkingCopies, reason) {
        // Trigger backup if configured and enabled for shutdown reason
        let backups = [];
        let backupError = undefined;
        const modifiedWorkingCopiesToBackup = await this.shouldBackupBeforeShutdown(reason, modifiedWorkingCopies);
        if (modifiedWorkingCopiesToBackup.length > 0) {
            try {
                const backupResult = await this.backupBeforeShutdown(modifiedWorkingCopiesToBackup);
                backups = backupResult.backups;
                backupError = backupResult.error;
                if (backups.length === modifiedWorkingCopies.length) {
                    return false; // no veto (backup was successful for all working copies)
                }
            }
            catch (error) {
                backupError = error;
            }
        }
        const remainingModifiedWorkingCopies = modifiedWorkingCopies.filter(workingCopy => !backups.includes(workingCopy));
        // We ran a backup but received an error that we show to the user
        if (backupError) {
            if (this.environmentService.isExtensionDevelopment) {
                this.logService.error(`[backup tracker] error creating backups: ${backupError}`);
                return false; // do not block shutdown during extension development (https://github.com/microsoft/vscode/issues/115028)
            }
            return this.showErrorDialog(localize('backupTrackerBackupFailed', "The following editors with unsaved changes could not be saved to the backup location."), remainingModifiedWorkingCopies, backupError, reason);
        }
        // Since a backup did not happen, we have to confirm for
        // the working copies that did not successfully backup
        try {
            return await this.confirmBeforeShutdown(remainingModifiedWorkingCopies);
        }
        catch (error) {
            if (this.environmentService.isExtensionDevelopment) {
                this.logService.error(`[backup tracker] error saving or reverting modified working copies: ${error}`);
                return false; // do not block shutdown during extension development (https://github.com/microsoft/vscode/issues/115028)
            }
            return this.showErrorDialog(localize('backupTrackerConfirmFailed', "The following editors with unsaved changes could not be saved or reverted."), remainingModifiedWorkingCopies, error, reason);
        }
    }
    async shouldBackupBeforeShutdown(reason, modifiedWorkingCopies) {
        if (!this.filesConfigurationService.isHotExitEnabled) {
            return []; // never backup when hot exit is disabled via settings
        }
        if (this.environmentService.isExtensionDevelopment) {
            return modifiedWorkingCopies; // always backup closing extension development window without asking to speed up debugging
        }
        switch (reason) {
            // Window Close
            case 1 /* ShutdownReason.CLOSE */:
                if (this.contextService.getWorkbenchState() !== 1 /* WorkbenchState.EMPTY */ && this.filesConfigurationService.hotExitConfiguration === HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE) {
                    return modifiedWorkingCopies; // backup if a workspace/folder is open and onExitAndWindowClose is configured
                }
                if (isMacintosh || await this.nativeHostService.getWindowCount() > 1) {
                    if (this.contextService.getWorkbenchState() !== 1 /* WorkbenchState.EMPTY */) {
                        return modifiedWorkingCopies.filter(modifiedWorkingCopy => modifiedWorkingCopy.capabilities & 4 /* WorkingCopyCapabilities.Scratchpad */); // backup scratchpads automatically to avoid user confirmation
                    }
                    return []; // do not backup if a window is closed that does not cause quitting of the application
                }
                return modifiedWorkingCopies; // backup if last window is closed on win/linux where the application quits right after
            // Application Quit
            case 2 /* ShutdownReason.QUIT */:
                return modifiedWorkingCopies; // backup because next start we restore all backups
            // Window Reload
            case 3 /* ShutdownReason.RELOAD */:
                return modifiedWorkingCopies; // backup because after window reload, backups restore
            // Workspace Change
            case 4 /* ShutdownReason.LOAD */:
                if (this.contextService.getWorkbenchState() !== 1 /* WorkbenchState.EMPTY */) {
                    if (this.filesConfigurationService.hotExitConfiguration === HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE) {
                        return modifiedWorkingCopies; // backup if a workspace/folder is open and onExitAndWindowClose is configured
                    }
                    return modifiedWorkingCopies.filter(modifiedWorkingCopy => modifiedWorkingCopy.capabilities & 4 /* WorkingCopyCapabilities.Scratchpad */); // backup scratchpads automatically to avoid user confirmation
                }
                return []; // do not backup because we are switching contexts with no workspace/folder open
        }
    }
    async showErrorDialog(message, workingCopies, error, reason) {
        this.logService.error(`[backup tracker] ${message}: ${error}`);
        const modifiedWorkingCopies = workingCopies.filter(workingCopy => workingCopy.isModified());
        const advice = localize('backupErrorDetails', "Try saving or reverting the editors with unsaved changes first and then try again.");
        const detail = modifiedWorkingCopies.length
            ? `${getFileNamesMessage(modifiedWorkingCopies.map(x => x.name))}\n${advice}`
            : advice;
        const { result } = await this.dialogService.prompt({
            type: 'error',
            message,
            detail,
            buttons: [
                {
                    label: localize({ key: 'ok', comment: ['&& denotes a mnemonic'] }, "&&OK"),
                    run: () => true // veto
                },
                {
                    label: this.toForceShutdownLabel(reason),
                    run: () => false // no veto
                }
            ],
        });
        return result ?? true;
    }
    toForceShutdownLabel(reason) {
        switch (reason) {
            case 1 /* ShutdownReason.CLOSE */:
            case 4 /* ShutdownReason.LOAD */:
                return localize('shutdownForceClose', "Close Anyway");
            case 2 /* ShutdownReason.QUIT */:
                return localize('shutdownForceQuit', "Quit Anyway");
            case 3 /* ShutdownReason.RELOAD */:
                return localize('shutdownForceReload', "Reload Anyway");
        }
    }
    async backupBeforeShutdown(modifiedWorkingCopies) {
        const backups = [];
        let error = undefined;
        await this.withProgressAndCancellation(async (token) => {
            // Perform a backup of all modified working copies unless a backup already exists
            try {
                await Promises.settled(modifiedWorkingCopies.map(async (workingCopy) => {
                    // Backup exists
                    const contentVersion = this.getContentVersion(workingCopy);
                    if (this.workingCopyBackupService.hasBackupSync(workingCopy, contentVersion)) {
                        backups.push(workingCopy);
                    }
                    // Backup does not exist
                    else {
                        const backup = await workingCopy.backup(token);
                        if (token.isCancellationRequested) {
                            return;
                        }
                        await this.workingCopyBackupService.backup(workingCopy, backup.content, contentVersion, backup.meta, token);
                        if (token.isCancellationRequested) {
                            return;
                        }
                        backups.push(workingCopy);
                    }
                }));
            }
            catch (backupError) {
                error = backupError;
            }
        }, localize('backupBeforeShutdownMessage', "Backing up editors with unsaved changes is taking a bit longer..."), localize('backupBeforeShutdownDetail', "Click 'Cancel' to stop waiting and to save or revert editors with unsaved changes."));
        return { backups, error };
    }
    async confirmBeforeShutdown(modifiedWorkingCopies) {
        // Save
        const confirm = await this.fileDialogService.showSaveConfirm(modifiedWorkingCopies.map(workingCopy => workingCopy.name));
        if (confirm === 0 /* ConfirmResult.SAVE */) {
            const modifiedCountBeforeSave = this.workingCopyService.modifiedCount;
            try {
                await this.doSaveAllBeforeShutdown(modifiedWorkingCopies, 1 /* SaveReason.EXPLICIT */);
            }
            catch (error) {
                this.logService.error(`[backup tracker] error saving modified working copies: ${error}`); // guard against misbehaving saves, we handle remaining modified below
            }
            const savedWorkingCopies = modifiedCountBeforeSave - this.workingCopyService.modifiedCount;
            if (savedWorkingCopies < modifiedWorkingCopies.length) {
                return true; // veto (save failed or was canceled)
            }
            return this.noVeto(modifiedWorkingCopies); // no veto (modified saved)
        }
        // Don't Save
        else if (confirm === 1 /* ConfirmResult.DONT_SAVE */) {
            try {
                await this.doRevertAllBeforeShutdown(modifiedWorkingCopies);
            }
            catch (error) {
                this.logService.error(`[backup tracker] error reverting modified working copies: ${error}`); // do not block the shutdown on errors from revert
            }
            return this.noVeto(modifiedWorkingCopies); // no veto (modified reverted)
        }
        // Cancel
        return true; // veto (user canceled)
    }
    doSaveAllBeforeShutdown(workingCopies, reason) {
        return this.withProgressAndCancellation(async () => {
            // Skip save participants on shutdown for performance reasons
            const saveOptions = { skipSaveParticipants: true, reason };
            // First save through the editor service if we save all to benefit
            // from some extras like switching to untitled modified editors before saving.
            let result = undefined;
            if (workingCopies.length === this.workingCopyService.modifiedCount) {
                result = (await this.editorService.saveAll({
                    includeUntitled: { includeScratchpad: true },
                    ...saveOptions
                })).success;
            }
            // If we still have modified working copies, save those directly
            // unless the save was not successful (e.g. cancelled)
            if (result !== false) {
                await Promises.settled(workingCopies.map(workingCopy => workingCopy.isModified() ? workingCopy.save(saveOptions) : Promise.resolve(true)));
            }
        }, localize('saveBeforeShutdown', "Saving editors with unsaved changes is taking a bit longer..."), undefined, 
        // Do not pick `Dialog` as location for reporting progress if it is likely
        // that the save operation will itself open a dialog for asking for the
        // location to save to for untitled or scratchpad working copies.
        // https://github.com/microsoft/vscode-internalbacklog/issues/4943
        workingCopies.some(workingCopy => workingCopy.capabilities & 2 /* WorkingCopyCapabilities.Untitled */ || workingCopy.capabilities & 4 /* WorkingCopyCapabilities.Scratchpad */) ? 10 /* ProgressLocation.Window */ : 20 /* ProgressLocation.Dialog */);
    }
    doRevertAllBeforeShutdown(modifiedWorkingCopies) {
        return this.withProgressAndCancellation(async () => {
            // Soft revert is good enough on shutdown
            const revertOptions = { soft: true };
            // First revert through the editor service if we revert all
            if (modifiedWorkingCopies.length === this.workingCopyService.modifiedCount) {
                await this.editorService.revertAll(revertOptions);
            }
            // If we still have modified working copies, revert those directly
            await Promises.settled(modifiedWorkingCopies.map(workingCopy => workingCopy.isModified() ? workingCopy.revert(revertOptions) : Promise.resolve()));
        }, localize('revertBeforeShutdown', "Reverting editors with unsaved changes is taking a bit longer..."));
    }
    onBeforeShutdownWithoutModified() {
        // We are about to shutdown without modified editors
        // and will discard any backups that are still
        // around that have not been handled depending
        // on the window state.
        //
        // Empty window: discard even unrestored backups to
        // prevent empty windows from restoring that cannot
        // be closed (workaround for not having implemented
        // https://github.com/microsoft/vscode/issues/127163
        // and a fix for what users have reported in issue
        // https://github.com/microsoft/vscode/issues/126725)
        //
        // Workspace/Folder window: do not discard unrestored
        // backups to give a chance to restore them in the
        // future. Since we do not restore workspace/folder
        // windows with backups, this is fine.
        return this.noVeto({ except: this.contextService.getWorkbenchState() === 1 /* WorkbenchState.EMPTY */ ? [] : Array.from(this.unrestoredBackups) });
    }
    async noVeto(arg1) {
        // Discard backups from working copies the
        // user either saved or reverted
        await this.discardBackupsBeforeShutdown(arg1);
        return false; // no veto (no modified)
    }
    async discardBackupsBeforeShutdown(arg1) {
        // We never discard any backups before we are ready
        // and have resolved all backups that exist. This
        // is important to not loose backups that have not
        // been handled.
        if (!this.isReady) {
            return;
        }
        await this.withProgressAndCancellation(async () => {
            // When we shutdown either with no modified working copies left
            // or with some handled, we start to discard these backups
            // to free them up. This helps to get rid of stale backups
            // as reported in https://github.com/microsoft/vscode/issues/92962
            //
            // However, we never want to discard backups that we know
            // were not restored in the session.
            try {
                if (Array.isArray(arg1)) {
                    await Promises.settled(arg1.map(workingCopy => this.workingCopyBackupService.discardBackup(workingCopy)));
                }
                else {
                    await this.workingCopyBackupService.discardBackups(arg1);
                }
            }
            catch (error) {
                this.logService.error(`[backup tracker] error discarding backups: ${error}`);
            }
        }, localize('discardBackupsBeforeShutdown', "Discarding backups is taking a bit longer..."));
    }
    withProgressAndCancellation(promiseFactory, title, detail, location = 20 /* ProgressLocation.Dialog */) {
        const cts = new CancellationTokenSource();
        return this.progressService.withProgress({
            location, // by default use a dialog to prevent the user from making any more changes now (https://github.com/microsoft/vscode/issues/122774)
            cancellable: true, // allow to cancel (https://github.com/microsoft/vscode/issues/112278)
            delay: 800, // delay so that it only appears when operation takes a long time
            title,
            detail
        }, () => raceCancellation(promiseFactory(cts.token), cts.token), () => cts.dispose(true));
    }
};
NativeWorkingCopyBackupTracker = __decorate([
    __param(0, IWorkingCopyBackupService),
    __param(1, IFilesConfigurationService),
    __param(2, IWorkingCopyService),
    __param(3, ILifecycleService),
    __param(4, IFileDialogService),
    __param(5, IDialogService),
    __param(6, IWorkspaceContextService),
    __param(7, INativeHostService),
    __param(8, ILogService),
    __param(9, IEnvironmentService),
    __param(10, IProgressService),
    __param(11, IWorkingCopyEditorService),
    __param(12, IEditorService)
], NativeWorkingCopyBackupTracker);
export { NativeWorkingCopyBackupTracker };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2luZ0NvcHlCYWNrdXBUcmFja2VyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2VsZWN0cm9uLWJyb3dzZXIvd29ya2luZ0NvcHlCYWNrdXBUcmFja2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUUzRSxPQUFPLEVBQUUsMEJBQTBCLEVBQWdCLE1BQU0sOERBQThELENBQUM7QUFDeEgsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFdEUsT0FBTyxFQUFFLGlCQUFpQixFQUFrQixNQUFNLHFDQUFxQyxDQUFDO0FBQ3hGLE9BQU8sRUFBaUIsa0JBQWtCLEVBQUUsY0FBYyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDeEksT0FBTyxFQUFrQix3QkFBd0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNsRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNsRixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNqRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRXRFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzdGLE9B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