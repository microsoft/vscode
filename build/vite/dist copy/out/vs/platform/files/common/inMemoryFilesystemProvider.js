/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { VSBuffer } from '../../../base/common/buffer.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import * as resources from '../../../base/common/resources.js';
import { newWriteableStream } from '../../../base/common/stream.js';
import { FileSystemProviderErrorCode, FileType, createFileSystemProviderError, isFileOpenForWriteOptions } from './files.js';
class File {
    constructor(name) {
        this.type = FileType.File;
        this.ctime = Date.now();
        this.mtime = Date.now();
        this.size = 0;
        this.name = name;
    }
}
class Directory {
    constructor(name) {
        this.type = FileType.Directory;
        this.ctime = Date.now();
        this.mtime = Date.now();
        this.size = 0;
        this.name = name;
        this.entries = new Map();
    }
}
export class InMemoryFileSystemProvider extends Disposable {
    constructor() {
        super(...arguments);
        this.memoryFdCounter = 0;
        this.fdMemory = new Map();
        this._onDidChangeCapabilities = this._register(new Emitter());
        this.onDidChangeCapabilities = this._onDidChangeCapabilities.event;
        this._capabilities = 2 /* FileSystemProviderCapabilities.FileReadWrite */ | 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */ | 524288 /* FileSystemProviderCapabilities.FileAppend */ | 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */;
        this.root = new Directory('');
        // --- manage file events
        this._onDidChangeFile = this._register(new Emitter());
        this.onDidChangeFile = this._onDidChangeFile.event;
        this._bufferedChanges = [];
    }
    get capabilities() { return this._capabilities; }
    setReadOnly(readonly) {
        const isReadonly = !!(this._capabilities & 2048 /* FileSystemProviderCapabilities.Readonly */);
        if (readonly !== isReadonly) {
            this._capabilities = 2 /* FileSystemProviderCapabilities.FileReadWrite */ | 524288 /* FileSystemProviderCapabilities.FileAppend */ | 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */ | (readonly ? 2048 /* FileSystemProviderCapabilities.Readonly */ : 0);
            this._onDidChangeCapabilities.fire();
        }
    }
    // --- manage file metadata
    async stat(resource) {
        return this._lookup(resource, false);
    }
    async readdir(resource) {
        const entry = this._lookupAsDirectory(resource, false);
        const result = [];
        entry.entries.forEach((child, name) => result.push([name, child.type]));
        return result;
    }
    // --- manage file contents
    async readFile(resource) {
        const data = this._lookupAsFile(resource, false).data;
        if (data) {
            return data;
        }
        throw createFileSystemProviderError('file not found', FileSystemProviderErrorCode.FileNotFound);
    }
    readFileStream(resource) {
        const data = this._lookupAsFile(resource, false).data;
        const stream = newWriteableStream(data => VSBuffer.concat(data.map(data => VSBuffer.wrap(data))).buffer);
        stream.end(data);
        return stream;
    }
    async writeFile(resource, content, opts) {
        const basename = resources.basename(resource);
        const parent = this._lookupParentDirectory(resource);
        let entry = parent.entries.get(basename);
        if (entry instanceof Directory) {
            throw createFileSystemProviderError('file is directory', FileSystemProviderErrorCode.FileIsADirectory);
        }
        if (!entry && !opts.create) {
            throw createFileSystemProviderError('file not found', FileSystemProviderErrorCode.FileNotFound);
        }
        if (entry && opts.create && !opts.overwrite) {
            throw createFileSystemProviderError('file exists already', FileSystemProviderErrorCode.FileExists);
        }
        if (!entry) {
            entry = new File(basename);
            parent.entries.set(basename, entry);
            this._fireSoon({ type: 1 /* FileChangeType.ADDED */, resource });
        }
        entry.mtime = Date.now();
        if (opts.append) {
            entry.size += content.byteLength;
            const oldData = entry.data ?? new Uint8Array(0);
            const newData = new Uint8Array(oldData.byteLength + content.byteLength);
            newData.set(oldData, 0);
            newData.set(content, oldData.byteLength);
            entry.data = newData;
        }
        else {
            entry.size = content.byteLength;
            entry.data = content;
        }
        this._fireSoon({ type: 0 /* FileChangeType.UPDATED */, resource });
    }
    // file open/read/write/close
    open(resource, opts) {
        let file = this._lookup(resource, true);
        const write = isFileOpenForWriteOptions(opts);
        const append = write && !!opts.append;
        if (!file) {
            if (!write) {
                throw createFileSystemProviderError('file not found', FileSystemProviderErrorCode.FileNotFound);
            }
            // Create the file if opening for write
            const basename = resources.basename(resource);
            const parent = this._lookupParentDirectory(resource);
            file = new File(basename);
            file.data = new Uint8Array(0);
            parent.entries.set(basename, file);
            this._fireSoon({ type: 1 /* FileChangeType.ADDED */, resource });
        }
        else if (file instanceof Directory) {
            throw createFileSystemProviderError('file is directory', FileSystemProviderErrorCode.FileIsADirectory);
        }
        if (!file.data) {
            file.data = new Uint8Array(0);
        }
        const fd = this.memoryFdCounter++;
        this.fdMemory.set(fd, { file, resource, write, append });
        return Promise.resolve(fd);
    }
    close(fd) {
        const fdData = this.fdMemory.get(fd);
        if (fdData?.write) {
            // Update file metadata on close
            fdData.file.mtime = Date.now();
            fdData.file.size = fdData.file.data?.byteLength ?? 0;
            this._fireSoon({ type: 0 /* FileChangeType.UPDATED */, resource: fdData.resource });
        }
        this.fdMemory.delete(fd);
        return Promise.resolve();
    }
    read(fd, pos, data, offset, length) {
        const fdData = this.fdMemory.get(fd);
        if (!fdData) {
            throw createFileSystemProviderError(`No file with that descriptor open`, FileSystemProviderErrorCode.Unavailable);
        }
        if (!fdData.file.data) {
            return Promise.resolve(0);
        }
        const toWrite = VSBuffer.wrap(fdData.file.data).slice(pos, pos + length);
        data.set(toWrite.buffer, offset);
        return Promise.resolve(toWrite.byteLength);
    }
    write(fd, pos, data, offset, length) {
        const fdData = this.fdMemory.get(fd);
        if (!fdData) {
            throw createFileSystemProviderError(`No file with that descriptor open`, FileSystemProviderErrorCode.Unavailable);
        }
        const toWrite = VSBuffer.wrap(data).slice(offset, offset + length);
        fdData.file.data ??= new Uint8Array(0);
        // In append mode, always write at the end
        const writePos = fdData.append ? fdData.file.data.byteLength : pos;
        // Grow the buffer if needed
        const endPos = writePos + toWrite.byteLength;
        if (endPos > fdData.file.data.byteLength) {
            const newData = new Uint8Array(endPos);
            newData.set(fdData.file.data, 0);
            fdData.file.data = newData;
        }
        fdData.file.data.set(toWrite.buffer, writePos);
        return Promise.resolve(toWrite.byteLength);
    }
    // --- manage files/folders
    async rename(from, to, opts) {
        if (!opts.overwrite && this._lookup(to, true)) {
            throw createFileSystemProviderError('file exists already', FileSystemProviderErrorCode.FileExists);
        }
        const entry = this._lookup(from, false);
        const oldParent = this._lookupParentDirectory(from);
        const newParent = this._lookupParentDirectory(to);
        const newName = resources.basename(to);
        oldParent.entries.delete(entry.name);
        entry.name = newName;
        newParent.entries.set(newName, entry);
        this._fireSoon({ type: 2 /* FileChangeType.DELETED */, resource: from }, { type: 1 /* FileChangeType.ADDED */, resource: to });
    }
    async delete(resource, opts) {
        const dirname = resources.dirname(resource);
        const basename = resources.basename(resource);
        const parent = this._lookupAsDirectory(dirname, false);
        if (parent.entries.delete(basename)) {
            parent.mtime = Date.now();
            parent.size -= 1;
            this._fireSoon({ type: 0 /* FileChangeType.UPDATED */, resource: dirname }, { resource, type: 2 /* FileChangeType.DELETED */ });
        }
    }
    async mkdir(resource) {
        if (this._lookup(resource, true)) {
            throw createFileSystemProviderError('file exists already', FileSystemProviderErrorCode.FileExists);
        }
        const basename = resources.basename(resource);
        const dirname = resources.dirname(resource);
        const parent = this._lookupAsDirectory(dirname, false);
        const entry = new Directory(basename);
        parent.entries.set(entry.name, entry);
        parent.mtime = Date.now();
        parent.size += 1;
        this._fireSoon({ type: 0 /* FileChangeType.UPDATED */, resource: dirname }, { type: 1 /* FileChangeType.ADDED */, resource });
    }
    _lookup(uri, silent) {
        const parts = uri.path.split('/');
        let entry = this.root;
        for (const part of parts) {
            if (!part) {
                continue;
            }
            let child;
            if (entry instanceof Directory) {
                child = entry.entries.get(part);
            }
            if (!child) {
                if (!silent) {
                    throw createFileSystemProviderError('file not found', FileSystemProviderErrorCode.FileNotFound);
                }
                else {
                    return undefined;
                }
            }
            entry = child;
        }
        return entry;
    }
    _lookupAsDirectory(uri, silent) {
        const entry = this._lookup(uri, silent);
        if (entry instanceof Directory) {
            return entry;
        }
        throw createFileSystemProviderError('file not a directory', FileSystemProviderErrorCode.FileNotADirectory);
    }
    _lookupAsFile(uri, silent) {
        const entry = this._lookup(uri, silent);
        if (entry instanceof File) {
            return entry;
        }
        throw createFileSystemProviderError('file is a directory', FileSystemProviderErrorCode.FileIsADirectory);
    }
    _lookupParentDirectory(uri) {
        const dirname = resources.dirname(uri);
        return this._lookupAsDirectory(dirname, false);
    }
    watch(resource, opts) {
        // ignore, fires for all changes...
        return Disposable.None;
    }
    _fireSoon(...changes) {
        this._bufferedChanges.push(...changes);
        if (this._fireSoonHandle) {
            clearTimeout(this._fireSoonHandle);
        }
        this._fireSoonHandle = setTimeout(() => {
            this._onDidChangeFile.fire(this._bufferedChanges);
            this._bufferedChanges.length = 0;
        }, 5);
    }
    dispose() {
        super.dispose();
        this.fdMemory.clear();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSwrQkFBK0IsQ0FBQztBQUMvRCxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0sbUNBQW1DLENBQUM7QUFDNUUsT0FBTyxLQUFLLFNBQVMsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRCxPQUFPLEVBQXdCLGtCQUFrQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFMUYsT0FBTyxFQUE2RiwyQkFBMkIsRUFBRSxRQUFRLEVBQXdHLDZCQUE2QixFQUFnUix5QkFBeUIsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUU1a0IsTUFBTSxJQUFJO0lBVVQsWUFBWSxJQUFZO1FBQ3ZCLElBQUksQ0FBQyxJQUFJLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQztRQUMxQixJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUN4QixJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUN4QixJQUFJLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQztRQUNkLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO0lBQ2xCLENBQUM7Q0FDRDtBQUVELE1BQU0sU0FBUztJQVVkLFlBQVksSUFBWTtRQUN2QixJQUFJLENBQUMsSUFBSSxHQUFHLFFBQVEsQ0FBQyxTQUFTLENBQUM7UUFDL0IsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7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