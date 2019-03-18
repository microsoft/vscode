/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IRemoteAgentEnvironment } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IRemoteEnvironmentService {
	_serviceBrand: any;
	remoteEnvironment: Promise<IRemoteAgentEnvironment | null>;
}

export const IRemoteEnvironmentService = createDecorator<IRemoteEnvironmentService>('remoteEnvironmentService');

export class RemoteEnvironmentService implements IRemoteEnvironmentService {
	_serviceBrand: any;

	constructor(
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
	) { }

	get remoteEnvironment(): Promise<IRemoteAgentEnvironment | null> {
		const connection = this.remoteAgentService.getConnection();
		if (connection) {
			return connection.getEnvironment();
		}
		return Promise.resolve(null);
	}
}

registerSingleton(IRemoteEnvironmentService, RemoteEnvironmentService, true);