/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { equals, deepClone } from '../../../../base/common/objects.js';
import { Promises, ResourceQueue } from '../../../../base/common/async.js';
import { IResolvedWorkingCopyBackup, IWorkingCopyBackupService } from './workingCopyBackup.js';
import { IFileService, FileOperationError, FileOperationResult } from '../../../../platform/files/common/files.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { isReadableStream, peekStream } from '../../../../base/common/stream.js';
import { bufferToStream, prefixedBufferReadable, prefixedBufferStream, readableToBuffer, streamToBuffer, VSBuffer, VSBufferReadable, VSBufferReadableStream } from '../../../../base/common/buffer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Schemas } from '../../../../base/common/network.js';
import { hash } from '../../../../base/common/hash.js';
import { isEmptyObject } from '../../../../base/common/types.js';
import { IWorkingCopyBackupMeta, IWorkingCopyIdentifier, NO_TYPE_ID } from './workingCopy.js';

export class WorkingCopyBackupsModel {

	private readonly cache = new ResourceMap<{ versionId?: number; meta?: IWorkingCopyBackupMeta }>();

	static async create(backupRoot: URI, fileService: IFileService): Promise<WorkingCopyBackupsModel> {
		const model = new WorkingCopyBackupsModel(backupRoot, fileService);

		await model.resolve();

		return model;
	}

	private constructor(private backupRoot: URI, private fileService: IFileService) { }

	private async resolve(): Promise<void> {
		try {
			const backupRootStat = await this.fileService.resolve(this.backupRoot);
			if (backupRootStat.children) {
				await Promises.settled(backupRootStat.children
					.filter(child => child.isDirectory)
					.map(async backupSchemaFolder => {

						// Read backup directory for backups
						const backupSchemaFolderStat = await this.fileService.resolve(backupSchemaFolder.resource);

						// Remember known backups in our caches
						//
						// Note: this does NOT account for resolving
						// associated meta data because that requires
						// opening the backup and reading the meta
						// preamble. Instead, when backups are actually
						// resolved, the meta data will be added via
						// additional `update` calls.
						if (backupSchemaFolderStat.children) {
							for (const backupForSchema of backupSchemaFolderStat.children) {
								if (!backupForSchema.isDirectory) {
									this.add(backupForSchema.resource);
								}
							}
						}
					}));
			}
		} catch (error) {
			// ignore any errors
		}
	}

	add(resource: URI, versionId = 0, meta?: IWorkingCopyBackupMeta): void {
		this.cache.set(resource, {
			versionId,
			meta: deepClone(meta)
		});
	}

	update(resource: URI, meta?: IWorkingCopyBackupMeta): void {
		const entry = this.cache.get(resource);
		if (entry) {
			entry.meta = deepClone(meta);
		}
	}

	count(): number {
		return this.cache.size;
	}

	has(resource: URI, versionId?: number, meta?: IWorkingCopyBackupMeta): boolean {
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
		return Array.from(this.cache.keys());
	}

	remove(resource: URI): void {
		this.cache.delete(resource);
	}

	clear(): void {
		this.cache.clear();
	}
}

export abstract class WorkingCopyBackupService extends Disposable implements IWorkingCopyBackupService {

	declare readonly _serviceBrand: undefined;

	private impl: WorkingCopyBackupServiceImpl | InMemoryWorkingCopyBackupService;

	constructor(
		backupWorkspaceHome: URI | undefined,
		@IFileService protected fileService: IFileService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.impl = this._register(this.initialize(backupWorkspaceHome));
	}

	private initialize(backupWorkspaceHome: URI | undefined): WorkingCopyBackupServiceImpl | InMemoryWorkingCopyBackupService {
		if (backupWorkspaceHome) {
			return new WorkingCopyBackupServiceImpl(backupWorkspaceHome, this.fileService, this.logService);
		}

		return new InMemoryWorkingCopyBackupService();
	}

	reinitialize(backupWorkspaceHome: URI | undefined): void {

		// Re-init implementation (unless we are running in-memory)
		if (this.impl instanceof WorkingCopyBackupServiceImpl) {
			if (backupWorkspaceHome) {
				this.impl.initialize(backupWorkspaceHome);
			} else {
				this.impl = new InMemoryWorkingCopyBackupService();
			}
		}
	}

