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
import Uri from 'vs/base/common/uri';
import { IBackupWorkspacesFormat, IBackupMainService } from 'vs/platform/backup/common/backup';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { TPromise } from 'vs/base/common/winjs.base';

export class BackupMainService implements IBackupMainService {

	public _serviceBrand: any;

	protected backupHome: string;
	protected workspacesJsonPath: string;

	private backups: IBackupWorkspacesFormat;

	protected mapWindowToBackupFolder: { [windowId: number]: string; };

	constructor(
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		this.backupHome = environmentService.backupHome;
		this.workspacesJsonPath = environmentService.backupWorkspacesPath;
		this.mapWindowToBackupFolder = Object.create(null);

		this.loadSync();
	}

	public get workspaceBackupPaths(): string[] {
		return this.backups.folderWorkspaces;
	}

	public get emptyWorkspaceBackupPaths(): string[] {
		return this.backups.emptyWorkspaces;
	}

	public getBackupPath(windowId: number): TPromise<string> {
		if (!this.mapWindowToBackupFolder[windowId]) {
			throw new Error(`Unknown backup workspace for window ${windowId}`);
		}

		return TPromise.as(path.join(this.backupHome, this.mapWindowToBackupFolder[windowId]));
	}

	public registerWindowForBackups(windowId: number, isEmptyWorkspace: boolean, backupFolder?: string, workspacePath?: string): void {
		// Generate a new folder if this is a new empty workspace
		if (isEmptyWorkspace && !backupFolder) {
			backupFolder = this.getRandomEmptyWorkspaceId();
		}

		this.mapWindowToBackupFolder[windowId] = isEmptyWorkspace ? backupFolder : this.getWorkspaceHash(workspacePath);
		this.pushBackupPathsSync(isEmptyWorkspace ? backupFolder : workspacePath, isEmptyWorkspace);
	}

	private getRandomEmptyWorkspaceId(): string {
		return (Date.now() + Math.round(Math.random() * 1000)).toString();
	}

	protected pushBackupPathsSync(workspaceIdentifier: string, isEmptyWorkspace: boolean): string {
		if (!isEmptyWorkspace) {
			workspaceIdentifier = this.sanitizePath(workspaceIdentifier);
		}
		const array = isEmptyWorkspace ? this.backups.emptyWorkspaces : this.backups.folderWorkspaces;
		if (array.indexOf(workspaceIdentifier) === -1) {
			array.push(workspaceIdentifier);
			this.saveSync();
		}

		return workspaceIdentifier;
	}

	protected removeBackupPathSync(workspaceIdentifier: string, isEmptyWorkspace: boolean): void {
		const array = isEmptyWorkspace ? this.backups.emptyWorkspaces : this.backups.folderWorkspaces;
		if (!array) {
			return;
		}
		const index = array.indexOf(workspaceIdentifier);
		if (index === -1) {
			return;
		}
		array.splice(index, 1);
		this.saveSync();
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

		this.backups = backups;

		// Validate backup workspaces
		this.validateBackupWorkspaces(backups);
	}

	protected sanitizeFolderWorkspaces(backups: IBackupWorkspacesFormat): void {
		// Merge duplicates for folder workspaces, don't worry about cleaning them up as they will
		// be removed when there are no backups.
		backups.folderWorkspaces = arrays.distinct(backups.folderWorkspaces.map(w => this.sanitizePath(w)));
	}

	private validateBackupWorkspaces(backups: IBackupWorkspacesFormat): void {
		const staleBackupWorkspaces: { workspaceIdentifier: string; backupPath: string; isEmptyWorkspace: boolean }[] = [];

		this.sanitizeFolderWorkspaces(backups);

		backups.folderWorkspaces.forEach(workspacePath => {
			const backupPath = path.join(this.backupHome, this.getWorkspaceHash(workspacePath));
			const hasBackups = this.hasBackupsSync(backupPath);
			const missingWorkspace = hasBackups && !fs.existsSync(workspacePath);

			// If the folder has no backups, make sure to delete it
			// If the folder has backups, but the target workspace is missing, convert backups to empty ones
			if (!hasBackups || missingWorkspace) {
				const backupWorkspace = this.sanitizePath(workspacePath);
				staleBackupWorkspaces.push({ workspaceIdentifier: Uri.file(backupWorkspace).fsPath, backupPath, isEmptyWorkspace: false });

				if (missingWorkspace) {
					const identifier = this.pushBackupPathsSync(this.getRandomEmptyWorkspaceId(), true /* is empty workspace */);
					const newEmptyWorkspaceBackupPath = path.join(path.dirname(backupPath), identifier);
					try {
						fs.renameSync(backupPath, newEmptyWorkspaceBackupPath);
					} catch (ex) {
						console.error(`Backup: Could not rename backup folder for missing workspace: ${ex.toString()}`);

						this.removeBackupPathSync(identifier, true);
					}
				}
			}
		});

		backups.emptyWorkspaces.forEach(backupFolder => {
			const backupPath = path.join(this.backupHome, backupFolder);
			if (!this.hasBackupsSync(backupPath)) {
				staleBackupWorkspaces.push({ workspaceIdentifier: backupFolder, backupPath, isEmptyWorkspace: true });
			}
		});

		staleBackupWorkspaces.forEach(staleBackupWorkspace => {
			const {backupPath, workspaceIdentifier, isEmptyWorkspace} = staleBackupWorkspace;

			try {
				extfs.delSync(backupPath);
			} catch (ex) {
				console.error(`Backup: Could not delete stale backup: ${ex.toString()}`);
			}

			this.removeBackupPathSync(workspaceIdentifier, isEmptyWorkspace);
		});
	}

	private hasBackupsSync(backupPath): boolean {
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
			console.error(`Backup: Could not save workspaces.json: ${ex.toString()}`);
		}
	}

	private sanitizePath(p) {
		return platform.isLinux ? p : p.toLowerCase();
	}

	protected getWorkspaceHash(workspacePath: string): string {
		return crypto.createHash('md5').update(this.sanitizePath(workspacePath)).digest('hex');
	}
}
