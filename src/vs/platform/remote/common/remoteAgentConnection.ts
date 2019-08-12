/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Client, PersistentProtocol, ISocket, ProtocolConstants } from 'vs/base/parts/ipc/common/ipc.net';
import { generateUuid } from 'vs/base/common/uuid';
import { RemoteAgentConnectionContext } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { Disposable } from 'vs/base/common/lifecycle';
import { VSBuffer } from 'vs/base/common/buffer';
import { Emitter } from 'vs/base/common/event';
import { RemoteAuthorityResolverError } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { isPromiseCanceledError } from 'vs/base/common/errors';
import { ISignService } from 'vs/platform/sign/common/sign';

export const enum ConnectionType {
	Management = 1,
	ExtensionHost = 2,
	Tunnel = 3,
}

export interface AuthRequest {
	type: 'auth';
	auth: string;
}

export interface SignRequest {
	type: 'sign';
	data: string;
}

export interface ConnectionTypeRequest {
	type: 'connectionType';
	commit?: string;
	signedData?: string;
	desiredConnectionType?: ConnectionType;
	args?: any;
}

export interface ErrorMessage {
	type: 'error';
	reason: string;
}

export interface OKMessage {
	type: 'ok';
}

export type HandshakeMessage = AuthRequest | SignRequest | ConnectionTypeRequest | ErrorMessage | OKMessage;


interface ISimpleConnectionOptions {
	commit: string | undefined;
	host: string;
	port: number;
	reconnectionToken: string;
	reconnectionProtocol: PersistentProtocol | null;
	socketFactory: ISocketFactory;
	signService: ISignService;
}

export interface IConnectCallback {
	(err: any | undefined, socket: ISocket | undefined): void;
}

export interface ISocketFactory {
	connect(host: string, port: number, query: string, callback: IConnectCallback): void;
}

async function connectToRemoteExtensionHostAgent(options: ISimpleConnectionOptions, connectionType: ConnectionType, args: any | undefined): Promise<PersistentProtocol> {
	const protocol = await new Promise<PersistentProtocol>((c, e) => {
		options.socketFactory.connect(
			options.host,
			options.port,
			`reconnectionToken=${options.reconnectionToken}&reconnection=${options.reconnectionProtocol ? 'true' : 'false'}`,
			(err: any, socket: ISocket) => {
				if (err) {
					e(err);
					return;
				}

				if (options.reconnectionProtocol) {
					options.reconnectionProtocol.beginAcceptReconnection(socket, null);
					c(options.reconnectionProtocol);
				} else {
					c(new PersistentProtocol(socket, null));
				}
			}
		);
	});

	return new Promise<PersistentProtocol>((c, e) => {

		const messageRegistration = protocol.onControlMessage(async raw => {
			const msg = <HandshakeMessage>JSON.parse(raw.toString());
			// Stop listening for further events
			messageRegistration.dispose();

			const error = getErrorFromMessage(msg);
			if (error) {
				return e(error);
			}

			if (msg.type === 'sign') {

				const signed = await options.signService.sign(msg.data);
				const connTypeRequest: ConnectionTypeRequest = {
					type: 'connectionType',
					commit: options.commit,
					signedData: signed,
					desiredConnectionType: connectionType
				};
				if (args) {
					connTypeRequest.args = args;
				}
				protocol.sendControl(VSBuffer.fromString(JSON.stringify(connTypeRequest)));
				c(protocol);
			} else {
				e(new Error('handshake error'));
			}
		});

		setTimeout(() => {
			e(new Error('handshake timeout'));
		}, 2000);

		// TODO@vs-remote: use real nonce here
		const authRequest: AuthRequest = {
			type: 'auth',
			auth: '00000000000000000000'
		};
		protocol.sendControl(VSBuffer.fromString(JSON.stringify(authRequest)));
	});
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
	env?: { [key: string]: string | null };
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
	commit: string | undefined;
	socketFactory: ISocketFactory;
	addressProvider: IAddressProvider;
	signService: ISignService;
}

async function resolveConnectionOptions(options: IConnectionOptions, reconnectionToken: string, reconnectionProtocol: PersistentProtocol | null): Promise<ISimpleConnectionOptions> {
	const { host, port } = await options.addressProvider.getAddress();
	return {
		commit: options.commit,
		host: host,
		port: port,
		reconnectionToken: reconnectionToken,
		reconnectionProtocol: reconnectionProtocol,
		socketFactory: options.socketFactory,
		signService: options.signService
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

function sleep(seconds: number): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		setTimeout(resolve, seconds * 1000);
	});
}

export const enum PersistentConnectionEventType {
	ConnectionLost,
	ReconnectionWait,
	ReconnectionRunning,
	ReconnectionPermanentFailure,
	ConnectionGain
}
export class ConnectionLostEvent {
	public readonly type = PersistentConnectionEventType.ConnectionLost;
}
export class ReconnectionWaitEvent {
	public readonly type = PersistentConnectionEventType.ReconnectionWait;
	constructor(
		public readonly durationSeconds: number
	) { }
}
export class ReconnectionRunningEvent {
	public readonly type = PersistentConnectionEventType.ReconnectionRunning;
}
export class ConnectionGainEvent {
	public readonly type = PersistentConnectionEventType.ConnectionGain;
}
export class ReconnectionPermanentFailureEvent {
	public readonly type = PersistentConnectionEventType.ReconnectionPermanentFailure;
}
export type PersistenConnectionEvent = ConnectionGainEvent | ConnectionLostEvent | ReconnectionWaitEvent | ReconnectionRunningEvent | ReconnectionPermanentFailureEvent;

