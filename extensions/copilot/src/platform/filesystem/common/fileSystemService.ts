/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { FileStat, FileSystem, FileSystemWatcher, RelativePattern, Uri } from 'vscode';
import { LRUCache } from '../../../util/common/cache';
import { createServiceIdentifier } from '../../../util/common/services';
import { FileType } from './fileTypes';

export const IFileSystemService = createServiceIdentifier<IFileSystemService>('IFileSystemService');

export interface IFileSystemService extends FileSystem {

	readonly _serviceBrand: undefined;

	stat(uri: Uri): Promise<FileStat>;
	readDirectory(uri: Uri): Promise<[string, FileType][]>;
	createDirectory(uri: Uri): Promise<void>;

	/**
	 * @param uri
	 * @param disableLimit Disable the {@link FS_READ_MAX_FILE_SIZE} limit and potentially crash the EH. USE THIS WITH CAUTION!
	 */
	readFile(uri: Uri, disableLimit?: boolean): Promise<Uint8Array>;
	writeFile(uri: Uri, content: Uint8Array): Promise<void>;
	delete(uri: Uri, options?: { recursive?: boolean; useTrash?: boolean }): Promise<void>;
	rename(oldURI: Uri, newURI: Uri, options?: { overwrite?: boolean }): Promise<void>;
	copy(source: Uri, destination: Uri, options?: { overwrite?: boolean }): Promise<void>;
	isWritableFileSystem(scheme: string): boolean | undefined;

	createFileSystemWatcher(glob: string | RelativePattern): FileSystemWatcher;
}

/**
 * This is here to allow us to reuse the same readFile/JSON.parse across multiple invocations during simulations.
 * This is disabled in production.
 */
export const fileSystemServiceReadAsJSON = new class {
	private _cache: LRUCache<any> | null = null;

	enable(): void {
		this._cache = new LRUCache<any>(10);
	}

	public async readJSON<T>(fileSystemService: IFileSystemService, uri: Uri): Promise<T> {
		if (!this._cache) {
			return this._readJSON<T>(fileSystemService, uri);
		}
		const cachedValue = this._cache.get(uri.toString());
		if (cachedValue !== undefined) {
			return cachedValue;
		}
		const value = await this._readJSON<T>(fileSystemService, uri);
		this._cache.put(uri.toString(), value);
		return value;
	}

	private async _readJSON<T>(fileSystemService: IFileSystemService, uri: Uri): Promise<T> {
		const buffer = await fileSystemService.readFile(uri, true);
		return JSON.parse(buffer.toString()) as T;
	}
}();


export const FS_READ_MAX_FILE_SIZE = 1024 * 1024 * 5; // 5 MB

export async function assertReadFileSizeLimit(fileSystemService: IFileSystemService, uri: Uri, onlyWarn?: boolean) {
	const stat = await fileSystemService.stat(uri);
	if (stat.size > FS_READ_MAX_FILE_SIZE) {
		if (!onlyWarn) {
			const message = `[FileSystemService] ${uri.toString()} EXCEEDS max file size. FAILED to read ${Math.round(stat.size / (1024 * 1024))}MB > ${Math.round(FS_READ_MAX_FILE_SIZE / (1024 * 1024))}MB`;
			throw new Error(message);
		} else {
			const message = `[FileSystemService] ${uri.toString()} is a LARGE file (${Math.round(stat.size / (1024 * 1024))}MB > ${Math.round(FS_READ_MAX_FILE_SIZE / (1024 * 1024))}MB)`;
			console.warn(message);
		}
	}
}

export async function createDirectoryIfNotExists(fileSystemService: IFileSystemService, uri: Uri): Promise<void> {
	try {
		const exists = await fileSystemService.stat(uri).then(() => true).catch(() => false);
		if (exists) {
			return;
		}
		await fileSystemService.createDirectory(uri);
	} catch (err) {
		// Possibly created by another asyn operation. Check again.
		const exists = await fileSystemService.stat(uri).then(() => true).catch(() => false);
		if (exists) {
			return;
		}
		throw err;
	}
}
