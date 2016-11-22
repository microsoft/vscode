/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as crypto from 'crypto';
import pfs = require('vs/base/node/pfs');
import Uri from 'vs/base/common/uri';
import { IBackupFileService, BACKUP_FILE_UPDATE_OPTIONS } from 'vs/workbench/services/backup/common/backup';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { TPromise } from 'vs/base/common/winjs.base';

export class BackupFileService implements IBackupFileService {

	public _serviceBrand: any;

	protected backupHome: string;
	protected workspacesJsonPath: string;

	constructor(
		private currentWorkspace: Uri,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IFileService private fileService: IFileService
	) {
		this.backupHome = environmentService.backupHome;
		this.workspacesJsonPath = environmentService.backupWorkspacesPath;
	}

	private get backupEnabled(): boolean {
		return this.currentWorkspace && !this.environmentService.isExtensionDevelopment; // Hot exit is disabled for empty workspaces and when doing extension development
	}

	public hasBackup(resource: Uri): TPromise<boolean> {
		const backupResource = this.getBackupResource(resource);
		if (!backupResource) {
			return TPromise.as(false);
		}

		return pfs.exists(backupResource.fsPath);
	}

	private getBackupHash(resource: Uri): string {
		if (!this.backupEnabled) {
			return null;
		}

		// Only hash the file path if the file is not untitled
		return resource.scheme === 'untitled' ? resource.fsPath : crypto.createHash('md5').update(resource.fsPath).digest('hex');
	}

	public getBackupResource(resource: Uri): Uri {
		const backupHash = this.getBackupHash(resource);
		if (!backupHash) {
			return null;
		}

		const backupPath = path.join(this.getWorkspaceBackupDirectory(), resource.scheme, backupHash);

		return Uri.file(backupPath);
	}

	private getWorkspaceBackupDirectory(): string {
		const workspaceHash = crypto.createHash('md5').update(this.currentWorkspace.fsPath).digest('hex');

		return path.join(this.backupHome, workspaceHash);
	}

	public backupResource(resource: Uri, content: string): TPromise<void> {
		const backupResource = this.getBackupResource(resource);
		if (!backupResource) {
			return TPromise.as(void 0);
		}

		return this.fileService.updateContent(backupResource, content, BACKUP_FILE_UPDATE_OPTIONS).then(() => void 0);
	}

	public discardResourceBackup(resource: Uri): TPromise<void> {
		const backupResource = this.getBackupResource(resource);
		if (!backupResource) {
			return TPromise.as(void 0);
		}

		return this.fileService.del(backupResource);
	}

	public discardAllWorkspaceBackups(): TPromise<void> {
		if (!this.backupEnabled) {
			return TPromise.as(void 0);
		}

		return this.fileService.del(Uri.file(this.getWorkspaceBackupDirectory()));
	}
}