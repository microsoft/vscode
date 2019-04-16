/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Client, PersistentProtocol, ISocket } from 'vs/base/parts/ipc/common/ipc.net';
import { generateUuid } from 'vs/base/common/uuid';
import { RemoteAgentConnectionContext } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter } from 'vs/base/common/event';

export const enum ConnectionType {
	Management = 1,
	ExtensionHost = 2,
	Tunnel = 3,
}

interface ISimpleConnectionOptions {
	isBuilt: boolean;
	commit: string | undefined;
	host: string;
	port: number;
	reconnectionToken: string;
	reconnectionProtocol: PersistentProtocol | null;
	webSocketFactory: IWebSocketFactory;
}

export interface IConnectCallback {
	(err: any | undefined, socket: ISocket | undefined): void;
}

export interface IWebSocketFactory {
	connect(host: string, port: number, query: string, callback: IConnectCallback): void;
}

async function connectToRemoteExtensionHostAgent(options: ISimpleConnectionOptions, connectionType: ConnectionType, args: any | undefined): Promise<PersistentProtocol> {
	throw new Error(`Not implemented`);
}

interface IManagementConnectionResult {
	protocol: PersistentProtocol;
}

async function doConnectRemoteAgentManagement(options: ISimpleConnectionOptions): Promise<IManagementConnectionResult> {
	const protocol = await connectToRemoteExtensionHostAgent(options, ConnectionType.Management, undefined);
	return new Promise<IManagementConnectionResult>((c, e) => {
		const registration = protocol.onControlMessage(raw => {
			registration.dispose();
			const msg = JSON.parse(raw.toString());
			const error = getErrorFromMessage(msg);
			if (error) {
				return e(error);
			}
			if (options.reconnectionProtocol) {
				options.reconnectionProtocol.endAcceptReconnection();
			}
			c({ protocol });
		});
	});
}

export interface IRemoteExtensionHostStartParams {
	language: string;
	debugId?: string;
	break?: boolean;
	port?: number | null;
}

interface IExtensionHostConnectionResult {
	protocol: PersistentProtocol;
	debugPort?: number;
}

async function doConnectRemoteAgentExtensionHost(options: ISimpleConnectionOptions, startArguments: IRemoteExtensionHostStartParams): Promise<IExtensionHostConnectionResult> {
	const protocol = await connectToRemoteExtensionHostAgent(options, ConnectionType.ExtensionHost, startArguments);
	return new Promise<IExtensionHostConnectionResult>((c, e) => {
		const registration = protocol.onControlMessage(raw => {
			registration.dispose();
			const msg = JSON.parse(raw.toString());
			const error = getErrorFromMessage(msg);
			if (error) {
				return e(error);
			}
			const debugPort = msg && msg.debugPort;
			if (options.reconnectionProtocol) {
				options.reconnectionProtocol.endAcceptReconnection();
			}
			c({ protocol, debugPort });
		});
	});
}

export interface ITunnelConnectionStartParams {
	port: number;
}

async function doConnectRemoteAgentTunnel(options: ISimpleConnectionOptions, startParams: ITunnelConnectionStartParams): Promise<PersistentProtocol> {
	const protocol = await connectToRemoteExtensionHostAgent(options, ConnectionType.Tunnel, startParams);
	return protocol;
}

export interface IConnectionOptions {
	isBuilt: boolean;
	commit: string | undefined;
	webSocketFactory: IWebSocketFactory;
	addressProvider: IAddressProvider;
}

async function resolveConnectionOptions(options: IConnectionOptions, reconnectionToken: string, reconnectionProtocol: PersistentProtocol | null): Promise<ISimpleConnectionOptions> {
	const { host, port } = await options.addressProvider.getAddress();
	return {
		isBuilt: options.isBuilt,
		commit: options.commit,
		host: host,
		port: port,
		reconnectionToken: reconnectionToken,
		reconnectionProtocol: reconnectionProtocol,
		webSocketFactory: options.webSocketFactory,
	};
}

export interface IAddress {
	host: string;
	port: number;
}

export interface IAddressProvider {
	getAddress(): Promise<IAddress>;
}

export async function connectRemoteAgentManagement(options: IConnectionOptions, remoteAuthority: string, clientId: string): Promise<ManagementPersistentConnection> {
	const reconnectionToken = generateUuid();
	const simpleOptions = await resolveConnectionOptions(options, reconnectionToken, null);
	const { protocol } = await doConnectRemoteAgentManagement(simpleOptions);
	return new ManagementPersistentConnection(options, remoteAuthority, clientId, reconnectionToken, protocol);
}

