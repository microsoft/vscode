/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IFileSystemProviderWithFileReadWriteCapability, FileSystemProviderCapabilities, IFileChange, IWatchOptions, IStat, FileOverwriteOptions, FileType, FileDeleteOptions, FileWriteOptions, FileChangeType, createFileSystemProviderError, FileSystemProviderErrorCode } from 'vs/platform/files/common/files';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { VSBuffer } from 'vs/base/common/buffer';
import { Throttler } from 'vs/base/common/async';
import { localize } from 'vs/nls';
import * as browser from 'vs/base/browser/browser';
import { joinPath } from 'vs/base/common/resources';

const INDEXEDDB_VSCODE_DB = 'vscode-web-db';
export const INDEXEDDB_USERDATA_OBJECT_STORE = 'vscode-userdata-store';
export const INDEXEDDB_LOGS_OBJECT_STORE = 'vscode-logs-store';

export class IndexedDB {

	private indexedDBPromise: Promise<IDBDatabase | null>;

	constructor() {
		this.indexedDBPromise = this.openIndexedDB(INDEXEDDB_VSCODE_DB, 2, [INDEXEDDB_USERDATA_OBJECT_STORE, INDEXEDDB_LOGS_OBJECT_STORE]);
	}

	async createFileSystemProvider(scheme: string, store: string): Promise<IIndexedDBFileSystemProvider | null> {
		let fsp: IIndexedDBFileSystemProvider | null = null;
		const indexedDB = await this.indexedDBPromise;
		if (indexedDB) {
			if (indexedDB.objectStoreNames.contains(store)) {
				fsp = new IndexedDBFileSystemProvider(scheme, indexedDB, store);
			} else {
				console.error(`Error while creating indexedDB filesystem provider. Could not find ${store} object store`);
			}
		}
		return fsp;
	}

	private openIndexedDB(name: string, version: number, stores: string[]): Promise<IDBDatabase | null> {
		if (browser.isEdge) {
			return Promise.resolve(null);
		}
		return new Promise((c, e) => {
			const request = window.indexedDB.open(name, version);
			request.onerror = (err) => e(request.error);
			request.onsuccess = () => {
				const db = request.result;
				for (const store of stores) {
					if (!db.objectStoreNames.contains(store)) {
						console.error(`Error while creating indexedDB. Could not create ${store} object store`);
						c(null);
						return;
					}
				}
				c(db);
			};
			request.onupgradeneeded = () => {
				const db = request.result;
				for (const store of stores) {
					if (!db.objectStoreNames.contains(store)) {
						db.createObjectStore(store);
					}
				}
			};
		});
	}

}

export interface IIndexedDBFileSystemProvider extends Disposable, IFileSystemProviderWithFileReadWriteCapability {
	reset(): Promise<void>;
}

type DirEntry = [string, FileType];
type fsnode =
	| {
		path: string,
		type: FileType.Directory,
		parent: fsnode | undefined,
		children: Map<string, fsnode>,
	}
	| {
		path: string,
		type: FileType.File,
		parent: fsnode | undefined,
		size: number | undefined,
	};

const printSuperBlock = (block: fsnode, indentation = '') => {
	console.log(indentation + block.path);
	if (block.type === FileType.Directory) {
		block.children.forEach(child => printSuperBlock(child, indentation + ' '));
	}
};

const readFromSuperblock = (block: fsnode, path: string) => {
	const doReadFromSuperblock = (block: fsnode, pathParts: string[]): fsnode | undefined => {
		if (pathParts.length === 0) { return block; }
		if (block.type !== FileType.Directory) {
			throw new Error('Internal error reading from superblock -- expected directory at ' + block.path);
		}
		const next = block.children.get(pathParts[0]);

		if (!next) { return undefined; }
		return doReadFromSuperblock(next, pathParts.slice(1));
	};
	return doReadFromSuperblock(block, path.split('/').filter(p => p.length));
};

const deleteFromSuperblock = (block: fsnode, path: string) => {
	const doDeleteFromSuperblock = (block: fsnode, pathParts: string[]) => {
		if (pathParts.length === 0) { throw new Error(`Internal error deleting from superblock -- got no deletion path parts (encountered while deleting ${path})`); }
		else if (block.type !== FileType.Directory) {
			throw new Error('Internal error reading from superblock -- expected directory at ' + block.path);
		}
		else if (pathParts.length === 1) {
			block.children.delete(pathParts[0]);
		}
		else {
			const next = block.children.get(pathParts[0]);
			if (!next) {
				throw new Error('Internal error reading from superblock -- expected entry at ' + block.path + '/' + next);
			}
			doDeleteFromSuperblock(next, pathParts.slice(1));
		}
	};

	const toDelete = path.split('/').filter(p => p.length);
	if (toDelete.length === 0) {
		if (block.type !== FileType.Directory) {
			throw new Error(`Internal error deleting from superblock. Expected root entry to be directory`);
		}
		block.children.clear();
	} else {
		return doDeleteFromSuperblock(block, path.split('/').filter(p => p.length));
	}
};