	hasBackupSync(identifier: IWorkingCopyIdentifier, versionId?: number, meta?: IWorkingCopyBackupMeta): boolean {
		return this.impl.hasBackupSync(identifier, versionId, meta);
	}

	backup(identifier: IWorkingCopyIdentifier, content?: VSBufferReadableStream | VSBufferReadable, versionId?: number, meta?: IWorkingCopyBackupMeta, token?: CancellationToken): Promise<void> {
		return this.impl.backup(identifier, content, versionId, meta, token);
	}

	discardBackup(identifier: IWorkingCopyIdentifier, token?: CancellationToken): Promise<void> {
		return this.impl.discardBackup(identifier, token);
	}

	discardBackups(filter?: { except: IWorkingCopyIdentifier[] }): Promise<void> {
		return this.impl.discardBackups(filter);
	}

	getBackups(): Promise<IWorkingCopyIdentifier[]> {
		return this.impl.getBackups();
	}

	resolve<T extends IWorkingCopyBackupMeta>(identifier: IWorkingCopyIdentifier): Promise<IResolvedWorkingCopyBackup<T> | undefined> {
		return this.impl.resolve(identifier);
	}

	toBackupResource(identifier: IWorkingCopyIdentifier): URI {
		return this.impl.toBackupResource(identifier);
	}

	joinBackups(): Promise<void> {
		return this.impl.joinBackups();
	}
}

class WorkingCopyBackupServiceImpl extends Disposable implements IWorkingCopyBackupService {

	private static readonly PREAMBLE_END_MARKER = '\n';
	private static readonly PREAMBLE_END_MARKER_CHARCODE = '\n'.charCodeAt(0);
	private static readonly PREAMBLE_META_SEPARATOR = ' '; // using a character that is know to be escaped in a URI as separator
	private static readonly PREAMBLE_MAX_LENGTH = 10000;

	declare readonly _serviceBrand: undefined;

	private readonly ioOperationQueues = this._register(new ResourceQueue()); // queue IO operations to ensure write/delete file order

	private ready!: Promise<WorkingCopyBackupsModel>;
	private model: WorkingCopyBackupsModel | undefined = undefined;

	constructor(
		private backupWorkspaceHome: URI,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.initialize(backupWorkspaceHome);
	}

	initialize(backupWorkspaceResource: URI): void {
		this.backupWorkspaceHome = backupWorkspaceResource;

		this.ready = this.doInitialize();
	}

	private async doInitialize(): Promise<WorkingCopyBackupsModel> {

		// Create backup model
		this.model = await WorkingCopyBackupsModel.create(this.backupWorkspaceHome, this.fileService);

		return this.model;
	}

	hasBackupSync(identifier: IWorkingCopyIdentifier, versionId?: number, meta?: IWorkingCopyBackupMeta): boolean {
		if (!this.model) {
			return false;
		}

		const backupResource = this.toBackupResource(identifier);

		return this.model.has(backupResource, versionId, meta);
	}

	async backup(identifier: IWorkingCopyIdentifier, content?: VSBufferReadable | VSBufferReadableStream, versionId?: number, meta?: IWorkingCopyBackupMeta, token?: CancellationToken): Promise<void> {
		const model = await this.ready;
		if (token?.isCancellationRequested) {
			return;
		}

		const backupResource = this.toBackupResource(identifier);
		if (model.has(backupResource, versionId, meta)) {
			// return early if backup version id matches requested one
			return;
		}

		return this.ioOperationQueues.queueFor(backupResource, async () => {
			if (token?.isCancellationRequested) {
				return;
			}

			if (model.has(backupResource, versionId, meta)) {
				// return early if backup version id matches requested one
				// this can happen when multiple backup IO operations got
				// scheduled, racing against each other.
				return;
			}

			// Encode as: Resource + META-START + Meta + END
			// and respect max length restrictions in case
			// meta is too large.
			let preamble = this.createPreamble(identifier, meta);
			if (preamble.length >= WorkingCopyBackupServiceImpl.PREAMBLE_MAX_LENGTH) {
				preamble = this.createPreamble(identifier);
			}

			// Update backup with value
			const preambleBuffer = VSBuffer.fromString(preamble);
			let backupBuffer: VSBuffer | VSBufferReadableStream | VSBufferReadable;
			if (isReadableStream(content)) {
				backupBuffer = prefixedBufferStream(preambleBuffer, content);
			} else if (content) {
				backupBuffer = prefixedBufferReadable(preambleBuffer, content);
			} else {
				backupBuffer = VSBuffer.concat([preambleBuffer, VSBuffer.fromString('')]);
			}

			// Write backup via file service
			await this.fileService.writeFile(backupResource, backupBuffer);

			//
			// Update model
			//
			// Note: not checking for cancellation here because a successful
			// write into the backup file should be noted in the model to
			// prevent the model being out of sync with the backup file
			model.add(backupResource, versionId, meta);
		});
	}

