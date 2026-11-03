/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { combinedDisposable, Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { createFileSystemProviderError, FileChangeType, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, IFileChange, IFileService, IFileSystemProviderWithFileReadWriteCapability, IStat, IWatchOptions } from '../../../../platform/files/common/files.js';

/**
 * A readonly file system provider that serves a resource as it is currently stored on disk,
 * e.g. to compare it with a working copy of the same resource that has unsaved changes.
 */
export class FileOnDiskFileSystemProvider extends Disposable implements IFileSystemProviderWithFileReadWriteCapability {

	static readonly SCHEME = 'vscode-file-on-disk';

	static toFileOnDisk(resource: URI): URI {
		return resource.with({ scheme: FileOnDiskFileSystemProvider.SCHEME, query: resource.toString() });
	}

	static fromFileOnDisk(resource: URI): URI {
		return URI.parse(resource.query);
	}

	readonly capabilities = FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.Readonly;

	readonly onDidChangeCapabilities = Event.None;

	private readonly _onDidChangeFile = this._register(new Emitter<readonly IFileChange[]>());
	readonly onDidChangeFile = this._onDidChangeFile.event;

	constructor(private readonly fileService: IFileService) {
		super();
	}

	async stat(resource: URI): Promise<IStat> {
		const stat = await this.fileService.stat(FileOnDiskFileSystemProvider.fromFileOnDisk(resource));

		return { type: stat.isDirectory ? FileType.Directory : FileType.File, ctime: stat.ctime, mtime: stat.mtime, size: stat.size };
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		const content = await this.fileService.readFile(FileOnDiskFileSystemProvider.fromFileOnDisk(resource));

		return content.value.buffer;
	}

	watch(resource: URI, opts: IWatchOptions): IDisposable {
		const fileOnDisk = FileOnDiskFileSystemProvider.fromFileOnDisk(resource);

		// Forward changes of the file on disk as changes of this resource
		const watcher = this.fileService.createWatcher(fileOnDisk, { recursive: false, excludes: [] });
		const listener = watcher.onDidChange(e => {
			const changes: IFileChange[] = [];
			for (const type of [FileChangeType.ADDED, FileChangeType.UPDATED, FileChangeType.DELETED]) {
				if (e.contains(fileOnDisk, type)) {
					changes.push({ type, resource, cId: opts.correlationId });
				}
			}

			if (changes.length > 0) {
				this._onDidChangeFile.fire(changes);
			}
		});

		return combinedDisposable(listener, watcher);
	}

	async writeFile(): Promise<void> {
		throw this.readonlyError();
	}

	async mkdir(): Promise<void> {
		throw this.readonlyError();
	}

	async readdir(): Promise<[string, FileType][]> {
		return [];
	}

	async delete(): Promise<void> {
		throw this.readonlyError();
	}

	async rename(): Promise<void> {
		throw this.readonlyError();
	}

	private readonlyError(): Error {
		return createFileSystemProviderError('The file on disk is shown readonly', FileSystemProviderErrorCode.NoPermissions);
	}
}
