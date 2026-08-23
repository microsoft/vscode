/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Event } from '../../../../base/common/event.js';
import { isLinux } from '../../../../base/common/platform.js';
import { FileSystemProviderCapabilities, IFileDeleteOptions, IStat, FileType, IFileReadStreamOptions, IFileWriteOptions, IFileOpenOptions, IFileOverwriteOptions, IFileSystemProviderWithFileReadWriteCapability, IFileSystemProviderWithOpenReadWriteCloseCapability, IFileSystemProviderWithFileReadStreamCapability, IFileSystemProviderWithFileFolderCopyCapability, IFileSystemProviderWithFileAtomicReadCapability, IFileAtomicReadOptions, IFileSystemProviderWithFileCloneCapability, IFileChange } from '../../../../platform/files/common/files.js';
import { AbstractDiskFileSystemProvider } from '../../../../platform/files/common/diskFileSystemProvider.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ReadableStreamEvents } from '../../../../base/common/stream.js';
import { URI } from '../../../../base/common/uri.js';
import { DiskFileSystemProviderClient, LOCAL_FILE_SYSTEM_CHANNEL_NAME } from '../../../../platform/files/common/diskFileSystemProviderClient.js';
import { ILogMessage, AbstractUniversalWatcherClient } from '../../../../platform/files/common/watcher.js';
import { UniversalWatcherClient } from './watcherClient.js';
import { ILoggerService, ILogService } from '../../../../platform/log/common/log.js';
import { IUtilityProcessWorkerWorkbenchService } from '../../utilityProcess/electron-browser/utilityProcessWorkerWorkbenchService.js';
import { LogService } from '../../../../platform/log/common/logService.js';

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

	private readonly provider: DiskFileSystemProviderClient;

	constructor(
		mainProcessService: IMainProcessService,
		private readonly utilityProcessWorkerWorkbenchService: IUtilityProcessWorkerWorkbenchService,
		logService: ILogService,
		private readonly loggerService: ILoggerService
	) {
		super(logService, { watcher: { forceUniversal: true /* send all requests to universal watcher process */ } });

		this.provider = this._register(new DiskFileSystemProviderClient(mainProcessService.getChannel(LOCAL_FILE_SYSTEM_CHANNEL_NAME), { pathCaseSensitive: isLinux, trash: true }));

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

	realpath(resource: URI): Promise<string> {
		return this.provider.realpath(resource);
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

	private _watcherLogService: ILogService | undefined = undefined;
	private get watcherLogService(): ILogService {
		if (!this._watcherLogService) {
			this._watcherLogService = new LogService(this.loggerService.createLogger('fileWatcher', { name: localize('fileWatcher', "File Watcher") }));
		}

		return this._watcherLogService;
	}

	protected override logWatcherMessage(msg: ILogMessage): void {
		this.watcherLogService[msg.type](msg.message);

		if (msg.type !== 'trace' && msg.type !== 'debug') {
			super.logWatcherMessage(msg); // allow non-verbose log messages in window log
		}
	}

	//#endregion
}