	private createPreamble(identifier: IWorkingCopyIdentifier, meta?: IWorkingCopyBackupMeta): string {
		return `${identifier.resource.toString()}${WorkingCopyBackupServiceImpl.PREAMBLE_META_SEPARATOR}${JSON.stringify({ ...meta, typeId: identifier.typeId })}${WorkingCopyBackupServiceImpl.PREAMBLE_END_MARKER}`;
	}

	async discardBackups(filter?: { except: IWorkingCopyIdentifier[] }): Promise<void> {
		const model = await this.ready;

		// Discard all but some backups
		const except = filter?.except;
		if (Array.isArray(except) && except.length > 0) {
			const exceptMap = new ResourceMap<boolean>();
			for (const exceptWorkingCopy of except) {
				exceptMap.set(this.toBackupResource(exceptWorkingCopy), true);
			}

			await Promises.settled(model.get().map(async backupResource => {
				if (!exceptMap.has(backupResource)) {
					await this.doDiscardBackup(backupResource);
				}
			}));
		}

		// Discard all backups
		else {
			await this.deleteIgnoreFileNotFound(this.backupWorkspaceHome);

			model.clear();
		}
	}

	discardBackup(identifier: IWorkingCopyIdentifier, token?: CancellationToken): Promise<void> {
		const backupResource = this.toBackupResource(identifier);

		return this.doDiscardBackup(backupResource, token);
	}

	private async doDiscardBackup(backupResource: URI, token?: CancellationToken): Promise<void> {
		const model = await this.ready;
		if (token?.isCancellationRequested) {
			return;
		}

		return this.ioOperationQueues.queueFor(backupResource, async () => {
			if (token?.isCancellationRequested) {
				return;
			}

			// Delete backup file ignoring any file not found errors
			await this.deleteIgnoreFileNotFound(backupResource);

			//
			// Update model
			//
			// Note: not checking for cancellation here because a successful
			// delete of the backup file should be noted in the model to
			// prevent the model being out of sync with the backup file
			model.remove(backupResource);
		});
	}

	private async deleteIgnoreFileNotFound(backupResource: URI): Promise<void> {
		try {
			await this.fileService.del(backupResource, { recursive: true });
		} catch (error) {
			if ((<FileOperationError>error).fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
				throw error; // re-throw any other error than file not found which is OK
			}
		}
	}

	async getBackups(): Promise<IWorkingCopyIdentifier[]> {
		const model = await this.ready;

		// Ensure to await any pending backup operations
		await this.joinBackups();

		const backups = await Promise.all(model.get().map(backupResource => this.resolveIdentifier(backupResource, model)));

		return coalesce(backups);
	}

	private async resolveIdentifier(backupResource: URI, model: WorkingCopyBackupsModel): Promise<IWorkingCopyIdentifier | undefined> {
		let res: IWorkingCopyIdentifier | undefined = undefined;

		await this.ioOperationQueues.queueFor(backupResource, async () => {
			if (!model.has(backupResource)) {
				return; // require backup to be present
			}

			// Read the entire backup preamble by reading up to
			// `PREAMBLE_MAX_LENGTH` in the backup file until
			// the `PREAMBLE_END_MARKER` is found
			const backupPreamble = await this.readToMatchingString(backupResource, WorkingCopyBackupServiceImpl.PREAMBLE_END_MARKER, WorkingCopyBackupServiceImpl.PREAMBLE_MAX_LENGTH);
			if (!backupPreamble) {
				return;
			}

			// Figure out the offset in the preamble where meta
			// information possibly starts. This can be `-1` for
			// older backups without meta.
			const metaStartIndex = backupPreamble.indexOf(WorkingCopyBackupServiceImpl.PREAMBLE_META_SEPARATOR);

			// Extract the preamble content for resource and meta
			let resourcePreamble: string;
			let metaPreamble: string | undefined;
			if (metaStartIndex > 0) {
				resourcePreamble = backupPreamble.substring(0, metaStartIndex);
				metaPreamble = backupPreamble.substr(metaStartIndex + 1);
			} else {
				resourcePreamble = backupPreamble;
				metaPreamble = undefined;
			}

			// Try to parse the meta preamble for figuring out
			// `typeId` and `meta` if defined.
			const { typeId, meta } = this.parsePreambleMeta(metaPreamble);

			// Update model entry with now resolved meta
			model.update(backupResource, meta);

			res = {
				typeId: typeId ?? NO_TYPE_ID,
				resource: URI.parse(resourcePreamble)
			};
		});

		return res;
	}

