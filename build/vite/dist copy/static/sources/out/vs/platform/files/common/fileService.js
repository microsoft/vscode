/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var FileService_1;
import { coalesce } from '../../../base/common/arrays.js';
import { Promises, ResourceQueue } from '../../../base/common/async.js';
import { bufferedStreamToBuffer, bufferToReadable, newWriteableBufferStream, readableToBuffer, streamToBuffer, VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Emitter } from '../../../base/common/event.js';
import { hash } from '../../../base/common/hash.js';
import { Iterable } from '../../../base/common/iterator.js';
import { Disposable, DisposableStore, dispose, toDisposable } from '../../../base/common/lifecycle.js';
import { TernarySearchTree } from '../../../base/common/ternarySearchTree.js';
import { Schemas } from '../../../base/common/network.js';
import { mark } from '../../../base/common/performance.js';
import { extUri, extUriIgnorePathCase, isAbsolutePath } from '../../../base/common/resources.js';
import { consumeStream, isReadableBufferedStream, isReadableStream, listenStream, newWriteableStream, peekReadable, peekStream, transform } from '../../../base/common/stream.js';
import { localize } from '../../../nls.js';
import { ensureFileSystemProviderError, etag, ETAG_DISABLED, FileChangesEvent, FileOperationError, FileOperationEvent, FilePermission, FileSystemProviderErrorCode, FileType, hasFileAppendCapability, hasFileAtomicReadCapability, hasFileFolderCopyCapability, hasFileReadStreamCapability, hasOpenReadWriteCloseCapability, hasReadWriteCapability, NotModifiedSinceFileOperationError, toFileOperationResult, toFileSystemProviderErrorCode, hasFileCloneCapability, TooLargeFileOperationError, hasFileAtomicDeleteCapability, hasFileAtomicWriteCapability, hasFileRealpathCapability } from './files.js';
import { readFileIntoStream } from './io.js';
import { ILogService } from '../../log/common/log.js';
import { ErrorNoTelemetry } from '../../../base/common/errors.js';
let FileService = class FileService extends Disposable {
    static { FileService_1 = this; }
    constructor(logService) {
        super();
        this.logService = logService;
        // Choose a buffer size that is a balance between memory needs and
        // manageable IPC overhead. The larger the buffer size, the less
        // roundtrips we have to do for reading/writing data.
        this.BUFFER_SIZE = 256 * 1024;
        //#region File System Provider
        this._onDidChangeFileSystemProviderRegistrations = this._register(new Emitter());
        this.onDidChangeFileSystemProviderRegistrations = this._onDidChangeFileSystemProviderRegistrations.event;
        this._onWillActivateFileSystemProvider = this._register(new Emitter());
        this.onWillActivateFileSystemProvider = this._onWillActivateFileSystemProvider.event;
        this._onDidChangeFileSystemProviderCapabilities = this._register(new Emitter());
        this.onDidChangeFileSystemProviderCapabilities = this._onDidChangeFileSystemProviderCapabilities.event;
        this.provider = new Map();
        //#endregion
        //#region Operation events
        this._onDidRunOperation = this._register(new Emitter());
        this.onDidRunOperation = this._onDidRunOperation.event;
        //#endregion
        //#region File Watching
        this.internalOnDidFilesChange = this._register(new Emitter());
        this._onDidUncorrelatedFilesChange = this._register(new Emitter());
        this.onDidFilesChange = this._onDidUncorrelatedFilesChange.event; // global `onDidFilesChange` skips correlated events
        this._onDidWatchError = this._register(new Emitter());
        this.onDidWatchError = this._onDidWatchError.event;
        this.activeWatchers = new Map();
        //#endregion
        //#region Helpers
        this.writeQueue = this._register(new ResourceQueue());
    }
    registerProvider(scheme, provider) {
        if (this.provider.has(scheme)) {
            throw new Error(`A filesystem provider for the scheme '${scheme}' is already registered.`);
        }
        mark(`code/registerFilesystem/${scheme}`);
        const providerDisposables = new DisposableStore();
        // Add provider with event
        this.provider.set(scheme, provider);
        this._onDidChangeFileSystemProviderRegistrations.fire({ added: true, scheme, provider });
        // Forward events from provider
        providerDisposables.add(provider.onDidChangeFile(changes => {
            const event = new FileChangesEvent(changes, !this.isPathCaseSensitive(provider));
            // Always emit any event internally
            this.internalOnDidFilesChange.fire(event);
            // Only emit uncorrelated events in the global `onDidFilesChange` event
            if (!event.hasCorrelation()) {
                this._onDidUncorrelatedFilesChange.fire(event);
            }
        }));
        if (typeof provider.onDidWatchError === 'function') {
            providerDisposables.add(provider.onDidWatchError(error => this._onDidWatchError.fire(new Error(error))));
        }
        providerDisposables.add(provider.onDidChangeCapabilities(() => this._onDidChangeFileSystemProviderCapabilities.fire({ provider, scheme })));
        return toDisposable(() => {
            this._onDidChangeFileSystemProviderRegistrations.fire({ added: false, scheme, provider });
            this.provider.delete(scheme);
            dispose(providerDisposables);
        });
    }
    getProvider(scheme) {
        return this.provider.get(scheme);
    }
    async activateProvider(scheme) {
        // Emit an event that we are about to activate a provider with the given scheme.
        // Listeners can participate in the activation by registering a provider for it.
        const joiners = [];
        this._onWillActivateFileSystemProvider.fire({
            scheme,
            join(promise) {
                joiners.push(promise);
            },
        });
        if (this.provider.has(scheme)) {
            return; // provider is already here so we can return directly
        }
        // If the provider is not yet there, make sure to join on the listeners assuming
        // that it takes a bit longer to register the file system provider.
        await Promises.settled(joiners);
    }
    async canHandleResource(resource) {
        // Await activation of potentially extension contributed providers
        await this.activateProvider(resource.scheme);
        return this.hasProvider(resource);
    }
    hasProvider(resource) {
        return this.provider.has(resource.scheme);
    }
    hasCapability(resource, capability) {
        const provider = this.provider.get(resource.scheme);
        return !!(provider && (provider.capabilities & capability));
    }
    listCapabilities() {
        return Iterable.map(this.provider, ([scheme, provider]) => ({ scheme, capabilities: provider.capabilities }));
    }
    async withProvider(resource) {
        // Assert path is absolute
        if (!isAbsolutePath(resource)) {
            throw new FileOperationError(localize('invalidPath', "Unable to resolve filesystem provider with relative file path '{0}'", this.resourceForError(resource)), 8 /* FileOperationResult.FILE_INVALID_PATH */);
        }
        // Activate provider
        await this.activateProvider(resource.scheme);
        // Assert provider
        const provider = this.provider.get(resource.scheme);
        if (!provider) {
            const error = new ErrorNoTelemetry();
            error.message = localize('noProviderFound', "ENOPRO: No file system provider found for resource '{0}'", resource.toString());
            throw error;
        }
        return provider;
    }
    async withReadProvider(resource) {
        const provider = await this.withProvider(resource);
        if (hasOpenReadWriteCloseCapability(provider) || hasReadWriteCapability(provider) || hasFileReadStreamCapability(provider)) {
            return provider;
        }
        throw new Error(`Filesystem provider for scheme '${resource.scheme}' neither has FileReadWrite, FileReadStream nor FileOpenReadWriteClose capability which is needed for the read operation.`);
    }
    async withWriteProvider(resource) {
        const provider = await this.withProvider(resource);
        if (hasOpenReadWriteCloseCapability(provider) || hasReadWriteCapability(provider)) {
            return provider;
        }
        throw new Error(`Filesystem provider for scheme '${resource.scheme}' neither has FileReadWrite nor FileOpenReadWriteClose capability which is needed for the write operation.`);
    }
    async resolve(resource, options) {
        try {
            return await this.doResolveFile(resource, options);
        }
        catch (error) {
            // Specially handle file not found case as file operation result
            if (toFileSystemProviderErrorCode(error) === FileSystemProviderErrorCode.FileNotFound) {
                throw new FileOperationError(localize('fileNotFoundError', "Unable to resolve nonexistent file '{0}'", this.resourceForError(resource)), 1 /* FileOperationResult.FILE_NOT_FOUND */);
            }
            // Bubble up any other error as is
            throw ensureFileSystemProviderError(error);
        }
    }
    async doResolveFile(resource, options) {
        const provider = await this.withProvider(resource);
        const isPathCaseSensitive = this.isPathCaseSensitive(provider);
        const resolveTo = options?.resolveTo;
        const resolveSingleChildDescendants = options?.resolveSingleChildDescendants;
        const resolveMetadata = options?.resolveMetadata;
        const stat = await provider.stat(resource);
        let trie;
        return this.toFileStat(provider, resource, stat, undefined, !!resolveMetadata, (stat, siblings) => {
            // lazy trie to check for recursive resolving
            if (!trie) {
                trie = TernarySearchTree.forUris(() => !isPathCaseSensitive);
                trie.set(resource, true);
                if (resolveTo) {
                    trie.fill(true, resolveTo);
                }
            }
            // check for recursive resolving
            if (trie.get(stat.resource) || trie.findSuperstr(stat.resource.with({ query: null, fragment: null } /* required for https://github.com/microsoft/vscode/issues/128151 */))) {
                return true;
            }
            // check for resolving single child folders
            if (stat.isDirectory && resolveSingleChildDescendants) {
                return siblings === 1;
            }
            return false;
        });
    }
    async toFileStat(provider, resource, stat, siblings, resolveMetadata, recurse) {
        const { providerExtUri } = this.getExtUri(provider);
        // convert to file stat
        const fileStat = {
            resource,
            name: providerExtUri.basename(resource),
            isFile: (stat.type & FileType.File) !== 0,
            isDirectory: (stat.type & FileType.Directory) !== 0,
            isSymbolicLink: (stat.type & FileType.SymbolicLink) !== 0,
            mtime: stat.mtime,
            ctime: stat.ctime,
            size: stat.size,
            readonly: Boolean((stat.permissions ?? 0) & FilePermission.Readonly) || Boolean(provider.capabilities & 2048 /* FileSystemProviderCapabilities.Readonly */),
            locked: Boolean((stat.permissions ?? 0) & FilePermission.Locked),
            executable: Boolean((stat.permissions ?? 0) & FilePermission.Executable),
            etag: etag({ mtime: stat.mtime, size: stat.size }),
            children: undefined
        };
        // check to recurse for directories
        if (fileStat.isDirectory && recurse(fileStat, siblings)) {
            try {
                const entries = await provider.readdir(resource);
                const resolvedEntries = await Promises.settled(entries.map(async ([name, type]) => {
                    try {
                        const childResource = providerExtUri.joinPath(resource, name);
                        const childStat = resolveMetadata ? await provider.stat(childResource) : { type };
                        return await this.toFileStat(provider, childResource, childStat, entries.length, resolveMetadata, recurse);
                    }
                    catch (error) {
                        this.logService.trace(error);
                        return null; // can happen e.g. due to permission errors
                    }
                }));
                // make sure to get rid of null values that signal a failure to resolve a particular entry
                fileStat.children = coalesce(resolvedEntries);
            }
            catch (error) {
                this.logService.trace(error);
                fileStat.children = []; // gracefully handle errors, we may not have permissions to read
            }
            return fileStat;
        }
        return fileStat;
    }
    async resolveAll(toResolve) {
        return Promises.settled(toResolve.map(async (entry) => {
            try {
                return { stat: await this.doResolveFile(entry.resource, entry.options), success: true };
            }
            catch (error) {
                this.logService.trace(error);
                return { stat: undefined, success: false };
            }
        }));
    }
    async stat(resource) {
        const provider = await this.withProvider(resource);
        const stat = await provider.stat(resource);
        return this.toFileStat(provider, resource, stat, undefined, true, () => false /* Do not resolve any children */);
    }
    async realpath(resource) {
        const provider = await this.withProvider(resource);
        if (hasFileRealpathCapability(provider)) {
            const realpath = await provider.realpath(resource);
            return resource.with({ path: realpath });
        }
        return undefined;
    }
    async exists(resource) {
        const provider = await this.withProvider(resource);
        try {
            const stat = await provider.stat(resource);
            return !!stat;
        }
        catch (error) {
            return false;
        }
    }
    //#endregion
    //#region File Reading/Writing
    async canCreateFile(resource, options) {
        try {
            await this.doValidateCreateFile(resource, options);
        }
        catch (error) {
            return error;
        }
        return true;
    }
    async doValidateCreateFile(resource, options) {
        // validate overwrite
        if (!options?.overwrite && await this.exists(resource)) {
            throw new FileOperationError(localize('fileExists', "Unable to create file '{0}' that already exists when overwrite flag is not set", this.resourceForError(resource)), 3 /* FileOperationResult.FILE_MODIFIED_SINCE */, options);
        }
    }
    async createFile(resource, bufferOrReadableOrStream = VSBuffer.fromString(''), options) {
        // validate
        await this.doValidateCreateFile(resource, options);
        // do write into file (this will create it too)
        const fileStat = await this.writeFile(resource, bufferOrReadableOrStream);
        // events
        this._onDidRunOperation.fire(new FileOperationEvent(resource, 0 /* FileOperation.CREATE */, fileStat));
        return fileStat;
    }
    async writeFile(resource, bufferOrReadableOrStream, options) {
        const provider = this.throwIfFileSystemIsReadonly(await this.withWriteProvider(resource), resource);
        const { providerExtUri } = this.getExtUri(provider);
        let writeFileOptions = options;
        if (hasFileAtomicWriteCapability(provider) && !writeFileOptions?.atomic) {
            const enforcedAtomicWrite = provider.enforceAtomicWriteFile?.(resource);
            if (enforcedAtomicWrite) {
                writeFileOptions = { ...options, atomic: enforcedAtomicWrite };
            }
        }
        try {
            // validate write (this may already return a peeked-at buffer)
            let { stat, buffer: bufferOrReadableOrStreamOrBufferedStream } = await this.validateWriteFile(provider, resource, bufferOrReadableOrStream, writeFileOptions);
            // mkdir recursively as needed
            if (!stat) {
                await this.mkdirp(provider, providerExtUri.dirname(resource));
            }
            // optimization: if the provider has unbuffered write capability and the data
            // to write is not a buffer, we consume up to 3 chunks and try to write the data
            // unbuffered to reduce the overhead. If the stream or readable has more data
            // to provide we continue to write buffered.
            if (!bufferOrReadableOrStreamOrBufferedStream) {
                bufferOrReadableOrStreamOrBufferedStream = await this.peekBufferForWriting(provider, bufferOrReadableOrStream);
            }
            // write file: unbuffered
            if (!hasOpenReadWriteCloseCapability(provider) || // buffered writing is unsupported
                (hasReadWriteCapability(provider) && bufferOrReadableOrStreamOrBufferedStream instanceof VSBuffer) || // data is a full buffer already
                (hasReadWriteCapability(provider) && hasFileAtomicWriteCapability(provider) && writeFileOptions?.atomic) // atomic write forces unbuffered write if the provider supports it
            ) {
                await this.doWriteUnbuffered(provider, resource, writeFileOptions, bufferOrReadableOrStreamOrBufferedStream);
            }
            // write file: buffered
            else {
                await this.doWriteBuffered(provider, resource, writeFileOptions, bufferOrReadableOrStreamOrBufferedStream instanceof VSBuffer ? bufferToReadable(bufferOrReadableOrStreamOrBufferedStream) : bufferOrReadableOrStreamOrBufferedStream);
            }
            // events
            this._onDidRunOperation.fire(new FileOperationEvent(resource, 4 /* FileOperation.WRITE */));
        }
        catch (error) {
            throw new FileOperationError(localize('err.write', "Unable to write file '{0}' ({1})", this.resourceForError(resource), ensureFileSystemProviderError(error).toString()), toFileOperationResult(error), writeFileOptions);
        }
        return this.resolve(resource, { resolveMetadata: true });
    }
    async peekBufferForWriting(provider, bufferOrReadableOrStream) {
        let peekResult;
        if (hasReadWriteCapability(provider) && !(bufferOrReadableOrStream instanceof VSBuffer)) {
            if (isReadableStream(bufferOrReadableOrStream)) {
                const bufferedStream = await peekStream(bufferOrReadableOrStream, 3);
                if (bufferedStream.ended) {
                    peekResult = VSBuffer.concat(bufferedStream.buffer);
                }
                else {
                    peekResult = bufferedStream;
                }
            }
            else {
                peekResult = peekReadable(bufferOrReadableOrStream, data => VSBuffer.concat(data), 3);
            }
        }
        else {
            peekResult = bufferOrReadableOrStream;
        }
        return peekResult;
    }
    async validateWriteFile(provider, resource, bufferOrReadableOrStream, options) {
        // Validate unlock support
        const unlock = !!options?.unlock;
        if (unlock && !(provider.capabilities & 8192 /* FileSystemProviderCapabilities.FileWriteUnlock */)) {
            throw new Error(localize('writeFailedUnlockUnsupported', "Unable to unlock file '{0}' because provider does not support it.", this.resourceForError(resource)));
        }
        // Validate append support
        if (options?.append && !hasFileAppendCapability(provider)) {
            throw new FileOperationError(localize('err.noAppend', "Filesystem provider for scheme '{0}' does not does not support append", this.resourceForError(resource)), 6 /* FileOperationResult.FILE_PERMISSION_DENIED */);
        }
        // Validate atomic support
        const atomic = !!options?.atomic;
        if (atomic) {
            if (!(provider.capabilities & 32768 /* FileSystemProviderCapabilities.FileAtomicWrite */)) {
                throw new Error(localize('writeFailedAtomicUnsupported1', "Unable to atomically write file '{0}' because provider does not support it.", this.resourceForError(resource)));
            }
            if (!(provider.capabilities & 2 /* FileSystemProviderCapabilities.FileReadWrite */)) {
                throw new Error(localize('writeFailedAtomicUnsupported2', "Unable to atomically write file '{0}' because provider does not support unbuffered writes.", this.resourceForError(resource)));
            }
            if (unlock) {
                throw new Error(localize('writeFailedAtomicUnlock', "Unable to unlock file '{0}' because atomic write is enabled.", this.resourceForError(resource)));
            }
        }
        // Validate via file stat meta data
        let stat = undefined;
        try {
            stat = await provider.stat(resource);
        }
        catch (error) {
            return Object.create(null); // file might not exist
        }
        // File cannot be directory
        if ((stat.type & FileType.Directory) !== 0) {
            throw new FileOperationError(localize('fileIsDirectoryWriteError', "Unable to write file '{0}' that is actually a directory", this.resourceForError(resource)), 0 /* FileOperationResult.FILE_IS_DIRECTORY */, options);
        }
        // File cannot be readonly
        this.throwIfFileIsReadonly(resource, stat);
        // Dirty write prevention: if the file on disk has been changed and does not match our expected
        // mtime and etag, we bail out to prevent dirty writing.
        //
        // First, we check for a mtime that is in the future before we do more checks. The assumption is
        // that only the mtime is an indicator for a file that has changed on disk.
        //
        // Second, if the mtime has advanced, we compare the size of the file on disk with our previous
        // one using the etag() function. Relying only on the mtime check has prooven to produce false
        // positives due to file system weirdness (especially around remote file systems). As such, the
        // check for size is a weaker check because it can return a false negative if the file has changed
        // but to the same length. This is a compromise we take to avoid having to produce checksums of
        // the file content for comparison which would be much slower to compute.
        //
        // Third, if the etag() turns out to be different, we do one attempt to compare the buffer we
        // are about to write with the contents on disk to figure out if the contents are identical.
        // In that case we allow the writing as it would result in the same contents in the file.
        let buffer;
        if (typeof options?.mtime === 'number' && typeof options.etag === 'string' && options.etag !== ETAG_DISABLED &&
            typeof stat.mtime === 'number' && typeof stat.size === 'number' &&
            options.mtime < stat.mtime && options.etag !== etag({ mtime: options.mtime /* not using stat.mtime for a reason, see above */, size: stat.size })) {
            buffer = await this.peekBufferForWriting(provider, bufferOrReadableOrStream);
            if (buffer instanceof VSBuffer && buffer.byteLength === stat.size) {
                try {
                    const { value } = await this.readFile(resource, { limits: { size: stat.size } });
                    if (buffer.equals(value)) {
                        return { stat, buffer }; // allow writing since contents are identical
                    }
                }
                catch (error) {
                    // ignore, throw the FILE_MODIFIED_SINCE error
                }
            }
            throw new FileOperationError(localize('fileModifiedError', "File Modified Since"), 3 /* FileOperationResult.FILE_MODIFIED_SINCE */, options);
        }
        return { stat, buffer };
    }
    async readFile(resource, options, token) {
        const provider = await this.withReadProvider(resource);
        if (options?.atomic) {
            return this.doReadFileAtomic(provider, resource, options, token);
        }
        return this.doReadFile(provider, resource, options, token);
    }
    async doReadFileAtomic(provider, resource, options, token) {
        return new Promise((resolve, reject) => {
            this.writeQueue.queueFor(resource, async () => {
                try {
                    const content = await this.doReadFile(provider, resource, options, token);
                    resolve(content);
                }
                catch (error) {
                    reject(error);
                }
            }, this.getExtUri(provider).providerExtUri);
        });
    }
    async doReadFile(provider, resource, options, token) {
        const stream = await this.doReadFileStream(provider, resource, {
            ...options,
            // optimization: since we know that the caller does not
            // care about buffering, we indicate this to the reader.
            // this reduces all the overhead the buffered reading
            // has (open, read, close) if the provider supports
            // unbuffered reading.
            preferUnbuffered: true
        }, token);
        return {
            ...stream,
            value: await streamToBuffer(stream.value)
        };
    }
    async readFileStream(resource, options, token) {
        const provider = await this.withReadProvider(resource);
        return this.doReadFileStream(provider, resource, options, token);
    }
    async doReadFileStream(provider, resource, options, token) {
        // install a cancellation token that gets cancelled
        // when any error occurs. this allows us to resolve
        // the content of the file while resolving metadata
        // but still cancel the operation in certain cases.
        //
        // in addition, we pass the optional token in that
        // we got from the outside to even allow for external
        // cancellation of the read operation.
        const cancellableSource = new CancellationTokenSource(token);
        let readFileOptions = options;
        if (hasFileAtomicReadCapability(provider) && provider.enforceAtomicReadFile?.(resource)) {
            readFileOptions = { ...options, atomic: true };
        }
        // validate read operation
        const statPromise = this.validateReadFile(resource, readFileOptions).then(stat => stat, error => {
            cancellableSource.dispose(true);
            throw error;
        });
        let fileStream = undefined;
        try {
            // if the etag is provided, we await the result of the validation
            // due to the likelihood of hitting a NOT_MODIFIED_SINCE result.
            // otherwise, we let it run in parallel to the file reading for
            // optimal startup performance.
            if (typeof readFileOptions?.etag === 'string' && readFileOptions.etag !== ETAG_DISABLED) {
                await statPromise;
            }
            // read unbuffered
            if ((readFileOptions?.atomic && hasFileAtomicReadCapability(provider)) || // atomic reads are always unbuffered
                !(hasOpenReadWriteCloseCapability(provider) || hasFileReadStreamCapability(provider)) || // provider has no buffered capability
                (hasReadWriteCapability(provider) && readFileOptions?.preferUnbuffered) // unbuffered read is preferred
            ) {
                fileStream = this.readFileUnbuffered(provider, resource, readFileOptions);
            }
            // read streamed (always prefer over primitive buffered read)
            else if (hasFileReadStreamCapability(provider)) {
                fileStream = this.readFileStreamed(provider, resource, cancellableSource.token, readFileOptions);
            }
            // read buffered
            else {
                fileStream = this.readFileBuffered(provider, resource, cancellableSource.token, readFileOptions);
            }
            fileStream.on('end', () => cancellableSource.dispose());
            fileStream.on('error', () => cancellableSource.dispose());
            const fileStat = await statPromise;
            return {
                ...fileStat,
                value: fileStream
            };
        }
        catch (error) {
            // Await the stream to finish so that we exit this method
            // in a consistent state with file handles closed
            // (https://github.com/microsoft/vscode/issues/114024)
            if (fileStream) {
                await consumeStream(fileStream);
            }
            // Re-throw errors as file operation errors but preserve
            // specific errors (such as not modified since)
            throw this.restoreReadError(error, resource, readFileOptions);
        }
    }
    restoreReadError(error, resource, options) {
        const message = localize('err.read', "Unable to read file '{0}' ({1})", this.resourceForError(resource), ensureFileSystemProviderError(error).toString());
        if (error instanceof NotModifiedSinceFileOperationError) {
            return new NotModifiedSinceFileOperationError(message, error.stat, options);
        }
        if (error instanceof TooLargeFileOperationError) {
            return new TooLargeFileOperationError(message, error.fileOperationResult, error.size, error.options);
        }
        return new FileOperationError(message, toFileOperationResult(error), options);
    }
    readFileStreamed(provider, resource, token, options = Object.create(null)) {
        const fileStream = provider.readFileStream(resource, options, token);
        return transform(fileStream, {
            data: data => data instanceof VSBuffer ? data : VSBuffer.wrap(data),
            error: error => this.restoreReadError(error, resource, options)
        }, data => VSBuffer.concat(data));
    }
    readFileBuffered(provider, resource, token, options = Object.create(null)) {
        const stream = newWriteableBufferStream();
        readFileIntoStream(provider, resource, stream, data => data, {
            ...options,
            bufferSize: this.BUFFER_SIZE,
            errorTransformer: error => this.restoreReadError(error, resource, options)
        }, token);
        return stream;
    }
    readFileUnbuffered(provider, resource, options) {
        const stream = newWriteableStream(data => VSBuffer.concat(data));
        // Read the file into the stream async but do not wait for
        // this to complete because streams work via events
        (async () => {
            try {
                let buffer;
                if (options?.atomic && hasFileAtomicReadCapability(provider)) {
                    buffer = await provider.readFile(resource, { atomic: true });
                }
                else {
                    buffer = await provider.readFile(resource);
                }
                // respect position option
                if (typeof options?.position === 'number') {
                    buffer = buffer.slice(options.position);
                }
                // respect length option
                if (typeof options?.length === 'number') {
                    buffer = buffer.slice(0, options.length);
                }
                // Throw if file is too large to load
                this.validateReadFileLimits(resource, buffer.byteLength, options);
                // End stream with data
                stream.end(VSBuffer.wrap(buffer));
            }
            catch (err) {
                stream.error(err);
                stream.end();
            }
        })();
        return stream;
    }
    async validateReadFile(resource, options) {
        const stat = await this.resolve(resource, { resolveMetadata: true });
        // Throw if resource is a directory
        if (stat.isDirectory) {
            throw new FileOperationError(localize('fileIsDirectoryReadError', "Unable to read file '{0}' that is actually a directory", this.resourceForError(resource)), 0 /* FileOperationResult.FILE_IS_DIRECTORY */, options);
        }
        // Throw if file not modified since (unless disabled)
        if (typeof options?.etag === 'string' && options.etag !== ETAG_DISABLED && options.etag === stat.etag) {
            throw new NotModifiedSinceFileOperationError(localize('fileNotModifiedError', "File not modified since"), stat, options);
        }
        // Throw if file is too large to load
        this.validateReadFileLimits(resource, stat.size, options);
        return stat;
    }
    validateReadFileLimits(resource, size, options) {
        if (typeof options?.limits?.size === 'number' && size > options.limits.size) {
            throw new TooLargeFileOperationError(localize('fileTooLargeError', "Unable to read file '{0}' that is too large to open", this.resourceForError(resource)), 7 /* FileOperationResult.FILE_TOO_LARGE */, size, options);
        }
    }
    //#endregion
    //#region Move/Copy/Delete/Create Folder
    async canMove(source, target, overwrite) {
        return this.doCanMoveCopy(source, target, 'move', overwrite);
    }
    async canCopy(source, target, overwrite) {
        return this.doCanMoveCopy(source, target, 'copy', overwrite);
    }
    async doCanMoveCopy(source, target, mode, overwrite) {
        if (source.toString() !== target.toString()) {
            try {
                const sourceProvider = mode === 'move' ? this.throwIfFileSystemIsReadonly(await this.withWriteProvider(source), source) : await this.withReadProvider(source);
                const targetProvider = this.throwIfFileSystemIsReadonly(await this.withWriteProvider(target), target);
                await this.doValidateMoveCopy(sourceProvider, source, targetProvider, target, mode, overwrite);
            }
            catch (error) {
                return error;
            }
        }
        return true;
    }
    async move(source, target, overwrite) {
        const sourceProvider = this.throwIfFileSystemIsReadonly(await this.withWriteProvider(source), source);
        const targetProvider = this.throwIfFileSystemIsReadonly(await this.withWriteProvider(target), target);
        // move
        const mode = await this.doMoveCopy(sourceProvider, source, targetProvider, target, 'move', !!overwrite);
        // resolve and send events
        const fileStat = await this.resolve(target, { resolveMetadata: true });
        this._onDidRunOperation.fire(new FileOperationEvent(source, mode === 'move' ? 2 /* FileOperation.MOVE */ : 3 /* FileOperation.COPY */, fileStat));
        return fileStat;
    }
    async copy(source, target, overwrite) {
        const sourceProvider = await this.withReadProvider(source);
        const targetProvider = this.throwIfFileSystemIsReadonly(await this.withWriteProvider(target), target);
        // copy
        const mode = await this.doMoveCopy(sourceProvider, source, targetProvider, target, 'copy', !!overwrite);
        // resolve and send events
        const fileStat = await this.resolve(target, { resolveMetadata: true });
        this._onDidRunOperation.fire(new FileOperationEvent(source, mode === 'copy' ? 3 /* FileOperation.COPY */ : 2 /* FileOperation.MOVE */, fileStat));
        return fileStat;
    }
    async doMoveCopy(sourceProvider, source, targetProvider, target, mode, overwrite) {
        if (source.toString() === target.toString()) {
            return mode; // simulate node.js behaviour here and do a no-op if paths match
        }
        // validation
        const { exists, isSameResourceWithDifferentPathCase } = await this.doValidateMoveCopy(sourceProvider, source, targetProvider, target, mode, overwrite);
        // delete as needed (unless target is same resurce with different path case)
        if (exists && !isSameResourceWithDifferentPathCase && overwrite) {
            await this.del(target, { recursive: true });
        }
        // create parent folders
        await this.mkdirp(targetProvider, this.getExtUri(targetProvider).providerExtUri.dirname(target));
        // copy source => target
        if (mode === 'copy') {
            // same provider with fast copy: leverage copy() functionality
            if (sourceProvider === targetProvider && hasFileFolderCopyCapability(sourceProvider)) {
                await sourceProvider.copy(source, target, { overwrite });
            }
            // when copying via buffer/unbuffered, we have to manually
            // traverse the source if it is a folder and not a file
            else {
                const sourceFile = await this.resolve(source);
                if (sourceFile.isDirectory) {
                    await this.doCopyFolder(sourceProvider, sourceFile, targetProvider, target);
                }
                else {
                    await this.doCopyFile(sourceProvider, source, targetProvider, target);
                }
            }
            return mode;
        }
        // move source => target
        else {
            // same provider: leverage rename() functionality
            if (sourceProvider === targetProvider) {
                await sourceProvider.rename(source, target, { overwrite });
                return mode;
            }
            // across providers: copy to target & delete at source
            else {
                await this.doMoveCopy(sourceProvider, source, targetProvider, target, 'copy', overwrite);
                await this.del(source, { recursive: true });
                return 'copy';
            }
        }
    }
    async doCopyFile(sourceProvider, source, targetProvider, target) {
        // copy: source (buffered) => target (buffered)
        if (hasOpenReadWriteCloseCapability(sourceProvider) && hasOpenReadWriteCloseCapability(targetProvider)) {
            return this.doPipeBuffered(sourceProvider, source, targetProvider, target);
        }
        // copy: source (buffered) => target (unbuffered)
        if (hasOpenReadWriteCloseCapability(sourceProvider) && hasReadWriteCapability(targetProvider)) {
            return this.doPipeBufferedToUnbuffered(sourceProvider, source, targetProvider, target);
        }
        // copy: source (unbuffered) => target (buffered)
        if (hasReadWriteCapability(sourceProvider) && hasOpenReadWriteCloseCapability(targetProvider)) {
            return this.doPipeUnbufferedToBuffered(sourceProvider, source, targetProvider, target);
        }
        // copy: source (unbuffered) => target (unbuffered)
        if (hasReadWriteCapability(sourceProvider) && hasReadWriteCapability(targetProvider)) {
            return this.doPipeUnbuffered(sourceProvider, source, targetProvider, target);
        }
    }
    async doCopyFolder(sourceProvider, sourceFolder, targetProvider, targetFolder) {
        // create folder in target
        await targetProvider.mkdir(targetFolder);
        // create children in target
        if (Array.isArray(sourceFolder.children)) {
            await Promises.settled(sourceFolder.children.map(async (sourceChild) => {
                const targetChild = this.getExtUri(targetProvider).providerExtUri.joinPath(targetFolder, sourceChild.name);
                if (sourceChild.isDirectory) {
                    return this.doCopyFolder(sourceProvider, await this.resolve(sourceChild.resource), targetProvider, targetChild);
                }
                else {
                    return this.doCopyFile(sourceProvider, sourceChild.resource, targetProvider, targetChild);
                }
            }));
        }
    }
    async doValidateMoveCopy(sourceProvider, source, targetProvider, target, mode, overwrite) {
        let isSameResourceWithDifferentPathCase = false;
        // Check if source is equal or parent to target (requires providers to be the same)
        if (sourceProvider === targetProvider) {
            const { providerExtUri, isPathCaseSensitive } = this.getExtUri(sourceProvider);
            if (!isPathCaseSensitive) {
                isSameResourceWithDifferentPathCase = providerExtUri.isEqual(source, target);
            }
            if (isSameResourceWithDifferentPathCase && mode === 'copy') {
                throw new Error(localize('unableToMoveCopyError1', "Unable to copy when source '{0}' is same as target '{1}' with different path case on a case insensitive file system", this.resourceForError(source), this.resourceForError(target)));
            }
            if (!isSameResourceWithDifferentPathCase && providerExtUri.isEqualOrParent(target, source)) {
                throw new Error(localize('unableToMoveCopyError2', "Unable to move/copy when source '{0}' is parent of target '{1}'.", this.resourceForError(source), this.resourceForError(target)));
            }
        }
        // Extra checks if target exists and this is not a rename
        const exists = await this.exists(target);
        if (exists && !isSameResourceWithDifferentPathCase) {
            // Bail out if target exists and we are not about to overwrite
            if (!overwrite) {
                throw new FileOperationError(localize('unableToMoveCopyError3', "Unable to move/copy '{0}' because target '{1}' already exists at destination.", this.resourceForError(source), this.resourceForError(target)), 4 /* FileOperationResult.FILE_MOVE_CONFLICT */);
            }
            // Special case: if the target is a parent of the source, we cannot delete
            // it as it would delete the source as well. In this case we have to throw
            if (sourceProvider === targetProvider) {
                const { providerExtUri } = this.getExtUri(sourceProvider);
                if (providerExtUri.isEqualOrParent(source, target)) {
                    throw new Error(localize('unableToMoveCopyError4', "Unable to move/copy '{0}' into '{1}' since a file would replace the folder it is contained in.", this.resourceForError(source), this.resourceForError(target)));
                }
            }
        }
        return { exists, isSameResourceWithDifferentPathCase };
    }
    getExtUri(provider) {
        const isPathCaseSensitive = this.isPathCaseSensitive(provider);
        return {
            providerExtUri: isPathCaseSensitive ? extUri : extUriIgnorePathCase,
            isPathCaseSensitive
        };
    }
    isPathCaseSensitive(provider) {
        return !!(provider.capabilities & 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */);
    }
    async createFolder(resource) {
        const provider = this.throwIfFileSystemIsReadonly(await this.withProvider(resource), resource);
        // mkdir recursively
        await this.mkdirp(provider, resource);
        // events
        const fileStat = await this.resolve(resource, { resolveMetadata: true });
        this._onDidRunOperation.fire(new FileOperationEvent(resource, 0 /* FileOperation.CREATE */, fileStat));
        return fileStat;
    }
    async mkdirp(provider, directory) {
        const directoriesToCreate = [];
        // mkdir until we reach root
        const { providerExtUri } = this.getExtUri(provider);
        while (!providerExtUri.isEqual(directory, providerExtUri.dirname(directory))) {
            try {
                const stat = await provider.stat(directory);
                if ((stat.type & FileType.Directory) === 0) {
                    throw new Error(localize('mkdirExistsError', "Unable to create folder '{0}' that already exists but is not a directory", this.resourceForError(directory)));
                }
                break; // we have hit a directory that exists -> good
            }
            catch (error) {
                // Bubble up any other error that is not file not found
                if (toFileSystemProviderErrorCode(error) !== FileSystemProviderErrorCode.FileNotFound) {
                    throw error;
                }
                // Upon error, remember directories that need to be created
                directoriesToCreate.push(providerExtUri.basename(directory));
                // Continue up
                directory = providerExtUri.dirname(directory);
            }
        }
        // Create directories as needed
        for (let i = directoriesToCreate.length - 1; i >= 0; i--) {
            directory = providerExtUri.joinPath(directory, directoriesToCreate[i]);
            try {
                await provider.mkdir(directory);
            }
            catch (error) {
                if (toFileSystemProviderErrorCode(error) !== FileSystemProviderErrorCode.FileExists) {
                    // For mkdirp() we tolerate that the mkdir() call fails
                    // in case the folder already exists. This follows node.js
                    // own implementation of fs.mkdir({ recursive: true }) and
                    // reduces the chances of race conditions leading to errors
                    // if multiple calls try to create the same folders
                    // As such, we only throw an error here if it is other than
                    // the fact that the file already exists.
                    // (see also https://github.com/microsoft/vscode/issues/89834)
                    throw error;
                }
            }
        }
    }
    async canDelete(resource, options) {
        try {
            await this.doValidateDelete(resource, options);
        }
        catch (error) {
            return error;
        }
        return true;
    }
    async doValidateDelete(resource, options) {
        const provider = this.throwIfFileSystemIsReadonly(await this.withProvider(resource), resource);
        // Validate trash support
        const useTrash = !!options?.useTrash;
        if (useTrash && !(provider.capabilities & 4096 /* FileSystemProviderCapabilities.Trash */)) {
            throw new Error(localize('deleteFailedTrashUnsupported', "Unable to delete file '{0}' via trash because provider does not support it.", this.resourceForError(resource)));
        }
        // Validate atomic support
        const atomic = options?.atomic;
        if (atomic && !(provider.capabilities & 65536 /* FileSystemProviderCapabilities.FileAtomicDelete */)) {
            throw new Error(localize('deleteFailedAtomicUnsupported', "Unable to delete file '{0}' atomically because provider does not support it.", this.resourceForError(resource)));
        }
        if (useTrash && atomic) {
            throw new Error(localize('deleteFailedTrashAndAtomicUnsupported', "Unable to atomically delete file '{0}' because using trash is enabled.", this.resourceForError(resource)));
        }
        // Validate delete
        let stat = undefined;
        try {
            stat = await provider.stat(resource);
        }
        catch (error) {
            // Handled later
        }
        if (stat) {
            this.throwIfFileIsReadonly(resource, stat);
        }
        else {
            throw new FileOperationError(localize('deleteFailedNotFound', "Unable to delete nonexistent file '{0}'", this.resourceForError(resource)), 1 /* FileOperationResult.FILE_NOT_FOUND */);
        }
        // Validate recursive
        const recursive = !!options?.recursive;
        if (!recursive) {
            const stat = await this.resolve(resource);
            if (stat.isDirectory && Array.isArray(stat.children) && stat.children.length > 0) {
                throw new Error(localize('deleteFailedNonEmptyFolder', "Unable to delete non-empty folder '{0}'.", this.resourceForError(resource)));
            }
        }
        return provider;
    }
    async del(resource, options) {
        const provider = await this.doValidateDelete(resource, options);
        let deleteFileOptions = options;
        if (hasFileAtomicDeleteCapability(provider) && !deleteFileOptions?.atomic) {
            const enforcedAtomicDelete = provider.enforceAtomicDelete?.(resource);
            if (enforcedAtomicDelete) {
                deleteFileOptions = { ...options, atomic: enforcedAtomicDelete };
            }
        }
        const useTrash = !!deleteFileOptions?.useTrash;
        const recursive = !!deleteFileOptions?.recursive;
        const atomic = deleteFileOptions?.atomic ?? false;
        // Delete through provider
        await provider.delete(resource, { recursive, useTrash, atomic });
        // Events
        this._onDidRunOperation.fire(new FileOperationEvent(resource, 1 /* FileOperation.DELETE */));
    }
    //#endregion
    //#region Clone File
    async cloneFile(source, target) {
        const sourceProvider = await this.withProvider(source);
        const targetProvider = this.throwIfFileSystemIsReadonly(await this.withWriteProvider(target), target);
        if (sourceProvider === targetProvider && this.getExtUri(sourceProvider).providerExtUri.isEqual(source, target)) {
            return; // return early if paths are equal
        }
        // same provider, use `cloneFile` when native support is provided
        if (sourceProvider === targetProvider && hasFileCloneCapability(sourceProvider)) {
            return sourceProvider.cloneFile(source, target);
        }
        // otherwise, either providers are different or there is no native
        // `cloneFile` support, then we fallback to emulate a clone as best
        // as we can with the other primitives
        // create parent folders
        await this.mkdirp(targetProvider, this.getExtUri(targetProvider).providerExtUri.dirname(target));
        // leverage `copy` method if provided and providers are identical
        // queue on the source to ensure atomic read
        if (sourceProvider === targetProvider && hasFileFolderCopyCapability(sourceProvider)) {
            return this.writeQueue.queueFor(source, () => sourceProvider.copy(source, target, { overwrite: true }), this.getExtUri(sourceProvider).providerExtUri);
        }
        // otherwise copy via buffer/unbuffered and use a write queue
        // on the source to ensure atomic operation as much as possible
        return this.writeQueue.queueFor(source, () => this.doCopyFile(sourceProvider, source, targetProvider, target), this.getExtUri(sourceProvider).providerExtUri);
    }
    static { this.WATCHER_CORRELATION_IDS = 0; }
    createWatcher(resource, options) {
        return this.watch(resource, {
            ...options,
            // Explicitly set a correlation id so that file events that originate
            // from requests from extensions are exclusively routed back to the
            // extension host and not into the workbench.
            correlationId: FileService_1.WATCHER_CORRELATION_IDS++
        });
    }
    watch(resource, options = { recursive: false, excludes: [] }) {
        const disposables = new DisposableStore();
        // Forward watch request to provider and wire in disposables
        let watchDisposed = false;
        let disposeWatch = () => { watchDisposed = true; };
        disposables.add(toDisposable(() => disposeWatch()));
        // Watch and wire in disposable which is async but
        // check if we got disposed meanwhile and forward
        (async () => {
            try {
                const disposable = await this.doWatch(resource, options);
                if (watchDisposed) {
                    dispose(disposable);
                }
                else {
                    disposeWatch = () => dispose(disposable);
                }
            }
            catch (error) {
                this.logService.error(error);
            }
        })();
        // When a correlation identifier is set, return a specific
        // watcher that only emits events matching that correalation.
        const correlationId = options.correlationId;
        if (typeof correlationId === 'number') {
            const fileChangeEmitter = disposables.add(new Emitter());
            disposables.add(this.internalOnDidFilesChange.event(e => {
                if (e.correlates(correlationId)) {
                    fileChangeEmitter.fire(e);
                }
            }));
            const watcher = {
                onDidChange: fileChangeEmitter.event,
                dispose: () => disposables.dispose()
            };
            return watcher;
        }
        return disposables;
    }
    async doWatch(resource, options) {
        const provider = await this.withProvider(resource);
        // Deduplicate identical watch requests
        const watchHash = hash([this.getExtUri(provider).providerExtUri.getComparisonKey(resource), options]);
        let watcher = this.activeWatchers.get(watchHash);
        if (!watcher) {
            watcher = {
                count: 0,
                disposable: provider.watch(resource, options)
            };
            this.activeWatchers.set(watchHash, watcher);
        }
        // Increment usage counter
        watcher.count += 1;
        return toDisposable(() => {
            if (watcher) {
                // Unref
                watcher.count--;
                // Dispose only when last user is reached
                if (watcher.count === 0) {
                    dispose(watcher.disposable);
                    this.activeWatchers.delete(watchHash);
                }
            }
        });
    }
    dispose() {
        super.dispose();
        for (const [, watcher] of this.activeWatchers) {
            dispose(watcher.disposable);
        }
        this.activeWatchers.clear();
    }
    async doWriteBuffered(provider, resource, options, readableOrStreamOrBufferedStream) {
        return this.writeQueue.queueFor(resource, async () => {
            // open handle
            const handle = await provider.open(resource, { create: true, unlock: options?.unlock ?? false, append: options?.append ?? false });
            // write into handle until all bytes from buffer have been written
            try {
                if (isReadableStream(readableOrStreamOrBufferedStream) || isReadableBufferedStream(readableOrStreamOrBufferedStream)) {
                    await this.doWriteStreamBufferedQueued(provider, handle, readableOrStreamOrBufferedStream);
                }
                else {
                    await this.doWriteReadableBufferedQueued(provider, handle, readableOrStreamOrBufferedStream);
                }
            }
            catch (error) {
                throw ensureFileSystemProviderError(error);
            }
            finally {
                // close handle always
                await provider.close(handle);
            }
        }, this.getExtUri(provider).providerExtUri);
    }
    async doWriteStreamBufferedQueued(provider, handle, streamOrBufferedStream) {
        let posInFile = 0;
        let stream;
        // Buffered stream: consume the buffer first by writing
        // it to the target before reading from the stream.
        if (isReadableBufferedStream(streamOrBufferedStream)) {
            if (streamOrBufferedStream.buffer.length > 0) {
                const chunk = VSBuffer.concat(streamOrBufferedStream.buffer);
                await this.doWriteBuffer(provider, handle, chunk, chunk.byteLength, posInFile, 0);
                posInFile += chunk.byteLength;
            }
            // If the stream has been consumed, return early
            if (streamOrBufferedStream.ended) {
                return;
            }
            stream = streamOrBufferedStream.stream;
        }
        // Unbuffered stream - just take as is
        else {
            stream = streamOrBufferedStream;
        }
        return new Promise((resolve, reject) => {
            listenStream(stream, {
                onData: async (chunk) => {
                    // pause stream to perform async write operation
                    stream.pause();
                    try {
                        await this.doWriteBuffer(provider, handle, chunk, chunk.byteLength, posInFile, 0);
                    }
                    catch (error) {
                        return reject(error);
                    }
                    posInFile += chunk.byteLength;
                    // resume stream now that we have successfully written
                    // run this on the next tick to prevent increasing the
                    // execution stack because resume() may call the event
                    // handler again before finishing.
                    setTimeout(() => stream.resume());
                },
                onError: error => reject(error),
                onEnd: () => resolve()
            });
        });
    }
    async doWriteReadableBufferedQueued(provider, handle, readable) {
        let posInFile = 0;
        let chunk;
        while ((chunk = readable.read()) !== null) {
            await this.doWriteBuffer(provider, handle, chunk, chunk.byteLength, posInFile, 0);
            posInFile += chunk.byteLength;
        }
    }
    async doWriteBuffer(provider, handle, buffer, length, posInFile, posInBuffer) {
        let totalBytesWritten = 0;
        while (totalBytesWritten < length) {
            // Write through the provider
            const bytesWritten = await provider.write(handle, posInFile + totalBytesWritten, buffer.buffer, posInBuffer + totalBytesWritten, length - totalBytesWritten);
            totalBytesWritten += bytesWritten;
        }
    }
    async doWriteUnbuffered(provider, resource, options, bufferOrReadableOrStreamOrBufferedStream) {
        return this.writeQueue.queueFor(resource, () => this.doWriteUnbufferedQueued(provider, resource, options, bufferOrReadableOrStreamOrBufferedStream), this.getExtUri(provider).providerExtUri);
    }
    async doWriteUnbufferedQueued(provider, resource, options, bufferOrReadableOrStreamOrBufferedStream) {
        let buffer;
        if (bufferOrReadableOrStreamOrBufferedStream instanceof VSBuffer) {
            buffer = bufferOrReadableOrStreamOrBufferedStream;
        }
        else if (isReadableStream(bufferOrReadableOrStreamOrBufferedStream)) {
            buffer = await streamToBuffer(bufferOrReadableOrStreamOrBufferedStream);
        }
        else if (isReadableBufferedStream(bufferOrReadableOrStreamOrBufferedStream)) {
            buffer = await bufferedStreamToBuffer(bufferOrReadableOrStreamOrBufferedStream);
        }
        else {
            buffer = readableToBuffer(bufferOrReadableOrStreamOrBufferedStream);
        }
        // Write through the provider
        await provider.writeFile(resource, buffer.buffer, { create: true, overwrite: true, unlock: options?.unlock ?? false, atomic: options?.atomic ?? false, append: options?.append ?? false });
    }
    async doPipeBuffered(sourceProvider, source, targetProvider, target) {
        return this.writeQueue.queueFor(target, () => this.doPipeBufferedQueued(sourceProvider, source, targetProvider, target), this.getExtUri(targetProvider).providerExtUri);
    }
    async doPipeBufferedQueued(sourceProvider, source, targetProvider, target) {
        let sourceHandle = undefined;
        let targetHandle = undefined;
        try {
            // Open handles
            sourceHandle = await sourceProvider.open(source, { create: false });
            targetHandle = await targetProvider.open(target, { create: true, unlock: false });
            const buffer = VSBuffer.alloc(this.BUFFER_SIZE);
            let posInFile = 0;
            let posInBuffer = 0;
            let bytesRead = 0;
            do {
                // read from source (sourceHandle) at current position (posInFile) into buffer (buffer) at
                // buffer position (posInBuffer) up to the size of the buffer (buffer.byteLength).
                bytesRead = await sourceProvider.read(sourceHandle, posInFile, buffer.buffer, posInBuffer, buffer.byteLength - posInBuffer);
                // write into target (targetHandle) at current position (posInFile) from buffer (buffer) at
                // buffer position (posInBuffer) all bytes we read (bytesRead).
                await this.doWriteBuffer(targetProvider, targetHandle, buffer, bytesRead, posInFile, posInBuffer);
                posInFile += bytesRead;
                posInBuffer += bytesRead;
                // when buffer full, fill it again from the beginning
                if (posInBuffer === buffer.byteLength) {
                    posInBuffer = 0;
                }
            } while (bytesRead > 0);
        }
        catch (error) {
            throw ensureFileSystemProviderError(error);
        }
        finally {
            await Promises.settled([
                typeof sourceHandle === 'number' ? sourceProvider.close(sourceHandle) : Promise.resolve(),
                typeof targetHandle === 'number' ? targetProvider.close(targetHandle) : Promise.resolve(),
            ]);
        }
    }
    async doPipeUnbuffered(sourceProvider, source, targetProvider, target) {
        return this.writeQueue.queueFor(target, () => this.doPipeUnbufferedQueued(sourceProvider, source, targetProvider, target), this.getExtUri(targetProvider).providerExtUri);
    }
    async doPipeUnbufferedQueued(sourceProvider, source, targetProvider, target) {
        return targetProvider.writeFile(target, await sourceProvider.readFile(source), { create: true, overwrite: true, unlock: false, atomic: false });
    }
    async doPipeUnbufferedToBuffered(sourceProvider, source, targetProvider, target) {
        return this.writeQueue.queueFor(target, () => this.doPipeUnbufferedToBufferedQueued(sourceProvider, source, targetProvider, target), this.getExtUri(targetProvider).providerExtUri);
    }
    async doPipeUnbufferedToBufferedQueued(sourceProvider, source, targetProvider, target) {
        // Open handle
        const targetHandle = await targetProvider.open(target, { create: true, unlock: false });
        // Read entire buffer from source and write buffered
        try {
            const buffer = await sourceProvider.readFile(source);
            await this.doWriteBuffer(targetProvider, targetHandle, VSBuffer.wrap(buffer), buffer.byteLength, 0, 0);
        }
        catch (error) {
            throw ensureFileSystemProviderError(error);
        }
        finally {
            await targetProvider.close(targetHandle);
        }
    }
    async doPipeBufferedToUnbuffered(sourceProvider, source, targetProvider, target) {
        // Read buffer via stream buffered
        const buffer = await streamToBuffer(this.readFileBuffered(sourceProvider, source, CancellationToken.None));
        // Write buffer into target at once
        await this.doWriteUnbuffered(targetProvider, target, undefined, buffer);
    }
    throwIfFileSystemIsReadonly(provider, resource) {
        if (provider.capabilities & 2048 /* FileSystemProviderCapabilities.Readonly */) {
            throw new FileOperationError(localize('err.readonly', "Unable to modify read-only file '{0}'", this.resourceForError(resource)), 6 /* FileOperationResult.FILE_PERMISSION_DENIED */);
        }
        return provider;
    }
    throwIfFileIsReadonly(resource, stat) {
        if ((stat.permissions ?? 0) & FilePermission.Readonly) {
            throw new FileOperationError(localize('err.readonly', "Unable to modify read-only file '{0}'", this.resourceForError(resource)), 6 /* FileOperationResult.FILE_PERMISSION_DENIED */);
        }
    }
    resourceForError(resource) {
        if (resource.scheme === Schemas.file) {
            return resource.fsPath;
        }
        return resource.toString(true);
    }
};
FileService = FileService_1 = __decorate([
    __param(0, ILogService)
], FileService);
export { FileService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsUUFBUSxFQUFFLGFBQWEsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxnQkFBZ0IsRUFBRSx3QkFBd0IsRUFBRSxnQkFBZ0IsRUFBRSxjQUFjLEVBQUUsUUFBUSxFQUE0RSxNQUFNLGdDQUFnQyxDQUFDO0FBQzFPLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN4RCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDcEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBZSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNwSCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDMUQsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxNQUFNLEVBQUUsb0JBQW9CLEVBQVcsY0FBYyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDMUcsT0FBTyxFQUFFLGFBQWEsRUFBRSx3QkFBd0IsRUFBRSxnQkFBZ0IsRUFBRSxZQUFZ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