/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'vs/base/common/path';
import * as crypto from 'crypto';
import * as pfs from 'vs/base/node/pfs';
import { URI as Uri } from 'vs/base/common/uri';
import { ResourceQueue } from 'vs/base/common/async';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IFileService } from 'vs/platform/files/common/files';
import { readToMatchingString } from 'vs/base/node/stream';
import { ITextBufferFactory, ITextSnapshot } from 'vs/editor/common/model';
import { createTextBufferFactoryFromStream, createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { keys } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { VSBuffer } from 'vs/base/common/buffer';
import { TextSnapshotReadable } from 'vs/workbench/services/textfile/common/textfiles';

export interface IBackupFilesModel {
	resolve(backupRoot: string): Promise<IBackupFilesModel>;

	add(resource: Uri, versionId?: number): void;
	has(resource: Uri, versionId?: number): boolean;
	get(): Uri[];
	remove(resource: Uri): void;
	count(): number;
	clear(): void;
}

export class BackupFilesModel implements IBackupFilesModel {
	private cache: { [resource: string]: number /* version ID */ } = Object.create(null);

	resolve(backupRoot: string): Promise<IBackupFilesModel> {
		return pfs.readDirsInDir(backupRoot).then(backupSchemas => {

			// For all supported schemas
			return Promise.all(backupSchemas.map(backupSchema => {

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

	_serviceBrand: any;

	private impl: IBackupFileService;

	constructor(
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IFileService fileService: IFileService
	) {
		const backupWorkspacePath = environmentService.configuration.backupPath;
		if (backupWorkspacePath) {
			this.impl = new BackupFileServiceImpl(backupWorkspacePath, fileService);
		} else {
			this.impl = new InMemoryBackupFileService();
		}
	}

	initialize(backupWorkspacePath: string): void {
		if (this.impl instanceof BackupFileServiceImpl) {
			this.impl.initialize(backupWorkspacePath);
		}
	}

	hasBackups(): Promise<boolean> {
		return this.impl.hasBackups();
	}

	loadBackupResource(resource: Uri): Promise<Uri | undefined> {
		return this.impl.loadBackupResource(resource);
	}

	backupResource(resource: Uri, content: ITextSnapshot, versionId?: number): Promise<void> {
		return this.impl.backupResource(resource, content, versionId);
	}

	discardResourceBackup(resource: Uri): Promise<void> {
		return this.impl.discardResourceBackup(resource);
	}

	discardAllWorkspaceBackups(): Promise<void> {
		return this.impl.discardAllWorkspaceBackups();
	}

	getWorkspaceFileBackups(): Promise<Uri[]> {
		return this.impl.getWorkspaceFileBackups();
	}

	resolveBackupContent(backup: Uri): Promise<ITextBufferFactory | undefined> {
		return this.impl.resolveBackupContent(backup);
	}

	toBackupResource(resource: Uri): Uri {
		return this.impl.toBackupResource(resource);
	}
}

class BackupFileServiceImpl implements IBackupFileService {

	private static readonly META_MARKER = '\n';

	_serviceBrand: any;

	private backupWorkspacePath: string;

	private isShuttingDown: boolean;
	private ready: Promise<IBackupFilesModel>;
	private ioOperationQueues: ResourceQueue; // queue IO operations to ensure write order

	constructor(
		backupWorkspacePath: string,
		@IFileService private readonly fileService: IFileService
	) {
		this.isShuttingDown = false;
		this.ioOperationQueues = new ResourceQueue();

		this.initialize(backupWorkspacePath);
	}

	initialize(backupWorkspacePath: string): void {
		this.backupWorkspacePath = backupWorkspacePath;

		this.ready = this.init();
	}

	private init(): Promise<IBackupFilesModel> {
		const model = new BackupFilesModel();

		return model.resolve(this.backupWorkspacePath);
	}

	hasBackups(): Promise<boolean> {
		return this.ready.then(model => {
			return model.count() > 0;
		});
	}

	loadBackupResource(resource: Uri): Promise<Uri | undefined> {
		return this.ready.then(model => {

			// Return directly if we have a known backup with that resource
			const backupResource = this.toBackupResource(resource);
			if (model.has(backupResource)) {
				return backupResource;
			}

			return undefined;
		});
	}

	backupResource(resource: Uri, content: ITextSnapshot, versionId?: number): Promise<void> {
		if (this.isShuttingDown) {
			return Promise.resolve();
		}

		return this.ready.then(model => {
			const backupResource = this.toBackupResource(resource);
			if (model.has(backupResource, versionId)) {
				return undefined; // return early if backup version id matches requested one
			}

			return this.ioOperationQueues.queueFor(backupResource).queue(() => {
				const preamble = `${resource.toString()}${BackupFileServiceImpl.META_MARKER}`;

				// Update content with value
				return this.fileService.writeFile(backupResource, new TextSnapshotReadable(content, preamble)).then(() => model.add(backupResource, versionId));
			});
		});
	}

	discardResourceBackup(resource: Uri): Promise<void> {
		return this.ready.then(model => {
			const backupResource = this.toBackupResource(resource);

			return this.ioOperationQueues.queueFor(backupResource).queue(() => {
				return pfs.rimraf(backupResource.fsPath, pfs.RimRafMode.MOVE).then(() => model.remove(backupResource));
			});
		});
	}

	discardAllWorkspaceBackups(): Promise<void> {
		this.isShuttingDown = true;

		return this.ready.then(model => {
			return pfs.rimraf(this.backupWorkspacePath, pfs.RimRafMode.MOVE).then(() => model.clear());
		});
	}

	getWorkspaceFileBackups(): Promise<Uri[]> {
		return this.ready.then(model => {
			const readPromises: Promise<Uri>[] = [];

			model.get().forEach(fileBackup => {
				readPromises.push(
					readToMatchingString(fileBackup.fsPath, BackupFileServiceImpl.META_MARKER, 2000, 10000).then(Uri.parse)
				);
			});

			return Promise.all(readPromises);
		});
	}

	resolveBackupContent(backup: Uri): Promise<ITextBufferFactory> {
		return this.fileService.readFileStream(backup).then(content => {

			// Add a filter method to filter out everything until the meta marker
			let metaFound = false;
			const metaPreambleFilter = (chunk: VSBuffer) => {
				const chunkString = chunk.toString();

				if (!metaFound && chunk) {
					const metaIndex = chunkString.indexOf(BackupFileServiceImpl.META_MARKER);
					if (metaIndex === -1) {
						return VSBuffer.fromString(''); // meta not yet found, return empty string
					}

					metaFound = true;
					return VSBuffer.fromString(chunkString.substr(metaIndex + 1)); // meta found, return everything after
				}

				return chunk;
			};

			return createTextBufferFactoryFromStream(content.value, metaPreambleFilter);
		});
	}

	toBackupResource(resource: Uri): Uri {
		return Uri.file(path.join(this.backupWorkspacePath, resource.scheme, hashPath(resource)));
	}
}

export class InMemoryBackupFileService implements IBackupFileService {

	_serviceBrand: any;

	private backups: Map<string, ITextSnapshot> = new Map();

	hasBackups(): Promise<boolean> {
		return Promise.resolve(this.backups.size > 0);
	}

	loadBackupResource(resource: Uri): Promise<Uri | undefined> {
		const backupResource = this.toBackupResource(resource);
		if (this.backups.has(backupResource.toString())) {
			return Promise.resolve(backupResource);
		}

		return Promise.resolve(undefined);
	}

	backupResource(resource: Uri, content: ITextSnapshot, versionId?: number): Promise<void> {
		const backupResource = this.toBackupResource(resource);
		this.backups.set(backupResource.toString(), content);

		return Promise.resolve();
	}

	resolveBackupContent(backupResource: Uri): Promise<ITextBufferFactory | undefined> {
		const snapshot = this.backups.get(backupResource.toString());
		if (snapshot) {
			return Promise.resolve(createTextBufferFactoryFromSnapshot(snapshot));
		}

		return Promise.resolve(undefined);
	}

	getWorkspaceFileBackups(): Promise<Uri[]> {
		return Promise.resolve(keys(this.backups).map(key => Uri.parse(key)));
	}

	discardResourceBackup(resource: Uri): Promise<void> {
		this.backups.delete(this.toBackupResource(resource).toString());

		return Promise.resolve();
	}

	discardAllWorkspaceBackups(): Promise<void> {
		this.backups.clear();

		return Promise.resolve();
	}

	toBackupResource(resource: Uri): Uri {
		return Uri.file(path.join(resource.scheme, hashPath(resource)));
	}
}

/*
 * Exported only for testing
 */
export function hashPath(resource: Uri): string {
	const str = resource.scheme === Schemas.file || resource.scheme === Schemas.untitled ? resource.fsPath : resource.toString();
	return crypto.createHash('md5').update(str).digest('hex');
}

registerSingleton(IBackupFileService, BackupFileService);