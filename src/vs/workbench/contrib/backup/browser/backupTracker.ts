/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { AutoSaveMode, IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { IWorkingCopy, IWorkingCopyService, WorkingCopyCapabilities } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { ILifecycleService, ShutdownReason } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { BackupTracker } from 'vs/workbench/contrib/backup/common/backupTracker';

export class BrowserBackupTracker extends BackupTracker implements IWorkbenchContribution {

	// Delay creation of backups when content changes to avoid too much
	// load on the backup service when the user is typing into the editor
	// Since we always schedule a backup, even when auto save is on (web
	// only), we have different scheduling delays based on auto save. This
	// helps to avoid a race between saving (after 1s per default) and making
	// a backup of the working copy.
	private static readonly BACKUP_SCHEDULE_DELAYS = {
		[AutoSaveMode.OFF]: 1000,
		[AutoSaveMode.ON_FOCUS_CHANGE]: 1000,
		[AutoSaveMode.ON_WINDOW_CHANGE]: 1000,
		[AutoSaveMode.AFTER_SHORT_DELAY]: 2000, // explicitly higher to prevent races
		[AutoSaveMode.AFTER_LONG_DELAY]: 1000
	};

	constructor(
		@IBackupFileService backupFileService: IBackupFileService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@IWorkingCopyService workingCopyService: IWorkingCopyService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@ILogService logService: ILogService
	) {
		super(backupFileService, workingCopyService, logService, lifecycleService);
	}

	protected shouldScheduleBackup(workingCopy: IWorkingCopy): boolean {
		// Web: we always want to schedule a backup, even if auto save
		// is enabled because in web there is no handler on shutdown
		// to trigger saving so there is a higher chance of dataloss.
		// See https://github.com/microsoft/vscode/issues/108789
		return true;
	}

	protected getBackupScheduleDelay(workingCopy: IWorkingCopy): number {
		let autoSaveMode = this.filesConfigurationService.getAutoSaveMode();
		if (workingCopy.capabilities & WorkingCopyCapabilities.Untitled) {
			autoSaveMode = AutoSaveMode.OFF; // auto-save is never on for untitled working copies
		}

		return BrowserBackupTracker.BACKUP_SCHEDULE_DELAYS[autoSaveMode];
	}

	protected onBeforeShutdown(reason: ShutdownReason): boolean | Promise<boolean> {

		// Web: we cannot perform long running in the shutdown phase
		// As such we need to check sync if there are any dirty working
		// copies that have not been backed up yet and then prevent the
		// shutdown if that is the case.

		const dirtyWorkingCopies = this.workingCopyService.dirtyWorkingCopies;
		if (!dirtyWorkingCopies.length) {
			return false; // no dirty: no veto
		}

		if (!this.filesConfigurationService.isHotExitEnabled) {
			return true; // dirty without backup: veto
		}

		for (const dirtyWorkingCopy of dirtyWorkingCopies) {
			if (!this.backupFileService.hasBackupSync(dirtyWorkingCopy.resource, this.getContentVersion(dirtyWorkingCopy))) {
				this.logService.warn('Unload veto: pending backups');

				return true; // dirty without backup: veto
			}
		}

		return false; // dirty with backups: no veto
	}
}
