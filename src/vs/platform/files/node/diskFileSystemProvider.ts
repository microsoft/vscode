/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { gracefulify } from 'graceful-fs';
import { retry } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { isEqual } from 'vs/base/common/extpath';
import { IDisposable } from 'vs/base/common/lifecycle';
import { basename, dirname } from 'vs/base/common/path';
import { isLinux, isWindows } from 'vs/base/common/platform';
import { joinPath } from 'vs/base/common/resources';
import { newWriteableStream, ReadableStreamEvents } from 'vs/base/common/stream';
import { URI } from 'vs/base/common/uri';
import { IDirent, Promises, RimRafMode, SymlinkSupport } from 'vs/base/node/pfs';
import { localize } from 'vs/nls';
import { createFileSystemProviderError, FileDeleteOptions, FileOpenOptions, FileOverwriteOptions, FileReadStreamOptions, FileSystemProviderCapabilities, FileSystemProviderError, FileSystemProviderErrorCode, FileType, FileWriteOptions, IFileSystemProviderWithFileFolderCopyCapability, IFileSystemProviderWithFileReadStreamCapability, IFileSystemProviderWithFileReadWriteCapability, IFileSystemProviderWithOpenReadWriteCloseCapability, isFileOpenForWriteOptions, IStat } from 'vs/platform/files/common/files';
import { readFileIntoStream } from 'vs/platform/files/common/io';
import { FileWatcher as NodeJSWatcherService } from 'vs/platform/files/node/watcher/nodejs/watcherService';
import { FileWatcher as NsfwWatcherService } from 'vs/platform/files/node/watcher/nsfw/watcherService';
import { FileWatcher as ParcelWatcherService } from 'vs/platform/files/node/watcher/parcel/watcherService';
import { FileWatcher as UnixWatcherService } from 'vs/platform/files/node/watcher/unix/watcherService';
import { IDiskFileChange, ILogMessage, IWatchRequest, WatcherService } from 'vs/platform/files/common/watcher';
import { ILogService } from 'vs/platform/log/common/log';
import product from 'vs/platform/product/common/product';
import { AbstractDiskFileSystemProvider } from 'vs/platform/files/common/diskFileSystemProvider';
import { toErrorMessage } from 'vs/base/common/errorMessage';

/**
 * Enable graceful-fs very early from here to have it enabled
 * in all contexts that leverage the disk file system provider.
 */
(() => {
	try {
		gracefulify(fs);
	} catch (error) {
		console.error(`Error enabling graceful-fs: ${toErrorMessage(error)}`);
	}
})();

export interface IWatcherOptions {

	/**
	 * If `true`, will enable polling for all watchers, otherwise
	 * will enable it for paths included in the string array.
	 *
	 * @deprecated TODO@bpasero TODO@aeschli remove me once WSL1
	 * support ends.
	 */
	usePolling: boolean | string[];

	/**
	 * If polling is enabled (via `usePolling`), defines the duration
	 * in which the watcher will poll for changes.
	 *
	 * @deprecated TODO@bpasero TODO@aeschli remove me once WSL1
	 * support ends.
	 */
	pollingInterval?: number;
}

export interface IDiskFileSystemProviderOptions {
	watcher?: IWatcherOptions;
	legacyWatcher?: string;
}