	private async readToMatchingString(backupResource: URI, matchingString: string, maximumBytesToRead: number): Promise<string | undefined> {
		const contents = (await this.fileService.readFile(backupResource, { length: maximumBytesToRead })).value.toString();

		const matchingStringIndex = contents.indexOf(matchingString);
		if (matchingStringIndex >= 0) {
			return contents.substr(0, matchingStringIndex);
		}

		// Unable to find matching string in file
		return undefined;
	}

	async resolve<T extends IWorkingCopyBackupMeta>(identifier: IWorkingCopyIdentifier): Promise<IResolvedWorkingCopyBackup<T> | undefined> {
		const backupResource = this.toBackupResource(identifier);

		const model = await this.ready;

		let res: IResolvedWorkingCopyBackup<T> | undefined = undefined;

		await this.ioOperationQueues.queueFor(backupResource, async () => {
			if (!model.has(backupResource)) {
				return; // require backup to be present
			}

			// Load the backup content and peek into the first chunk
			// to be able to resolve the meta data
			const backupStream = await this.fileService.readFileStream(backupResource);
			const peekedBackupStream = await peekStream(backupStream.value, 1);
			const firstBackupChunk = VSBuffer.concat(peekedBackupStream.buffer);

			// We have seen reports (e.g. https://github.com/microsoft/vscode/issues/78500) where
			// if VSCode goes down while writing the backup file, the file can turn empty because
			// it always first gets truncated and then written to. In this case, we will not find
			// the meta-end marker ('\n') and as such the backup can only be invalid. We bail out
			// here if that is the case.
			const preambleEndIndex = firstBackupChunk.buffer.indexOf(WorkingCopyBackupServiceImpl.PREAMBLE_END_MARKER_CHARCODE);
			if (preambleEndIndex === -1) {
				this.logService.trace(`Backup: Could not find meta end marker in ${backupResource}. The file is probably corrupt (filesize: ${backupStream.size}).`);

				return undefined;
			}

			const preambelRaw = firstBackupChunk.slice(0, preambleEndIndex).toString();

			// Extract meta data (if any)
			let meta: T | undefined;
			const metaStartIndex = preambelRaw.indexOf(WorkingCopyBackupServiceImpl.PREAMBLE_META_SEPARATOR);
			if (metaStartIndex !== -1) {
				meta = this.parsePreambleMeta(preambelRaw.substr(metaStartIndex + 1)).meta as T;
			}

			// Update model entry with now resolved meta
			model.update(backupResource, meta);

			// Build a new stream without the preamble
			const firstBackupChunkWithoutPreamble = firstBackupChunk.slice(preambleEndIndex + 1);
			let value: VSBufferReadableStream;
			if (peekedBackupStream.ended) {
				value = bufferToStream(firstBackupChunkWithoutPreamble);
			} else {
				value = prefixedBufferStream(firstBackupChunkWithoutPreamble, peekedBackupStream.stream);
			}

			res = { value, meta };
		});

		return res;
	}

	private parsePreambleMeta<T extends IWorkingCopyBackupMeta>(preambleMetaRaw: string | undefined): { typeId: string | undefined; meta: T | undefined } {
		let typeId: string | undefined = undefined;
		let meta: T | undefined = undefined;

		if (preambleMetaRaw) {
			try {
				meta = JSON.parse(preambleMetaRaw);
				typeId = meta?.typeId;

				// `typeId` is a property that we add so we
				// remove it when returning to clients.
				if (typeof meta?.typeId === 'string') {
					delete meta.typeId;

					if (isEmptyObject(meta)) {
						meta = undefined;
					}
				}
			} catch (error) {
				// ignore JSON parse errors
			}
		}

		return { typeId, meta };
	}