export async function connectRemoteAgentExtensionHost(options: IConnectionOptions, startArguments: IRemoteExtensionHostStartParams): Promise<ExtensionHostPersistentConnection> {
	const reconnectionToken = generateUuid();
	const simpleOptions = await resolveConnectionOptions(options, reconnectionToken, null);
	const { protocol, debugPort } = await doConnectRemoteAgentExtensionHost(simpleOptions, startArguments);
	return new ExtensionHostPersistentConnection(options, startArguments, reconnectionToken, protocol, debugPort);
}

export async function connectRemoteAgentTunnel(options: IConnectionOptions, tunnelRemotePort: number): Promise<PersistentProtocol> {
	const simpleOptions = await resolveConnectionOptions(options, generateUuid(), null);
	const protocol = await doConnectRemoteAgentTunnel(simpleOptions, { port: tunnelRemotePort });
	return protocol;
}

export const enum PersistenConnectionEventType {
	ConnectionLost,
	ReconnectionWait,
	ReconnectionRunning,
	ReconnectionPermanentFailure,
	ConnectionGain
}
export class ConnectionLostEvent {
	public readonly type = PersistenConnectionEventType.ConnectionLost;
}
export class ReconnectionWaitEvent {
	public readonly type = PersistenConnectionEventType.ReconnectionWait;
	constructor(
		public readonly durationSeconds: number
	) { }
}
export class ReconnectionRunningEvent {
	public readonly type = PersistenConnectionEventType.ReconnectionRunning;
}
export class ConnectionGainEvent {
	public readonly type = PersistenConnectionEventType.ConnectionGain;
}
export class ReconnectionPermanentFailureEvent {
	public readonly type = PersistenConnectionEventType.ReconnectionPermanentFailure;
}
export type PersistenConnectionEvent = ConnectionLostEvent | ReconnectionWaitEvent | ReconnectionRunningEvent | ConnectionGainEvent | ReconnectionPermanentFailureEvent;

abstract class PersistentConnection extends Disposable {

	private readonly _onDidStateChange = this._register(new Emitter<PersistenConnectionEvent>());
	public readonly onDidStateChange = this._onDidStateChange.event;

	protected readonly _options: IConnectionOptions;
	public readonly reconnectionToken: string;
	public readonly protocol: PersistentProtocol;

	constructor(options: IConnectionOptions, reconnectionToken: string, protocol: PersistentProtocol) {
		super();
		this._options = options;
		this.reconnectionToken = reconnectionToken;
		this.protocol = protocol;
	}

	protected abstract _reconnect(options: ISimpleConnectionOptions): Promise<void>;
}

export class ManagementPersistentConnection extends PersistentConnection {

	public readonly client: Client<RemoteAgentConnectionContext>;

	constructor(options: IConnectionOptions, remoteAuthority: string, clientId: string, reconnectionToken: string, protocol: PersistentProtocol) {
		super(options, reconnectionToken, protocol);
		this.client = this._register(new Client<RemoteAgentConnectionContext>(protocol, {
			remoteAuthority: remoteAuthority,
			clientId: clientId
		}));
	}

	protected async _reconnect(options: ISimpleConnectionOptions): Promise<void> {
		await doConnectRemoteAgentManagement(options);
	}
}

export class ExtensionHostPersistentConnection extends PersistentConnection {

	private readonly _startArguments: IRemoteExtensionHostStartParams;
	public readonly debugPort: number | undefined;

	constructor(options: IConnectionOptions, startArguments: IRemoteExtensionHostStartParams, reconnectionToken: string, protocol: PersistentProtocol, debugPort: number | undefined) {
		super(options, reconnectionToken, protocol);
		this._startArguments = startArguments;
		this.debugPort = debugPort;
	}

	protected async _reconnect(options: ISimpleConnectionOptions): Promise<void> {
		await doConnectRemoteAgentExtensionHost(options, this._startArguments);
	}
}

function getErrorFromMessage(msg: any): Error | null {
	if (msg && msg.type === 'error') {
		const error = new Error(`Connection error: ${msg.reason}`);
		(<any>error).code = 'VSCODE_CONNECTION_ERROR';
		return error;
	}
	return null;
}
