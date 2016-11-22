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

export interface IBackupsFileModel {
	resolve(backupRoot: string): TPromise<IBackupsFileModel>;

	add(resource: Uri, versionId?: number): void;
	has(resource: Uri, versionId?: number): boolean;
	remove(resource: Uri): void;
	clear(): void;
}

// TODO@daniel this should resolve the backups with their file names once we have the metadata in place
export class BackupsFileModel implements IBackupsFileModel {
	private cache: { [resource: string]: number /* version ID */ } = Object.create(null);

	resolve(backupRoot: string): TPromise<IBackupsFileModel> {
		return pfs.readDirsInDir(backupRoot).then(backupSchemas => {

			// For all supported schemas
			return TPromise.join(backupSchemas.map(backupSchema => {

				// Read backup directory for backups
				const backupSchemaPath = path.join(backupRoot, backupSchema);
				return pfs.readdir(backupSchemaPath).then(backupHashes => {

					// Remember known backups in our caches
					backupHashes.forEach(backupHash => {
						const backupResource = Uri.file(path.join(backupSchemaPath, backupHash));
						this.add(backupResource);
					});
				});
			}));
		}).then(() => this, error => this);
	}

	add(resource: Uri, versionId = 0): void {
		this.cache[resource.toString()] = versionId;
	}

	has(resource: Uri, versionId?: number): boolean {
		const cachedVersionId = this.cache[resource.toString()];
		if (typeof cachedVersionId !== 'number') {
			return false; // unknown resource
		}

		if (typeof versionId === 'number') {
			return versionId === cachedVersionId; // if we are asked with a specific version ID, make sure to test for it
		}

		return true;
	}

	remove(resource: Uri): void {
		delete this.cache[resource.toString()];
	}

	clear(): void {
		this.cache = Object.create(null);
	}
}

export class BackupFileService implements IBackupFileService {

	public _serviceBrand: any;

	protected backupHome: string;
	protected workspacesJsonPath: string;

	private backupWorkspacePath: string;
	private ready: TPromise<IBackupsFileModel>;

	constructor(
		private currentWorkspace: Uri,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IFileService private fileService: IFileService
	) {
		this.backupHome = environmentService.backupHome;
		this.workspacesJsonPath = environmentService.backupWorkspacesPath;

		if (this.currentWorkspace) {
			const workspaceHash = crypto.createHash('md5').update(this.currentWorkspace.fsPath).digest('hex');
			this.backupWorkspacePath = path.join(this.backupHome, workspaceHash);
		}

		this.ready = this.init();
	}

	private get backupEnabled(): boolean {
		return this.currentWorkspace && !this.environmentService.isExtensionDevelopment; // Hot exit is disabled for empty workspaces and when doing extension development
	}

	private init(): TPromise<IBackupsFileModel> {
		const model = new BackupsFileModel();

		if (!this.backupEnabled) {
			return TPromise.as(model);
		}

		return model.resolve(this.backupWorkspacePath);
	}

	public hasBackup(resource: Uri): TPromise<boolean> {
		const backupResource = this.getBackupResource(resource);
		if (!backupResource) {
			return TPromise.as(false);
		}

		return this.ready.then(model => model.has(backupResource));
	}

	public loadBackupResource(resource: Uri): TPromise<Uri> {
		return this.hasBackup(resource).then(hasBackup => {
			if (hasBackup) {
				return this.getBackupResource(resource);
			}

			return void 0;
		});
	}

	public backupResource(resource: Uri, content: string, versionId?: number): TPromise<void> {
		const backupResource = this.getBackupResource(resource);
		if (!backupResource) {
			return TPromise.as(void 0);
		}

		return this.ready.then(model => {
			if (model.has(backupResource, versionId)) {
				return TPromise.as(void 0); // return early if backup version id matches requested one
			}

			return this.fileService.updateContent(backupResource, content, BACKUP_FILE_UPDATE_OPTIONS).then(() => {
				model.add(backupResource, versionId);

				return void 0;
			});
		});
	}

	public discardResourceBackup(resource: Uri): TPromise<void> {
		const backupResource = this.getBackupResource(resource);
		if (!backupResource) {
			return TPromise.as(void 0);
		}

		return this.ready.then(model => {
			model.remove(backupResource);

			return this.fileService.del(backupResource);
		});
	}

	public discardAllWorkspaceBackups(): TPromise<void> {
		if (!this.backupEnabled) {
			return TPromise.as(void 0);
		}

		return this.ready.then(model => {
			model.clear();

			return this.fileService.del(Uri.file(this.backupWorkspacePath));
		});
	}

	public getBackupResource(resource: Uri): Uri {
		if (!this.backupEnabled) {
			return null;
		}

		// Only hash the file path if the file is not untitled
		const backupName = resource.scheme === 'untitled' ? resource.fsPath : crypto.createHash('md5').update(resource.fsPath).digest('hex');
		const backupPath = path.join(this.backupWorkspacePath, resource.scheme, backupName);

		return Uri.file(backupPath);
	}
}