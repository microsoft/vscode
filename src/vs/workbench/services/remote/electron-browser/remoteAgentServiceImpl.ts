/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { getDelayedChannel } from 'vs/base/parts/ipc/node/ipc';
import { Client } from 'vs/base/parts/ipc/node/ipc.net';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { connectRemoteAgentManagement } from 'vs/platform/remote/node/remoteAgentConnection';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { IRemoteAgentConnection, IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { DialogChannel } from 'vs/platform/dialogs/node/dialogIpc';
import { DownloadServiceChannel } from 'vs/platform/download/node/downloadIpc';
import { LogLevelSetterChannel } from 'vs/platform/log/node/logIpc';
import { ILogService } from 'vs/platform/log/common/log';
import { RemoteAgentConnectionContext, IRemoteAgentEnvironment } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { IChannel, IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { RemoteExtensionEnvironmentChannelClient } from 'vs/workbench/services/remote/node/remoteAgentEnvironmentChannel';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { localize } from 'vs/nls';

export class RemoteAgentService extends Disposable implements IRemoteAgentService {

	_serviceBrand: any;

	private readonly _connection: IRemoteAgentConnection | null = null;
	private _environment: Promise<IRemoteAgentEnvironment | null> | null;

	constructor(
		@IWindowService windowService: IWindowService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IRemoteAuthorityResolverService remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@INotificationService private readonly _notificationService: INotificationService
	) {
		super();
		const { remoteAuthority } = windowService.getConfiguration();
		if (remoteAuthority) {
			this._connection = this._register(new RemoteAgentConnection(remoteAuthority, _environmentService, remoteAuthorityResolverService));
		}
	}

	getConnection(): IRemoteAgentConnection | null {
		return this._connection;
	}

	getEnvironment(): Promise<IRemoteAgentEnvironment | null> {
		if (!this._environment) {
			const connection = this.getConnection();
			if (connection) {
				const client = new RemoteExtensionEnvironmentChannelClient(connection.getChannel('remoteextensionsenvironment'));

				// Let's cover the case where connecting to fetch the remote extension info fails
				this._environment = client.getEnvironmentData(connection.remoteAuthority, this._environmentService.extensionDevelopmentLocationURI)
					.then(undefined, err => { this._notificationService.error(localize('connectionError', "Failed to connect to the remote extension host agent (Error: {0})", err ? err.message : '')); return null; });
			} else {
				this._environment = Promise.resolve(null);
			}
		}
		return this._environment;
	}
}

class RemoteAgentConnection extends Disposable implements IRemoteAgentConnection {

	readonly remoteAuthority: string;
	private _connection: Promise<Client<RemoteAgentConnectionContext>> | null;

	constructor(
		remoteAuthority: string,
		private _environmentService: IEnvironmentService,
		private _remoteAuthorityResolverService: IRemoteAuthorityResolverService
	) {
		super();
		this.remoteAuthority = remoteAuthority;
		this._connection = null;
	}

	getChannel<T extends IChannel>(channelName: string): T {
		return <T>getDelayedChannel(this._getOrCreateConnection().then(c => c.getChannel(channelName)));
	}

	registerChannel<T extends IServerChannel<RemoteAgentConnectionContext>>(channelName: string, channel: T): void {
		this._getOrCreateConnection().then(client => client.registerChannel(channelName, channel));
	}

	private _getOrCreateConnection(): Promise<Client<RemoteAgentConnectionContext>> {
		if (!this._connection) {
			this._connection = this._createConnection();
		}
		return this._connection;
	}

	private async _createConnection(): Promise<Client<RemoteAgentConnectionContext>> {
		const resolvedAuthority = await this._remoteAuthorityResolverService.resolveAuthority(this.remoteAuthority);
		const connection = await connectRemoteAgentManagement(this.remoteAuthority, resolvedAuthority.host, resolvedAuthority.port, `renderer`, this._environmentService.isBuilt);
		this._register(connection);
		return connection.client;
	}
}

class RemoteChannelsContribution implements IWorkbenchContribution {

	constructor(
		@ILogService logService: ILogService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IDialogService dialogService: IDialogService
	) {
		const connection = remoteAgentService.getConnection();
		if (connection) {
			connection.registerChannel('dialog', new DialogChannel(dialogService));
			connection.registerChannel('download', new DownloadServiceChannel());
			connection.registerChannel('loglevel', new LogLevelSetterChannel(logService));
		}
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(RemoteChannelsContribution, LifecyclePhase.Ready);
registerSingleton(IRemoteAgentService, RemoteAgentService);