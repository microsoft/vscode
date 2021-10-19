/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { isLinux } from 'vs/base/common/platform';
import { FileSystemProviderCapabilities, FileDeleteOptions, IStat, FileType, FileReadStreamOptions, FileWriteOptions, FileOpenOptions, FileOverwriteOptions, IFileSystemProviderWithFileReadWriteCapability, IFileSystemProviderWithOpenReadWriteCloseCapability, IFileSystemProviderWithFileReadStreamCapability, IFileSystemProviderWithFileFolderCopyCapability, IWatchOptions } from 'vs/platform/files/common/files';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ReadableStreamEvents } from 'vs/base/common/stream';
import { URI } from 'vs/base/common/uri';
import { IPCFileSystemProvider } from 'vs/platform/files/common/ipcFileSystemProvider';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';

class MainProcessDiskFileSystemProvider extends IPCFileSystemProvider {

	constructor(mainProcessService: IMainProcessService) {
		super(mainProcessService.getChannel('localFiles'));
	}
}

export class DiskFileSystemProvider implements
	IFileSystemProviderWithFileReadWriteCapability,
	IFileSystemProviderWithOpenReadWriteCloseCapability,
	IFileSystemProviderWithFileReadStreamCapability,
	IFileSystemProviderWithFileFolderCopyCapability {

	//#region File Capabilities

	readonly onDidChangeCapabilities: Event<void> = Event.None;

	protected _capabilities: FileSystemProviderCapabilities | undefined;
	get capabilities(): FileSystemProviderCapabilities {
		if (!this._capabilities) {
			this._capabilities =
				FileSystemProviderCapabilities.FileReadWrite |
				FileSystemProviderCapabilities.FileOpenReadWriteClose |
				FileSystemProviderCapabilities.FileReadStream |
				FileSystemProviderCapabilities.FileFolderCopy |
				FileSystemProviderCapabilities.FileWriteUnlock;

			if (isLinux) {
				this._capabilities |= FileSystemProviderCapabilities.PathCaseSensitive;
			}
		}

		return this._capabilities;
	}

	//#endregion

	private readonly provider = new MainProcessDiskFileSystemProvider(this.mainProcessService);

	constructor(
		private readonly mainProcessService: IMainProcessService
	) {
	}

	//#region File Metadata Resolving

	stat(resource: URI): Promise<IStat> {
		return this.provider.stat(resource);
	}

	readdir(resource: URI): Promise<[string, FileType][]> {
		return this.provider.readdir(resource);
	}

	//#endregion

	//#region File Reading/Writing

	readFile(resource: URI): Promise<Uint8Array> {
		return this.provider.readFile(resource);
	}

	readFileStream(resource: URI, opts: FileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array> {
		return this.provider.readFileStream(resource, opts, token);
	}

	writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
		return this.provider.writeFile(resource, content, opts);
	}

	open(resource: URI, opts: FileOpenOptions): Promise<number> {
		return this.provider.open(resource, opts);
	}

	close(fd: number): Promise<void> {
		return this.provider.close(fd);
	}

	read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
		return this.provider.read(fd, pos, data, offset, length);
	}

	write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
		return this.provider.write(fd, pos, data, offset, length);
	}

	//#endregion

	//#region Move/Copy/Delete/Create Folder

	mkdir(resource: URI): Promise<void> {
		return this.provider.mkdir(resource);
	}

	delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
		return this.provider.delete(resource, opts);
	}

	rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
		return this.provider.rename(from, to, opts);
	}

	copy(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
		return this.provider.copy(from, to, opts);
	}

	//#endregion

	//#region File Watching

	onDidErrorOccur = Event.None;
	onDidChangeFile = Event.None;
	watch(resource: URI, opts: IWatchOptions): IDisposable {
		return Disposable.None;
	}

	//#endregion
}
