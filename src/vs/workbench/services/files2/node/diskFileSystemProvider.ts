/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdir, open, close, read, write } from 'fs';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { IFileSystemProvider, FileSystemProviderCapabilities, IFileChange, IWatchOptions, IStat, FileType, FileDeleteOptions, FileOverwriteOptions, FileWriteOptions, FileOpenOptions, FileSystemProviderErrorCode, createFileSystemProviderError, FileSystemProviderError } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import { isLinux, isWindows } from 'vs/base/common/platform';
import { statLink, readdir, unlink, del, move, copy, readFile, writeFile, fileExists, truncate } from 'vs/base/node/pfs';
import { normalize } from 'vs/base/common/path';
import { joinPath } from 'vs/base/common/resources';
import { isEqual } from 'vs/base/common/extpath';
import { retry } from 'vs/base/common/async';
import { ILogService } from 'vs/platform/log/common/log';

export class DiskFileSystemProvider extends Disposable implements IFileSystemProvider {

	constructor(private logService: ILogService) {
		super();
	}

	//#region File Capabilities

	onDidChangeCapabilities: Event<void> = Event.None;

	protected _capabilities: FileSystemProviderCapabilities;
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

			let type: number;
			if (isSymbolicLink) {
				type = FileType.SymbolicLink | (stat.isDirectory() ? FileType.Directory : FileType.File);
			} else {
				type = stat.isFile() ? FileType.File : stat.isDirectory() ? FileType.Directory : FileType.Unknown;
			}

