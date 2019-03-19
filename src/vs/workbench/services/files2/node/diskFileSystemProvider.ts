/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdir } from 'fs';
import { promisify } from 'util';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { IFileSystemProvider, FileSystemProviderCapabilities, IFileChange, IWatchOptions, IStat, FileType, FileDeleteOptions, FileOverwriteOptions, FileWriteOptions, FileOpenOptions, FileSystemProviderErrorCode, createFileSystemProviderError, FileSystemProviderError } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import { isLinux } from 'vs/base/common/platform';
import { statLink } from 'vs/base/node/pfs';
import { normalize } from 'vs/base/common/path';

export class DiskFileSystemProvider extends Disposable implements IFileSystemProvider {

	//#region File Capabilities

	onDidChangeCapabilities: Event<void> = Event.None;

	private _capabilities: FileSystemProviderCapabilities;
	get capabilities(): FileSystemProviderCapabilities {
		if (!this._capabilities) {
			this._capabilities =
				FileSystemProviderCapabilities.FileReadWrite |
				FileSystemProviderCapabilities.FileOpenReadWriteClose |
				FileSystemProviderCapabilities.FileFolderCopy;

			if (isLinux) {
				this._capabilities |= FileSystemProviderCapabilities.PathCaseSensitive;
			}
		}

		return this._capabilities;
	}

	//#endregion

	//#region File Metadata Resolving

	async stat(resource: URI): Promise<IStat> {
		try {
			const { stat, isSymbolicLink } = await statLink(this.toFilePath(resource)); // cannot use fs.stat() here to support links properly

			return {
				type: isSymbolicLink ? FileType.SymbolicLink : stat.isFile() ? FileType.File : stat.isDirectory() ? FileType.Directory : FileType.Unknown,
				ctime: stat.ctime.getTime(),
				mtime: stat.mtime.getTime(),
				size: stat.size
			} as IStat;
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		}
	}

	readdir(resource: URI): Promise<[string, FileType][]> {
		throw new Error('Method not implemented.');
	}

	//#endregion

	//#region File Reading/Writing

	readFile(resource: URI): Promise<Uint8Array> {
		throw new Error('Method not implemented.');
	}

	writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
		throw new Error('Method not implemented.');
	}

	open(resource: URI, opts: FileOpenOptions): Promise<number> {
		throw new Error('Method not implemented.');
	}

	close(fd: number): Promise<void> {
		throw new Error('Method not implemented.');
	}

	read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
		throw new Error('Method not implemented.');
	}

	write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
		throw new Error('Method not implemented.');
	}

	//#endregion

	//#region Move/Copy/Delete/Create Folder

	mkdir(resource: URI): Promise<void> {
		return promisify(mkdir)(resource.fsPath);
	}

	delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
		throw new Error('Method not implemented.');
	}

	rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
		throw new Error('Method not implemented.');
	}

	copy?(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
		throw new Error('Method not implemented.');
	}

	//#endregion

	//#region File Watching

	private _onDidChangeFile: Emitter<IFileChange[]> = this._register(new Emitter<IFileChange[]>());
	get onDidChangeFile(): Event<IFileChange[]> { return this._onDidChangeFile.event; }

	watch(resource: URI, opts: IWatchOptions): IDisposable {
		throw new Error('Method not implemented.');
	}

	//#endregion

	//#region Helpers

	private toFilePath(resource: URI): string {
		return normalize(resource.fsPath);
	}

	private toFileSystemProviderError(error: NodeJS.ErrnoException): FileSystemProviderError {
		let code: FileSystemProviderErrorCode | undefined = undefined;
		switch (error.code) {
			case 'ENOENT':
				code = FileSystemProviderErrorCode.FileNotFound;
				break;
			case 'EISDIR':
				code = FileSystemProviderErrorCode.FileIsADirectory;
				break;
			case 'EEXIST':
				code = FileSystemProviderErrorCode.FileExists;
				break;
			case 'EPERM':
			case 'EACCESS':
				code = FileSystemProviderErrorCode.NoPermissions;
				break;
		}

		return createFileSystemProviderError(error, code);
	}

	//#endregion
}