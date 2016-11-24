/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import Uri from 'vs/base/common/uri';
import { IBackupWorkspacesFormat, IBackupMainService } from 'vs/platform/backup/common/backup';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ILifecycleMainService } from 'vs/platform/lifecycle/common/mainLifecycle';
import { VSCodeWindow } from 'vs/code/electron-main/window';

export class BackupMainService implements IBackupMainService {

	public _serviceBrand: any;

	protected backupHome: string;
	protected workspacesJsonPath: string;

	private workspacesJsonContent: IBackupWorkspacesFormat;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@ILifecycleMainService lifecycleService: ILifecycleMainService
	) {
		this.backupHome = environmentService.backupHome;
		this.workspacesJsonPath = environmentService.backupWorkspacesPath;

		lifecycleService.onBeforeUnload(this.onBeforeUnloadWindow.bind(this));

		this.loadSync();
	}

	private onBeforeUnloadWindow(vscodeWindow: VSCodeWindow) {
		if (vscodeWindow.openedWorkspacePath) {
			// Clear out workspace from workspaces.json if it doesn't have any backups
			const workspaceResource = Uri.file(vscodeWindow.openedWorkspacePath);
			if (!this.hasWorkspaceBackup(workspaceResource)) {
				this.removeWorkspaceBackupPathSync(workspaceResource);
			}
		}
	}

	public getWorkspaceBackupPaths(): string[] {
		return this.workspacesJsonContent.folderWorkspaces;
	}

	public pushWorkspaceBackupPathsSync(workspaces: Uri[]): void {
		workspaces.forEach(workspace => {
			// Hot exit is disabled for empty workspaces
			if (!workspace) {
				return;
			}

			if (this.workspacesJsonContent.folderWorkspaces.indexOf(workspace.fsPath) === -1) {
				this.workspacesJsonContent.folderWorkspaces.push(workspace.fsPath);
			}
		});
		this.saveSync();
	}

	public removeWorkspaceBackupPathSync(workspace: Uri): void {
		if (!this.workspacesJsonContent.folderWorkspaces) {
			return;
		}
		const index = this.workspacesJsonContent.folderWorkspaces.indexOf(workspace.fsPath);
		if (index === -1) {
			return;
		}
		this.workspacesJsonContent.folderWorkspaces.splice(index, 1);
		this.saveSync();
	}

	public hasWorkspaceBackup(workspace: Uri): boolean {
		return fs.existsSync(this.getWorkspaceBackupDirectory(workspace));
	}

	private getWorkspaceBackupDirectory(workspace: Uri): string {
		const workspaceHash = crypto.createHash('md5').update(workspace.fsPath).digest('hex');
		return path.join(this.backupHome, workspaceHash);
	}

	protected loadSync(): void {
		try {
			this.workspacesJsonContent = JSON.parse(fs.readFileSync(this.workspacesJsonPath, 'utf8').toString()); // invalid JSON or permission issue can happen here
		} catch (error) {
			this.workspacesJsonContent = Object.create(null);
		}

		// Ensure folderWorkspaces is a string[]
		if (this.workspacesJsonContent.folderWorkspaces) {
			const fws = this.workspacesJsonContent.folderWorkspaces;
			if (!Array.isArray(fws) || fws.some(f => typeof f !== 'string')) {
				this.workspacesJsonContent = Object.create(null);
			}
		}

		if (!this.workspacesJsonContent.folderWorkspaces) {
			this.workspacesJsonContent.folderWorkspaces = [];
		}
	}

	private saveSync(): void {
		try {
			// The user data directory must exist so only the Backup directory needs to be checked.
			if (!fs.existsSync(this.backupHome)) {
				fs.mkdirSync(this.backupHome);
			}
			fs.writeFileSync(this.workspacesJsonPath, JSON.stringify(this.workspacesJsonContent));
		} catch (ex) {
			console.error('Could not save workspaces.json', ex);
		}
	}
}
