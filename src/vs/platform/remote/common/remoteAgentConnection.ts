/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Client, PersistentProtocol, ISocket, ProtocolConstants } from 'vs/base/parts/ipc/common/ipc.net';
import { generateUuid } from 'vs/base/common/uuid';
import { RemoteAgentConnectionContext } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { VSBuffer } from 'vs/base/common/buffer';
import { Emitter } from 'vs/base/common/event';
import { RemoteAuthorityResolverError } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { isPromiseCanceledError, onUnexpectedError } from 'vs/base/common/errors';
import { ISignService } from 'vs/platform/sign/common/sign';
import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { ILogService } from 'vs/platform/log/common/log';
import { IIPCLogger } from 'vs/base/parts/ipc/common/ipc';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';

const RECONNECT_TIMEOUT = 30 * 1000 /* 30s */;

export const enum ConnectionType {
	Management = 1,
	ExtensionHost = 2,
	Tunnel = 3,
}

function connectionTypeToString(connectionType: ConnectionType): string {
	switch (connectionType) {
		case ConnectionType.Management:
			return 'Management';
		case ConnectionType.ExtensionHost:
			return 'ExtensionHost';
		case ConnectionType.Tunnel:
			return 'Tunnel';
	}
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
	connectionToken: string | undefined;
	reconnectionToken: string;
	reconnectionProtocol: PersistentProtocol | null;
	socketFactory: ISocketFactory;
	signService: ISignService;
	logService: ILogService;
}

export interface IConnectCallback {
	(err: any | undefined, socket: ISocket | undefined): void;
}

export interface ISocketFactory {
	connect(host: string, port: number, query: string, callback: IConnectCallback): void;
}

function createTimeoutCancellation(millis: number): CancellationToken {
	const source = new CancellationTokenSource();
	setTimeout(() => source.cancel(), millis);
	return source.token;
}

function combineTimeoutCancellation(a: CancellationToken, b: CancellationToken): CancellationToken {
	if (a.isCancellationRequested || b.isCancellationRequested) {
		return CancellationToken.Cancelled;
	}
	const source = new CancellationTokenSource();
	a.onCancellationRequested(() => source.cancel());
	b.onCancellationRequested(() => source.cancel());
	return source.token;
}

class PromiseWithTimeout<T> {

	private _state: 'pending' | 'resolved' | 'rejected' | 'timedout';
	private readonly _disposables: DisposableStore;
	public readonly promise: Promise<T>;
	private _resolvePromise!: (value: T) => void;
	private _rejectPromise!: (err: any) => void;

	public get didTimeout(): boolean {
		return (this._state === 'timedout');
	}

	constructor(timeoutCancellationToken: CancellationToken) {
		this._state = 'pending';
		this._disposables = new DisposableStore();
		this.promise = new Promise<T>((resolve, reject) => {
			this._resolvePromise = resolve;
			this._rejectPromise = reject;
		});

		if (timeoutCancellationToken.isCancellationRequested) {
			this._timeout();
		} else {
			this._disposables.add(timeoutCancellationToken.onCancellationRequested(() => this._timeout()));
		}
	}

	public registerDisposable(disposable: IDisposable): void {
		if (this._state === 'pending') {
			this._disposables.add(disposable);
		} else {
			disposable.dispose();
		}
	}

	private _timeout(): void {
		if (this._state !== 'pending') {
			return;
		}
		this._disposables.dispose();
		this._state = 'timedout';
		this._rejectPromise(this._createTimeoutError());
	}

	private _createTimeoutError(): Error {
		const err: any = new Error('Time limit reached');
		err.code = 'ETIMEDOUT';
		err.syscall = 'connect';
		return err;
	}

	public resolve(value: T): void {
		if (this._state !== 'pending') {
			return;
		}
		this._disposables.dispose();
		this._state = 'resolved';
		this._resolvePromise(value);
	}

	public reject(err: any): void {
		if (this._state !== 'pending') {
			return;
		}
		this._disposables.dispose();
		this._state = 'rejected';
		this._rejectPromise(err);
	}
}

function readOneControlMessage<T>(protocol: PersistentProtocol, timeoutCancellationToken: CancellationToken): Promise<T> {
	const result = new PromiseWithTimeout<T>(timeoutCancellationToken);
	result.registerDisposable(protocol.onControlMessage(raw => {
		const msg: T = JSON.parse(raw.toString());
		const error = getErrorFromMessage(msg);
		if (error) {
			result.reject(error);
		} else {
			result.resolve(msg);
		}
	}));
	return result.promise;
}

