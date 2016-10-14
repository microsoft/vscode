/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as crypto from 'crypto';
import * as fs from 'original-fs';
import * as arrays from 'vs/base/common/arrays';
import Uri from 'vs/base/common/uri';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IBackupService } from 'vs/platform/backup/common/backup';

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
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IWorkspaceContextService contextService?: IWorkspaceContextService
	) {
		// IWorkspaceContextService will not exist on the main process
		if (!contextService) {
			return;
		}

		// Hot exit is disabled for empty workspaces
		const workspace = contextService.getWorkspace();
		if (!workspace) {
			return;
		}

		this.workspaceResource = workspace.resource;
	}

	public getWorkspaceBackupPaths(): string[] {
		this.load();
		return Object.keys(this.fileContent.folderWorkspaces || Object.create(null));
	}

	public clearWorkspaceBackupPaths(): void {
		this.fileContent = {
			folderWorkspaces: Object.create(null)
		};
		this.save();
	}

	public pushWorkspaceBackupPaths(workspaces: string[]): void {
		this.load();
		workspaces.forEach(workspace => {
			// Hot exit is disabled for empty workspaces
			if (!workspace) {
				return;
			}
			if (!this.fileContent.folderWorkspaces[workspace]) {
				this.fileContent.folderWorkspaces[workspace] = [];
			}
		});
		this.save();
	}

	public removeWorkspaceBackupPath(workspace: string): void {
		this.load();
		if (!this.fileContent.folderWorkspaces) {
			return;
		}
		delete this.fileContent.folderWorkspaces[workspace];
		this.save();
	}

	public getWorkspaceTextFilesWithBackups(workspace: string): string[] {
		this.load();
		return this.fileContent.folderWorkspaces[workspace] || [];
	}

	public getWorkspaceUntitledFileBackups(workspace: string): string[] {
		// Hot exit is disabled for empty workspaces
		if (!this.workspaceResource) {
			return;
		}

		const workspaceHash = crypto.createHash('md5').update(this.workspaceResource.fsPath).digest('hex');
		const untitledDir = path.join(this.environmentService.backupHome, workspaceHash, 'untitled');
		try {
			const untitledFiles = fs.readdirSync(untitledDir).map(file => path.join(untitledDir, file));
			console.log('untitledFiles', untitledFiles);
			return untitledFiles;
		} catch (ex) {
			console.log('untitled backups do not exist');
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
		console.log('getBackupResource ' + Uri.file(backupPath));
		return Uri.file(backupPath);
	}

	public registerResourceForBackup(resource: Uri): void {
		// Hot exit is disabled for empty workspaces
		if (!this.workspaceResource) {
			return;
		}

		this.load();
		if (arrays.contains(this.fileContent.folderWorkspaces[this.workspaceResource.fsPath], resource.fsPath)) {
			return;
		}
		this.fileContent.folderWorkspaces[this.workspaceResource.fsPath].push(resource.fsPath);
		this.save();
	}

	public deregisterResourceForBackup(resource: Uri): void {
		// Hot exit is disabled for empty workspaces
		if (!this.workspaceResource) {
			return;
		}

		this.load();
		this.fileContent.folderWorkspaces[this.workspaceResource.fsPath] = this.fileContent.folderWorkspaces[this.workspaceResource.fsPath].filter(value => value !== resource.fsPath);
		this.save();
	}

	private load(): void {
		try {
			this.fileContent = JSON.parse(fs.readFileSync(this.environmentService.backupWorkspacesPath).toString()); // invalid JSON or permission issue can happen here
		} catch (error) {
			this.fileContent = Object.create(null);
		}
		if (!this.fileContent.folderWorkspaces) {
			this.fileContent.folderWorkspaces = Object.create(null);
		}
	}

	private save(): void {
		try {
			fs.writeFileSync(this.environmentService.backupWorkspacesPath, JSON.stringify(this.fileContent));
		} catch (error) {
		}
	}
}