/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from 'vs/base/common/path';
import { isWindows } from 'vs/base/common/platform';
import { localize } from 'vs/nls';
import { FileSystemProviderCapabilities, FileDeleteOptions, IStat, FileType, FileReadStreamOptions, FileWriteOptions, FileOpenOptions, FileOverwriteOptions } from 'vs/platform/files/common/files';
import { DiskFileSystemProvider as NodeDiskFileSystemProvider, IDiskFileSystemProviderOptions as INodeDiskFileSystemProviderOptions } from 'vs/platform/files/node/diskFileSystemProvider';
import { ILogService } from 'vs/platform/log/common/log';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { ISharedProcessWorkerWorkbenchService } from 'vs/workbench/services/sharedProcess/electron-sandbox/sharedProcessWorkerWorkbenchService';
import { IWatchRequest, IDiskFileChange, ILogMessage, WatcherService } from 'vs/platform/files/common/watcher';
import { ParcelFileWatcher } from 'vs/workbench/services/files/electron-sandbox/parcelWatcherService';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ReadableStreamEvents } from 'vs/base/common/stream';
import { URI } from 'vs/base/common/uri';
import { IPCFileSystemProvider } from 'vs/platform/files/common/ipcFileSystemProvider';

export interface IDiskFileSystemProviderOptions extends INodeDiskFileSystemProviderOptions {
	experimentalSandbox: boolean;
}

class MainProcessDiskFileSystemProvider extends IPCFileSystemProvider {

	constructor(mainProcessService: IMainProcessService) {
		super(mainProcessService.getChannel('localFiles'));
	}
}

export class DiskFileSystemProvider extends NodeDiskFileSystemProvider {

	private readonly experimentalSandbox: boolean;

	private _sandboxedFs: MainProcessDiskFileSystemProvider | undefined = undefined;
	get sandboxedFs(): MainProcessDiskFileSystemProvider {
		if (!this._sandboxedFs) {
			this._sandboxedFs = new MainProcessDiskFileSystemProvider(this.mainProcessService);
		}

		return this._sandboxedFs;
	}

	constructor(
		logService: ILogService,
		private readonly nativeHostService: INativeHostService,
		private readonly mainProcessService: IMainProcessService,
		private readonly sharedProcessWorkerWorkbenchService: ISharedProcessWorkerWorkbenchService,
		options?: IDiskFileSystemProviderOptions
	) {
		super(logService, options);

		this.experimentalSandbox = !!options?.experimentalSandbox;
	}

	//#region File Capabilities

	override get capabilities(): FileSystemProviderCapabilities {
		if (!this._capabilities) {
			this._capabilities = super.capabilities | FileSystemProviderCapabilities.Trash;
		}

		return this._capabilities;
	}

	//#endregion

	//#region File Metadata Resolving

	override stat(resource: URI): Promise<IStat> {
		if (this.experimentalSandbox) {
			return this.sandboxedFs.stat(resource);
		}

		return super.stat(resource);
	}

	override readdir(resource: URI): Promise<[string, FileType][]> {
		if (this.experimentalSandbox) {
			return this.sandboxedFs.readdir(resource);
		}

		return super.readdir(resource);
	}

	//#endregion

	//#region File Reading/Writing

	override readFile(resource: URI): Promise<Uint8Array> {
		if (this.experimentalSandbox) {
			return this.sandboxedFs.readFile(resource);
		}

		return super.readFile(resource);
	}

	override readFileStream(resource: URI, opts: FileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array> {
		if (this.experimentalSandbox) {
			return this.sandboxedFs.readFileStream(resource, opts, token);
		}

		return super.readFileStream(resource, opts, token);
	}

	override writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
		if (this.experimentalSandbox) {
			return this.sandboxedFs.writeFile(resource, content, opts);
		}

		return super.writeFile(resource, content, opts);
	}

	override open(resource: URI, opts: FileOpenOptions): Promise<number> {
		if (this.experimentalSandbox) {
			return this.sandboxedFs.open(resource, opts);
		}

		return super.open(resource, opts);
	}

	override close(fd: number): Promise<void> {
		if (this.experimentalSandbox) {
			return this.sandboxedFs.close(fd);
		}

		return super.close(fd);
	}

	override read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
		if (this.experimentalSandbox) {
			return this.sandboxedFs.read(fd, pos, data, offset, length);
		}

		return super.read(fd, pos, data, offset, length);
	}

	override write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
		if (this.experimentalSandbox) {
			return this.sandboxedFs.write(fd, pos, data, offset, length);
		}

		return super.write(fd, pos, data, offset, length);
	}

	//#endregion

	//#region Move/Copy/Delete/Create Folder

	override mkdir(resource: URI): Promise<void> {
		if (this.experimentalSandbox) {
			return this.sandboxedFs.mkdir(resource);
		}

		return super.mkdir(resource);
	}

	override delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
		if (this.experimentalSandbox) {
			return this.sandboxedFs.delete(resource, opts);
		}

		return super.delete(resource, opts);
	}

	protected override async doDelete(filePath: string, opts: FileDeleteOptions): Promise<void> {
		if (!opts.useTrash) {
			return super.doDelete(filePath, opts);
		}

		try {
			await this.nativeHostService.moveItemToTrash(filePath);
		} catch (error) {
			this.logService.error(error);

			throw new Error(isWindows ? localize('binFailed', "Failed to move '{0}' to the recycle bin", basename(filePath)) : localize('trashFailed', "Failed to move '{0}' to the trash", basename(filePath)));
		}
	}

	override rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
		if (this.experimentalSandbox) {
			return this.sandboxedFs.rename(from, to, opts);
		}

		return super.rename(from, to, opts);
	}

	override copy(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
		if (this.experimentalSandbox) {
			return this.sandboxedFs.copy(from, to, opts);
		}

		return super.copy(from, to, opts);
	}

	//#endregion

	//#region File Watching

	protected override createRecursiveWatcher(
		folders: IWatchRequest[],
		onChange: (changes: IDiskFileChange[]) => void,
		onLogMessage: (msg: ILogMessage) => void,
		verboseLogging: boolean
	): WatcherService {
		if (!this.experimentalSandbox) {
			return super.createRecursiveWatcher(folders, onChange, onLogMessage, verboseLogging);
		}

		return new ParcelFileWatcher(
			folders,
			changes => onChange(changes),
			msg => onLogMessage(msg),
			verboseLogging,
			this.sharedProcessWorkerWorkbenchService
		);
	}

	//#endregion
}
