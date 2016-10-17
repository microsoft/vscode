/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as crypto from 'crypto';
import * as arrays from 'vs/base/common/arrays';
import fs = require('fs');
import Uri from 'vs/base/common/uri';
import { IBackupService } from 'vs/platform/backup/common/backup';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { TPromise } from 'vs/base/common/winjs.base';
import { nfcall } from 'vs/base/common/async';

interface IBackupFormat {
	folderWorkspaces?: {
		[workspacePath: string]: string[]
	};
}

export class BackupService implements IBackupService {

	public _serviceBrand: any;

	private workspaceResource: Uri;
	private fileContent: IBackupFormat;

	constructor(
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
	}

	public setCurrentWorkspace(resource: Uri): void {
		this.workspaceResource = resource;
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

	public pushWorkspaceBackupPaths(workspaces: string[]): void {
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
			if (!this.fileContent.folderWorkspaces[workspace]) {
				this.fileContent.folderWorkspaces[workspace] = [];
			}
		});
		this.saveSync();
	}

	public removeWorkspaceBackupPath(workspace: string): TPromise<void> {
		return this.load().then(() => {
			if (!this.fileContent.folderWorkspaces) {
				return;
			}
			delete this.fileContent.folderWorkspaces[workspace];
			return this.save();
		});
	}

	public getWorkspaceTextFilesWithBackups(workspace: string): string[] {
		// Allow sync here as it's only used in workbench initialization's critical path
		this.loadSync();
		return this.fileContent.folderWorkspaces[workspace] || [];
	}

	public getWorkspaceUntitledFileBackups(workspace: string): string[] {
		// Hot exit is disabled for empty workspaces
		if (!this.workspaceResource) {
			return;
		}

		const workspaceHash = crypto.createHash('md5').update(this.workspaceResource.fsPath).digest('hex');
		const untitledDir = path.join(this.environmentService.backupHome, workspaceHash, 'untitled');

		// Allow sync here as it's only used in workbench initialization's critical path
		try {
			return fs.readdirSync(untitledDir).map(file => path.join(untitledDir, file));
		} catch (ex) {
			return [];
		}
	}

	public getBackupResource(resource: Uri): Uri {
		// Hot exit is disabled for empty workspaces
		if (!this.workspaceResource) {
			return;
		}

		const workspaceHash = crypto.createHash('md5').update(this.workspaceResource.fsPath).digest('hex');
		const backupName = crypto.createHash('md5').update(resource.fsPath).digest('hex');
		const backupPath = path.join(this.environmentService.backupHome, workspaceHash, resource.scheme, backupName);
		return Uri.file(backupPath);
	}

	public registerResourceForBackup(resource: Uri): TPromise<void> {
		// Hot exit is disabled for empty workspaces
		if (!this.workspaceResource) {
			return TPromise.as(void 0);
		}

		return this.load().then(() => {
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
			return;
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
		return nfcall(fs.readFile, this.environmentService.backupWorkspacesPath, 'utf8').then(content => {
			return JSON.parse(content.toString());
		}).then(null, () => Object.create(null)).then(content => {
			this.fileContent = content;
			if (!this.fileContent.folderWorkspaces) {
				this.fileContent.folderWorkspaces = Object.create(null);
			}
			return void 0;
		});
	}

	private loadSync(): void {
		try {
			this.fileContent = JSON.parse(fs.readFileSync(this.environmentService.backupWorkspacesPath, 'utf8').toString()); // invalid JSON or permission issue can happen here
		} catch (error) {
			this.fileContent = Object.create(null);
		}
		if (!this.fileContent.folderWorkspaces) {
			this.fileContent.folderWorkspaces = Object.create(null);
		}
	}

	private save(): TPromise<void> {
		return nfcall(fs.writeFile, this.environmentService.backupWorkspacesPath, JSON.stringify(this.fileContent), { encoding: 'utf8' });
	}

	private saveSync(): void {
		try {
			fs.writeFileSync(this.environmentService.backupWorkspacesPath, JSON.stringify(this.fileContent), { encoding: 'utf8' });
		} catch (ex) {
		}
	}
}