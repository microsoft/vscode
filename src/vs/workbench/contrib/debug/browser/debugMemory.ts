/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { clamp } from '../../../../base/common/numbers.js';
import { assertNever } from '../../../../base/common/assert.js';
import { URI } from '../../../../base/common/uri.js';
import { FileChangeType, IFileOpenOptions, FilePermission, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, IFileChange, IFileSystemProvider, IStat, IWatchOptions, createFileSystemProviderError } from '../../../../platform/files/common/files.js';
import { DEBUG_MEMORY_SCHEME, IDebugService, IDebugSession, IMemoryInvalidationEvent, IMemoryRegion, MemoryRange, MemoryRangeType, State } from '../common/debug.js';

const rangeRe = /range=([0-9]+):([0-9]+)/;

export class DebugMemoryFileSystemProvider extends Disposable implements IFileSystemProvider {
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
		super();

		this._register(debugService.onDidEndSession(({ session }) => {
			for (const [fd, memory] of this.fdMemory) {
				if (memory.session === session) {
					this.close(fd);
				}
			}
		}));
	}

	public watch(resource: URI, opts: IWatchOptions) {
		if (opts.recursive) {
			return toDisposable(() => { });
		}

		const { session, memoryReference, offset } = this.parseUri(resource);
		const disposable = new DisposableStore();

		disposable.add(session.onDidChangeState(() => {
			if (session.state === State.Running || session.state === State.Inactive) {
				this.changeEmitter.fire([{ type: FileChangeType.DELETED, resource }]);
			}
		}));

		disposable.add(session.onDidInvalidateMemory(e => {
			if (e.body.memoryReference !== memoryReference) {
				return;
			}

			if (offset && (e.body.offset >= offset.toOffset || e.body.offset + e.body.count < offset.fromOffset)) {
				return;
			}

			this.changeEmitter.fire([{ resource, type: FileChangeType.UPDATED }]);
		}));

		return disposable;
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
		throw createFileSystemProviderError(`Not allowed`, FileSystemProviderErrorCode.NoPermissions);
	}

	/** @inheritdoc */
	public readdir(): never {
		throw createFileSystemProviderError(`Not allowed`, FileSystemProviderErrorCode.NoPermissions);
	}

	/** @inheritdoc */
	public delete(): never {
		throw createFileSystemProviderError(`Not allowed`, FileSystemProviderErrorCode.NoPermissions);
	}

	/** @inheritdoc */
	public rename(): never {
		throw createFileSystemProviderError(`Not allowed`, FileSystemProviderErrorCode.NoPermissions);
	}

	/** @inheritdoc */
	public open(resource: URI, _opts: IFileOpenOptions): Promise<number> {
		const { session, memoryReference, offset } = this.parseUri(resource);
		const fd = this.memoryFdCounter++;
		let region = session.getMemory(memoryReference);
		if (offset) {
			region = new MemoryRegionView(region, offset);
		}

		this.fdMemory.set(fd, { session, region });
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
			throw createFileSystemProviderError(`Range must be present to read a file`, FileSystemProviderErrorCode.FileNotFound);
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
			throw createFileSystemProviderError(`Range must be present to read a file`, FileSystemProviderErrorCode.FileNotFound);
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
			throw createFileSystemProviderError(`No file with that descriptor open`, FileSystemProviderErrorCode.Unavailable);
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
						throw createFileSystemProviderError(range.error, FileSystemProviderErrorCode.Unknown);
					}
				case MemoryRangeType.Valid: {
					const start = Math.max(0, pos - range.offset);
					const toWrite = range.data.slice(start, Math.min(range.data.byteLength, start + (length - readSoFar)));
					data.set(toWrite.buffer, offset + readSoFar);
					readSoFar += toWrite.byteLength;
					break;
				}
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
			throw createFileSystemProviderError(`No file with that descriptor open`, FileSystemProviderErrorCode.Unavailable);
		}

		return memory.region.write(pos, VSBuffer.wrap(data).slice(offset, offset + length));
	}

	protected parseUri(uri: URI) {
		if (uri.scheme !== DEBUG_MEMORY_SCHEME) {
			throw createFileSystemProviderError(`Cannot open file with scheme ${uri.scheme}`, FileSystemProviderErrorCode.FileNotFound);
		}

		const session = this.debugService.getModel().getSession(uri.authority);
		if (!session) {
			throw createFileSystemProviderError(`Debug session not found`, FileSystemProviderErrorCode.FileNotFound);
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
			readOnly: !session.capabilities.supportsWriteMemoryRequest,
			sessionId: uri.authority,
			memoryReference: decodeURIComponent(memoryReference),
		};
	}
}

/** A wrapper for a MemoryRegion that references a subset of data in another region. */
class MemoryRegionView extends Disposable implements IMemoryRegion {
	private readonly invalidateEmitter = new Emitter<IMemoryInvalidationEvent>();

	public readonly onDidInvalidate = this.invalidateEmitter.event;
	public readonly writable: boolean;
	private readonly width = this.range.toOffset - this.range.fromOffset;

	constructor(private readonly parent: IMemoryRegion, public readonly range: { fromOffset: number; toOffset: number }) {
		super();
		this.writable = parent.writable;

		this._register(parent);
		this._register(parent.onDidInvalidate(e => {
			const fromOffset = clamp(e.fromOffset - range.fromOffset, 0, this.width);
			const toOffset = clamp(e.toOffset - range.fromOffset, 0, this.width);
			if (toOffset > fromOffset) {
				this.invalidateEmitter.fire({ fromOffset, toOffset });
			}
		}));
	}

	public read(fromOffset: number, toOffset: number): Promise<MemoryRange[]> {
		if (fromOffset < 0) {
			throw new RangeError(`Invalid fromOffset: ${fromOffset}`);
		}

		return this.parent.read(
			this.range.fromOffset + fromOffset,
			this.range.fromOffset + Math.min(toOffset, this.width),
		);
	}

	public write(offset: number, data: VSBuffer): Promise<number> {
		return this.parent.write(this.range.fromOffset + offset, data);
	}
}
