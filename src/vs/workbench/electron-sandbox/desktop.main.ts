/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INativeWorkbenchConfiguration } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { ILogService } from 'vs/platform/log/common/log';
import { Schemas } from 'vs/base/common/network';
import { IFileService } from 'vs/platform/files/common/files';
import { FileUserDataProvider } from 'vs/workbench/services/userData/common/fileUserDataProvider';
import { SharedDesktopMain } from 'vs/workbench/electron-sandbox/shared.desktop.main';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { ISharedProcessWorkerWorkbenchService } from 'vs/workbench/services/sharedProcess/electron-sandbox/sharedProcessWorkerWorkbenchService';
import { DiskFileSystemProvider } from 'vs/workbench/services/files/electron-sandbox/diskFileSystemProvider';
import { IExtensionService, NullExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

class DesktopMain extends SharedDesktopMain {

	protected registerFileSystemProviders(
		mainProcessService: IMainProcessService,
		sharedProcessWorkerWorkbenchService: ISharedProcessWorkerWorkbenchService,
		fileService: IFileService,
		logService: ILogService,
		nativeHostService: INativeHostService
	): void {

		// Local Files
		const diskFileSystemProvider = this._register(new DiskFileSystemProvider(mainProcessService, sharedProcessWorkerWorkbenchService, logService));
		fileService.registerProvider(Schemas.file, diskFileSystemProvider);

		// User Data Provider
		fileService.registerProvider(Schemas.userData, this._register(new FileUserDataProvider(Schemas.file, diskFileSystemProvider, Schemas.userData, logService)));
	}
}

export function main(configuration: INativeWorkbenchConfiguration): Promise<void> {
	const workbench = new DesktopMain(configuration);

	return workbench.open();
}

// TODO@bpasero sandbox: remove me when extension host is present

class SimpleExtensionService extends NullExtensionService { }

registerSingleton(IExtensionService, SimpleExtensionService);
