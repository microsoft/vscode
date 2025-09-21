/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { sumBy } from '../../../../base/common/arrays.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { decodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenPool, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { autorun } from '../../../../base/common/observable.js';
import { newWriteableStream, ReadableStreamEvents } from '../../../../base/common/stream.js';
import { equalsIgnoreCase } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { createFileSystemProviderError, FileChangeType, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, IFileChange, IFileDeleteOptions, IFileOverwriteOptions, IFileReadStreamOptions, IFileService, IFileSystemProviderWithFileAtomicReadCapability, IFileSystemProviderWithFileReadStreamCapability, IFileSystemProviderWithFileReadWriteCapability, IFileWriteOptions, IStat, IWatchOptions } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { McpServer } from './mcpServer.js';
import { McpServerRequestHandler } from './mcpServerRequestHandler.js';
import { IMcpService, McpCapability, McpResourceURI } from './mcpTypes.js';
import { MCP } from './modelContextProtocol.js';

const MOMENTARY_CACHE_DURATION = 3000;

interface IReadData {
	contents: (MCP.TextResourceContents | MCP.BlobResourceContents)[];
	resourceURI: URL;
	forSameURI: (MCP.TextResourceContents | MCP.BlobResourceContents)[];
}

export class McpResourceFilesystem extends Disposable implements IWorkbenchContribution,
	IFileSystemProviderWithFileReadWriteCapability,
	IFileSystemProviderWithFileAtomicReadCapability,
	IFileSystemProviderWithFileReadStreamCapability {
	/** Defer getting the MCP service since this is a BlockRestore and no need to make it unnecessarily. */
	private readonly _mcpServiceLazy = new Lazy(() => this._instantiationService.invokeFunction(a => a.get(IMcpService)));

	/**
	 * For many file operations we re-read the resources quickly (e.g. stat
	 * before reading the file) and would prefer to avoid spamming the MCP
	 * with multiple reads. This is a very short-duration cache
	 * to solve that.
	 */
	private readonly _momentaryCache = new ResourceMap<{ pool: CancellationTokenPool; promise: Promise<IReadData> }>();

	private get _mcpService() {
		return this._mcpServiceLazy.value;
	}

	public readonly onDidChangeCapabilities = Event.None;

	private readonly _onDidChangeFile = this._register(new Emitter<readonly IFileChange[]>());
	public readonly onDidChangeFile = this._onDidChangeFile.event;

	public readonly capabilities: FileSystemProviderCapabilities = FileSystemProviderCapabilities.None
		| FileSystemProviderCapabilities.Readonly
		| FileSystemProviderCapabilities.PathCaseSensitive
		| FileSystemProviderCapabilities.FileReadStream
		| FileSystemProviderCapabilities.FileAtomicRead
		| FileSystemProviderCapabilities.FileReadWrite;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super();
		this._register(this._fileService.registerProvider(McpResourceURI.scheme, this));
	}

	//#region Filesystem API

	public async readFile(resource: URI): Promise<Uint8Array> {
		return this._readFile(resource);
	}

	public readFileStream(resource: URI, opts: IFileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array> {
		const stream = newWriteableStream<Uint8Array>(data => VSBuffer.concat(data.map(data => VSBuffer.wrap(data))).buffer);

		this._readFile(resource, token).then(
			data => {
				if (opts.position) {
					data = data.slice(opts.position);
				}

				if (opts.length) {
					data = data.slice(0, opts.length);
				}

				stream.end(data);
			},
			err => stream.error(err),
		);

		return stream;
	}

	public watch(uri: URI, _opts: IWatchOptions): IDisposable {
		const { resourceURI, server } = this._decodeURI(uri);
		const cap = server.capabilities.get();
		if (cap !== undefined && !(cap & McpCapability.ResourcesSubscribe)) {
			return Disposable.None;
		}

		server.start();

		const store = new DisposableStore();
		let watchedOnHandler: McpServerRequestHandler | undefined;
		const watchListener = store.add(new MutableDisposable());
		const callCts = store.add(new MutableDisposable<CancellationTokenSource>());
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
			handler.subscribe({ uri: resourceURI.toString() }, token).then(
				() => {
					if (!token.isCancellationRequested) {
						watchListener.value = handler.onDidUpdateResource(e => {
							if (equalsUrlPath(e.params.uri, resourceURI)) {
								this._onDidChangeFile.fire([{ resource: uri, type: FileChangeType.UPDATED }]);
							}
						});
					}
				}, err => {
					handler.logger.warn(`Failed to subscribe to resource changes for ${resourceURI}: ${err}`);
					watchedOnHandler = undefined;
				},
			);
		}));

		return store;
	}

	public async stat(resource: URI): Promise<IStat> {
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

	public async readdir(resource: URI): Promise<[string, FileType][]> {
		const { forSameURI, contents, resourceURI } = await this._readURI(resource);
		if (forSameURI.length > 0) {
			throw createFileSystemProviderError(`File is not a directory`, FileSystemProviderErrorCode.FileNotADirectory);
		}

		const resourcePathParts = resourceURI.pathname.split('/');

		const output = new Map<string, FileType>();
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

	public mkdir(resource: URI): Promise<void> {
		throw createFileSystemProviderError('write is not supported', FileSystemProviderErrorCode.NoPermissions);
	}
	public writeFile(resource: URI, content: Uint8Array, opts: IFileWriteOptions): Promise<void> {
		throw createFileSystemProviderError('write is not supported', FileSystemProviderErrorCode.NoPermissions);
	}
	public delete(resource: URI, opts: IFileDeleteOptions): Promise<void> {
		throw createFileSystemProviderError('delete is not supported', FileSystemProviderErrorCode.NoPermissions);
	}
	public rename(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void> {
		throw createFileSystemProviderError('rename is not supported', FileSystemProviderErrorCode.NoPermissions);
	}

	//#endregion

	private async _readFile(resource: URI, token?: CancellationToken): Promise<Uint8Array> {
		const { forSameURI, contents } = await this._readURI(resource);

		// MCP does not distinguish between files and directories, and says that
		// servers should just return multiple when 'reading' a directory.
		if (!forSameURI.length) {
			if (!contents.length) {
				throw createFileSystemProviderError(`File not found`, FileSystemProviderErrorCode.FileNotFound);
			} else {
				throw createFileSystemProviderError(`File is a directory`, FileSystemProviderErrorCode.FileIsADirectory);
			}
		}

		return contentToBuffer(forSameURI[0]);
	}

	private _decodeURI(uri: URI) {
		let definitionId: string;
		let resourceURL: URL;
		try {
			({ definitionId, resourceURL } = McpResourceURI.toServer(uri));
		} catch (e) {
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
		if (cap !== undefined && !(cap & McpCapability.Resources)) {
			throw createFileSystemProviderError(`MCP server ${definitionId} does not support resources`, FileSystemProviderErrorCode.FileNotFound);
		}

		return { definitionId, resourceURI: resourceURL, server };
	}

	private async _readURI(uri: URI, token?: CancellationToken) {
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

	private async _readURIInner(uri: URI, token?: CancellationToken): Promise<IReadData> {
		const { resourceURI, server } = this._decodeURI(uri);
		const res = await McpServer.callOn(server, r => r.readResource({ uri: resourceURI.toString() }, token), token);

		return {
			contents: res.contents,
			resourceURI,
			forSameURI: res.contents.filter(c => equalsUrlPath(c.uri, resourceURI)),
		};
	}
}

function equalsUrlPath(a: string, b: URL): boolean {
	// MCP doesn't specify either way, but underlying systems may can be case-sensitive.
	// It's better to treat case-sensitive paths as case-insensitive than vise-versa.
	return equalsIgnoreCase(new URL(a).pathname, b.pathname);
}

function contentToBuffer(content: MCP.TextResourceContents | MCP.BlobResourceContents): Uint8Array {
	if ('text' in content) {
		return VSBuffer.fromString(content.text).buffer;
	} else if ('blob' in content) {
		return decodeBase64(content.blob).buffer;
	} else {
		throw createFileSystemProviderError('Unknown content type', FileSystemProviderErrorCode.Unknown);
	}
}
