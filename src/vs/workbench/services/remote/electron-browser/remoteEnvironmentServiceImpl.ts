/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IRemoteAgentEnvironment } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { RemoteExtensionEnvironmentChannelClient } from 'vs/workbench/services/remote/node/remoteAgentEnvironmentChannel';
import { IRemoteEnvironmentService } from 'vs/workbench/services/remote/common/remoteEnvironmentService';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { localize } from 'vs/nls';

export class RemoteEnvironmentService implements IRemoteEnvironmentService {

	_serviceBrand: any;
	private _environment: Promise<IRemoteAgentEnvironment | null> | null;

	constructor(
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@INotificationService private readonly notificationService: INotificationService,
	) { }

	getEnvironment(): Promise<IRemoteAgentEnvironment | null> {
		if (!this._environment) {
			const connection = this.remoteAgentService.getConnection();
			if (connection) {
				const client = new RemoteExtensionEnvironmentChannelClient(connection.getChannel('remoteextensionsenvironment'));

				// Let's cover the case where connecting to fetch the remote extension info fails
				this._environment = client.getEnvironmentData(connection.remoteAuthority, this.environmentService.extensionDevelopmentLocationURI)
					.then(undefined, err => { this.notificationService.error(localize('connectionError', "Failed to connect to the remote extension host agent (Error: {0})", err ? err.message : '')); return null; });
			} else {
				this._environment = Promise.resolve(null);
			}
		}
		return this._environment;
	}
}

registerSingleton(IRemoteEnvironmentService, RemoteEnvironmentService, true);