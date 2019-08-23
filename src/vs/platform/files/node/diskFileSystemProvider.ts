/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdir, open, close, read, write, fdatasync } from 'fs';
import { promisify } from 'util';
import { IDisposable, Disposable, toDisposable, dispose, combinedDisposable } from 'vs/base/common/lifecycle';
import { IFileSystemProvider, FileSystemProviderCapabilities, IFileChange, IWatchOptions, IStat, FileType, FileDeleteOptions, FileOverwriteOptions, FileWriteOptions, FileOpenOptions, FileSystemProviderErrorCode, createFileSystemProviderError, FileSystemProviderError } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import { isLinux, isWindows } from 'vs/base/common/platform';
import { statLink, readdir, unlink, move, copy, readFile, truncate, rimraf, RimRafMode, exists } from 'vs/base/node/pfs';
import { normalize, basename, dirname } from 'vs/base/common/path';
import { joinPath } from 'vs/base/common/resources';
import { isEqual } from 'vs/base/common/extpath';
import { retry, ThrottledDelayer } from 'vs/base/common/async';
import { ILogService, LogLevel } from 'vs/platform/log/common/log';
import { localize } from 'vs/nls';
import { IDiskFileChange, toFileChanges, ILogMessage } from 'vs/platform/files/node/watcher/watcher';
import { FileWatcher as UnixWatcherService } from 'vs/platform/files/node/watcher/unix/watcherService';
import { FileWatcher as WindowsWatcherService } from 'vs/platform/files/node/watcher/win32/watcherService';
import { FileWatcher as NsfwWatcherService } from 'vs/platform/files/node/watcher/nsfw/watcherService';
import { FileWatcher as NodeJSWatcherService } from 'vs/platform/files/node/watcher/nodejs/watcherService';

export interface IWatcherOptions {
	pollingInterval?: number;
	usePolling: boolean;
}

export class DiskFileSystemProvider extends Disposable implements IFileSystemProvider {