abstract class PersistentConnection extends Disposable {

	private readonly _onDidStateChange = this._register(new Emitter<PersistenConnectionEvent>());
	public readonly onDidStateChange = this._onDidStateChange.event;

	protected readonly _options: IConnectionOptions;
	public readonly reconnectionToken: string;
	public readonly protocol: PersistentProtocol;

	private _isReconnecting: boolean;
	private _permanentFailure: boolean;

	constructor(options: IConnectionOptions, reconnectionToken: string, protocol: PersistentProtocol) {
		super();
		this._options = options;
		this.reconnectionToken = reconnectionToken;
		this.protocol = protocol;
		this._isReconnecting = false;
		this._permanentFailure = false;

		this._onDidStateChange.fire(new ConnectionGainEvent());

		this._register(protocol.onSocketClose(() => this._beginReconnecting()));
		this._register(protocol.onSocketTimeout(() => this._beginReconnecting()));
	}

	private async _beginReconnecting(): Promise<void> {
		// Only have one reconnection loop active at a time.
		if (this._isReconnecting) {
			return;
		}
		try {
			this._isReconnecting = true;
			await this._runReconnectingLoop();
		} finally {
			this._isReconnecting = false;
		}
	}

	private async _runReconnectingLoop(): Promise<void> {
		if (this._permanentFailure) {
			// no more attempts!
			return;
		}
		this._onDidStateChange.fire(new ConnectionLostEvent());
		const TIMES = [5, 5, 10, 10, 10, 10, 10, 30];
		const disconnectStartTime = Date.now();
		let attempt = -1;
		do {
			attempt++;
			const waitTime = (attempt < TIMES.length ? TIMES[attempt] : TIMES[TIMES.length - 1]);
			try {
				this._onDidStateChange.fire(new ReconnectionWaitEvent(waitTime));
				await sleep(waitTime);

				// connection was lost, let's try to re-establish it
				this._onDidStateChange.fire(new ReconnectionRunningEvent());
				const simpleOptions = await resolveConnectionOptions(this._options, this.reconnectionToken, this.protocol);
				await connectWithTimeLimit(this._reconnect(simpleOptions), 30 * 1000 /*30s*/);
				this._onDidStateChange.fire(new ConnectionGainEvent());

				break;
			} catch (err) {
				if (err.code === 'VSCODE_CONNECTION_ERROR') {
					console.error(`A permanent connection error occurred`);
					console.error(err);
					this._permanentFailure = true;
					this._onDidStateChange.fire(new ReconnectionPermanentFailureEvent());
					this.protocol.acceptDisconnect();
					break;
				}
				if (Date.now() - disconnectStartTime > ProtocolConstants.ReconnectionGraceTime) {
					console.error(`Giving up after reconnection grace time has expired!`);
					this._permanentFailure = true;
					this._onDidStateChange.fire(new ReconnectionPermanentFailureEvent());
					this.protocol.acceptDisconnect();
					break;
				}
				if (RemoteAuthorityResolverError.isTemporarilyNotAvailable(err)) {
					console.warn(`A temporarily not available error occured while trying to reconnect:`);
					console.warn(err);
					// try again!
					continue;
				}
				if ((err.code === 'ETIMEDOUT' || err.code === 'ENETUNREACH' || err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') && err.syscall === 'connect') {
					console.warn(`A connect error occured while trying to reconnect:`);
					console.warn(err);
					// try again!
					continue;
				}
				if (isPromiseCanceledError(err)) {
					console.warn(`A cancel error occured while trying to reconnect:`);
					console.warn(err);
					// try again!
					continue;
				}
				console.error(`An error occured while trying to reconnect:`);
				console.error(err);
				this._permanentFailure = true;
				this._onDidStateChange.fire(new ReconnectionPermanentFailureEvent());
				this.protocol.acceptDisconnect();
				break;
			}
		} while (!this._permanentFailure);
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

function connectWithTimeLimit(p: Promise<void>, timeLimit: number): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		let timeout = setTimeout(() => {
			const err: any = new Error('Time limit reached');
			err.code = 'ETIMEDOUT';
			err.syscall = 'connect';
			reject(err);
		}, timeLimit);
		p.then(() => {
			clearTimeout(timeout);
			resolve();
		}, (err) => {
			clearTimeout(timeout);
			reject(err);
		});
	});
}

function getErrorFromMessage(msg: any): Error | null {
	if (msg && msg.type === 'error') {
		const error = new Error(`Connection error: ${msg.reason}`);
		(<any>error).code = 'VSCODE_CONNECTION_ERROR';
		return error;
	}
	return null;
}
