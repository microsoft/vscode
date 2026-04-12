/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Throttler } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ExtUri } from '../../../base/common/resources.js';
import { isString } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { createFileSystemProviderError, FileSystemProviderErrorCode, FileType } from '../common/files.js';
import { BroadcastDataChannel } from '../../../base/browser/broadcast.js';
// Standard FS Errors (expected to be thrown in production when invalid FS operations are requested)
const ERR_FILE_NOT_FOUND = createFileSystemProviderError(localize('fileNotExists', "File does not exist"), FileSystemProviderErrorCode.FileNotFound);
const ERR_FILE_IS_DIR = createFileSystemProviderError(localize('fileIsDirectory', "File is Directory"), FileSystemProviderErrorCode.FileIsADirectory);
const ERR_FILE_NOT_DIR = createFileSystemProviderError(localize('fileNotDirectory', "File is not a directory"), FileSystemProviderErrorCode.FileNotADirectory);
const ERR_DIR_NOT_EMPTY = createFileSystemProviderError(localize('dirIsNotEmpty', "Directory is not empty"), FileSystemProviderErrorCode.Unknown);
const ERR_FILE_EXCEEDS_STORAGE_QUOTA = createFileSystemProviderError(localize('fileExceedsStorageQuota', "File exceeds available storage quota"), FileSystemProviderErrorCode.FileExceedsStorageQuota);
// Arbitrary Internal Errors
const ERR_UNKNOWN_INTERNAL = (message) => createFileSystemProviderError(localize('internal', "Internal error occurred in IndexedDB File System Provider. ({0})", message), FileSystemProviderErrorCode.Unknown);
class IndexedDBFileSystemNode {
    constructor(entry) {
        this.entry = entry;
        this.type = entry.type;
    }
    read(path) {
        return this.doRead(path.split('/').filter(p => p.length));
    }
    doRead(pathParts) {
        if (pathParts.length === 0) {
            return this.entry;
        }
        if (this.entry.type !== FileType.Directory) {
            throw ERR_UNKNOWN_INTERNAL('Internal error reading from IndexedDBFSNode -- expected directory at ' + this.entry.path);
        }
        const next = this.entry.children.get(pathParts[0]);
        if (!next) {
            return undefined;
        }
        return next.doRead(pathParts.slice(1));
    }
    delete(path) {
        const toDelete = path.split('/').filter(p => p.length);
        if (toDelete.length === 0) {
            if (this.entry.type !== FileType.Directory) {
                throw ERR_UNKNOWN_INTERNAL(`Internal error deleting from IndexedDBFSNode. Expected root entry to be directory`);
            }
            this.entry.children.clear();
        }
        else {
            return this.doDelete(toDelete, path);
        }
    }
    doDelete(pathParts, originalPath) {
        if (pathParts.length === 0) {
            throw ERR_UNKNOWN_INTERNAL(`Internal error deleting from IndexedDBFSNode -- got no deletion path parts (encountered while deleting ${originalPath})`);
        }
        else if (this.entry.type !== FileType.Directory) {
            throw ERR_UNKNOWN_INTERNAL('Internal error deleting from IndexedDBFSNode -- expected directory at ' + this.entry.path);
        }
        else if (pathParts.length === 1) {
            this.entry.children.delete(pathParts[0]);
        }
        else {
            const next = this.entry.children.get(pathParts[0]);
            if (!next) {
                throw ERR_UNKNOWN_INTERNAL('Internal error deleting from IndexedDBFSNode -- expected entry at ' + this.entry.path + '/' + next);
            }
            next.doDelete(pathParts.slice(1), originalPath);
        }
    }
    add(path, entry) {
        this.doAdd(path.split('/').filter(p => p.length), entry, path);
    }
    doAdd(pathParts, entry, originalPath) {
        if (pathParts.length === 0) {
            throw ERR_UNKNOWN_INTERNAL(`Internal error creating IndexedDBFSNode -- adding empty path (encountered while adding ${originalPath})`);
        }
        else if (this.entry.type !== FileType.Directory) {
            throw ERR_UNKNOWN_INTERNAL(`Internal error creating IndexedDBFSNode -- parent is not a directory (encountered while adding ${originalPath})`);
        }
        else if (pathParts.length === 1) {
            const next = pathParts[0];
            const existing = this.entry.children.get(next);
            if (entry.type === 'dir') {
                if (existing?.entry.type === FileType.File) {
                    throw ERR_UNKNOWN_INTERNAL(`Internal error creating IndexedDBFSNode -- overwriting file with directory: ${this.entry.path}/${next} (encountered while adding ${originalPath})`);
                }
                this.entry.children.set(next, existing ?? new IndexedDBFileSystemNode({
                    type: FileType.Directory,
                    path: this.entry.path + '/' + next,
                    children: new Map(),
                }));
            }
            else {
                if (existing?.entry.type === FileType.Directory) {
                    throw ERR_UNKNOWN_INTERNAL(`Internal error creating IndexedDBFSNode -- overwriting directory with file: ${this.entry.path}/${next} (encountered while adding ${originalPath})`);
                }
                this.entry.children.set(next, new IndexedDBFileSystemNode({
                    type: FileType.File,
                    path: this.entry.path + '/' + next,
                    size: entry.size,
                }));
            }
        }
        else if (pathParts.length > 1) {
            const next = pathParts[0];
            let childNode = this.entry.children.get(next);
            if (!childNode) {
                childNode = new IndexedDBFileSystemNode({
                    children: new Map(),
                    path: this.entry.path + '/' + next,
                    type: FileType.Directory
                });
                this.entry.children.set(next, childNode);
            }
            else if (childNode.type === FileType.File) {
                throw ERR_UNKNOWN_INTERNAL(`Internal error creating IndexedDBFSNode -- overwriting file entry with directory: ${this.entry.path}/${next} (encountered while adding ${originalPath})`);
            }
            childNode.doAdd(pathParts.slice(1), entry, originalPath);
        }
    }
    print(indentation = '') {
        console.log(indentation + this.entry.path);
        if (this.entry.type === FileType.Directory) {
            this.entry.children.forEach(child => child.print(indentation + ' '));
        }
    }
}
export class IndexedDBFileSystemProvider extends Disposable {
    constructor(scheme, indexedDB, store, watchCrossWindowChanges) {
        super();
        this.scheme = scheme;
        this.indexedDB = indexedDB;
        this.store = store;
        this.capabilities = 2 /* FileSystemProviderCapabilities.FileReadWrite */
            | 524288 /* FileSystemProviderCapabilities.FileAppend */
            | 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */;
        this.onDidChangeCapabilities = Event.None;
        this.extUri = new ExtUri(() => false) /* Case Sensitive */;
        this._onDidChangeFile = this._register(new Emitter());
        this.onDidChangeFile = this._onDidChangeFile.event;
        this.mtimes = new Map();
        this.fileWriteBatch = [];
        this.writeManyThrottler = new Throttler();
        if (watchCrossWindowChanges) {
            this.changesBroadcastChannel = this._register(new BroadcastDataChannel(`vscode.indexedDB.${scheme}.changes`));
            this._register(this.changesBroadcastChannel.onDidReceiveData(changes => {
                this._onDidChangeFile.fire(changes.map(c => ({ type: c.type, resource: URI.revive(c.resource) })));
            }));
        }
    }
    watch(resource, opts) {
        return Disposable.None;
    }
    async mkdir(resource) {
        try {
            const resourceStat = await this.stat(resource);
            if (resourceStat.type === FileType.File) {
                throw ERR_FILE_NOT_DIR;
            }
        }
        catch (error) { /* Ignore */ }
        (await this.getFiletree()).add(resource.path, { type: 'dir' });
    }
    async stat(resource) {
        const entry = (await this.getFiletree()).read(resource.path);
        if (entry?.type === FileType.File) {
            return {
                type: FileType.File,
                ctime: 0,
                mtime: this.mtimes.get(resource.toString()) || 0,
                size: entry.size ?? (await this.readFile(resource)).byteLength
            };
        }
        if (entry?.type === FileType.Directory) {
            return {
                type: FileType.Directory,
                ctime: 0,
                mtime: 0,
                size: 0
            };
        }
        throw ERR_FILE_NOT_FOUND;
    }
    async readdir(resource) {
        const entry = (await this.getFiletree()).read(resource.path);
        if (!entry) {
            // Dirs aren't saved to disk, so empty dirs will be lost on reload.
            // Thus we have two options for what happens when you try to read a dir and nothing is found:
            // - Throw FileSystemProviderErrorCode.FileNotFound
            // - Return []
            // We choose to return [] as creating a dir then reading it (even after reload) should not throw an error.
            return [];
        }
        if (entry.type !== FileType.Directory) {
            throw ERR_FILE_NOT_DIR;
        }
        else {
            return [...entry.children.entries()].map(([name, node]) => [name, node.type]);
        }
    }
    async readFile(resource) {
        const result = await this.indexedDB.runInTransaction(this.store, 'readonly', objectStore => objectStore.get(resource.path));
        if (result === undefined) {
            throw ERR_FILE_NOT_FOUND;
        }
        const buffer = result instanceof Uint8Array ? result : isString(result) ? VSBuffer.fromString(result).buffer : undefined;
        if (buffer === undefined) {
            throw ERR_UNKNOWN_INTERNAL(`IndexedDB entry at "${resource.path}" in unexpected format`);
        }
        // update cache
        const fileTree = await this.getFiletree();
        fileTree.add(resource.path, { type: 'file', size: buffer.byteLength });
        return buffer;
    }
    async writeFile(resource, content, opts) {
        const existing = await this.stat(resource).catch(() => undefined);
        if (existing?.type === FileType.Directory) {
            throw ERR_FILE_IS_DIR;
        }
        let finalContent = content;
        if (opts.append && existing) {
            // Read existing content and append new content to it
            const existingContent = await this.readFile(resource);
            const combined = new Uint8Array(existingContent.byteLength + content.byteLength);
            combined.set(existingContent, 0);
            combined.set(content, existingContent.byteLength);
            finalContent = combined;
        }
        await this.bulkWrite([[resource, finalContent]]);
    }
    async rename(from, to, opts) {
        const fileTree = await this.getFiletree();
        const fromEntry = fileTree.read(from.path);
        if (!fromEntry) {
            throw ERR_FILE_NOT_FOUND;
        }
        const toEntry = fileTree.read(to.path);
        if (toEntry) {
            if (!opts.overwrite) {
                throw createFileSystemProviderError('file exists already', FileSystemProviderErrorCode.FileExists);
            }
            if (toEntry.type !== fromEntry.type) {
                throw createFileSystemProviderError('Cannot rename files with different types', FileSystemProviderErrorCode.Unknown);
            }
            // delete the target file if exists
            await this.delete(to, { recursive: true, useTrash: false, atomic: false });
        }
        const toTargetResource = (path) => this.extUri.joinPath(to, this.extUri.relativePath(from, from.with({ path })) || '');
        const sourceEntries = await this.tree(from);
        const sourceFiles = [];
        for (const sourceEntry of sourceEntries) {
            if (sourceEntry[1] === FileType.File) {
                sourceFiles.push(sourceEntry);
            }
            else if (sourceEntry[1] === FileType.Directory) {
                // add directories to the tree
                fileTree.add(toTargetResource(sourceEntry[0]).path, { type: 'dir' });
            }
        }
        if (sourceFiles.length) {
            const targetFiles = [];
            const sourceFilesContents = await this.indexedDB.runInTransaction(this.store, 'readonly', objectStore => sourceFiles.map(([path]) => objectStore.get(path)));
            for (let index = 0; index < sourceFiles.length; index++) {
                const content = sourceFilesContents[index] instanceof Uint8Array ? sourceFilesContents[index] : isString(sourceFilesContents[index]) ? VSBuffer.fromString(sourceFilesContents[index]).buffer : undefined;
                if (content) {
                    targetFiles.push([toTargetResource(sourceFiles[index][0]), content]);
                }
            }
            await this.bulkWrite(targetFiles);
        }
        await this.delete(from, { recursive: true, useTrash: false, atomic: false });
    }
    async delete(resource, opts) {
        let stat;
        try {
            stat = await this.stat(resource);
        }
        catch (e) {
            if (e.code === FileSystemProviderErrorCode.FileNotFound) {
                return;
            }
            throw e;
        }
        let toDelete;
        if (opts.recursive) {
            const tree = await this.tree(resource);
            toDelete = tree.map(([path]) => path);
        }
        else {
            if (stat.type === FileType.Directory && (await this.readdir(resource)).length) {
                throw ERR_DIR_NOT_EMPTY;
            }
            toDelete = [resource.path];
        }
        await this.deleteKeys(toDelete);
        (await this.getFiletree()).delete(resource.path);
        toDelete.forEach(key => this.mtimes.delete(key));
        this.triggerChanges(toDelete.map(path => ({ resource: resource.with({ path }), type: 2 /* FileChangeType.DELETED */ })));
    }
    async tree(resource) {
        const stat = await this.stat(resource);
        const allEntries = [[resource.path, stat.type]];
        if (stat.type === FileType.Directory) {
            const dirEntries = await this.readdir(resource);
            for (const [key, type] of dirEntries) {
                const childResource = this.extUri.joinPath(resource, key);
                allEntries.push([childResource.path, type]);
                if (type === FileType.Directory) {
                    const childEntries = await this.tree(childResource);
                    allEntries.push(...childEntries);
                }
            }
        }
        return allEntries;
    }
    triggerChanges(changes) {
        if (changes.length) {
            this._onDidChangeFile.fire(changes);
            this.changesBroadcastChannel?.postData(changes);
        }
    }
    getFiletree() {
        if (!this.cachedFiletree) {
            this.cachedFiletree = (async () => {
                const rootNode = new IndexedDBFileSystemNode({
                    children: new Map(),
                    path: '',
                    type: FileType.Directory
                });
                const result = await this.indexedDB.runInTransaction(this.store, 'readonly', objectStore => objectStore.getAllKeys());
                const keys = result.map(key => key.toString());
                keys.forEach(key => rootNode.add(key, { type: 'file' }));
                return rootNode;
            })();
        }
        return this.cachedFiletree;
    }
    async bulkWrite(files) {
        files.forEach(([resource, content]) => this.fileWriteBatch.push({ content, resource }));
        await this.writeManyThrottler.queue(() => this.writeMany());
        const fileTree = await this.getFiletree();
        for (const [resource, content] of files) {
            fileTree.add(resource.path, { type: 'file', size: content.byteLength });
            this.mtimes.set(resource.toString(), Date.now());
        }
        this.triggerChanges(files.map(([resource]) => ({ resource, type: 0 /* FileChangeType.UPDATED */ })));
    }
    async writeMany() {
        if (this.fileWriteBatch.length) {
            const fileBatch = this.fileWriteBatch.splice(0, this.fileWriteBatch.length);
            try {
                await this.indexedDB.runInTransaction(this.store, 'readwrite', objectStore => fileBatch.map(entry => {
                    return objectStore.put(entry.content, entry.resource.path);
                }));
            }
            catch (ex) {
                if (ex instanceof DOMException && ex.name === 'QuotaExceededError') {
                    throw ERR_FILE_EXCEEDS_STORAGE_QUOTA;
                }
                throw ex;
            }
        }
    }
    async deleteKeys(keys) {
        if (keys.length) {
            await this.indexedDB.runInTransaction(this.store, 'readwrite', objectStore => keys.map(key => objectStore.delete(key)));
        }
    }
    async reset() {
        await this.indexedDB.runInTransaction(this.store, 'readwrite', objectStore => objectStore.clear());
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXhlZERCRmlsZVN5c3RlbVByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vZmlsZXMvYnJvd3Nlci9pbmRleGVkREJGaWxlU3lzdGVtUHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzFELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQWUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDM0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3pELE9BQU8sRUFBRSxHQUFHLEVBQVUsTUFBTSw2QkFBNkIsQ0FBQztBQUMxRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDM0MsT0FBTyxFQUFFLDZCQUE2QixFQUE2RiwyQkFBMkIsRUFBRSxRQUFRLEVBQXdHLE1BQU0sb0JBQW9CLENBQUM7QUFFM1MsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFMUUsb0dBQW9HO0FBQ3BHLE1BQU0sa0JBQWtCLEdBQUcsNkJBQTZCLENBQUMsUUFBUSxDQUFDLGVBQWUsRUFBRSxxQkFBcUIsQ0FBQyxFQUFFLDJCQUEyQixDQUFDLFlBQVksQ0FBQyxDQUFDO0FBQ3JKLE1BQU0sZUFBZSxHQUFHLDZCQUE2QixDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxtQkFBbUIsQ0FBQyxFQUFFLDJCQUEyQixDQUFDLGdCQUFnQixDQUFDLENBQUM7QUFD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