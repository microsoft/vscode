/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as crypto from 'crypto';
import fs = require('fs');
import Uri from 'vs/base/common/uri';
import { readdirSync } from 'vs/base/node/extfs';
import { IBackupWorkspacesFormat } from 'vs/platform/backup/common/backup';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IBackupMainService = createDecorator<IBackupMainService>('backupService');

export interface IBackupMainService {
	_serviceBrand: any;

	/**
	 * Gets the set of active workspace backup paths being tracked for restoration.
	 *
	 * @return The set of active workspace backup paths being tracked for restoration.
	 */
	getWorkspaceBackupPathsSync(): string[];

	/**
	 * Pushes workspace backup paths to be tracked for restoration.
	 *
	 * @param workspaces The workspaces to add.
	 */
	pushWorkspaceBackupPathsSync(workspaces: Uri[]): void;

	/**
	 * Removes a workspace backup path being tracked for restoration.
	 *
	 * @param workspace The workspace to remove.
	 */
	removeWorkspaceBackupPathSync(workspace: Uri): void;

	/**
	 * Gets the set of untitled file backups for a particular workspace.
	 *
	 * @param workspace The workspace to get the backups for.
	 * @return The absolute paths for all the untitled file _backups_.
	 */
	getWorkspaceUntitledFileBackupsSync(workspace: Uri): string[];

	/**
	 * Gets whether the workspace has backups associated with it (ie. if the workspace backup
	 * directory exists).
	 *
	 * @param workspace The workspace to evaluate.
	 * @return Whether the workspace has backups.
	 */
	doesWorkspaceHaveBackups(workspace: Uri): boolean;
}

export class BackupService implements IBackupMainService {

	public _serviceBrand: any;

	protected backupHome: string;
	protected workspacesJsonPath: string;

	private workspacesJsonContent: IBackupWorkspacesFormat;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		this.backupHome = environmentService.backupHome;
		this.workspacesJsonPath = environmentService.backupWorkspacesPath;
	}

	public getWorkspaceBackupPathsSync(): string[] {
		this.loadSync();
		return this.workspacesJsonContent.folderWorkspaces;
	}

	public pushWorkspaceBackupPathsSync(workspaces: Uri[]): void {
		this.loadSync();
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
		this.loadSync();
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

	public getWorkspaceUntitledFileBackupsSync(workspace: Uri): string[] {
		const untitledDir = path.join(this.getWorkspaceBackupDirectory(workspace), 'untitled');

		// Allow sync here as it's only used in workbench initialization's critical path
		try {
			return readdirSync(untitledDir).map(file => path.join(untitledDir, file));
		} catch (ex) {
			return [];
		}
	}

	public doesWorkspaceHaveBackups(workspace: Uri): boolean {
		return fs.existsSync(this.getWorkspaceBackupDirectory(workspace));
	}

	private getWorkspaceBackupDirectory(workspace: Uri): string {
		const workspaceHash = crypto.createHash('md5').update(workspace.fsPath).digest('hex');
		return path.join(this.backupHome, workspaceHash);
	}

	private loadSync(): void {
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
		}
	}
}