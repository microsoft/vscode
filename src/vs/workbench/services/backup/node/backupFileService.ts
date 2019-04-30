/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from 'vs/base/common/path';
import { createHash } from 'crypto';
import { readdir, readDirsInDir, rimraf, RimRafMode } from 'vs/base/node/pfs';
import { URI } from 'vs/base/common/uri';
import { coalesce } from 'vs/base/common/arrays';
import { ResourceQueue } from 'vs/base/common/async';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IFileService } from 'vs/platform/files/common/files';
import { readToMatchingString } from 'vs/base/node/stream';
import { ITextBufferFactory, ITextSnapshot } from 'vs/editor/common/model';
import { createTextBufferFactoryFromStream, createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { keys, ResourceMap } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { VSBuffer } from 'vs/base/common/buffer';
import { TextSnapshotReadable } from 'vs/workbench/services/textfile/common/textfiles';

export interface IBackupFilesModel {
	resolve(backupRoot: string): Promise<IBackupFilesModel>;

	add(resource: URI, versionId?: number): void;
	has(resource: URI, versionId?: number): boolean;
	get(): URI[];
	remove(resource: URI): void;
	count(): number;
	clear(): void;
}

export class BackupFilesModel implements IBackupFilesModel {
	private cache: ResourceMap<number /* version id */> = new ResourceMap();

	async resolve(backupRoot: string): Promise<IBackupFilesModel> {
		try {
			const backupSchemas = await readDirsInDir(backupRoot);

			await Promise.all(backupSchemas.map(async backupSchema => {

				// Read backup directory for backups
				const backupSchemaPath = join(backupRoot, backupSchema);
				const backupHashes = await readdir(backupSchemaPath);

				// Remember known backups in our caches
				backupHashes.forEach(backupHash => this.add(URI.file(join(backupSchemaPath, backupHash))));
			}));
		} catch (error) {
			// ignore any errors
		}

		return this;
	}

	add(resource: URI, versionId = 0): void {
		this.cache.set(resource, versionId);
	}

	count(): number {
		return this.cache.size;
	}

	has(resource: URI, versionId?: number): boolean {
		const cachedVersionId = this.cache.get(resource);
		if (typeof cachedVersionId !== 'number') {
			return false; // unknown resource
		}

		if (typeof versionId === 'number') {
			return versionId === cachedVersionId; // if we are asked with a specific version ID, make sure to test for it
		}

		return true;
	}

	get(): URI[] {
		return this.cache.keys();
	}

	remove(resource: URI): void {
		this.cache.delete(resource);
	}

	clear(): void {
		this.cache.clear();
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

	loadBackupResource(resource: URI): Promise<URI | undefined> {
		return this.impl.loadBackupResource(resource);
	}

	backupResource(resource: URI, content: ITextSnapshot, versionId?: number): Promise<void> {
		return this.impl.backupResource(resource, content, versionId);
	}

	discardResourceBackup(resource: URI): Promise<void> {
		return this.impl.discardResourceBackup(resource);
	}

	discardAllWorkspaceBackups(): Promise<void> {
		return this.impl.discardAllWorkspaceBackups();
	}

	getWorkspaceFileBackups(): Promise<URI[]> {
		return this.impl.getWorkspaceFileBackups();
	}

	resolveBackupContent(backup: URI): Promise<ITextBufferFactory> {
		return this.impl.resolveBackupContent(backup);
	}

	toBackupResource(resource: URI): URI {
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

	async hasBackups(): Promise<boolean> {
		const model = await this.ready;

		return model.count() > 0;
	}

	async loadBackupResource(resource: URI): Promise<URI | undefined> {
		const model = await this.ready;

		// Return directly if we have a known backup with that resource
		const backupResource = this.toBackupResource(resource);
		if (model.has(backupResource)) {
			return backupResource;
		}

		return undefined;
	}

	async backupResource(resource: URI, content: ITextSnapshot, versionId?: number): Promise<void> {
		if (this.isShuttingDown) {
			return Promise.resolve();
		}

		const model = await this.ready;

		const backupResource = this.toBackupResource(resource);
		if (model.has(backupResource, versionId)) {
			return undefined; // return early if backup version id matches requested one
		}

		return this.ioOperationQueues.queueFor(backupResource).queue(async () => {
			const preamble = `${resource.toString()}${BackupFileServiceImpl.META_MARKER}`;

			// Update content with value
			await this.fileService.writeFile(backupResource, new TextSnapshotReadable(content, preamble));

			// Update model
			model.add(backupResource, versionId);
		});
	}

	async discardResourceBackup(resource: URI): Promise<void> {
		const model = await this.ready;
		const backupResource = this.toBackupResource(resource);

		return this.ioOperationQueues.queueFor(backupResource).queue(async () => {
			await rimraf(backupResource.fsPath, RimRafMode.MOVE);

			model.remove(backupResource);
		});
	}

	async discardAllWorkspaceBackups(): Promise<void> {
		this.isShuttingDown = true;

		const model = await this.ready;

		await rimraf(this.backupWorkspacePath, RimRafMode.MOVE);

		model.clear();
	}

	async getWorkspaceFileBackups(): Promise<URI[]> {
		const model = await this.ready;

		const backups = await Promise.all(model.get().map(async fileBackup => {
			const backup = await readToMatchingString(fileBackup.fsPath, BackupFileServiceImpl.META_MARKER, 2000, 10000);
			if (!backup) {
				return undefined;
			}

			return URI.parse(backup);
		}));

		return coalesce(backups);
	}

	async resolveBackupContent(backup: URI): Promise<ITextBufferFactory> {
		const content = await this.fileService.readFileStream(backup);

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
	}

	toBackupResource(resource: URI): URI {
		return URI.file(join(this.backupWorkspacePath, resource.scheme, hashPath(resource)));
	}
}

export class InMemoryBackupFileService implements IBackupFileService {

	_serviceBrand: any;

	private backups: Map<string, ITextSnapshot> = new Map();

	hasBackups(): Promise<boolean> {
		return Promise.resolve(this.backups.size > 0);
	}

	loadBackupResource(resource: URI): Promise<URI | undefined> {
		const backupResource = this.toBackupResource(resource);
		if (this.backups.has(backupResource.toString())) {
			return Promise.resolve(backupResource);
		}

		return Promise.resolve(undefined);
	}

	backupResource(resource: URI, content: ITextSnapshot, versionId?: number): Promise<void> {
		const backupResource = this.toBackupResource(resource);
		this.backups.set(backupResource.toString(), content);

		return Promise.resolve();
	}

	resolveBackupContent(backupResource: URI): Promise<ITextBufferFactory> {
		const snapshot = this.backups.get(backupResource.toString());
		if (snapshot) {
			return Promise.resolve(createTextBufferFactoryFromSnapshot(snapshot));
		}

		return Promise.reject('Unexpected backup resource to resolve');
	}

	getWorkspaceFileBackups(): Promise<URI[]> {
		return Promise.resolve(keys(this.backups).map(key => URI.parse(key)));
	}

	discardResourceBackup(resource: URI): Promise<void> {
		this.backups.delete(this.toBackupResource(resource).toString());

		return Promise.resolve();
	}

	discardAllWorkspaceBackups(): Promise<void> {
		this.backups.clear();

		return Promise.resolve();
	}

	toBackupResource(resource: URI): URI {
		return URI.file(join(resource.scheme, hashPath(resource)));
	}
}

/*
 * Exported only for testing
 */
export function hashPath(resource: URI): string {
	const str = resource.scheme === Schemas.file || resource.scheme === Schemas.untitled ? resource.fsPath : resource.toString();
	return createHash('md5').update(str).digest('hex');
}

registerSingleton(IBackupFileService, BackupFileService);