/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Throttler } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
import { ExtUri } from '../../../base/common/resources.js';
import { isString } from '../../../base/common/types.js';
import { URI, UriDto } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { createFileSystemProviderError, FileChangeType, IFileDeleteOptions, IFileOverwriteOptions, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, IFileWriteOptions, IFileChange, IFileSystemProviderWithFileReadWriteCapability, IStat, IWatchOptions } from '../common/files.js';
import { IndexedDB } from '../../../base/browser/indexedDB.js';
import { BroadcastDataChannel } from '../../../base/browser/broadcast.js';

// Standard FS Errors (expected to be thrown in production when invalid FS operations are requested)
const ERR_FILE_NOT_FOUND = createFileSystemProviderError(localize('fileNotExists', "File does not exist"), FileSystemProviderErrorCode.FileNotFound);
const ERR_FILE_IS_DIR = createFileSystemProviderError(localize('fileIsDirectory', "File is Directory"), FileSystemProviderErrorCode.FileIsADirectory);
const ERR_FILE_NOT_DIR = createFileSystemProviderError(localize('fileNotDirectory', "File is not a directory"), FileSystemProviderErrorCode.FileNotADirectory);
const ERR_DIR_NOT_EMPTY = createFileSystemProviderError(localize('dirIsNotEmpty', "Directory is not empty"), FileSystemProviderErrorCode.Unknown);
const ERR_FILE_EXCEEDS_STORAGE_QUOTA = createFileSystemProviderError(localize('fileExceedsStorageQuota', "File exceeds available storage quota"), FileSystemProviderErrorCode.FileExceedsStorageQuota);

// Arbitrary Internal Errors
const ERR_UNKNOWN_INTERNAL = (message: string) => createFileSystemProviderError(localize('internal', "Internal error occurred in IndexedDB File System Provider. ({0})", message), FileSystemProviderErrorCode.Unknown);

type DirEntry = [string, FileType];

type IndexedDBFileSystemEntry =
	| {
		path: string;
		type: FileType.Directory;
		children: Map<string, IndexedDBFileSystemNode>;
	}
	| {
		path: string;
		type: FileType.File;
		size: number | undefined;
	};

class IndexedDBFileSystemNode {
	public type: FileType;

	constructor(private entry: IndexedDBFileSystemEntry) {
		this.type = entry.type;
	}

	read(path: string): IndexedDBFileSystemEntry | undefined {
		return this.doRead(path.split('/').filter(p => p.length));
	}

	private doRead(pathParts: string[]): IndexedDBFileSystemEntry | undefined {
		if (pathParts.length === 0) { return this.entry; }
		if (this.entry.type !== FileType.Directory) {
			throw ERR_UNKNOWN_INTERNAL('Internal error reading from IndexedDBFSNode -- expected directory at ' + this.entry.path);
		}
		const next = this.entry.children.get(pathParts[0]);

		if (!next) { return undefined; }
		return next.doRead(pathParts.slice(1));
	}

	delete(path: string): void {
		const toDelete = path.split('/').filter(p => p.length);
		if (toDelete.length === 0) {
			if (this.entry.type !== FileType.Directory) {
				throw ERR_UNKNOWN_INTERNAL(`Internal error deleting from IndexedDBFSNode. Expected root entry to be directory`);
			}
			this.entry.children.clear();
		} else {
			return this.doDelete(toDelete, path);
		}
	}

	private doDelete(pathParts: string[], originalPath: string): void {
		if (pathParts.length === 0) {
			throw ERR_UNKNOWN_INTERNAL(`Internal error deleting from IndexedDBFSNode -- got no deletion path parts (encountered while deleting ${originalPath})`);
		}
		else if (this.entry.type !== FileType.Directory) {
			throw ERR_UNKNOWN_INTERNAL('Internal error deleting from IndexedDBFSNode -- expected directory at ' + this.entry.path);
		}
		else if (pathParts.length === 1) {
			this.entry.children.delete(pathParts[0]);
		}
		else {
			const next = this.entry.children.get(pathParts[0]);
			if (!next) {
				throw ERR_UNKNOWN_INTERNAL('Internal error deleting from IndexedDBFSNode -- expected entry at ' + this.entry.path + '/' + next);
			}
			next.doDelete(pathParts.slice(1), originalPath);
		}
	}