			return {
				type,
				ctime: stat.ctime.getTime(),
				mtime: stat.mtime.getTime(),
				size: stat.size
			} as IStat;
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		}
	}

	async readdir(resource: URI): Promise<[string, FileType][]> {
		try {
			const children = await readdir(this.toFilePath(resource));

			const result: [string, FileType][] = [];
			for (let i = 0; i < children.length; i++) {
				const child = children[i];

				try {
					const stat = await this.stat(joinPath(resource, child));
					result.push([child, stat.type]);
				} catch (error) {
					this.logService.trace(error); // ignore errors for individual entries that can arise from permission denied
				}
			}

			return result;
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		}
	}

	//#endregion

	//#region File Reading/Writing

	async readFile(resource: URI): Promise<Uint8Array> {
		try {
			const filePath = this.toFilePath(resource);

			return await readFile(filePath);
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		}
	}

	async writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
		try {
			const filePath = this.toFilePath(resource);

			// Validate target
			const exists = await fileExists(filePath);
			if (exists && !opts.overwrite) {
				throw createFileSystemProviderError(new Error('File already exists'), FileSystemProviderErrorCode.FileExists);
			} else if (!exists && !opts.create) {
				throw createFileSystemProviderError(new Error('File does not exist'), FileSystemProviderErrorCode.FileNotFound);
			}

			if (exists && isWindows) {
				try {
					// On Windows and if the file exists, we use a different strategy of saving the file
					// by first truncating the file and then writing with r+ flag. This helps to save hidden files on Windows
					// (see https://github.com/Microsoft/vscode/issues/931) and prevent removing alternate data streams
					// (see https://github.com/Microsoft/vscode/issues/6363)
					await truncate(filePath, 0);

					// We heard from one user that fs.truncate() succeeds, but the save fails (https://github.com/Microsoft/vscode/issues/61310)
					// In that case, the file is now entirely empty and the contents are gone. This can happen if an external file watcher is
					// installed that reacts on the truncate and keeps the file busy right after. Our workaround is to retry to save after a
					// short timeout, assuming that the file is free to write then.
					await retry(() => writeFile(filePath, content, { flag: 'r+' }), 100 /* ms delay */, 3 /* retries */);
				} catch (error) {
					this.logService.trace(error);

					// we heard from users that fs.truncate() fails (https://github.com/Microsoft/vscode/issues/59561)
					// in that case we simply save the file without truncating first (same as macOS and Linux)
					await writeFile(filePath, content);
				}
			}

			// macOS/Linux: just write directly
			else {
				await writeFile(filePath, content);
			}
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		}
	}

	async open(resource: URI, opts: FileOpenOptions): Promise<number> {
		try {
			const filePath = this.toFilePath(resource);

			let flags: string;
			if (opts.create) {
				// we take this as a hint that the file is opened for writing
				// as such we use 'w' to truncate an existing or create the
				// file otherwise. we do not allow reading.
				flags = 'w';
			} else {
				// otherwise we assume the file is opened for reading
				// as such we use 'r' to neither truncate, nor create
				// the file.
				flags = 'r';
			}

			return await promisify(open)(filePath, flags);
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		}
	}

	async close(fd: number): Promise<void> {
		try {
			return await promisify(close)(fd);
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		}
	}

	async read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
		try {
			const result = await promisify(read)(fd, data, offset, length, pos);
			if (typeof result === 'number') {
				return result; // node.d.ts fail
			}

			return result.bytesRead;
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		}
	}

	async write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
		try {
			const result = await promisify(write)(fd, data, offset, length, pos);
			if (typeof result === 'number') {
				return result; // node.d.ts fail
			}

			return result.bytesWritten;
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		}
	}

	//#endregion

	//#region Move/Copy/Delete/Create Folder

	async mkdir(resource: URI): Promise<void> {
		try {
			await promisify(mkdir)(this.toFilePath(resource));
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		}
	}

	async delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
		try {
			const filePath = this.toFilePath(resource);

			await this.doDelete(filePath, opts);
		} catch (error) {
			if (error.code === 'ENOENT') {
				return Promise.resolve(); // tolerate that the file might not exist
			}

			throw this.toFileSystemProviderError(error);
		}
	}

	protected async doDelete(filePath: string, opts: FileDeleteOptions): Promise<void> {
		if (opts.recursive) {
			await del(filePath, tmpdir());
		} else {
			await unlink(filePath);
		}
	}

	async rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
		try {
			const fromFilePath = this.toFilePath(from);
			const toFilePath = this.toFilePath(to);

			// Ensure target does not exist
			await this.validateTargetDeleted(from, to, opts && opts.overwrite);

			// Move
			await move(fromFilePath, toFilePath);
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		}
	}

	async copy(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
		try {
			const fromFilePath = this.toFilePath(from);
			const toFilePath = this.toFilePath(to);

			// Ensure target does not exist
			await this.validateTargetDeleted(from, to, opts && opts.overwrite);

			// Copy
			await copy(fromFilePath, toFilePath);
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		}
	}

	private async validateTargetDeleted(from: URI, to: URI, overwrite?: boolean): Promise<void> {
		const fromFilePath = this.toFilePath(from);
		const toFilePath = this.toFilePath(to);

		const isPathCaseSensitive = !!(this.capabilities & FileSystemProviderCapabilities.PathCaseSensitive);
		const isCaseChange = isPathCaseSensitive ? false : isEqual(fromFilePath, toFilePath, true /* ignore case */);

		// handle existing target (unless this is a case change)
		if (!isCaseChange && await fileExists(toFilePath)) {
			if (!overwrite) {
				throw createFileSystemProviderError(new Error('File at target already exists'), FileSystemProviderErrorCode.FileExists);
			}

			await this.delete(to, { recursive: true, useTrash: false });
		}
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

	protected toFilePath(resource: URI): string {
		return normalize(resource.fsPath);
	}

	private toFileSystemProviderError(error: NodeJS.ErrnoException): FileSystemProviderError {
		if (error instanceof FileSystemProviderError) {
			return error; // avoid double conversion
		}

		let code: FileSystemProviderErrorCode;
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
			default:
				code = FileSystemProviderErrorCode.Unknown;
		}

		return createFileSystemProviderError(error, code);
	}

	//#endregion
}