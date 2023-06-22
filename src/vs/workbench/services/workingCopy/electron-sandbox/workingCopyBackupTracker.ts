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
import { WorkbenchState, IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { isMacintosh } from 'vs/base/common/platform';
import { HotExitConfiguration } from 'vs/platform/files/common/files';
import { INativeHostService } from 'vs/platform/native/common/native';
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

	protected async onFinalBeforeShutdown(reason: ShutdownReason): Promise<boolean> {

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
		} finally {
			resume();
		}
	}

	protected async onBeforeShutdownWithModified(reason: ShutdownReason, modifiedWorkingCopies: readonly IWorkingCopy[]): Promise<boolean> {

		// If auto save is enabled, save all non-untitled working copies
		// and then check again for modified copies

		if (this.filesConfigurationService.getAutoSaveMode() !== AutoSaveMode.OFF) {

			// Save all modified working copies that can be auto-saved
			try {
				const workingCopiesToSave = modifiedWorkingCopies.filter(wc => !(wc.capabilities & WorkingCopyCapabilities.Untitled));
				await this.doSaveAllBeforeShutdown(workingCopiesToSave, SaveReason.AUTO);
			} catch (error) {
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

	private async handleModifiedBeforeShutdown(modifiedWorkingCopies: readonly IWorkingCopy[], reason: ShutdownReason): Promise<boolean> {

		// Trigger backup if configured and enabled for shutdown reason
		let backups: IWorkingCopy[] = [];
		let backupError: Error | undefined = undefined;
		const modifiedWorkingCopiesToBackup = await this.shouldBackupBeforeShutdown(reason, modifiedWorkingCopies);
		if (modifiedWorkingCopiesToBackup.length > 0) {
			try {
				const backupResult = await this.backupBeforeShutdown(modifiedWorkingCopiesToBackup);
				backups = backupResult.backups;
				backupError = backupResult.error;

				if (backups.length === modifiedWorkingCopies.length) {
					return false; // no veto (backup was successful for all working copies)
				}
			} catch (error) {
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

			this.showErrorDialog(localize('backupTrackerBackupFailed', "The following editors with unsaved changes could not be saved to the back up location."), remainingModifiedWorkingCopies, backupError);

			return true; // veto (the backup failed)
		}

		// Since a backup did not happen, we have to confirm for
		// the working copies that did not successfully backup

		try {
			return await this.confirmBeforeShutdown(remainingModifiedWorkingCopies);
		} catch (error) {
			if (this.environmentService.isExtensionDevelopment) {
				this.logService.error(`[backup tracker] error saving or reverting modified working copies: ${error}`);

				return false; // do not block shutdown during extension development (https://github.com/microsoft/vscode/issues/115028)
			}

			this.showErrorDialog(localize('backupTrackerConfirmFailed', "The following editors with unsaved changes could not be saved or reverted."), remainingModifiedWorkingCopies, error);

			return true; // veto (save or revert failed)
		}
	}

	private async shouldBackupBeforeShutdown(reason: ShutdownReason, modifiedWorkingCopies: readonly IWorkingCopy[]): Promise<readonly IWorkingCopy[]> {
		if (!this.filesConfigurationService.isHotExitEnabled) {
			return []; // never backup when hot exit is disabled via settings
		}

		if (this.environmentService.isExtensionDevelopment) {
			return modifiedWorkingCopies; // always backup closing extension development window without asking to speed up debugging
		}

		switch (reason) {

			// Window Close
			case ShutdownReason.CLOSE:
				if (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY && this.filesConfigurationService.hotExitConfiguration === HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE) {
					return modifiedWorkingCopies; // backup if a workspace/folder is open and onExitAndWindowClose is configured
				}

				if (isMacintosh || await this.nativeHostService.getWindowCount() > 1) {
					if (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY) {
						return modifiedWorkingCopies.filter(modifiedWorkingCopy => modifiedWorkingCopy.capabilities & WorkingCopyCapabilities.Scratchpad); // backup scratchpads automatically to avoid user confirmation
					}

					return []; // do not backup if a window is closed that does not cause quitting of the application
				}

				return modifiedWorkingCopies; // backup if last window is closed on win/linux where the application quits right after

			// Application Quit
			case ShutdownReason.QUIT:
				return modifiedWorkingCopies; // backup because next start we restore all backups

			// Window Reload
			case ShutdownReason.RELOAD:
				return modifiedWorkingCopies; // backup because after window reload, backups restore

			// Workspace Change
			case ShutdownReason.LOAD:
				if (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY) {
					if (this.filesConfigurationService.hotExitConfiguration === HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE) {
						return modifiedWorkingCopies; // backup if a workspace/folder is open and onExitAndWindowClose is configured
					}

					return modifiedWorkingCopies.filter(modifiedWorkingCopy => modifiedWorkingCopy.capabilities & WorkingCopyCapabilities.Scratchpad); // backup scratchpads automatically to avoid user confirmation
				}

				return []; // do not backup because we are switching contexts with no workspace/folder open
		}
	}

	private showErrorDialog(msg: string, workingCopies: readonly IWorkingCopy[], error?: Error): void {
		const modifiedWorkingCopies = workingCopies.filter(workingCopy => workingCopy.isModified());

		const advice = localize('backupErrorDetails', "Try saving or reverting the editors with unsaved changes first and then try again.");
		const detail = modifiedWorkingCopies.length
			? getFileNamesMessage(modifiedWorkingCopies.map(x => x.name)) + '\n' + advice
			: advice;

		this.dialogService.error(msg, detail);

		this.logService.error(error ? `[backup tracker] ${msg}: ${error}` : `[backup tracker] ${msg}`);
	}

	private async backupBeforeShutdown(modifiedWorkingCopies: readonly IWorkingCopy[]): Promise<{ backups: IWorkingCopy[]; error?: Error }> {
		const backups: IWorkingCopy[] = [];
		let error: Error | undefined = undefined;

		await this.withProgressAndCancellation(async token => {

			// Perform a backup of all modified working copies unless a backup already exists
			try {
				await Promises.settled(modifiedWorkingCopies.map(async workingCopy => {

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
			} catch (backupError) {
				error = backupError;
			}
		},
			localize('backupBeforeShutdownMessage', "Backing up editors with unsaved changes is taking a bit longer..."),
			localize('backupBeforeShutdownDetail', "Click 'Cancel' to stop waiting and to save or revert editors with unsaved changes.")
		);

		return { backups, error };
	}

	private async confirmBeforeShutdown(modifiedWorkingCopies: IWorkingCopy[]): Promise<boolean> {

		// Save
		const confirm = await this.fileDialogService.showSaveConfirm(modifiedWorkingCopies.map(workingCopy => workingCopy.name));
		if (confirm === ConfirmResult.SAVE) {
			const modifiedCountBeforeSave = this.workingCopyService.modifiedCount;

			try {
				await this.doSaveAllBeforeShutdown(modifiedWorkingCopies, SaveReason.EXPLICIT);
			} catch (error) {
				this.logService.error(`[backup tracker] error saving modified working copies: ${error}`); // guard against misbehaving saves, we handle remaining modified below
			}

			const savedWorkingCopies = modifiedCountBeforeSave - this.workingCopyService.modifiedCount;
			if (savedWorkingCopies < modifiedWorkingCopies.length) {
				return true; // veto (save failed or was canceled)
			}

			return this.noVeto(modifiedWorkingCopies); // no veto (modified saved)
		}

		// Don't Save
		else if (confirm === ConfirmResult.DONT_SAVE) {
			try {
				await this.doRevertAllBeforeShutdown(modifiedWorkingCopies);
			} catch (error) {
				this.logService.error(`[backup tracker] error reverting modified working copies: ${error}`); // do not block the shutdown on errors from revert
			}

			return this.noVeto(modifiedWorkingCopies); // no veto (modified reverted)
		}

		// Cancel
		return true; // veto (user canceled)
	}

	private doSaveAllBeforeShutdown(workingCopies: IWorkingCopy[], reason: SaveReason): Promise<void> {
		return this.withProgressAndCancellation(async () => {

			// Skip save participants on shutdown for performance reasons
			const saveOptions = { skipSaveParticipants: true, reason };

			// First save through the editor service if we save all to benefit
			// from some extras like switching to untitled modified editors before saving.
			let result: boolean | undefined = undefined;
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
		}, localize('saveBeforeShutdown', "Saving editors with unsaved changes is taking a bit longer..."));
	}

	private doRevertAllBeforeShutdown(modifiedWorkingCopies: IWorkingCopy[]): Promise<void> {
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

	private onBeforeShutdownWithoutModified(): Promise<boolean> {

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

		return this.noVeto({ except: this.contextService.getWorkbenchState() === WorkbenchState.EMPTY ? [] : Array.from(this.unrestoredBackups) });
	}

	private noVeto(backupsToDiscard: IWorkingCopyIdentifier[]): Promise<boolean>;
	private noVeto(backupsToKeep: { except: IWorkingCopyIdentifier[] }): Promise<boolean>;
	private async noVeto(arg1: IWorkingCopyIdentifier[] | { except: IWorkingCopyIdentifier[] }): Promise<boolean> {

		// Discard backups from working copies the
		// user either saved or reverted

		await this.discardBackupsBeforeShutdown(arg1);

		return false; // no veto (no modified)
	}

	private discardBackupsBeforeShutdown(backupsToDiscard: IWorkingCopyIdentifier[]): Promise<void>;
	private discardBackupsBeforeShutdown(backupsToKeep: { except: IWorkingCopyIdentifier[] }): Promise<void>;
	private discardBackupsBeforeShutdown(backupsToDiscardOrKeep: IWorkingCopyIdentifier[] | { except: IWorkingCopyIdentifier[] }): Promise<void>;
	private async discardBackupsBeforeShutdown(arg1: IWorkingCopyIdentifier[] | { except: IWorkingCopyIdentifier[] }): Promise<void> {

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
				} else {
					await this.workingCopyBackupService.discardBackups(arg1);
				}
			} catch (error) {
				this.logService.error(`[backup tracker] error discarding backups: ${error}`);
			}
		}, localize('discardBackupsBeforeShutdown', "Discarding backups is taking a bit longer..."));
	}

	private withProgressAndCancellation(promiseFactory: (token: CancellationToken) => Promise<void>, title: string, detail?: string): Promise<void> {
		const cts = new CancellationTokenSource();

		return this.progressService.withProgress({
			location: ProgressLocation.Dialog, 	// use a dialog to prevent the user from making any more changes now (https://github.com/microsoft/vscode/issues/122774)
			cancellable: true, 					// allow to cancel (https://github.com/microsoft/vscode/issues/112278)
			delay: 800, 						// delay so that it only appears when operation takes a long time
			title,
			detail
		}, () => raceCancellation(promiseFactory(cts.token), cts.token), () => cts.dispose(true));
	}
}
