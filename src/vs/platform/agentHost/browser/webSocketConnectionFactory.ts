/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import type { IObservable } from '../../../base/common/observable.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { IAgentHostAdvertisedAuthenticationResolver } from '../common/agentHostAdvertisedAuthentication.js';
import { AgentHostAhpJsonlLoggingSettingId } from '../common/agentService.js';
import { RemoteAgentHostEntryType, type IRemoteAgentHostConnectionFactory, type IRemoteAgentHostConnectOptions, type IRemoteAgentHostCreatedConnection, type IRemoteAgentHostEntry, type IRemoteAgentHostExtensionConnection, type IRemoteAgentHostWebSocketConnection, type RemoteAgentHostConnection } from '../common/remoteAgentHostService.js';
import type { Implementation } from '../common/state/protocol/common/commands.js';
import { AgentHostProtocolClient } from './agentHostProtocolClient.js';
import { WebSocketClientTransport } from './webSocketClientTransport.js';

function isWebSocketConnection(connection: RemoteAgentHostConnection): connection is IRemoteAgentHostWebSocketConnection | IRemoteAgentHostExtensionConnection {
	return connection.type === RemoteAgentHostEntryType.WebSocket || connection.type === RemoteAgentHostEntryType.Extension;
}

/**
 * Builds WebSocket-backed protocol clients without performing their handshake, for an entry kind whose
 * hosts are dialed directly at their address. Each kind's owner registers its own instance with the
 * entries it supplies.
 */
export class WebSocketConnectionFactory extends Disposable implements IRemoteAgentHostConnectionFactory {

	constructor(
		readonly kind: RemoteAgentHostEntryType.WebSocket | RemoteAgentHostEntryType.Extension,
		readonly entries: IObservable<readonly IRemoteAgentHostEntry[]>,
		private readonly _clientInfo: () => Readonly<Implementation>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IAgentHostAdvertisedAuthenticationResolver private readonly _authenticationResolver: IAgentHostAdvertisedAuthenticationResolver,
	) {
		super();
	}

	createConnection(entry: IRemoteAgentHostEntry, _options: IRemoteAgentHostConnectOptions): Promise<IRemoteAgentHostCreatedConnection> {
		if (!isWebSocketConnection(entry.connection) || entry.connection.type !== this.kind) {
			throw new Error(`The ${this.kind} factory cannot create a ${entry.connection.type} connection.`);
		}

		const address = entry.connection.address;
		const ahpLoggingEnabled = !!this._configurationService.getValue<boolean>(AgentHostAhpJsonlLoggingSettingId);
		// The protocol client creates a transport for every soft-reconnect attempt.
		const transportFactory = () => this._instantiationService.createInstance(
			WebSocketClientTransport,
			address,
			entry.connectionToken,
			ahpLoggingEnabled
				? { logsHome: this._environmentService.logsHome, logId: address, connectionId: address, transport: 'websocket' }
				: undefined,
		);
		const authentication = this._authenticationResolver.createResolver(address);
		try {
			const connection = this._instantiationService.createInstance(AgentHostProtocolClient, address, transportFactory, {
				clientInfo: this._clientInfo(),
				resolveAdvertisedAuthentication: agents => authentication.resolve(agents),
				onDispose: () => authentication.dispose(),
			});
			return Promise.resolve({ connection });
		} catch (error) {
			authentication.dispose();
			throw error;
		}
	}
}
