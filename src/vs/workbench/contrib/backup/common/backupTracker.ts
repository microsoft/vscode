/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { Disposable, IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { IWorkingCopyService, IWorkingCopy } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { ILogService } from 'vs/platform/log/common/log';
import { ShutdownReason, ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { CancellationTokenSource } from 'vs/base/common/cancellation';

export abstract class BackupTracker extends Disposable {

	// A map from working copy to a version ID we compute on each content
	// change. This version ID allows to e.g. ask if a backup for a specific
	// content has been made before closing.
	private readonly mapWorkingCopyToContentVersion = new Map<IWorkingCopy, number>();

	// A map of scheduled pending backups for working copies
	private readonly pendingBackups = new Map<IWorkingCopy, IDisposable>();

	constructor(
		protected readonly backupFileService: IBackupFileService,
		protected readonly workingCopyService: IWorkingCopyService,
		protected readonly logService: ILogService,
		protected readonly lifecycleService: ILifecycleService
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
		this.lifecycleService.onBeforeShutdown(event => event.veto(this.onBeforeShutdown(event.reason)));
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

	/**
	 * Allows subclasses to conditionally opt-out of doing a backup, e.g. if
	 * auto save is enabled.
	 */
	protected abstract shouldScheduleBackup(workingCopy: IWorkingCopy): boolean;

	/**
	 * Allows subclasses to control the delay before performing a backup from
	 * working copy content changes.
	 */
	protected abstract getBackupScheduleDelay(workingCopy: IWorkingCopy): number;

	private scheduleBackup(workingCopy: IWorkingCopy): void {

		// Clear any running backup operation
		this.cancelBackup(workingCopy);

		// subclass prevented backup for working copy
		if (!this.shouldScheduleBackup(workingCopy)) {
			return;
		}

		this.logService.trace(`[backup tracker] scheduling backup`, workingCopy.resource.toString());

		// Schedule new backup
		const cts = new CancellationTokenSource();
		const handle = setTimeout(async () => {
			if (cts.token.isCancellationRequested) {
				return;
			}

			// Backup if dirty
			if (workingCopy.isDirty()) {
				this.logService.trace(`[backup tracker] creating backup`, workingCopy.resource.toString());

				try {
					const backup = await workingCopy.backup(cts.token);
					if (cts.token.isCancellationRequested) {
						return;
					}

					if (workingCopy.isDirty()) {
						this.logService.trace(`[backup tracker] storing backup`, workingCopy.resource.toString());

						await this.backupFileService.backup(workingCopy.resource, backup.content, this.getContentVersion(workingCopy), backup.meta, cts.token);
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
			this.logService.trace(`[backup tracker] clearing pending backup`, workingCopy.resource.toString());

			cts.dispose(true);
			clearTimeout(handle);
		}));
	}

	protected getContentVersion(workingCopy: IWorkingCopy): number {
		return this.mapWorkingCopyToContentVersion.get(workingCopy) || 0;
	}

	private discardBackup(workingCopy: IWorkingCopy): void {
		this.logService.trace(`[backup tracker] discarding backup`, workingCopy.resource.toString());

		// Clear any running backup operation
		this.cancelBackup(workingCopy);

		// Forward to backup file service
		this.backupFileService.discardBackup(workingCopy.resource);
	}

	private cancelBackup(workingCopy: IWorkingCopy): void {
		dispose(this.pendingBackups.get(workingCopy));
		this.pendingBackups.delete(workingCopy);
	}

	protected abstract onBeforeShutdown(reason: ShutdownReason): boolean | Promise<boolean>;
}
