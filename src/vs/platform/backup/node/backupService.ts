/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as crypto from 'crypto';
import * as arrays from 'vs/base/common/arrays';
import fs = require('fs');
import pfs = require('vs/base/node/pfs');
import Uri from 'vs/base/common/uri';
import { IBackupService } from 'vs/platform/backup/common/backup';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { TPromise } from 'vs/base/common/winjs.base';

interface IBackupFormat {
	folderWorkspaces?: {
		[workspacePath: string]: string[]
	};
}

export class BackupService implements IBackupService {

	public _serviceBrand: any;

	private workspaceResource: Uri;
	private fileContent: IBackupFormat;
	private backupHome: string;
	private backupWorkspacesPath: string;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		this.backupHome = environmentService.backupHome;
		this.backupWorkspacesPath = environmentService.backupWorkspacesPath;
	}

	public setCurrentWorkspace(resource: Uri): void {
		this.workspaceResource = resource;
	}

	/**
	 * Due to the Environment service not being initialized when it's needed on the main thread
	 * side, this is here so that tests can override the paths pulled from it.
	 */
	public setBackupPathsForTest(backupHome: string, backupWorkspacesPath: string) {
		this.backupHome = backupHome;
		this.backupWorkspacesPath = backupWorkspacesPath;
	}

	public getWorkspaceBackupPaths(): TPromise<string[]> {
		return this.load().then(() => {
			return Object.keys(this.fileContent.folderWorkspaces);
		});
	}

	public getWorkspaceBackupPathsSync(): string[] {
		this.loadSync();
		return Object.keys(this.fileContent.folderWorkspaces);
	}

	public pushWorkspaceBackupPathsSync(workspaces: Uri[]): void {
		// Only allow this on the main thread in the window initialization's critical path due to
		// the usage of synchronous IO.
		if (this.workspaceResource) {
			throw new Error('pushWorkspaceBackupPaths should only be called on the main process');
		}

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

	public removeWorkspaceBackupPath(workspace: Uri): TPromise<void> {
		return this.load().then(() => {
			if (!this.fileContent.folderWorkspaces) {
				return TPromise.as(void 0);
			}
			delete this.fileContent.folderWorkspaces[workspace.fsPath];
			return this.save();
		});
	}

	public getWorkspaceTextFilesWithBackupsSync(workspace: Uri): string[] {
		// Allow sync here as it's only used in workbench initialization's critical path
		this.loadSync();
		return this.fileContent.folderWorkspaces[workspace.fsPath] || [];
	}

	public getWorkspaceUntitledFileBackupsSync(workspace: Uri): string[] {
		// Hot exit is disabled for empty workspaces
		if (!this.workspaceResource) {
			return [];
		}

		const workspaceHash = crypto.createHash('md5').update(workspace.fsPath).digest('hex');
		const untitledDir = path.join(this.backupHome, workspaceHash, 'untitled');

		// Allow sync here as it's only used in workbench initialization's critical path
		try {
			return fs.readdirSync(untitledDir).map(file => path.join(untitledDir, file));
		} catch (ex) {
			return [];
		}
	}

	public doesTextFileHaveBackup(resource: Uri): TPromise<boolean> {
		return this.load().then(() => {
			return arrays.contains(this.fileContent.folderWorkspaces[this.workspaceResource.fsPath] || [], resource.fsPath);
		});
	}

	public getBackupResource(resource: Uri): Uri {
		// Hot exit is disabled for empty workspaces
		if (!this.workspaceResource) {
			return null;
		}

		const workspaceHash = crypto.createHash('md5').update(this.workspaceResource.fsPath).digest('hex');
		const backupName = crypto.createHash('md5').update(resource.fsPath).digest('hex');
		const backupPath = path.join(this.backupHome, workspaceHash, resource.scheme, backupName);
		return Uri.file(backupPath);
	}

	public registerResourceForBackup(resource: Uri): TPromise<void> {
		// Hot exit is disabled for empty workspaces
		if (!this.workspaceResource) {
			return TPromise.as(void 0);
		}

		return this.load().then(() => {
			if (!(this.workspaceResource.fsPath in this.fileContent.folderWorkspaces)) {
				this.fileContent.folderWorkspaces[this.workspaceResource.fsPath] = [];
			}
			if (arrays.contains(this.fileContent.folderWorkspaces[this.workspaceResource.fsPath], resource.fsPath)) {
				return TPromise.as(void 0);
			}
			this.fileContent.folderWorkspaces[this.workspaceResource.fsPath].push(resource.fsPath);
			return this.save();
		});
	}

	public deregisterResourceForBackup(resource: Uri): TPromise<void> {
		// Hot exit is disabled for empty workspaces
		if (!this.workspaceResource) {
			return TPromise.as(void 0);
		}

		return this.load().then(() => {
			const workspace = this.fileContent.folderWorkspaces[this.workspaceResource.fsPath];
			if (workspace) {
				this.fileContent.folderWorkspaces[this.workspaceResource.fsPath] = workspace.filter(value => value !== resource.fsPath);
				return this.save();
			}
			return TPromise.as(void 0);
		});
	}

	private load(): TPromise<void> {
		return pfs.fileExists(this.backupWorkspacesPath).then(exists => {
			if (!exists) {
				this.fileContent = {
					folderWorkspaces: Object.create(null)
				};
				return TPromise.as(void 0);
			}

			return pfs.readFile(this.backupWorkspacesPath, 'utf8').then(content => {
				try {
					return JSON.parse(content.toString());
				} catch (ex) {
					return Object.create(null);
				}
			}).then(content => {
				this.fileContent = content;
				if (!this.fileContent.folderWorkspaces) {
					this.fileContent.folderWorkspaces = Object.create(null);
				}
				return TPromise.as(void 0);
			});
		});
	}

	private loadSync(): void {
		if (fs.existsSync(this.backupWorkspacesPath)) {
			try {
				this.fileContent = JSON.parse(fs.readFileSync(this.backupWorkspacesPath, 'utf8').toString()); // invalid JSON or permission issue can happen here
			} catch (error) {
				this.fileContent = Object.create(null);
			}
		} else {
			this.fileContent = Object.create(null);
		}

		if (!this.fileContent.folderWorkspaces) {
			this.fileContent.folderWorkspaces = Object.create(null);
		}
	}

	private save(): TPromise<void> {
		const data = JSON.stringify(this.fileContent);
		return pfs.mkdirp(this.backupHome).then(() => {
			return pfs.writeFile(this.backupWorkspacesPath, data);
		});
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