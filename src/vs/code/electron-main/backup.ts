/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as fs from 'original-fs';
import * as path from 'path';
import * as arrays from 'vs/base/common/arrays';
import {createDecorator} from 'vs/platform/instantiation/common/instantiation';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

export const IBackupService = createDecorator<IBackupService>('backupService');

export interface IBackupService {
	getBackupWorkspaces(): string[];
	clearBackupWorkspaces(): void;
	pushBackupWorkspaces(workspaces: string[]): void;
}

export class BackupService implements IBackupService {

	private filePath: string;
	private fileContent: string[];

	constructor(
		@IEnvironmentService private envService: IEnvironmentService
	) {
		this.filePath = path.join(envService.userDataPath, 'Backups', 'workspaces.json');
	}

	public getBackupWorkspaces(): string[] {
		if (!this.fileContent) {
			this.load();
		}
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