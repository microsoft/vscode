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
import { sumBy } from '../../../../base/common/arrays.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { decodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenPool, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { autorun } from '../../../../base/common/observable.js';
import { newWriteableStream } from '../../../../base/common/stream.js';
import { equalsIgnoreCase } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { createFileSystemProviderError, FileSystemProviderErrorCode, FileType, IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWebContentExtractorService } from '../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { McpServer } from './mcpServer.js';
import { IMcpService, McpResourceURI } from './mcpTypes.js';
import { canLoadMcpNetworkResourceDirectly } from './mcpTypesUtils.js';
const MOMENTARY_CACHE_DURATION = 3000;
let McpResourceFilesystem = class McpResourceFilesystem extends Disposable {
    get _mcpService() {
        return this._mcpServiceLazy.value;
    }
    constructor(_instantiationService, _fileService, _webContentExtractorService) {
        super();
        this._instantiationService = _instantiationService;
        this._fileService = _fileService;
        this._webContentExtractorService = _webContentExtractorService;
        /** Defer getting the MCP service since this is a BlockRestore and no need to make it unnecessarily. */
        this._mcpServiceLazy = new Lazy(() => this._instantiationService.invokeFunction(a => a.get(IMcpService)));
        /**
         * For many file operations we re-read the resources quickly (e.g. stat
         * before reading the file) and would prefer to avoid spamming the MCP
         * with multiple reads. This is a very short-duration cache
         * to solve that.
         */
        this._momentaryCache = new ResourceMap();
        this.onDidChangeCapabilities = Event.None;
        this._onDidChangeFile = this._register(new Emitter());
        this.onDidChangeFile = this._onDidChangeFile.event;
        this.capabilities = 0 /* FileSystemProviderCapabilities.None */
            | 2048 /* FileSystemProviderCapabilities.Readonly */
            | 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */
            | 16 /* FileSystemProviderCapabilities.FileReadStream */
            | 16384 /* FileSystemProviderCapabilities.FileAtomicRead */
            | 2 /* FileSystemProviderCapabilities.FileReadWrite */;
        this._register(this._fileService.registerProvider(McpResourceURI.scheme, this));
    }
    //#region Filesystem API
    async readFile(resource) {
        return this._readFile(resource);
    }
    readFileStream(resource, opts, token) {
        const stream = newWriteableStream(data => VSBuffer.concat(data.map(data => VSBuffer.wrap(data))).buffer);
        this._readFile(resource, token).then(data => {
            if (opts.position) {
                data = data.slice(opts.position);
            }
            if (opts.length) {
                data = data.slice(0, opts.length);
            }
            stream.end(data);
        }, err => stream.error(err));
        return stream;
    }
    watch(uri, _opts) {
        const { resourceURI, server } = this._decodeURI(uri);
        const cap = server.capabilities.get();
        if (cap !== undefined && !(cap & 32 /* McpCapability.ResourcesSubscribe */)) {
            return Disposable.None;
        }
        server.start();
        const store = new DisposableStore();
        let watchedOnHandler;
        const watchListener = store.add(new MutableDisposable());
        const callCts = store.add(new MutableDisposable());
        store.add(autorun(reader => {
            const connection = server.connection.read(reader);
            if (!connection) {
                return;
            }
            const handler = connection.handler.read(reader);
            if (!handler || watchedOnHandler === handler) {
                return;
            }
            callCts.value?.dispose(true);
            callCts.value = new CancellationTokenSource();
            watchedOnHandler = handler;
            const token = callCts.value.token;
            handler.subscribe({ uri: resourceURI.toString() }, token).then(() => {
                if (!token.isCancellationRequested) {
                    watchListener.value = handler.onDidUpdateResource(e => {
                        if (equalsUrlPath(e.params.uri, resourceURI)) {
                            this._onDidChangeFile.fire([{ resource: uri, type: 0 /* FileChangeType.UPDATED */ }]);
                        }
                    });
                }
            }, err => {
                handler.logger.warn(`Failed to subscribe to resource changes for ${resourceURI}: ${err}`);
                watchedOnHandler = undefined;
            });
        }));
        return store;
    }
    async stat(resource) {
        const { forSameURI, contents } = await this._readURI(resource);
        if (!contents.length) {
            throw createFileSystemProviderError(`File not found`, FileSystemProviderErrorCode.FileNotFound);
        }
        return {
            ctime: 0,
            mtime: 0,
            size: sumBy(contents, c => contentToBuffer(c).byteLength),
            type: forSameURI.length ? FileType.File : FileType.Directory,
        };
    }
    async readdir(resource) {
        const { forSameURI, contents, resourceURI } = await this._readURI(resource);
        if (forSameURI.length > 0) {
            throw createFileSystemProviderError(`File is not a directory`, FileSystemProviderErrorCode.FileNotADirectory);
        }
        const resourcePathParts = resourceURI.pathname.split('/');
        const output = new Map();
        for (const content of contents) {
            const contentURI = URI.parse(content.uri);
            const contentPathParts = contentURI.path.split('/');
            // Skip contents that are not in the same directory
            if (contentPathParts.length <= resourcePathParts.length || !resourcePathParts.every((part, index) => equalsIgnoreCase(part, contentPathParts[index]))) {
                continue;
            }
            // nested resource in a directory, just emit a directory to output
            else if (contentPathParts.length > resourcePathParts.length + 1) {
                output.set(contentPathParts[resourcePathParts.length], FileType.Directory);
            }
            else {
                // resource in the same directory, emit the file
                const name = contentPathParts[contentPathParts.length - 1];
                output.set(name, contentToBuffer(content).byteLength > 0 ? FileType.File : FileType.Directory);
            }
        }
        return [...output];
    }
    mkdir(resource) {
        throw createFileSystemProviderError('write is not supported', FileSystemProviderErrorCode.NoPermissions);
    }
    writeFile(resource, content, opts) {
        throw createFileSystemProviderError('write is not supported', FileSystemProviderErrorCode.NoPermissions);
    }
    delete(resource, opts) {
        throw createFileSystemProviderError('delete is not supported', FileSystemProviderErrorCode.NoPermissions);
    }
    rename(from, to, opts) {
        throw createFileSystemProviderError('rename is not supported', FileSystemProviderErrorCode.NoPermissions);
    }
    //#endregion
    async _readFile(resource, token) {
        const { forSameURI, contents } = await this._readURI(resource);
        // MCP does not distinguish between files and directories, and says that
        // servers should just return multiple when 'reading' a directory.
        if (!forSameURI.length) {
            if (!contents.length) {
                throw createFileSystemProviderError(`File not found`, FileSystemProviderErrorCode.FileNotFound);
            }
            else {
                throw createFileSystemProviderError(`File is a directory`, FileSystemProviderErrorCode.FileIsADirectory);
            }
        }
        return contentToBuffer(forSameURI[0]);
    }
    _decodeURI(uri) {
        let definitionId;
        let resourceURL;
        try {
            ({ definitionId, resourceURL } = McpResourceURI.toServer(uri));
        }
        catch (e) {
            throw createFileSystemProviderError(String(e), FileSystemProviderErrorCode.FileNotFound);
        }
        if (resourceURL.pathname.endsWith('/')) {
            resourceURL.pathname = resourceURL.pathname.slice(0, -1);
        }
        const server = this._mcpService.servers.get().find(s => s.definition.id === definitionId);
        if (!server) {
            throw createFileSystemProviderError(`MCP server ${definitionId} not found`, FileSystemProviderErrorCode.FileNotFound);
        }
        const cap = server.capabilities.get();
        if (cap !== undefined && !(cap & 16 /* McpCapability.Resources */)) {
            throw createFileSystemProviderError(`MCP server ${definitionId} does not support resources`, FileSystemProviderErrorCode.FileNotFound);
        }
        return { definitionId, resourceURI: resourceURL, server };
    }
    async _readURI(uri, token) {
        const cached = this._momentaryCache.get(uri);
        if (cached) {
            cached.pool.add(token || CancellationToken.None);
            return cached.promise;
        }
        const pool = this._store.add(new CancellationTokenPool());
        pool.add(token || CancellationToken.None);
        const promise = this._readURIInner(uri, pool.token);
        this._momentaryCache.set(uri, { pool, promise });
        const disposable = this._store.add(disposableTimeout(() => {
            this._momentaryCache.delete(uri);
            this._store.delete(disposable);
            this._store.delete(pool);
        }, MOMENTARY_CACHE_DURATION));
        return promise;
    }
    async _readURIInner(uri, token) {
        const { resourceURI, server } = this._decodeURI(uri);
        const matchedServer = this._mcpService.servers.get().find(s => s.definition.id === server.definition.id);
        //check for http/https resources and use web content extractor service to fetch the contents.
        if (canLoadMcpNetworkResourceDirectly(resourceURI, matchedServer)) {
            const extractURI = URI.parse(resourceURI.toString());
            const result = (await this._webContentExtractorService.extract([extractURI], { followRedirects: false })).at(0);
            if (result?.status === 'ok') {
                return {
                    contents: [{ uri: resourceURI.toString(), text: result.result }],
                    resourceURI,
                    forSameURI: [{ uri: resourceURI.toString(), text: result.result }]
                };
            }
        }
        const res = await McpServer.callOn(server, r => r.readResource({ uri: resourceURI.toString() }, token), token);
        return {
            contents: res.contents,
            resourceURI,
            forSameURI: res.contents.filter(c => equalsUrlPath(c.uri, resourceURI))
        };
    }
};
McpResourceFilesystem = __decorate([
    __param(0, IInstantiationService),
    __param(1, IFileService),
    __param(2, IWebContentExtractorService)
], McpResourceFilesystem);
export { McpResourceFilesystem };
function equalsUrlPath(a, b) {
    // MCP doesn't specify either way, but underlying systems may can be case-sensitive.
    // It's better to treat case-sensitive paths as case-insensitive than vise-versa.
    return equalsIgnoreCase(new URL(a).pathname, b.pathname);
}
function contentToBuffer(content) {
    if ('text' in content) {
        return VSBuffer.fromString(content.text).buffer;
    }
    else if ('blob' in content) {
        return decodeBase64(content.blob).buffer;
    }
    else {
        throw createFileSystemProviderError('Unknown content type', FileSystemProviderErrorCode.Unknown);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwUmVzb3VyY2VGaWxlc3lzdGVtLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWNwL2NvbW1vbi9tY3BSZXNvdXJjZUZpbGVzeXN0ZW0udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxZQUFZLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDM0UsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHFCQUFxQixFQUFFLHVCQUF1QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDNUgsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuSCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDN0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxrQkFBa0IsRUFBd0IsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLDZCQUE2QixFQUFrRCwyQkFBMkIsRUFBRSxRQUFRLEVBQWtGLFlBQVksRUFBNkwsTUFBTSw0Q0FBNEMsQ0FBQztBQUMzYyxPQUFP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