	constructor(private logService: ILogService, private watcherOptions?: IWatcherOptions) {
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
			};
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		}
	}

	async readdir(resource: URI): Promise<[string, FileType][]> {
		try {
			const children = await readdir(this.toFilePath(resource));

			const result: [string, FileType][] = [];
			await Promise.all(children.map(async child => {
				try {
					const stat = await this.stat(joinPath(resource, child));
					result.push([child, stat.type]);
				} catch (error) {
					this.logService.trace(error); // ignore errors for individual entries that can arise from permission denied
				}
			}));

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
		let handle: number | undefined = undefined;
		try {
			const filePath = this.toFilePath(resource);

			// Validate target
			const fileExists = await exists(filePath);
			if (fileExists && !opts.overwrite) {
				throw createFileSystemProviderError(new Error(localize('fileExists', "File already exists")), FileSystemProviderErrorCode.FileExists);
			} else if (!fileExists && !opts.create) {
				throw createFileSystemProviderError(new Error(localize('fileNotExists', "File does not exist")), FileSystemProviderErrorCode.FileNotFound);
			}

			// Open
			handle = await this.open(resource, { create: true });

			// Write content at once
			await this.write(handle, 0, content, 0, content.byteLength);
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		} finally {
			if (typeof handle === 'number') {
				await this.close(handle);
			}
		}
	}

	private mapHandleToPos: Map<number, number> = new Map();

	private writeHandles: Set<number> = new Set();
	private canFlush: boolean = true;

	async open(resource: URI, opts: FileOpenOptions): Promise<number> {
		try {
			const filePath = this.toFilePath(resource);

			let flags: string | undefined = undefined;
			if (opts.create) {
				if (isWindows && await exists(filePath)) {
					try {
						// On Windows and if the file exists, we use a different strategy of saving the file
						// by first truncating the file and then writing with r+ flag. This helps to save hidden files on Windows
						// (see https://github.com/Microsoft/vscode/issues/931) and prevent removing alternate data streams
						// (see https://github.com/Microsoft/vscode/issues/6363)
						await truncate(filePath, 0);

						// After a successful truncate() the flag can be set to 'r+' which will not truncate.
						flags = 'r+';
					} catch (error) {
						this.logService.trace(error);
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

			const handle = await promisify(open)(filePath, flags);

			// remember this handle to track file position of the handle
			// we init the position to 0 since the file descriptor was
			// just created and the position was not moved so far (see
			// also http://man7.org/linux/man-pages/man2/open.2.html -
			// "The file offset is set to the beginning of the file.")
			this.mapHandleToPos.set(handle, 0);

			// remember that this handle was used for writing
			if (opts.create) {
				this.writeHandles.add(handle);
			}

			return handle;
		} catch (error) {
			throw this.toFileSystemProviderError(error);
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
					await promisify(fdatasync)(fd);
				} catch (error) {
					// In some exotic setups it is well possible that node fails to sync
					// In that case we disable flushing and log the error to our logger
					this.canFlush = false;
					this.logService.error(error);
				}
			}

			return await promisify(close)(fd);
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		}
	}

	async read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
		const normalizedPos = this.normalizePos(fd, pos);

		let bytesRead: number | null = null;
		try {
			const result = await promisify(read)(fd, data, offset, length, normalizedPos);

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
			const result = await promisify(write)(fd, data, offset, length, normalizedPos);

			if (typeof result === 'number') {
				bytesWritten = result; // node.d.ts fail
			} else {
				bytesWritten = result.bytesWritten;
			}

			return bytesWritten;
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		} finally {
			this.updatePos(fd, normalizedPos, bytesWritten);
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
			throw this.toFileSystemProviderError(error);
		}
	}

	protected async doDelete(filePath: string, opts: FileDeleteOptions): Promise<void> {
		if (opts.recursive) {
			await rimraf(filePath, RimRafMode.MOVE);
		} else {
			await unlink(filePath);
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
			await this.validateTargetDeleted(from, to, 'move', opts && opts.overwrite);

			// Move
			await move(fromFilePath, toFilePath);
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
			await this.validateTargetDeleted(from, to, 'copy', opts && opts.overwrite);

			// Copy
			await copy(fromFilePath, toFilePath);
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
		const isPathCaseSensitive = !!(this.capabilities & FileSystemProviderCapabilities.PathCaseSensitive);

		const fromFilePath = this.toFilePath(from);
		const toFilePath = this.toFilePath(to);

		let isSameResourceWithDifferentPathCase = false;
		if (!isPathCaseSensitive) {
			isSameResourceWithDifferentPathCase = isEqual(fromFilePath, toFilePath, true /* ignore case */);
		}

		if (isSameResourceWithDifferentPathCase && mode === 'copy') {
			throw createFileSystemProviderError(new Error('File cannot be copied to same path with different path case'), FileSystemProviderErrorCode.FileExists);
		}

		// handle existing target (unless this is a case change)
		if (!isSameResourceWithDifferentPathCase && await exists(toFilePath)) {
			if (!overwrite) {
				throw createFileSystemProviderError(new Error('File at target already exists'), FileSystemProviderErrorCode.FileExists);
			}

			// Delete target
			await this.delete(to, { recursive: true, useTrash: false });
		}
	}

	//#endregion

	//#region File Watching

	private _onDidWatchErrorOccur: Emitter<string> = this._register(new Emitter<string>());
	readonly onDidErrorOccur: Event<string> = this._onDidWatchErrorOccur.event;

	private _onDidChangeFile: Emitter<IFileChange[]> = this._register(new Emitter<IFileChange[]>());
	get onDidChangeFile(): Event<IFileChange[]> { return this._onDidChangeFile.event; }

	private recursiveWatcher: WindowsWatcherService | UnixWatcherService | NsfwWatcherService | undefined;
	private recursiveFoldersToWatch: { path: string, excludes: string[] }[] = [];
	private recursiveWatchRequestDelayer: ThrottledDelayer<void> = this._register(new ThrottledDelayer<void>(0));

	private recursiveWatcherLogLevelListener: IDisposable | undefined;

	watch(resource: URI, opts: IWatchOptions): IDisposable {
		if (opts.recursive) {
			return this.watchRecursive(resource, opts.excludes);
		}

		return this.watchNonRecursive(resource); // TODO@ben ideally the same watcher can be used in both cases
	}

	private watchRecursive(resource: URI, excludes: string[]): IDisposable {

		// Add to list of folders to watch recursively
		const folderToWatch = { path: this.toFilePath(resource), excludes };
		this.recursiveFoldersToWatch.push(folderToWatch);

		// Trigger update
		this.refreshRecursiveWatchers();

		return toDisposable(() => {

			// Remove from list of folders to watch recursively
			this.recursiveFoldersToWatch.splice(this.recursiveFoldersToWatch.indexOf(folderToWatch), 1);

			// Trigger update
			this.refreshRecursiveWatchers();
		});
	}

	private refreshRecursiveWatchers(): void {

		// Buffer requests for recursive watching to decide on right watcher
		// that supports potentially watching more than one folder at once
		this.recursiveWatchRequestDelayer.trigger(() => {
			this.doRefreshRecursiveWatchers();

			return Promise.resolve();
		});
	}

	private doRefreshRecursiveWatchers(): void {

		// Reuse existing
		if (this.recursiveWatcher instanceof NsfwWatcherService) {
			this.recursiveWatcher.setFolders(this.recursiveFoldersToWatch);
		}

		// Create new
		else {

			// Dispose old
			dispose(this.recursiveWatcher);
			this.recursiveWatcher = undefined;

			// Create new if we actually have folders to watch
			if (this.recursiveFoldersToWatch.length > 0) {
				let watcherImpl: {
					new(
						folders: { path: string, excludes: string[] }[],
						onChange: (changes: IDiskFileChange[]) => void,
						onLogMessage: (msg: ILogMessage) => void,
						verboseLogging: boolean,
						watcherOptions?: IWatcherOptions
					): WindowsWatcherService | UnixWatcherService | NsfwWatcherService
				};

				let watcherOptions: IWatcherOptions | undefined = undefined;

				// requires a polling watcher
				if (this.watcherOptions && this.watcherOptions.usePolling) {
					watcherImpl = UnixWatcherService;
					watcherOptions = this.watcherOptions;
				}

				// Single Folder Watcher
				else {
					if (this.recursiveFoldersToWatch.length === 1) {
						if (isWindows) {
							watcherImpl = WindowsWatcherService;
						} else {
							watcherImpl = UnixWatcherService;
						}
					}

					// Multi Folder Watcher
					else {
						watcherImpl = NsfwWatcherService;
					}
				}

				// Create and start watching
				this.recursiveWatcher = new watcherImpl(
					this.recursiveFoldersToWatch,
					event => this._onDidChangeFile.fire(toFileChanges(event)),
					msg => {
						if (msg.type === 'error') {
							this._onDidWatchErrorOccur.fire(msg.message);
						}

						this.logService[msg.type](msg.message);
					},
					this.logService.getLevel() === LogLevel.Trace,
					watcherOptions
				);

				if (!this.recursiveWatcherLogLevelListener) {
					this.recursiveWatcherLogLevelListener = this.logService.onDidChangeLogLevel(() => {
						if (this.recursiveWatcher) {
							this.recursiveWatcher.setVerboseLogging(this.logService.getLevel() === LogLevel.Trace);
						}
					});
				}
			}
		}
	}

	private watchNonRecursive(resource: URI): IDisposable {
		const watcherService = new NodeJSWatcherService(
			this.toFilePath(resource),
			changes => this._onDidChangeFile.fire(toFileChanges(changes)),
			msg => {
				if (msg.type === 'error') {
					this._onDidWatchErrorOccur.fire(msg.message);
				}

				this.logService[msg.type](msg.message);
			},
			this.logService.getLevel() === LogLevel.Trace
		);

		const logLevelListener = this.logService.onDidChangeLogLevel(() => {
			watcherService.setVerboseLogging(this.logService.getLevel() === LogLevel.Trace);
		});

		return combinedDisposable(watcherService, logLevelListener);
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
			case 'EACCES':
				code = FileSystemProviderErrorCode.NoPermissions;
				break;
			default:
				code = FileSystemProviderErrorCode.Unknown;
		}

		return createFileSystemProviderError(error, code);
	}

	//#endregion

	dispose(): void {
		super.dispose();

		dispose(this.recursiveWatcher);
		this.recursiveWatcher = undefined;

		dispose(this.recursiveWatcherLogLevelListener);
		this.recursiveWatcherLogLevelListener = undefined;
	}
}
