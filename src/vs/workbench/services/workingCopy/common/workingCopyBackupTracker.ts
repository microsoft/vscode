/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkingCopyBackupService } from 'vs/workbench/services/workingCopy/common/workingCopyBackup';
import { Disposable, IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { IWorkingCopy, WorkingCopyCapabilities } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { ILogService } from 'vs/platform/log/common/log';
import { ShutdownReason, ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { AutoSaveMode, IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';

export abstract class WorkingCopyBackupTracker extends Disposable {

	// A map from working copy to a version ID we compute on each content
	// change. This version ID allows to e.g. ask if a backup for a specific
	// content has been made before closing.
	private readonly mapWorkingCopyToContentVersion = new Map<IWorkingCopy, number>();

	// A map of scheduled pending backups for working copies
	protected readonly pendingBackups = new Map<IWorkingCopy, IDisposable>();

	// Delay creation of backups when content changes to avoid too much
	// load on the backup service when the user is typing into the editor
	// Since we always schedule a backup, even when auto save is on, we
	// have different scheduling delays based on auto save. This helps to
	// avoid a (not critical but also not really wanted) race between saving
	// (after 1s per default) and making a backup of the working copy.
	private static readonly BACKUP_SCHEDULE_DELAYS = {
		[AutoSaveMode.OFF]: 1000,
		[AutoSaveMode.ON_FOCUS_CHANGE]: 1000,
		[AutoSaveMode.ON_WINDOW_CHANGE]: 1000,
		[AutoSaveMode.AFTER_SHORT_DELAY]: 2000, // explicitly higher to prevent races
		[AutoSaveMode.AFTER_LONG_DELAY]: 1000
	};

	constructor(
		protected readonly workingCopyBackupService: IWorkingCopyBackupService,
		protected readonly workingCopyService: IWorkingCopyService,
		protected readonly logService: ILogService,
		private readonly lifecycleService: ILifecycleService,
		protected readonly filesConfigurationService: IFilesConfigurationService
	) {
		super();

		// Fill in initial dirty working copies
		this.workingCopyService.dirtyWorkingCopies.forEach(workingCopy => this.onDidRegister(workingCopy));

		this.registerListeners();
	}

	private registerListeners() {

		// Working Copy events
		this._register(this.workingCopyService.onDidRegister(workingCopy => this.onDidRegister(workingCopy)));
		this._register(this.workingCopyService.onDidUnregister(workingCopy => this.onDidUnregister(workingCopy)));
		this._register(this.workingCopyService.onDidChangeDirty(workingCopy => this.onDidChangeDirty(workingCopy)));
		this._register(this.workingCopyService.onDidChangeContent(workingCopy => this.onDidChangeContent(workingCopy)));

		// Lifecycle (handled in subclasses)
		this.lifecycleService.onBeforeShutdown(event => event.veto(this.onBeforeShutdown(event.reason), 'veto.backups'));
	}

	private onDidRegister(workingCopy: IWorkingCopy): void {
		if (workingCopy.isDirty()) {
			this.scheduleBackup(workingCopy);
		}
	}

	private onDidUnregister(workingCopy: IWorkingCopy): void {

		// Remove from content version map
		this.mapWorkingCopyToContentVersion.delete(workingCopy);

		// Discard backup
		this.discardBackup(workingCopy);
	}

	private onDidChangeDirty(workingCopy: IWorkingCopy): void {
		if (workingCopy.isDirty()) {
			this.scheduleBackup(workingCopy);
		} else {
			this.discardBackup(workingCopy);
		}
	}

	private onDidChangeContent(workingCopy: IWorkingCopy): void {

		// Increment content version ID
		const contentVersionId = this.getContentVersion(workingCopy);
		this.mapWorkingCopyToContentVersion.set(workingCopy, contentVersionId + 1);

		// Schedule backup if dirty
		if (workingCopy.isDirty()) {
			// this listener will make sure that the backup is
			// pushed out for as long as the user is still changing
			// the content of the working copy.
			this.scheduleBackup(workingCopy);
		}
	}

	private scheduleBackup(workingCopy: IWorkingCopy): void {

		// Clear any running backup operation
		this.cancelBackup(workingCopy);

		this.logService.trace(`[backup tracker] scheduling backup`, workingCopy.resource.toString(true), workingCopy.typeId);

		// Schedule new backup
		const cts = new CancellationTokenSource();
		const handle = setTimeout(async () => {
			if (cts.token.isCancellationRequested) {
				return;
			}

			// Backup if dirty
			if (workingCopy.isDirty()) {
				this.logService.trace(`[backup tracker] creating backup`, workingCopy.resource.toString(true), workingCopy.typeId);

				try {
					const backup = await workingCopy.backup(cts.token);
					if (cts.token.isCancellationRequested) {
						return;
					}

					if (workingCopy.isDirty()) {
						this.logService.trace(`[backup tracker] storing backup`, workingCopy.resource.toString(true), workingCopy.typeId);

						await this.workingCopyBackupService.backup(workingCopy, backup.content, this.getContentVersion(workingCopy), backup.meta, cts.token);
					}
				} catch (error) {
					this.logService.error(error);
				}
			}

			if (cts.token.isCancellationRequested) {
				return;
			}

			// Clear disposable
			this.pendingBackups.delete(workingCopy);

		}, this.getBackupScheduleDelay(workingCopy));

		// Keep in map for disposal as needed
		this.pendingBackups.set(workingCopy, toDisposable(() => {
			this.logService.trace(`[backup tracker] clearing pending backup`, workingCopy.resource.toString(true), workingCopy.typeId);

			cts.dispose(true);
			clearTimeout(handle);
		}));
	}

	protected getBackupScheduleDelay(workingCopy: IWorkingCopy): number {
		let autoSaveMode = this.filesConfigurationService.getAutoSaveMode();
		if (workingCopy.capabilities & WorkingCopyCapabilities.Untitled) {
			autoSaveMode = AutoSaveMode.OFF; // auto-save is never on for untitled working copies
		}

		return WorkingCopyBackupTracker.BACKUP_SCHEDULE_DELAYS[autoSaveMode];
	}

	protected getContentVersion(workingCopy: IWorkingCopy): number {
		return this.mapWorkingCopyToContentVersion.get(workingCopy) || 0;
	}

	private discardBackup(workingCopy: IWorkingCopy): void {
		this.logService.trace(`[backup tracker] discarding backup`, workingCopy.resource.toString(true), workingCopy.typeId);

		// Clear any running backup operation
		this.cancelBackup(workingCopy);

		// Forward to working copy backup service
		this.workingCopyBackupService.discardBackup(workingCopy);
	}

	private cancelBackup(workingCopy: IWorkingCopy): void {
		dispose(this.pendingBackups.get(workingCopy));
		this.pendingBackups.delete(workingCopy);
	}

	protected abstract onBeforeShutdown(reason: ShutdownReason): boolean | Promise<boolean>;
}