function createSocket(logService: ILogService, socketFactory: ISocketFactory, host: string, port: number, query: string, timeoutCancellationToken: CancellationToken): Promise<ISocket> {
	const result = new PromiseWithTimeout<ISocket>(timeoutCancellationToken);
	socketFactory.connect(host, port, query, (err: any, socket: ISocket | undefined) => {
		if (result.didTimeout) {
			if (err) {
				logService.error(err);
			}
			socket?.dispose();
		} else {
			if (err || !socket) {
				result.reject(err);
			} else {
				result.resolve(socket);
			}
		}
	});
	return result.promise;
}

function raceWithTimeoutCancellation<T>(promise: Promise<T>, timeoutCancellationToken: CancellationToken): Promise<T> {
	const result = new PromiseWithTimeout<T>(timeoutCancellationToken);
	promise.then(
		(res) => {
			if (!result.didTimeout) {
				result.resolve(res);
			}
		},
		(err) => {
			if (!result.didTimeout) {
				result.reject(err);
			}
		}
	);
	return result.promise;
}

async function connectToRemoteExtensionHostAgent(options: ISimpleConnectionOptions, connectionType: ConnectionType, args: any | undefined, timeoutCancellationToken: CancellationToken): Promise<{ protocol: PersistentProtocol; ownsProtocol: boolean; }> {
	const logPrefix = connectLogPrefix(options, connectionType);

	options.logService.trace(`${logPrefix} 1/6. invoking socketFactory.connect().`);

	let socket: ISocket;
	try {
		socket = await createSocket(options.logService, options.socketFactory, options.host, options.port, `reconnectionToken=${options.reconnectionToken}&reconnection=${options.reconnectionProtocol ? 'true' : 'false'}`, timeoutCancellationToken);
	} catch (error) {
		options.logService.error(`${logPrefix} socketFactory.connect() failed or timed out. Error:`);
		options.logService.error(error);
		throw error;
	}

	options.logService.trace(`${logPrefix} 2/6. socketFactory.connect() was successful.`);

	let protocol: PersistentProtocol;
	let ownsProtocol: boolean;
	if (options.reconnectionProtocol) {
		options.reconnectionProtocol.beginAcceptReconnection(socket, null);
		protocol = options.reconnectionProtocol;
		ownsProtocol = false;
	} else {
		protocol = new PersistentProtocol(socket, null);
		ownsProtocol = true;
	}

	options.logService.trace(`${logPrefix} 3/6. sending AuthRequest control message.`);
	const authRequest: AuthRequest = {
		type: 'auth',
		auth: options.connectionToken || '00000000000000000000'
	};
	protocol.sendControl(VSBuffer.fromString(JSON.stringify(authRequest)));

	try {
		const msg = await readOneControlMessage<HandshakeMessage>(protocol, combineTimeoutCancellation(timeoutCancellationToken, createTimeoutCancellation(10000)));

		if (msg.type !== 'sign' || typeof msg.data !== 'string') {
			const error: any = new Error('Unexpected handshake message');
			error.code = 'VSCODE_CONNECTION_ERROR';
			throw error;
		}

		options.logService.trace(`${logPrefix} 4/6. received SignRequest control message.`);

		const signed = await raceWithTimeoutCancellation(options.signService.sign(msg.data), timeoutCancellationToken);
		const connTypeRequest: ConnectionTypeRequest = {
			type: 'connectionType',
			commit: options.commit,
			signedData: signed,
			desiredConnectionType: connectionType
		};
		if (args) {
			connTypeRequest.args = args;
		}

		options.logService.trace(`${logPrefix} 5/6. sending ConnectionTypeRequest control message.`);
		protocol.sendControl(VSBuffer.fromString(JSON.stringify(connTypeRequest)));

		return { protocol, ownsProtocol };

	} catch (error) {
		if (error && error.code === 'ETIMEDOUT') {
			options.logService.error(`${logPrefix} the handshake timed out. Error:`);
			options.logService.error(error);
		}
		if (error && error.code === 'VSCODE_CONNECTION_ERROR') {
			options.logService.error(`${logPrefix} received error control message when negotiating connection. Error:`);
			options.logService.error(error);
		}
		if (ownsProtocol) {
			safeDisposeProtocolAndSocket(protocol);
		}
		throw error;
	}
}

interface IManagementConnectionResult {
	protocol: PersistentProtocol;
}

