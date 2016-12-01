/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as extfs from 'vs/base/node/extfs';
import Uri from 'vs/base/common/uri';
import { IBackupWorkspacesFormat, IBackupMainService } from 'vs/platform/backup/common/backup';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

export class BackupMainService implements IBackupMainService {

	public _serviceBrand: any;

	protected backupHome: string;
	protected workspacesJsonPath: string;

	private backups: IBackupWorkspacesFormat;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		this.backupHome = environmentService.backupHome;
		this.workspacesJsonPath = environmentService.backupWorkspacesPath;

		this.loadSync();
	}

	public getWorkspaceBackupPaths(): string[] {
		return this.backups.folderWorkspaces;
	}

	public getEmptyWorkspaceBackupWindowIds(): string[] {
		return this.backups.emptyWorkspaces;
	}

	public pushWorkspaceBackupPathsSync(workspaces: Uri[]): void {
		let needsSaving = false;
		workspaces.forEach(workspace => {
			if (this.backups.folderWorkspaces.indexOf(workspace.fsPath) === -1) {
				this.backups.folderWorkspaces.push(workspace.fsPath);
				needsSaving = true;
			}
		});

		if (needsSaving) {
			this.saveSync();
		}
	}

	// TODO: Think of a less terrible name
	// TODO: Test
	// TODO: Merge with pushWorkspaceBackupPathsSync?
	public pushEmptyWorkspaceBackupWindowIdSync(vscodeWindowId: string): void {
		if (this.backups.emptyWorkspaces.indexOf(vscodeWindowId) === -1) {
			this.backups.emptyWorkspaces.push(vscodeWindowId);
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
	// TODO: Merge with removeWorkspaceBackupPathSync?
	private removeEmptyWorkspaceBackupWindowIdSync(vscodeWindowId: string): void {
		if (!this.backups.emptyWorkspaces) {
			return;
		}
		const index = this.backups.emptyWorkspaces.indexOf(vscodeWindowId);
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
		// TODO: Tidy up, improve names, reduce duplication
		const staleBackupWorkspaces: { workspaceIdentifier: string; backupPath: string; }[] = [];

		backups.folderWorkspaces.forEach(workspacePath => {
			const backupPath = this.toBackupPath(workspacePath);
			if (!this.hasBackupsSync(backupPath)) {
				staleBackupWorkspaces.push({ workspaceIdentifier: workspacePath, backupPath });
			}
		});
		console.log('checking empty: ' + backups.emptyWorkspaces);
		backups.emptyWorkspaces.forEach(vscodeWindowId => {
			const backupPath = this.toEmptyWorkspaceBackupPath(vscodeWindowId);
			console.log('backupPath: ' + backupPath);
			if (!this.hasBackupsSync(backupPath)) {
				staleBackupWorkspaces.push({ workspaceIdentifier: vscodeWindowId, backupPath });
			}
		});

		staleBackupWorkspaces.forEach(staleBackupWorkspace => {
			const {backupPath, workspaceIdentifier} = staleBackupWorkspace;
			extfs.delSync(backupPath);
			this.removeWorkspaceBackupPathSync(Uri.file(workspaceIdentifier));
			this.removeEmptyWorkspaceBackupWindowIdSync(workspaceIdentifier);
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

	protected toBackupPath(workspacePath: string): string {
		const workspaceHash = crypto.createHash('md5').update(workspacePath).digest('hex');

		return path.join(this.backupHome, workspaceHash);
	}

	protected toEmptyWorkspaceBackupPath(vscodeWindowId: string): string {
		return path.join(this.backupHome, vscodeWindowId);
	}
}
