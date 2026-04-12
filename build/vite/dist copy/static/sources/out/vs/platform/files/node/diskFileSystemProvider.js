/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { constants, promises } from 'fs';
import { Barrier, retry } from '../../../base/common/async.js';
import { ResourceMap } from '../../../base/common/map.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { Event } from '../../../base/common/event.js';
import { isEqual } from '../../../base/common/extpath.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { basename, dirname, join } from '../../../base/common/path.js';
import { isLinux, isWindows } from '../../../base/common/platform.js';
import { extUriBiasedIgnorePathCase, joinPath, basename as resourcesBasename, dirname as resourcesDirname } from '../../../base/common/resources.js';
import { newWriteableStream } from '../../../base/common/stream.js';
import { Promises, RimRafMode, SymlinkSupport } from '../../../base/node/pfs.js';
import { localize } from '../../../nls.js';
import { createFileSystemProviderError, FileSystemProviderError, FileSystemProviderErrorCode, FileType, isFileOpenForWriteOptions, FilePermission } from '../common/files.js';
import { readFileIntoStream } from '../common/io.js';
import { AbstractDiskFileSystemProvider } from '../common/diskFileSystemProvider.js';
import { UniversalWatcherClient } from './watcher/watcherClient.js';
import { NodeJSWatcherClient } from './watcher/nodejs/nodejsClient.js';
export class DiskFileSystemProvider extends AbstractDiskFileSystemProvider {
    constructor() {
        super(...arguments);
        //#region File Capabilities
        this.onDidChangeCapabilities = Event.None;
        //#endregion
        //#region File Reading/Writing
        this.resourceLocks = new ResourceMap(resource => extUriBiasedIgnorePathCase.getComparisonKey(resource));
        this.mapHandleToPos = new Map();
        this.mapHandleToLock = new Map();
        this.writeHandles = new Map();
        //#endregion
    }
    static { this.TRACE_LOG_RESOURCE_LOCKS = false; } // not enabled by default because very spammy
    get capabilities() {
        if (!this._capabilities) {
            this._capabilities =
                2 /* FileSystemProviderCapabilities.FileReadWrite */ |
                    4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */ |
                    16 /* FileSystemProviderCapabilities.FileReadStream */ |
                    8 /* FileSystemProviderCapabilities.FileFolderCopy */ |
                    8192 /* FileSystemProviderCapabilities.FileWriteUnlock */ |
                    524288 /* FileSystemProviderCapabilities.FileAppend */ |
                    16384 /* FileSystemProviderCapabilities.FileAtomicRead */ |
                    32768 /* FileSystemProviderCapabilities.FileAtomicWrite */ |
                    65536 /* FileSystemProviderCapabilities.FileAtomicDelete */ |
                    131072 /* FileSystemProviderCapabilities.FileClone */ |
                    262144 /* FileSystemProviderCapabilities.FileRealpath */;
            if (isLinux) {
                this._capabilities |= 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */;
            }
        }
        return this._capabilities;
    }
    //#endregion
    //#region File Metadata Resolving
    async stat(resource) {
        try {
            const { stat, symbolicLink } = await SymlinkSupport.stat(this.toFilePath(resource)); // cannot use fs.stat() here to support links properly
            let permissions = undefined;
            if ((stat.mode & 0o200) === 0) {
                permissions = FilePermission.Locked;
            }
            if (stat.mode & constants.S_IXUSR ||
                stat.mode & constants.S_IXGRP ||
                stat.mode & constants.S_IXOTH) {
                permissions = (permissions ?? 0) | FilePermission.Executable;
            }
            return {
                type: this.toType(stat, symbolicLink),
                ctime: stat.birthtime.getTime(), // intentionally not using ctime here, we want the creation time
                mtime: stat.mtime.getTime(),
                size: stat.size,
                permissions
            };
        }
        catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }
    async statIgnoreError(resource) {
        try {
            return await this.stat(resource);
        }
        catch (error) {
            return undefined;
        }
    }
    async realpath(resource) {
        const filePath = this.toFilePath(resource);
        return Promises.realpath(filePath);
    }
    async readdir(resource) {
        try {
            const children = await Promises.readdir(this.toFilePath(resource), { withFileTypes: true });
            const result = [];
            await Promise.all(children.map(async (child) => {
                try {
                    let type;
                    if (child.isSymbolicLink()) {
                        type = (await this.stat(joinPath(resource, child.name))).type; // always resolve target the link points to if any
                    }
                    else {
                        type = this.toType(child);
                    }
                    result.push([child.name, type]);
                }
                catch (error) {
                    this.logService.trace(error); // ignore errors for individual entries that can arise from permission denied
                }
            }));
            return result;
        }
        catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }
    toType(entry, symbolicLink) {
        // Signal file type by checking for file / directory, except:
        // - symbolic links pointing to nonexistent files are FileType.Unknown
        // - files that are neither file nor directory are FileType.Unknown
        let type;
        if (symbolicLink?.dangling) {
            type = FileType.Unknown;
        }
        else if (entry.isFile()) {
            type = FileType.File;
        }
        else if (entry.isDirectory()) {
            type = FileType.Directory;
        }
        else {
            type = FileType.Unknown;
        }
        // Always signal symbolic link as file type additionally
        if (symbolicLink) {
            type |= FileType.SymbolicLink;
        }
        return type;
    }
    async createResourceLock(resource) {
        const filePath = this.toFilePath(resource);
        this.traceLock(`[Disk FileSystemProvider]: createResourceLock() - request to acquire resource lock (${filePath})`);
        // Await pending locks for resource. It is possible for a new lock being
        // added right after opening, so we have to loop over locks until no lock
        // remains.
        let existingLock = undefined;
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
    async readFile(resource, options) {
        let lock = undefined;
        try {
            if (options?.atomic) {
                this.traceLock(`[Disk FileSystemProvider]: atomic read operation started (${this.toFilePath(resource)})`);
                // When the read should be atomic, make sure
                // to await any pending locks for the resource
                // and lock for the duration of the read.
                lock = await this.createResourceLock(resource);
            }
            const filePath = this.toFilePath(resource);
            return await promises.readFile(filePath);
        }
        catch (error) {
            throw this.toFileSystemProviderError(error);
        }
        finally {
            lock?.dispose();
        }
    }
    traceLock(msg) {
        if (DiskFileSystemProvider.TRACE_LOG_RESOURCE_LOCKS) {
            this.logService.trace(msg);
        }
    }
    readFileStream(resource, opts, token) {
        const stream = newWriteableStream(data => VSBuffer.concat(data.map(data => VSBuffer.wrap(data))).buffer);
        readFileIntoStream(this, resource, stream, data => data.buffer, {
            ...opts,
            bufferSize: 256 * 1024 // read into chunks of 256kb each to reduce IPC overhead
        }, token);
        return stream;
    }
    async writeFile(resource, content, opts) {
        if (opts?.atomic !== false && opts?.atomic?.postfix && await this.canWriteFileAtomic(resource)) {
            return this.doWriteFileAtomic(resource, joinPath(resourcesDirname(resource), `${resourcesBasename(resource)}${opts.atomic.postfix}`), content, opts);
        }
        else {
            return this.doWriteFile(resource, content, opts);
        }
    }
    async canWriteFileAtomic(resource) {
        try {
            const filePath = this.toFilePath(resource);
            const { symbolicLink } = await SymlinkSupport.stat(filePath);
            if (symbolicLink) {
                // atomic writes are unsupported for symbolic links because
                // we need to ensure that the `rename` operation is atomic
                // and that only works if the link is on the same disk.
                // Since we do not know where the symbolic link points to
                // we refuse to write atomically.
                return false;
            }
        }
        catch (error) {
            // ignore stat errors here and just proceed trying to write
        }
        return true; // atomic writing supported
    }
    async doWriteFileAtomic(resource, tempResource, content, opts) {
        // Ensure to create locks for all resources involved
        // since atomic write involves mutiple disk operations
        // and resources.
        const locks = new DisposableStore();
        try {
            locks.add(await this.createResourceLock(resource));
            locks.add(await this.createResourceLock(tempResource));
            // Write to temp resource first
            await this.doWriteFile(tempResource, content, { ...opts, create: true, overwrite: true }, true /* disable write lock */);
            try {
                // Rename over existing to ensure atomic replace
                await this.rename(tempResource, resource, { overwrite: true });
            }
            catch (error) {
                // Cleanup in case of rename error
                try {
                    await this.delete(tempResource, { recursive: false, useTrash: false, atomic: false });
                }
                catch (error) {
                    // ignore - we want the outer error to bubble up
                }
                throw error;
            }
        }
        finally {
            locks.dispose();
        }
    }
    async doWriteFile(resource, content, opts, disableWriteLock) {
        let handle = undefined;
        try {
            const filePath = this.toFilePath(resource);
            // Validate target unless { create: true, overwrite: true }
            if (!opts.create || !opts.overwrite) {
                const fileExists = await Promises.exists(filePath);
                if (fileExists) {
                    if (!opts.overwrite) {
                        throw createFileSystemProviderError(localize('fileExists', "File already exists"), FileSystemProviderErrorCode.FileExists);
                    }
                }
                else {
                    if (!opts.create) {
                        throw createFileSystemProviderError(localize('fileNotExists', "File does not exist"), FileSystemProviderErrorCode.FileNotFound);
                    }
                }
            }
            // Open
            handle = await this.open(resource, { create: true, append: opts.append, unlock: opts.unlock }, disableWriteLock);
            // Write content at once
            await this.write(handle, 0, content, 0, content.byteLength);
        }
        catch (error) {
            throw await this.toFileSystemProviderWriteError(resource, error);
        }
        finally {
            if (typeof handle === 'number') {
                await this.close(handle);
            }
        }
    }
    static { this.canFlush = true; }
    static configureFlushOnWrite(enabled) {
        DiskFileSystemProvider.canFlush = enabled;
    }
    async open(resource, opts, disableWriteLock) {
        const filePath = this.toFilePath(resource);
        // Writes: guard multiple writes to the same resource
        // behind a single lock to prevent races when writing
        // from multiple places at the same time to the same file
        let lock = undefined;
        if (isFileOpenForWriteOptions(opts) && !disableWriteLock) {
            lock = await this.createResourceLock(resource);
        }
        let fd = undefined;
        try {
            // Determine whether to unlock the file (write only)
            if (isFileOpenForWriteOptions(opts) && opts.unlock) {
                try {
                    const { stat } = await SymlinkSupport.stat(filePath);
                    if (!(stat.mode & 0o200 /* File mode indicating writable by owner */)) {
                        await promises.chmod(filePath, stat.mode | 0o200);
                    }
                }
                catch (error) {
                    if (error.code !== 'ENOENT') {
                        this.logService.trace(error); // log errors but do not give up writing
                    }
                }
            }
            // Windows gets special treatment (write only, but not for append)
            if (isWindows && isFileOpenForWriteOptions(opts) && !opts.append) {
                try {
                    // We try to use 'r+' for opening (which will fail if the file does not exist)
                    // to prevent issues when saving hidden files or preserving alternate data
                    // streams.
                    // Related issues:
                    // - https://github.com/microsoft/vscode/issues/931
                    // - https://github.com/microsoft/vscode/issues/6363
                    fd = await Promises.open(filePath, 'r+');
                    // The flag 'r+' will not truncate the file, so we have to do this manually
                    await Promises.ftruncate(fd, 0);
                }
                catch (error) {
                    if (error.code !== 'ENOENT') {
                        this.logService.trace(error); // log errors but do not give up writing
                    }
                    // Make sure to close the file handle if we have one
                    if (typeof fd === 'number') {
                        try {
                            await Promises.close(fd);
                        }
                        catch (error) {
                            this.logService.trace(error); // log errors but do not give up writing
                        }
                        // Reset `fd` to be able to try again with 'w'
                        fd = undefined;
                    }
                }
            }
            if (typeof fd !== 'number') {
                fd = await Promises.open(filePath, isFileOpenForWriteOptions(opts) ?
                    // We take `opts.create` as a hint that the file is opened for writing
                    // as such we use 'w' to truncate an existing or create the
                    // file otherwise. we do not allow reading.
                    // If `opts.append` is true, use 'a' to append to the file.
                    (opts.append ? 'a' : 'w') :
                    // Otherwise we assume the file is opened for reading
                    // as such we use 'r' to neither truncate, nor create
                    // the file.
                    'r');
            }
        }
        catch (error) {
            // Release lock because we have no valid handle
            // if we did open a lock during this operation
            lock?.dispose();
            // Rethrow as file system provider error
            if (isFileOpenForWriteOptions(opts)) {
                throw await this.toFileSystemProviderWriteError(resource, error);
            }
            else {
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
    async close(fd) {
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
                }
                catch (error) {
                    // In some exotic setups it is well possible that node fails to sync
                    // In that case we disable flushing and log the error to our logger
                    DiskFileSystemProvider.configureFlushOnWrite(false);
                    this.logService.error(error);
                }
            }
            return await Promises.close(fd);
        }
        catch (error) {
            throw this.toFileSystemProviderError(error);
        }
        finally {
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
    async read(fd, pos, data, offset, length) {
        const normalizedPos = this.normalizePos(fd, pos);
        let bytesRead = null;
        try {
            bytesRead = (await Promises.read(fd, data, offset, length, normalizedPos)).bytesRead;
        }
        catch (error) {
            throw this.toFileSystemProviderError(error);
        }
        finally {
            this.updatePos(fd, normalizedPos, bytesRead);
        }
        return bytesRead;
    }
    normalizePos(fd, pos) {
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
    updatePos(fd, pos, bytesLength) {
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
    async write(fd, pos, data, offset, length) {
        // We know at this point that the file to write to is truncated and thus empty
        // if the write now fails, the file remains empty. as such we really try hard
        // to ensure the write succeeds by retrying up to three times.
        return retry(() => this.doWrite(fd, pos, data, offset, length), 100 /* ms delay */, 3 /* retries */);
    }
    async doWrite(fd, pos, data, offset, length) {
        const normalizedPos = this.normalizePos(fd, pos);
        let bytesWritten = null;
        try {
            bytesWritten = (await Promises.write(fd, data, offset, length, normalizedPos)).bytesWritten;
        }
        catch (error) {
            throw await this.toFileSystemProviderWriteError(this.writeHandles.get(fd), error);
        }
        finally {
            this.updatePos(fd, normalizedPos, bytesWritten);
        }
        return bytesWritten;
    }
    //#endregion
    //#region Move/Copy/Delete/Create Folder
    async mkdir(resource) {
        try {
            await promises.mkdir(this.toFilePath(resource));
        }
        catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }
    async delete(resource, opts) {
        try {
            const filePath = this.toFilePath(resource);
            if (opts.recursive) {
                let rmMoveToPath = undefined;
                if (opts?.atomic !== false && opts.atomic.postfix) {
                    rmMoveToPath = join(dirname(filePath), `${basename(filePath)}${opts.atomic.postfix}`);
                }
                await Promises.rm(filePath, RimRafMode.MOVE, rmMoveToPath);
            }
            else {
                try {
                    await promises.unlink(filePath);
                }
                catch (unlinkError) {
                    // `fs.unlink` will throw when used on directories
                    // we try to detect this error and then see if the
                    // provided resource is actually a directory. in that
                    // case we use `fs.rmdir` to delete the directory.
                    if (unlinkError.code === 'EPERM' || unlinkError.code === 'EISDIR') {
                        let isDirectory = false;
                        try {
                            const { stat, symbolicLink } = await SymlinkSupport.stat(filePath);
                            isDirectory = stat.isDirectory() && !symbolicLink;
                        }
                        catch (statError) {
                            // ignore
                        }
                        if (isDirectory) {
                            await promises.rmdir(filePath);
                        }
                        else {
                            throw unlinkError;
                        }
                    }
                    else {
                        throw unlinkError;
                    }
                }
            }
        }
        catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }
    async rename(from, to, opts) {
        const fromFilePath = this.toFilePath(from);
        const toFilePath = this.toFilePath(to);
        if (fromFilePath === toFilePath) {
            return; // simulate node.js behaviour here and do a no-op if paths match
        }
        try {
            // Validate the move operation can perform
            await this.validateMoveCopy(from, to, 'move', opts.overwrite);
            // Rename
            await Promises.rename(fromFilePath, toFilePath);
        }
        catch (error) {
            // Rewrite some typical errors that can happen especially around symlinks
            // to something the user can better understand
            if (error.code === 'EINVAL' || error.code === 'EBUSY' || error.code === 'ENAMETOOLONG') {
                error = new Error(localize('moveError', "Unable to move '{0}' into '{1}' ({2}).", basename(fromFilePath), basename(dirname(toFilePath)), error.toString()));
            }
            throw this.toFileSystemProviderError(error);
        }
    }
    async copy(from, to, opts) {
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
        }
        catch (error) {
            // Rewrite some typical errors that can happen especially around symlinks
            // to something the user can better understand
            if (error.code === 'EINVAL' || error.code === 'EBUSY' || error.code === 'ENAMETOOLONG') {
                error = new Error(localize('copyError', "Unable to copy '{0}' into '{1}' ({2}).", basename(fromFilePath), basename(dirname(toFilePath)), error.toString()));
            }
            throw this.toFileSystemProviderError(error);
        }
    }
    async validateMoveCopy(from, to, mode, overwrite) {
        const fromFilePath = this.toFilePath(from);
        const toFilePath = this.toFilePath(to);
        let isSameResourceWithDifferentPathCase = false;
        const isPathCaseSensitive = !!(this.capabilities & 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */);
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
        }
        else {
            await this.delete(to, { recursive: true, useTrash: false, atomic: false });
        }
    }
    //#endregion
    //#region Clone File
    async cloneFile(from, to) {
        return this.doCloneFile(from, to, false /* optimistically assume parent folders exist */);
    }
    async doCloneFile(from, to, mkdir) {
        const fromFilePath = this.toFilePath(from);
        const toFilePath = this.toFilePath(to);
        const isPathCaseSensitive = !!(this.capabilities & 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */);
        if (isEqual(fromFilePath, toFilePath, !isPathCaseSensitive)) {
            return; // cloning is only supported `from` and `to` are different files
        }
        // Implement clone by using `fs.copyFile`, however setup locks
        // for both `from` and `to` because node.js does not ensure
        // this to be an atomic operation
        const locks = new DisposableStore();
        try {
            locks.add(await this.createResourceLock(from));
            locks.add(await this.createResourceLock(to));
            if (mkdir) {
                await promises.mkdir(dirname(toFilePath), { recursive: true });
            }
            await promises.copyFile(fromFilePath, toFilePath);
        }
        catch (error) {
            if (error.code === 'ENOENT' && !mkdir) {
                return this.doCloneFile(from, to, true);
            }
            throw this.toFileSystemProviderError(error);
        }
        finally {
            locks.dispose();
        }
    }
    //#endregion
    //#region File Watching
    createUniversalWatcher(onChange, onLogMessage, verboseLogging) {
        return new UniversalWatcherClient(changes => onChange(changes), msg => onLogMessage(msg), verboseLogging);
    }
    createNonRecursiveWatcher(onChange, onLogMessage, verboseLogging) {
        return new NodeJSWatcherClient(changes => onChange(changes), msg => onLogMessage(msg), verboseLogging);
    }
    //#endregion
    //#region Helpers
    toFileSystemProviderError(error) {
        if (error instanceof FileSystemProviderError) {
            return error; // avoid double conversion
        }
        let resultError = error;
        let code;
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
    async toFileSystemProviderWriteError(resource, error) {
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
            }
            catch (error) {
                this.logService.trace(error); // ignore - return original error
            }
        }
        return fileSystemProviderWriteError;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlza0ZpbGVTeXN0ZW1Qcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2ZpbGVzL25vZGUvZGlza0ZpbGVTeXN0ZW1Qcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQVMsU0FBUyxFQUFFLFFBQVEsRUFBRSxNQUFNLElBQUksQ0FBQztBQUNoRCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUMxRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFMUQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRCxPQUFPLEVBQUUsZUFBZSxFQUFlLFlBQVksRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQy9GLE9BQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDdEUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLFFBQVEsRUFBRSxRQUFRLElBQUksaUJBQWlCLEVBQUUsT0FBTyxJQUFJLGdCQUFnQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDckosT0FBTyxFQUFFLGtCQUFrQixFQUF3QixNQUFNLGdDQUFnQyxDQUFDO0FBRTFGLE9BQU8sRUFBVyxRQUFRLEVBQUUsVUFBVSxFQUFFLGNBQWMsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQzFGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUMzQyxPQUFPLEVBQUUsNkJBQTZCLEVBQStJLHVCQUF1QixFQUFFLDJCQUEyQixFQUFFLFFBQVEsRUFBeVQseUJBQXlCLEVBQVMsY0FBYyxFQUFtSyxNQUFNLG9CQUFvQixDQUFDO0FBQzF4QixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUVyRCxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUNwRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUV2RSxNQUFNLE9BQU8sc0JBQXVCLFNBQVEsOEJBQThCO0lBQTFFOztRQWFDLDJCQUEyQjtRQUVsQiw0QkFBdUIsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBMEg5QyxZQUFZO1FBRVosOEJBQThCO1FBRWIsa0JBQWEsR0FBRyxJQUFJLFdBQVcsQ0FBVSxRQUFRLENBQUMsRUFBRSxDQUFDLDBCQUEwQixDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUEySzVHLG1CQUFjLEdBQUcsSUFBSSxHQUFHLEVBQWtCLENBQUM7UUFDM0Msb0JBQWUsR0FBRyxJQUFJLEdBQUcsRUFBdUIsQ0FBQztRQUVqRCxpQkFBWSxHQUFHLElBQUksR0FBRyxFQUFlLENBQUM7UUEwaUJ2RCxZQUFZO0lBQ2IsQ0FBQzthQTMxQmUsNkJBQXdCLEdBQUcsS0FBSyxBQUFSLENBQVMsR0FBQyw2Q0FBNkM7SUFPOUYsSUFBSSxZQUFZO1FBQ2YsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUN6QixJQUFJLENBQUMsYUFBYTtnQkFDakI7aUZBQ3FEOzBFQUNSO3lFQUNBOzZFQUNDOzBFQUNMOzZFQUNJOzhFQUNDOytFQUNDO3lFQUNQOzRFQUNHLENBQUM7WUFFN0MsSUFBSSxPQUFPLEVBQUUsQ0FBQztnQkFDYixJQUFJLENBQUMsYUFBYSwrREFBb0QsQ0FBQztZQUN4RSxDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQztJQUMzQixDQUFDO0lBRUQsWUFBWTtJQUVaLGlDQUFpQztJQUVqQyxLQUFLLENBQUMsSUFBSSxDQUFDLFFBQWE7UUFDdkIsSUFBSSxDQUFDO1lBQ0osTUFBTSxFQUFFLElBQUksRUFBRSxZQUFZLEVBQUUsR0FBRyxNQUFNLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsc0RBQXNEO1lBRTNJLElBQUksV0FBVyxHQUErQixTQUFTLENBQUM7WUFDeEQsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQy9CLFdBQVcsR0FBRyxjQUFjLENBQUMsTUFBTSxDQUFDO1lBQ3JDLENBQUM7WUFDRCxJQUNDLElBQUksQ0FBQyxJQUFJLEdBQUcsU0FBUyxDQUFDLE9BQU87Z0JBQzdCLElBQUksQ0FBQyxJQUFJLEdBQUcsU0FBUyxDQUFDLE9BQU87Z0JBQzdCLElBQUksQ0FBQyxJQUFJLEdBQUcsU0FBUyxDQUFDLE9BQU8sRUFDNUIsQ0FBQztnQkFDRixXQUFXLEdBQUcsQ0FBQyxXQUFXLElBQUksQ0FBQyxDQUFDLEdBQUcsY0FBYyxDQUFDLFVBQVUsQ0FBQztZQUM5RCxDQUFDO1lBRUQsT0FBTztnQkFDTixJQUFJLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsWUFBWSxDQUFDO2dCQUNyQyxLQUFLLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsRUFBRSxnRUFBZ0U7Z0JBQ2pHLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRTtnQkFDM0IsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO2dCQUNmLFdBQVc7YUFDWCxDQUFDO1FBQ0gsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDaEIsTUFBTSxJQUFJLENBQUMseUJBQXlCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDN0MsQ0FBQztJQUNGLENBQUM7SUFFTyxLQUFLLENBQUMsZUFBZSxDQUFDLFFBQWE7UUFDMUMsSUFBSSxDQUFDO1lBQ0osT0FBTyxNQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDbEMsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDaEIsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztJQUNGLENBQUM7SUFFRCxLQUFLLENBQUMsUUFBUSxDQUFDLFFBQWE7UUFDM0IsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUUzQyxPQUFPLFFBQVEsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDcEMsQ0FBQztJQUVELEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBYTtRQUMxQixJQUFJLENBQUM7WUFDSixNQUFNLFFBQVEsR0FBRyxNQUFNLFFBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLGFBQWEsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBRTVGLE1BQU0sTUFBTSxHQUF5QixFQUFFLENBQUM7WUFDeEMsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFDLEtBQUssRUFBQyxFQUFFO2dCQUM1QyxJQUFJLENBQUM7b0JBQ0osSUFBSSxJQUFjLENBQUM7b0JBQ25CLElBQUksS0FBSyxDQUFDLGNBQWMsRUFBRSxFQUFFLENBQUM7d0JBQzVCLElBQUksR0FBRyxDQUFDLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsa0RBQWtEO29CQUNsSCxDQUFDO3lCQUFNLENBQUM7d0JBQ1AsSUFBSSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQzNCLENBQUM7b0JBRUQsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDakMsQ0FBQztnQkFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO29CQUNoQixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLDZFQUE2RTtnQkFDNUcsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFSixPQUFPLE1BQU0sQ0FBQztRQUNmLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2hCLE1BQU0sSUFBSSxDQUFDLHlCQUF5QixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzdDLENBQUM7SUFDRixDQUFDO0lBRU8sTUFBTSxDQUFDLEtBQXNCLEVBQUUsWUFBb0M7UUFFMUUsNkRBQTZEO1FBQzdELHNFQUFzRTtRQUN0RSxtRUFBbUU7UUFDbkUsSUFBSSxJQUFjLENBQUM7UUFDbkIsSUFBSSxZQUFZLEVBQUUsUUFBUSxFQUFFLENBQUM7WUFDNUIsSUFBSSxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUM7UUFDekIsQ0FBQzthQUFNLElBQUksS0FBSyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUM7WUFDM0IsSUFBSSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUM7UUFDdEIsQ0FBQzthQUFNLElBQUksS0FBSyxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUM7WUFDaEMsSUFBSSxHQUFHLFFBQVEsQ0FBQyxTQUFTLENBQUM7UUFDM0IsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQztRQUN6QixDQUFDO1FBRUQsd0RBQXdEO1FBQ3hELElBQUksWUFBWSxFQUFFLENBQUM7WUFDbEIsSUFBSSxJQUFJLFFBQVEsQ0FBQyxZQUFZLENBQUM7UUFDL0IsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQVFPLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxRQUFhO1FBQzdDLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDM0MsSUFBSSxDQUFDLFNBQVMsQ0FBQyx1RkFBdUYsUUFBUSxHQUFHLENBQUMsQ0FBQztRQUVuSCx3RUFBd0U7UUFDeEUseUVBQXlFO1FBQ3pFLFdBQVc7UUFDWCxJQUFJLFlBQVksR0FBd0IsU0FBUyxDQUFDO1FBQ2xELE9BQU8sWUFBWSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7WUFDeEQsSUFBSSxDQUFDLFNBQVMsQ0FBQywrRkFBK0YsUUFBUSxHQUFHLENBQUMsQ0FBQztZQUMzSCxNQUFNLFlBQVksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUMzQixDQUFDO1FBRUQsWUFBWTtRQUNaLE1BQU0sT0FBTyxHQUFHLElBQUksT0FBTyxFQUFFLENBQUM7UUFDOUIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBRTFDLElBQUksQ0FBQyxTQUFTLENBQUMsZ0ZBQWdGLFFBQVEsR0FBRyxDQUFDLENBQUM7UUFFNUcsT0FBTyxZQUFZLENBQUMsR0FBRyxFQUFFO1lBQ3hCLElBQUksQ0FBQyxTQUFTLENBQUMsOEVBQThFLFFBQVEsR0FBRyxDQUFDLENBQUM7WUFFMUcsa0NBQWtDO1lBQ2xDLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEtBQUssT0FBTyxFQUFFLENBQUM7Z0JBQ2xELElBQUksQ0FBQyxTQUFTLENBQUMsbUdBQW1HLFFBQVEsR0FBRyxDQUFDLENBQUM7Z0JBQy9ILElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ3JDLENBQUM7WUFFRCxZQUFZO1lBQ1osSUFBSSxDQUFDLFNBQVMsQ0FBQyxtRkFBbUYsUUFBUSxHQUFHLENBQUMsQ0FBQztZQUMvRyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDaEIsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsS0FBSyxDQUFDLFFBQVEsQ0FBQyxRQUFhLEVBQUUsT0FBZ0M7UUFDN0QsSUFBSSxJQUFJLEdBQTRCLFNBQVMsQ0FBQztRQUM5QyxJQUFJLENBQUM7WUFDSixJQUFJLE9BQU8sRUFBRSxNQUFNLEVBQUUsQ0FBQztnQkFDckIsSUFBSSxDQUFDLFNBQVMsQ0FBQyw2REFBNkQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBRTFHLDRDQUE0QztnQkFDNUMsOENBQThDO2dCQUM5Qyx5Q0FBeUM7Z0JBQ3pDLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUNoRCxDQUFDO1lBRUQsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUUzQyxPQUFPLE1BQU0sUUFBUSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMxQyxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNoQixNQUFNLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM3QyxDQUFDO2dCQUFTLENBQUM7WUFDVixJQUFJLEVBQUUsT0FBTyxFQUFFLENBQUM7UUFDakIsQ0FBQztJQUNGLENBQUM7SUFFTyxTQUFTLENBQUMsR0FBVztRQUM1QixJQUFJLHNCQUFzQixDQUFDLHdCQUF3QixFQUFFLENBQUM7WUFDckQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDNUIsQ0FBQztJQUNGLENBQUM7SUFFRCxjQUFjLENBQUMsUUFBYSxFQUFFLElBQTRCLEVBQUUsS0FBd0I7UUFDbkYsTUFBTSxNQUFNLEdBQUcsa0JBQWtCLENBQWEsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVySCxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUU7WUFDL0QsR0FBRyxJQUFJO1lBQ1AsVUFBVSxFQUFFLEdBQUcsR0FBRyxJQUFJLENBQUMsd0RBQXdEO1NBQy9FLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFVixPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7SUFFRCxLQUFLLENBQUMsU0FBUyxDQUFDLFFBQWEsRUFBRSxPQUFtQixFQUFFLElBQXVCO1FBQzFFLElBQUksSUFBSSxFQUFFLE1BQU0sS0FBSyxLQUFLLElBQUksSUFBSSxFQUFFLE1BQU0sRUFBRSxPQUFPLElBQUksTUFBTSxJQUFJLENBQUMsa0JBQWtCLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztZQUNoRyxPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxFQUFFLEdBQUcsaUJBQWlCLENBQUMsUUFBUSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN0SixDQUFDO2FBQU0sQ0FBQztZQUNQLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ2xELENBQUM7SUFDRixDQUFDO0lBRU8sS0FBSyxDQUFDLGtCQUFrQixDQUFDLFFBQWE7UUFDN0MsSUFBSSxDQUFDO1lBQ0osTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUMzQyxNQUFNLEVBQUUsWUFBWSxFQUFFLEdBQUcsTUFBTSxjQUFjLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzdELElBQUksWUFBWSxFQUFFLENBQUM7Z0JBQ2xCLDJEQUEyRDtnQkFDM0QsMERBQTBEO2dCQUMxRCx1REFBdUQ7Z0JBQ3ZELHlEQUF5RDtnQkFDekQsaUNBQWlDO2dCQUNqQyxPQUFPLEtBQUssQ0FBQztZQUNkLENBQUM7UUFDRixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNoQiwyREFBMkQ7UUFDNUQsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDLENBQUMsMkJBQTJCO0lBQ3pDLENBQUM7SUFFTyxLQUFLLENBQUMsaUJBQWlCLENBQUMsUUFBYSxFQUFFLFlBQWlCLEVBQUUsT0FBbUIsRUFBRSxJQUF1QjtRQUU3RyxvREFBb0Q7UUFDcEQsc0RBQXNEO1FBQ3RELGlCQUFpQjtRQUVqQixNQUFNLEtBQUssR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBRXBDLElBQUksQ0FBQztZQUNKLEtBQUssQ0FBQyxHQUFHLENBQUMsTUFBTSxJQUFJLENBQUMsa0JBQWtCLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztZQUNuRCxLQUFLLENBQUMsR0FBRyxDQUFDLE1BQU0sSUFBSSxDQUFDLGtCQUFrQixDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7WUFFdkQsK0JBQStCO1lBQy9CLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxZQUFZLEVBQUUsT0FBTyxFQUFFLEVBQUUsR0FBRyxJQUFJLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLEVBQUUsSUFBSSxDQUFDLHdCQUF3QixDQUFDLENBQUM7WUFFekgsSUFBSSxDQUFDO2dCQUVKLGdEQUFnRDtnQkFDaEQsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxRQUFRLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUVoRSxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFFaEIsa0NBQWtDO2dCQUNsQyxJQUFJLENBQUM7b0JBQ0osTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztnQkFDdkYsQ0FBQztnQkFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO29CQUNoQixnREFBZ0Q7Z0JBQ2pELENBQUM7Z0JBRUQsTUFBTSxLQUFLLENBQUM7WUFDYixDQUFDO1FBQ0YsQ0FBQztnQkFBUyxDQUFDO1lBQ1YsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2pCLENBQUM7SUFDRixDQUFDO0lBRU8sS0FBSyxDQUFDLFdBQVcsQ0FBQyxRQUFhLEVBQUUsT0FBbUIsRUFBRSxJQUF1QixFQUFFLGdCQUEwQjtRQUNoSCxJQUFJLE1BQU0sR0FBdUIsU0FBUyxDQUFDO1FBQzNDLElBQUksQ0FBQztZQUNKLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFM0MsMkRBQTJEO1lBQzNELElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUNyQyxNQUFNLFVBQVUsR0FBRyxNQUFNLFFBQVEsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQ25ELElBQUksVUFBVSxFQUFFLENBQUM7b0JBQ2hCLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7d0JBQ3JCLE1BQU0sNkJBQTZCLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRSxxQkFBcUIsQ0FBQyxFQUFFLDJCQUEyQixDQUFDLFVBQVUsQ0FBQyxDQUFDO29CQUM1SCxDQUFDO2dCQUNGLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO3dCQUNsQixNQUFNLDZCQUE2QixDQUFDLFFBQVEsQ0FBQyxlQUFlLEVBQUUscUJBQXFCLENBQUMsRUFBRSwyQkFBMkIsQ0FBQyxZQUFZLENBQUMsQ0FBQztvQkFDakksQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQztZQUVELE9BQU87WUFDUCxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1lBRWpILHdCQUF3QjtZQUN4QixNQUFNLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUM3RCxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNoQixNQUFNLE1BQU0sSUFBSSxDQUFDLDhCQUE4QixDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNsRSxDQUFDO2dCQUFTLENBQUM7WUFDVixJQUFJLE9BQU8sTUFBTSxLQUFLLFFBQVEsRUFBRSxDQUFDO2dCQUNoQyxNQUFNLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDMUIsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO2FBT2MsYUFBUSxHQUFHLElBQUksQUFBUCxDQUFRO0lBRS9CLE1BQU0sQ0FBQyxxQkFBcUIsQ0FBQyxPQUFnQjtRQUM1QyxzQkFBc0IsQ0FBQyxRQUFRLEdBQUcsT0FBTyxDQUFDO0lBQzNDLENBQUM7SUFFRCxLQUFLLENBQUMsSUFBSSxDQUFDLFFBQWEsRUFBRSxJQUFzQixFQUFFLGdCQUEwQjtRQUMzRSxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRTNDLHFEQUFxRDtRQUNyRCxxREFBcUQ7UUFDckQseURBQXlEO1FBQ3pELElBQUksSUFBSSxHQUE0QixTQUFTLENBQUM7UUFDOUMsSUFBSSx5QkFBeUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDMUQsSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2hELENBQUM7UUFFRCxJQUFJLEVBQUUsR0FBdUIsU0FBUyxDQUFDO1FBQ3ZDLElBQUksQ0FBQztZQUVKLG9EQUFvRDtZQUNwRCxJQUFJLHlCQUF5QixDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDcEQsSUFBSSxDQUFDO29CQUNKLE1BQU0sRUFBRSxJQUFJLEVBQUUsR0FBRyxNQUFNLGNBQWMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7b0JBQ3JELElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsS0FBSyxDQUFDLDRDQUE0QyxDQUFDLEVBQUUsQ0FBQzt3QkFDdkUsTUFBTSxRQUFRLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDO29CQUNuRCxDQUFDO2dCQUNGLENBQUM7Z0JBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztvQkFDaEIsSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO3dCQUM3QixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLHdDQUF3QztvQkFDdkUsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQztZQUVELGtFQUFrRTtZQUNsRSxJQUFJLFNBQVMsSUFBSSx5QkFBeUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDbEUsSUFBSSxDQUFDO29CQUVKLDhFQUE4RTtvQkFDOUUsMEVBQTBFO29CQUMxRSxXQUFXO29CQUNYLGtCQUFrQjtvQkFDbEIsbURBQW1EO29CQUNuRCxvREFBb0Q7b0JBQ3BELEVBQUUsR0FBRyxNQUFNLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO29CQUV6QywyRUFBMkU7b0JBQzNFLE1BQU0sUUFBUSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ2pDLENBQUM7Z0JBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztvQkFDaEIsSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO3dCQUM3QixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLHdDQUF3QztvQkFDdkUsQ0FBQztvQkFFRCxvREFBb0Q7b0JBQ3BELElBQUksT0FBTyxFQUFFLEtBQUssUUFBUSxFQUFFLENBQUM7d0JBQzVCLElBQUksQ0FBQzs0QkFDSixNQUFNLFFBQVEsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUM7d0JBQzFCLENBQUM7d0JBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQzs0QkFDaEIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyx3Q0FBd0M7d0JBQ3ZFLENBQUM7d0JBRUQsOENBQThDO3dCQUM5QyxFQUFFLEdBQUcsU0FBUyxDQUFDO29CQUNoQixDQUFDO2dCQUNGLENBQUM7WUFDRixDQUFDO1lBRUQsSUFBSSxPQUFPLEVBQUUsS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDNUIsRUFBRSxHQUFHLE1BQU0sUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUseUJBQXlCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDbkUsc0VBQXNFO29CQUN0RSwyREFBMkQ7b0JBQzNELDJDQUEyQztvQkFDM0MsMkRBQTJEO29CQUMzRCxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztvQkFDM0IscURBQXFEO29CQUNyRCxxREFBcUQ7b0JBQ3JELFlBQVk7b0JBQ1osR0FBRyxDQUNILENBQUM7WUFDSCxDQUFDO1FBRUYsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFFaEIsK0NBQStDO1lBQy9DLDhDQUE4QztZQUM5QyxJQUFJLEVBQUUsT0FBTyxFQUFFLENBQUM7WUFFaEIsd0NBQXdDO1lBQ3hDLElBQUkseUJBQXlCLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDckMsTUFBTSxNQUFNLElBQUksQ0FBQyw4QkFBOEIsQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDbEUsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE1BQU0sSUFBSSxDQUFDLHlCQUF5QixDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzdDLENBQUM7UUFDRixDQUFDO1FBRUQsNERBQTREO1FBQzVELDBEQUEwRDtRQUMxRCwwREFBMEQ7UUFDMUQsMERBQTBEO1FBQzFELDBEQUEwRDtRQUMxRCxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFL0IsaURBQWlEO1FBQ2pELElBQUkseUJBQXlCLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUNyQyxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDckMsQ0FBQztRQUVELElBQUksSUFBSSxFQUFFLENBQUM7WUFDVixNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUVsRCxtREFBbUQ7WUFDbkQsSUFBSSxDQUFDLFNBQVMsQ0FBQywrREFBK0QsRUFBRSxLQUFLLFFBQVEsR0FBRyxDQUFDLENBQUM7WUFDbEcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBRW5DLHNEQUFzRDtZQUN0RCxvREFBb0Q7WUFDcEQsdURBQXVEO1lBQ3ZELHNEQUFzRDtZQUN0RCx5Q0FBeUM7WUFDekMsb0RBQW9EO1lBQ3BELElBQUksWUFBWSxFQUFFLENBQUM7Z0JBQ2xCLElBQUksQ0FBQyxTQUFTLENBQUMsc0dBQXNHLEVBQUUsS0FBSyxRQUFRLEdBQUcsQ0FBQyxDQUFDO2dCQUN6SSxZQUFZLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDeEIsQ0FBQztRQUNGLENBQUM7UUFFRCxPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7SUFFRCxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQVU7UUFFckIsd0RBQXdEO1FBQ3hELCtEQUErRDtRQUMvRCwwREFBMEQ7UUFDMUQsMkRBQTJEO1FBQzNELDhEQUE4RDtRQUM5RCw4QkFBOEI7UUFDOUIsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFbkQsSUFBSSxDQUFDO1lBRUosMkNBQTJDO1lBQzNDLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBRS9CLDBEQUEwRDtZQUMxRCw2Q0FBNkM7WUFDN0MsSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxzQkFBc0IsQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDckUsSUFBSSxDQUFDO29CQUNKLE1BQU0sUUFBUSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGtEQUFrRDtnQkFDakYsQ0FBQztnQkFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO29CQUNoQixvRUFBb0U7b0JBQ3BFLG1FQUFtRTtvQkFDbkUsc0JBQXNCLENBQUMscUJBQXFCLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQ3BELElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUM5QixDQUFDO1lBQ0YsQ0FBQztZQUVELE9BQU8sTUFBTSxRQUFRLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2pDLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2hCLE1BQU0sSUFBSSxDQUFDLHlCQUF5QixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzdDLENBQUM7Z0JBQVMsQ0FBQztZQUNWLElBQUksYUFBYSxFQUFFLENBQUM7Z0JBQ25CLElBQUksSUFBSSxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEtBQUssYUFBYSxFQUFFLENBQUM7b0JBQ3BELElBQUksQ0FBQyxTQUFTLENBQUMsbUZBQW1GLEVBQUUsRUFBRSxDQUFDLENBQUM7b0JBQ3hHLElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsa0RBQWtEO2dCQUNwRixDQUFDO2dCQUVELElBQUksQ0FBQyxTQUFTLENBQUMsa0VBQWtFLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQ3ZGLGFBQWEsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUN6QixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQVUsRUFBRSxHQUFXLEVBQUUsSUFBZ0IsRUFBRSxNQUFjLEVBQUUsTUFBYztRQUNuRixNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUVqRCxJQUFJLFNBQVMsR0FBa0IsSUFBSSxDQUFDO1FBQ3BDLElBQUksQ0FBQztZQUNKLFNBQVMsR0FBRyxDQUFDLE1BQU0sUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDdEYsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDaEIsTUFBTSxJQUFJLENBQUMseUJBQXlCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDN0MsQ0FBQztnQkFBUyxDQUFDO1lBQ1YsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEVBQUUsYUFBYSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzlDLENBQUM7UUFFRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRU8sWUFBWSxDQUFDLEVBQVUsRUFBRSxHQUFXO1FBRTNDLCtFQUErRTtRQUMvRSx5RUFBeUU7UUFDekUsNkVBQTZFO1FBQzdFLHlEQUF5RDtRQUN6RCxFQUFFO1FBQ0YsMEVBQTBFO1FBQzFFLGlFQUFpRTtRQUNqRSxJQUFJLEdBQUcsS0FBSyxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO1lBQ3pDLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUVELE9BQU8sR0FBRyxDQUFDO0lBQ1osQ0FBQztJQUVPLFNBQVMsQ0FBQyxFQUFVLEVBQUUsR0FBa0IsRUFBRSxXQUEwQjtRQUMzRSxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNqRCxJQUFJLE9BQU8sWUFBWSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBRXRDLG1FQUFtRTtZQUNuRSw4REFBOEQ7WUFDOUQscUVBQXFFO1lBQ3JFLHdCQUF3QjtZQUN4QixFQUFFO1lBQ0YsZ0ZBQWdGO1lBQ2hGLHNGQUFzRjtZQUN0RiwwQkFBMEI7WUFDMUIsSUFBSSxPQUFPLEdBQUcsS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDN0IsNkJBQTZCO1lBQzlCLENBQUM7WUFFRCxxRUFBcUU7WUFDckUsb0VBQW9FO1lBQ3BFLEVBQUU7WUFDRiwyREFBMkQ7WUFDM0Qsc0VBQXNFO1lBQ3RFLG1FQUFtRTtZQUNuRSxlQUFlO1lBQ2YsRUFBRTtZQUNGLDREQUE0RDtZQUM1RCx3RUFBd0U7WUFDeEUsdUVBQXVFO1lBQ3ZFLGlFQUFpRTtZQUNqRSxZQUFZO2lCQUNQLElBQUksT0FBTyxXQUFXLEtBQUssUUFBUSxFQUFFLENBQUM7Z0JBQzFDLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxZQUFZLEdBQUcsV0FBVyxDQUFDLENBQUM7WUFDekQsQ0FBQztZQUVELGtFQUFrRTtZQUNsRSxtRUFBbUU7WUFDbkUsaUNBQWlDO2lCQUM1QixDQUFDO2dCQUNMLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ2hDLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQyxLQUFLLENBQUMsRUFBVSxFQUFFLEdBQVcsRUFBRSxJQUFnQixFQUFFLE1BQWMsRUFBRSxNQUFjO1FBRXBGLDhFQUE4RTtRQUM5RSw2RUFBNkU7UUFDN0UsOERBQThEO1FBQzlELE9BQU8sS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQyxFQUFFLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQ3RHLENBQUM7SUFFTyxLQUFLLENBQUMsT0FBTyxDQUFDLEVBQVUsRUFBRSxHQUFXLEVBQUUsSUFBZ0IsRUFBRSxNQUFjLEVBQUUsTUFBYztRQUM5RixNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUVqRCxJQUFJLFlBQVksR0FBa0IsSUFBSSxDQUFDO1FBQ3ZDLElBQUksQ0FBQztZQUNKLFlBQVksR0FBRyxDQUFDLE1BQU0sUUFBUSxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUM7UUFDN0YsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDaEIsTUFBTSxNQUFNLElBQUksQ0FBQyw4QkFBOEIsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNuRixDQUFDO2dCQUFTLENBQUM7WUFDVixJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsRUFBRSxhQUFhLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFDakQsQ0FBQztRQUVELE9BQU8sWUFBWSxDQUFDO0lBQ3JCLENBQUM7SUFFRCxZQUFZO0lBRVosd0NBQXdDO0lBRXhDLEtBQUssQ0FBQyxLQUFLLENBQUMsUUFBYTtRQUN4QixJQUFJLENBQUM7WUFDSixNQUFNLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQ2pELENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2hCLE1BQU0sSUFBSSxDQUFDLHlCQUF5QixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzdDLENBQUM7SUFDRixDQUFDO0lBRUQsS0FBSyxDQUFDLE1BQU0sQ0FBQyxRQUFhLEVBQUUsSUFBd0I7UUFDbkQsSUFBSSxDQUFDO1lBQ0osTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUMzQyxJQUFJLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztnQkFDcEIsSUFBSSxZQUFZLEdBQXVCLFNBQVMsQ0FBQztnQkFDakQsSUFBSSxJQUFJLEVBQUUsTUFBTSxLQUFLLEtBQUssSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO29CQUNuRCxZQUFZLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRSxHQUFHLFFBQVEsQ0FBQyxRQUFRLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7Z0JBQ3ZGLENBQUM7Z0JBRUQsTUFBTSxRQUFRLENBQUMsRUFBRSxDQUFDLFFBQVEsRUFBRSxVQUFVLENBQUMsSUFBSSxFQUFFLFlBQVksQ0FBQyxDQUFDO1lBQzVELENBQUM7aUJBQU0sQ0FBQztnQkFDUCxJQUFJLENBQUM7b0JBQ0osTUFBTSxRQUFRLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUNqQyxDQUFDO2dCQUFDLE9BQU8sV0FBVyxFQUFFLENBQUM7b0JBRXRCLGtEQUFrRDtvQkFDbEQsa0RBQWtEO29CQUNsRCxxREFBcUQ7b0JBQ3JELGtEQUFrRDtvQkFFbEQsSUFBSSxXQUFXLENBQUMsSUFBSSxLQUFLLE9BQU8sSUFBSSxXQUFXLENBQUMsSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO3dCQUNuRSxJQUFJLFdBQVcsR0FBRyxLQUFLLENBQUM7d0JBQ3hCLElBQUksQ0FBQzs0QkFDSixNQUFNLEVBQUUsSUFBSSxFQUFFLFlBQVksRUFBRSxHQUFHLE1BQU0sY0FBYyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQzs0QkFDbkUsV0FBVyxHQUFHLElBQUksQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLFlBQVksQ0FBQzt3QkFDbkQsQ0FBQzt3QkFBQyxPQUFPLFNBQVMsRUFBRSxDQUFDOzRCQUNwQixTQUFTO3dCQUNWLENBQUM7d0JBRUQsSUFBSSxXQUFXLEVBQUUsQ0FBQzs0QkFDakIsTUFBTSxRQUFRLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO3dCQUNoQyxDQUFDOzZCQUFNLENBQUM7NEJBQ1AsTUFBTSxXQUFXLENBQUM7d0JBQ25CLENBQUM7b0JBQ0YsQ0FBQzt5QkFBTSxDQUFDO3dCQUNQLE1BQU0sV0FBVyxDQUFDO29CQUNuQixDQUFDO2dCQUNGLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDaEIsTUFBTSxJQUFJLENBQUMseUJBQXlCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDN0MsQ0FBQztJQUNGLENBQUM7SUFFRCxLQUFLLENBQUMsTUFBTSxDQUFDLElBQVMsRUFBRSxFQUFPLEVBQUUsSUFBMkI7UUFDM0QsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMzQyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRXZDLElBQUksWUFBWSxLQUFLLFVBQVUsRUFBRSxDQUFDO1lBQ2pDLE9BQU8sQ0FBQyxnRUFBZ0U7UUFDekUsQ0FBQztRQUVELElBQUksQ0FBQztZQUVKLDBDQUEwQztZQUMxQyxNQUFNLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7WUFFOUQsU0FBUztZQUNULE1BQU0sUUFBUSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDakQsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFFaEIseUVBQXlFO1lBQ3pFLDhDQUE4QztZQUM5QyxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssUUFBUSxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssT0FBTyxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssY0FBYyxFQUFFLENBQUM7Z0JBQ3hGLEtBQUssR0FBRyxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLHdDQUF3QyxFQUFFLFFBQVEsQ0FBQyxZQUFZLENBQUMsRUFBRSxRQUFRLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM3SixDQUFDO1lBRUQsTUFBTSxJQUFJLENBQUMseUJBQXlCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDN0MsQ0FBQztJQUNGLENBQUM7SUFFRCxLQUFLLENBQUMsSUFBSSxDQUFDLElBQVMsRUFBRSxFQUFPLEVBQUUsSUFBMkI7UUFDekQsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMzQyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRXZDLElBQUksWUFBWSxLQUFLLFVBQVUsRUFBRSxDQUFDO1lBQ2pDLE9BQU8sQ0FBQyxnRUFBZ0U7UUFDekUsQ0FBQztRQUVELElBQUksQ0FBQztZQUVKLDBDQUEwQztZQUMxQyxNQUFNLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7WUFFOUQsT0FBTztZQUNQLE1BQU0sUUFBUSxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsVUFBVSxFQUFFLEVBQUUsZ0JBQWdCLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUMzRSxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUVoQix5RUFBeUU7WUFDekUsOENBQThDO1lBQzlDLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxPQUFPLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxjQUFjLEVBQUUsQ0FBQztnQkFDeEYsS0FBSyxHQUFHLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxXQUFXLEVBQUUsd0NBQXdDLEVBQUUsUUFBUSxDQUFDLFlBQVksQ0FBQyxFQUFFLFFBQVEsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzdKLENBQUM7WUFFRCxNQUFNLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM3QyxDQUFDO0lBQ0YsQ0FBQztJQUVPLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFTLEVBQUUsRUFBTyxFQUFFLElBQXFCLEVBQUUsU0FBbUI7UUFDNUYsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMzQyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRXZDLElBQUksbUNBQW1DLEdBQUcsS0FBSyxDQUFDO1FBQ2hELE1BQU0sbUJBQW1CLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVksOERBQW1ELENBQUMsQ0FBQztRQUNyRyxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztZQUMxQixtQ0FBbUMsR0FBRyxPQUFPLENBQUMsWUFBWSxFQUFFLFVBQVUsRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUNqRyxDQUFDO1FBRUQsSUFBSSxtQ0FBbUMsRUFBRSxDQUFDO1lBRXpDLG9FQUFvRTtZQUNwRSwyREFBMkQ7WUFDM0QsSUFBSSxJQUFJLEtBQUssTUFBTSxFQUFFLENBQUM7Z0JBQ3JCLE1BQU0sNkJBQTZCLENBQUMsUUFBUSxDQUFDLHVCQUF1QixFQUFFLDZEQUE2RCxDQUFDLEVBQUUsMkJBQTJCLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDL0ssQ0FBQztZQUVELGlFQUFpRTtZQUNqRSw2Q0FBNkM7aUJBQ3hDLElBQUksSUFBSSxLQUFLLE1BQU0sRUFBRSxDQUFDO2dCQUMxQixPQUFPO1lBQ1IsQ0FBQztRQUNGLENBQUM7UUFFRCxtRUFBbUU7UUFDbkUsaUVBQWlFO1FBQ2pFLGlCQUFpQjtRQUVqQixNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbEQsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2YsTUFBTSw2QkFBNkIsQ0FBQyxRQUFRLENBQUMsMkJBQTJCLEVBQUUsa0NBQWtDLENBQUMsRUFBRSwyQkFBMkIsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUMxSixDQUFDO1FBRUQsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzlDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNiLE9BQU8sQ0FBQyx1Q0FBdUM7UUFDaEQsQ0FBQztRQUVELElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNoQixNQUFNLDZCQUE2QixDQUFDLFFBQVEsQ0FBQyx5QkFBeUIsRUFBRSxrR0FBa0csQ0FBQyxFQUFFLDJCQUEyQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3ROLENBQUM7UUFFRCx1Q0FBdUM7UUFDdkMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ2xGLE9BQU8sQ0FBQyx1RkFBdUY7UUFDaEcsQ0FBQzthQUFNLENBQUM7WUFDUCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQzVFLENBQUM7SUFDRixDQUFDO0lBRUQsWUFBWTtJQUVaLG9CQUFvQjtJQUVwQixLQUFLLENBQUMsU0FBUyxDQUFDLElBQVMsRUFBRSxFQUFPO1FBQ2pDLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxnREFBZ0QsQ0FBQyxDQUFDO0lBQzNGLENBQUM7SUFFTyxLQUFLLENBQUMsV0FBVyxDQUFDLElBQVMsRUFBRSxFQUFPLEVBQUUsS0FBYztRQUMzRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzNDLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFdkMsTUFBTSxtQkFBbUIsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSw4REFBbUQsQ0FBQyxDQUFDO1FBQ3JHLElBQUksT0FBTyxDQUFDLFlBQVksRUFBRSxVQUFVLEVBQUUsQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLENBQUM7WUFDN0QsT0FBTyxDQUFDLGdFQUFnRTtRQUN6RSxDQUFDO1FBRUQsOERBQThEO1FBQzlELDJEQUEyRDtRQUMzRCxpQ0FBaUM7UUFFakMsTUFBTSxLQUFLLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUVwQyxJQUFJLENBQUM7WUFDSixLQUFLLENBQUMsR0FBRyxDQUFDLE1BQU0sSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDL0MsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRTdDLElBQUksS0FBSyxFQUFFLENBQUM7Z0JBQ1gsTUFBTSxRQUFRLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsRUFBRSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQ2hFLENBQUM7WUFFRCxNQUFNLFFBQVEsQ0FBQyxRQUFRLENBQUMsWUFBWSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQ25ELENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2hCLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDdkMsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDekMsQ0FBQztZQUVELE1BQU0sSUFBSSxDQUFDLHlCQUF5QixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzdDLENBQUM7Z0JBQVMsQ0FBQztZQUNWLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNqQixDQUFDO0lBQ0YsQ0FBQztJQUVELFlBQVk7SUFFWix1QkFBdUI7SUFFYixzQkFBc0IsQ0FDL0IsUUFBMEMsRUFDMUMsWUFBd0MsRUFDeEMsY0FBdUI7UUFFdkIsT0FBTyxJQUFJLHNCQUFzQixDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxDQUFDO0lBQzNHLENBQUM7SUFFUyx5QkFBeUIsQ0FDbEMsUUFBMEMsRUFDMUMsWUFBd0MsRUFDeEMsY0FBdUI7UUFFdkIsT0FBTyxJQUFJLG1CQUFtQixDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxDQUFDO0lBQ3hHLENBQUM7SUFFRCxZQUFZO0lBRVosaUJBQWlCO0lBRVQseUJBQXlCLENBQUMsS0FBNEI7UUFDN0QsSUFBSSxLQUFLLFlBQVksdUJBQXVCLEVBQUUsQ0FBQztZQUM5QyxPQUFPLEtBQUssQ0FBQyxDQUFDLDBCQUEwQjtRQUN6QyxDQUFDO1FBRUQsSUFBSSxXQUFXLEdBQW1CLEtBQUssQ0FBQztRQUN4QyxJQUFJLElBQWlDLENBQUM7UUFDdEMsUUFBUSxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDcEIsS0FBSyxRQUFRO2dCQUNaLElBQUksR0FBRywyQkFBMkIsQ0FBQyxZQUFZLENBQUM7Z0JBQ2hELE1BQU07WUFDUCxLQUFLLFFBQVE7Z0JBQ1osSUFBSSxHQUFHLDJCQUEyQixDQUFDLGdCQUFnQixDQUFDO2dCQUNwRCxNQUFNO1lBQ1AsS0FBSyxTQUFTO2dCQUNiLElBQUksR0FBRywyQkFBMkIsQ0FBQyxpQkFBaUIsQ0FBQztnQkFDckQsTUFBTTtZQUNQLEtBQUssUUFBUTtnQkFDWixJQUFJLEdBQUcsMkJBQTJCLENBQUMsVUFBVSxDQUFDO2dCQUM5QyxNQUFNO1lBQ1AsS0FBSyxPQUFPLENBQUM7WUFDYixLQUFLLFFBQVE7Z0JBQ1osSUFBSSxHQUFHLDJCQUEyQixDQUFDLGFBQWEsQ0FBQztnQkFDakQsTUFBTTtZQUNQLEtBQUssMEJBQTBCO2dCQUM5QixXQUFXLEdBQUcsR0FBRyxLQUFLLENBQUMsT0FBTyx3RkFBd0YsQ0FBQztnQkFDdkgsSUFBSSxHQUFHLDJCQUEyQixDQUFDLE9BQU8sQ0FBQztnQkFDM0MsTUFBTTtZQUNQO2dCQUNDLElBQUksR0FBRywyQkFBMkIsQ0FBQyxPQUFPLENBQUM7UUFDN0MsQ0FBQztRQUVELE9BQU8sNkJBQTZCLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3pELENBQUM7SUFFTyxLQUFLLENBQUMsOEJBQThCLENBQUMsUUFBeUIsRUFBRSxLQUE0QjtRQUNuRyxJQUFJLDRCQUE0QixHQUFHLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUV6RSx1REFBdUQ7UUFDdkQsc0RBQXNEO1FBQ3RELFVBQVU7UUFDVixJQUFJLFFBQVEsSUFBSSw0QkFBNEIsQ0FBQyxJQUFJLEtBQUssMkJBQTJCLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDakcsSUFBSSxDQUFDO2dCQUNKLE1BQU0sRUFBRSxJQUFJLEVBQUUsR0FBRyxNQUFNLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO2dCQUN0RSxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxHQUFHLEtBQUssQ0FBQyw0Q0FBNEMsQ0FBQyxFQUFFLENBQUM7b0JBQ3ZFLDRCQUE0QixHQUFHLDZCQUE2QixDQUFDLEtBQUssRUFBRSwyQkFBMkIsQ0FBQyxlQUFlLENBQUMsQ0FBQztnQkFDbEgsQ0FBQztZQUNGLENBQUM7WUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO2dCQUNoQixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLGlDQUFpQztZQUNoRSxDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sNEJBQTRCLENBQUM7SUFDckMsQ0FBQyJ9