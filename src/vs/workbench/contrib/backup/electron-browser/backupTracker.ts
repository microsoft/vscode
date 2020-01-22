/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IFilesConfigurationService, AutoSaveMode } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { IWorkingCopyService, IWorkingCopy, WorkingCopyCapabilities } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { ILifecycleService, LifecyclePhase, ShutdownReason } from 'vs/platform/lifecycle/common/lifecycle';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { ConfirmResult, IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { WorkbenchState, IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { isMacintosh } from 'vs/base/common/platform';
import { HotExitConfiguration } from 'vs/platform/files/common/files';
import { IElectronService } from 'vs/platform/electron/node/electron';
import { BackupTracker } from 'vs/workbench/contrib/backup/common/backupTracker';
import { ILogService } from 'vs/platform/log/common/log';

export class NativeBackupTracker extends BackupTracker implements IWorkbenchContribution {

	constructor(
		@IBackupFileService backupFileService: IBackupFileService,
		@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService,
		@IWorkingCopyService workingCopyService: IWorkingCopyService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IElectronService private readonly electronService: IElectronService,
		@ILogService logService: ILogService
	) {
		super(backupFileService, filesConfigurationService, workingCopyService, logService, lifecycleService);
	}

	protected onBeforeShutdown(reason: ShutdownReason): boolean | Promise<boolean> {

		// Dirty working copies need treatment on shutdown
		const dirtyWorkingCopies = this.workingCopyService.dirtyWorkingCopies;
		if (dirtyWorkingCopies.length) {

			// If auto save is enabled, save all non-untitled working copies
			// and then check again for dirty copies
			if (this.filesConfigurationService.getAutoSaveMode() !== AutoSaveMode.OFF) {
				return this.doSaveAllBeforeShutdown(dirtyWorkingCopies, false /* not untitled */).then(() => {

					// If we still have dirty working copies, we either have untitled ones or working copies that cannot be saved
					const remainingDirtyWorkingCopies = this.workingCopyService.dirtyWorkingCopies;
					if (remainingDirtyWorkingCopies.length) {
						return this.handleDirtyBeforeShutdown(remainingDirtyWorkingCopies, reason);
					}

					return this.noVeto({ dicardAllBackups: false }); // no veto and no backup cleanup (since there are no dirty working copies)
				});
			}

			// Auto save is not enabled
			return this.handleDirtyBeforeShutdown(dirtyWorkingCopies, reason);
		}

		// No dirty working copies: no veto
		return this.noVeto({ dicardAllBackups: true });
	}

	private async handleDirtyBeforeShutdown(workingCopies: IWorkingCopy[], reason: ShutdownReason): Promise<boolean> {
		let didBackup: boolean | undefined = undefined;
		let backupError: Error | undefined = undefined;

		// Trigger backup if configured
		if (this.filesConfigurationService.isHotExitEnabled) {
			try {
				didBackup = await this.backupBeforeShutdown(workingCopies, reason);
			} catch (error) {
				backupError = error;
			}
		}

		if (!didBackup) {
			// since a backup did not happen, we have to confirm for the dirty working copies now
			return this.confirmBeforeShutdown();
		}

		if (backupError || workingCopies.some(workingCopy => !this.backupFileService.hasBackupSync(workingCopy.resource, this.getContentVersion(workingCopy)))) {
			// we ran a backup and this either failed or there are
			// some remaining dirty working copies without backup
			if (backupError) {
				this.notificationService.error(localize('backupTrackerBackupFailed', "Working copies that are dirty could not be written to the backup location (Error: {0}). Try saving your editors first and then exit.", backupError.message));
			} else {
				this.notificationService.error(localize('backupTrackerBackupIncomplete', "Some working copies that are dirty could not be backed up. Try saving your editors first and then exit."));
			}

			return true; // veto, the backups failed
		}

		// no veto and no backup cleanup (since backup was successful)
		return this.noVeto({ dicardAllBackups: false });
	}

	private async backupBeforeShutdown(workingCopies: IWorkingCopy[], reason: ShutdownReason): Promise<boolean> {

		// When quit is requested skip the confirm callback and attempt to backup all workspaces.
		// When quit is not requested the confirm callback should be shown when the window being
		// closed is the only VS Code window open, except for on Mac where hot exit is only
		// ever activated when quit is requested.

		let doBackup: boolean | undefined;
		switch (reason) {
			case ShutdownReason.CLOSE:
				if (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY && this.filesConfigurationService.hotExitConfiguration === HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE) {
					doBackup = true; // backup if a folder is open and onExitAndWindowClose is configured
				} else if (await this.electronService.getWindowCount() > 1 || isMacintosh) {
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

		if (!doBackup) {
			return false;
		}

		// Backup all working copies. The backup file service is clever
		// enough to not backup a dirty working copy again if there is
		// already a backup for the given content version.
		await Promise.all(workingCopies.map(async workingCopy => {
			const backup = await workingCopy.backup();
			return this.backupFileService.backup(workingCopy.resource, backup.content, this.getContentVersion(workingCopy), backup.meta);
		}));

		return true;
	}

	private async confirmBeforeShutdown(): Promise<boolean> {

		// Show confirm dialog for all dirty working copies
		const dirtyWorkingCopies = this.workingCopyService.dirtyWorkingCopies;
		const confirm = await this.fileDialogService.showSaveConfirm(dirtyWorkingCopies.map(w => w.resource));

		// Save
		if (confirm === ConfirmResult.SAVE) {
			await this.doSaveAllBeforeShutdown(dirtyWorkingCopies, true /* includeUntitled */);

			return this.noVeto({ dicardAllBackups: true });
		}

		// Don't Save
		else if (confirm === ConfirmResult.DONT_SAVE) {
			await this.doRevertAllBeforeShutdown(dirtyWorkingCopies);

			return this.noVeto({ dicardAllBackups: true });
		}

		// Cancel
		else if (confirm === ConfirmResult.CANCEL) {
			return true; // veto
		}

		return false;
	}

	private doSaveAllBeforeShutdown(workingCopies: IWorkingCopy[], includeUntitled: boolean): Promise<boolean[]> {
		return Promise.all(workingCopies.map(async workingCopy => {
			if (workingCopy.isDirty() && (includeUntitled || !(workingCopy.capabilities & WorkingCopyCapabilities.Untitled))) {
				return workingCopy.save({ skipSaveParticipants: true }); // skip save participants on shutdown for performance reasons
			}

			return false;
		}));
	}

	private doRevertAllBeforeShutdown(workingCopies: IWorkingCopy[]): Promise<boolean[]> {
		return Promise.all(workingCopies.map(workingCopy => workingCopy.revert({ soft: true }))); // soft revert is good enough on shutdown
	}

	private noVeto(options: { dicardAllBackups: boolean }): boolean | Promise<boolean> {
		let dicardAllBackups = options.dicardAllBackups;

		if (this.lifecycleService.phase < LifecyclePhase.Restored) {
			dicardAllBackups = false; // if editors have not restored, we are not up to speed with backups and thus should not discard them
		}

		if (this.environmentService.isExtensionDevelopment) {
			dicardAllBackups = false; // extension development does not track any backups
		}

		return this.backupFileService.shutdown({ dicardAllBackups }).then(() => false, () => false);
	}
}
