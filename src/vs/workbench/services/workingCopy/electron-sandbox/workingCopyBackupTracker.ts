/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IWorkingCopyBackupService } from 'vs/workbench/services/workingCopy/common/workingCopyBackup';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IFilesConfigurationService, AutoSaveMode } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { IWorkingCopy, IWorkingCopyIdentifier, WorkingCopyCapabilities } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { ILifecycleService, ShutdownReason } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ConfirmResult, IFileDialogService, IDialogService, getFileNamesMessage } from 'vs/platform/dialogs/common/dialogs';
import Severity from 'vs/base/common/severity';
import { WorkbenchState, IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { isMacintosh } from 'vs/base/common/platform';
import { HotExitConfiguration } from 'vs/platform/files/common/files';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { WorkingCopyBackupTracker } from 'vs/workbench/services/workingCopy/common/workingCopyBackupTracker';
import { ILogService } from 'vs/platform/log/common/log';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { SaveReason } from 'vs/workbench/common/editor';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { Promises, raceCancellation } from 'vs/base/common/async';
import { IWorkingCopyEditorService } from 'vs/workbench/services/workingCopy/common/workingCopyEditorService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';

export class NativeWorkingCopyBackupTracker extends WorkingCopyBackupTracker implements IWorkbenchContribution {

	constructor(
		@IWorkingCopyBackupService workingCopyBackupService: IWorkingCopyBackupService,
		@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService,
		@IWorkingCopyService workingCopyService: IWorkingCopyService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IDialogService private readonly dialogService: IDialogService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@ILogService logService: ILogService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IProgressService private readonly progressService: IProgressService,
		@IWorkingCopyEditorService workingCopyEditorService: IWorkingCopyEditorService,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(workingCopyBackupService, workingCopyService, logService, lifecycleService, filesConfigurationService, workingCopyEditorService, editorService, editorGroupService);
	}

	protected onBeforeShutdown(reason: ShutdownReason): boolean | Promise<boolean> {

		// Dirty working copies need treatment on shutdown
		const dirtyWorkingCopies = this.workingCopyService.dirtyWorkingCopies;
		if (dirtyWorkingCopies.length) {
			return this.onBeforeShutdownWithDirty(reason, dirtyWorkingCopies);
		}

		// No dirty working copies
		return this.onBeforeShutdownWithoutDirty();
	}

	protected async onBeforeShutdownWithDirty(reason: ShutdownReason, dirtyWorkingCopies: readonly IWorkingCopy[]): Promise<boolean> {

		// If auto save is enabled, save all non-untitled working copies
		// and then check again for dirty copies
		if (this.filesConfigurationService.getAutoSaveMode() !== AutoSaveMode.OFF) {

			// Save all dirty working copies
			try {
				await this.doSaveAllBeforeShutdown(false /* not untitled */, SaveReason.AUTO);
			} catch (error) {
				this.logService.error(`[backup tracker] error saving dirty working copies: ${error}`); // guard against misbehaving saves, we handle remaining dirty below
			}

			// If we still have dirty working copies, we either have untitled ones or working copies that cannot be saved
			const remainingDirtyWorkingCopies = this.workingCopyService.dirtyWorkingCopies;
			if (remainingDirtyWorkingCopies.length) {
				return this.handleDirtyBeforeShutdown(remainingDirtyWorkingCopies, reason);
			}

			return false; // no veto (there are no remaining dirty working copies)
		}

		// Auto save is not enabled
		return this.handleDirtyBeforeShutdown(dirtyWorkingCopies, reason);
	}

	private async handleDirtyBeforeShutdown(dirtyWorkingCopies: readonly IWorkingCopy[], reason: ShutdownReason): Promise<boolean> {

		// Trigger backup if configured
		let backups: IWorkingCopy[] = [];
		let backupError: Error | undefined = undefined;
		if (this.filesConfigurationService.isHotExitEnabled) {
			try {
				const backupResult = await this.backupBeforeShutdown(dirtyWorkingCopies, reason);
				backups = backupResult.backups;
				backupError = backupResult.error;

				if (backups.length === dirtyWorkingCopies.length) {
					return false; // no veto (backup was successful for all working copies)
				}
			} catch (error) {
				backupError = error;
			}
		}

		const remainingDirtyWorkingCopies = dirtyWorkingCopies.filter(workingCopy => !backups.includes(workingCopy));

		// We ran a backup but received an error that we show to the user
		if (backupError) {
			if (this.environmentService.isExtensionDevelopment) {
				this.logService.error(`[backup tracker] error creating backups: ${backupError}`);

				return false; // do not block shutdown during extension development (https://github.com/microsoft/vscode/issues/115028)
			}

			this.showErrorDialog(localize('backupTrackerBackupFailed', "The following editors with unsaved changes could not be saved to the back up location."), remainingDirtyWorkingCopies, backupError);

			return true; // veto (the backup failed)
		}

		// Since a backup did not happen, we have to confirm for
		// the working copies that did not successfully backup
		try {
			return await this.confirmBeforeShutdown(remainingDirtyWorkingCopies);
		} catch (error) {
			if (this.environmentService.isExtensionDevelopment) {
				this.logService.error(`[backup tracker] error saving or reverting dirty working copies: ${error}`);

				return false; // do not block shutdown during extension development (https://github.com/microsoft/vscode/issues/115028)
			}

			this.showErrorDialog(localize('backupTrackerConfirmFailed', "The following editors with unsaved changes could not be saved or reverted."), remainingDirtyWorkingCopies, error);

			return true; // veto (save or revert failed)
		}
	}

	private showErrorDialog(msg: string, workingCopies: readonly IWorkingCopy[], error?: Error): void {
		const dirtyWorkingCopies = workingCopies.filter(workingCopy => workingCopy.isDirty());

		const advice = localize('backupErrorDetails', "Try saving or reverting the editors with unsaved changes first and then try again.");
		const detail = dirtyWorkingCopies.length
			? getFileNamesMessage(dirtyWorkingCopies.map(x => x.name)) + '\n' + advice
			: advice;

		this.dialogService.show(Severity.Error, msg, undefined, { detail });

		this.logService.error(error ? `[backup tracker] ${msg}: ${error}` : `[backup tracker] ${msg}`);
	}

	private async backupBeforeShutdown(dirtyWorkingCopies: readonly IWorkingCopy[], reason: ShutdownReason): Promise<{ backups: IWorkingCopy[], error?: Error }> {

		// When quit is requested skip the confirm callback and attempt to backup all workspaces.
		// When quit is not requested the confirm callback should be shown when the window being
		// closed is the only VS Code window open, except for on Mac where hot exit is only
		// ever activated when quit is requested.

		let doBackup: boolean | undefined;
		if (this.environmentService.isExtensionDevelopment) {
			doBackup = true; // always backup closing extension development window without asking to speed up debugging
		} else {
			switch (reason) {
				case ShutdownReason.CLOSE:
					if (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY && this.filesConfigurationService.hotExitConfiguration === HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE) {
						doBackup = true; // backup if a folder is open and onExitAndWindowClose is configured
					} else if (await this.nativeHostService.getWindowCount() > 1 || isMacintosh) {
						doBackup = false; // do not backup if a window is closed that does not cause quitting of the application
					} else {
						doBackup = true; // backup if last window is closed on win/linux where the application quits right after
					}
					break;

				case ShutdownReason.QUIT:
					doBackup = true; // backup because next start we restore all backups
					break;

				case ShutdownReason.RELOAD:
					doBackup = true; // backup because after window reload, backups restore
					break;

				case ShutdownReason.LOAD:
					if (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY && this.filesConfigurationService.hotExitConfiguration === HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE) {
						doBackup = true; // backup if a folder is open and onExitAndWindowClose is configured
					} else {
						doBackup = false; // do not backup because we are switching contexts
					}
					break;
			}
		}

		if (!doBackup) {
			return { backups: [] };
		}

		return this.doBackupBeforeShutdown(dirtyWorkingCopies);
	}

	private async doBackupBeforeShutdown(dirtyWorkingCopies: readonly IWorkingCopy[]): Promise<{ backups: IWorkingCopy[], error?: Error }> {
		const backups: IWorkingCopy[] = [];
		let error: Error | undefined = undefined;

		await this.withProgressAndCancellation(async token => {

			// Perform a backup of all dirty working copies unless a backup already exists
			try {
				await Promises.settled(dirtyWorkingCopies.map(async workingCopy => {
					const contentVersion = this.getContentVersion(workingCopy);

					// Backup exists
					if (this.workingCopyBackupService.hasBackupSync(workingCopy, contentVersion)) {
						backups.push(workingCopy);
					}

					// Backup does not exist
					else {
						const backup = await workingCopy.backup(token);
						await this.workingCopyBackupService.backup(workingCopy, backup.content, contentVersion, backup.meta, token);

						backups.push(workingCopy);
					}
				}));
			} catch (backupError) {
				error = backupError;
			}
		},
			localize('backupBeforeShutdownMessage', "Backing up editors with unsaved changes is taking longer than expected..."),
			localize('backupBeforeShutdownDetail', "Click 'Cancel' to stop waiting and to save or revert editors with unsaved changes.")
		);

		return { backups, error };
	}

	private async confirmBeforeShutdown(dirtyWorkingCopies: IWorkingCopy[]): Promise<boolean> {

		// Save
		const confirm = await this.fileDialogService.showSaveConfirm(dirtyWorkingCopies.map(workingCopy => workingCopy.name));
		if (confirm === ConfirmResult.SAVE) {
			const dirtyCountBeforeSave = this.workingCopyService.dirtyCount;

			try {
				await this.doSaveAllBeforeShutdown(dirtyWorkingCopies, SaveReason.EXPLICIT);
			} catch (error) {
				this.logService.error(`[backup tracker] error saving dirty working copies: ${error}`); // guard against misbehaving saves, we handle remaining dirty below
			}

			const savedWorkingCopies = dirtyCountBeforeSave - this.workingCopyService.dirtyCount;
			if (savedWorkingCopies < dirtyWorkingCopies.length) {
				return true; // veto (save failed or was canceled)
			}

			return this.noVeto(dirtyWorkingCopies); // no veto (dirty saved)
		}

		// Don't Save
		else if (confirm === ConfirmResult.DONT_SAVE) {
			try {
				await this.doRevertAllBeforeShutdown(dirtyWorkingCopies);
			} catch (error) {
				this.logService.error(`[backup tracker] error reverting dirty working copies: ${error}`); // do not block the shutdown on errors from revert
			}

			return this.noVeto(dirtyWorkingCopies); // no veto (dirty reverted)
		}

		// Cancel
		return true; // veto (user canceled)
	}

	private doSaveAllBeforeShutdown(dirtyWorkingCopies: IWorkingCopy[], reason: SaveReason): Promise<void>;
	private doSaveAllBeforeShutdown(includeUntitled: boolean, reason: SaveReason): Promise<void>;
	private doSaveAllBeforeShutdown(arg1: IWorkingCopy[] | boolean, reason: SaveReason): Promise<void> {
		const dirtyWorkingCopies = Array.isArray(arg1) ? arg1 : this.workingCopyService.dirtyWorkingCopies.filter(workingCopy => {
			if (arg1 === false && (workingCopy.capabilities & WorkingCopyCapabilities.Untitled)) {
				return false; // skip untitled unless explicitly included
			}

			return true;
		});

		return this.withProgressAndCancellation(async () => {

			// Skip save participants on shutdown for performance reasons
			const saveOptions = { skipSaveParticipants: true, reason };

			// First save through the editor service if we save all to benefit
			// from some extras like switching to untitled dirty editors before saving.
			let result: boolean | undefined = undefined;
			if (typeof arg1 === 'boolean' || dirtyWorkingCopies.length === this.workingCopyService.dirtyCount) {
				result = await this.editorService.saveAll({ includeUntitled: typeof arg1 === 'boolean' ? arg1 : true, ...saveOptions });
			}

			// If we still have dirty working copies, save those directly
			// unless the save was not successful (e.g. cancelled)
			if (result !== false) {
				await Promises.settled(dirtyWorkingCopies.map(workingCopy => workingCopy.isDirty() ? workingCopy.save(saveOptions) : Promise.resolve(true)));
			}
		}, localize('saveBeforeShutdown', "Saving editors with unsaved changes is taking longer than expected..."));
	}

	private doRevertAllBeforeShutdown(dirtyWorkingCopies: IWorkingCopy[]): Promise<void> {
		return this.withProgressAndCancellation(async () => {

			// Soft revert is good enough on shutdown
			const revertOptions = { soft: true };

			// First revert through the editor service if we revert all
			if (dirtyWorkingCopies.length === this.workingCopyService.dirtyCount) {
				await this.editorService.revertAll(revertOptions);
			}

			// If we still have dirty working copies, revert those directly
			// unless the revert operation was not successful (e.g. cancelled)
			await Promises.settled(dirtyWorkingCopies.map(workingCopy => workingCopy.isDirty() ? workingCopy.revert(revertOptions) : Promise.resolve()));
		}, localize('revertBeforeShutdown', "Reverting editors with unsaved changes is taking longer than expected..."));
	}

	private withProgressAndCancellation(promiseFactory: (token: CancellationToken) => Promise<void>, title: string, detail?: string): Promise<void> {
		const cts = new CancellationTokenSource();

		return this.progressService.withProgress({
			location: ProgressLocation.Dialog, 	// use a dialog to prevent the user from making any more changes now (https://github.com/microsoft/vscode/issues/122774)
			cancellable: true, 					// allow to cancel (https://github.com/microsoft/vscode/issues/112278)
			delay: 800, 						// delay notification so that it only appears when operation takes a long time
			title,
			detail
		}, () => raceCancellation(promiseFactory(cts.token), cts.token), () => cts.dispose(true));
	}

	private async noVeto(backupsToDiscard: IWorkingCopyIdentifier[]): Promise<boolean> {

		// Discard backups from working copies the
		// user either saved or reverted
		await this.discardBackupsBeforeShutdown(backupsToDiscard);

		return false; // no veto (no dirty)
	}

	private async onBeforeShutdownWithoutDirty(): Promise<boolean> {

		// We are about to shutdown without dirty editors
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

		await this.discardBackupsBeforeShutdown({ except: this.contextService.getWorkbenchState() === WorkbenchState.EMPTY ? [] : Array.from(this.unrestoredBackups) });

		return false; // no veto (no dirty)
	}

	private discardBackupsBeforeShutdown(backupsToDiscard: IWorkingCopyIdentifier[]): Promise<void>;
	private discardBackupsBeforeShutdown(backupsToKeep: { except: IWorkingCopyIdentifier[] }): Promise<void>;
	private async discardBackupsBeforeShutdown(arg1: IWorkingCopyIdentifier[] | { except: IWorkingCopyIdentifier[] }): Promise<void> {

		// We never discard any backups before we are ready
		// and have resolved all backups that exist. This
		// is important to not loose backups that have not
		// been handled.
		if (!this.isReady) {
			return;
		}

		// When we shutdown either with no dirty working copies left
		// or with some handled, we start to discard these backups
		// to free them up. This helps to get rid of stale backups
		// as reported in https://github.com/microsoft/vscode/issues/92962
		//
		// However, we never want to discard backups that we know
		// were not restored in the session.
		try {
			if (Array.isArray(arg1)) {
				await Promises.settled(arg1.map(workingCopy => this.workingCopyBackupService.discardBackup(workingCopy)));
			} else {
				await this.workingCopyBackupService.discardBackups(arg1);
			}
		} catch (error) {
			this.logService.error(`[backup tracker] error discarding backups: ${error}`);
		}
	}
}
