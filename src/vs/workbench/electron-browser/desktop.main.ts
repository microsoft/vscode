/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INativeWorkbenchConfiguration } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { ILogService } from 'vs/platform/log/common/log';
import { Schemas } from 'vs/base/common/network';
import { IFileService } from 'vs/platform/files/common/files';
import { DiskFileSystemProvider as ElectronFileSystemProvider } from 'vs/workbench/services/files/electron-browser/diskFileSystemProvider';
import { DiskFileSystemProvider as SandboxedDiskFileSystemProvider } from 'vs/workbench/services/files/electron-sandbox/diskFileSystemProvider';
import { FileUserDataProvider } from 'vs/workbench/services/userData/common/fileUserDataProvider';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { SharedDesktopMain } from 'vs/workbench/electron-sandbox/shared.desktop.main';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { ISharedProcessWorkerWorkbenchService } from 'vs/workbench/services/sharedProcess/electron-sandbox/sharedProcessWorkerWorkbenchService';

class DesktopMain extends SharedDesktopMain {

	protected registerFileSystemProviders(
		mainProcessService: IMainProcessService,
		sharedProcessWorkerWorkbenchService: ISharedProcessWorkerWorkbenchService,
		fileService: IFileService,
		logService: ILogService,
		nativeHostService: INativeHostService
	): void {

		// Local Files
		let diskFileSystemProvider: ElectronFileSystemProvider | SandboxedDiskFileSystemProvider;
		if (this.configuration.experimentalSandboxedFileService !== false) {
			diskFileSystemProvider = this._register(new SandboxedDiskFileSystemProvider(mainProcessService, sharedProcessWorkerWorkbenchService, logService));
		} else {
			logService.info('[FileService]: NOT using sandbox ready file system provider');
			diskFileSystemProvider = this._register(new ElectronFileSystemProvider(logService, nativeHostService, { legacyWatcher: this.configuration.legacyWatcher }));
		}
		fileService.registerProvider(Schemas.file, diskFileSystemProvider);

		// User Data Provider
		fileService.registerProvider(Schemas.userData, this._register(new FileUserDataProvider(Schemas.file, diskFileSystemProvider, Schemas.userData, logService)));
	}
}

export function main(configuration: INativeWorkbenchConfiguration): Promise<void> {
	const workbench = new DesktopMain(configuration);

	return workbench.open();
}
