/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Disposable } from 'vs/base/common/lifecycle';
import { IChannel, IServerChannel, getDelayedChannel } from 'vs/base/parts/ipc/common/ipc';
import { Client } from 'vs/base/parts/ipc/common/ipc.net';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { connectRemoteAgentManagement, IConnectionOptions, ISocketFactory, PersistenConnectionEvent } from 'vs/platform/remote/common/remoteAgentConnection';
import { IRemoteAgentConnection, IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IRemoteAuthorityResolverService, RemoteAuthorityResolverError } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { RemoteAgentConnectionContext, IRemoteAgentEnvironment } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { RemoteExtensionEnvironmentChannelClient } from 'vs/workbench/services/remote/common/remoteAgentEnvironmentChannel';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IDiagnosticInfoOptions, IDiagnosticInfo } from 'vs/platform/diagnostics/common/diagnostics';
import { Emitter } from 'vs/base/common/event';
import { ISignService } from 'vs/platform/sign/common/sign';

export abstract class AbstractRemoteAgentService extends Disposable {

	_serviceBrand: any;

	private _environment: Promise<IRemoteAgentEnvironment | null> | null;

	constructor(
		@IEnvironmentService protected readonly _environmentService: IEnvironmentService
	) {
		super();
		this._environment = null;
	}

	abstract getConnection(): IRemoteAgentConnection | null;

	getEnvironment(bail?: boolean): Promise<IRemoteAgentEnvironment | null> {
		if (!this._environment) {
			const connection = this.getConnection();
			if (connection) {
				const client = new RemoteExtensionEnvironmentChannelClient(connection.getChannel('remoteextensionsenvironment'));
				this._environment = client.getEnvironmentData(connection.remoteAuthority, this._environmentService.extensionDevelopmentLocationURI);
			} else {
				this._environment = Promise.resolve(null);
			}
		}
		return bail ? this._environment : this._environment.then(undefined, () => null);
	}

	getDiagnosticInfo(options: IDiagnosticInfoOptions): Promise<IDiagnosticInfo | undefined> {
		const connection = this.getConnection();
		if (connection) {
			const client = new RemoteExtensionEnvironmentChannelClient(connection.getChannel('remoteextensionsenvironment'));
			return client.getDiagnosticInfo(options);
		}

		return Promise.resolve(undefined);
	}

	disableTelemetry(): Promise<void> {
		const connection = this.getConnection();
		if (connection) {
			const client = new RemoteExtensionEnvironmentChannelClient(connection.getChannel('remoteextensionsenvironment'));
			return client.disableTelemetry();
		}

		return Promise.resolve(undefined);
	}
}

export class RemoteAgentConnection extends Disposable implements IRemoteAgentConnection {

	private readonly _onReconnecting = this._register(new Emitter<void>());
	public readonly onReconnecting = this._onReconnecting.event;

	private readonly _onDidStateChange = this._register(new Emitter<PersistenConnectionEvent>());
	public readonly onDidStateChange = this._onDidStateChange.event;

	readonly remoteAuthority: string;
	private _connection: Promise<Client<RemoteAgentConnectionContext>> | null;

	constructor(
		remoteAuthority: string,
		private readonly _commit: string | undefined,
		private readonly _socketFactory: ISocketFactory,
		private readonly _remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		private readonly _signService: ISignService
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
		let firstCall = true;
		const options: IConnectionOptions = {
			commit: this._commit,
			socketFactory: this._socketFactory,
			addressProvider: {
				getAddress: async () => {
					if (firstCall) {
						firstCall = false;
					} else {
						this._onReconnecting.fire(undefined);
					}
					const { authority } = await this._remoteAuthorityResolverService.resolveAuthority(this.remoteAuthority);
					return { host: authority.host, port: authority.port };
				}
			},
			signService: this._signService
		};
		const connection = this._register(await connectRemoteAgentManagement(options, this.remoteAuthority, `renderer`));
		this._register(connection.onDidStateChange(e => this._onDidStateChange.fire(e)));
		return connection.client;
	}
}

class RemoteConnectionFailureNotificationContribution implements IWorkbenchContribution {

	constructor(
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@INotificationService notificationService: INotificationService,
	) {
		// Let's cover the case where connecting to fetch the remote extension info fails
		remoteAgentService.getEnvironment(true)
			.then(undefined, err => {
				if (!RemoteAuthorityResolverError.isHandledNotAvailable(err)) {
					notificationService.error(nls.localize('connectionError', "Failed to connect to the remote extension host server (Error: {0})", err ? err.message : ''));
				}
			});
	}

}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(RemoteConnectionFailureNotificationContribution, LifecyclePhase.Ready);