const addEntryToSuperblock = (block: fsnode, path: string, entry: { type: 'file', size?: number } | { type: 'dir' }) => {
	const doAddEntryToSuperblock = (block: fsnode, pathParts: string[]) => {
		if (pathParts.length === 0) {
			throw new Error(`Internal error creating superblock -- adding empty path (encountered while adding ${path})`);
		}

		if (block.type !== FileType.Directory) {
			throw new Error(`Internal error creating superblock -- parent is not a directory (encountered while adding ${path})`);
		}

		if (pathParts.length === 1) {
			const next = pathParts[0];
			const existing = block.children.get(next);
			if (entry.type === 'dir') {
				if (existing?.type === FileType.File) {
					throw new Error(`Internal error creating superblock -- overwriting file with directory: ${block.path}/${next} (encountered while adding ${path})`);
				}
				block.children.set(next, existing ?? {
					type: FileType.Directory,
					path: block.path + '/' + next,
					parent: block,
					children: new Map(),
				});
			} else {
				if (existing?.type === FileType.Directory) {
					throw new Error(`Internal error creating superblock -- overwriting directory with file: ${block.path}/${next} (encountered while adding ${path})`);
				}
				block.children.set(next, {
					type: FileType.File,
					path: block.path + '/' + next,
					parent: block,
					size: entry.size,
				});
			}
		}

		else if (pathParts.length > 1) {
			const next = pathParts[0];
			let childNode = block.children.get(next);
			if (!childNode) {
				childNode = {
					children: new Map(),
					parent: block,
					path: block.path + '/' + next,
					type: FileType.Directory
				};
				block.children.set(next, childNode);
			}
			else if (childNode.type === FileType.File) {
				throw new Error(`Internal error creating superblock -- overwriting file entry with directory: ${block.path}/${next} (encountered while adding ${path})`);
			}
			doAddEntryToSuperblock(childNode, pathParts.slice(1));
		}
	};
	doAddEntryToSuperblock(block, path.split('/').filter(p => p.length));
};


class IndexedDBFileSystemProvider extends Disposable implements IIndexedDBFileSystemProvider {

	readonly capabilities: FileSystemProviderCapabilities =
		FileSystemProviderCapabilities.FileReadWrite
		| FileSystemProviderCapabilities.PathCaseSensitive;
	readonly onDidChangeCapabilities: Event<void> = Event.None;

	private readonly _onDidChangeFile = this._register(new Emitter<readonly IFileChange[]>());
	readonly onDidChangeFile: Event<readonly IFileChange[]> = this._onDidChangeFile.event;

	private readonly versions: Map<string, number> = new Map<string, number>();

	private superblock: Promise<fsnode>;
	private writeManyThrottler: Throttler;

	constructor(scheme: string, private readonly database: IDBDatabase, private readonly store: string) {
		super();
		this.writeManyThrottler = new Throttler();
		this.superblock = this.getSuperblock();
	}

	watch(resource: URI, opts: IWatchOptions): IDisposable {
		return Disposable.None;
	}

	async mkdir(resource: URI): Promise<void> {
		try {
			const resourceStat = await this.stat(resource);
			if (resourceStat.type === FileType.File) {
				throw createFileSystemProviderError(localize('fileNotDirectory', "File is not a directory"), FileSystemProviderErrorCode.FileNotADirectory);
			}
		} catch (error) { /* Ignore */ }
		addEntryToSuperblock(await this.superblock, resource.path, { type: 'dir' });
	}

	async stat(resource: URI): Promise<IStat> {
		const content = readFromSuperblock(await this.superblock, resource.path);
		if (content?.type === FileType.File) {
			return {
				type: FileType.File,
				ctime: 0,
				mtime: this.versions.get(resource.toString()) || 0,
				size: content.size ?? (await this.readFile(resource)).byteLength
			};
		} else if (content?.type === FileType.Directory) {
			return {
				type: FileType.Directory,
				ctime: 0,
				mtime: 0,
				size: 0
			};
		}
		else {
			throw createFileSystemProviderError(localize('fileNotExists', "File does not exist"), FileSystemProviderErrorCode.FileNotFound);
		}
	}

	async readdir(resource: URI): Promise<DirEntry[]> {
		const entry = readFromSuperblock(await this.superblock, resource.path);
		if (!entry) {
			// Dirs aren't saved to disk, so empty dirs will be lost on reload.
			// Thus we have two options for what ahappens when you try to read a dir and nothing is found:
			// - Throw FileSystemProviderErrorCode.FileNotFound
			// - Return []
			// We choose to return [] as creating a dir then reading it (even after reload) should not throw an error.
			return [];
		}
		if (entry.type !== FileType.Directory) {
			throw createFileSystemProviderError(localize('fileNotDir', "File is not a Directory"), FileSystemProviderErrorCode.FileNotADirectory);
		}
		else {
			return [...entry.children.entries()].map(([name, node]) => [name, node.type]);
		}
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		const read = new Promise<Uint8Array>((c, e) => {
			const transaction = this.database.transaction([this.store]);
			const objectStore = transaction.objectStore(this.store);
			const request = objectStore.get(resource.path);
			request.onerror = () => e(request.error);
			request.onsuccess = () => {
				if (request.result instanceof Uint8Array) {
					c(request.result);
				} else if (typeof request.result === 'string') {
					c(VSBuffer.fromString(request.result).buffer);
				}
				else {
					if (request.result === undefined) {
						e(createFileSystemProviderError(localize('fileNotExists', "File does not exist"), FileSystemProviderErrorCode.FileNotFound));
					} else {
						throw createFileSystemProviderError(localize('internal', "Internal error occured while reading file"), FileSystemProviderErrorCode.Unknown);
					}
				}
			};
		});
		read.then(async buffer => addEntryToSuperblock(await this.superblock, resource.path, { type: 'file', size: buffer.byteLength }), () => { });
		return read;
	}

