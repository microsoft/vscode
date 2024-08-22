/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getErrorMessage } from '../../../../base/common/errors';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle';
import { Schemas } from '../../../../base/common/network';
import { OperatingSystem } from '../../../../base/common/platform';
import { IFileService } from '../../../../platform/files/common/files';
import { DiskFileSystemProviderClient } from '../../../../platform/files/common/diskFileSystemProviderClient';
import { ILogService } from '../../../../platform/log/common/log';
import { IRemoteAgentEnvironment } from '../../../../platform/remote/common/remoteAgentEnvironment';
import { IRemoteAgentConnection, IRemoteAgentService } from './remoteAgentService';

export const REMOTE_FILE_SYSTEM_CHANNEL_NAME = 'remoteFilesystem';

export class RemoteFileSystemProviderClient extends DiskFileSystemProviderClient {

	static register(remoteAgentService: IRemoteAgentService, fileService: IFileService, logService: ILogService): IDisposable {
		const connection = remoteAgentService.getConnection();
		if (!connection) {
			return Disposable.None;
		}

		const disposables = new DisposableStore();

		const environmentPromise = (async () => {
			try {
				const environment = await remoteAgentService.getRawEnvironment();
				if (environment) {
					// Register remote fsp even before it is asked to activate
					// because, some features (configuration) wait for its
					// registration before making fs calls.
					fileService.registerProvider(Schemas.vscodeRemote, disposables.add(new RemoteFileSystemProviderClient(environment, connection)));
				} else {
					logService.error('Cannot register remote filesystem provider. Remote environment doesnot exist.');
				}
			} catch (error) {
				logService.error('Cannot register remote filesystem provider. Error while fetching remote environment.', getErrorMessage(error));
			}
		})();

		disposables.add(fileService.onWillActivateFileSystemProvider(e => {
			if (e.scheme === Schemas.vscodeRemote) {
				e.join(environmentPromise);
			}
		}));

		return disposables;
	}

	private constructor(remoteAgentEnvironment: IRemoteAgentEnvironment, connection: IRemoteAgentConnection) {
		super(connection.getChannel(REMOTE_FILE_SYSTEM_CHANNEL_NAME), { pathCaseSensitive: remoteAgentEnvironment.os === OperatingSystem.Linux });
	}
}
