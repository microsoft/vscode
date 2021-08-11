/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { isLinux } from 'vs/base/common/platform';
import { basename, extUri } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { createFileSystemProviderError, FileDeleteOptions, FileOverwriteOptions, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, FileWriteOptions, IFileSystemProviderWithFileReadWriteCapability, IStat, IWatchOptions } from 'vs/platform/files/common/files';

export class HTMLFileSystemProvider implements IFileSystemProviderWithFileReadWriteCapability {

	//#region Events (unsupported)

	readonly onDidChangeCapabilities = Event.None;
	readonly onDidChangeFile = Event.None;
	readonly onDidErrorOccur = Event.None;

	//#endregion

	//#region File Capabilities

	private _capabilities: FileSystemProviderCapabilities | undefined;
	get capabilities(): FileSystemProviderCapabilities {
		if (!this._capabilities) {
			this._capabilities = FileSystemProviderCapabilities.FileReadWrite;

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

	async readFile(resource: URI): Promise<Uint8Array> {
		const handle = await this.getFileHandle(resource);

		if (!handle) {
			throw new Error('File not found.');
		}

		const file = await handle.getFile();
		return new Uint8Array(await file.arrayBuffer());
	}

	async writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
		let handle = await this.getFileHandle(resource);

		if (!handle && opts.create) {
			const parent = await this.getParentDirectoryHandle(resource);

			if (!parent) {
				throw new Error('Stat error: no parent found');
			}

			handle = await parent.getFileHandle(basename(resource), { create: true });
		}

		if (!handle) {
			throw new Error('File not found.');
		}

		const writable = await handle.createWritable();
		await writable.write(content);
		await writable.close();
	}

	//#endregion

	//#region Move/Copy/Delete/Create Folder

	async mkdir(resource: URI): Promise<void> {
		const parent = await this.getParentDirectoryHandle(resource);

		if (!parent) {
			throw new Error('Stat error: no parent found');
		}

		await parent.getDirectoryHandle(basename(resource), { create: true });
	}

	async delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
		const parent = await this.getParentDirectoryHandle(resource);

		if (!parent) {
			throw new Error('Stat error: no parent found');
		}

		return parent.removeEntry(basename(resource), { recursive: opts.recursive });
	}

	rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
		throw new Error('Method not implemented: rename');
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
