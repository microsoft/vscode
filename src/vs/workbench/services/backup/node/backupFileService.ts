/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as crypto from 'crypto';
import pfs = require('vs/base/node/pfs');
import Uri from 'vs/base/common/uri';
import { IBackupWorkspacesFormat } from 'vs/platform/backup/common/backup';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { TPromise } from 'vs/base/common/winjs.base';

export class BackupFileService implements IBackupFileService {

	public _serviceBrand: any;

	protected backupHome: string;
	protected workspacesJsonPath: string;

	private workspacesJsonContent: IBackupWorkspacesFormat;

	constructor(
		private currentWorkspace: Uri,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService private fileService: IFileService
	) {
		this.backupHome = environmentService.backupHome;
		this.workspacesJsonPath = environmentService.backupWorkspacesPath;
	}

	public getWorkspaceBackupPaths(): TPromise<string[]> {
		return this.loadWorkspaces().then(() => {
			return this.workspacesJsonContent.folderWorkspaces;
		});
	}

	public removeWorkspaceBackupPath(workspace: Uri): TPromise<void> {
		return this.loadWorkspaces().then(() => {
			if (!this.workspacesJsonContent.folderWorkspaces) {
				return TPromise.as(void 0);
			}
			const index = this.workspacesJsonContent.folderWorkspaces.indexOf(workspace.fsPath);
			if (index === -1) {
				return TPromise.as(void 0);
			}
			this.workspacesJsonContent.folderWorkspaces.splice(index, 1);
			return this.saveWorkspaces();
		});
	}

	public doesTextFileHaveBackup(resource: Uri): TPromise<boolean> {
		const backupResource = this.getBackupResource(resource);
		if (!backupResource) {
			return TPromise.as(false);
		}
		return pfs.exists(this.getBackupResource(resource).fsPath);
	}

	public getBackupResource(resource: Uri): Uri {
		// Hot exit is disabled for empty workspaces
		if (!this.currentWorkspace) {
			return null;
		}

		// Only hash the file path if the file is not untitled
		const backupName = resource.scheme === 'untitled' ? resource.fsPath : crypto.createHash('md5').update(resource.fsPath).digest('hex');
		const backupPath = path.join(this.getWorkspaceBackupDirectory(), resource.scheme, backupName);
		return Uri.file(backupPath);
	}

	private getWorkspaceBackupDirectory(): string {
		const workspaceHash = crypto.createHash('md5').update(this.currentWorkspace.fsPath).digest('hex');
		return path.join(this.backupHome, workspaceHash);
	}

	public backupResource(resource: Uri, content: string): TPromise<void> {
		const backupResource = this.getBackupResource(resource);

		// Hot exit is disabled for empty workspaces
		if (!backupResource) {
			return TPromise.as(void 0);
		}

		return this.fileService.updateContent(backupResource, content).then(() => void 0);
	}

	public discardResourceBackup(resource: Uri): TPromise<void> {
		const backupResource = this.getBackupResource(resource);

		// Hot exit is disabled for empty workspaces
		if (!backupResource) {
			return TPromise.as(void 0);
		}

		return this.fileService.del(backupResource);
	}

	public discardAllWorkspaceBackups(): TPromise<void> {
		return this.fileService.del(Uri.file(this.getWorkspaceBackupDirectory()));
	}

	private loadWorkspaces(): TPromise<void> {
		return pfs.fileExists(this.workspacesJsonPath).then(exists => {
			if (!exists) {
				this.workspacesJsonContent = {
					folderWorkspaces: []
				};
				return TPromise.as(void 0);
			}

			return pfs.readFile(this.workspacesJsonPath, 'utf8').then(content => {
				try {
					return JSON.parse(content.toString());
				} catch (ex) {
					return [];
				}
			}).then(content => {
				this.workspacesJsonContent = content;
				if (!this.workspacesJsonContent.folderWorkspaces) {
					this.workspacesJsonContent.folderWorkspaces = [];
				}
				return TPromise.as(void 0);
			});
		});
	}

	private saveWorkspaces(): TPromise<void> {
		const data = JSON.stringify(this.workspacesJsonContent);
		return pfs.mkdirp(this.backupHome).then(() => {
			return pfs.writeFile(this.workspacesJsonPath, data);
		});
	}
}