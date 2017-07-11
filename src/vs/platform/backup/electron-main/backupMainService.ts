/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from 'vs/base/common/arrays';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as platform from 'vs/base/common/platform';
import * as extfs from 'vs/base/node/extfs';
import { IBackupWorkspacesFormat, IBackupMainService } from 'vs/platform/backup/common/backup';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFilesConfiguration, HotExitConfiguration } from 'vs/platform/files/common/files';
import { ILogService } from "vs/platform/log/common/log";

export class BackupMainService implements IBackupMainService {

	public _serviceBrand: any;

	protected backupHome: string;
	protected workspacesJsonPath: string;

	private backups: IBackupWorkspacesFormat;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ILogService private logService: ILogService
	) {
		this.backupHome = environmentService.backupHome;
		this.workspacesJsonPath = environmentService.backupWorkspacesPath;

		this.loadSync();
	}

	public getWorkspaceBackupPaths(): string[] {
		const config = this.configurationService.getConfiguration<IFilesConfiguration>();
		if (config && config.files && config.files.hotExit === HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE) {
			// Only non-folder windows are restored on main process launch when
			// hot exit is configured as onExitAndWindowClose.
			return [];
		}
		return this.backups.folderWorkspaces.slice(0); // return a copy
	}

	public getEmptyWindowBackupPaths(): string[] {
		return this.backups.emptyWorkspaces.slice(0); // return a copy
	}

	public registerWindowForBackupsSync(windowId: number, isEmptyWindow: boolean, backupFolder?: string, workspacePath?: string): string {

		// Generate a new folder if this is a new empty workspace
		if (isEmptyWindow && !backupFolder) {
			backupFolder = this.getRandomEmptyWindowId();
		}

		this.pushBackupPathsSync(isEmptyWindow ? backupFolder : workspacePath, isEmptyWindow);

		return path.join(this.backupHome, isEmptyWindow ? backupFolder : this.getWorkspaceHash(workspacePath));
	}

	private pushBackupPathsSync(workspaceIdentifier: string, isEmptyWindow: boolean): string {
		const array = isEmptyWindow ? this.backups.emptyWorkspaces : this.backups.folderWorkspaces;
		if (this.indexOf(workspaceIdentifier, isEmptyWindow) === -1) {
			array.push(workspaceIdentifier);
			this.saveSync();
		}

		return workspaceIdentifier;
	}

	protected removeBackupPathSync(workspaceIdentifier: string, isEmptyWindow: boolean): void {
		const array = isEmptyWindow ? this.backups.emptyWorkspaces : this.backups.folderWorkspaces;
		if (!array) {
			return;
		}
		const index = this.indexOf(workspaceIdentifier, isEmptyWindow);
		if (index === -1) {
			return;
		}
		array.splice(index, 1);
		this.saveSync();
	}

	private indexOf(workspaceIdentifier: string, isEmptyWindow: boolean): number {
		const array = isEmptyWindow ? this.backups.emptyWorkspaces : this.backups.folderWorkspaces;
		if (!array) {
			return -1;
		}

		if (isEmptyWindow) {
			return array.indexOf(workspaceIdentifier);
		}

		// for backup workspaces, sanitize the workspace identifier to accomodate for case insensitive file systems
		const sanitizedWorkspaceIdentifier = this.sanitizePath(workspaceIdentifier);
		return arrays.firstIndex(array, id => this.sanitizePath(id) === sanitizedWorkspaceIdentifier);
	}

	protected loadSync(): void {
		let backups: IBackupWorkspacesFormat;
		try {
			backups = JSON.parse(fs.readFileSync(this.workspacesJsonPath, 'utf8').toString()); // invalid JSON or permission issue can happen here
		} catch (error) {
			backups = Object.create(null);
		}

		// Ensure folderWorkspaces is a string[]
		if (backups.folderWorkspaces) {
			const fws = backups.folderWorkspaces;
			if (!Array.isArray(fws) || fws.some(f => typeof f !== 'string')) {
				backups.folderWorkspaces = [];
			}
		} else {
			backups.folderWorkspaces = [];
		}

		// Ensure emptyWorkspaces is a string[]
		if (backups.emptyWorkspaces) {
			const fws = backups.emptyWorkspaces;
			if (!Array.isArray(fws) || fws.some(f => typeof f !== 'string')) {
				backups.emptyWorkspaces = [];
			}
		} else {
			backups.emptyWorkspaces = [];
		}

		this.backups = this.dedupeFolderWorkspaces(backups);

		// Validate backup workspaces
		this.validateBackupWorkspaces(backups);
	}

	protected dedupeFolderWorkspaces(backups: IBackupWorkspacesFormat): IBackupWorkspacesFormat {
		// De-duplicate folder workspaces, don't worry about cleaning them up any duplicates as
		// they will be removed when there are no backups.
		backups.folderWorkspaces = arrays.distinct(backups.folderWorkspaces, ws => this.sanitizePath(ws));

		return backups;
	}

	private validateBackupWorkspaces(backups: IBackupWorkspacesFormat): void {
		const staleBackupWorkspaces: { workspaceIdentifier: string; backupPath: string; isEmptyWindow: boolean }[] = [];

		// Validate Folder Workspaces
		backups.folderWorkspaces.forEach(workspacePath => {
			const backupPath = path.join(this.backupHome, this.getWorkspaceHash(workspacePath));
			const hasBackups = this.hasBackupsSync(backupPath);
			const missingWorkspace = hasBackups && !fs.existsSync(workspacePath);

			// If the folder has no backups, make sure to delete it
			// If the folder has backups, but the target workspace is missing, convert backups to empty ones
			if (!hasBackups || missingWorkspace) {
				staleBackupWorkspaces.push({ workspaceIdentifier: workspacePath, backupPath, isEmptyWindow: false });

				if (missingWorkspace) {
					const identifier = this.pushBackupPathsSync(this.getRandomEmptyWindowId(), true /* is empty workspace */);
					const newEmptyWindowBackupPath = path.join(path.dirname(backupPath), identifier);
					try {
						fs.renameSync(backupPath, newEmptyWindowBackupPath);
					} catch (ex) {
						this.logService.error(`Backup: Could not rename backup folder for missing workspace: ${ex.toString()}`);

						this.removeBackupPathSync(identifier, true);
					}
				}
			}
		});

		// Validate Empty Windows
		backups.emptyWorkspaces.forEach(backupFolder => {
			const backupPath = path.join(this.backupHome, backupFolder);
			if (!this.hasBackupsSync(backupPath)) {
				staleBackupWorkspaces.push({ workspaceIdentifier: backupFolder, backupPath, isEmptyWindow: true });
			}
		});

		// Clean up stale backups
		staleBackupWorkspaces.forEach(staleBackupWorkspace => {
			const { backupPath, workspaceIdentifier, isEmptyWindow } = staleBackupWorkspace;

			try {
				extfs.delSync(backupPath);
			} catch (ex) {
				this.logService.error(`Backup: Could not delete stale backup: ${ex.toString()}`);
			}

			this.removeBackupPathSync(workspaceIdentifier, isEmptyWindow);
		});
	}

	private hasBackupsSync(backupPath: string): boolean {
		try {
			const backupSchemas = extfs.readdirSync(backupPath);
			if (backupSchemas.length === 0) {
				return false; // empty backups
			}

			return backupSchemas.some(backupSchema => {
				try {
					return extfs.readdirSync(path.join(backupPath, backupSchema)).length > 0;
				} catch (error) {
					return false; // invalid folder
				}
			});
		} catch (error) {
			return false; // backup path does not exist
		}
	}

	private saveSync(): void {
		try {
			// The user data directory must exist so only the Backup directory needs to be checked.
			if (!fs.existsSync(this.backupHome)) {
				fs.mkdirSync(this.backupHome);
			}
			fs.writeFileSync(this.workspacesJsonPath, JSON.stringify(this.backups));
		} catch (ex) {
			this.logService.error(`Backup: Could not save workspaces.json: ${ex.toString()}`);
		}
	}

	private getRandomEmptyWindowId(): string {
		return (Date.now() + Math.round(Math.random() * 1000)).toString();
	}

	private sanitizePath(p: string): string {
		return platform.isLinux ? p : p.toLowerCase();
	}

	protected getWorkspaceHash(workspacePath: string): string {
		return crypto.createHash('md5').update(this.sanitizePath(workspacePath)).digest('hex');
	}
}
