/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IFileSystemProviderWithFileReadWriteCapability, FileSystemProviderCapabilities, IFileChange, IWatchOptions, IStat, FileOverwriteOptions, FileType, FileDeleteOptions, FileWriteOptions, FileChangeType, FileSystemProviderErrorCode } from 'vs/platform/files/common/files';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { VSBuffer } from 'vs/base/common/buffer';
import { FileSystemError } from 'vs/workbench/api/common/extHostTypes';
import { isEqualOrParent, joinPath, relativePath } from 'vs/base/common/resources';

const LOGS_OBJECT_STORE = 'logs';
export const INDEXEDDB_LOG_SCHEME = 'vscode-logs-indexedbd';

export class IndexedDBLogProvider extends Disposable implements IFileSystemProviderWithFileReadWriteCapability {

	readonly capabilities: FileSystemProviderCapabilities = FileSystemProviderCapabilities.FileReadWrite;
	readonly onDidChangeCapabilities: Event<void> = Event.None;

	private readonly _onDidChangeFile: Emitter<IFileChange[]> = this._register(new Emitter<IFileChange[]>());
	readonly onDidChangeFile: Event<IFileChange[]> = this._onDidChangeFile.event;

	private readonly versions: Map<string, number> = new Map<string, number>();

	private readonly database: Promise<IDBDatabase>;

	constructor(
	) {
		super();
		this.database = this.openDatabase(2);
	}

	private openDatabase(version: number): Promise<IDBDatabase> {
		return new Promise((c, e) => {
			const request = window.indexedDB.open('LoggingDatabase', version);
			request.onerror = (err) => e(request.error);
			request.onsuccess = () => {
				const db = request.result;
				if (db.objectStoreNames.contains(LOGS_OBJECT_STORE)) {
					c(db);
				}
			};
			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains(LOGS_OBJECT_STORE)) {
					db.createObjectStore(LOGS_OBJECT_STORE);
				}
				c(db);
			};
		});
	}

	watch(resource: URI, opts: IWatchOptions): IDisposable {
		return Disposable.None;
	}

	async mkdir(resource: URI): Promise<void> {
	}

	async stat(resource: URI): Promise<IStat> {
		try {
			const content = await this.readFile(resource);
			return {
				type: FileType.File,
				ctime: 0,
				mtime: this.versions.get(resource.toString()) || 0,
				size: content.byteLength
			};
		} catch (e) {
		}
		const files = await this.readdir(resource);
		if (files.length) {
			return {
				type: FileType.Directory,
				ctime: 0,
				mtime: 0,
				size: 0
			};
		}
		return Promise.reject(new FileSystemError(resource, FileSystemProviderErrorCode.FileNotFound));
	}

	async readdir(resource: URI): Promise<[string, FileType][]> {
		const hasKey = await this.hasKey(resource.path);
		if (hasKey) {
			return Promise.reject(new FileSystemError(resource, FileSystemProviderErrorCode.FileNotADirectory));
		}
		return new Promise(async (c, e) => {
			const db = await this.database;
			const transaction = db.transaction([LOGS_OBJECT_STORE]);
			const objectStore = transaction.objectStore(LOGS_OBJECT_STORE);
			const request = objectStore.getAllKeys();
			request.onerror = () => e(request.error);
			request.onsuccess = () => {
				const files: [string, FileType][] = [];
				for (const key of <string[]>request.result) {
					const keyResource = this.toResource(key);
					if (isEqualOrParent(keyResource, resource, false)) {
						const path = relativePath(resource, keyResource, false);
						if (path) {
							const keySegments = path.split('/');
							files.push([keySegments[0], keySegments.length === 1 ? FileType.File : FileType.Directory]);
						}
					}
				}
				c(files);
			};
		});
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		const hasKey = await this.hasKey(resource.path);
		if (!hasKey) {
			return Promise.reject(new FileSystemError(resource, FileSystemProviderErrorCode.FileNotFound));
		}
		return new Promise(async (c, e) => {
			const db = await this.database;
			const transaction = db.transaction([LOGS_OBJECT_STORE]);
			const objectStore = transaction.objectStore(LOGS_OBJECT_STORE);
			const request = objectStore.get(resource.path);
			request.onerror = () => e(request.error);
			request.onsuccess = () => c(VSBuffer.fromString(request.result || '').buffer);
		});
	}

	async writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
		const hasKey = await this.hasKey(resource.path);
		if (!hasKey) {
			const files = await this.readdir(resource);
			if (files.length) {
				return Promise.reject(new FileSystemError(resource, FileSystemProviderErrorCode.FileIsADirectory));
			}
		}
		return new Promise(async (c, e) => {
			const db = await this.database;
			const transaction = db.transaction([LOGS_OBJECT_STORE], 'readwrite');
			const objectStore = transaction.objectStore(LOGS_OBJECT_STORE);
			const request = objectStore.put(VSBuffer.wrap(content).toString(), resource.path);
			request.onerror = () => e(request.error);
			request.onsuccess = () => {
				this.versions.set(resource.toString(), (this.versions.get(resource.toString()) || 0) + 1);
				this._onDidChangeFile.fire([{ resource, type: FileChangeType.UPDATED }]);
				c();
			};
		});
	}

	async delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
		const hasKey = await this.hasKey(resource.path);
		if (hasKey) {
			await this.deleteKey(resource.path);
			return;
		}

		if (opts.recursive) {
			const files = await this.readdir(resource);
			await Promise.all(files.map(([key]) => this.delete(joinPath(resource, key), opts)));
		}
	}

	rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
		return Promise.reject(new Error('Not Supported'));
	}

	private hasKey(key: string): Promise<boolean> {
		return new Promise<boolean>(async (c, e) => {
			const db = await this.database;
			const transaction = db.transaction([LOGS_OBJECT_STORE]);
			const objectStore = transaction.objectStore(LOGS_OBJECT_STORE);
			const request = objectStore.getKey(key);
			request.onerror = () => e(request.error);
			request.onsuccess = () => {
				c(!!request.result);
			};
		});
	}

	private deleteKey(key: string): Promise<void> {
		return new Promise(async (c, e) => {
			const db = await this.database;
			const transaction = db.transaction([LOGS_OBJECT_STORE], 'readwrite');
			const objectStore = transaction.objectStore(LOGS_OBJECT_STORE);
			const request = objectStore.delete(key);
			request.onerror = () => e(request.error);
			request.onsuccess = () => {
				this.versions.delete(key);
				this._onDidChangeFile.fire([{ resource: this.toResource(key), type: FileChangeType.DELETED }]);
				c();
			};
		});
	}

	private toResource(key: string): URI {
		return URI.file(key).with({ scheme: INDEXEDDB_LOG_SCHEME });
	}
}
