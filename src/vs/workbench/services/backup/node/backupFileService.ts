/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as crypto from 'crypto';
import * as platform from 'vs/base/common/platform';
import pfs = require('vs/base/node/pfs');
import Uri from 'vs/base/common/uri';
import { Queue } from 'vs/base/common/async';
import { IBackupFileService, BACKUP_FILE_UPDATE_OPTIONS } from 'vs/workbench/services/backup/common/backup';
import { IBackupService } from 'vs/platform/backup/common/backup';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { TPromise } from 'vs/base/common/winjs.base';
import { readToMatchingString } from 'vs/base/node/stream';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { TextSource, IRawTextSource } from 'vs/editor/common/model/textSource';
import { DefaultEndOfLine } from 'vs/editor/common/editorCommon';

export interface IBackupFilesModel {
	resolve(backupRoot: string): TPromise<IBackupFilesModel>;

	add(resource: Uri, versionId?: number): void;
	has(resource: Uri, versionId?: number): boolean;
	get(): Uri[];
	remove(resource: Uri): void;
	count(): number;
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

	public count(): number {
		return Object.keys(this.cache).length;
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

	private isShuttingDown: boolean;
	private backupWorkspacePath: string;
	private ready: TPromise<IBackupFilesModel>;
	/**
	 * Ensure IO operations on individual files are performed in order, this could otherwise lead
	 * to unexpected behavior when backups are persisted and discarded in the wrong order.
	 */
	private ioOperationQueues: { [path: string]: Queue<void> };

	constructor(
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IFileService private fileService: IFileService,
		@IWindowService windowService: IWindowService,
		@IBackupService private backupService: IBackupService
	) {
		this.isShuttingDown = false;
		this.ready = this.init(windowService.getCurrentWindowId());
		this.ioOperationQueues = {};
	}

	private get backupEnabled(): boolean {
		return !this.environmentService.isExtensionDevelopment; // Hot exit is disabled when doing extension development
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

	public hasBackups(): TPromise<boolean> {
		return this.ready.then(model => {
			return model.count() > 0;
		});
	}

	public loadBackupResource(resource: Uri): TPromise<Uri> {
		return this.ready.then(model => {
			const backupResource = this.getBackupResource(resource);
			if (!backupResource) {
				return void 0;
			}

			// Return directly if we have a known backup with that resource
			if (model.has(backupResource)) {
				return backupResource;
			}

			// Otherwise: on Windows and Mac pre v1.11 we used to store backups in lowercase format
			// Therefor we also want to check if we have backups of this old format hanging around
			// TODO@Ben migration
			if (platform.isWindows || platform.isMacintosh) {
				const legacyBackupResource = this.getBackupResource(resource, true /* legacyMacWindowsFormat */);
				if (model.has(legacyBackupResource)) {
					return legacyBackupResource;
				}
			}

			return void 0;
		});
	}

	public backupResource(resource: Uri, content: string, versionId?: number): TPromise<void> {
		if (this.isShuttingDown) {
			return TPromise.as(void 0);
		}

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

			return this.getResourceIOQueue(backupResource).queue(() => {
				return this.fileService.updateContent(backupResource, content, BACKUP_FILE_UPDATE_OPTIONS).then(() => model.add(backupResource, versionId));
			});
		});
	}

	public discardResourceBackup(resource: Uri): TPromise<void> {
		return this.ready.then(model => {
			const backupResource = this.getBackupResource(resource);
			if (!backupResource) {
				return void 0;
			}

			return this.getResourceIOQueue(backupResource).queue(() => {
				return pfs.del(backupResource.fsPath).then(() => model.remove(backupResource));
			}).then(() => {

				// On Windows and Mac pre v1.11 we used to store backups in lowercase format
				// Therefor we also want to check if we have backups of this old format laying around
				// TODO@Ben migration
				if (platform.isWindows || platform.isMacintosh) {
					const legacyBackupResource = this.getBackupResource(resource, true /* legacyMacWindowsFormat */);
					if (model.has(legacyBackupResource)) {
						return this.getResourceIOQueue(legacyBackupResource).queue(() => {
							return pfs.del(legacyBackupResource.fsPath).then(() => model.remove(legacyBackupResource));
						});
					}
				}

				return TPromise.as(void 0);
			});
		});
	}

	private getResourceIOQueue(resource: Uri) {
		const key = resource.toString();
		if (!this.ioOperationQueues[key]) {
			const queue = new Queue<void>();
			queue.onFinished(() => {
				queue.dispose();
				delete this.ioOperationQueues[key];
			});
			this.ioOperationQueues[key] = queue;
		}
		return this.ioOperationQueues[key];
	}

	public discardAllWorkspaceBackups(): TPromise<void> {
		this.isShuttingDown = true;

		return this.ready.then(model => {
			if (!this.backupEnabled) {
				return void 0;
			}

			return pfs.del(this.backupWorkspacePath).then(() => model.clear());
		});
	}

	public getWorkspaceFileBackups(): TPromise<Uri[]> {
		return this.ready.then(model => {
			const readPromises: TPromise<Uri>[] = [];

			model.get().forEach(fileBackup => {
				readPromises.push(
					readToMatchingString(fileBackup.fsPath, BackupFileService.META_MARKER, 2000, 10000)
						.then(Uri.parse)
				);
			});

			return TPromise.join(readPromises);
		});
	}

	public parseBackupContent(rawTextSource: IRawTextSource): string {
		const textSource = TextSource.fromRawTextSource(rawTextSource, DefaultEndOfLine.LF);
		return textSource.lines.slice(1).join(textSource.EOL); // The first line of a backup text file is the file name
	}

	protected getBackupResource(resource: Uri, legacyMacWindowsFormat?: boolean): Uri {
		if (!this.backupEnabled) {
			return null;
		}

		return Uri.file(path.join(this.backupWorkspacePath, resource.scheme, this.hashPath(resource, legacyMacWindowsFormat)));
	}

	private hashPath(resource: Uri, legacyMacWindowsFormat?: boolean): string {
		const caseAwarePath = legacyMacWindowsFormat ? resource.fsPath.toLowerCase() : resource.fsPath;

		return crypto.createHash('md5').update(caseAwarePath).digest('hex');
	}
}
