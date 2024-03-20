/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { isLinux } from 'vs/base/common/platform';
import { FileSystemProviderCapabilities, IFileDeleteOptions, IStat, FileType, IFileReadStreamOptions, IFileWriteOptions, IFileOpenOptions, IFileOverwriteOptions, IFileSystemProviderWithFileReadWriteCapability, IFileSystemProviderWithOpenReadWriteCloseCapability, IFileSystemProviderWithFileReadStreamCapability, IFileSystemProviderWithFileFolderCopyCapability, IFileSystemProviderWithFileAtomicReadCapability, IFileAtomicReadOptions, IFileSystemProviderWithFileCloneCapability, IFileChange } from 'vs/platform/files/common/files';
import { AbstractDiskFileSystemProvider } from 'vs/platform/files/common/diskFileSystemProvider';
import { IMainProcessService } from 'vs/platform/ipc/common/mainProcessService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ReadableStreamEvents } from 'vs/base/common/stream';
import { URI } from 'vs/base/common/uri';
import { DiskFileSystemProviderClient, LOCAL_FILE_SYSTEM_CHANNEL_NAME } from 'vs/platform/files/common/diskFileSystemProviderClient';
import { ILogMessage, AbstractUniversalWatcherClient } from 'vs/platform/files/common/watcher';
import { UniversalWatcherClient } from 'vs/workbench/services/files/electron-sandbox/watcherClient';
import { ILogService } from 'vs/platform/log/common/log';
import { IUtilityProcessWorkerWorkbenchService } from 'vs/workbench/services/utilityProcess/electron-sandbox/utilityProcessWorkerWorkbenchService';

/**
 * A sandbox ready disk file system provider that delegates almost all calls
 * to the main process via `DiskFileSystemProviderServer` except for recursive
 * file watching that is done via shared process workers due to CPU intensity.
 */
export class DiskFileSystemProvider extends AbstractDiskFileSystemProvider implements
	IFileSystemProviderWithFileReadWriteCapability,
	IFileSystemProviderWithOpenReadWriteCloseCapability,
	IFileSystemProviderWithFileReadStreamCapability,
	IFileSystemProviderWithFileFolderCopyCapability,
	IFileSystemProviderWithFileAtomicReadCapability,
	IFileSystemProviderWithFileCloneCapability {

	private readonly provider = this._register(new DiskFileSystemProviderClient(this.mainProcessService.getChannel(LOCAL_FILE_SYSTEM_CHANNEL_NAME), { pathCaseSensitive: isLinux, trash: true }));

	constructor(
		private readonly mainProcessService: IMainProcessService,
		private readonly utilityProcessWorkerWorkbenchService: IUtilityProcessWorkerWorkbenchService,
		logService: ILogService
	) {
		super(logService, { watcher: { forceUniversal: true /* send all requests to universal watcher process */ } });

		this.registerListeners();
	}

	private registerListeners(): void {

		// Forward events from the embedded provider
		this._register(this.provider.onDidChangeFile(changes => this._onDidChangeFile.fire(changes)));
		this._register(this.provider.onDidWatchError(error => this._onDidWatchError.fire(error)));
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

	readFile(resource: URI, opts?: IFileAtomicReadOptions): Promise<Uint8Array> {
		return this.provider.readFile(resource, opts);
	}

	readFileStream(resource: URI, opts: IFileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array> {
		return this.provider.readFileStream(resource, opts, token);
	}

	writeFile(resource: URI, content: Uint8Array, opts: IFileWriteOptions): Promise<void> {
		return this.provider.writeFile(resource, content, opts);
	}

	open(resource: URI, opts: IFileOpenOptions): Promise<number> {
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

	delete(resource: URI, opts: IFileDeleteOptions): Promise<void> {
		return this.provider.delete(resource, opts);
	}

	rename(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void> {
		return this.provider.rename(from, to, opts);
	}

	copy(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void> {
		return this.provider.copy(from, to, opts);
	}

	//#endregion

	//#region Clone File

	cloneFile(from: URI, to: URI): Promise<void> {
		return this.provider.cloneFile(from, to);
	}

	//#endregion

	//#region File Watching

	protected createUniversalWatcher(
		onChange: (changes: IFileChange[]) => void,
		onLogMessage: (msg: ILogMessage) => void,
		verboseLogging: boolean
	): AbstractUniversalWatcherClient {
		return new UniversalWatcherClient(changes => onChange(changes), msg => onLogMessage(msg), verboseLogging, this.utilityProcessWorkerWorkbenchService);
	}

	protected createNonRecursiveWatcher(): never {
		throw new Error('Method not implemented in sandbox.'); // we never expect this to be called given we set `forceUniversal: true`
	}

	//#endregion
}
