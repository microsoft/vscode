/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { newWriteableStream, ReadableStreamEvents } from '../../../../../base/common/stream.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { createFileSystemProviderError, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, IFileService, IFileSystemProvider, IFileSystemProviderWithFileAtomicReadCapability, IFileSystemProviderWithFileReadStreamCapability, IFileSystemProviderWithFileReadWriteCapability, IStat } from '../../../../../platform/files/common/files.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ChatResponseResource } from '../model/chatModel.js';
import { IChatService, IChatToolInvocation, IChatToolInvocationSerialized } from '../chatService/chatService.js';
import { isToolResultInputOutputDetails } from '../tools/languageModelToolsService.js';

export const IChatResponseResourceFileSystemProvider = createDecorator<IChatResponseResourceFileSystemProvider>('chatResponseResourceFileSystemProvider');

export interface IChatResponseResourceFileSystemProvider extends IFileSystemProvider {
	readonly _serviceBrand: undefined;

	/**
	 * Associates arbitrary data with a URI in the chat response resource filesystem.
	 * The data is scoped to the given session and automatically cleaned up when
	 * the session is disposed.
	 * Returns a URI that can later be read via the file service.
	 */
	associate(sessionResource: URI, data: Uint8Array | { base64: string }, name?: string): URI;
}

export class ChatResponseResourceFileSystemProvider extends Disposable implements
	IChatResponseResourceFileSystemProvider,
	IFileSystemProviderWithFileReadWriteCapability,
	IFileSystemProviderWithFileAtomicReadCapability,
	IFileSystemProviderWithFileReadStreamCapability {

	declare readonly _serviceBrand: undefined;

	public readonly onDidChangeCapabilities = Event.None;
	public readonly onDidChangeFile = Event.None;

	public readonly capabilities: FileSystemProviderCapabilities = FileSystemProviderCapabilities.None
		| FileSystemProviderCapabilities.Readonly
		| FileSystemProviderCapabilities.PathCaseSensitive
		| FileSystemProviderCapabilities.FileReadStream
		| FileSystemProviderCapabilities.FileAtomicRead
		| FileSystemProviderCapabilities.FileReadWrite;

	/** In-memory store for data associated via {@link associate}, keyed by URI. */
	private readonly _associated = new ResourceMap<Uint8Array | { base64: string }>();

	/** Tracks which associated URIs belong to which session, for cleanup on dispose. */
	private readonly _sessionAssociations = new ResourceMap<ResourceSet>();

	constructor(
		@IChatService private readonly chatService: IChatService,
		@IFileService private readonly _fileService: IFileService
	) {
		super();
		this._register(this.chatService.onDidDisposeSession(e => {
			for (const sessionResource of e.sessionResources) {
				const uris = this._sessionAssociations.get(sessionResource);
				if (uris) {
					for (const uri of uris) {
						this._associated.delete(uri);
					}
					this._sessionAssociations.delete(sessionResource);
				}
			}
		}));
	}

	associate(sessionResource: URI, data: Uint8Array | { base64: string }, name?: string): URI {
		const id = generateUuid();
		const uri = URI.from({
			scheme: ChatResponseResource.scheme,
			path: `/assoc/${id}` + (name ? `/${name}` : ''),
		});
		this._associated.set(uri, data);

		let set = this._sessionAssociations.get(sessionResource);
		if (!set) {
			set = new ResourceSet();
			this._sessionAssociations.set(sessionResource, set);
		}
		set.add(uri);

		return uri;
	}

	readFile(resource: URI): Promise<Uint8Array> {
		return Promise.resolve(this.lookupURI(resource));
	}

	readFileStream(resource: URI): ReadableStreamEvents<Uint8Array> {
		const stream = newWriteableStream<Uint8Array>(data => VSBuffer.concat(data.map(data => VSBuffer.wrap(data))).buffer);
		Promise.resolve(this.lookupURI(resource)).then(v => stream.end(v));
		return stream;
	}

	async stat(resource: URI): Promise<IStat> {
		const r = await this.lookupURI(resource);
		return {
			type: FileType.File,
			ctime: 0,
			mtime: 0,
			size: r.length,
		};
	}

	delete(): Promise<void> {
		throw createFileSystemProviderError('fs is readonly', FileSystemProviderErrorCode.NoPermissions);
	}

	watch(): IDisposable {
		return Disposable.None;
	}

	mkdir(): Promise<void> {
		throw createFileSystemProviderError('fs is readonly', FileSystemProviderErrorCode.NoPermissions);
	}

	readdir(): Promise<[string, FileType][]> {
		return Promise.resolve([]);
	}

	rename(): Promise<void> {
		throw createFileSystemProviderError('fs is readonly', FileSystemProviderErrorCode.NoPermissions);
	}

	writeFile(): Promise<void> {
		throw createFileSystemProviderError('fs is readonly', FileSystemProviderErrorCode.NoPermissions);
	}

	private findMatchingInvocation(uri: URI) {
		const parsed = ChatResponseResource.parseUri(uri);
		if (!parsed) {
			throw createFileSystemProviderError(`File not found`, FileSystemProviderErrorCode.FileNotFound);
		}
		const { sessionResource, toolCallId, index } = parsed;
		const session = this.chatService.getSession(sessionResource);
		if (!session) {
			throw createFileSystemProviderError(`File not found`, FileSystemProviderErrorCode.FileNotFound);
		}

		const requests = session.getRequests();
		for (let k = requests.length - 1; k >= 0; k--) {
			const req = requests[k];
			const tc = req.response?.entireResponse.value.find((r): r is IChatToolInvocation | IChatToolInvocationSerialized => (r.kind === 'toolInvocation' || r.kind === 'toolInvocationSerialized') && r.toolCallId === toolCallId);
			if (tc) {
				return { result: tc, index };
			}
		}

		throw createFileSystemProviderError(`File not found`, FileSystemProviderErrorCode.FileNotFound);
	}

	private lookupURI(uri: URI): Uint8Array | Promise<Uint8Array> {
		const associated = this._associated.get(uri);
		if (associated) {
			if (associated instanceof Uint8Array) {
				return associated;
			}
			const decoded = decodeBase64(associated.base64).buffer;
			this._associated.set(uri, decoded);
			return decoded;
		}

		const { result, index } = this.findMatchingInvocation(uri);
		const details = IChatToolInvocation.resultDetails(result);
		if (!isToolResultInputOutputDetails(details)) {
			throw createFileSystemProviderError(`Tool does not have I/O`, FileSystemProviderErrorCode.FileNotFound);
		}

		const part = details.output.at(index);
		if (!part) {
			throw createFileSystemProviderError(`Tool does not have part`, FileSystemProviderErrorCode.FileNotFound);
		}

		if (part.type === 'ref') {
			return this._fileService.readFile(part.uri).then(r => r.value.buffer);
		}

		return part.isText ? new TextEncoder().encode(part.value) : decodeBase64(part.value).buffer;
	}
}

export class ChatResponseResourceWorkbenchContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chatResponseResourceWorkbenchContribution';

	constructor(
		@IChatResponseResourceFileSystemProvider chatResponseResourceFsProvider: IChatResponseResourceFileSystemProvider,
		@IFileService fileService: IFileService,
	) {
		super();
		this._register(fileService.registerProvider(ChatResponseResource.scheme, chatResponseResourceFsProvider));
	}
}
