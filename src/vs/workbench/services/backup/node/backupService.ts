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
import { IBackupFormat } from 'vs/platform/backup/common/backup';
import { IBackupService } from 'vs/workbench/services/backup/common/backup';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { TPromise } from 'vs/base/common/winjs.base';

export class BackupService implements IBackupService {

	public _serviceBrand: any;

	protected backupHome: string;
	protected backupWorkspacesPath: string;

	private workspaceResource: Uri;
	private fileContent: IBackupFormat;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		this.backupHome = environmentService.backupHome;
		this.backupWorkspacesPath = environmentService.backupWorkspacesPath;
	}

	public setCurrentWorkspace(resource: Uri): void {
		this.workspaceResource = resource;
	}

	public getWorkspaceBackupPaths(): TPromise<string[]> {
		return this.load().then(() => {
			return Object.keys(this.fileContent.folderWorkspaces);
		});
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

	private save(): TPromise<void> {
		const data = JSON.stringify(this.fileContent);
		return pfs.mkdirp(this.backupHome).then(() => {
			return pfs.writeFile(this.backupWorkspacesPath, data);
		});
	}
}