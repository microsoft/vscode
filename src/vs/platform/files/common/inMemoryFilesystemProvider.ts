/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
import * as resources from '../../../base/common/resources.js';
import { ReadableStreamEvents, newWriteableStream } from '../../../base/common/stream.js';
import { URI } from '../../../base/common/uri.js';
import { FileChangeType, IFileDeleteOptions, IFileOverwriteOptions, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, IFileWriteOptions, IFileChange, IFileSystemProviderWithFileReadWriteCapability, IStat, IWatchOptions, createFileSystemProviderError, IFileSystemProviderWithOpenReadWriteCloseCapability, IFileOpenOptions, IFileSystemProviderWithFileAtomicDeleteCapability, IFileSystemProviderWithFileAtomicReadCapability, IFileSystemProviderWithFileAtomicWriteCapability, IFileSystemProviderWithFileReadStreamCapability } from './files.js';

class File implements IStat {

	readonly type: FileType.File;
	readonly ctime: number;
	mtime: number;
	size: number;

	name: string;
	data?: Uint8Array;

	constructor(name: string) {
		this.type = FileType.File;
		this.ctime = Date.now();
		this.mtime = Date.now();
		this.size = 0;
		this.name = name;
	}
}

class Directory implements IStat {

	readonly type: FileType.Directory;
	readonly ctime: number;
	mtime: number;
	size: number;

	name: string;
	readonly entries: Map<string, File | Directory>;

	constructor(name: string) {
		this.type = FileType.Directory;
		this.ctime = Date.now();
		this.mtime = Date.now();
		this.size = 0;
		this.name = name;
		this.entries = new Map();
	}
}

type Entry = File | Directory;