export class DiskFileSystemProvider extends AbstractDiskFileSystemProvider implements
	IFileSystemProviderWithFileReadWriteCapability,
	IFileSystemProviderWithOpenReadWriteCloseCapability,
	IFileSystemProviderWithFileReadStreamCapability,
	IFileSystemProviderWithFileFolderCopyCapability {

	constructor(
		logService: ILogService,
		private readonly options?: IDiskFileSystemProviderOptions
	) {
		super(logService);
	}

	//#region File Capabilities

	readonly onDidChangeCapabilities: Event<void> = Event.None;

	protected _capabilities: FileSystemProviderCapabilities | undefined;
	get capabilities(): FileSystemProviderCapabilities {
		if (!this._capabilities) {
			this._capabilities =
				FileSystemProviderCapabilities.FileReadWrite |
				FileSystemProviderCapabilities.FileOpenReadWriteClose |
				FileSystemProviderCapabilities.FileReadStream |
				FileSystemProviderCapabilities.FileFolderCopy |
				FileSystemProviderCapabilities.FileWriteUnlock;

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
			const { stat, symbolicLink } = await SymlinkSupport.stat(this.toFilePath(resource)); // cannot use fs.stat() here to support links properly

			return {
				type: this.toType(stat, symbolicLink),
				ctime: stat.birthtime.getTime(), // intentionally not using ctime here, we want the creation time
				mtime: stat.mtime.getTime(),
				size: stat.size
			};
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		}
	}

	async readdir(resource: URI): Promise<[string, FileType][]> {
		try {
			const children = await Promises.readdir(this.toFilePath(resource), { withFileTypes: true });

			const result: [string, FileType][] = [];
			await Promise.all(children.map(async child => {
				try {
					let type: FileType;
					if (child.isSymbolicLink()) {
						type = (await this.stat(joinPath(resource, child.name))).type; // always resolve target the link points to if any
					} else {
						type = this.toType(child);
					}

					result.push([child.name, type]);
				} catch (error) {
					this.logService.trace(error); // ignore errors for individual entries that can arise from permission denied
				}
			}));

			return result;
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		}
	}

	private toType(entry: fs.Stats | IDirent, symbolicLink?: { dangling: boolean }): FileType {

		// Signal file type by checking for file / directory, except:
		// - symbolic links pointing to nonexistent files are FileType.Unknown
		// - files that are neither file nor directory are FileType.Unknown
		let type: FileType;
		if (symbolicLink?.dangling) {
			type = FileType.Unknown;
		} else if (entry.isFile()) {
			type = FileType.File;
		} else if (entry.isDirectory()) {
			type = FileType.Directory;
		} else {
			type = FileType.Unknown;
		}

		// Always signal symbolic link as file type additionally
		if (symbolicLink) {
			type |= FileType.SymbolicLink;
		}

		return type;
	}

	//#endregion

	//#region File Reading/Writing

	async readFile(resource: URI): Promise<Uint8Array> {
		try {
			const filePath = this.toFilePath(resource);

			return await Promises.readFile(filePath);
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		}
	}

	readFileStream(resource: URI, opts: FileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array> {
		const stream = newWriteableStream<Uint8Array>(data => VSBuffer.concat(data.map(data => VSBuffer.wrap(data))).buffer);

		readFileIntoStream(this, resource, stream, data => data.buffer, {
			...opts,
			bufferSize: 256 * 1024 // read into chunks of 256kb each to reduce IPC overhead
		}, token);

		return stream;
	}

	async writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
		let handle: number | undefined = undefined;
		try {
			const filePath = this.toFilePath(resource);

			// Validate target unless { create: true, overwrite: true }
			if (!opts.create || !opts.overwrite) {
				const fileExists = await Promises.exists(filePath);
				if (fileExists) {
					if (!opts.overwrite) {
						throw createFileSystemProviderError(localize('fileExists', "File already exists"), FileSystemProviderErrorCode.FileExists);
					}
				} else {
					if (!opts.create) {
						throw createFileSystemProviderError(localize('fileNotExists', "File does not exist"), FileSystemProviderErrorCode.FileNotFound);
					}
				}
			}

			// Open
			handle = await this.open(resource, { create: true, unlock: opts.unlock });

			// Write content at once
			await this.write(handle, 0, content, 0, content.byteLength);
		} catch (error) {
			throw await this.toFileSystemProviderWriteError(resource, error);
		} finally {
			if (typeof handle === 'number') {
				await this.close(handle);
			}
		}
	}

	private readonly mapHandleToPos = new Map<number, number>();

	private readonly writeHandles = new Map<number, URI>();
	private canFlush: boolean = true;

	async open(resource: URI, opts: FileOpenOptions): Promise<number> {
		try {
			const filePath = this.toFilePath(resource);

			// Determine wether to unlock the file (write only)
			if (isFileOpenForWriteOptions(opts) && opts.unlock) {
				try {
					const { stat } = await SymlinkSupport.stat(filePath);
					if (!(stat.mode & 0o200 /* File mode indicating writable by owner */)) {
						await Promises.chmod(filePath, stat.mode | 0o200);
					}
				} catch (error) {
					this.logService.trace(error); // ignore any errors here and try to just write
				}
			}

			// Determine file flags for opening (read vs write)
			let flags: string | undefined = undefined;
			if (isFileOpenForWriteOptions(opts)) {
				if (isWindows) {
					try {
						// On Windows and if the file exists, we use a different strategy of saving the file
						// by first truncating the file and then writing with r+ flag. This helps to save hidden files on Windows
						// (see https://github.com/microsoft/vscode/issues/931) and prevent removing alternate data streams
						// (see https://github.com/microsoft/vscode/issues/6363)
						await Promises.truncate(filePath, 0);

						// After a successful truncate() the flag can be set to 'r+' which will not truncate.
						flags = 'r+';
					} catch (error) {
						if (error.code !== 'ENOENT') {
							this.logService.trace(error);
						}
					}
				}

				// we take opts.create as a hint that the file is opened for writing
				// as such we use 'w' to truncate an existing or create the
				// file otherwise. we do not allow reading.
				if (!flags) {
					flags = 'w';
				}
			} else {
				// otherwise we assume the file is opened for reading
				// as such we use 'r' to neither truncate, nor create
				// the file.
				flags = 'r';
			}

			const handle = await Promises.open(filePath, flags);

			// remember this handle to track file position of the handle
			// we init the position to 0 since the file descriptor was
			// just created and the position was not moved so far (see
			// also http://man7.org/linux/man-pages/man2/open.2.html -
			// "The file offset is set to the beginning of the file.")
			this.mapHandleToPos.set(handle, 0);

			// remember that this handle was used for writing
			if (isFileOpenForWriteOptions(opts)) {
				this.writeHandles.set(handle, resource);
			}

			return handle;
		} catch (error) {
			if (isFileOpenForWriteOptions(opts)) {
				throw await this.toFileSystemProviderWriteError(resource, error);
			} else {
				throw this.toFileSystemProviderError(error);
			}
		}
	}

	async close(fd: number): Promise<void> {
		try {

			// remove this handle from map of positions
			this.mapHandleToPos.delete(fd);

			// if a handle is closed that was used for writing, ensure
			// to flush the contents to disk if possible.
			if (this.writeHandles.delete(fd) && this.canFlush) {
				try {
					await Promises.fdatasync(fd); // https://github.com/microsoft/vscode/issues/9589
				} catch (error) {
					// In some exotic setups it is well possible that node fails to sync
					// In that case we disable flushing and log the error to our logger
					this.canFlush = false;
					this.logService.error(error);
				}
			}

			return await Promises.close(fd);
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		}
	}

	async read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
		const normalizedPos = this.normalizePos(fd, pos);

		let bytesRead: number | null = null;
		try {
			const result = await Promises.read(fd, data, offset, length, normalizedPos);

			if (typeof result === 'number') {
				bytesRead = result; // node.d.ts fail
			} else {
				bytesRead = result.bytesRead;
			}

			return bytesRead;
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		} finally {
			this.updatePos(fd, normalizedPos, bytesRead);
		}
	}

	private normalizePos(fd: number, pos: number): number | null {

		// when calling fs.read/write we try to avoid passing in the "pos" argument and
		// rather prefer to pass in "null" because this avoids an extra seek(pos)
		// call that in some cases can even fail (e.g. when opening a file over FTP -
		// see https://github.com/microsoft/vscode/issues/73884).
		//
		// as such, we compare the passed in position argument with our last known
		// position for the file descriptor and use "null" if they match.
		if (pos === this.mapHandleToPos.get(fd)) {
			return null;
		}

		return pos;
	}

	private updatePos(fd: number, pos: number | null, bytesLength: number | null): void {
		const lastKnownPos = this.mapHandleToPos.get(fd);
		if (typeof lastKnownPos === 'number') {

			// pos !== null signals that previously a position was used that is
			// not null. node.js documentation explains, that in this case
			// the internal file pointer is not moving and as such we do not move
			// our position pointer.
			//
			// Docs: "If position is null, data will be read from the current file position,
			// and the file position will be updated. If position is an integer, the file position
			// will remain unchanged."
			if (typeof pos === 'number') {
				// do not modify the position
			}

			// bytesLength = number is a signal that the read/write operation was
			// successful and as such we need to advance the position in the Map
			//
			// Docs (http://man7.org/linux/man-pages/man2/read.2.html):
			// "On files that support seeking, the read operation commences at the
			// file offset, and the file offset is incremented by the number of
			// bytes read."
			//
			// Docs (http://man7.org/linux/man-pages/man2/write.2.html):
			// "For a seekable file (i.e., one to which lseek(2) may be applied, for
			// example, a regular file) writing takes place at the file offset, and
			// the file offset is incremented by the number of bytes actually
			// written."
			else if (typeof bytesLength === 'number') {
				this.mapHandleToPos.set(fd, lastKnownPos + bytesLength);
			}

			// bytesLength = null signals an error in the read/write operation
			// and as such we drop the handle from the Map because the position
			// is unspecificed at this point.
			else {
				this.mapHandleToPos.delete(fd);
			}
		}
	}

	async write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
		// we know at this point that the file to write to is truncated and thus empty
		// if the write now fails, the file remains empty. as such we really try hard
		// to ensure the write succeeds by retrying up to three times.
		return retry(() => this.doWrite(fd, pos, data, offset, length), 100 /* ms delay */, 3 /* retries */);
	}

	private async doWrite(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
		const normalizedPos = this.normalizePos(fd, pos);

		let bytesWritten: number | null = null;
		try {
			const result = await Promises.write(fd, data, offset, length, normalizedPos);

			if (typeof result === 'number') {
				bytesWritten = result; // node.d.ts fail
			} else {
				bytesWritten = result.bytesWritten;
			}

			return bytesWritten;
		} catch (error) {
			throw await this.toFileSystemProviderWriteError(this.writeHandles.get(fd), error);
		} finally {
			this.updatePos(fd, normalizedPos, bytesWritten);
		}
	}

	//#endregion

	//#region Move/Copy/Delete/Create Folder

	async mkdir(resource: URI): Promise<void> {
		try {
			await Promises.mkdir(this.toFilePath(resource));
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		}
	}

	async delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
		try {
			const filePath = this.toFilePath(resource);

			await this.doDelete(filePath, opts);
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		}
	}

	protected async doDelete(filePath: string, opts: FileDeleteOptions): Promise<void> {
		if (opts.recursive) {
			await Promises.rm(filePath, RimRafMode.MOVE);
		} else {
			await Promises.unlink(filePath);
		}
	}

	async rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
		const fromFilePath = this.toFilePath(from);
		const toFilePath = this.toFilePath(to);

		if (fromFilePath === toFilePath) {
			return; // simulate node.js behaviour here and do a no-op if paths match
		}

		try {

			// Ensure target does not exist
			await this.validateTargetDeleted(from, to, 'move', opts.overwrite);

			// Move
			await Promises.move(fromFilePath, toFilePath);
		} catch (error) {

			// rewrite some typical errors that can happen especially around symlinks
			// to something the user can better understand
			if (error.code === 'EINVAL' || error.code === 'EBUSY' || error.code === 'ENAMETOOLONG') {
				error = new Error(localize('moveError', "Unable to move '{0}' into '{1}' ({2}).", basename(fromFilePath), basename(dirname(toFilePath)), error.toString()));
			}

			throw this.toFileSystemProviderError(error);
		}
	}

	async copy(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
		const fromFilePath = this.toFilePath(from);
		const toFilePath = this.toFilePath(to);

		if (fromFilePath === toFilePath) {
			return; // simulate node.js behaviour here and do a no-op if paths match
		}

		try {

			// Ensure target does not exist
			await this.validateTargetDeleted(from, to, 'copy', opts.overwrite);

			// Copy
			await Promises.copy(fromFilePath, toFilePath, { preserveSymlinks: true });
		} catch (error) {

			// rewrite some typical errors that can happen especially around symlinks
			// to something the user can better understand
			if (error.code === 'EINVAL' || error.code === 'EBUSY' || error.code === 'ENAMETOOLONG') {
				error = new Error(localize('copyError', "Unable to copy '{0}' into '{1}' ({2}).", basename(fromFilePath), basename(dirname(toFilePath)), error.toString()));
			}

			throw this.toFileSystemProviderError(error);
		}
	}

	private async validateTargetDeleted(from: URI, to: URI, mode: 'move' | 'copy', overwrite?: boolean): Promise<void> {
		const fromFilePath = this.toFilePath(from);
		const toFilePath = this.toFilePath(to);

		let isSameResourceWithDifferentPathCase = false;
		const isPathCaseSensitive = !!(this.capabilities & FileSystemProviderCapabilities.PathCaseSensitive);
		if (!isPathCaseSensitive) {
			isSameResourceWithDifferentPathCase = isEqual(fromFilePath, toFilePath, true /* ignore case */);
		}

		if (isSameResourceWithDifferentPathCase && mode === 'copy') {
			throw createFileSystemProviderError(localize('fileCopyErrorPathCase', "'File cannot be copied to same path with different path case"), FileSystemProviderErrorCode.FileExists);
		}

		// handle existing target (unless this is a case change)
		if (!isSameResourceWithDifferentPathCase && await Promises.exists(toFilePath)) {
			if (!overwrite) {
				throw createFileSystemProviderError(localize('fileCopyErrorExists', "File at target already exists"), FileSystemProviderErrorCode.FileExists);
			}

			// Delete target
			await this.delete(to, { recursive: true, useTrash: false });
		}
	}

	//#endregion

	//#region File Watching

	protected createRecursiveWatcher(
		folders: number,
		onChange: (changes: IDiskFileChange[]) => void,
		onLogMessage: (msg: ILogMessage) => void,
		verboseLogging: boolean
	): WatcherService {
		let watcherImpl: {
			new(
				onChange: (changes: IDiskFileChange[]) => void,
				onLogMessage: (msg: ILogMessage) => void,
				verboseLogging: boolean,
				watcherOptions?: IWatcherOptions
			): WatcherService
		};

		let enableLegacyWatcher = false;
		if (this.options?.watcher?.usePolling) {
			enableLegacyWatcher = false; // can use Parcel watcher for when polling is required
		} else {
			if (this.options?.legacyWatcher === 'on' || this.options?.legacyWatcher === 'off') {
				enableLegacyWatcher = this.options.legacyWatcher === 'on'; // setting always wins
			} else {
				if (product.quality === 'stable') {
					// in stable use legacy for single folder workspaces
					// TODO@bpasero remove me eventually
					enableLegacyWatcher = folders === 1;
				}
			}
		}

		if (enableLegacyWatcher) {
			if (isLinux) {
				watcherImpl = UnixWatcherService;
			} else {
				watcherImpl = NsfwWatcherService;
			}
		} else {
			watcherImpl = ParcelWatcherService;
		}

		return new watcherImpl(
			changes => onChange(changes),
			msg => onLogMessage(msg),
			verboseLogging,
			this.options?.watcher
		);
	}

	protected override doWatch(watcher: WatcherService, requests: IWatchRequest[]): Promise<void> {
		const usePolling = this.options?.watcher?.usePolling;
		if (usePolling === true) {
			for (const request of requests) {
				request.pollingInterval = this.options?.watcher?.pollingInterval ?? 5000;
			}
		} else if (Array.isArray(usePolling)) {
			for (const request of requests) {
				if (usePolling.includes(request.path)) {
					request.pollingInterval = this.options?.watcher?.pollingInterval ?? 5000;
				}
			}
		}

		return super.doWatch(watcher, requests);
	}

	protected createNonRecursiveWatcher(
		path: string,
		onChange: (changes: IDiskFileChange[]) => void,
		onLogMessage: (msg: ILogMessage) => void,
		verboseLogging: boolean
	): IDisposable & { setVerboseLogging: (verboseLogging: boolean) => void } {
		return new NodeJSWatcherService(
			path,
			changes => onChange(changes),
			msg => onLogMessage(msg),
			verboseLogging
		);
	}

	//#endregion

	//#region Helpers

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
			case 'ENOTDIR':
				code = FileSystemProviderErrorCode.FileNotADirectory;
				break;
			case 'EEXIST':
				code = FileSystemProviderErrorCode.FileExists;
				break;
			case 'EPERM':
			case 'EACCES':
				code = FileSystemProviderErrorCode.NoPermissions;
				break;
			default:
				code = FileSystemProviderErrorCode.Unknown;
		}

		return createFileSystemProviderError(error, code);
	}

	private async toFileSystemProviderWriteError(resource: URI | undefined, error: NodeJS.ErrnoException): Promise<FileSystemProviderError> {
		let fileSystemProviderWriteError = this.toFileSystemProviderError(error);

		// If the write error signals permission issues, we try
		// to read the file's mode to see if the file is write
		// locked.
		if (resource && fileSystemProviderWriteError.code === FileSystemProviderErrorCode.NoPermissions) {
			try {
				const { stat } = await SymlinkSupport.stat(this.toFilePath(resource));
				if (!(stat.mode & 0o200 /* File mode indicating writable by owner */)) {
					fileSystemProviderWriteError = createFileSystemProviderError(error, FileSystemProviderErrorCode.FileWriteLocked);
				}
			} catch (error) {
				this.logService.trace(error); // ignore - return original error
			}
		}

		return fileSystemProviderWriteError;
	}

	//#endregion
}
