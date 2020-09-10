/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IFileSystemProvider, IFileSystemProviderWithFileReadWriteCapability, FileSystemProviderCapabilities, IFileChange, IWatchOptions, IStat, FileOverwriteOptions, FileType, FileDeleteOptions, FileWriteOptions, FileChangeType, createFileSystemProviderError, FileSystemProviderErrorCode } from 'vs/platform/files/common/files';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { dirname } from 'vs/base/common/resources';
import { localize } from 'vs/nls';
import { VSBuffer } from 'vs/base/common/buffer';
import * as browser from 'vs/base/browser/browser';
import { Throttler } from 'vs/base/common/async';
import { assertIsDefined } from 'vs/base/common/types';

const INDEXEDDB_VSCODE_DB = 'vscode-web-db';
export const INDEXEDDB_USERDATA_OBJECT_STORE = 'vscode-userdata-store';
export const INDEXEDDB_LOGS_OBJECT_STORE = 'vscode-logs-store';

export class IndexedDB {

	private indexedDBPromise: Promise<IDBDatabase | null>;

	constructor() {
		console.log('using new fsp');
		this.indexedDBPromise = this.openIndexedDB(INDEXEDDB_VSCODE_DB, 2, [INDEXEDDB_USERDATA_OBJECT_STORE, INDEXEDDB_LOGS_OBJECT_STORE]);
	}

	async createFileSystemProvider(scheme: string, store: string): Promise<IFileSystemProvider | null> {
		let fsp: IFileSystemProvider | null = null;
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

type DirEntry = [string, FileType];

class IndexedDBFileSystemProvider extends Disposable implements IFileSystemProviderWithFileReadWriteCapability {
	private initRoot: Promise<void>;
	private writeManyThrottler: Throttler;
	private readManyThrottler: Throttler;
	constructor(scheme: string, private readonly database: IDBDatabase, private readonly store: string) {
		super();
		this.writeManyThrottler = new Throttler();
		this.readManyThrottler = new Throttler();

		this.initRoot = (async () => {
			try {
				await this.getValue('/', 'dir');
			} catch {
				this.setValue('/', []);
			}
		})();
	}

	readonly capabilities: FileSystemProviderCapabilities =
		FileSystemProviderCapabilities.FileReadWrite
		| FileSystemProviderCapabilities.PathCaseSensitive;
	readonly onDidChangeCapabilities: Event<void> = Event.None;

	private readonly _onDidChangeFile = this._register(new Emitter<readonly IFileChange[]>());
	readonly onDidChangeFile: Event<readonly IFileChange[]> = this._onDidChangeFile.event;

	private readonly versions: Map<string, number> = new Map<string, number>();

	watch(resource: URI, opts: IWatchOptions): IDisposable {
		return Disposable.None;
	}

	async mkdir(resource: URI): Promise<void> {
		await this.initRoot;
		const parent = dirname(resource);
		const parentContents = await this.readdir(parent);

		const existing = parentContents.find(([path]) => path === resource.path);
		if (!existing) {
			parentContents.push([resource.path, FileType.Directory]);
		}
		else if (existing[1] === FileType.File) {
			throw createFileSystemProviderError(localize('fileNotDirectory', "File is not a Directory"), FileSystemProviderErrorCode.FileNotADirectory);
		}

		this.dirWriteBatch.push({ resource: resource });
		await this.writeManyThrottler.queue(() => this.writeMany());
	}

	private readRequests: { resource: URI, type?: 'file' | 'dir' }[] = [];
	async stat(resource: URI): Promise<IStat> {
		await this.initRoot;
		const content = await this.getValue(resource.path);
		if (!content) {
			throw createFileSystemProviderError(localize('fileNotExists', "File does not exist"), FileSystemProviderErrorCode.FileNotFound);
		} else if (content instanceof Uint8Array) {
			return {
				type: FileType.File,
				ctime: 0,
				mtime: this.versions.get(resource.toString()) || 0,
				size: content.byteLength
			};
		} else if (Array.isArray(content)) {
			return {
				type: FileType.Directory,
				ctime: 0,
				mtime: 0,
				size: 0
			};
		}
		throw createFileSystemProviderError(localize('internal', "Internal error occured while reading file"), FileSystemProviderErrorCode.Unknown);
	}

	async readdir(resource: URI): Promise<DirEntry[]> {
		return this.getValue(resource.path, 'dir');
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		return this.getValue(resource.path, 'file');
	}

	async writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
		await this.initRoot;
		const parent = dirname(resource);
		const parentContents = await this.readdir(parent);

		const existing = parentContents.find(([path]) => path === resource.path);
		if (existing?.[1] === FileType.Directory) {
			throw createFileSystemProviderError(localize('fileIsDirectory', "File is Directory"), FileSystemProviderErrorCode.FileIsADirectory);
		}

		this.fileWriteBatch.push({ content, resource });
		await this.writeManyThrottler.queue(() => this.writeMany());

		this.versions.set(resource.toString(), (this.versions.get(resource.toString()) || 0) + 1);
		this._onDidChangeFile.fire([{ resource, type: FileChangeType.UPDATED }]);
	}

	async delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
		await this.initRoot;
		const hasKey = await this.hasKey(resource.path);
		if (hasKey) {
			if (opts.recursive) {
				try {
					const files = await this.readdir(resource);
					await Promise.all(files.map(([key]) => this.delete(resource.with({ path: key }), opts)));
				} catch (e) {
					if (e.code !== FileSystemProviderErrorCode.FileNotADirectory) {
						throw e;
					}
				}
			}

			await this.deleteKey(resource.path);
			this.versions.delete(resource.path);
			this._onDidChangeFile.fire([{ resource, type: FileChangeType.DELETED }]);
			return;
		}

	}

	rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
		return Promise.reject(new Error('Not Supported'));
	}

	private hasKey(key: string): Promise<boolean> {
		return new Promise<boolean>(async (c, e) => {
			const transaction = this.database.transaction([this.store]);
			const objectStore = transaction.objectStore(this.store);
			const request = objectStore.getKey(key);
			request.onerror = () => e(request.error);
			request.onsuccess = () => c(request.result !== undefined);
		});
	}

	private getValue(key: string): Promise<Uint8Array | DirEntry[] | undefined>;
	private getValue(key: string, expectType: 'dir'): Promise<DirEntry[]>;
	private getValue(key: string, expectType: 'file'): Promise<Uint8Array>;
	private getValue(key: string, expectType?: 'dir' | 'file'): Promise<Uint8Array | DirEntry[] | undefined> {
		return new Promise((c, e) => {
			const transaction = this.database.transaction([this.store]);
			const objectStore = transaction.objectStore(this.store);
			const request = objectStore.get(key);
			request.onerror = () => e(request.error);
			request.onsuccess = () => {
				if (expectType === 'file') {
					if (request.result instanceof Uint8Array) {
						c(request.result);
					} else if (typeof request.result === 'string') {
						c(VSBuffer.fromString(request.result).buffer);
					}
					else {
						if (request.result === undefined) {
							e(createFileSystemProviderError(localize('fileNotExists', "File does not exist"), FileSystemProviderErrorCode.FileNotFound));
						} else {
							e(createFileSystemProviderError(localize('fileIsDirectory', "File is Directory"), FileSystemProviderErrorCode.FileIsADirectory));
						}
					}
				} else if (expectType === 'dir') {
					if (Array.isArray(request.result)) {
						c(request.result);
					} else {
						if (request.result === undefined) {
							e(createFileSystemProviderError(localize('fileNotExists', "File does not exist"), FileSystemProviderErrorCode.FileNotFound));
						} else {
							e(createFileSystemProviderError(localize('fileNotDir', "File is not a Directory"), FileSystemProviderErrorCode.FileNotADirectory));
						}
					}
				} else {
					c(request.result);
				}
			};
		});
	}

	private async readMany(): Promise<(Uint8Array | DirEntry[] | Error)[]> {
		return new Promise<(Uint8Array | DirEntry[] | Error)[]>((c, e) => {
			const readRequests = this.readRequests;
			this.readRequests = [];

			const transaction = this.database.transaction([this.store]);
			transaction.onerror = () => e(transaction.error);
			// transaction.oncomplete = () => c(responses);
			const objectStore = transaction.objectStore(this.store);

			const responses: (Uint8Array | DirEntry[] | Error)[] = [];
			let request!: IDBRequest;
			for (let i = 0; i < readRequests.length; i++) {
				const thisRequest = objectStore.get(readRequests[i].resource.path);
				request = thisRequest;
				thisRequest.onerror = () => e(thisRequest.error);
				thisRequest.onsuccess = () => {
					if (readRequests[i].type === 'file') {
						if (thisRequest.result instanceof Uint8Array) {
							responses[i] = thisRequest.result;
						} else if (typeof thisRequest.result === 'string') {
							responses[i] = VSBuffer.fromString(thisRequest.result).buffer;
						}
						else {
							if (thisRequest.result === undefined) {
								responses[i] = createFileSystemProviderError(localize('fileNotExists', "File does not exist"), FileSystemProviderErrorCode.FileNotFound);
							} else {
								responses[i] = createFileSystemProviderError(localize('fileIsDirectory', "File is Directory"), FileSystemProviderErrorCode.FileIsADirectory);
							}
						}
					} else if (readRequests[i].type === 'dir') {
						if (Array.isArray(thisRequest.result)) {
							responses[i] = thisRequest.result as DirEntry[];
						} else {
							if (thisRequest.result === undefined) {
								responses[i] = createFileSystemProviderError(localize('fileNotExists', "File does not exist"), FileSystemProviderErrorCode.FileNotFound);
							} else {
								responses[i] = createFileSystemProviderError(localize('fileNotDir', "File is not a Directory"), FileSystemProviderErrorCode.FileNotADirectory);
							}
						}
					} else {
						responses[i] = thisRequest.result;
					}
					console.log('setting', i, readRequests[i], responses[i]);
				};
			}

			request.onsuccess = () => c(responses);
		});
	}

	private dirWriteBatch: { resource: URI }[] = [];
	private fileWriteBatch: { resource: URI, content: Uint8Array }[] = [];
	private async writeMany() {
		return new Promise((c, e) => {
			const fileBatch = this.fileWriteBatch;
			this.fileWriteBatch = [];
			const dirBatch = this.dirWriteBatch;
			this.dirWriteBatch = [];

			console.log('writing a batch of ', fileBatch.length, 'files and ', dirBatch.length, 'dirs');
			const transaction = this.database.transaction([this.store], 'readwrite');
			transaction.onerror = () => e(transaction.error);
			transaction.oncomplete = () => c();
			const objectStore = transaction.objectStore(this.store);

			// Insert directory entries
			for (const entry of dirBatch) {
				// We use add to not overwrite existing directories (mkdir is idempotent).
				const request = objectStore.add([], entry.resource.path);
				// This means it might throw EEXIST errors, which we can safely swallow.
				request.onerror = (error) => {
					console.warn('error adding directory entry:', request.error);
					error.preventDefault();
					error.stopPropagation();
				};
			}

			// Insert/Update file entries
			for (const entry of fileBatch) {
				const request = objectStore.put(entry.content, entry.resource.path);
				request.onerror = () => e(request.error);
			}

			// Compute directory entry updates
			const directoryUpdates: Map<string, { additions: DirEntry[] }> = new Map();
			for (const entry of dirBatch) {
				const parent = dirname(entry.resource).path;
				if (!directoryUpdates.has(parent)) {
					directoryUpdates.set(parent, { additions: [] });
				}
				assertIsDefined(directoryUpdates.get(parent)).additions.push([entry.resource.path, FileType.Directory]);
			}
			for (const entry of fileBatch) {
				const parent = dirname(entry.resource).path;
				if (!directoryUpdates.has(parent)) {
					directoryUpdates.set(parent, { additions: [] });
				}
				assertIsDefined(directoryUpdates.get(parent)).additions.push([entry.resource.path, FileType.File]);
			}

			// Update the directory entries
			directoryUpdates.forEach((update, dir) => {
				const initialContentsRequest = objectStore.get(dir);
				initialContentsRequest.onerror = () => e(initialContentsRequest.error);
				initialContentsRequest.onsuccess = () => {
					const entry: DirEntry[] = initialContentsRequest.result;
					for (const addition of update.additions) {
						if (!entry.find((entry) => entry[0] === addition[0])) {
							entry.push(addition);
						}
					}
					const updateRequest = objectStore.put(entry, dir);
					updateRequest.onerror = () => e(updateRequest.error);
				};
			});
		});
	}

	private setValue(key: string, value: Uint8Array | DirEntry[]): Promise<void> {
		return new Promise(async (c, e) => {
			const transaction = this.database.transaction([this.store], 'readwrite');
			const objectStore = transaction.objectStore(this.store);
			const request = objectStore.put(value, key);
			request.onerror = () => e(request.error);
			request.onsuccess = () => c();
		});
	}

	protected deleteKey(key: string): Promise<void> {
		return new Promise(async (c, e) => {
			const transaction = this.database.transaction([this.store], 'readwrite');
			const objectStore = transaction.objectStore(this.store);
			const request = objectStore.delete(key);
			request.onerror = () => e(request.error);
			request.onsuccess = () => c();
		});
	}
}
