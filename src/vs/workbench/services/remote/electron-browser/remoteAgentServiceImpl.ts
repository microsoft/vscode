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
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { RemoteAgentConnectionContext } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { IChannel, IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';

export class RemoteAgentService extends Disposable implements IRemoteAgentService {

	_serviceBrand: any;

	private readonly _connection: IRemoteAgentConnection | null = null;

	constructor(
		@IWindowService windowService: IWindowService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IRemoteAuthorityResolverService remoteAuthorityResolverService: IRemoteAuthorityResolverService,
	) {
		super();
		const { remoteAuthority } = windowService.getConfiguration();
		if (remoteAuthority) {
			this._connection = this._register(new RemoteAgentConnection(remoteAuthority, environmentService, remoteAuthorityResolverService));
		}
	}

	getConnection(): IRemoteAgentConnection | null {
		return this._connection;
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
		@IInstantiationService instantiationService: IInstantiationService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
	) {
		const connection = remoteAgentService.getConnection();
		if (connection) {
			connection.registerChannel('dialog', instantiationService.createInstance(DialogChannel));
			connection.registerChannel('download', new DownloadServiceChannel());
			connection.registerChannel('loglevel', new LogLevelSetterChannel(logService));
		}
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(RemoteChannelsContribution, LifecyclePhase.Ready);
registerSingleton(IRemoteAgentService, RemoteAgentService);