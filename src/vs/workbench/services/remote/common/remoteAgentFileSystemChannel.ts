/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getErrorMessage } from 'vs/base/common/errors';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { OperatingSystem } from 'vs/base/common/platform';
import { FileSystemProviderCapabilities, IFileService } from 'vs/platform/files/common/files';
import { IPCFileSystemProvider } from 'vs/platform/files/common/ipcFileSystemProvider';
import { ILogService } from 'vs/platform/log/common/log';
import { IRemoteAgentEnvironment } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';

export const REMOTE_FILE_SYSTEM_CHANNEL_NAME = 'remoteFilesystem';

export class RemoteFileSystemProvider extends IPCFileSystemProvider {

	static register(remoteAgentService: IRemoteAgentService, fileService: IFileService, logService: ILogService): IDisposable {
		const disposables = new DisposableStore();
		if (remoteAgentService.getConnection()) {
			const promise = remoteAgentService.getRawEnvironment()
				.then(environment => {
					if (environment) {
						// Register remote fsp even before it is asked to activate
						// Because, some features (Configuration) wait for its registeration before making fs calls
						fileService.registerProvider(Schemas.vscodeRemote, disposables.add(new RemoteFileSystemProvider(environment, remoteAgentService)));
					} else {
						logService.error('Cannot register remote filesystem provider. Remote environment doesnot exist.');
					}
				}, error => {
					logService.error('Cannot register remote filesystem provider. Error while fetching remote environment.', getErrorMessage(error));
				});
			disposables.add(fileService.onWillActivateFileSystemProvider(e => {
				if (e.scheme === Schemas.vscodeRemote) {
					e.join(promise);
				}
			}));
		}
		return disposables;
	}

	constructor(remoteAgentEnvironment: IRemoteAgentEnvironment, remoteAgentService: IRemoteAgentService) {
		let capabilities = FileSystemProviderCapabilities.FileReadWrite
			| FileSystemProviderCapabilities.FileOpenReadWriteClose
			| FileSystemProviderCapabilities.FileReadStream
			| FileSystemProviderCapabilities.FileFolderCopy
			| FileSystemProviderCapabilities.FileWriteUnlock;
		if (remoteAgentEnvironment.os === OperatingSystem.Linux) {
			capabilities |= FileSystemProviderCapabilities.PathCaseSensitive;
		}
		super(capabilities, remoteAgentService.getConnection()!.getChannel(REMOTE_FILE_SYSTEM_CHANNEL_NAME));
	}
}
