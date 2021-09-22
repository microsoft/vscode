/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { Emitter, Event } from 'vs/base/common/event';
import { toDisposable } from 'vs/base/common/lifecycle';
import { assertNever } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { FileChangeType, FileOpenOptions, FilePermission, FileSystemProviderCapabilities, FileSystemProviderError, FileSystemProviderErrorCode, FileType, IFileChange, IFileSystemProvider, IStat, IWatchOptions } from 'vs/platform/files/common/files';
import { DEBUG_MEMORY_SCHEME, IDebugService, IDebugSession, IMemoryRegion, MemoryRangeType } from 'vs/workbench/contrib/debug/common/debug';

const rangeRe = /range=([0-9]+):([0-9]+)/;

export class DebugMemoryFileSystemProvider implements IFileSystemProvider {
	private memoryFdCounter = 0;
	private readonly fdMemory = new Map<number, { session: IDebugSession; region: IMemoryRegion }>();
	private readonly changeEmitter = new Emitter<readonly IFileChange[]>();

	/** @inheritdoc */
	public readonly onDidChangeCapabilities = Event.None;

	/** @inheritdoc */
	public readonly onDidChangeFile = this.changeEmitter.event;

	/** @inheritdoc */
	public readonly capabilities = 0
		| FileSystemProviderCapabilities.PathCaseSensitive
		| FileSystemProviderCapabilities.FileOpenReadWriteClose;

	constructor(private readonly debugService: IDebugService) {
		debugService.onDidEndSession(session => {
			for (const [fd, memory] of this.fdMemory) {
				if (memory.session === session) {
					this.close(fd);
				}
			}
		});
	}

	public watch(resource: URI, opts: IWatchOptions) {
		if (opts.recursive) {
			return toDisposable(() => { });
		}

		const { session, memoryReference } = this.parseUri(resource);
		return session.onDidInvalidateMemory(e => {
			if (e.body.memoryReference === memoryReference) {
				this.changeEmitter.fire([{ resource, type: FileChangeType.UPDATED }]);
			}
		});
	}

	/** @inheritdoc */
	public stat(file: URI): Promise<IStat> {
		const { readOnly } = this.parseUri(file);
		return Promise.resolve({
			type: FileType.File,
			mtime: 0,
			ctime: 0,
			size: 0,
			permissions: readOnly ? FilePermission.Readonly : undefined,
		});
	}

	/** @inheritdoc */
	public mkdir(): never {
		throw new FileSystemProviderError(`Not allowed`, FileSystemProviderErrorCode.NoPermissions);
	}

	/** @inheritdoc */
	public readdir(): never {
		throw new FileSystemProviderError(`Not allowed`, FileSystemProviderErrorCode.NoPermissions);
	}

	/** @inheritdoc */
	public delete(): never {
		throw new FileSystemProviderError(`Not allowed`, FileSystemProviderErrorCode.NoPermissions);
	}

	/** @inheritdoc */
	public rename(): never {
		throw new FileSystemProviderError(`Not allowed`, FileSystemProviderErrorCode.NoPermissions);
	}

	/** @inheritdoc */
	public open(resource: URI, _opts: FileOpenOptions): Promise<number> {
		const { session, memoryReference } = this.parseUri(resource);
		const fd = this.memoryFdCounter++;
		this.fdMemory.set(fd, { session, region: session.getMemory(memoryReference) });
		return Promise.resolve(fd);
	}

	/** @inheritdoc */
	public close(fd: number) {
		this.fdMemory.get(fd)?.region.dispose();
		this.fdMemory.delete(fd);
		return Promise.resolve();
	}

	/** @inheritdoc */
	public async writeFile(resource: URI, content: Uint8Array) {
		const { offset } = this.parseUri(resource);
		if (!offset) {
			throw new FileSystemProviderError(`Range must be present to read a file`, FileSystemProviderErrorCode.FileNotFound);
		}

		const fd = await this.open(resource, { create: false });

		try {
			await this.write(fd, offset.fromOffset, content, 0, content.length);
		} finally {
			this.close(fd);
		}
	}

	/** @inheritdoc */
	public async readFile(resource: URI) {
		const { offset } = this.parseUri(resource);
		if (!offset) {
			throw new FileSystemProviderError(`Range must be present to read a file`, FileSystemProviderErrorCode.FileNotFound);
		}

		const data = new Uint8Array(offset.toOffset - offset.fromOffset);
		const fd = await this.open(resource, { create: false });

		try {
			await this.read(fd, offset.fromOffset, data, 0, data.length);
			return data;
		} finally {
			this.close(fd);
		}
	}

	/** @inheritdoc */
	public async read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
		const memory = this.fdMemory.get(fd);
		if (!memory) {
			throw new FileSystemProviderError(`No file with that descriptor open`, FileSystemProviderErrorCode.Unavailable);
		}

		const ranges = await memory.region.read(pos, length);
		let readSoFar = 0;
		for (const range of ranges) {
			switch (range.type) {
				case MemoryRangeType.Unreadable:
					return readSoFar;
				case MemoryRangeType.Error:
					if (readSoFar > 0) {
						return readSoFar;
					} else {
						throw new FileSystemProviderError(range.error, FileSystemProviderErrorCode.Unknown);
					}
				case MemoryRangeType.Valid:
					const start = Math.max(0, pos - range.offset);
					const toWrite = range.data.slice(start, Math.min(range.data.byteLength, start + (length - readSoFar)));
					data.set(toWrite.buffer, offset + readSoFar);
					readSoFar += toWrite.byteLength;
					break;
				default:
					assertNever(range);
			}
		}

		return readSoFar;
	}

	/** @inheritdoc */
	public write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
		const memory = this.fdMemory.get(fd);
		if (!memory) {
			throw new FileSystemProviderError(`No file with that descriptor open`, FileSystemProviderErrorCode.Unavailable);
		}

		return memory.region.write(pos, VSBuffer.wrap(data).slice(offset, offset + length));
	}

	protected parseUri(uri: URI) {
		if (uri.scheme !== DEBUG_MEMORY_SCHEME) {
			throw new FileSystemProviderError(`Cannot open file with scheme ${uri.scheme}`, FileSystemProviderErrorCode.FileNotFound);
		}

		const session = this.debugService.getModel().getSession(uri.authority);
		if (!session) {
			throw new FileSystemProviderError(`Debug session not found`, FileSystemProviderErrorCode.FileNotFound);
		}

		let offset: { fromOffset: number; toOffset: number } | undefined;
		const rangeMatch = rangeRe.exec(uri.query);
		if (rangeMatch) {
			offset = { fromOffset: Number(rangeMatch[1]), toOffset: Number(rangeMatch[2]) };
		}

		const [, memoryReference] = uri.path.split('/');

		return {
			session,
			offset,
			readOnly: !!session.capabilities.supportsWriteMemoryRequest,
			sessionId: uri.authority,
			memoryReference,
		};
	}
}
