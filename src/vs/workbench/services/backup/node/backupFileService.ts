/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as crypto from 'crypto';
import * as arrays from 'vs/base/common/arrays';
import pfs = require('vs/base/node/pfs');
import Uri from 'vs/base/common/uri';
import { IBackupWorkspaceFormat, IBackupWorkspacesFormat } from 'vs/platform/backup/common/backup';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { TPromise } from 'vs/base/common/winjs.base';

export class BackupFileService implements IBackupFileService {

	public _serviceBrand: any;

	protected backupHome: string;
	protected workspacesJsonPath: string;

	private workspaceJsonContent: IBackupWorkspaceFormat;
	private workspacesJsonContent: IBackupWorkspacesFormat;

	constructor(
		private currentWorkspace: Uri,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService private fileService: IFileService
	) {
		this.backupHome = environmentService.backupHome;
		this.workspacesJsonPath = environmentService.backupWorkspacesPath;
	}

	private get workspaceJsonPath(): string {
		return path.join(this.getWorkspaceBackupDirectory(), 'workspace.json');
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

	public registerResourceForBackup(resource: Uri): TPromise<void> {
		// Hot exit is disabled for empty workspaces
		if (!this.currentWorkspace) {
			return TPromise.as(void 0);
		}

		return this.load().then(() => {
			if (arrays.contains(this.workspaceJsonContent.textFiles, resource.fsPath)) {
				return TPromise.as(void 0);
			}
			this.workspaceJsonContent.textFiles.push(resource.fsPath);
			return this.save();
		});
	}

	public deregisterResourceForBackup(resource: Uri): TPromise<void> {
		// Hot exit is disabled for empty workspaces
		if (!this.currentWorkspace) {
			return TPromise.as(void 0);
		}

		return this.load().then(() => {
			this.workspaceJsonContent.textFiles = this.workspaceJsonContent.textFiles.filter(value => value !== resource.fsPath);
			return this.save();
		});
	}

	public doesTextFileHaveBackup(resource: Uri): TPromise<boolean> {
		return this.load().then(() => {
			return arrays.contains(this.workspaceJsonContent.textFiles, resource.fsPath);
		});
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

	public backupAndRegisterResource(resource: Uri, content: string): TPromise<void> {
		let registerResourcePromise: TPromise<void>;
		if (resource.scheme === 'file') {
			registerResourcePromise = this.registerResourceForBackup(resource);
		} else {
			registerResourcePromise = TPromise.as(void 0);
		}
		return registerResourcePromise.then(() => {
			const backupResource = this.getBackupResource(resource);

			// Hot exit is disabled for empty workspaces
			if (!backupResource) {
				return TPromise.as(null);
			}

			return this.fileService.updateContent(backupResource, content);
		}).then(() => void 0);
	}

	public discardAndDeregisterResource(resource: Uri): TPromise<void> {
		return this.deregisterResourceForBackup(resource).then(() => {
			const backupResource = this.getBackupResource(resource);

			// Hot exit is disabled for empty workspaces
			if (!backupResource) {
				return TPromise.as(null);
			}

			return this.fileService.del(backupResource);
		});
	}

	public discardBackups(): TPromise<void> {
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

	private load(): TPromise<void> {
		return pfs.fileExists(this.workspaceJsonPath).then(exists => {
			if (!exists) {
				this.workspaceJsonContent = {
					textFiles: []
				};
				return TPromise.as(void 0);
			}

			return pfs.readFile(this.workspaceJsonPath, 'utf8').then(content => {
				try {
					return JSON.parse(content.toString());
				} catch (ex) {
					return [];
				}
			}).then(content => {
				this.workspaceJsonContent = content;
				if (!this.workspaceJsonContent.textFiles) {
					this.workspaceJsonContent.textFiles = [];
				}
				return TPromise.as(void 0);
			});
		});
	}

	private save(): TPromise<void> {
		const data = JSON.stringify(this.workspaceJsonContent);
		return pfs.mkdirp(path.dirname(this.workspaceJsonPath)).then(() => {
			return pfs.writeFile(this.workspaceJsonPath, data);
		});
	}
}