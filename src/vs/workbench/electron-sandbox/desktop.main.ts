/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INativeWorkbenchConfiguration, NativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { ILogService } from 'vs/platform/log/common/log';
import { Schemas } from 'vs/base/common/network';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { IFileService } from 'vs/platform/files/common/files';
import { FileUserDataProvider } from 'vs/workbench/services/userData/common/fileUserDataProvider';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { simpleHomeDir, simpleFileSystemProvider, SimpleLogService, simpleWorkspace, simpleTmpDir, simpleUserDataDir } from 'vs/workbench/electron-sandbox/sandbox.simpleservices';
import { LoggerChannelClient } from 'vs/platform/log/common/logIpc';
import { productService, SharedDesktopMain } from 'vs/workbench/electron-sandbox/shared.desktop.main';

class DesktopMain extends SharedDesktopMain {

	constructor(configuration: INativeWorkbenchConfiguration) {
		super({ ...configuration, workspace: simpleWorkspace }, new NativeWorkbenchEnvironmentService(configuration, productService, { homeDir: simpleHomeDir.fsPath, tmpDir: simpleTmpDir.fsPath, userDataDir: simpleUserDataDir.fsPath }));
	}

	protected createLogService(loggerService: LoggerChannelClient, mainProcessService: IMainProcessService): ILogService {
		return new SimpleLogService(); // we can only use the real logger, once `IEnvironmentService#logFile` has a proper file:// based value (https://github.com/microsoft/vscode/issues/116829)
	}

	protected registerFileSystemProviders(fileService: IFileService, logService: ILogService, nativeHostService: INativeHostService): void {

		// Local Files
		fileService.registerProvider(Schemas.file, simpleFileSystemProvider);

		// User Data Provider
		fileService.registerProvider(Schemas.userData, new FileUserDataProvider(Schemas.file, simpleFileSystemProvider, Schemas.userData, logService));
	}
}

export function main(configuration: INativeWorkbenchConfiguration): Promise<void> {
	const workbench = new DesktopMain(configuration);

	return workbench.open();
}
