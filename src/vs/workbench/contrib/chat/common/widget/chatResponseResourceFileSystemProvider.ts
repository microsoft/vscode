/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { canceled } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { createSingleCallFunction } from '../../../../../base/common/functional.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { newWriteableStream, ReadableStreamEvents } from '../../../../../base/common/stream.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { createFileSystemProviderError, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, IFileReadStreamOptions, IFileService, IFileSystemProvider, IFileSystemProviderWithFileAtomicReadCapability, IFileSystemProviderWithFileReadStreamCapability, IFileSystemProviderWithFileReadWriteCapability, IStat } from '../../../../../platform/files/common/files.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { localize } from '../../../../../nls.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import type { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { ROOT_STATE_URI } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { parseTerminalOutputDbUri } from '../../../../../platform/agentHost/common/sessionDbUri.js';
import { ContentEncoding, ResourceType } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { AhpErrorCodes } from '../../../../../platform/agentHost/common/state/protocol/errors.js';
import { ProtocolError } from '../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { migrateLegacyTerminalToolSpecificData } from '../chat.js';
import { ChatAgentLocation } from '../constants.js';
import { ChatResponseResource, IChatModel } from '../model/chatModel.js';
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
		@IFileService private readonly _fileService: IFileService,
		@IAgentHostConnectionsService private readonly _agentHostConnectionsService: IAgentHostConnectionsService,
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

	readFileStream(resource: URI, options: IFileReadStreamOptions = {}, token: CancellationToken = CancellationToken.None): ReadableStreamEvents<Uint8Array> {
		const stream = newWriteableStream<Uint8Array>(data => VSBuffer.concat(data.map(data => VSBuffer.wrap(data))).buffer);
		const disposables = new DisposableStore();
		const finish = createSingleCallFunction((value: Uint8Array | undefined, error: Error | undefined) => {
			disposables.dispose();
			if (error) {
				stream.error(error);
			}
			stream.end(value);
		});
		if (token.isCancellationRequested) {
			finish(undefined, canceled());
			return stream;
		}
		disposables.add(token.onCancellationRequested(() => finish(undefined, canceled())));
		Promise.resolve().then(() => {
			if (token.isCancellationRequested) {
				throw canceled();
			}
			return this.lookupURI(resource);
		}).then(value => {
			if (token.isCancellationRequested) {
				finish(undefined, canceled());
				return;
			}
			const start = Math.max(0, options.position ?? 0);
			const end = typeof options.length === 'number' ? start + Math.max(0, options.length) : value.byteLength;
			finish(value.subarray(start, end), undefined);
		}, error => finish(undefined, error instanceof Error ? error : new Error(String(error))));
		return stream;
	}

	async stat(resource: URI): Promise<IStat> {
		const terminalOutput = await this.resolveTerminalOutput(resource);
		if (terminalOutput) {
			try {
				const result = await terminalOutput.connection.resourceResolve({ channel: ROOT_STATE_URI, uri: terminalOutput.outputResource.toString() });
				const resolvedUri = typeof result.uri === 'string' ? URI.parse(result.uri) : URI.revive(result.uri);
				if (result.type !== ResourceType.File
					|| !resolvedUri
					|| !isEqual(resolvedUri, terminalOutput.outputResource)
					|| typeof result.size !== 'number'
					|| !Number.isFinite(result.size)
					|| result.size < 0) {
					throw createFileSystemProviderError(localize('chat.terminalFullOutputUnavailable', "Full terminal output is not available."), FileSystemProviderErrorCode.FileNotFound);
				}
				return {
					type: FileType.File,
					ctime: result.ctime ? Date.parse(result.ctime) : 0,
					mtime: result.mtime ? Date.parse(result.mtime) : 0,
					size: result.size,
				};
			} catch (error) {
				throw this.mapTerminalResourceError(error);
			}
		}
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

	private findMatchingInvocationInSession(session: IChatModel, toolCallId: string): IChatToolInvocation | IChatToolInvocationSerialized {
		const requests = session.getRequests();
		for (let k = requests.length - 1; k >= 0; k--) {
			const req = requests[k];
			const tc = req.response?.entireResponse.value.find((r): r is IChatToolInvocation | IChatToolInvocationSerialized => (r.kind === 'toolInvocation' || r.kind === 'toolInvocationSerialized') && r.toolCallId === toolCallId);
			if (tc) {
				return tc;
			}
		}

		throw createFileSystemProviderError(`File not found`, FileSystemProviderErrorCode.FileNotFound);
	}

	/** Restored output editors can resolve before their chat is opened, so load the chat on demand. */
	private async findTerminalOutputInvocation(sessionResource: URI, toolCallId: string): Promise<IChatToolInvocation | IChatToolInvocationSerialized> {
		const existing = this.chatService.getSession(sessionResource);
		if (existing) {
			return this.findMatchingInvocationInSession(existing, toolCallId);
		}

		const modelRef = await this.chatService.acquireOrLoadSession(
			sessionResource,
			ChatAgentLocation.Chat,
			CancellationToken.None,
			'ChatResponseResourceFileSystemProvider#findTerminalOutputInvocation',
		);
		if (!modelRef) {
			throw createFileSystemProviderError(`File not found`, FileSystemProviderErrorCode.FileNotFound);
		}
		try {
			return this.findMatchingInvocationInSession(modelRef.object, toolCallId);
		} finally {
			modelRef.dispose();
		}
	}

	private async lookupTerminalOutput(uri: URI): Promise<Uint8Array | undefined> {
		const resolved = await this.resolveTerminalOutput(uri);
		if (!resolved) {
			return undefined;
		}
		try {
			const result = await resolved.connection.resourceRead(resolved.outputResource, ContentEncoding.Utf8);
			return result.encoding === ContentEncoding.Base64
				? decodeBase64(result.data).buffer
				: VSBuffer.fromString(result.data).buffer;
		} catch (error) {
			throw this.mapTerminalResourceError(error);
		}
	}

	private async resolveTerminalOutput(uri: URI): Promise<{ readonly connection: IAgentConnection; readonly outputResource: URI } | undefined> {
		const parsed = ChatResponseResource.parseTerminalOutputUri(uri);
		if (!parsed) {
			return undefined;
		}
		const result = await this.findTerminalOutputInvocation(parsed.sessionResource, parsed.toolCallId);
		const data = result.toolSpecificData;
		const terminalData = data?.kind === 'terminal' ? migrateLegacyTerminalToolSpecificData(data) : undefined;
		const terminal = URI.revive(terminalData?.terminalCommandUri);
		const outputResource = URI.revive(terminalData?.terminalCommandOutput?.fullOutputResource);
		const name = uri.path.split('/').at(-1);
		if (terminalData?.isPty !== false
			|| terminalData.terminalCommandOutput?.truncated !== true
			|| !IChatToolInvocation.isComplete(result)
			|| !terminal
			|| !outputResource
			|| parseTerminalOutputDbUri(outputResource)?.toolCallId !== parsed.toolCallId
			|| !isEqual(terminal, parsed.terminal)
			|| !isEqual(uri, ChatResponseResource.createTerminalOutputUri(parsed.sessionResource, parsed.toolCallId, terminal, name))) {
			throw createFileSystemProviderError(localize('chat.terminalFullOutputUnavailable', "Full terminal output is not available."), FileSystemProviderErrorCode.FileNotFound);
		}
		const resolved = this._agentHostConnectionsService.resolveSessionResource(parsed.sessionResource);
		if (!resolved) {
			throw createFileSystemProviderError(localize('chat.terminalFullOutputUnavailable', "Full terminal output is not available."), FileSystemProviderErrorCode.FileNotFound);
		}
		return { connection: resolved.connection, outputResource };
	}

	private mapTerminalResourceError(error: unknown): unknown {
		if (error instanceof ProtocolError && error.code === AhpErrorCodes.PermissionDenied) {
			return createFileSystemProviderError(error.message, FileSystemProviderErrorCode.NoPermissions);
		}
		if (error instanceof ProtocolError && error.code === AhpErrorCodes.NotFound) {
			return createFileSystemProviderError(error.message, FileSystemProviderErrorCode.FileNotFound);
		}
		return error;
	}

	private async lookupURI(uri: URI): Promise<Uint8Array> {
		const associated = this._associated.get(uri);
		if (associated) {
			if (associated.data instanceof Uint8Array) {
				return associated.data;
			}
			const decoded = decodeBase64(associated.data.base64).buffer;
			associated.data = decoded;
			return decoded;
		}

		const terminalOutput = await this.lookupTerminalOutput(uri);
		if (terminalOutput) {
			return terminalOutput;
		}

		const parsed = ChatResponseResource.parseUri(uri);
		if (!parsed) {
			throw createFileSystemProviderError(`File not found`, FileSystemProviderErrorCode.FileNotFound);
		}
		const { sessionResource, toolCallId, index } = parsed;
		const session = this.chatService.getSession(sessionResource);
		if (!session) {
			throw createFileSystemProviderError(`File not found`, FileSystemProviderErrorCode.FileNotFound);
		}
		const result = this.findMatchingInvocationInSession(session, toolCallId);
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
