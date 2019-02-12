/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Disposable } from 'vs/base/common/lifecycle';
import { IChannel, getDelayedChannel, IServerChannel } from 'vs/base/parts/ipc/node/ipc';
import { Client } from 'vs/base/parts/ipc/node/ipc.net';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { connectRemoteAgentManagement, RemoteAgentConnectionContext } from 'vs/platform/remote/node/remoteAgentConnection';
import { IWindowConfiguration } from 'vs/platform/windows/common/windows';
import { RemoteExtensionEnvironmentChannelClient } from 'vs/workbench/services/remote/node/remoteAgentEnvironmentChannel';
import { IRemoteAgentConnection, IRemoteAgentEnvironment, IRemoteAgentService } from 'vs/workbench/services/remote/node/remoteAgentService';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';

export class RemoteAgentService implements IRemoteAgentService {

	_serviceBrand: any;

	private readonly _connection: IRemoteAgentConnection | null = null;

	constructor(
		window: IWindowConfiguration,
		@INotificationService notificationService: INotificationService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IRemoteAuthorityResolverService remoteAuthorityResolverService: IRemoteAuthorityResolverService
	) {
		if (window.remoteAuthority) {
			this._connection = new RemoteAgentConnection(window.remoteAuthority, notificationService, environmentService, remoteAuthorityResolverService);
		}
	}

	getConnection(): IRemoteAgentConnection | null {
		return this._connection;
	}
}

class RemoteAgentConnection extends Disposable implements IRemoteAgentConnection {

	readonly remoteAuthority: string;
	private _connection: Promise<Client<RemoteAgentConnectionContext>> | null;
	private _environment: Promise<IRemoteAgentEnvironment | null> | null;

	constructor(
		remoteAuthority: string,
		private _notificationService: INotificationService,
		private _environmentService: IEnvironmentService,
		private _remoteAuthorityResolverService: IRemoteAuthorityResolverService
	) {
		super();
		this.remoteAuthority = remoteAuthority;
		this._connection = null;
		this._environment = null;
	}

	getEnvironment(): Promise<IRemoteAgentEnvironment | null> {
		if (!this._environment) {
			const client = new RemoteExtensionEnvironmentChannelClient(this.getChannel('remoteextensionsenvironment'));

			// Let's cover the case where connecting to fetch the remote extension info fails
			this._environment = client.getEnvironmentData(this.remoteAuthority, this._environmentService.extensionDevelopmentLocationURI)
				.then(undefined, err => { this._notificationService.error(localize('connectionError', "Failed to connect to the remote extension host agent (Error: {0})", err ? err.message : '')); return null; });
		}
		return this._environment;
	}

	getChannel<T extends IChannel>(channelName: string): T {
		return <T>getDelayedChannel(this._getOrCreateConnection().then(c => c.getChannel(channelName)));
	}

	registerChannel<T extends IServerChannel<RemoteAgentConnectionContext>>(channelName: string, channel: T): void {
		this._getOrCreateConnection().then(client => client.registerChannel(channelName, channel));
	}

	private _getOrCreateConnection(): Promise<Client<RemoteAgentConnectionContext>> {
		if (!this._connection) {
			this._connection = this._remoteAuthorityResolverService.resolveAuthority(this.remoteAuthority).then((resolvedAuthority) => {
				return connectRemoteAgentManagement(this.remoteAuthority, resolvedAuthority.host, resolvedAuthority.port, `renderer`, this._environmentService.isBuilt);
			});
		}
		return this._connection;
	}
}
