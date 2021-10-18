/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from 'path';
import { isWindows } from 'vs/base/common/platform';
import { localize } from 'vs/nls';
import { FileSystemProviderCapabilities, FileDeleteOptions } from 'vs/platform/files/common/files';
import { DiskFileSystemProvider as NodeDiskFileSystemProvider, IDiskFileSystemProviderOptions as INodeDiskFileSystemProviderOptions } from 'vs/platform/files/node/diskFileSystemProvider';
import { ILogService } from 'vs/platform/log/common/log';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { ISharedProcessWorkerWorkbenchService } from 'vs/workbench/services/ipc/electron-sandbox/sharedProcessWorkerWorkbenchService';
import { IWatchRequest, IDiskFileChange, ILogMessage, WatcherService } from 'vs/platform/files/common/watcher';
import { ParcelFileWatcher } from 'vs/workbench/services/files/electron-sandbox/parcelWatcherService';

export interface IDiskFileSystemProviderOptions extends INodeDiskFileSystemProviderOptions {
	experimentalSandbox: boolean;
}

export class DiskFileSystemProvider extends NodeDiskFileSystemProvider {

	private readonly experimentalSandbox: boolean;

	constructor(
		logService: ILogService,
		private readonly nativeHostService: INativeHostService,
		private readonly sharedProcessWorkerWorkbenchService: ISharedProcessWorkerWorkbenchService,
		options?: IDiskFileSystemProviderOptions
	) {
		super(logService, options);

		this.experimentalSandbox = !!options?.experimentalSandbox;
	}

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

	override get capabilities(): FileSystemProviderCapabilities {
		if (!this._capabilities) {
			this._capabilities = super.capabilities | FileSystemProviderCapabilities.Trash;
		}

		return this._capabilities;
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
}
