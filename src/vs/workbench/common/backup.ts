/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as fs from 'original-fs';
import * as path from 'path';
import * as arrays from 'vs/base/common/arrays';
import {IBackupService} from 'vs/platform/backup/common/backup';
import {IEnvironmentService} from 'vs/platform/environment/common/environment';

export class BackupService implements IBackupService {

	public _serviceBrand: any;

	private filePath: string;
	private fileContent: string[];

	constructor(
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		this.filePath = path.join(environmentService.userDataPath, 'Backups', 'workspaces.json');
	}

	public getBackupWorkspaces(): string[] {
		this.load();
		return this.fileContent;
	}

	public clearBackupWorkspaces(): void {
		this.fileContent = [];
		this.save();
	}

	public pushBackupWorkspaces(workspaces: string[]): void {
		this.fileContent = arrays.distinct(this.fileContent.concat(workspaces).filter(workspace => {
			return workspace !== null;
		}));
		this.save();
	}

	public removeWorkspace(workspace: string): void {
		this.load();
		this.fileContent = this.fileContent.filter((ws) => {
			return ws !== workspace;
		});
		this.save();
	}

	private load(): void {
		try {
			this.fileContent = JSON.parse(fs.readFileSync(this.filePath).toString()); // invalid JSON or permission issue can happen here
		} catch (error) {
			this.fileContent = [];
		}
	}

	private save(): void {
		try {
			fs.writeFileSync(this.filePath, JSON.stringify(this.fileContent));
		} catch (error) {
		}
	}
}