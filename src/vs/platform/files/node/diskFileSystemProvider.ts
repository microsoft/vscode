/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { gracefulify } from 'graceful-fs';
import { Barrier, retry } from 'vs/base/common/async';
import { ResourceMap } from 'vs/base/common/map';
import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { isEqual } from 'vs/base/common/extpath';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { basename, dirname, join } from 'vs/base/common/path';
import { isLinux, isWindows } from 'vs/base/common/platform';
import { extUriBiasedIgnorePathCase, joinPath, basename as resourcesBasename, dirname as resourcesDirname } from 'vs/base/common/resources';
import { newWriteableStream, ReadableStreamEvents } from 'vs/base/common/stream';
import { URI } from 'vs/base/common/uri';
import { IDirent, Promises, RimRafMode, SymlinkSupport } from 'vs/base/node/pfs';
import { localize } from 'vs/nls';
import { createFileSystemProviderError, IFileAtomicReadOptions, IFileDeleteOptions, IFileOpenOptions, IFileOverwriteOptions, IFileReadStreamOptions, FileSystemProviderCapabilities, FileSystemProviderError, FileSystemProviderErrorCode, FileType, IFileWriteOptions, IFileSystemProviderWithFileAtomicReadCapability, IFileSystemProviderWithFileCloneCapability, IFileSystemProviderWithFileFolderCopyCapability, IFileSystemProviderWithFileReadStreamCapability, IFileSystemProviderWithFileReadWriteCapability, IFileSystemProviderWithOpenReadWriteCloseCapability, isFileOpenForWriteOptions, IStat, FilePermission, IFileSystemProviderWithFileAtomicWriteCapability, IFileSystemProviderWithFileAtomicDeleteCapability } from 'vs/platform/files/common/files';
import { readFileIntoStream } from 'vs/platform/files/common/io';
import { AbstractNonRecursiveWatcherClient, AbstractUniversalWatcherClient, IDiskFileChange, ILogMessage } from 'vs/platform/files/common/watcher';
import { ILogService } from 'vs/platform/log/common/log';
import { AbstractDiskFileSystemProvider, IDiskFileSystemProviderOptions } from 'vs/platform/files/common/diskFileSystemProvider';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { UniversalWatcherClient } from 'vs/platform/files/node/watcher/watcherClient';
import { NodeJSWatcherClient } from 'vs/platform/files/node/watcher/nodejs/nodejsClient';

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

