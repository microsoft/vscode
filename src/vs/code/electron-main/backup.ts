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
import { IBackupFormat } from 'vs/platform/backup/common/backup';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IBackupService = createDecorator<IBackupService>('backupService');

export interface IBackupService {
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
	 * Gets the set of text files that are backed up for a particular workspace.
	 *
	 * @param workspace The workspace to get the backed up files for.
	 * @return The absolute paths for text files _that have backups_.
	 */
	getWorkspaceTextFilesWithBackupsSync(workspace: Uri): string[];

	/**
	 * Gets the set of untitled file backups for a particular workspace.
	 *
	 * @param workspace The workspace to get the backups for for.
	 * @return The absolute paths for all the untitled file _backups_.
	 */
	getWorkspaceUntitledFileBackupsSync(workspace: Uri): string[];
}

export class BackupService implements IBackupService {

	public _serviceBrand: any;

	protected backupHome: string;
	protected backupWorkspacesPath: string;

	private fileContent: IBackupFormat;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		this.backupHome = environmentService.backupHome;
		this.backupWorkspacesPath = environmentService.backupWorkspacesPath;
	}

	public getWorkspaceBackupPathsSync(): string[] {
		this.loadSync();
		return Object.keys(this.fileContent.folderWorkspaces);
	}

	public pushWorkspaceBackupPathsSync(workspaces: Uri[]): void {
		this.loadSync();
		workspaces.forEach(workspace => {
			// Hot exit is disabled for empty workspaces
			if (!workspace) {
				return;
			}

			if (!this.fileContent.folderWorkspaces[workspace.fsPath]) {
				this.fileContent.folderWorkspaces[workspace.fsPath] = [];
			}
		});
		this.saveSync();
	}

	public getWorkspaceTextFilesWithBackupsSync(workspace: Uri): string[] {
		// Allow sync here as it's only used in workbench initialization's critical path
		this.loadSync();
		return this.fileContent.folderWorkspaces[workspace.fsPath] || [];
	}

	public getWorkspaceUntitledFileBackupsSync(workspace: Uri): string[] {
		const workspaceHash = crypto.createHash('md5').update(workspace.fsPath).digest('hex');
		const untitledDir = path.join(this.backupHome, workspaceHash, 'untitled');

		// Allow sync here as it's only used in workbench initialization's critical path
		try {
			return readdirSync(untitledDir).map(file => path.join(untitledDir, file));
		} catch (ex) {
			return [];
		}
	}

	private loadSync(): void {
		try {
			this.fileContent = JSON.parse(fs.readFileSync(this.backupWorkspacesPath, 'utf8').toString()); // invalid JSON or permission issue can happen here
		} catch (error) {
			this.fileContent = Object.create(null);
		}

		if (!this.fileContent.folderWorkspaces) {
			this.fileContent.folderWorkspaces = Object.create(null);
		}
	}

	private saveSync(): void {
		try {
			// The user data directory must exist so only the Backup directory needs to be checked.
			if (!fs.existsSync(this.backupHome)) {
				fs.mkdirSync(this.backupHome);
			}
			fs.writeFileSync(this.backupWorkspacesPath, JSON.stringify(this.fileContent));
		} catch (ex) {
		}
	}
}