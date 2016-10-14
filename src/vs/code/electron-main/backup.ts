/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as fs from 'original-fs';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

export const IBackupService = createDecorator<IBackupService>('backupService');

export interface IBackupService {
	getWorkspaceBackupPaths(): string[];
	clearWorkspaceBackupPaths(): void;
	pushWorkspaceBackupPath(workspaces: string[]): void;
	getWorkspaceBackupFiles(workspace: string): string[];
}

interface IBackupFormat {
	folderWorkspaces?: {
		[workspacePath: string]: string[]
	};
}

export class BackupService implements IBackupService {

	private fileContent: IBackupFormat;

	constructor(
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
	}

	public getWorkspaceBackupPaths(): string[] {
		if (!this.fileContent) {
			this.load();
		}
		return Object.keys(this.fileContent.folderWorkspaces || Object.create(null));
	}

	public clearWorkspaceBackupPaths(): void {
		this.fileContent = {
			folderWorkspaces: Object.create(null)
		};
		this.save();
	}

	public pushWorkspaceBackupPath(workspaces: string[]): void {
		this.load();
		workspaces.forEach(workspace => {
			if (!this.fileContent.folderWorkspaces[workspace]) {
				this.fileContent.folderWorkspaces[workspace] = [];
			}
		});
		this.save();
	}

	public getWorkspaceBackupFiles(workspace: string): string[] {
		this.load();
		return this.fileContent.folderWorkspaces[workspace];
	}

	private load(): void {
		try {
			this.fileContent = JSON.parse(fs.readFileSync(this.environmentService.backupWorkspacesPath).toString()); // invalid JSON or permission issue can happen here
		} catch (error) {
			this.fileContent = Object.create(null);
		}
		if (Array.isArray(this.fileContent) || typeof this.fileContent !== 'object') {
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