	add(path: string, entry: { type: 'file'; size?: number } | { type: 'dir' }) {
		this.doAdd(path.split('/').filter(p => p.length), entry, path);
	}

	private doAdd(pathParts: string[], entry: { type: 'file'; size?: number } | { type: 'dir' }, originalPath: string) {
		if (pathParts.length === 0) {
			throw ERR_UNKNOWN_INTERNAL(`Internal error creating IndexedDBFSNode -- adding empty path (encountered while adding ${originalPath})`);
		}
		else if (this.entry.type !== FileType.Directory) {
			throw ERR_UNKNOWN_INTERNAL(`Internal error creating IndexedDBFSNode -- parent is not a directory (encountered while adding ${originalPath})`);
		}
		else if (pathParts.length === 1) {
			const next = pathParts[0];
			const existing = this.entry.children.get(next);
			if (entry.type === 'dir') {
				if (existing?.entry.type === FileType.File) {
					throw ERR_UNKNOWN_INTERNAL(`Internal error creating IndexedDBFSNode -- overwriting file with directory: ${this.entry.path}/${next} (encountered while adding ${originalPath})`);
				}
				this.entry.children.set(next, existing ?? new IndexedDBFileSystemNode({
					type: FileType.Directory,
					path: this.entry.path + '/' + next,
					children: new Map(),
				}));
			} else {
				if (existing?.entry.type === FileType.Directory) {
					throw ERR_UNKNOWN_INTERNAL(`Internal error creating IndexedDBFSNode -- overwriting directory with file: ${this.entry.path}/${next} (encountered while adding ${originalPath})`);
				}
				this.entry.children.set(next, new IndexedDBFileSystemNode({
					type: FileType.File,
					path: this.entry.path + '/' + next,
					size: entry.size,
				}));
			}
		}
		else if (pathParts.length > 1) {
			const next = pathParts[0];
			let childNode = this.entry.children.get(next);
			if (!childNode) {
				childNode = new IndexedDBFileSystemNode({
					children: new Map(),
					path: this.entry.path + '/' + next,
					type: FileType.Directory
				});
				this.entry.children.set(next, childNode);
			}
			else if (childNode.type === FileType.File) {
				throw ERR_UNKNOWN_INTERNAL(`Internal error creating IndexedDBFSNode -- overwriting file entry with directory: ${this.entry.path}/${next} (encountered while adding ${originalPath})`);
			}
			childNode.doAdd(pathParts.slice(1), entry, originalPath);
		}
	}

	print(indentation = '') {
		console.log(indentation + this.entry.path);
		if (this.entry.type === FileType.Directory) {
			this.entry.children.forEach(child => child.print(indentation + ' '));
		}
	}
}

export class IndexedDBFileSystemProvider extends Disposable implements IFileSystemProviderWithFileReadWriteCapability {

	readonly capabilities: FileSystemProviderCapabilities =
		FileSystemProviderCapabilities.FileReadWrite
		| FileSystemProviderCapabilities.PathCaseSensitive;
	readonly onDidChangeCapabilities: Event<void> = Event.None;

	private readonly extUri = new ExtUri(() => false) /* Case Sensitive */;

	private readonly changesBroadcastChannel: BroadcastDataChannel<UriDto<IFileChange>[]> | undefined;
	private readonly _onDidChangeFile = this._register(new Emitter<readonly IFileChange[]>());
	readonly onDidChangeFile: Event<readonly IFileChange[]> = this._onDidChangeFile.event;

	private readonly mtimes = new Map<string, number>();

	private cachedFiletree: Promise<IndexedDBFileSystemNode> | undefined;
	private writeManyThrottler: Throttler;

	constructor(readonly scheme: string, private indexedDB: IndexedDB, private readonly store: string, watchCrossWindowChanges: boolean) {
		super();
		this.writeManyThrottler = new Throttler();

		if (watchCrossWindowChanges) {
			this.changesBroadcastChannel = this._register(new BroadcastDataChannel<UriDto<IFileChange>[]>(`vscode.indexedDB.${scheme}.changes`));
			this._register(this.changesBroadcastChannel.onDidReceiveData(changes => {
				this._onDidChangeFile.fire(changes.map(c => ({ type: c.type, resource: URI.revive(c.resource) })));
			}));
		}
	}

	watch(resource: URI, opts: IWatchOptions): IDisposable {
		return Disposable.None;
	}

