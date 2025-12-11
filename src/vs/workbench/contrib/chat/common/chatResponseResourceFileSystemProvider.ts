/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { newWriteableStream, ReadableStreamEvents } from '../../../../base/common/stream.js';
import { URI } from '../../../../base/common/uri.js';
import { createFileSystemProviderError, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, IFileService, IFileSystemProviderWithFileAtomicReadCapability, IFileSystemProviderWithFileReadStreamCapability, IFileSystemProviderWithFileReadWriteCapability, IStat } from '../../../../platform/files/common/files.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ChatResponseResource } from './chatModel.js';
import { IChatService, IChatToolInvocation, IChatToolInvocationSerialized } from './chatService.js';
import { isToolResultInputOutputDetails } from './languageModelToolsService.js';

export class ChatResponseResourceFileSystemProvider extends Disposable implements
	IWorkbenchContribution,
	IFileSystemProviderWithFileReadWriteCapability,
	IFileSystemProviderWithFileAtomicReadCapability,
	IFileSystemProviderWithFileReadStreamCapability {

	public static readonly ID = 'workbench.contrib.chatResponseResourceFileSystemProvider';

	public readonly onDidChangeCapabilities = Event.None;
	public readonly onDidChangeFile = Event.None;

	public readonly capabilities: FileSystemProviderCapabilities = FileSystemProviderCapabilities.None
		| FileSystemProviderCapabilities.Readonly
		| FileSystemProviderCapabilities.PathCaseSensitive
		| FileSystemProviderCapabilities.FileReadStream
		| FileSystemProviderCapabilities.FileAtomicRead
		| FileSystemProviderCapabilities.FileReadWrite;

	constructor(
		@IChatService private readonly chatService: IChatService,
		@IFileService private readonly _fileService: IFileService
	) {
		super();
		this._register(this._fileService.registerProvider(ChatResponseResource.scheme, this));
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
