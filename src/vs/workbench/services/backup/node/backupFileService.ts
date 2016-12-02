/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as crypto from 'crypto';
import pfs = require('vs/base/node/pfs');
import * as platform from 'vs/base/common/platform';
import Uri from 'vs/base/common/uri';
import { IBackupFileService, BACKUP_FILE_UPDATE_OPTIONS } from 'vs/workbench/services/backup/common/backup';
import { IBackupService } from 'vs/platform/backup/common/backup';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { TPromise } from 'vs/base/common/winjs.base';
import { readToMatchingString } from 'vs/base/node/stream';
import { IRawTextContent } from 'vs/workbench/services/textfile/common/textfiles';

export interface IBackupFilesModel {
	resolve(backupRoot: string): TPromise<IBackupFilesModel>;

	add(resource: Uri, versionId?: number): void;
	has(resource: Uri, versionId?: number): boolean;
	get(): Uri[];
	remove(resource: Uri): void;
	clear(): void;
}

export class BackupFilesModel implements IBackupFilesModel {
	private cache: { [resource: string]: number /* version ID */ } = Object.create(null);

	public resolve(backupRoot: string): TPromise<IBackupFilesModel> {
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

	public add(resource: Uri, versionId = 0): void {
		this.cache[resource.toString()] = versionId;
	}

	public has(resource: Uri, versionId?: number): boolean {
		const cachedVersionId = this.cache[resource.toString()];
		if (typeof cachedVersionId !== 'number') {
			return false; // unknown resource
		}

		if (typeof versionId === 'number') {
			return versionId === cachedVersionId; // if we are asked with a specific version ID, make sure to test for it
		}

		return true;
	}

	public get(): Uri[] {
		return Object.keys(this.cache).map(k => Uri.parse(k));
	}

	public remove(resource: Uri): void {
		delete this.cache[resource.toString()];
	}

	public clear(): void {
		this.cache = Object.create(null);
	}
}

export class BackupFileService implements IBackupFileService {

	public _serviceBrand: any;

	private static readonly META_MARKER = '\n';

	private backupWorkspacePath: string;
	private ready: TPromise<IBackupFilesModel>;

	constructor(
		windowId: number,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IFileService private fileService: IFileService,
		@IBackupService private backupService: IBackupService
	) {
		this.ready = this.init(windowId);
	}

	private get backupEnabled(): boolean {
		// Hot exit is disabled when doing extension development
		return !this.environmentService.isExtensionDevelopment;
	}

	private init(windowId: number): TPromise<IBackupFilesModel> {
		const model = new BackupFilesModel();

		if (!this.backupEnabled) {
			return TPromise.as(model);
		}

		return this.backupService.getBackupPath(windowId).then(backupPath => {
			this.backupWorkspacePath = backupPath;
			return model.resolve(this.backupWorkspacePath);
		});
	}

	public hasBackup(resource: Uri): TPromise<boolean> {
		return this.ready.then(model => {
			const backupResource = this.getBackupResource(resource);
			if (!backupResource) {
				return TPromise.as(false);
			}

			return model.has(backupResource);
		});
	}

	public loadBackupResource(resource: Uri): TPromise<Uri> {
		return this.ready.then(() => {
			return this.hasBackup(resource).then(hasBackup => {
				if (hasBackup) {
					return this.getBackupResource(resource);
				}

				return void 0;
			});
		});
	}

	public backupResource(resource: Uri, content: string, versionId?: number): TPromise<void> {
		return this.ready.then(model => {
			const backupResource = this.getBackupResource(resource);
			if (!backupResource) {
				return void 0;
			}

			if (model.has(backupResource, versionId)) {
				return void 0; // return early if backup version id matches requested one
			}

			// Add metadata to top of file
			content = `${resource.toString()}${BackupFileService.META_MARKER}${content}`;

			return this.fileService.updateContent(backupResource, content, BACKUP_FILE_UPDATE_OPTIONS).then(() => model.add(backupResource, versionId));
		});
	}

	public discardResourceBackup(resource: Uri): TPromise<void> {
		return this.ready.then(model => {
			const backupResource = this.getBackupResource(resource);
			if (!backupResource) {
				return void 0;
			}

			return this.fileService.del(backupResource).then(() => model.remove(backupResource));
		});
	}

	public discardAllWorkspaceBackups(): TPromise<void> {
		return this.ready.then(model => {
			if (!this.backupEnabled) {
				return void 0;
			}

			return this.fileService.del(Uri.file(this.backupWorkspacePath)).then(() => model.clear());
		});
	}

	public getWorkspaceFileBackups(): TPromise<Uri[]> {
		return this.ready.then(model => {
			const readPromises: TPromise<Uri>[] = [];

			model.get().forEach(fileBackup => {
				readPromises.push(new TPromise<Uri>((c, e) => {
					readToMatchingString(fileBackup.fsPath, BackupFileService.META_MARKER, 2000, 10000, (error, result) => {
						if (result === null) {
							e(error);
						}

						c(Uri.parse(result));
					});
				}));
			});

			return TPromise.join(readPromises);
		});
	}

	public parseBackupContent(rawText: IRawTextContent): string {
		return rawText.value.lines.slice(1).join('\n'); // The first line of a backup text file is the file name
	}

	protected getBackupResource(resource: Uri): Uri {
		if (!this.backupEnabled) {
			return null;
		}

		return Uri.file(path.join(this.backupWorkspacePath, resource.scheme, this.hashPath(resource)));
	}

	private hashPath(resource: Uri): string {
		// Windows and Mac paths are case insensitive, we want backups to be too
		const caseAwarePath = platform.isWindows || platform.isMacintosh ? resource.fsPath.toLowerCase() : resource.fsPath;

		return crypto.createHash('md5').update(caseAwarePath).digest('hex');
	}
}