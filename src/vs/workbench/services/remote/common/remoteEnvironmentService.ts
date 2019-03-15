/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRemoteEnvironmentService } from 'vs/platform/environment/common/environment';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IRemoteAgentEnvironment } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class RemoteEnvironmentService implements IRemoteEnvironmentService {
	_serviceBrand: any;

	constructor(
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,

	) { }

	get remoteEnvironment(): Promise<IRemoteAgentEnvironment | undefined> {
		const connection = this.remoteAgentService.getConnection();
		if (connection) {
			return connection.getEnvironment();
		}
		return Promise.resolve(undefined);
	}

}

registerSingleton(IRemoteEnvironmentService, RemoteEnvironmentService, true);