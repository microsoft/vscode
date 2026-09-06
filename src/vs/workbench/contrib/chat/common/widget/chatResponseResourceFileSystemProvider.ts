/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { createSingleCallFunction } from '../../../../../base/common/functional.js';
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

/**
 * Data associated with a URI, readable until it is disposed. Disposing releases
 * only this association; data shared with other associations of the same URI is
 * kept until the last of them is disposed.
 */
export interface IChatResourceAssociation extends IDisposable {
	readonly resource: URI;
}

export interface IChatResourceAssociateOptions {
	/** Also releases the data when this chat session is disposed. */
	readonly sessionResource?: URI;

	/**
	 * Stable identity: associating the same id again yields the same URI, and its
	 * data is only released once every association for that id has been disposed.
	 */
	readonly id?: string;

	/** Appended to the URI so the resource carries a readable name. */
	readonly name?: string;
}

/** Data behind an associated URI, shared by every association that resolves to it. */
interface IAssociatedEntry {
	data: Uint8Array | { base64: string };

	/** Number of associations not yet disposed; the data is released at zero. */
	refCount: number;

	/** Sessions whose disposal releases the data, whatever the reference count is. */
	readonly sessionResources: ResourceSet;
}

export interface IChatResponseResourceFileSystemProvider extends IFileSystemProvider {
	readonly _serviceBrand: undefined;

	/**
	 * Associates arbitrary data with a URI in this filesystem, so it can be read
	 * through the file service and opened in an editor. The data is held until every
	 * association for its URI is disposed, or — for a session-scoped association —
	 * until that session is disposed, whichever comes first.
	 */
	associate(data: Uint8Array | { base64: string }, options?: IChatResourceAssociateOptions): IChatResourceAssociation;
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
	private readonly _associated = new ResourceMap<IAssociatedEntry>();

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
				if (!uris) {
					continue;
				}
				// Releasing mutates the session's set, so iterate over a snapshot of it.
				for (const uri of [...uris]) {
					const entry = this._associated.get(uri);
					if (entry) {
						this._forget(uri, entry);
					}
				}
				this._sessionAssociations.delete(sessionResource);
			}
		}));
	}

	associate(data: Uint8Array | { base64: string }, options?: IChatResourceAssociateOptions): IChatResourceAssociation {
		const uri = URI.from({
			scheme: ChatResponseResource.scheme,
			path: `/assoc/${options?.id ?? generateUuid()}` + (options?.name ? `/${options.name}` : ''),
		});

		// A stable id can be associated more than once, e.g. when the same artifact is
		// opened twice, so those associations share one entry that the last of them
		// releases. Without that, one consumer would invalidate the data of another.
		let entry = this._associated.get(uri);
		if (entry) {
			entry.data = data;
			entry.refCount++;
		} else {
			entry = { data, refCount: 1, sessionResources: new ResourceSet() };
			this._associated.set(uri, entry);
		}

		if (options?.sessionResource) {
			entry.sessionResources.add(options.sessionResource);
			let set = this._sessionAssociations.get(options.sessionResource);
			if (!set) {
				set = new ResourceSet();
				this._sessionAssociations.set(options.sessionResource, set);
			}
			set.add(uri);
		}

		return {
			resource: uri,
			// Guarded so a repeated dispose cannot release a reference it does not own.
			dispose: createSingleCallFunction(() => this._release(uri)),
		};
	}

	/** Drops one reference to the data at `uri`, releasing it once none are left. */
	private _release(uri: URI): void {
		const entry = this._associated.get(uri);
		if (!entry || --entry.refCount > 0) {
			return;
		}

		this._forget(uri, entry);
	}

	/** Releases the data at `uri` along with every session's claim on it. */
	private _forget(uri: URI, entry: IAssociatedEntry): void {
		this._associated.delete(uri);
		for (const sessionResource of entry.sessionResources) {
			const uris = this._sessionAssociations.get(sessionResource);
			if (uris?.delete(uri) && uris.size === 0) {
				this._sessionAssociations.delete(sessionResource);
			}
		}
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
			if (associated.data instanceof Uint8Array) {
				return associated.data;
			}
			const decoded = decodeBase64(associated.data.base64).buffer;
			associated.data = decoded;
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