async function connectToRemoteExtensionHostAgentAndReadOneMessage<T>(options: ISimpleConnectionOptions, connectionType: ConnectionType, args: any | undefined, timeoutCancellationToken: CancellationToken): Promise<{ protocol: PersistentProtocol; firstMessage: T; }> {
	const startTime = Date.now();
	const logPrefix = connectLogPrefix(options, connectionType);
	const { protocol, ownsProtocol } = await connectToRemoteExtensionHostAgent(options, connectionType, args, timeoutCancellationToken);
	const result = new PromiseWithTimeout<{ protocol: PersistentProtocol; firstMessage: T; }>(timeoutCancellationToken);
	result.registerDisposable(protocol.onControlMessage(raw => {
		const msg: T = JSON.parse(raw.toString());
		const error = getErrorFromMessage(msg);
		if (error) {
			options.logService.error(`${logPrefix} received error control message when negotiating connection. Error:`);
			options.logService.error(error);
			if (ownsProtocol) {
				safeDisposeProtocolAndSocket(protocol);
			}
			result.reject(error);
		} else {
			if (options.reconnectionProtocol) {
				options.reconnectionProtocol.endAcceptReconnection();
			}
			options.logService.trace(`${logPrefix} 6/6. handshake finished, connection is up and running after ${logElapsed(startTime)}!`);
			result.resolve({ protocol, firstMessage: msg });
		}
	}));
	return result.promise;
}

