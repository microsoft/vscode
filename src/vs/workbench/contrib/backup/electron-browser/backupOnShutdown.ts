/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { Disposable } from 'vs/base/common/lifecycle';
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
import { ISaveOptions, IRevertOptions } from 'vs/workbench/common/editor';

export class BackupOnShutdown extends Disposable implements IWorkbenchContribution {

	constructor(
		@IBackupFileService private readonly backupFileService: IBackupFileService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IElectronService private readonly electronService: IElectronService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners() {

		// Lifecycle
		this.lifecycleService.onBeforeShutdown(event => event.veto(this.onBeforeShutdown(event.reason)));
	}

	private onBeforeShutdown(reason: ShutdownReason): boolean | Promise<boolean> {

		// Dirty working copies need treatment on shutdown
		const dirtyWorkingCopies = this.workingCopyService.dirtyWorkingCopies;
		if (dirtyWorkingCopies.length) {

			// If auto save is enabled, save all working copies and then check again for dirty copies
			// We DO NOT run any save participant if we are in the shutdown phase for performance reasons
			if (this.filesConfigurationService.getAutoSaveMode() !== AutoSaveMode.OFF) {
				return this.doSaveAll(dirtyWorkingCopies, false /* not untitled */, { skipSaveParticipants: true }).then(() => {

					// If we still have dirty working copies, we either have untitled ones or working copies that cannot be saved
					const remainingDirtyWorkingCopies = this.workingCopyService.dirtyWorkingCopies;
					if (remainingDirtyWorkingCopies.length) {
						return this.handleDirtyBeforeShutdown(remainingDirtyWorkingCopies, reason);
					}

					return this.noVeto({ cleanUpBackups: false }); // no veto and no backup cleanup (since there are no dirty working copies)
				});
			}

			// Auto save is not enabled
			return this.handleDirtyBeforeShutdown(dirtyWorkingCopies, reason);
		}

		// No dirty working copies: no veto
		return this.noVeto({ cleanUpBackups: true });
	}

	private handleDirtyBeforeShutdown(workingCopies: IWorkingCopy[], reason: ShutdownReason): boolean | Promise<boolean> {

		// If hot exit is enabled, backup dirty working copies and allow to exit without confirmation
		if (this.filesConfigurationService.isHotExitEnabled) {
			return this.backupBeforeShutdown(workingCopies, reason).then(didBackup => {
				if (didBackup) {
					return this.noVeto({ cleanUpBackups: false }); // no veto and no backup cleanup (since backup was successful)
				}

				// since a backup did not happen, we have to confirm for the dirty working copies now
				return this.confirmBeforeShutdown();
			}, error => {
				this.notificationService.error(localize('backupOnShutdown.failSave', "Working copies that are dirty could not be written to the backup location (Error: {0}). Try saving your editors first and then exit.", error.message));

				return true; // veto, the backups failed
			});
		}

		// Otherwise just confirm from the user what to do with the dirty working copies
		return this.confirmBeforeShutdown();
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

		// Backup all working copies
		await Promise.all(workingCopies.map(workingCopy => workingCopy.backup()));

		return true;
	}

	private async confirmBeforeShutdown(): Promise<boolean> {

		// Show confirm dialog for all dirty working copies
		const dirtyWorkingCopies = this.workingCopyService.dirtyWorkingCopies;
		const confirm = await this.fileDialogService.showSaveConfirm(dirtyWorkingCopies.map(w => w.resource));

		// Save
		if (confirm === ConfirmResult.SAVE) {
			await this.doSaveAll(dirtyWorkingCopies, true /* includeUntitled */, { skipSaveParticipants: true });

			if (this.workingCopyService.hasDirty) {
				return true; // veto if any save failed
			}

			return this.noVeto({ cleanUpBackups: true });
		}

		// Don't Save
		else if (confirm === ConfirmResult.DONT_SAVE) {

			// Make sure to revert working copies so that they do not restore
			// see https://github.com/Microsoft/vscode/issues/29572
			await this.doRevertAll(dirtyWorkingCopies, { soft: true } /* soft revert is good enough on shutdown */);

			return this.noVeto({ cleanUpBackups: true });
		}

		// Cancel
		else if (confirm === ConfirmResult.CANCEL) {
			return true; // veto
		}

		return false;
	}

	private doSaveAll(workingCopies: IWorkingCopy[], includeUntitled: boolean, options: ISaveOptions): Promise<boolean[]> {
		return Promise.all(workingCopies.map(async workingCopy => {
			if (workingCopy.isDirty() && (includeUntitled || !(workingCopy.capabilities & WorkingCopyCapabilities.Untitled))) {
				return workingCopy.save(options);
			}

			return false;
		}));
	}

	private doRevertAll(workingCopies: IWorkingCopy[], options: IRevertOptions): Promise<boolean[]> {
		return Promise.all(workingCopies.map(workingCopy => workingCopy.revert(options)));
	}

	private noVeto(options: { cleanUpBackups: boolean }): boolean | Promise<boolean> {
		if (!options.cleanUpBackups) {
			return false;
		}

		if (this.lifecycleService.phase < LifecyclePhase.Restored) {
			return false; // if editors have not restored, we are not up to speed with backups and thus should not clean them
		}

		if (this.environmentService.isExtensionDevelopment) {
			return false; // extension development does not track any backups
		}

		return this.backupFileService.discardAllWorkspaceBackups().then(() => false, () => false);
	}
}