	async mkdir(resource: URI): Promise<void> {
		try {
			const resourceStat = await this.stat(resource);
			if (resourceStat.type === FileType.File) {
				throw ERR_FILE_NOT_DIR;
			}
		} catch (error) { /* Ignore */ }
		(await this.getFiletree()).add(resource.path, { type: 'dir' });
	}

	async stat(resource: URI): Promise<IStat> {
		const entry = (await this.getFiletree()).read(resource.path);

		if (entry?.type === FileType.File) {
			return {
				type: FileType.File,
				ctime: 0,
				mtime: this.mtimes.get(resource.toString()) || 0,
				size: entry.size ?? (await this.readFile(resource)).byteLength
			};
		}

		if (entry?.type === FileType.Directory) {
			return {
				type: FileType.Directory,
				ctime: 0,
				mtime: 0,
				size: 0
			};
		}

		throw ERR_FILE_NOT_FOUND;
	}

	async readdir(resource: URI): Promise<DirEntry[]> {
		try {
			const entry = (await this.getFiletree()).read(resource.path);
			if (!entry) {
				// Dirs aren't saved to disk, so empty dirs will be lost on reload.
				// Thus we have two options for what happens when you try to read a dir and nothing is found:
				// - Throw FileSystemProviderErrorCode.FileNotFound
				// - Return []
				// We choose to return [] as creating a dir then reading it (even after reload) should not throw an error.
				return [];
			}
			if (entry.type !== FileType.Directory) {
				throw ERR_FILE_NOT_DIR;
			}
			else {
				return [...entry.children.entries()].map(([name, node]) => [name, node.type]);
			}
		} catch (error) {
			throw error;
		}
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		try {
			const result = await this.indexedDB.runInTransaction(this.store, 'readonly', objectStore => objectStore.get(resource.path));
			if (result === undefined) {
				throw ERR_FILE_NOT_FOUND;
			}
			const buffer = result instanceof Uint8Array ? result : isString(result) ? VSBuffer.fromString(result).buffer : undefined;
			if (buffer === undefined) {
				throw ERR_UNKNOWN_INTERNAL(`IndexedDB entry at "${resource.path}" in unexpected format`);
			}

			// update cache
			const fileTree = await this.getFiletree();
			fileTree.add(resource.path, { type: 'file', size: buffer.byteLength });

			return buffer;
		} catch (error) {
			throw error;
		}
	}

	async writeFile(resource: URI, content: Uint8Array, opts: IFileWriteOptions): Promise<void> {
		try {
			const existing = await this.stat(resource).catch(() => undefined);
			if (existing?.type === FileType.Directory) {
				throw ERR_FILE_IS_DIR;
			}
			await this.bulkWrite([[resource, content]]);
		} catch (error) {
			throw error;
		}
	}