export class DiskFileSystemProvider extends AbstractDiskFileSystemProvider implements
	IFileSystemProviderWithFileReadWriteCapability,
	IFileSystemProviderWithOpenReadWriteCloseCapability,
	IFileSystemProviderWithFileReadStreamCapability,
	IFileSystemProviderWithFileFolderCopyCapability,
	IFileSystemProviderWithFileAtomicReadCapability,
	IFileSystemProviderWithFileAtomicWriteCapability,
	IFileSystemProviderWithFileAtomicDeleteCapability,
	IFileSystemProviderWithFileCloneCapability {

	private static TRACE_LOG_RESOURCE_LOCKS = false; // not enabled by default because very spammy

	constructor(
		logService: ILogService,
		options?: IDiskFileSystemProviderOptions
	) {
		super(logService, options);
	}

	//#region File Capabilities

	readonly onDidChangeCapabilities = Event.None;

	private _capabilities: FileSystemProviderCapabilities | undefined;
	get capabilities(): FileSystemProviderCapabilities {
		if (!this._capabilities) {
			this._capabilities =
				FileSystemProviderCapabilities.FileReadWrite |
				FileSystemProviderCapabilities.FileOpenReadWriteClose |
				FileSystemProviderCapabilities.FileReadStream |
				FileSystemProviderCapabilities.FileFolderCopy |
				FileSystemProviderCapabilities.FileWriteUnlock |
				FileSystemProviderCapabilities.FileAtomicRead |
				FileSystemProviderCapabilities.FileAtomicWrite |
				FileSystemProviderCapabilities.FileAtomicDelete |
				FileSystemProviderCapabilities.FileClone;

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
				size: stat.size,
				permissions: (stat.mode & 0o200) === 0 ? FilePermission.Locked : undefined
			};
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		}
	}

	private async statIgnoreError(resource: URI): Promise<IStat | undefined> {
		try {
			return await this.stat(resource);
		} catch (error) {
			return undefined;
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

	private readonly resourceLocks = new ResourceMap<Barrier>(resource => extUriBiasedIgnorePathCase.getComparisonKey(resource));

	private async createResourceLock(resource: URI): Promise<IDisposable> {
		const filePath = this.toFilePath(resource);
		this.traceLock(`[Disk FileSystemProvider]: createResourceLock() - request to acquire resource lock (${filePath})`);

		// Await pending locks for resource. It is possible for a new lock being
		// added right after opening, so we have to loop over locks until no lock
		// remains.
		let existingLock: Barrier | undefined = undefined;
		while (existingLock = this.resourceLocks.get(resource)) {
			this.traceLock(`[Disk FileSystemProvider]: createResourceLock() - waiting for resource lock to be released (${filePath})`);
			await existingLock.wait();
		}

		// Store new
		const newLock = new Barrier();
		this.resourceLocks.set(resource, newLock);

		this.traceLock(`[Disk FileSystemProvider]: createResourceLock() - new resource lock created (${filePath})`);

		return toDisposable(() => {
			this.traceLock(`[Disk FileSystemProvider]: createResourceLock() - resource lock dispose() (${filePath})`);

			// Delete lock if it is still ours
			if (this.resourceLocks.get(resource) === newLock) {
				this.traceLock(`[Disk FileSystemProvider]: createResourceLock() - resource lock removed from resource-lock map (${filePath})`);
				this.resourceLocks.delete(resource);
			}

			// Open lock
			this.traceLock(`[Disk FileSystemProvider]: createResourceLock() - resource lock barrier open() (${filePath})`);
			newLock.open();
		});
	}

	async readFile(resource: URI, options?: IFileAtomicReadOptions): Promise<Uint8Array> {
		let lock: IDisposable | undefined = undefined;
		try {
			if (options?.atomic) {
				this.traceLock(`[Disk FileSystemProvider]: atomic read operation started (${this.toFilePath(resource)})`);

				// When the read should be atomic, make sure
				// to await any pending locks for the resource
				// and lock for the duration of the read.
				lock = await this.createResourceLock(resource);
			}

			const filePath = this.toFilePath(resource);

			return await Promises.readFile(filePath);
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		} finally {
			lock?.dispose();
		}
	}

	private traceLock(msg: string): void {
		if (DiskFileSystemProvider.TRACE_LOG_RESOURCE_LOCKS) {
			this.logService.trace(msg);
		}
	}

	readFileStream(resource: URI, opts: IFileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array> {
		const stream = newWriteableStream<Uint8Array>(data => VSBuffer.concat(data.map(data => VSBuffer.wrap(data))).buffer);

		readFileIntoStream(this, resource, stream, data => data.buffer, {
			...opts,
			bufferSize: 256 * 1024 // read into chunks of 256kb each to reduce IPC overhead
		}, token);

		return stream;
	}

	async writeFile(resource: URI, content: Uint8Array, opts: IFileWriteOptions): Promise<void> {
		if (opts?.atomic !== false && opts?.atomic?.postfix) {
			return this.doWriteFileAtomic(resource, joinPath(resourcesDirname(resource), `${resourcesBasename(resource)}${opts.atomic.postfix}`), content, opts);
		} else {
			return this.doWriteFile(resource, content, opts);
		}
	}

	private async doWriteFileAtomic(resource: URI, tempResource: URI, content: Uint8Array, opts: IFileWriteOptions): Promise<void> {

		// Write to temp resource first
		await this.doWriteFile(tempResource, content, opts);

		try {

			// Rename over existing to ensure atomic replace
			await this.rename(tempResource, resource, { overwrite: true });

		} catch (error) {

			// Cleanup in case of rename error
			try {
				await this.delete(tempResource, { recursive: false, useTrash: false, atomic: false });
			} catch (error) {
				// ignore - we want the outer error to bubble up
			}

			throw error;
		}
	}

	private async doWriteFile(resource: URI, content: Uint8Array, opts: IFileWriteOptions): Promise<void> {
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
	private readonly mapHandleToLock = new Map<number, IDisposable>();

	private readonly writeHandles = new Map<number, URI>();

	private static canFlush: boolean = true;

	static configureFlushOnWrite(enabled: boolean): void {
		DiskFileSystemProvider.canFlush = enabled;
	}

	async open(resource: URI, opts: IFileOpenOptions): Promise<number> {
		const filePath = this.toFilePath(resource);

		// Writes: guard multiple writes to the same resource
		// behind a single lock to prevent races when writing
		// from multiple places at the same time to the same file
		let lock: IDisposable | undefined = undefined;
		if (isFileOpenForWriteOptions(opts)) {
			lock = await this.createResourceLock(resource);
		}

		let fd: number | undefined = undefined;
		try {

			// Determine whether to unlock the file (write only)
			if (isFileOpenForWriteOptions(opts) && opts.unlock) {
				try {
					const { stat } = await SymlinkSupport.stat(filePath);
					if (!(stat.mode & 0o200 /* File mode indicating writable by owner */)) {
						await Promises.chmod(filePath, stat.mode | 0o200);
					}
				} catch (error) {
					if (error.code !== 'ENOENT') {
						this.logService.trace(error); // ignore any errors here and try to just write
					}
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

				// We take opts.create as a hint that the file is opened for writing
				// as such we use 'w' to truncate an existing or create the
				// file otherwise. we do not allow reading.
				if (!flags) {
					flags = 'w';
				}
			} else {

				// Otherwise we assume the file is opened for reading
				// as such we use 'r' to neither truncate, nor create
				// the file.
				flags = 'r';
			}

			// Finally open handle to file path
			fd = await Promises.open(filePath, flags);

		} catch (error) {

			// Release lock because we have no valid handle
			// if we did open a lock during this operation
			lock?.dispose();

			// Rethrow as file system provider error
			if (isFileOpenForWriteOptions(opts)) {
				throw await this.toFileSystemProviderWriteError(resource, error);
			} else {
				throw this.toFileSystemProviderError(error);
			}
		}

		// Remember this handle to track file position of the handle
		// we init the position to 0 since the file descriptor was
		// just created and the position was not moved so far (see
		// also http://man7.org/linux/man-pages/man2/open.2.html -
		// "The file offset is set to the beginning of the file.")
		this.mapHandleToPos.set(fd, 0);

		// remember that this handle was used for writing
		if (isFileOpenForWriteOptions(opts)) {
			this.writeHandles.set(fd, resource);
		}

		if (lock) {
			const previousLock = this.mapHandleToLock.get(fd);

			// Remember that this handle has an associated lock
			this.traceLock(`[Disk FileSystemProvider]: open() - storing lock for handle ${fd} (${filePath})`);
			this.mapHandleToLock.set(fd, lock);

			// There is a slight chance that a resource lock for a
			// handle was not yet disposed when we acquire a new
			// lock, so we must ensure to dispose the previous lock
			// before storing a new one for the same handle, other
			// wise we end up in a deadlock situation
			// https://github.com/microsoft/vscode/issues/142462
			if (previousLock) {
				this.traceLock(`[Disk FileSystemProvider]: open() - disposing a previous lock that was still stored on same handle ${fd} (${filePath})`);
				previousLock.dispose();
			}
		}

		return fd;
	}

	async close(fd: number): Promise<void> {

		// It is very important that we keep any associated lock
		// for the file handle before attempting to call `fs.close(fd)`
		// because of a possible race condition: as soon as a file
		// handle is released, the OS may assign the same handle to
		// the next `fs.open` call and as such it is possible that our
		// lock is getting overwritten
		const lockForHandle = this.mapHandleToLock.get(fd);

		try {

			// Remove this handle from map of positions
			this.mapHandleToPos.delete(fd);

			// If a handle is closed that was used for writing, ensure
			// to flush the contents to disk if possible.
			if (this.writeHandles.delete(fd) && DiskFileSystemProvider.canFlush) {
				try {
					await Promises.fdatasync(fd); // https://github.com/microsoft/vscode/issues/9589
				} catch (error) {
					// In some exotic setups it is well possible that node fails to sync
					// In that case we disable flushing and log the error to our logger
					DiskFileSystemProvider.configureFlushOnWrite(false);
					this.logService.error(error);
				}
			}

			return await Promises.close(fd);
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		} finally {
			if (lockForHandle) {
				if (this.mapHandleToLock.get(fd) === lockForHandle) {
					this.traceLock(`[Disk FileSystemProvider]: close() - resource lock removed from handle-lock map ${fd}`);
					this.mapHandleToLock.delete(fd); // only delete from map if this is still our lock!
				}

				this.traceLock(`[Disk FileSystemProvider]: close() - disposing lock for handle ${fd}`);
				lockForHandle.dispose();
			}
		}
	}

	async read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
		const normalizedPos = this.normalizePos(fd, pos);

		let bytesRead: number | null = null;
		try {
			bytesRead = (await Promises.read(fd, data, offset, length, normalizedPos)).bytesRead;
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		} finally {
			this.updatePos(fd, normalizedPos, bytesRead);
		}

		return bytesRead;
	}

	private normalizePos(fd: number, pos: number): number | null {

		// When calling fs.read/write we try to avoid passing in the "pos" argument and
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

		// We know at this point that the file to write to is truncated and thus empty
		// if the write now fails, the file remains empty. as such we really try hard
		// to ensure the write succeeds by retrying up to three times.
		return retry(() => this.doWrite(fd, pos, data, offset, length), 100 /* ms delay */, 3 /* retries */);
	}

	private async doWrite(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
		const normalizedPos = this.normalizePos(fd, pos);

		let bytesWritten: number | null = null;
		try {
			bytesWritten = (await Promises.write(fd, data, offset, length, normalizedPos)).bytesWritten;
		} catch (error) {
			throw await this.toFileSystemProviderWriteError(this.writeHandles.get(fd), error);
		} finally {
			this.updatePos(fd, normalizedPos, bytesWritten);
		}

		return bytesWritten;
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

	async delete(resource: URI, opts: IFileDeleteOptions): Promise<void> {
		try {
			const filePath = this.toFilePath(resource);
			if (opts.recursive) {
				let rmMoveToPath: string | undefined = undefined;
				if (opts?.atomic !== false && opts.atomic.postfix) {
					rmMoveToPath = join(dirname(filePath), `${basename(filePath)}${opts.atomic.postfix}`);
				}

				await Promises.rm(filePath, RimRafMode.MOVE, rmMoveToPath);
			} else {
				try {
					await Promises.unlink(filePath);
				} catch (unlinkError) {

					// `fs.unlink` will throw when used on directories
					// we try to detect this error and then see if the
					// provided resource is actually a directory. in that
					// case we use `fs.rmdir` to delete the directory.

					if (unlinkError.code === 'EPERM' || unlinkError.code === 'EISDIR') {
						let isDirectory = false;
						try {
							const { stat, symbolicLink } = await SymlinkSupport.stat(filePath);
							isDirectory = stat.isDirectory() && !symbolicLink;
						} catch (statError) {
							// ignore
						}

						if (isDirectory) {
							await Promises.rmdir(filePath);
						} else {
							throw unlinkError;
						}
					} else {
						throw unlinkError;
					}
				}
			}
		} catch (error) {
			throw this.toFileSystemProviderError(error);
		}
	}

	async rename(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void> {
		const fromFilePath = this.toFilePath(from);
		const toFilePath = this.toFilePath(to);

		if (fromFilePath === toFilePath) {
			return; // simulate node.js behaviour here and do a no-op if paths match
		}

		try {

			// Validate the move operation can perform
			await this.validateMoveCopy(from, to, 'move', opts.overwrite);

			// Move
			await Promises.move(fromFilePath, toFilePath);
		} catch (error) {

			// Rewrite some typical errors that can happen especially around symlinks
			// to something the user can better understand
			if (error.code === 'EINVAL' || error.code === 'EBUSY' || error.code === 'ENAMETOOLONG') {
				error = new Error(localize('moveError', "Unable to move '{0}' into '{1}' ({2}).", basename(fromFilePath), basename(dirname(toFilePath)), error.toString()));
			}

			throw this.toFileSystemProviderError(error);
		}
	}

	async copy(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void> {
		const fromFilePath = this.toFilePath(from);
		const toFilePath = this.toFilePath(to);

		if (fromFilePath === toFilePath) {
			return; // simulate node.js behaviour here and do a no-op if paths match
		}

		try {

			// Validate the copy operation can perform
			await this.validateMoveCopy(from, to, 'copy', opts.overwrite);

			// Copy
			await Promises.copy(fromFilePath, toFilePath, { preserveSymlinks: true });
		} catch (error) {

			// Rewrite some typical errors that can happen especially around symlinks
			// to something the user can better understand
			if (error.code === 'EINVAL' || error.code === 'EBUSY' || error.code === 'ENAMETOOLONG') {
				error = new Error(localize('copyError', "Unable to copy '{0}' into '{1}' ({2}).", basename(fromFilePath), basename(dirname(toFilePath)), error.toString()));
			}

			throw this.toFileSystemProviderError(error);
		}
	}

	private async validateMoveCopy(from: URI, to: URI, mode: 'move' | 'copy', overwrite?: boolean): Promise<void> {
		const fromFilePath = this.toFilePath(from);
		const toFilePath = this.toFilePath(to);

		let isSameResourceWithDifferentPathCase = false;
		const isPathCaseSensitive = !!(this.capabilities & FileSystemProviderCapabilities.PathCaseSensitive);
		if (!isPathCaseSensitive) {
			isSameResourceWithDifferentPathCase = isEqual(fromFilePath, toFilePath, true /* ignore case */);
		}

		if (isSameResourceWithDifferentPathCase) {

			// You cannot copy the same file to the same location with different
			// path case unless you are on a case sensitive file system
			if (mode === 'copy') {
				throw createFileSystemProviderError(localize('fileCopyErrorPathCase', "File cannot be copied to same path with different path case"), FileSystemProviderErrorCode.FileExists);
			}

			// You can move the same file to the same location with different
			// path case on case insensitive file systems
			else if (mode === 'move') {
				return;
			}
		}

		// Here we have to see if the target to move/copy to exists or not.
		// We need to respect the `overwrite` option to throw in case the
		// target exists.

		const fromStat = await this.statIgnoreError(from);
		if (!fromStat) {
			throw createFileSystemProviderError(localize('fileMoveCopyErrorNotFound', "File to move/copy does not exist"), FileSystemProviderErrorCode.FileNotFound);
		}

		const toStat = await this.statIgnoreError(to);
		if (!toStat) {
			return; // target does not exist so we are good
		}

		if (!overwrite) {
			throw createFileSystemProviderError(localize('fileMoveCopyErrorExists', "File at target already exists and thus will not be moved/copied to unless overwrite is specified"), FileSystemProviderErrorCode.FileExists);
		}

		// Handle existing target for move/copy
		if ((fromStat.type & FileType.File) !== 0 && (toStat.type & FileType.File) !== 0) {
			return; // node.js can move/copy a file over an existing file without having to delete it first
		} else {
			await this.delete(to, { recursive: true, useTrash: false, atomic: false });
		}
	}

	//#endregion

	//#region Clone File

	async cloneFile(from: URI, to: URI): Promise<void> {
		return this.doCloneFile(from, to, false /* optimistically assume parent folders exist */);
	}

	private async doCloneFile(from: URI, to: URI, mkdir: boolean): Promise<void> {
		const fromFilePath = this.toFilePath(from);
		const toFilePath = this.toFilePath(to);

		const isPathCaseSensitive = !!(this.capabilities & FileSystemProviderCapabilities.PathCaseSensitive);
		if (isEqual(fromFilePath, toFilePath, !isPathCaseSensitive)) {
			return; // cloning is only supported `from` and `to` are different files
		}

		// Implement clone by using `fs.copyFile`, however setup locks
		// for both `from` and `to` because node.js does not ensure
		// this to be an atomic operation

		const locks = new DisposableStore();

		try {
			const [fromLock, toLock] = await Promise.all([
				this.createResourceLock(from),
				this.createResourceLock(to)
			]);

			locks.add(fromLock);
			locks.add(toLock);

			if (mkdir) {
				await Promises.mkdir(dirname(toFilePath), { recursive: true });
			}

			await Promises.copyFile(fromFilePath, toFilePath);
		} catch (error) {
			if (error.code === 'ENOENT' && !mkdir) {
				return this.doCloneFile(from, to, true);
			}

			throw this.toFileSystemProviderError(error);
		} finally {
			locks.dispose();
		}
	}

	//#endregion

	//#region File Watching

	protected createUniversalWatcher(
		onChange: (changes: IDiskFileChange[]) => void,
		onLogMessage: (msg: ILogMessage) => void,
		verboseLogging: boolean
	): AbstractUniversalWatcherClient {
		return new UniversalWatcherClient(changes => onChange(changes), msg => onLogMessage(msg), verboseLogging);
	}

	protected createNonRecursiveWatcher(
		onChange: (changes: IDiskFileChange[]) => void,
		onLogMessage: (msg: ILogMessage) => void,
		verboseLogging: boolean
	): AbstractNonRecursiveWatcherClient {
		return new NodeJSWatcherClient(changes => onChange(changes), msg => onLogMessage(msg), verboseLogging);
	}

	//#endregion

	//#region Helpers

	private toFileSystemProviderError(error: NodeJS.ErrnoException): FileSystemProviderError {
		if (error instanceof FileSystemProviderError) {
			return error; // avoid double conversion
		}

		let resultError: Error | string = error;
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
			case 'ERR_UNC_HOST_NOT_ALLOWED':
				resultError = `${error.message}. Please update the 'security.allowedUNCHosts' setting if you want to allow this host.`;
				code = FileSystemProviderErrorCode.Unknown;
				break;
			default:
				code = FileSystemProviderErrorCode.Unknown;
		}

		return createFileSystemProviderError(resultError, code);
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
