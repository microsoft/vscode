/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from 'vs/base/common/path';
import { joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { hash } from 'vs/base/common/hash';
import { coalesce } from 'vs/base/common/arrays';
import { equals, deepClone } from 'vs/base/common/objects';
import { ResourceQueue } from 'vs/base/common/async';
import { IBackupFileService, IResolvedBackup } from 'vs/workbench/services/backup/common/backup';
import { IFileService } from 'vs/platform/files/common/files';
import { ITextSnapshot } from 'vs/editor/common/model';
import { createTextBufferFactoryFromStream, createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { keys, ResourceMap } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { VSBuffer } from 'vs/base/common/buffer';
import { TextSnapshotReadable } from 'vs/workbench/services/textfile/common/textfiles';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export interface IBackupFilesModel {
	resolve(backupRoot: URI): Promise<IBackupFilesModel>;

	add(resource: URI, versionId?: number, meta?: object): void;
	has(resource: URI, versionId?: number, meta?: object): boolean;
	get(): URI[];
	remove(resource: URI): void;
	count(): number;
	clear(): void;
}

interface IBackupCacheEntry {
	versionId?: number;
	meta?: object;
}

export class BackupFilesModel implements IBackupFilesModel {
	private cache: ResourceMap<IBackupCacheEntry> = new ResourceMap();

	constructor(private fileService: IFileService) { }

	async resolve(backupRoot: URI): Promise<IBackupFilesModel> {
		try {
			const backupRootStat = await this.fileService.resolve(backupRoot);
			if (backupRootStat.children) {
				await Promise.all(backupRootStat.children
					.filter(child => child.isDirectory)
					.map(async backupSchema => {

						// Read backup directory for backups
						const backupSchemaStat = await this.fileService.resolve(backupSchema.resource);

						// Remember known backups in our caches
						if (backupSchemaStat.children) {
							backupSchemaStat.children.forEach(backupHash => this.add(backupHash.resource));
						}
					}));
			}
		} catch (error) {
			// ignore any errors
		}

		return this;
	}

	add(resource: URI, versionId = 0, meta?: object): void {
		this.cache.set(resource, { versionId, meta: deepClone(meta) }); // make sure to not store original meta in our cache...
	}

	count(): number {
		return this.cache.size;
	}

	has(resource: URI, versionId?: number, meta?: object): boolean {
		const entry = this.cache.get(resource);
		if (!entry) {
			return false; // unknown resource
		}

		if (typeof versionId === 'number' && versionId !== entry.versionId) {
			return false; // different versionId
		}

		if (meta && !equals(meta, entry.meta)) {
			return false; // different metadata
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

	_serviceBrand!: ServiceIdentifier<IBackupFileService>;

	private impl: IBackupFileService;

	constructor(
		@IWorkbenchEnvironmentService private environmentService: IWorkbenchEnvironmentService,
		@IFileService protected fileService: IFileService
	) {
		this.initialize();
	}

	protected hashPath(resource: URI): string {
		const str = resource.scheme === Schemas.file || resource.scheme === Schemas.untitled ? resource.fsPath : resource.toString();

		return hash(str).toString(16);
	}

	private initialize(): void {
		const backupWorkspaceResource = this.environmentService.configuration.backupWorkspaceResource;
		if (backupWorkspaceResource) {
			this.impl = new BackupFileServiceImpl(backupWorkspaceResource, this.hashPath, this.fileService);
		} else {
			this.impl = new InMemoryBackupFileService(this.hashPath);
		}
	}

	reinitialize(): void {

		// Re-init implementation (unless we are running in-memory)
		if (this.impl instanceof BackupFileServiceImpl) {
			const backupWorkspaceResource = this.environmentService.configuration.backupWorkspaceResource;
			if (backupWorkspaceResource) {
				this.impl.initialize(backupWorkspaceResource);
			} else {
				this.impl = new InMemoryBackupFileService(this.hashPath);
			}
		}
	}

	hasBackups(): Promise<boolean> {
		return this.impl.hasBackups();
	}

	hasBackupSync(resource: URI, versionId?: number): boolean {
		return this.impl.hasBackupSync(resource, versionId);
	}

	loadBackupResource(resource: URI): Promise<URI | undefined> {
		return this.impl.loadBackupResource(resource);
	}

	backupResource<T extends object>(resource: URI, content: ITextSnapshot, versionId?: number, meta?: T): Promise<void> {
		return this.impl.backupResource(resource, content, versionId, meta);
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

	resolveBackupContent<T extends object>(backup: URI): Promise<IResolvedBackup<T>> {
		return this.impl.resolveBackupContent(backup);
	}

	toBackupResource(resource: URI): URI {
		return this.impl.toBackupResource(resource);
	}
}

class BackupFileServiceImpl implements IBackupFileService {

	private static readonly PREAMBLE_END_MARKER = '\n';
	private static readonly PREAMBLE_META_SEPARATOR = ' '; // using a character that is know to be escaped in a URI as separator
	private static readonly PREAMBLE_MAX_LENGTH = 10000;

	_serviceBrand!: ServiceIdentifier<IBackupFileService>;

	private backupWorkspacePath!: URI;

	private isShuttingDown: boolean;
	private ioOperationQueues: ResourceQueue; // queue IO operations to ensure write order

	private ready!: Promise<IBackupFilesModel>;
	private model!: IBackupFilesModel;

	constructor(
		backupWorkspaceResource: URI,
		private readonly hashPath: (resource: URI) => string,
		@IFileService private readonly fileService: IFileService
	) {
		this.isShuttingDown = false;
		this.ioOperationQueues = new ResourceQueue();

		this.initialize(backupWorkspaceResource);
	}

	initialize(backupWorkspaceResource: URI): void {
		this.backupWorkspacePath = backupWorkspaceResource;

		this.ready = this.doInitialize();
	}

	private doInitialize(): Promise<IBackupFilesModel> {
		this.model = new BackupFilesModel(this.fileService);

		return this.model.resolve(this.backupWorkspacePath);
	}

	async hasBackups(): Promise<boolean> {
		const model = await this.ready;

		return model.count() > 0;
	}

	hasBackupSync(resource: URI, versionId?: number): boolean {
		const backupResource = this.toBackupResource(resource);

		return this.model.has(backupResource, versionId);
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

	async backupResource<T extends object>(resource: URI, content: ITextSnapshot, versionId?: number, meta?: T): Promise<void> {
		if (this.isShuttingDown) {
			return;
		}

		const model = await this.ready;

		const backupResource = this.toBackupResource(resource);
		if (model.has(backupResource, versionId, meta)) {
			return; // return early if backup version id matches requested one
		}

		return this.ioOperationQueues.queueFor(backupResource).queue(async () => {
			let preamble: string | undefined = undefined;

			// With Metadata: URI + META-START + Meta + END
			if (meta) {
				const preambleWithMeta = `${resource.toString()}${BackupFileServiceImpl.PREAMBLE_META_SEPARATOR}${JSON.stringify(meta)}${BackupFileServiceImpl.PREAMBLE_END_MARKER}`;
				if (preambleWithMeta.length < BackupFileServiceImpl.PREAMBLE_MAX_LENGTH) {
					preamble = preambleWithMeta;
				}
			}

			// Without Metadata: URI + END
			if (!preamble) {
				preamble = `${resource.toString()}${BackupFileServiceImpl.PREAMBLE_END_MARKER}`;
			}

			// Update content with value
			await this.fileService.writeFile(backupResource, new TextSnapshotReadable(content, preamble));

			// Update model
			model.add(backupResource, versionId, meta);
		});
	}

	async discardResourceBackup(resource: URI): Promise<void> {
		const model = await this.ready;
		const backupResource = this.toBackupResource(resource);

		return this.ioOperationQueues.queueFor(backupResource).queue(async () => {
			await this.fileService.del(backupResource, { recursive: true });

			model.remove(backupResource);
		});
	}

	async discardAllWorkspaceBackups(): Promise<void> {
		this.isShuttingDown = true;

		const model = await this.ready;

		await this.fileService.del(this.backupWorkspacePath, { recursive: true });

		model.clear();
	}

	async getWorkspaceFileBackups(): Promise<URI[]> {
		const model = await this.ready;

		const backups = await Promise.all(model.get().map(async fileBackup => {
			const backupPreamble = await this.readToMatchingString(fileBackup, BackupFileServiceImpl.PREAMBLE_END_MARKER, BackupFileServiceImpl.PREAMBLE_MAX_LENGTH);
			if (!backupPreamble) {
				return undefined;
			}

			// Preamble with metadata: URI + META-START + Meta + END
			const metaStartIndex = backupPreamble.indexOf(BackupFileServiceImpl.PREAMBLE_META_SEPARATOR);
			if (metaStartIndex > 0) {
				return URI.parse(backupPreamble.substring(0, metaStartIndex));
			}

			// Preamble without metadata: URI + END
			else {
				return URI.parse(backupPreamble);
			}
		}));

		return coalesce(backups);
	}

	private async readToMatchingString(file: URI, matchingString: string, maximumBytesToRead: number): Promise<string> {
		const contents = (await this.fileService.readFile(file, { length: maximumBytesToRead })).value.toString();

		const newLineIndex = contents.indexOf(matchingString);
		if (newLineIndex >= 0) {
			return contents.substr(0, newLineIndex);
		}

		throw new Error(`Backup: Could not find ${JSON.stringify(matchingString)} in first ${maximumBytesToRead} bytes of ${file}`);
	}

	async resolveBackupContent<T extends object>(backup: URI): Promise<IResolvedBackup<T>> {

		// Metadata extraction
		let metaRaw = '';
		let metaEndFound = false;

		// Add a filter method to filter out everything until the meta end marker
		const metaPreambleFilter = (chunk: VSBuffer) => {
			const chunkString = chunk.toString();

			if (!metaEndFound) {
				const metaEndIndex = chunkString.indexOf(BackupFileServiceImpl.PREAMBLE_END_MARKER);
				if (metaEndIndex === -1) {
					metaRaw += chunkString;

					return VSBuffer.fromString(''); // meta not yet found, return empty string
				}

				metaEndFound = true;
				metaRaw += chunkString.substring(0, metaEndIndex); // ensure to get last chunk from metadata

				return VSBuffer.fromString(chunkString.substr(metaEndIndex + 1)); // meta found, return everything after
			}

			return chunk;
		};

		// Read backup into factory
		const content = await this.fileService.readFileStream(backup);
		const factory = await createTextBufferFactoryFromStream(content.value, metaPreambleFilter);

		// Extract meta data (if any)
		let meta: T | undefined;
		const metaStartIndex = metaRaw.indexOf(BackupFileServiceImpl.PREAMBLE_META_SEPARATOR);
		if (metaStartIndex !== -1) {
			try {
				meta = JSON.parse(metaRaw.substr(metaStartIndex + 1));
			} catch (error) {
				// ignore JSON parse errors
			}
		}

		// We have seen reports (e.g. https://github.com/microsoft/vscode/issues/78500) where
		// if VSCode goes down while writing the backup file, the file can turn empty because
		// it always first gets truncated and then written to. In this case, we will not find
		// the meta-end marker ('\n') and as such the backup can only be invalid. We bail out
		// here if that is the case.
		if (!metaEndFound) {
			throw new Error(`Backup: Could not find meta end marker in ${backup}. The file is probably corrupt.`);
		}

		return { value: factory, meta };
	}

	toBackupResource(resource: URI): URI {
		return joinPath(this.backupWorkspacePath, resource.scheme, this.hashPath(resource));
	}
}

export class InMemoryBackupFileService implements IBackupFileService {

	_serviceBrand!: ServiceIdentifier<IBackupFileService>;

	private backups: Map<string, ITextSnapshot> = new Map();

	constructor(private readonly hashPath: (resource: URI) => string) { }

	hasBackups(): Promise<boolean> {
		return Promise.resolve(this.backups.size > 0);
	}

	hasBackupSync(resource: URI, versionId?: number): boolean {
		const backupResource = this.toBackupResource(resource);

		return this.backups.has(backupResource.toString());
	}

	loadBackupResource(resource: URI): Promise<URI | undefined> {
		const backupResource = this.toBackupResource(resource);
		if (this.backups.has(backupResource.toString())) {
			return Promise.resolve(backupResource);
		}

		return Promise.resolve(undefined);
	}

	backupResource<T extends object>(resource: URI, content: ITextSnapshot, versionId?: number, meta?: T): Promise<void> {
		const backupResource = this.toBackupResource(resource);
		this.backups.set(backupResource.toString(), content);

		return Promise.resolve();
	}

	resolveBackupContent<T extends object>(backupResource: URI): Promise<IResolvedBackup<T>> {
		const snapshot = this.backups.get(backupResource.toString());
		if (snapshot) {
			return Promise.resolve({ value: createTextBufferFactoryFromSnapshot(snapshot) });
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
		return URI.file(join(resource.scheme, this.hashPath(resource)));
	}
}
