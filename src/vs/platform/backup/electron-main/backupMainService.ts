/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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

	private mapWindowToBackupFolder: { [windowId: number]: string; };

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
		if (!backupFolder) {
			backupFolder = Date.now().toString();
		}

		this.mapWindowToBackupFolder[windowId] = isEmptyWorkspace ? backupFolder : this.getWorkspaceHash(workspacePath);
		this.pushBackupPathsSync(isEmptyWorkspace ? backupFolder : this.sanitizePath(workspacePath), isEmptyWorkspace);
	}

	protected pushBackupPathsSync(workspaceIdentifier: string, isEmptyWorkspace?: boolean): void {
		if (!isEmptyWorkspace) {
			workspaceIdentifier = this.sanitizePath(workspaceIdentifier);
		}
		const array = isEmptyWorkspace ? this.backups.emptyWorkspaces : this.backups.folderWorkspaces;
		if (array.indexOf(workspaceIdentifier) === -1) {
			array.push(workspaceIdentifier);
			this.saveSync();
		}
	}

	protected removeWorkspaceBackupPathSync(workspace: Uri): void {
		if (!this.backups.folderWorkspaces) {
			return;
		}
		const index = this.backups.folderWorkspaces.indexOf(workspace.fsPath);
		if (index === -1) {
			return;
		}
		this.backups.folderWorkspaces.splice(index, 1);
		this.saveSync();
	}

	// TODO: Test
	private removeEmptyWorkspaceBackupFolder(backupFolder: string): void {
		if (!this.backups.emptyWorkspaces) {
			return;
		}
		const index = this.backups.emptyWorkspaces.indexOf(backupFolder);
		if (index === -1) {
			return;
		}
		this.backups.emptyWorkspaces.splice(index, 1);
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

	private validateBackupWorkspaces(backups: IBackupWorkspacesFormat): void {
		backups.folderWorkspaces.forEach(workspacePath => {
			const backupPath = path.join(this.backupHome, this.getWorkspaceHash(workspacePath));
			if (!this.hasBackupsSync(backupPath)) {
				extfs.delSync(backupPath);
				const backupWorkspace = Uri.file(this.sanitizePath(workspacePath));
				this.removeWorkspaceBackupPathSync(backupWorkspace);
			}
		});

		backups.emptyWorkspaces.forEach(backupFolder => {
			const backupPath = path.join(this.backupHome, backupFolder);
			if (!this.hasBackupsSync(backupPath)) {
				extfs.delSync(backupPath);
				this.removeEmptyWorkspaceBackupFolder(backupFolder);
			}
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
			console.error('Could not save workspaces.json', ex);
		}
	}

	private sanitizePath(p) {
		return platform.isLinux ? p : p.toLowerCase();
	}

	private getWorkspaceHash(workspacePath: string): string {
		return crypto.createHash('md5').update(this.sanitizePath(workspacePath)).digest('hex');
	}
}
