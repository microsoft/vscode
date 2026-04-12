/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../nls.js';
import { URI } from '../../../base/common/uri.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { basename, extname, normalize } from '../../../base/common/path.js';
import { isLinux } from '../../../base/common/platform.js';
import { extUri, extUriIgnorePathCase, joinPath } from '../../../base/common/resources.js';
import { newWriteableStream } from '../../../base/common/stream.js';
import { createFileSystemProviderError, FileSystemProviderError, FileSystemProviderErrorCode, FileType } from '../common/files.js';
import { WebFileSystemAccess, WebFileSystemObserver } from './webFileSystemAccess.js';
import { LogLevel } from '../../log/common/log.js';
export class HTMLFileSystemProvider extends Disposable {
    get capabilities() {
        if (!this._capabilities) {
            this._capabilities =
                2 /* FileSystemProviderCapabilities.FileReadWrite */ |
                    16 /* FileSystemProviderCapabilities.FileReadStream */;
            if (isLinux) {
                this._capabilities |= 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */;
            }
        }
        return this._capabilities;
    }
    //#endregion
    constructor(indexedDB, store, logService) {
        super();
        this.indexedDB = indexedDB;
        this.store = store;
        this.logService = logService;
        //#region Events (unsupported)
        this.onDidChangeCapabilities = Event.None;
        //#endregion
        //#region File Capabilities
        this.extUri = isLinux ? extUri : extUriIgnorePathCase;
        //#endregion
        //#region File Watching (unsupported)
        this._onDidChangeFileEmitter = this._register(new Emitter());
        this.onDidChangeFile = this._onDidChangeFileEmitter.event;
        //#endregion
        //#region File/Directoy Handle Registry
        this._files = new Map();
        this._directories = new Map();
    }
    //#region File Metadata Resolving
    async stat(resource) {
        try {
            const handle = await this.getHandle(resource);
            if (!handle) {
                throw this.createFileSystemProviderError(resource, 'No such file or directory, stat', FileSystemProviderErrorCode.FileNotFound);
            }
            if (WebFileSystemAccess.isFileSystemFileHandle(handle)) {
                const file = await handle.getFile();
                return {
                    type: FileType.File,
                    mtime: file.lastModified,
                    ctime: 0,
                    size: file.size
                };
            }
            return {
                type: FileType.Directory,
                mtime: 0,
                ctime: 0,
                size: 0
            };
        }
        catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }
    async readdir(resource) {
        try {
            const handle = await this.getDirectoryHandle(resource);
            if (!handle) {
                throw this.createFileSystemProviderError(resource, 'No such file or directory, readdir', FileSystemProviderErrorCode.FileNotFound);
            }
            const result = [];
            for await (const [name, child] of handle) {
                result.push([name, WebFileSystemAccess.isFileSystemFileHandle(child) ? FileType.File : FileType.Directory]);
            }
            return result;
        }
        catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }
    //#endregion
    //#region File Reading/Writing
    readFileStream(resource, opts, token) {
        const stream = newWriteableStream(data => VSBuffer.concat(data.map(data => VSBuffer.wrap(data))).buffer, {
            // Set a highWaterMark to prevent the stream
            // for file upload to produce large buffers
            // in-memory
            highWaterMark: 10
        });
        (async () => {
            try {
                const handle = await this.getFileHandle(resource);
                if (!handle) {
                    throw this.createFileSystemProviderError(resource, 'No such file or directory, readFile', FileSystemProviderErrorCode.FileNotFound);
                }
                const file = await handle.getFile();
                // Partial file: implemented simply via `readFile`
                if (typeof opts.length === 'number' || typeof opts.position === 'number') {
                    let buffer = new Uint8Array(await file.arrayBuffer());
                    if (typeof opts?.position === 'number') {
                        buffer = buffer.slice(opts.position);
                    }
                    if (typeof opts?.length === 'number') {
                        buffer = buffer.slice(0, opts.length);
                    }
                    stream.end(buffer);
                }
                // Entire file
                else {
                    const reader = file.stream().getReader();
                    let res = await reader.read();
                    while (!res.done) {
                        if (token.isCancellationRequested) {
                            break;
                        }
                        // Write buffer into stream but make sure to wait
                        // in case the `highWaterMark` is reached
                        await stream.write(res.value);
                        if (token.isCancellationRequested) {
                            break;
                        }
                        res = await reader.read();
                    }
                    stream.end(undefined);
                }
            }
            catch (error) {
                stream.error(this.toFileSystemProviderError(error));
                stream.end();
            }
        })();
        return stream;
    }
    async readFile(resource) {
        try {
            const handle = await this.getFileHandle(resource);
            if (!handle) {
                throw this.createFileSystemProviderError(resource, 'No such file or directory, readFile', FileSystemProviderErrorCode.FileNotFound);
            }
            const file = await handle.getFile();
            return new Uint8Array(await file.arrayBuffer());
        }
        catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }
    async writeFile(resource, content, opts) {
        try {
            let handle = await this.getFileHandle(resource);
            // Validate target unless { create: true, overwrite: true }
            if (!opts.create || !opts.overwrite) {
                if (handle) {
                    if (!opts.overwrite) {
                        throw this.createFileSystemProviderError(resource, 'File already exists, writeFile', FileSystemProviderErrorCode.FileExists);
                    }
                }
                else {
                    if (!opts.create) {
                        throw this.createFileSystemProviderError(resource, 'No such file, writeFile', FileSystemProviderErrorCode.FileNotFound);
                    }
                }
            }
            // Create target as needed
            if (!handle) {
                const parent = await this.getDirectoryHandle(this.extUri.dirname(resource));
                if (!parent) {
                    throw this.createFileSystemProviderError(resource, 'No such parent directory, writeFile', FileSystemProviderErrorCode.FileNotFound);
                }
                handle = await parent.getFileHandle(this.extUri.basename(resource), { create: true });
                if (!handle) {
                    throw this.createFileSystemProviderError(resource, 'Unable to create file , writeFile', FileSystemProviderErrorCode.Unknown);
                }
            }
            // Write to target overwriting any existing contents
            const writable = await handle.createWritable();
            await writable.write(content);
            await writable.close();
        }
        catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }
    //#endregion
    //#region Move/Copy/Delete/Create Folder
    async mkdir(resource) {
        try {
            const parent = await this.getDirectoryHandle(this.extUri.dirname(resource));
            if (!parent) {
                throw this.createFileSystemProviderError(resource, 'No such parent directory, mkdir', FileSystemProviderErrorCode.FileNotFound);
            }
            await parent.getDirectoryHandle(this.extUri.basename(resource), { create: true });
        }
        catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }
    async delete(resource, opts) {
        try {
            const parent = await this.getDirectoryHandle(this.extUri.dirname(resource));
            if (!parent) {
                throw this.createFileSystemProviderError(resource, 'No such parent directory, delete', FileSystemProviderErrorCode.FileNotFound);
            }
            return parent.removeEntry(this.extUri.basename(resource), { recursive: opts.recursive });
        }
        catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }
    async rename(from, to, opts) {
        try {
            if (this.extUri.isEqual(from, to)) {
                return; // no-op if the paths are the same
            }
            // Implement file rename by write + delete
            const fileHandle = await this.getFileHandle(from);
            if (fileHandle) {
                const file = await fileHandle.getFile();
                const contents = new Uint8Array(await file.arrayBuffer());
                await this.writeFile(to, contents, { create: true, overwrite: opts.overwrite, unlock: false, atomic: false });
                await this.delete(from, { recursive: false, useTrash: false, atomic: false });
            }
            // File API does not support any real rename otherwise
            else {
                throw this.createFileSystemProviderError(from, localize('fileSystemRenameError', "Rename is only supported for files."), FileSystemProviderErrorCode.Unavailable);
            }
        }
        catch (error) {
            throw this.toFileSystemProviderError(error);
        }
    }
    watch(resource, opts) {
        const disposables = new DisposableStore();
        this.doWatch(resource, opts, disposables).catch(error => this.logService.error(`[File Watcher ('FileSystemObserver')] Error: ${error} (${resource})`));
        return disposables;
    }
    async doWatch(resource, opts, disposables) {
        if (!WebFileSystemObserver.supported(globalThis)) {
            return;
        }
        const handle = await this.getHandle(resource);
        if (!handle || disposables.isDisposed) {
            return;
        }
        // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
        const observer = new globalThis.FileSystemObserver((records) => {
            if (disposables.isDisposed) {
                return;
            }
            const events = [];
            for (const record of records) {
                if (this.logService.getLevel() === LogLevel.Trace) {
                    this.logService.trace(`[File Watcher ('FileSystemObserver')] [${record.type}] ${joinPath(resource, ...record.relativePathComponents)}`);
                }
                switch (record.type) {
                    case 'appeared':
                        events.push({ resource: joinPath(resource, ...record.relativePathComponents), type: 1 /* FileChangeType.ADDED */ });
                        break;
                    case 'disappeared':
                        events.push({ resource: joinPath(resource, ...record.relativePathComponents), type: 2 /* FileChangeType.DELETED */ });
                        break;
                    case 'modified':
                        events.push({ resource: joinPath(resource, ...record.relativePathComponents), type: 0 /* FileChangeType.UPDATED */ });
                        break;
                    case 'errored':
                        this.logService.trace(`[File Watcher ('FileSystemObserver')] errored, disposing observer (${resource})`);
                        disposables.dispose();
                }
            }
            if (events.length) {
                this._onDidChangeFileEmitter.fire(events);
            }
        });
        try {
            await observer.observe(handle, opts.recursive ? { recursive: true } : undefined);
        }
        finally {
            if (disposables.isDisposed) {
                observer.disconnect();
            }
            else {
                disposables.add(toDisposable(() => observer.disconnect()));
            }
        }
    }
    registerFileHandle(handle) {
        return this.registerHandle(handle, this._files);
    }
    registerDirectoryHandle(handle) {
        return this.registerHandle(handle, this._directories);
    }
    get directories() {
        return this._directories.values();
    }
    async registerHandle(handle, map) {
        let handleId = `/${handle.name}`;
        // Compute a valid handle ID in case this exists already
        if (map.has(handleId) && !await map.get(handleId)?.isSameEntry(handle)) {
            const fileExt = extname(handle.name);
            const fileName = basename(handle.name, fileExt);
            let handleIdCounter = 1;
            do {
                handleId = `/${fileName}-${handleIdCounter++}${fileExt}`;
            } while (map.has(handleId) && !await map.get(handleId)?.isSameEntry(handle));
        }
        map.set(handleId, handle);
        // Remember in IndexDB for future lookup
        try {
            await this.indexedDB?.runInTransaction(this.store, 'readwrite', objectStore => objectStore.put(handle, handleId));
        }
        catch (error) {
            this.logService.error(error);
        }
        return URI.from({ scheme: Schemas.file, path: handleId });
    }
    async getHandle(resource) {
        // First: try to find a well known handle first
        let handle = await this.doGetHandle(resource);
        // Second: walk up parent directories and resolve handle if possible
        if (!handle) {
            const parent = await this.getDirectoryHandle(this.extUri.dirname(resource));
            if (parent) {
                const name = extUri.basename(resource);
                try {
                    handle = await parent.getFileHandle(name);
                }
                catch (error) {
                    try {
                        handle = await parent.getDirectoryHandle(name);
                    }
                    catch (error) {
                        // Ignore
                    }
                }
            }
        }
        return handle;
    }
    async getFileHandle(resource) {
        const handle = await this.doGetHandle(resource);
        if (handle instanceof FileSystemFileHandle) {
            return handle;
        }
        const parent = await this.getDirectoryHandle(this.extUri.dirname(resource));
        try {
            return await parent?.getFileHandle(extUri.basename(resource));
        }
        catch (error) {
            return undefined; // guard against possible DOMException
        }
    }
    async getDirectoryHandle(resource) {
        const handle = await this.doGetHandle(resource);
        if (handle instanceof FileSystemDirectoryHandle) {
            return handle;
        }
        const parentUri = this.extUri.dirname(resource);
        if (this.extUri.isEqual(parentUri, resource)) {
            return undefined; // return when root is reached to prevent infinite recursion
        }
        const parent = await this.getDirectoryHandle(parentUri);
        try {
            return await parent?.getDirectoryHandle(extUri.basename(resource));
        }
        catch (error) {
            return undefined; // guard against possible DOMException
        }
    }
    async doGetHandle(resource) {
        // We store file system handles with the `handle.name`
        // and as such require the resource to be on the root
        if (this.extUri.dirname(resource).path !== '/') {
            return undefined;
        }
        const handleId = resource.path.replace(/\/$/, ''); // remove potential slash from the end of the path
        // First: check if we have a known handle stored in memory
        const inMemoryHandle = this._files.get(handleId) ?? this._directories.get(handleId);
        if (inMemoryHandle) {
            return inMemoryHandle;
        }
        // Second: check if we have a persisted handle in IndexedDB
        const persistedHandle = await this.indexedDB?.runInTransaction(this.store, 'readonly', store => store.get(handleId));
        if (WebFileSystemAccess.isFileSystemHandle(persistedHandle)) {
            let hasPermissions = await persistedHandle.queryPermission() === 'granted';
            try {
                if (!hasPermissions) {
                    hasPermissions = await persistedHandle.requestPermission() === 'granted';
                }
            }
            catch (error) {
                this.logService.error(error); // this can fail with a DOMException
            }
            if (hasPermissions) {
                if (WebFileSystemAccess.isFileSystemFileHandle(persistedHandle)) {
                    this._files.set(handleId, persistedHandle);
                }
                else if (WebFileSystemAccess.isFileSystemDirectoryHandle(persistedHandle)) {
                    this._directories.set(handleId, persistedHandle);
                }
                return persistedHandle;
            }
        }
        // Third: fail with an error
        throw this.createFileSystemProviderError(resource, 'No file system handle registered', FileSystemProviderErrorCode.Unavailable);
    }
    //#endregion
    toFileSystemProviderError(error) {
        if (error instanceof FileSystemProviderError) {
            return error; // avoid double conversion
        }
        let code = FileSystemProviderErrorCode.Unknown;
        if (error.name === 'NotAllowedError') {
            error = new Error(localize('fileSystemNotAllowedError', "Insufficient permissions. Please retry and allow the operation."));
            code = FileSystemProviderErrorCode.Unavailable;
        }
        return createFileSystemProviderError(error, code);
    }
    createFileSystemProviderError(resource, msg, code) {
        return createFileSystemProviderError(new Error(`${msg} (${normalize(resource.path)})`), code);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaHRtbEZpbGVTeXN0ZW1Qcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2ZpbGVzL2Jyb3dzZXIvaHRtbEZpbGVTeXN0ZW1Qcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDM0MsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUUxRCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLFlBQVksRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzNHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUM1RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLE1BQU0sRUFBRSxvQkFBb0IsRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMzRixPQUFPLEVBQUUsa0JBQWtCLEVBQXdCLE1BQU0sZ0NBQWdDLENBQUM7QUFDMUYsT0FBTyxFQUFFLDZCQUE2QixFQUFxRyx1QkFBdUIsRUFBRSwyQkFBMkIsRUFBRSxRQUFRLEVBQXlLLE1BQU0sb0JBQW9CLENBQUM7QUFDN1ksT0FBTyxFQUE0QixtQkFBbUIsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBRWhILE9BQU8sRUFBZSxRQUFRLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUVoRSxN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