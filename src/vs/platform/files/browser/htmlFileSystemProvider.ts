/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { isLinux } from 'vs/base/common/platform';
import { basename, extUri, isEqual } from 'vs/base/common/resources';
import { newWriteableStream, ReadableStreamEvents } from 'vs/base/common/stream';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { createFileSystemProviderError, FileDeleteOptions, FileOverwriteOptions, FileReadStreamOptions, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, FileWriteOptions, IFileSystemProviderWithFileReadStreamCapability, IFileSystemProviderWithFileReadWriteCapability, IStat, IWatchOptions } from 'vs/platform/files/common/files';

export class HTMLFileSystemProvider implements IFileSystemProviderWithFileReadWriteCapability, IFileSystemProviderWithFileReadStreamCapability {

	//#region Events (unsupported)

	readonly onDidChangeCapabilities = Event.None;
	readonly onDidChangeFile = Event.None;
	readonly onDidErrorOccur = Event.None;

	//#endregion

	//#region File Capabilities

	private _capabilities: FileSystemProviderCapabilities | undefined;
	get capabilities(): FileSystemProviderCapabilities {
		if (!this._capabilities) {
			this._capabilities =
				FileSystemProviderCapabilities.FileReadWrite |
				FileSystemProviderCapabilities.FileReadStream;

			if (isLinux) {
				this._capabilities |= FileSystemProviderCapabilities.PathCaseSensitive;
			}
		}

		return this._capabilities;
	}

	//#endregion

	//#region File Metadata Resolving

	async stat(resource: URI): Promise<IStat> {
		let handle: FileSystemHandle | undefined = undefined;

		// First: try to find a well known handle first
		const handleId = this.findHandleId(resource);
		if (handleId) {
			handle = this.files.get(handleId) ?? this.directories.get(handleId);
		}

		// Second: walk up parent directories and resolve handle if possible
		if (!handle) {
			const parent = await this.getParentDirectoryHandle(resource);
			if (parent) {
				const name = extUri.basename(resource);

				try {
					handle = await parent.getFileHandle(name);
				} catch (error) {
					try {
						handle = await parent.getDirectoryHandle(name);
					} catch (error) {
						// Ignore
					}
				}
			}
		}

		if (!handle) {
			throw createFileSystemProviderError(new Error(`No such file or directory, stat '${resource.toString(true)}'`), FileSystemProviderErrorCode.FileNotFound);
		}

		return this.toStat(handle);
	}

	private async toStat(handle: FileSystemHandle): Promise<IStat> {
		if (handle.kind === 'file') {
			const file = await handle.getFile();

			return {
				type: FileType.File,
				mtime: file.lastModified,
				ctime: 0,
				size: file.size
			};
		}

		return {
			type: FileType.Directory,
			mtime: 0,
			ctime: 0,
			size: 0
		};
	}

	async readdir(resource: URI): Promise<[string, FileType][]> {
		const handle = await this.getDirectoryHandle(resource);
		if (!handle) {
			throw createFileSystemProviderError(new Error(`No such file or directory, readdir '${resource.toString(true)}'`), FileSystemProviderErrorCode.FileNotFound);
		}

		const result: [string, FileType][] = [];

		for await (const [name, child] of handle) {
			result.push([name, child.kind === 'file' ? FileType.File : FileType.Directory]);
		}

		return result;
	}

	//#endregion

	//#region File Reading/Writing

	readFileStream(resource: URI, opts: FileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array> {
		const stream = newWriteableStream<Uint8Array>(data => VSBuffer.concat(data.map(data => VSBuffer.wrap(data))).buffer, {
			// Set a highWaterMark to prevent the stream
			// for file upload to produce large buffers
			// in-memory
			highWaterMark: 10
		});

		(async () => {
			try {
				const handle = await this.getFileHandle(resource);
				if (!handle) {
					throw createFileSystemProviderError(new Error(`No such file or directory, readFile '${resource.toString(true)}'`), FileSystemProviderErrorCode.FileNotFound);
				}

				const file = await handle.getFile();

				// Partial file: implemented simply via `readFile`
				if (typeof opts.length === 'number' || typeof opts.position === 'number') {
					let buffer = new Uint8Array(await file.arrayBuffer());

					if (typeof opts?.position === 'number') {
						buffer = buffer.slice(opts.position);
					}

					if (typeof opts?.length === 'number') {
						buffer = buffer.slice(0, opts.length);
					}

					stream.end(buffer);
				}

				// Entire file
				else {
					const reader: ReadableStreamDefaultReader<Uint8Array> = file.stream().getReader();

					let res = await reader.read();
					while (!res.done) {
						if (token.isCancellationRequested) {
							break;
						}

						// Write buffer into stream but make sure to wait
						// in case the `highWaterMark` is reached
						await stream.write(res.value);

						if (token.isCancellationRequested) {
							break;
						}

						res = await reader.read();
					}
					stream.end(undefined);
				}
			} catch (error) {
				stream.error(error);
				stream.end();
			}
		})();

		return stream;
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		const handle = await this.getFileHandle(resource);
		if (!handle) {
			throw createFileSystemProviderError(new Error(`No such file or directory, readFile '${resource.toString(true)}'`), FileSystemProviderErrorCode.FileNotFound);
		}

		const file = await handle.getFile();

		return new Uint8Array(await file.arrayBuffer());
	}

	async writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
		let handle = await this.getFileHandle(resource);

		// Validate target unless { create: true, overwrite: true }
		if (!opts.create || !opts.overwrite) {
			if (handle) {
				if (!opts.overwrite) {
					throw createFileSystemProviderError(new Error(`File already exists, writeFile '${resource.toString(true)}'`), FileSystemProviderErrorCode.FileExists);
				}
			} else {
				if (!opts.create) {
					throw createFileSystemProviderError(new Error(`No such file, writeFile '${resource.toString(true)}'`), FileSystemProviderErrorCode.FileNotFound);
				}
			}
		}

		// Create target as needed
		if (!handle) {
			const parent = await this.getParentDirectoryHandle(resource);
			if (!parent) {
				throw createFileSystemProviderError(new Error(`No such parent directory, writeFile '${resource.toString(true)}'`), FileSystemProviderErrorCode.FileNotFound);
			}

			handle = await parent.getFileHandle(basename(resource), { create: true });

			if (!handle) {
				throw createFileSystemProviderError(new Error(`Unable to create file , writeFile '${resource.toString(true)}'`), FileSystemProviderErrorCode.Unknown);
			}
		}

		// Write to target overwriting any existing contents
		const writable = await handle.createWritable();
		await writable.write(content);
		await writable.close();
	}