export class InMemoryFileSystemProvider extends Disposable implements
	IFileSystemProviderWithFileReadWriteCapability,
	IFileSystemProviderWithOpenReadWriteCloseCapability,
	IFileSystemProviderWithFileReadStreamCapability,
	IFileSystemProviderWithFileAtomicReadCapability,
	IFileSystemProviderWithFileAtomicWriteCapability,
	IFileSystemProviderWithFileAtomicDeleteCapability {

	private memoryFdCounter = 0;
	private readonly fdMemory = new Map<number, Uint8Array>();
	private _onDidChangeCapabilities = this._register(new Emitter<void>());
	readonly onDidChangeCapabilities = this._onDidChangeCapabilities.event;

	private _capabilities = FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.PathCaseSensitive;
	get capabilities(): FileSystemProviderCapabilities { return this._capabilities; }

	setReadOnly(readonly: boolean) {
		const isReadonly = !!(this._capabilities & FileSystemProviderCapabilities.Readonly);
		if (readonly !== isReadonly) {
			this._capabilities = readonly ? FileSystemProviderCapabilities.Readonly | FileSystemProviderCapabilities.PathCaseSensitive | FileSystemProviderCapabilities.FileReadWrite
				: FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.PathCaseSensitive;
			this._onDidChangeCapabilities.fire();
		}
	}

	root = new Directory('');

	// --- manage file metadata

	async stat(resource: URI): Promise<IStat> {
		return this._lookup(resource, false);
	}

	async readdir(resource: URI): Promise<[string, FileType][]> {
		const entry = this._lookupAsDirectory(resource, false);
		const result: [string, FileType][] = [];
		entry.entries.forEach((child, name) => result.push([name, child.type]));
		return result;
	}

	// --- manage file contents

	async readFile(resource: URI): Promise<Uint8Array> {
		const data = this._lookupAsFile(resource, false).data;
		if (data) {
			return data;
		}
		throw createFileSystemProviderError('file not found', FileSystemProviderErrorCode.FileNotFound);
	}

	readFileStream(resource: URI): ReadableStreamEvents<Uint8Array> {
		const data = this._lookupAsFile(resource, false).data;

		const stream = newWriteableStream<Uint8Array>(data => VSBuffer.concat(data.map(data => VSBuffer.wrap(data))).buffer);
		stream.end(data);

		return stream;
	}

	async writeFile(resource: URI, content: Uint8Array, opts: IFileWriteOptions): Promise<void> {
		const basename = resources.basename(resource);
		const parent = this._lookupParentDirectory(resource);
		let entry = parent.entries.get(basename);
		if (entry instanceof Directory) {
			throw createFileSystemProviderError('file is directory', FileSystemProviderErrorCode.FileIsADirectory);
		}
		if (!entry && !opts.create) {
			throw createFileSystemProviderError('file not found', FileSystemProviderErrorCode.FileNotFound);
		}
		if (entry && opts.create && !opts.overwrite) {
			throw createFileSystemProviderError('file exists already', FileSystemProviderErrorCode.FileExists);
		}
		if (!entry) {
			entry = new File(basename);
			parent.entries.set(basename, entry);
			this._fireSoon({ type: FileChangeType.ADDED, resource });
		}
		entry.mtime = Date.now();
		entry.size = content.byteLength;
		entry.data = content;

		this._fireSoon({ type: FileChangeType.UPDATED, resource });
	}

	// file open/read/write/close
	open(resource: URI, opts: IFileOpenOptions): Promise<number> {
		const data = this._lookupAsFile(resource, false).data;
		if (data) {
			const fd = this.memoryFdCounter++;
			this.fdMemory.set(fd, data);
			return Promise.resolve(fd);
		}
		throw createFileSystemProviderError('file not found', FileSystemProviderErrorCode.FileNotFound);
	}

	close(fd: number): Promise<void> {
		this.fdMemory.delete(fd);
		return Promise.resolve();
	}

	read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
		const memory = this.fdMemory.get(fd);
		if (!memory) {
			throw createFileSystemProviderError(`No file with that descriptor open`, FileSystemProviderErrorCode.Unavailable);
		}

		const toWrite = VSBuffer.wrap(memory).slice(pos, pos + length);
		data.set(toWrite.buffer, offset);
		return Promise.resolve(toWrite.byteLength);
	}

	write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
		const memory = this.fdMemory.get(fd);
		if (!memory) {
			throw createFileSystemProviderError(`No file with that descriptor open`, FileSystemProviderErrorCode.Unavailable);
		}

		const toWrite = VSBuffer.wrap(data).slice(offset, offset + length);
		memory.set(toWrite.buffer, pos);
		return Promise.resolve(toWrite.byteLength);
	}

	// --- manage files/folders

	async rename(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void> {
		if (!opts.overwrite && this._lookup(to, true)) {
			throw createFileSystemProviderError('file exists already', FileSystemProviderErrorCode.FileExists);
		}

		const entry = this._lookup(from, false);
		const oldParent = this._lookupParentDirectory(from);

		const newParent = this._lookupParentDirectory(to);
		const newName = resources.basename(to);

		oldParent.entries.delete(entry.name);
		entry.name = newName;
		newParent.entries.set(newName, entry);

		this._fireSoon(
			{ type: FileChangeType.DELETED, resource: from },
			{ type: FileChangeType.ADDED, resource: to }
		);
	}

	async delete(resource: URI, opts: IFileDeleteOptions): Promise<void> {
		const dirname = resources.dirname(resource);
		const basename = resources.basename(resource);
		const parent = this._lookupAsDirectory(dirname, false);
		if (parent.entries.has(basename)) {
			parent.entries.delete(basename);
			parent.mtime = Date.now();
			parent.size -= 1;
			this._fireSoon({ type: FileChangeType.UPDATED, resource: dirname }, { resource, type: FileChangeType.DELETED });
		}
	}

	async mkdir(resource: URI): Promise<void> {
		if (this._lookup(resource, true)) {
			throw createFileSystemProviderError('file exists already', FileSystemProviderErrorCode.FileExists);
		}

		const basename = resources.basename(resource);
		const dirname = resources.dirname(resource);
		const parent = this._lookupAsDirectory(dirname, false);

		const entry = new Directory(basename);
		parent.entries.set(entry.name, entry);
		parent.mtime = Date.now();
		parent.size += 1;
		this._fireSoon({ type: FileChangeType.UPDATED, resource: dirname }, { type: FileChangeType.ADDED, resource });
	}

	// --- lookup

	private _lookup(uri: URI, silent: false): Entry;
	private _lookup(uri: URI, silent: boolean): Entry | undefined;
	private _lookup(uri: URI, silent: boolean): Entry | undefined {
		const parts = uri.path.split('/');
		let entry: Entry = this.root;
		for (const part of parts) {
			if (!part) {
				continue;
			}
			let child: Entry | undefined;
			if (entry instanceof Directory) {
				child = entry.entries.get(part);
			}
			if (!child) {
				if (!silent) {
					throw createFileSystemProviderError('file not found', FileSystemProviderErrorCode.FileNotFound);
				} else {
					return undefined;
				}
			}
			entry = child;
		}
		return entry;
	}

	private _lookupAsDirectory(uri: URI, silent: boolean): Directory {
		const entry = this._lookup(uri, silent);
		if (entry instanceof Directory) {
			return entry;
		}
		throw createFileSystemProviderError('file not a directory', FileSystemProviderErrorCode.FileNotADirectory);
	}

	private _lookupAsFile(uri: URI, silent: boolean): File {
		const entry = this._lookup(uri, silent);
		if (entry instanceof File) {
			return entry;
		}
		throw createFileSystemProviderError('file is a directory', FileSystemProviderErrorCode.FileIsADirectory);
	}

	private _lookupParentDirectory(uri: URI): Directory {
		const dirname = resources.dirname(uri);
		return this._lookupAsDirectory(dirname, false);
	}

	// --- manage file events

	private readonly _onDidChangeFile = this._register(new Emitter<readonly IFileChange[]>());
	readonly onDidChangeFile: Event<readonly IFileChange[]> = this._onDidChangeFile.event;

	private _bufferedChanges: IFileChange[] = [];
	private _fireSoonHandle?: Timeout;

	watch(resource: URI, opts: IWatchOptions): IDisposable {
		// ignore, fires for all changes...
		return Disposable.None;
	}

	private _fireSoon(...changes: IFileChange[]): void {
		this._bufferedChanges.push(...changes);

		if (this._fireSoonHandle) {
			clearTimeout(this._fireSoonHandle);
		}

		this._fireSoonHandle = setTimeout(() => {
			this._onDidChangeFile.fire(this._bufferedChanges);
			this._bufferedChanges.length = 0;
		}, 5);
	}

	override dispose(): void {
		super.dispose();

		this.fdMemory.clear();
	}
}
