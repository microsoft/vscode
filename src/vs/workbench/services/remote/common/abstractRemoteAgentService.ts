/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IChannel, IServerChannel, getDelayedChannel, IPCLogger } from 'vs/base/parts/ipc/common/ipc';
import { Client } from 'vs/base/parts/ipc/common/ipc.net';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { connectRemoteAgentManagement, IConnectionOptions, ManagementPersistentConnection, PersistentConnectionEvent } from 'vs/platform/remote/common/remoteAgentConnection';
import { IExtensionHostExitInfo, IRemoteAgentConnection, IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { RemoteAgentConnectionContext, IRemoteAgentEnvironment } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { RemoteExtensionEnvironmentChannelClient } from 'vs/workbench/services/remote/common/remoteAgentEnvironmentChannel';
import { IDiagnosticInfoOptions, IDiagnosticInfo } from 'vs/platform/diagnostics/common/diagnostics';
import { Emitter } from 'vs/base/common/event';
import { ISignService } from 'vs/platform/sign/common/sign';
import { ILogService } from 'vs/platform/log/common/log';
import { ITelemetryData, TelemetryLevel } from 'vs/platform/telemetry/common/telemetry';
import { IProductService } from 'vs/platform/product/common/productService';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { IRemoteSocketFactoryService } from 'vs/platform/remote/common/remoteSocketFactoryService';

export abstract class AbstractRemoteAgentService extends Disposable implements IRemoteAgentService {

	declare readonly _serviceBrand: undefined;

	private readonly _connection: IRemoteAgentConnection | null;
	private _environment: Promise<IRemoteAgentEnvironment | null> | null;

	constructor(
		@IRemoteSocketFactoryService private readonly remoteSocketFactoryService: IRemoteSocketFactoryService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IWorkbenchEnvironmentService protected readonly _environmentService: IWorkbenchEnvironmentService,
		@IProductService productService: IProductService,
		@IRemoteAuthorityResolverService private readonly _remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@ISignService signService: ISignService,
		@ILogService logService: ILogService
	) {
		super();
		if (this._environmentService.remoteAuthority) {
			this._connection = this._register(new RemoteAgentConnection(this._environmentService.remoteAuthority, productService.commit, productService.quality, this.remoteSocketFactoryService, this._remoteAuthorityResolverService, signService, logService));
		} else {
			this._connection = null;
		}
		this._environment = null;
	}

	getConnection(): IRemoteAgentConnection | null {
		return this._connection;
	}

	getEnvironment(): Promise<IRemoteAgentEnvironment | null> {
		return this.getRawEnvironment().then(undefined, () => null);
	}

	getRawEnvironment(): Promise<IRemoteAgentEnvironment | null> {
		if (!this._environment) {
			this._environment = this._withChannel(
				async (channel, connection) => {
					const env = await RemoteExtensionEnvironmentChannelClient.getEnvironmentData(channel, connection.remoteAuthority, this.userDataProfileService.currentProfile.isDefault ? undefined : this.userDataProfileService.currentProfile.id);
					this._remoteAuthorityResolverService._setAuthorityConnectionToken(connection.remoteAuthority, env.connectionToken);
					return env;
				},
				null
			);
		}
		return this._environment;
	}

	getExtensionHostExitInfo(reconnectionToken: string): Promise<IExtensionHostExitInfo | null> {
		return this._withChannel(
			(channel, connection) => RemoteExtensionEnvironmentChannelClient.getExtensionHostExitInfo(channel, connection.remoteAuthority, reconnectionToken),
			null
		);
	}

	getDiagnosticInfo(options: IDiagnosticInfoOptions): Promise<IDiagnosticInfo | undefined> {
		return this._withChannel(
			channel => RemoteExtensionEnvironmentChannelClient.getDiagnosticInfo(channel, options),
			undefined
		);
	}

	updateTelemetryLevel(telemetryLevel: TelemetryLevel): Promise<void> {
		return this._withTelemetryChannel(
			channel => RemoteExtensionEnvironmentChannelClient.updateTelemetryLevel(channel, telemetryLevel),
			undefined
		);
	}

	logTelemetry(eventName: string, data: ITelemetryData): Promise<void> {
		return this._withTelemetryChannel(
			channel => RemoteExtensionEnvironmentChannelClient.logTelemetry(channel, eventName, data),
			undefined
		);
	}

	flushTelemetry(): Promise<void> {
		return this._withTelemetryChannel(
			channel => RemoteExtensionEnvironmentChannelClient.flushTelemetry(channel),
			undefined
		);
	}

	getRoundTripTime(): Promise<number | undefined> {
		return this._withTelemetryChannel(
			async channel => {
				const start = Date.now();
				await RemoteExtensionEnvironmentChannelClient.ping(channel);
				return Date.now() - start;
			},
			undefined
		);
	}

	private _withChannel<R>(callback: (channel: IChannel, connection: IRemoteAgentConnection) => Promise<R>, fallback: R): Promise<R> {
		const connection = this.getConnection();
		if (!connection) {
			return Promise.resolve(fallback);
		}
		return connection.withChannel('remoteextensionsenvironment', (channel) => callback(channel, connection));
	}

	private _withTelemetryChannel<R>(callback: (channel: IChannel, connection: IRemoteAgentConnection) => Promise<R>, fallback: R): Promise<R> {
		const connection = this.getConnection();
		if (!connection) {
			return Promise.resolve(fallback);
		}
		return connection.withChannel('telemetry', (channel) => callback(channel, connection));
	}

}

class RemoteAgentConnection extends Disposable implements IRemoteAgentConnection {

	private readonly _onReconnecting = this._register(new Emitter<void>());
	public readonly onReconnecting = this._onReconnecting.event;

	private readonly _onDidStateChange = this._register(new Emitter<PersistentConnectionEvent>());
	public readonly onDidStateChange = this._onDidStateChange.event;

	readonly remoteAuthority: string;
	private _connection: Promise<Client<RemoteAgentConnectionContext>> | null;

	private _initialConnectionMs: number | undefined;

	constructor(
		remoteAuthority: string,
		private readonly _commit: string | undefined,
		private readonly _quality: string | undefined,
		private readonly _remoteSocketFactoryService: IRemoteSocketFactoryService,
		private readonly _remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		private readonly _signService: ISignService,
		private readonly _logService: ILogService
	) {
		super();
		this.remoteAuthority = remoteAuthority;
		this._connection = null;
	}

	getChannel<T extends IChannel>(channelName: string): T {
		return <T>getDelayedChannel(this._getOrCreateConnection().then(c => c.getChannel(channelName)));
	}

	withChannel<T extends IChannel, R>(channelName: string, callback: (channel: T) => Promise<R>): Promise<R> {
		const channel = this.getChannel<T>(channelName);
		const result = callback(channel);
		return result;
	}

	registerChannel<T extends IServerChannel<RemoteAgentConnectionContext>>(channelName: string, channel: T): void {
		this._getOrCreateConnection().then(client => client.registerChannel(channelName, channel));
	}

	async getInitialConnectionTimeMs() {
		try {
			await this._getOrCreateConnection();
		} catch {
			// ignored -- time is measured even if connection fails
		}

		return this._initialConnectionMs!;
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
			quality: this._quality,
			addressProvider: {
				getAddress: async () => {
					if (firstCall) {
						firstCall = false;
					} else {
						this._onReconnecting.fire(undefined);
					}
					const { authority } = await this._remoteAuthorityResolverService.resolveAuthority(this.remoteAuthority);
					return { connectTo: authority.connectTo, connectionToken: authority.connectionToken };
				}
			},
			remoteSocketFactoryService: this._remoteSocketFactoryService,
			signService: this._signService,
			logService: this._logService,
			ipcLogger: false ? new IPCLogger(`Local \u2192 Remote`, `Remote \u2192 Local`) : null
		};
		let connection: ManagementPersistentConnection;
		const start = Date.now();
		try {
			connection = this._register(await connectRemoteAgentManagement(options, this.remoteAuthority, `renderer`));
		} finally {
			this._initialConnectionMs = Date.now() - start;
		}

		connection.protocol.onDidDispose(() => {
			connection.dispose();
		});
		this._register(connection.onDidStateChange(e => this._onDidStateChange.fire(e)));
		return connection.client;
	}
}