async function doConnectRemoteAgentManagement(options: ISimpleConnectionOptions, timeoutCancellationToken: CancellationToken): Promise<IManagementConnectionResult> {
	const { protocol } = await connectToRemoteExtensionHostAgentAndReadOneMessage(options, ConnectionType.Management, undefined, timeoutCancellationToken);
	return { protocol };
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

async function doConnectRemoteAgentExtensionHost(options: ISimpleConnectionOptions, startArguments: IRemoteExtensionHostStartParams, timeoutCancellationToken: CancellationToken): Promise<IExtensionHostConnectionResult> {
	const { protocol, firstMessage } = await connectToRemoteExtensionHostAgentAndReadOneMessage<{ debugPort?: number; }>(options, ConnectionType.ExtensionHost, startArguments, timeoutCancellationToken);
	const debugPort = firstMessage && firstMessage.debugPort;
	return { protocol, debugPort };
}

export interface ITunnelConnectionStartParams {
	port: number;
}

async function doConnectRemoteAgentTunnel(options: ISimpleConnectionOptions, startParams: ITunnelConnectionStartParams, timeoutCancellationToken: CancellationToken): Promise<PersistentProtocol> {
	const startTime = Date.now();
	const logPrefix = connectLogPrefix(options, ConnectionType.Tunnel);
	const { protocol } = await connectToRemoteExtensionHostAgent(options, ConnectionType.Tunnel, startParams, timeoutCancellationToken);
	options.logService.trace(`${logPrefix} 6/6. handshake finished, connection is up and running after ${logElapsed(startTime)}!`);
	return protocol;
}

export interface IConnectionOptions {
	commit: string | undefined;
	socketFactory: ISocketFactory;
	addressProvider: IAddressProvider;
	signService: ISignService;
	logService: ILogService;
	ipcLogger: IIPCLogger | null;
}

async function resolveConnectionOptions(options: IConnectionOptions, reconnectionToken: string, reconnectionProtocol: PersistentProtocol | null): Promise<ISimpleConnectionOptions> {
	const { host, port, connectionToken } = await options.addressProvider.getAddress();
	return {
		commit: options.commit,
		host: host,
		port: port,
		connectionToken: connectionToken,
		reconnectionToken: reconnectionToken,
		reconnectionProtocol: reconnectionProtocol,
		socketFactory: options.socketFactory,
		signService: options.signService,
		logService: options.logService
	};
}

export interface IAddress {
	host: string;
	port: number;
	connectionToken: string | undefined;
}

export interface IAddressProvider {
	getAddress(): Promise<IAddress>;
}

export async function connectRemoteAgentManagement(options: IConnectionOptions, remoteAuthority: string, clientId: string): Promise<ManagementPersistentConnection> {
	try {
		const reconnectionToken = generateUuid();
		const simpleOptions = await resolveConnectionOptions(options, reconnectionToken, null);
		const { protocol } = await doConnectRemoteAgentManagement(simpleOptions, CancellationToken.None);
		return new ManagementPersistentConnection(options, remoteAuthority, clientId, reconnectionToken, protocol);
	} catch (err) {
		options.logService.error(`[remote-connection] An error occurred in the very first connect attempt, it will be treated as a permanent error! Error:`);
		options.logService.error(err);
		PersistentConnection.triggerPermanentFailure(0, 0, RemoteAuthorityResolverError.isHandled(err));
		throw err;
	}
}

export async function connectRemoteAgentExtensionHost(options: IConnectionOptions, startArguments: IRemoteExtensionHostStartParams): Promise<ExtensionHostPersistentConnection> {
	try {
		const reconnectionToken = generateUuid();
		const simpleOptions = await resolveConnectionOptions(options, reconnectionToken, null);
		const { protocol, debugPort } = await doConnectRemoteAgentExtensionHost(simpleOptions, startArguments, CancellationToken.None);
		return new ExtensionHostPersistentConnection(options, startArguments, reconnectionToken, protocol, debugPort);
	} catch (err) {
		options.logService.error(`[remote-connection] An error occurred in the very first connect attempt, it will be treated as a permanent error! Error:`);
		options.logService.error(err);
		PersistentConnection.triggerPermanentFailure(0, 0, RemoteAuthorityResolverError.isHandled(err));
		throw err;
	}
}

export async function connectRemoteAgentTunnel(options: IConnectionOptions, tunnelRemotePort: number): Promise<PersistentProtocol> {
	const simpleOptions = await resolveConnectionOptions(options, generateUuid(), null);
	const protocol = await doConnectRemoteAgentTunnel(simpleOptions, { port: tunnelRemotePort }, CancellationToken.None);
	return protocol;
}

function sleep(seconds: number): CancelablePromise<void> {
	return createCancelablePromise(token => {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(resolve, seconds * 1000);
			token.onCancellationRequested(() => {
				clearTimeout(timeout);
				resolve();
			});
		});
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
	constructor(
		public readonly reconnectionToken: string,
		public readonly millisSinceLastIncomingData: number
	) { }
}
export class ReconnectionWaitEvent {
	public readonly type = PersistentConnectionEventType.ReconnectionWait;
	constructor(
		public readonly reconnectionToken: string,
		public readonly millisSinceLastIncomingData: number,
		public readonly durationSeconds: number,
		private readonly cancellableTimer: CancelablePromise<void>
	) { }

	public skipWait(): void {
		this.cancellableTimer.cancel();
	}
}
export class ReconnectionRunningEvent {
	public readonly type = PersistentConnectionEventType.ReconnectionRunning;
	constructor(
		public readonly reconnectionToken: string,
		public readonly millisSinceLastIncomingData: number,
		public readonly attempt: number
	) { }
}
export class ConnectionGainEvent {
	public readonly type = PersistentConnectionEventType.ConnectionGain;
	constructor(
		public readonly reconnectionToken: string,
		public readonly millisSinceLastIncomingData: number,
		public readonly attempt: number
	) { }
}
export class ReconnectionPermanentFailureEvent {
	public readonly type = PersistentConnectionEventType.ReconnectionPermanentFailure;
	constructor(
		public readonly reconnectionToken: string,
		public readonly millisSinceLastIncomingData: number,
		public readonly attempt: number,
		public readonly handled: boolean
	) { }
}
export type PersistentConnectionEvent = ConnectionGainEvent | ConnectionLostEvent | ReconnectionWaitEvent | ReconnectionRunningEvent | ReconnectionPermanentFailureEvent;

abstract class PersistentConnection extends Disposable {

	public static triggerPermanentFailure(millisSinceLastIncomingData: number, attempt: number, handled: boolean): void {
		this._permanentFailure = true;
		this._permanentFailureMillisSinceLastIncomingData = millisSinceLastIncomingData;
		this._permanentFailureAttempt = attempt;
		this._permanentFailureHandled = handled;
		this._instances.forEach(instance => instance._gotoPermanentFailure(this._permanentFailureMillisSinceLastIncomingData, this._permanentFailureAttempt, this._permanentFailureHandled));
	}
	private static _permanentFailure: boolean = false;
	private static _permanentFailureMillisSinceLastIncomingData: number = 0;
	private static _permanentFailureAttempt: number = 0;
	private static _permanentFailureHandled: boolean = false;
	private static _instances: PersistentConnection[] = [];

	private readonly _onDidStateChange = this._register(new Emitter<PersistentConnectionEvent>());
	public readonly onDidStateChange = this._onDidStateChange.event;

	protected readonly _options: IConnectionOptions;
	public readonly reconnectionToken: string;
	public readonly protocol: PersistentProtocol;

	private _isReconnecting: boolean;

	constructor(private readonly _connectionType: ConnectionType, options: IConnectionOptions, reconnectionToken: string, protocol: PersistentProtocol) {
		super();
		this._options = options;
		this.reconnectionToken = reconnectionToken;
		this.protocol = protocol;
		this._isReconnecting = false;

		this._onDidStateChange.fire(new ConnectionGainEvent(this.reconnectionToken, 0, 0));

		this._register(protocol.onSocketClose(() => this._beginReconnecting()));
		this._register(protocol.onSocketTimeout(() => this._beginReconnecting()));

		PersistentConnection._instances.push(this);

		if (PersistentConnection._permanentFailure) {
			this._gotoPermanentFailure(PersistentConnection._permanentFailureMillisSinceLastIncomingData, PersistentConnection._permanentFailureAttempt, PersistentConnection._permanentFailureHandled);
		}
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
		if (PersistentConnection._permanentFailure) {
			// no more attempts!
			return;
		}
		const logPrefix = commonLogPrefix(this._connectionType, this.reconnectionToken, true);
		this._options.logService.info(`${logPrefix} starting reconnecting loop. You can get more information with the trace log level.`);
		this._onDidStateChange.fire(new ConnectionLostEvent(this.reconnectionToken, this.protocol.getMillisSinceLastIncomingData()));
		const TIMES = [0, 5, 5, 10, 10, 10, 10, 10, 30];
		const disconnectStartTime = Date.now();
		let attempt = -1;
		do {
			attempt++;
			const waitTime = (attempt < TIMES.length ? TIMES[attempt] : TIMES[TIMES.length - 1]);
			try {
				if (waitTime > 0) {
					const sleepPromise = sleep(waitTime);
					this._onDidStateChange.fire(new ReconnectionWaitEvent(this.reconnectionToken, this.protocol.getMillisSinceLastIncomingData(), waitTime, sleepPromise));

					this._options.logService.info(`${logPrefix} waiting for ${waitTime} seconds before reconnecting...`);
					try {
						await sleepPromise;
					} catch { } // User canceled timer
				}

				if (PersistentConnection._permanentFailure) {
					this._options.logService.error(`${logPrefix} permanent failure occurred while running the reconnecting loop.`);
					break;
				}

				// connection was lost, let's try to re-establish it
				this._onDidStateChange.fire(new ReconnectionRunningEvent(this.reconnectionToken, this.protocol.getMillisSinceLastIncomingData(), attempt + 1));
				this._options.logService.info(`${logPrefix} resolving connection...`);
				const simpleOptions = await resolveConnectionOptions(this._options, this.reconnectionToken, this.protocol);
				this._options.logService.info(`${logPrefix} connecting to ${simpleOptions.host}:${simpleOptions.port}...`);
				await this._reconnect(simpleOptions, createTimeoutCancellation(RECONNECT_TIMEOUT));
				this._options.logService.info(`${logPrefix} reconnected!`);
				this._onDidStateChange.fire(new ConnectionGainEvent(this.reconnectionToken, this.protocol.getMillisSinceLastIncomingData(), attempt + 1));

				break;
			} catch (err) {
				if (err.code === 'VSCODE_CONNECTION_ERROR') {
					this._options.logService.error(`${logPrefix} A permanent error occurred in the reconnecting loop! Will give up now! Error:`);
					this._options.logService.error(err);
					PersistentConnection.triggerPermanentFailure(this.protocol.getMillisSinceLastIncomingData(), attempt + 1, false);
					break;
				}
				if (Date.now() - disconnectStartTime > ProtocolConstants.ReconnectionGraceTime) {
					this._options.logService.error(`${logPrefix} An error occurred while reconnecting, but it will be treated as a permanent error because the reconnection grace time has expired! Will give up now! Error:`);
					this._options.logService.error(err);
					PersistentConnection.triggerPermanentFailure(this.protocol.getMillisSinceLastIncomingData(), attempt + 1, false);
					break;
				}
				if (RemoteAuthorityResolverError.isTemporarilyNotAvailable(err)) {
					this._options.logService.info(`${logPrefix} A temporarily not available error occurred while trying to reconnect, will try again...`);
					this._options.logService.trace(err);
					// try again!
					continue;
				}
				if ((err.code === 'ETIMEDOUT' || err.code === 'ENETUNREACH' || err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') && err.syscall === 'connect') {
					this._options.logService.info(`${logPrefix} A network error occurred while trying to reconnect, will try again...`);
					this._options.logService.trace(err);
					// try again!
					continue;
				}
				if (isPromiseCanceledError(err)) {
					this._options.logService.info(`${logPrefix} A promise cancelation error occurred while trying to reconnect, will try again...`);
					this._options.logService.trace(err);
					// try again!
					continue;
				}
				if (err instanceof RemoteAuthorityResolverError) {
					this._options.logService.error(`${logPrefix} A RemoteAuthorityResolverError occurred while trying to reconnect. Will give up now! Error:`);
					this._options.logService.error(err);
					PersistentConnection.triggerPermanentFailure(this.protocol.getMillisSinceLastIncomingData(), attempt + 1, RemoteAuthorityResolverError.isHandled(err));
					break;
				}
				this._options.logService.error(`${logPrefix} An unknown error occurred while trying to reconnect, since this is an unknown case, it will be treated as a permanent error! Will give up now! Error:`);
				this._options.logService.error(err);
				PersistentConnection.triggerPermanentFailure(this.protocol.getMillisSinceLastIncomingData(), attempt + 1, false);
				break;
			}
		} while (!PersistentConnection._permanentFailure);
	}

	private _gotoPermanentFailure(millisSinceLastIncomingData: number, attempt: number, handled: boolean): void {
		this._onDidStateChange.fire(new ReconnectionPermanentFailureEvent(this.reconnectionToken, millisSinceLastIncomingData, attempt, handled));
		safeDisposeProtocolAndSocket(this.protocol);
	}

	protected abstract _reconnect(options: ISimpleConnectionOptions, timeoutCancellationToken: CancellationToken): Promise<void>;
}

export class ManagementPersistentConnection extends PersistentConnection {

	public readonly client: Client<RemoteAgentConnectionContext>;

	constructor(options: IConnectionOptions, remoteAuthority: string, clientId: string, reconnectionToken: string, protocol: PersistentProtocol) {
		super(ConnectionType.Management, options, reconnectionToken, protocol);
		this.client = this._register(new Client<RemoteAgentConnectionContext>(protocol, {
			remoteAuthority: remoteAuthority,
			clientId: clientId
		}, options.ipcLogger));
	}

	protected async _reconnect(options: ISimpleConnectionOptions, timeoutCancellationToken: CancellationToken): Promise<void> {
		await doConnectRemoteAgentManagement(options, timeoutCancellationToken);
	}
}

export class ExtensionHostPersistentConnection extends PersistentConnection {

	private readonly _startArguments: IRemoteExtensionHostStartParams;
	public readonly debugPort: number | undefined;

	constructor(options: IConnectionOptions, startArguments: IRemoteExtensionHostStartParams, reconnectionToken: string, protocol: PersistentProtocol, debugPort: number | undefined) {
		super(ConnectionType.ExtensionHost, options, reconnectionToken, protocol);
		this._startArguments = startArguments;
		this.debugPort = debugPort;
	}

	protected async _reconnect(options: ISimpleConnectionOptions, timeoutCancellationToken: CancellationToken): Promise<void> {
		await doConnectRemoteAgentExtensionHost(options, this._startArguments, timeoutCancellationToken);
	}
}

function safeDisposeProtocolAndSocket(protocol: PersistentProtocol): void {
	try {
		protocol.acceptDisconnect();
		const socket = protocol.getSocket();
		protocol.dispose();
		socket.dispose();
	} catch (err) {
		onUnexpectedError(err);
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

function stringRightPad(str: string, len: number): string {
	while (str.length < len) {
		str += ' ';
	}
	return str;
}

function commonLogPrefix(connectionType: ConnectionType, reconnectionToken: string, isReconnect: boolean): string {
	return `[remote-connection][${stringRightPad(connectionTypeToString(connectionType), 13)}][${reconnectionToken.substr(0, 5)}…][${isReconnect ? 'reconnect' : 'initial'}]`;
}

function connectLogPrefix(options: ISimpleConnectionOptions, connectionType: ConnectionType): string {
	return `${commonLogPrefix(connectionType, options.reconnectionToken, !!options.reconnectionProtocol)}[${options.host}:${options.port}]`;
}

function logElapsed(startTime: number): string {
	return `${Date.now() - startTime} ms`;
}