	async rename(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void> {
		const fileTree = await this.getFiletree();
		const fromEntry = fileTree.read(from.path);
		if (!fromEntry) {
			throw ERR_FILE_NOT_FOUND;
		}

		const toEntry = fileTree.read(to.path);
		if (toEntry) {
			if (!opts.overwrite) {
				throw createFileSystemProviderError('file exists already', FileSystemProviderErrorCode.FileExists);
			}
			if (toEntry.type !== fromEntry.type) {
				throw createFileSystemProviderError('Cannot rename files with different types', FileSystemProviderErrorCode.Unknown);
			}
			// delete the target file if exists
			await this.delete(to, { recursive: true, useTrash: false, atomic: false });
		}

		const toTargetResource = (path: string): URI => this.extUri.joinPath(to, this.extUri.relativePath(from, from.with({ path })) || '');

		const sourceEntries = await this.tree(from);
		const sourceFiles: DirEntry[] = [];
		for (const sourceEntry of sourceEntries) {
			if (sourceEntry[1] === FileType.File) {
				sourceFiles.push(sourceEntry);
			} else if (sourceEntry[1] === FileType.Directory) {
				// add directories to the tree
				fileTree.add(toTargetResource(sourceEntry[0]).path, { type: 'dir' });
			}
		}

		if (sourceFiles.length) {
			const targetFiles: [URI, Uint8Array][] = [];
			const sourceFilesContents = await this.indexedDB.runInTransaction(this.store, 'readonly', objectStore => sourceFiles.map(([path]) => objectStore.get(path)));
			for (let index = 0; index < sourceFiles.length; index++) {
				const content = sourceFilesContents[index] instanceof Uint8Array ? sourceFilesContents[index] : isString(sourceFilesContents[index]) ? VSBuffer.fromString(sourceFilesContents[index]).buffer : undefined;
				if (content) {
					targetFiles.push([toTargetResource(sourceFiles[index][0]), content]);
				}
			}
			await this.bulkWrite(targetFiles);
		}

		await this.delete(from, { recursive: true, useTrash: false, atomic: false });
	}

	async delete(resource: URI, opts: IFileDeleteOptions): Promise<void> {
		let stat: IStat;
		try {
			stat = await this.stat(resource);
		} catch (e) {
			if (e.code === FileSystemProviderErrorCode.FileNotFound) {
				return;
			}
			throw e;
		}

		let toDelete: string[];
		if (opts.recursive) {
			const tree = await this.tree(resource);
			toDelete = tree.map(([path]) => path);
		} else {
			if (stat.type === FileType.Directory && (await this.readdir(resource)).length) {
				throw ERR_DIR_NOT_EMPTY;
			}
			toDelete = [resource.path];
		}
		await this.deleteKeys(toDelete);
		(await this.getFiletree()).delete(resource.path);
		toDelete.forEach(key => this.mtimes.delete(key));
		this.triggerChanges(toDelete.map(path => ({ resource: resource.with({ path }), type: FileChangeType.DELETED })));
	}

	private async tree(resource: URI): Promise<DirEntry[]> {
		const stat = await this.stat(resource);
		const allEntries: DirEntry[] = [[resource.path, stat.type]];
		if (stat.type === FileType.Directory) {
			const dirEntries = await this.readdir(resource);
			for (const [key, type] of dirEntries) {
				const childResource = this.extUri.joinPath(resource, key);
				allEntries.push([childResource.path, type]);
				if (type === FileType.Directory) {
					const childEntries = await this.tree(childResource);
					allEntries.push(...childEntries);
				}
			}
		}
		return allEntries;
	}

	private triggerChanges(changes: IFileChange[]): void {
		if (changes.length) {
			this._onDidChangeFile.fire(changes);

			this.changesBroadcastChannel?.postData(changes);
		}
	}

	private getFiletree(): Promise<IndexedDBFileSystemNode> {
		if (!this.cachedFiletree) {
			this.cachedFiletree = (async () => {
				const rootNode = new IndexedDBFileSystemNode({
					children: new Map(),
					path: '',
					type: FileType.Directory
				});
				const result = await this.indexedDB.runInTransaction(this.store, 'readonly', objectStore => objectStore.getAllKeys());
				const keys = result.map(key => key.toString());
				keys.forEach(key => rootNode.add(key, { type: 'file' }));
				return rootNode;
			})();
		}
		return this.cachedFiletree;
	}

	private async bulkWrite(files: [URI, Uint8Array][]): Promise<void> {
		files.forEach(([resource, content]) => this.fileWriteBatch.push({ content, resource }));
		await this.writeManyThrottler.queue(() => this.writeMany());

		const fileTree = await this.getFiletree();
		for (const [resource, content] of files) {
			fileTree.add(resource.path, { type: 'file', size: content.byteLength });
			this.mtimes.set(resource.toString(), Date.now());
		}

		this.triggerChanges(files.map(([resource]) => ({ resource, type: FileChangeType.UPDATED })));
	}

	private fileWriteBatch: { resource: URI; content: Uint8Array }[] = [];
	private async writeMany() {
		if (this.fileWriteBatch.length) {
			const fileBatch = this.fileWriteBatch.splice(0, this.fileWriteBatch.length);
			try {
				await this.indexedDB.runInTransaction(this.store, 'readwrite', objectStore => fileBatch.map(entry => {
					return objectStore.put(entry.content, entry.resource.path);
				}));
			} catch (ex) {
				if (ex instanceof DOMException && ex.name === 'QuotaExceededError') {
					throw ERR_FILE_EXCEEDS_STORAGE_QUOTA;
				}

				throw ex;
			}
		}
	}

	private async deleteKeys(keys: string[]): Promise<void> {
		if (keys.length) {
			await this.indexedDB.runInTransaction(this.store, 'readwrite', objectStore => keys.map(key => objectStore.delete(key)));
		}
	}

	async reset(): Promise<void> {
		await this.indexedDB.runInTransaction(this.store, 'readwrite', objectStore => objectStore.clear());
	}

}
