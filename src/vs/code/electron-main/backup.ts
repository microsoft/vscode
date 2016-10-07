/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as fs from 'original-fs';
import * as path from 'path';
import {createDecorator} from 'vs/platform/instantiation/common/instantiation';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

export const IBackupService = createDecorator<IBackupService>('backupService');

export interface IBackupService {
	getBackupWorkspaces(): string[];
	clearBackupWorkspaces(): void;
	pushBackupWorkspaces(workspaces: string[]): void;
	getBackupFiles(workspace: string): string[];
}

interface IBackupFormat {
	folderWorkspaces?: {
		[workspacePath: string]: string[]
	};
}

export class BackupService implements IBackupService {

	private filePath: string;
	private fileContent: IBackupFormat;

	constructor(
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		this.filePath = path.join(environmentService.userDataPath, 'Backups', 'workspaces.json');
	}

	public getBackupWorkspaces(): string[] {
		if (!this.fileContent) {
			this.load();
		}
		return Object.keys(this.fileContent.folderWorkspaces || {});
	}

	public clearBackupWorkspaces(): void {
		this.fileContent = {
			folderWorkspaces: {}
		};
		this.save();
	}

	public pushBackupWorkspaces(workspaces: string[]): void {
		this.load();
		if (!this.fileContent.folderWorkspaces) {
			this.fileContent.folderWorkspaces = {};
		}
		workspaces.forEach(workspace => {
			this.fileContent.folderWorkspaces[workspace] = this.fileContent.folderWorkspaces[workspace] || [];
		});
		this.save();
	}

	public getBackupFiles(workspace: string): string[] {
		this.load();
		return this.fileContent.folderWorkspaces[workspace];
	}

	private load(): void {
		try {
			this.fileContent = JSON.parse(fs.readFileSync(this.filePath).toString()); // invalid JSON or permission issue can happen here
		} catch (error) {
			this.fileContent = {};
		}
	}

	private save(): void {
		try {
			fs.writeFileSync(this.filePath, JSON.stringify(this.fileContent));
		} catch (error) {
		}
	}
}