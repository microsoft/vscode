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
			request.onupgradeneeded = (e) => {
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

	mkdir(resource: URI): Promise<void> {
		return Promise.reject(new Error('Not Supported'));
	}

	rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
		return Promise.reject(new Error('Not Supported'));
	}

	readdir(resource: URI): Promise<[string, FileType][]> {
		return Promise.reject(new Error('Not Supported'));
	}

	delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
		return Promise.reject(new Error('Not Supported'));
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
			return {
				type: FileType.File,
				ctime: 0,
				mtime: 0,
				size: 0
			};
		}
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		return new Promise(async (c, e) => {
			const db = await this.database;
			const transaction = db.transaction([LOGS_OBJECT_STORE]);
			const objectStore = transaction.objectStore(LOGS_OBJECT_STORE);
			const request = objectStore.get(resource.path);
			request.onerror = () => e(request.error);
			request.onsuccess = () => {
				if (request.result) {
					c(VSBuffer.fromString(request.result).buffer);
				} else {
					e(new FileSystemError(resource, FileSystemProviderErrorCode.FileNotFound));
				}
			};
		});
	}

	writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
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

}
