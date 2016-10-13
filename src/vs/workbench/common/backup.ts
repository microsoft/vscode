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
	private workspacesJsonFilePath: string;
	private fileContent: IBackupFormat;

	constructor(
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		this.workspacesJsonFilePath = path.join(environmentService.userDataPath, 'Backups', 'workspaces.json');
		this.workspaceResource = contextService.getWorkspace().resource;
	}

	public getBackupWorkspaces(): string[] {
		this.load();
		return Object.keys(this.fileContent.folderWorkspaces || {});
	}

	public clearBackupWorkspaces(): void {
		this.fileContent = {
			folderWorkspaces: {}
		};
		this.save();
	}

	public removeWorkspace(workspace: string): void {
		this.load();
		if (!this.fileContent.folderWorkspaces) {
			return;
		}
		delete this.fileContent.folderWorkspaces[workspace];
		this.save();
	}

	public getBackupFiles(workspace: string): string[] {
		this.load();
		return this.fileContent.folderWorkspaces[workspace] || [];
	}

	public getBackupUntitledFiles(workspace: string): string[] {
		const workspaceHash = crypto.createHash('md5').update(this.workspaceResource.fsPath).digest('hex');
		const untitledDir = path.join(this.environmentService.userDataPath, 'Backups', workspaceHash, 'untitled');
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

		const workspaceHash = crypto.createHash('md5').update(this.workspaceResource.fsPath).digest('hex');
		const backupName = crypto.createHash('md5').update(resource.fsPath).digest('hex');
		const backupPath = path.join(this.environmentService.userDataPath, 'Backups', workspaceHash, resource.scheme, backupName);
		console.log('getBackupResource ' + Uri.file(backupPath));
		return Uri.file(backupPath);
	}

	public registerBackupFile(resource: Uri): void {
		this.load();
		if (arrays.contains(this.fileContent.folderWorkspaces[this.workspaceResource.fsPath], resource.fsPath)) {
			return;
		}
		this.fileContent.folderWorkspaces[this.workspaceResource.fsPath].push(resource.fsPath);
		this.save();
	}

	public deregisterBackupFile(resource: Uri): void {
		this.load();
		this.fileContent.folderWorkspaces[this.workspaceResource.fsPath] = this.fileContent.folderWorkspaces[this.workspaceResource.fsPath].filter(value => value !== resource.fsPath);
		this.save();
	}

	private load(): void {
		try {
			this.fileContent = JSON.parse(fs.readFileSync(this.workspacesJsonFilePath).toString()); // invalid JSON or permission issue can happen here
		} catch (error) {
			this.fileContent = {};
		}
		if (!this.fileContent.folderWorkspaces) {
			this.fileContent.folderWorkspaces = {};
		}
	}

	private save(): void {
		try {
			fs.writeFileSync(this.workspacesJsonFilePath, JSON.stringify(this.fileContent));
		} catch (error) {
		}
	}
}