	//#endregion

	//#region Move/Copy/Delete/Create Folder

	async mkdir(resource: URI): Promise<void> {
		const parent = await this.getParentDirectoryHandle(resource);
		if (!parent) {
			throw createFileSystemProviderError(new Error(`No such parent directory, mkdir '${resource.toString(true)}'`), FileSystemProviderErrorCode.FileNotFound);
		}

		await parent.getDirectoryHandle(basename(resource), { create: true });
	}

	async delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
		const parent = await this.getParentDirectoryHandle(resource);
		if (!parent) {
			throw createFileSystemProviderError(new Error(`No such parent directory, delete '${resource.toString(true)}'`), FileSystemProviderErrorCode.FileNotFound);
		}

		return parent.removeEntry(basename(resource), { recursive: opts.recursive });
	}

	async rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
		if (isEqual(from, to)) {
			return; // no-op if the paths are the same
		}

		// Implement file rename by write + delete
		let fileHandle = await this.getFileHandle(from);
		if (fileHandle) {
			const file = await fileHandle.getFile();
			const contents = new Uint8Array(await file.arrayBuffer());

			await this.writeFile(to, contents, { create: true, overwrite: opts.overwrite, unlock: false });
			await this.delete(from, { recursive: false, useTrash: false });
		}

		// File API does not support any real rename otherwise
		else {
			throw createFileSystemProviderError(new Error(`Rename is unsupported for folders`), FileSystemProviderErrorCode.Unavailable);
		}
	}

	//#endregion

	//#region File Watching (unsupported)

	watch(resource: URI, opts: IWatchOptions): IDisposable {
		return Disposable.None;
	}

	//#endregion

	//#region File/Directoy Handle Registry

	private readonly files = new Map<string, FileSystemFileHandle>();
	private readonly directories = new Map<string, FileSystemDirectoryHandle>();

	registerFileHandle(handle: FileSystemFileHandle): URI {
		const handleId = generateUuid();
		this.files.set(handleId, handle);

		return this.toHandleUri(handle, handleId);
	}

	registerDirectoryHandle(handle: FileSystemDirectoryHandle): URI {
		const handleId = generateUuid();
		this.directories.set(handleId, handle);

		return this.toHandleUri(handle, handleId);
	}

	private toHandleUri(handle: FileSystemHandle, handleId: string): URI {
		return URI.from({ scheme: Schemas.file, path: `/${handleId}/${handle.name}` });
	}

	private async getFileHandle(uri: URI): Promise<FileSystemFileHandle | undefined> {
		const handleId = this.findHandleId(uri);
		if (handleId) {
			return this.files.get(handleId);
		}

		const parent = await this.getParentDirectoryHandle(uri);

		try {
			return await parent?.getFileHandle(extUri.basename(uri));
		} catch (error) {
			return undefined; // guard against possible DOMException
		}
	}

	private async getParentDirectoryHandle(uri: URI): Promise<FileSystemDirectoryHandle | undefined> {
		return this.getDirectoryHandle(URI.from({ ...uri, path: extUri.dirname(uri).path }));
	}

	private async getDirectoryHandle(uri: URI): Promise<FileSystemDirectoryHandle | undefined> {
		const handleId = this.findHandleId(uri);
		if (handleId) {
			return this.directories.get(handleId);
		}

		const parentPath = this.findParent(uri.path);
		if (!parentPath) {
			return undefined;
		}

		const parent = await this.getDirectoryHandle(URI.from({ ...uri, path: parentPath }));

		try {
			return await parent?.getDirectoryHandle(extUri.basename(uri));
		} catch (error) {
			return undefined; // guard against possible DOMException
		}
	}

	private findParent(path: string): string | undefined {
		// TODO@bpasero TODO@joaomoreno what is the purpose of this?
		const match = /^(.*)\/([^/]+)$/.exec(path);
		if (!match) {
			return undefined;
		}

		const [, parentPath] = match;
		return parentPath;
	}

	private findHandleId(uri: URI): string | undefined {
		// Given a path such as `/32b0b72b-ec76-4676-a621-0f8f4fe9a11f/ticino-playground`
		// will match on the first path segment value (`32b0b72b-ec76-4676-a621-0f8f4fe9a11f)
		// but only if the path component has exactly 2 segments (`/<uuid>/name`)
		const match = /^\/([^/]+)\/[^/]+\/?$/.exec(uri.path);
		if (!match) {
			return undefined;
		}

		return match[1];
	}

	//#endregion
}
