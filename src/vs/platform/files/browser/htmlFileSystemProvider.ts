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
import { FileDeleteOptions, FileOverwriteOptions, FileSystemProviderCapabilities, FileType, FileWriteOptions, IFileSystemProviderWithFileReadWriteCapability, IStat, IWatchOptions } from 'vs/platform/files/common/files';

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
		const handleId = this.getHandleId(resource);

		if (handleId) {
			const fileHandle = this.files.get(handleId);

			if (fileHandle) {
				const file = await fileHandle.getFile();

				return {
					type: FileType.File,
					mtime: file.lastModified,
					ctime: 0,
					size: file.size
				};
			}

			const directoryHandle = this.directories.get(handleId);

			if (directoryHandle) {
				return {
					type: FileType.Directory,
					mtime: 0,
					ctime: 0,
					size: 0
				};
			}
		}

		const parent = await this.getParentDirectoryHandle(resource);

		if (!parent) {
			throw new Error('Stat error: no parent found');
		}

		const name = extUri.basename(resource);
		for await (const [childName, child] of parent) {
			if (childName === name) {
				if (child.kind === 'file') {
					const file = await child.getFile();

					return {
						type: FileType.File,
						mtime: file.lastModified,
						ctime: 0,
						size: file.size
					};
				} else {
					return {
						type: FileType.Directory,
						mtime: 0,
						ctime: 0,
						size: 0
					};
				}
			}
		}

		throw new Error('Stat error: entry not found');
	}

	async readdir(resource: URI): Promise<[string, FileType][]> {
		const parent = await this.getDirectoryHandle(resource);

		if (!parent) {
			throw new Error('Stat error: no parent found');
		}

		const result: [string, FileType][] = [];

		for await (const [name, child] of parent) {
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

		return URI.from({ scheme: Schemas.file, path: `/${handleId}/${handle.name}` });
	}

	registerDirectoryHandle(handle: FileSystemDirectoryHandle): URI {
		const handleId = generateUuid();
		this.directories.set(handleId, handle);

		return URI.from({ scheme: Schemas.file, path: `/${handleId}/${handle.name}` });
	}

	private async getFileHandle(uri: URI): Promise<FileSystemFileHandle | undefined> {
		const handleId = this.getHandleId(uri);
		if (handleId) {
			return this.files.get(handleId);
		}

		const parent = await this.getParentDirectoryHandle(uri);
		const name = extUri.basename(uri);
		return await parent?.getFileHandle(name);
	}

	private async getParentDirectoryHandle(uri: URI): Promise<FileSystemDirectoryHandle | undefined> {
		return this.getDirectoryHandle(URI.from({ ...uri, path: extUri.dirname(uri).path }));
	}

	private async getDirectoryHandle(uri: URI): Promise<FileSystemDirectoryHandle | undefined> {
		const handleId = this.getHandleId(uri);
		if (handleId) {
			return this.directories.get(handleId);
		}

		const parentPath = this.getParent(uri.path);
		if (!parentPath) {
			return undefined;
		}

		const parent = await this.getDirectoryHandle(URI.from({ ...uri, path: parentPath }));
		return await parent?.getDirectoryHandle(extUri.basename(uri));
	}

	private getParent(path: string): string | undefined {
		const match = /^(.*)\/([^/]+)$/.exec(path);
		if (!match) {
			return undefined;
		}

		const [, parentPath] = match;
		return parentPath;
	}

	private getHandleId(uri: URI): string | undefined {
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
