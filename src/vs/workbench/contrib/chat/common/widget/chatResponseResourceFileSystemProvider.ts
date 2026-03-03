/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { newWriteableStream, ReadableStreamEvents } from '../../../../../base/common/stream.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { createFileSystemProviderError, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, IFileService, IFileSystemProviderWithFileAtomicReadCapability, IFileSystemProviderWithFileReadStreamCapability, IFileSystemProviderWithFileReadWriteCapability, IStat } from '../../../../../platform/files/common/files.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ChatResponseResource } from '../model/chatModel.js';
import { IChatService, IChatToolInvocation, IChatToolInvocationSerialized } from '../chatService/chatService.js';
import { isToolResultInputOutputDetails } from '../tools/languageModelToolsService.js';

export const IChatResponseResourceFileSystemProvider = createDecorator<IChatResponseResourceFileSystemProvider>('chatResponseResourceFileSystemProvider');

export interface IChatResponseResourceFileSystemProvider {
	readonly _serviceBrand: undefined;

	/**
	 * Associates arbitrary data with a URI in the chat response resource filesystem.
	 * The data is scoped to the given session and automatically cleaned up when
	 * the session is disposed.
	 * Returns a URI that can later be read via the file service.
	 */
	associate(sessionResource: URI, data: Uint8Array, name?: string): URI;
}

export class ChatResponseResourceFileSystemProvider extends Disposable implements
	IWorkbenchContribution,
	IChatResponseResourceFileSystemProvider,
	IFileSystemProviderWithFileReadWriteCapability,
	IFileSystemProviderWithFileAtomicReadCapability,
	IFileSystemProviderWithFileReadStreamCapability {

	declare readonly _serviceBrand: undefined;

	public static readonly ID = 'workbench.contrib.chatResponseResourceFileSystemProvider';

	public readonly onDidChangeCapabilities = Event.None;
	public readonly onDidChangeFile = Event.None;

	public readonly capabilities: FileSystemProviderCapabilities = FileSystemProviderCapabilities.None
		| FileSystemProviderCapabilities.Readonly
		| FileSystemProviderCapabilities.PathCaseSensitive
		| FileSystemProviderCapabilities.FileReadStream
		| FileSystemProviderCapabilities.FileAtomicRead
		| FileSystemProviderCapabilities.FileReadWrite;

	/** In-memory store for data associated via {@link associate}, keyed by URI string. */
	private readonly _associated = new Map<string, Uint8Array>();

	/** Tracks which associated URIs belong to which session, for cleanup on dispose. */
	private readonly _sessionAssociations = new Map<string, Set<string>>();

	constructor(
		@IChatService private readonly chatService: IChatService,
		@IFileService private readonly _fileService: IFileService
	) {
		super();
		this._register(this._fileService.registerProvider(ChatResponseResource.scheme, this));
		this._register(this.chatService.onDidDisposeSession(e => {
			for (const sessionResource of e.sessionResource) {
				const key = sessionResource.toString();
				const uris = this._sessionAssociations.get(key);
				if (uris) {
					for (const uri of uris) {
						this._associated.delete(uri);
					}
					this._sessionAssociations.delete(key);
				}
			}
		}));
	}

	associate(sessionResource: URI, data: Uint8Array, name?: string): URI {
		const id = generateUuid();
		const uri = URI.from({
			scheme: ChatResponseResource.scheme,
			path: `/assoc/${id}` + (name ? `/${name}` : ''),
		});
		const uriKey = uri.toString();
		this._associated.set(uriKey, data);

		const sessionKey = sessionResource.toString();
		let set = this._sessionAssociations.get(sessionKey);
		if (!set) {
			set = new Set();
			this._sessionAssociations.set(sessionKey, set);
		}
		set.add(uriKey);

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
		const associated = this._associated.get(uri.toString());
		if (associated) {
			return associated;
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
