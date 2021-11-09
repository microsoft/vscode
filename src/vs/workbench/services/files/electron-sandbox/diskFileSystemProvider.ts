/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { isLinux } from 'vs/base/common/platform';
import { FileSystemProviderCapabilities, FileDeleteOptions, IStat, FileType, FileReadStreamOptions, FileWriteOptions, FileOpenOptions, FileOverwriteOptions, IFileSystemProviderWithFileReadWriteCapability, IFileSystemProviderWithOpenReadWriteCloseCapability, IFileSystemProviderWithFileReadStreamCapability, IFileSystemProviderWithFileFolderCopyCapability, IWatchOptions } from 'vs/platform/files/common/files';
import { AbstractDiskFileSystemProvider } from 'vs/platform/files/common/diskFileSystemProvider';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ReadableStreamEvents } from 'vs/base/common/stream';
import { URI } from 'vs/base/common/uri';
import { IPCFileSystemProvider } from 'vs/platform/files/common/ipcFileSystemProvider';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IDiskFileChange, ILogMessage, WatcherService } from 'vs/platform/files/common/watcher';
import { ParcelFileWatcher } from 'vs/workbench/services/files/electron-sandbox/parcelWatcherService';
import { ILogService } from 'vs/platform/log/common/log';
import { ISharedProcessWorkerWorkbenchService } from 'vs/workbench/services/sharedProcess/electron-sandbox/sharedProcessWorkerWorkbenchService';

/**
 * A sandbox ready disk file system provider that delegates almost all calls
 * to the main process via `IPCFileSystemProvider` except for recursive file
 * watching that is done via shared process workers due to CPU intensity.
 */
export class DiskFileSystemProvider extends AbstractDiskFileSystemProvider implements
	IFileSystemProviderWithFileReadWriteCapability,
	IFileSystemProviderWithOpenReadWriteCloseCapability,
	IFileSystemProviderWithFileReadStreamCapability,
	IFileSystemProviderWithFileFolderCopyCapability {

	private readonly provider = this._register(new IPCFileSystemProvider(this.mainProcessService.getChannel('localFilesystem'), { pathCaseSensitive: isLinux, trash: true }));

	constructor(
		private readonly mainProcessService: IMainProcessService,
		private readonly sharedProcessWorkerWorkbenchService: ISharedProcessWorkerWorkbenchService,
		logService: ILogService
	) {
		super(logService);

		this.registerListeners();
	}

	private registerListeners(): void {

		// Forward events from the embedded provider
		this.provider.onDidChangeFile(e => this._onDidChangeFile.fire(e));
		this.provider.onDidErrorOccur(e => this._onDidErrorOccur.fire(e));
	}

	//#region File Capabilities

	get onDidChangeCapabilities(): Event<void> { return this.provider.onDidChangeCapabilities; }

	get capabilities(): FileSystemProviderCapabilities { return this.provider.capabilities; }

	//#endregion

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

	override watch(resource: URI, opts: IWatchOptions): IDisposable {

		// Recursive: via parcel file watcher from `createRecursiveWatcher`
		if (opts.recursive) {
			return super.watch(resource, opts);
		}

		// Non-recursive: via main process services
		return this.provider.watch(resource, opts);
	}

	protected createRecursiveWatcher(
		onChange: (changes: IDiskFileChange[]) => void,
		onLogMessage: (msg: ILogMessage) => void,
		verboseLogging: boolean
	): WatcherService {
		return new ParcelFileWatcher(
			changes => onChange(changes),
			msg => onLogMessage(msg),
			verboseLogging,
			this.sharedProcessWorkerWorkbenchService
		);
	}

	protected createNonRecursiveWatcher(): never {
		throw new Error('Method not implemented in sandbox.');
	}

	//#endregion
}
