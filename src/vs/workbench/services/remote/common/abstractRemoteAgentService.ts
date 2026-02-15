/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IChannel, IServerChannel, getDelayedChannel, IPCLogger } from '../../../../base/parts/ipc/common/ipc.js';
import { Client } from '../../../../base/parts/ipc/common/ipc.net.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { connectRemoteAgentManagement, IConnectionOptions, ManagementPersistentConnection, PersistentConnectionEvent } from '../../../../platform/remote/common/remoteAgentConnection.js';
import { IExtensionHostExitInfo, IRemoteAgentConnection, IRemoteAgentService } from './remoteAgentService.js';
import { IRemoteAuthorityResolverService } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { RemoteAgentConnectionContext, IRemoteAgentEnvironment } from '../../../../platform/remote/common/remoteAgentEnvironment.js';
import { RemoteExtensionEnvironmentChannelClient } from './remoteAgentEnvironmentChannel.js';
import { IDiagnosticInfoOptions, IDiagnosticInfo } from '../../../../platform/diagnostics/common/diagnostics.js';
import { Emitter } from '../../../../base/common/event.js';
import { ISignService } from '../../../../platform/sign/common/sign.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ITelemetryData, TelemetryLevel } from '../../../../platform/telemetry/common/telemetry.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { IRemoteSocketFactoryService } from '../../../../platform/remote/common/remoteSocketFactoryService.js';

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
		@ILogService private readonly _logService: ILogService
	) {
		super();
		if (this._environmentService.remoteAuthority) {
			this._connection = this._register(new RemoteAgentConnection(this._environmentService.remoteAuthority, productService.commit, productService.quality, this.remoteSocketFactoryService, this._remoteAuthorityResolverService, signService, this._logService));
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
					if (typeof env.reconnectionGraceTime === 'number') {
						this._logService.info(`[reconnection-grace-time] Client received grace time from server: ${env.reconnectionGraceTime}ms (${Math.floor(env.reconnectionGraceTime / 1000)}s)`);
						connection.updateGraceTime(env.reconnectionGraceTime);
					} else {
						this._logService.info(`[reconnection-grace-time] Server did not provide grace time, using default`);
					}
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

	async endConnection(): Promise<void> {
		if (this._connection) {
			await this._connection.end();
			this._connection.dispose();
		}
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
	private _managementConnection: ManagementPersistentConnection | null = null;

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

	end: () => Promise<void> = () => Promise.resolve();

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

	getManagementConnection(): ManagementPersistentConnection | null {
		return this._managementConnection;
	}

	updateGraceTime(graceTime: number): void {
		if (this._managementConnection) {
			this._managementConnection.updateGraceTime(graceTime);
		}
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
			this._managementConnection = connection;
		} finally {
			this._initialConnectionMs = Date.now() - start;
		}

		connection.protocol.onDidDispose(() => {
			connection.dispose();
		});
		this.end = () => {
			connection.protocol.sendDisconnect();
			return connection.protocol.drain();
		};
		this._register(connection.onDidStateChange(e => this._onDidStateChange.fire(e)));
		return connection.client;
	}
}
