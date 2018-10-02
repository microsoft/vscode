/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as crypto from 'crypto';
import * as pfs from 'vs/base/node/pfs';
import { URI as Uri } from 'vs/base/common/uri';
import { ResourceQueue } from 'vs/base/common/async';
import { IBackupFileService, BACKUP_FILE_UPDATE_OPTIONS, BACKUP_FILE_RESOLVE_OPTIONS } from 'vs/workbench/services/backup/common/backup';
import { IFileService, ITextSnapshot } from 'vs/platform/files/common/files';
import { TPromise } from 'vs/base/common/winjs.base';
import { readToMatchingString } from 'vs/base/node/stream';
import { ITextBufferFactory } from 'vs/editor/common/model';
import { createTextBufferFactoryFromStream, createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { keys } from 'vs/base/common/map';

export interface IBackupFilesModel {
	resolve(backupRoot: string): TPromise<IBackupFilesModel>;

	add(resource: Uri, versionId?: number): void;
	has(resource: Uri, versionId?: number): boolean;
	get(): Uri[];
	remove(resource: Uri): void;
	count(): number;
	clear(): void;
}

export class BackupSnapshot implements ITextSnapshot {
	private preambleHandled: boolean;

	constructor(private snapshot: ITextSnapshot, private preamble: string) { }

	read(): string {
		let value = this.snapshot.read();
		if (!this.preambleHandled) {
			this.preambleHandled = true;

			if (typeof value === 'string') {
				value = this.preamble + value;
			} else {
				value = this.preamble;
			}
		}

		return value;
	}
}

export class BackupFilesModel implements IBackupFilesModel {
	private cache: { [resource: string]: number /* version ID */ } = Object.create(null);

	resolve(backupRoot: string): TPromise<IBackupFilesModel> {
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

	count(): number {
		return Object.keys(this.cache).length;
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

	get(): Uri[] {
		return Object.keys(this.cache).map(k => Uri.parse(k));
	}

	remove(resource: Uri): void {
		delete this.cache[resource.toString()];
	}

	clear(): void {
		this.cache = Object.create(null);
	}
}

export class BackupFileService implements IBackupFileService {

	private static readonly META_MARKER = '\n';

	_serviceBrand: any;

	private backupWorkspacePath: string;

	private isShuttingDown: boolean;
	private ready: TPromise<IBackupFilesModel>;
	private ioOperationQueues: ResourceQueue; // queue IO operations to ensure write order

	constructor(
		backupWorkspacePath: string,
		@IFileService private fileService: IFileService
	) {
		this.isShuttingDown = false;
		this.ioOperationQueues = new ResourceQueue();

		this.initialize(backupWorkspacePath);
	}

	initialize(backupWorkspacePath: string): void {
		this.backupWorkspacePath = backupWorkspacePath;

		this.ready = this.init();
	}

	private init(): TPromise<IBackupFilesModel> {
		const model = new BackupFilesModel();

		return model.resolve(this.backupWorkspacePath);
	}

	hasBackups(): TPromise<boolean> {
		return this.ready.then(model => {
			return model.count() > 0;
		});
	}

	loadBackupResource(resource: Uri): TPromise<Uri> {
		return this.ready.then(model => {

			// Return directly if we have a known backup with that resource
			const backupResource = this.toBackupResource(resource);
			if (model.has(backupResource)) {
				return backupResource;
			}

			return void 0;
		});
	}

	backupResource(resource: Uri, content: ITextSnapshot, versionId?: number): TPromise<void> {
		if (this.isShuttingDown) {
			return TPromise.as(void 0);
		}

		return this.ready.then(model => {
			const backupResource = this.toBackupResource(resource);
			if (model.has(backupResource, versionId)) {
				return void 0; // return early if backup version id matches requested one
			}

			return this.ioOperationQueues.queueFor(backupResource).queue(() => {
				const preamble = `${resource.toString()}${BackupFileService.META_MARKER}`;

				// Update content with value
				return this.fileService.updateContent(backupResource, new BackupSnapshot(content, preamble), BACKUP_FILE_UPDATE_OPTIONS).then(() => model.add(backupResource, versionId));
			});
		});
	}

	discardResourceBackup(resource: Uri): TPromise<void> {
		return this.ready.then(model => {
			const backupResource = this.toBackupResource(resource);

			return this.ioOperationQueues.queueFor(backupResource).queue(() => {
				return pfs.del(backupResource.fsPath).then(() => model.remove(backupResource));
			});
		});
	}

	discardAllWorkspaceBackups(): TPromise<void> {
		this.isShuttingDown = true;

		return this.ready.then(model => {
			return pfs.del(this.backupWorkspacePath).then(() => model.clear());
		});
	}

	getWorkspaceFileBackups(): TPromise<Uri[]> {
		return this.ready.then(model => {
			const readPromises: TPromise<Uri>[] = [];

			model.get().forEach(fileBackup => {
				readPromises.push(
					readToMatchingString(fileBackup.fsPath, BackupFileService.META_MARKER, 2000, 10000).then(Uri.parse)
				);
			});

			return TPromise.join(readPromises);
		});
	}

	resolveBackupContent(backup: Uri): TPromise<ITextBufferFactory> {
		return this.fileService.resolveStreamContent(backup, BACKUP_FILE_RESOLVE_OPTIONS).then(content => {

			// Add a filter method to filter out everything until the meta marker
			let metaFound = false;
			const metaPreambleFilter = (chunk: string) => {
				if (!metaFound && chunk) {
					const metaIndex = chunk.indexOf(BackupFileService.META_MARKER);
					if (metaIndex === -1) {
						return ''; // meta not yet found, return empty string
					}

					metaFound = true;
					return chunk.substr(metaIndex + 1); // meta found, return everything after
				}

				return chunk;
			};

			return createTextBufferFactoryFromStream(content.value, metaPreambleFilter);
		});
	}

	toBackupResource(resource: Uri): Uri {
		return Uri.file(path.join(this.backupWorkspacePath, resource.scheme, this.hashPath(resource)));
	}

	private hashPath(resource: Uri): string {
		return crypto.createHash('md5').update(resource.fsPath).digest('hex');
	}
}

export class InMemoryBackupFileService implements IBackupFileService {

	_serviceBrand: any;

	private backups: Map<string, ITextSnapshot> = new Map();

	hasBackups(): TPromise<boolean> {
		return TPromise.as(this.backups.size > 0);
	}

	loadBackupResource(resource: Uri): TPromise<Uri> {
		const backupResource = this.toBackupResource(resource);
		if (this.backups.has(backupResource.toString())) {
			return TPromise.as(backupResource);
		}

		return TPromise.as(void 0);
	}

	backupResource(resource: Uri, content: ITextSnapshot, versionId?: number): TPromise<void> {
		const backupResource = this.toBackupResource(resource);
		this.backups.set(backupResource.toString(), content);

		return TPromise.as(void 0);
	}

	resolveBackupContent(backupResource: Uri): TPromise<ITextBufferFactory> {
		const snapshot = this.backups.get(backupResource.toString());
		if (snapshot) {
			return TPromise.as(createTextBufferFactoryFromSnapshot(snapshot));
		}

		return TPromise.as(void 0);
	}

	getWorkspaceFileBackups(): TPromise<Uri[]> {
		return TPromise.as(keys(this.backups).map(key => Uri.parse(key)));
	}

	discardResourceBackup(resource: Uri): TPromise<void> {
		this.backups.delete(this.toBackupResource(resource).toString());

		return TPromise.as(void 0);
	}

	discardAllWorkspaceBackups(): TPromise<void> {
		this.backups.clear();

		return TPromise.as(void 0);
	}

	toBackupResource(resource: Uri): Uri {
		return Uri.file(path.join(resource.scheme, this.hashPath(resource)));
	}

	private hashPath(resource: Uri): string {
		return crypto.createHash('md5').update(resource.fsPath).digest('hex');
	}
}