	async writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
		try {
			const existing = await this.stat(resource);
			if (existing.type === FileType.Directory) {
				throw createFileSystemProviderError(localize('fileIsDirectory', "File is Directory"), FileSystemProviderErrorCode.FileIsADirectory);
			}
		} catch { }

		this.fileWriteBatch.push({ content, resource });
		await this.writeManyThrottler.queue(() => this.writeMany());
		addEntryToSuperblock(await this.superblock, resource.path, { type: 'file', size: content.byteLength });
		this.versions.set(resource.toString(), (this.versions.get(resource.toString()) || 0) + 1);
		this._onDidChangeFile.fire([{ resource, type: FileChangeType.UPDATED }]);
	}

	async delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
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
			const tree = (await this.tree(resource));
			toDelete = tree.map(([path]) => path);
		} else {
			if (stat.type === FileType.Directory && (await this.readdir(resource)).length) {
				throw createFileSystemProviderError(localize('dirIsNotEmpty', "Directory is not empty"), FileSystemProviderErrorCode.Unknown);
			}
			toDelete = [resource.path];
		}
		await this.deleteKeys(toDelete);
		deleteFromSuperblock(await this.superblock, resource.path);
		toDelete.forEach(key => this.versions.delete(key));
		this._onDidChangeFile.fire(toDelete.map(path => ({ resource: resource.with({ path }), type: FileChangeType.DELETED })));
	}

	private async tree(resource: URI): Promise<DirEntry[]> {
		if ((await this.stat(resource)).type === FileType.Directory) {
			let items = (await this.readdir(resource)).map(([key, type]) => {
				return [joinPath(resource, key).path, type] as [string, FileType];
			});
			await Promise.all(items.map(
				async ([key, type]) => {
					if (type === FileType.Directory) {
						const childEntries = (await this.tree(resource.with({ path: key })));
						items = items.concat(childEntries);
					}
				}));
			return items;
		} else {
			const items: DirEntry[] = [[resource.path, FileType.File]];
			return items;
		}
	}

	rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
		return Promise.reject(new Error('Not Supported'));
	}

	private getSuperblock(): Promise<fsnode> {
		return new Promise((c, e) => {
			const transaction = this.database.transaction([this.store]);
			const objectStore = transaction.objectStore(this.store);
			const request = objectStore.getAllKeys();
			request.onerror = () => e(request.error);
			request.onsuccess = () => {
				const superblock: fsnode = {
					children: new Map(),
					parent: undefined,
					path: '',
					type: FileType.Directory
				};
				const keys = request.result.map(key => key.toString());
				keys.forEach(key => addEntryToSuperblock(superblock, key, { type: 'file' }));

				c(superblock);
			};
		});
	}

	private fileWriteBatch: { resource: URI, content: Uint8Array }[] = [];
	private async writeMany() {
		return new Promise<void>((c, e) => {
			const fileBatch = this.fileWriteBatch;
			this.fileWriteBatch = [];
			if (fileBatch.length === 0) { return c(); }

			const transaction = this.database.transaction([this.store], 'readwrite');
			transaction.onerror = () => e(transaction.error);
			const objectStore = transaction.objectStore(this.store);
			let request: IDBRequest = undefined!;
			for (const entry of fileBatch) {
				request = objectStore.put(entry.content, entry.resource.path);
			}
			request.onsuccess = () => c();
		});
	}

	private deleteKeys(keys: string[]): Promise<void> {
		return new Promise(async (c, e) => {
			if (keys.length === 0) { return c(); }
			const transaction = this.database.transaction([this.store], 'readwrite');
			transaction.onerror = () => e(transaction.error);
			const objectStore = transaction.objectStore(this.store);
			let request: IDBRequest = undefined!;
			for (const key of keys) {
				request = objectStore.delete(key);
			}

			request.onsuccess = () => c();
		});
	}

	reset(): Promise<void> {
		return new Promise(async (c, e) => {
			const transaction = this.database.transaction([this.store], 'readwrite');
			const objectStore = transaction.objectStore(this.store);
			const request = objectStore.clear();
			request.onerror = () => e(request.error);
			request.onsuccess = () => c();
		});
	}
}