	toBackupResource(identifier: IWorkingCopyIdentifier): URI {
		return joinPath(this.backupWorkspaceHome, identifier.resource.scheme, hashIdentifier(identifier));
	}

	joinBackups(): Promise<void> {
		return this.ioOperationQueues.whenDrained();
	}
}

export class InMemoryWorkingCopyBackupService extends Disposable implements IWorkingCopyBackupService {

	declare readonly _serviceBrand: undefined;

	private backups = new ResourceMap<{ typeId: string; content: VSBuffer; meta?: IWorkingCopyBackupMeta }>();

	hasBackupSync(identifier: IWorkingCopyIdentifier, versionId?: number): boolean {
		const backupResource = this.toBackupResource(identifier);

		return this.backups.has(backupResource);
	}

	async backup(identifier: IWorkingCopyIdentifier, content?: VSBufferReadable | VSBufferReadableStream, versionId?: number, meta?: IWorkingCopyBackupMeta, token?: CancellationToken): Promise<void> {
		const backupResource = this.toBackupResource(identifier);
		this.backups.set(backupResource, {
			typeId: identifier.typeId,
			content: content instanceof VSBuffer ? content : content ? isReadableStream(content) ? await streamToBuffer(content) : readableToBuffer(content) : VSBuffer.fromString(''),
			meta
		});
	}

	async resolve<T extends IWorkingCopyBackupMeta>(identifier: IWorkingCopyIdentifier): Promise<IResolvedWorkingCopyBackup<T> | undefined> {
		const backupResource = this.toBackupResource(identifier);
		const backup = this.backups.get(backupResource);
		if (backup) {
			return { value: bufferToStream(backup.content), meta: backup.meta as T | undefined };
		}

		return undefined;
	}

	async getBackups(): Promise<IWorkingCopyIdentifier[]> {
		return Array.from(this.backups.entries()).map(([resource, backup]) => ({ typeId: backup.typeId, resource }));
	}

	async discardBackup(identifier: IWorkingCopyIdentifier): Promise<void> {
		this.backups.delete(this.toBackupResource(identifier));
	}

	async discardBackups(filter?: { except: IWorkingCopyIdentifier[] }): Promise<void> {
		const except = filter?.except;
		if (Array.isArray(except) && except.length > 0) {
			const exceptMap = new ResourceMap<boolean>();
			for (const exceptWorkingCopy of except) {
				exceptMap.set(this.toBackupResource(exceptWorkingCopy), true);
			}

			for (const backup of await this.getBackups()) {
				if (!exceptMap.has(this.toBackupResource(backup))) {
					await this.discardBackup(backup);
				}
			}
		} else {
			this.backups.clear();
		}
	}

	toBackupResource(identifier: IWorkingCopyIdentifier): URI {
		return URI.from({ scheme: Schemas.inMemory, path: hashIdentifier(identifier) });
	}

	async joinBackups(): Promise<void> {
		return;
	}
}

/*
 * Exported only for testing
 */
export function hashIdentifier(identifier: IWorkingCopyIdentifier): string {

	// IMPORTANT: for backwards compatibility, ensure that
	// we ignore the `typeId` unless a value is provided.
	// To preserve previous backups without type id, we
	// need to just hash the resource. Otherwise we use
	// the type id as a seed to the resource path.
	let resource: URI;
	if (identifier.typeId.length > 0) {
		const typeIdHash = hashString(identifier.typeId);
		if (identifier.resource.path) {
			resource = joinPath(identifier.resource, typeIdHash);
		} else {
			resource = identifier.resource.with({ path: typeIdHash });
		}
	} else {
		resource = identifier.resource;
	}

	return hashPath(resource);
}

function hashPath(resource: URI): string {
	const str = resource.scheme === Schemas.file || resource.scheme === Schemas.untitled ? resource.fsPath : resource.toString();

	return hashString(str);
}

function hashString(str: string): string {
	return hash(str).toString(16);
}
