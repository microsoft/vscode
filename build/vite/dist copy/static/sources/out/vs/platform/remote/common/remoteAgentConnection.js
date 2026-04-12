/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createCancelablePromise, promiseWithResolvers } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { isCancellationError, onUnexpectedError } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { RemoteAuthorities } from '../../../base/common/network.js';
import * as performance from '../../../base/common/performance.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { Client, PersistentProtocol } from '../../../base/parts/ipc/common/ipc.net.js';
import { RemoteAuthorityResolverError } from './remoteAuthorityResolver.js';
const RECONNECT_TIMEOUT = 30 * 1000 /* 30s */;
export var ConnectionType;
(function (ConnectionType) {
    ConnectionType[ConnectionType["Management"] = 1] = "Management";
    ConnectionType[ConnectionType["ExtensionHost"] = 2] = "ExtensionHost";
    ConnectionType[ConnectionType["Tunnel"] = 3] = "Tunnel";
})(ConnectionType || (ConnectionType = {}));
function connectionTypeToString(connectionType) {
    switch (connectionType) {
        case 1 /* ConnectionType.Management */:
            return 'Management';
        case 2 /* ConnectionType.ExtensionHost */:
            return 'ExtensionHost';
        case 3 /* ConnectionType.Tunnel */:
            return 'Tunnel';
    }
}
function createTimeoutCancellation(millis) {
    const source = new CancellationTokenSource();
    setTimeout(() => source.cancel(), millis);
    return source.token;
}
function combineTimeoutCancellation(a, b) {
    if (a.isCancellationRequested || b.isCancellationRequested) {
        return CancellationToken.Cancelled;
    }
    const source = new CancellationTokenSource();
    a.onCancellationRequested(() => source.cancel());
    b.onCancellationRequested(() => source.cancel());
    return source.token;
}
class PromiseWithTimeout {
    get didTimeout() {
        return (this._state === 'timedout');
    }
    constructor(timeoutCancellationToken) {
        this._state = 'pending';
        this._disposables = new DisposableStore();
        ({ promise: this.promise, resolve: this._resolvePromise, reject: this._rejectPromise } = promiseWithResolvers());
        if (timeoutCancellationToken.isCancellationRequested) {
            this._timeout();
        }
        else {
            this._disposables.add(timeoutCancellationToken.onCancellationRequested(() => this._timeout()));
        }
    }
    registerDisposable(disposable) {
        if (this._state === 'pending') {
            this._disposables.add(disposable);
        }
        else {
            disposable.dispose();
        }
    }
    _timeout() {
        if (this._state !== 'pending') {
            return;
        }
        this._disposables.dispose();
        this._state = 'timedout';
        this._rejectPromise(this._createTimeoutError());
    }
    _createTimeoutError() {
        const err = new Error('Time limit reached');
        err.code = 'ETIMEDOUT';
        err.syscall = 'connect';
        return err;
    }
    resolve(value) {
        if (this._state !== 'pending') {
            return;
        }
        this._disposables.dispose();
        this._state = 'resolved';
        this._resolvePromise(value);
    }
    reject(err) {
        if (this._state !== 'pending') {
            return;
        }
        this._disposables.dispose();
        this._state = 'rejected';
        this._rejectPromise(err);
    }
}
function readOneControlMessage(protocol, timeoutCancellationToken) {
    const result = new PromiseWithTimeout(timeoutCancellationToken);
    result.registerDisposable(protocol.onControlMessage(raw => {
        const msg = JSON.parse(raw.toString());
        const error = getErrorFromMessage(msg);
        if (error) {
            result.reject(error);
        }
        else {
            result.resolve(msg);
        }
    }));
    return result.promise;
}
function createSocket(logService, remoteSocketFactoryService, connectTo, path, query, debugConnectionType, debugLabel, timeoutCancellationToken) {
    const result = new PromiseWithTimeout(timeoutCancellationToken);
    const sw = StopWatch.create(false);
    logService.info(`Creating a socket (${debugLabel})...`);
    performance.mark(`code/willCreateSocket/${debugConnectionType}`);
    remoteSocketFactoryService.connect(connectTo, path, query, debugLabel).then((socket) => {
        if (result.didTimeout) {
            performance.mark(`code/didCreateSocketError/${debugConnectionType}`);
            logService.info(`Creating a socket (${debugLabel}) finished after ${sw.elapsed()} ms, but this is too late and has timed out already.`);
            socket?.dispose();
        }
        else {
            performance.mark(`code/didCreateSocketOK/${debugConnectionType}`);
            logService.info(`Creating a socket (${debugLabel}) was successful after ${sw.elapsed()} ms.`);
            result.resolve(socket);
        }
    }, (err) => {
        performance.mark(`code/didCreateSocketError/${debugConnectionType}`);
        logService.info(`Creating a socket (${debugLabel}) returned an error after ${sw.elapsed()} ms.`);
        logService.error(err);
        result.reject(err);
    });
    return result.promise;
}
function raceWithTimeoutCancellation(promise, timeoutCancellationToken) {
    const result = new PromiseWithTimeout(timeoutCancellationToken);
    promise.then((res) => {
        if (!result.didTimeout) {
            result.resolve(res);
        }
    }, (err) => {
        if (!result.didTimeout) {
            result.reject(err);
        }
    });
    return result.promise;
}
async function connectToRemoteExtensionHostAgent(options, connectionType, args, timeoutCancellationToken) {
    const logPrefix = connectLogPrefix(options, connectionType);
    options.logService.trace(`${logPrefix} 1/6. invoking socketFactory.connect().`);
    let socket;
    try {
        socket = await createSocket(options.logService, options.remoteSocketFactoryService, options.connectTo, RemoteAuthorities.getServerRootPath(), `reconnectionToken=${options.reconnectionToken}&reconnection=${options.reconnectionProtocol ? 'true' : 'false'}`, connectionTypeToString(connectionType), `renderer-${connectionTypeToString(connectionType)}-${options.reconnectionToken}`, timeoutCancellationToken);
    }
    catch (error) {
        options.logService.error(`${logPrefix} socketFactory.connect() failed or timed out. Error:`);
        options.logService.error(error);
        throw error;
    }
    options.logService.trace(`${logPrefix} 2/6. socketFactory.connect() was successful.`);
    let protocol;
    let ownsProtocol;
    if (options.reconnectionProtocol) {
        options.reconnectionProtocol.beginAcceptReconnection(socket, null);
        protocol = options.reconnectionProtocol;
        ownsProtocol = false;
    }
    else {
        protocol = new PersistentProtocol({ socket });
        ownsProtocol = true;
    }
    options.logService.trace(`${logPrefix} 3/6. sending AuthRequest control message.`);
    const message = await raceWithTimeoutCancellation(options.signService.createNewMessage(generateUuid()), timeoutCancellationToken);
    const authRequest = {
        type: 'auth',
        auth: options.connectionToken || '00000000000000000000',
        data: message.data
    };
    protocol.sendControl(VSBuffer.fromString(JSON.stringify(authRequest)));
    try {
        const msg = await readOneControlMessage(protocol, combineTimeoutCancellation(timeoutCancellationToken, createTimeoutCancellation(10000)));
        if (msg.type !== 'sign' || typeof msg.data !== 'string') {
            const error = new Error('Unexpected handshake message');
            error.code = 'VSCODE_CONNECTION_ERROR';
            throw error;
        }
        options.logService.trace(`${logPrefix} 4/6. received SignRequest control message.`);
        const isValid = await raceWithTimeoutCancellation(options.signService.validate(message, msg.signedData), timeoutCancellationToken);
        if (!isValid) {
            const error = new Error('Refused to connect to unsupported server');
            error.code = 'VSCODE_CONNECTION_ERROR';
            throw error;
        }
        const signed = await raceWithTimeoutCancellation(options.signService.sign(msg.data), timeoutCancellationToken);
        const connTypeRequest = {
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
    }
    catch (error) {
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
async function connectToRemoteExtensionHostAgentAndReadOneMessage(options, connectionType, args, timeoutCancellationToken) {
    const startTime = Date.now();
    const logPrefix = connectLogPrefix(options, connectionType);
    const { protocol, ownsProtocol } = await connectToRemoteExtensionHostAgent(options, connectionType, args, timeoutCancellationToken);
    const result = new PromiseWithTimeout(timeoutCancellationToken);
    result.registerDisposable(protocol.onControlMessage(raw => {
        const msg = JSON.parse(raw.toString());
        const error = getErrorFromMessage(msg);
        if (error) {
            options.logService.error(`${logPrefix} received error control message when negotiating connection. Error:`);
            options.logService.error(error);
            if (ownsProtocol) {
                safeDisposeProtocolAndSocket(protocol);
            }
            result.reject(error);
        }
        else {
            options.reconnectionProtocol?.endAcceptReconnection();
            options.logService.trace(`${logPrefix} 6/6. handshake finished, connection is up and running after ${logElapsed(startTime)}!`);
            result.resolve({ protocol, firstMessage: msg });
        }
    }));
    return result.promise;
}
async function doConnectRemoteAgentManagement(options, timeoutCancellationToken) {
    const { protocol } = await connectToRemoteExtensionHostAgentAndReadOneMessage(options, 1 /* ConnectionType.Management */, undefined, timeoutCancellationToken);
    return { protocol };
}
async function doConnectRemoteAgentExtensionHost(options, startArguments, timeoutCancellationToken) {
    const { protocol, firstMessage } = await connectToRemoteExtensionHostAgentAndReadOneMessage(options, 2 /* ConnectionType.ExtensionHost */, startArguments, timeoutCancellationToken);
    const debugPort = firstMessage && firstMessage.debugPort;
    return { protocol, debugPort };
}
async function doConnectRemoteAgentTunnel(options, startParams, timeoutCancellationToken) {
    const startTime = Date.now();
    const logPrefix = connectLogPrefix(options, 3 /* ConnectionType.Tunnel */);
    const { protocol } = await connectToRemoteExtensionHostAgent(options, 3 /* ConnectionType.Tunnel */, startParams, timeoutCancellationToken);
    options.logService.trace(`${logPrefix} 6/6. handshake finished, connection is up and running after ${logElapsed(startTime)}!`);
    return protocol;
}
async function resolveConnectionOptions(options, reconnectionToken, reconnectionProtocol) {
    const { connectTo, connectionToken } = await options.addressProvider.getAddress();
    return {
        commit: options.commit,
        quality: options.quality,
        connectTo,
        connectionToken: connectionToken,
        reconnectionToken: reconnectionToken,
        reconnectionProtocol: reconnectionProtocol,
        remoteSocketFactoryService: options.remoteSocketFactoryService,
        signService: options.signService,
        logService: options.logService
    };
}
export async function connectRemoteAgentManagement(options, remoteAuthority, clientId) {
    return createInitialConnection(options, async (simpleOptions) => {
        const { protocol } = await doConnectRemoteAgentManagement(simpleOptions, CancellationToken.None);
        return new ManagementPersistentConnection(options, remoteAuthority, clientId, simpleOptions.reconnectionToken, protocol);
    });
}
export async function connectRemoteAgentExtensionHost(options, startArguments) {
    return createInitialConnection(options, async (simpleOptions) => {
        const { protocol, debugPort } = await doConnectRemoteAgentExtensionHost(simpleOptions, startArguments, CancellationToken.None);
        return new ExtensionHostPersistentConnection(options, startArguments, simpleOptions.reconnectionToken, protocol, debugPort);
    });
}
/**
 * Will attempt to connect 5 times. If it fails 5 consecutive times, it will give up.
 */
async function createInitialConnection(options, connectionFactory) {
    const MAX_ATTEMPTS = 5;
    for (let attempt = 1;; attempt++) {
        try {
            const reconnectionToken = generateUuid();
            const simpleOptions = await resolveConnectionOptions(options, reconnectionToken, null);
            const result = await connectionFactory(simpleOptions);
            return result;
        }
        catch (err) {
            if (attempt < MAX_ATTEMPTS) {
                options.logService.error(`[remote-connection][attempt ${attempt}] An error occurred in initial connection! Will retry... Error:`);
                options.logService.error(err);
            }
            else {
                options.logService.error(`[remote-connection][attempt ${attempt}]  An error occurred in initial connection! It will be treated as a permanent error. Error:`);
                options.logService.error(err);
                PersistentConnection.triggerPermanentFailure(0, 0, RemoteAuthorityResolverError.isHandled(err));
                throw err;
            }
        }
    }
}
export async function connectRemoteAgentTunnel(options, tunnelRemoteHost, tunnelRemotePort) {
    const simpleOptions = await resolveConnectionOptions(options, generateUuid(), null);
    const protocol = await doConnectRemoteAgentTunnel(simpleOptions, { host: tunnelRemoteHost, port: tunnelRemotePort }, CancellationToken.None);
    return protocol;
}
function sleep(seconds) {
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
export var PersistentConnectionEventType;
(function (PersistentConnectionEventType) {
    PersistentConnectionEventType[PersistentConnectionEventType["ConnectionLost"] = 0] = "ConnectionLost";
    PersistentConnectionEventType[PersistentConnectionEventType["ReconnectionWait"] = 1] = "ReconnectionWait";
    PersistentConnectionEventType[PersistentConnectionEventType["ReconnectionRunning"] = 2] = "ReconnectionRunning";
    PersistentConnectionEventType[PersistentConnectionEventType["ReconnectionPermanentFailure"] = 3] = "ReconnectionPermanentFailure";
    PersistentConnectionEventType[PersistentConnectionEventType["ConnectionGain"] = 4] = "ConnectionGain";
})(PersistentConnectionEventType || (PersistentConnectionEventType = {}));
export class ConnectionLostEvent {
    constructor(reconnectionToken, millisSinceLastIncomingData) {
        this.reconnectionToken = reconnectionToken;
        this.millisSinceLastIncomingData = millisSinceLastIncomingData;
        this.type = 0 /* PersistentConnectionEventType.ConnectionLost */;
    }
}
export class ReconnectionWaitEvent {
    constructor(reconnectionToken, millisSinceLastIncomingData, durationSeconds, cancellableTimer) {
        this.reconnectionToken = reconnectionToken;
        this.millisSinceLastIncomingData = millisSinceLastIncomingData;
        this.durationSeconds = durationSeconds;
        this.cancellableTimer = cancellableTimer;
        this.type = 1 /* PersistentConnectionEventType.ReconnectionWait */;
    }
    skipWait() {
        this.cancellableTimer.cancel();
    }
}
export class ReconnectionRunningEvent {
    constructor(reconnectionToken, millisSinceLastIncomingData, attempt) {
        this.reconnectionToken = reconnectionToken;
        this.millisSinceLastIncomingData = millisSinceLastIncomingData;
        this.attempt = attempt;
        this.type = 2 /* PersistentConnectionEventType.ReconnectionRunning */;
    }
}
export class ConnectionGainEvent {
    constructor(reconnectionToken, millisSinceLastIncomingData, attempt) {
        this.reconnectionToken = reconnectionToken;
        this.millisSinceLastIncomingData = millisSinceLastIncomingData;
        this.attempt = attempt;
        this.type = 4 /* PersistentConnectionEventType.ConnectionGain */;
    }
}
export class ReconnectionPermanentFailureEvent {
    constructor(reconnectionToken, millisSinceLastIncomingData, attempt, handled) {
        this.reconnectionToken = reconnectionToken;
        this.millisSinceLastIncomingData = millisSinceLastIncomingData;
        this.attempt = attempt;
        this.handled = handled;
        this.type = 3 /* PersistentConnectionEventType.ReconnectionPermanentFailure */;
    }
}
export class PersistentConnection extends Disposable {
    static triggerPermanentFailure(millisSinceLastIncomingData, attempt, handled) {
        this._permanentFailure = true;
        this._permanentFailureMillisSinceLastIncomingData = millisSinceLastIncomingData;
        this._permanentFailureAttempt = attempt;
        this._permanentFailureHandled = handled;
        this._instances.forEach(instance => instance._gotoPermanentFailure(this._permanentFailureMillisSinceLastIncomingData, this._permanentFailureAttempt, this._permanentFailureHandled));
    }
    static debugTriggerReconnection() {
        this._instances.forEach(instance => instance._beginReconnecting());
    }
    static debugPauseSocketWriting() {
        this._instances.forEach(instance => instance._pauseSocketWriting());
    }
    static { this._permanentFailure = false; }
    static { this._permanentFailureMillisSinceLastIncomingData = 0; }
    static { this._permanentFailureAttempt = 0; }
    static { this._permanentFailureHandled = false; }
    static { this._instances = []; }
    get _isPermanentFailure() {
        return this._permanentFailure || PersistentConnection._permanentFailure;
    }
    constructor(_connectionType, _options, reconnectionToken, protocol, _reconnectionFailureIsFatal) {
        super();
        this._connectionType = _connectionType;
        this._options = _options;
        this.reconnectionToken = reconnectionToken;
        this.protocol = protocol;
        this._reconnectionFailureIsFatal = _reconnectionFailureIsFatal;
        this._onDidStateChange = this._register(new Emitter());
        this.onDidStateChange = this._onDidStateChange.event;
        this._permanentFailure = false;
        this._isReconnecting = false;
        this._isDisposed = false;
        this._reconnectionGraceTime = 10800000 /* ProtocolConstants.ReconnectionGraceTime */;
        this._onDidStateChange.fire(new ConnectionGainEvent(this.reconnectionToken, 0, 0));
        this._register(protocol.onSocketClose((e) => {
            const logPrefix = commonLogPrefix(this._connectionType, this.reconnectionToken, true);
            if (!e) {
                this._options.logService.info(`${logPrefix} received socket close event.`);
            }
            else if (e.type === 0 /* SocketCloseEventType.NodeSocketCloseEvent */) {
                this._options.logService.info(`${logPrefix} received socket close event (hadError: ${e.hadError}).`);
                if (e.error) {
                    this._options.logService.error(e.error);
                }
            }
            else {
                this._options.logService.info(`${logPrefix} received socket close event (wasClean: ${e.wasClean}, code: ${e.code}, reason: ${e.reason}).`);
                if (e.event) {
                    this._options.logService.error(e.event);
                }
            }
            this._beginReconnecting();
        }));
        this._register(protocol.onSocketTimeout((e) => {
            const logPrefix = commonLogPrefix(this._connectionType, this.reconnectionToken, true);
            this._options.logService.info(`${logPrefix} received socket timeout event (unacknowledgedMsgCount: ${e.unacknowledgedMsgCount}, timeSinceOldestUnacknowledgedMsg: ${e.timeSinceOldestUnacknowledgedMsg}, timeSinceLastReceivedSomeData: ${e.timeSinceLastReceivedSomeData}).`);
            this._beginReconnecting();
        }));
        PersistentConnection._instances.push(this);
        this._register(toDisposable(() => {
            const myIndex = PersistentConnection._instances.indexOf(this);
            if (myIndex >= 0) {
                PersistentConnection._instances.splice(myIndex, 1);
            }
        }));
        if (this._isPermanentFailure) {
            this._gotoPermanentFailure(PersistentConnection._permanentFailureMillisSinceLastIncomingData, PersistentConnection._permanentFailureAttempt, PersistentConnection._permanentFailureHandled);
        }
    }
    updateGraceTime(graceTime) {
        const sanitizedGrace = sanitizeGraceTime(graceTime, 10800000 /* ProtocolConstants.ReconnectionGraceTime */);
        const logPrefix = commonLogPrefix(this._connectionType, this.reconnectionToken, false);
        this._options.logService.trace(`${logPrefix} Applying reconnection grace time: ${sanitizedGrace}ms (${Math.floor(sanitizedGrace / 1000)}s)`);
        this._reconnectionGraceTime = sanitizedGrace;
    }
    dispose() {
        super.dispose();
        this._isDisposed = true;
    }
    async _beginReconnecting() {
        // Only have one reconnection loop active at a time.
        if (this._isReconnecting) {
            return;
        }
        try {
            this._isReconnecting = true;
            await this._runReconnectingLoop();
        }
        finally {
            this._isReconnecting = false;
        }
    }
    async _runReconnectingLoop() {
        if (this._isPermanentFailure || this._isDisposed) {
            // no more attempts!
            return;
        }
        const logPrefix = commonLogPrefix(this._connectionType, this.reconnectionToken, true);
        this._options.logService.info(`${logPrefix} starting reconnecting loop. You can get more information with the trace log level.`);
        this._onDidStateChange.fire(new ConnectionLostEvent(this.reconnectionToken, this.protocol.getMillisSinceLastIncomingData()));
        const TIMES = [0, 5, 5, 10, 10, 10, 10, 10, 30];
        const graceTime = this._reconnectionGraceTime;
        this._options.logService.info(`${logPrefix} starting reconnection with grace time: ${graceTime}ms (${Math.floor(graceTime / 1000)}s)`);
        if (graceTime <= 0) {
            this._options.logService.error(`${logPrefix} reconnection grace time is set to 0ms, will not attempt to reconnect.`);
            this._onReconnectionPermanentFailure(this.protocol.getMillisSinceLastIncomingData(), 0, false);
            return;
        }
        const loopStartTime = Date.now();
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
                    }
                    catch { } // User canceled timer
                }
                if (this._isPermanentFailure) {
                    this._options.logService.error(`${logPrefix} permanent failure occurred while running the reconnecting loop.`);
                    break;
                }
                // connection was lost, let's try to re-establish it
                this._onDidStateChange.fire(new ReconnectionRunningEvent(this.reconnectionToken, this.protocol.getMillisSinceLastIncomingData(), attempt + 1));
                this._options.logService.info(`${logPrefix} resolving connection...`);
                const simpleOptions = await resolveConnectionOptions(this._options, this.reconnectionToken, this.protocol);
                this._options.logService.info(`${logPrefix} connecting to ${simpleOptions.connectTo}...`);
                await this._reconnect(simpleOptions, createTimeoutCancellation(RECONNECT_TIMEOUT));
                this._options.logService.info(`${logPrefix} reconnected!`);
                this._onDidStateChange.fire(new ConnectionGainEvent(this.reconnectionToken, this.protocol.getMillisSinceLastIncomingData(), attempt + 1));
                break;
            }
            catch (err) {
                if (err.code === 'VSCODE_CONNECTION_ERROR') {
                    this._options.logService.error(`${logPrefix} A permanent error occurred in the reconnecting loop! Will give up now! Error:`);
                    this._options.logService.error(err);
                    this._onReconnectionPermanentFailure(this.protocol.getMillisSinceLastIncomingData(), attempt + 1, false);
                    break;
                }
                if (Date.now() - loopStartTime >= graceTime) {
                    const graceSeconds = Math.round(graceTime / 1000);
                    this._options.logService.error(`${logPrefix} An error occurred while reconnecting, but it will be treated as a permanent error because the reconnection grace time (${graceSeconds}s) has expired! Will give up now! Error:`);
                    this._options.logService.error(err);
                    this._onReconnectionPermanentFailure(this.protocol.getMillisSinceLastIncomingData(), attempt + 1, false);
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
                if (isCancellationError(err)) {
                    this._options.logService.info(`${logPrefix} A promise cancelation error occurred while trying to reconnect, will try again...`);
                    this._options.logService.trace(err);
                    // try again!
                    continue;
                }
                if (err instanceof RemoteAuthorityResolverError) {
                    this._options.logService.error(`${logPrefix} A RemoteAuthorityResolverError occurred while trying to reconnect. Will give up now! Error:`);
                    this._options.logService.error(err);
                    this._onReconnectionPermanentFailure(this.protocol.getMillisSinceLastIncomingData(), attempt + 1, RemoteAuthorityResolverError.isHandled(err));
                    break;
                }
                this._options.logService.error(`${logPrefix} An unknown error occurred while trying to reconnect, since this is an unknown case, it will be treated as a permanent error! Will give up now! Error:`);
                this._options.logService.error(err);
                this._onReconnectionPermanentFailure(this.protocol.getMillisSinceLastIncomingData(), attempt + 1, false);
                break;
            }
        } while (!this._isPermanentFailure && !this._isDisposed);
    }
    _onReconnectionPermanentFailure(millisSinceLastIncomingData, attempt, handled) {
        if (this._reconnectionFailureIsFatal) {
            PersistentConnection.triggerPermanentFailure(millisSinceLastIncomingData, attempt, handled);
        }
        else {
            this._gotoPermanentFailure(millisSinceLastIncomingData, attempt, handled);
        }
    }
    _gotoPermanentFailure(millisSinceLastIncomingData, attempt, handled) {
        this._onDidStateChange.fire(new ReconnectionPermanentFailureEvent(this.reconnectionToken, millisSinceLastIncomingData, attempt, handled));
        safeDisposeProtocolAndSocket(this.protocol);
    }
    _pauseSocketWriting() {
        this.protocol.pauseSocketWriting();
    }
}
export class ManagementPersistentConnection extends PersistentConnection {
    constructor(options, remoteAuthority, clientId, reconnectionToken, protocol) {
        super(1 /* ConnectionType.Management */, options, reconnectionToken, protocol, /*reconnectionFailureIsFatal*/ true);
        this.client = this._register(new Client(protocol, {
            remoteAuthority: remoteAuthority,
            clientId: clientId
        }, options.ipcLogger));
    }
    async _reconnect(options, timeoutCancellationToken) {
        await doConnectRemoteAgentManagement(options, timeoutCancellationToken);
    }
}
export class ExtensionHostPersistentConnection extends PersistentConnection {
    constructor(options, startArguments, reconnectionToken, protocol, debugPort) {
        super(2 /* ConnectionType.ExtensionHost */, options, reconnectionToken, protocol, /*reconnectionFailureIsFatal*/ false);
        this._startArguments = startArguments;
        this.debugPort = debugPort;
    }
    async _reconnect(options, timeoutCancellationToken) {
        await doConnectRemoteAgentExtensionHost(options, this._startArguments, timeoutCancellationToken);
    }
}
function safeDisposeProtocolAndSocket(protocol) {
    try {
        protocol.acceptDisconnect();
        const socket = protocol.getSocket();
        protocol.dispose();
        socket.dispose();
    }
    catch (err) {
        onUnexpectedError(err);
    }
}
function getErrorFromMessage(msg) {
    if (msg && msg.type === 'error') {
        const error = new Error(`Connection error: ${msg.reason}`);
        // eslint-disable-next-line local/code-no-any-casts
        error.code = 'VSCODE_CONNECTION_ERROR';
        return error;
    }
    return null;
}
function sanitizeGraceTime(candidate, fallback) {
    if (typeof candidate !== 'number' || !isFinite(candidate) || candidate < 0) {
        return fallback;
    }
    if (candidate > Number.MAX_SAFE_INTEGER) {
        return Number.MAX_SAFE_INTEGER;
    }
    return Math.floor(candidate);
}
function stringRightPad(str, len) {
    while (str.length < len) {
        str += ' ';
    }
    return str;
}
function _commonLogPrefix(connectionType, reconnectionToken) {
    return `[remote-connection][${stringRightPad(connectionTypeToString(connectionType), 13)}][${reconnectionToken.substr(0, 5)}…]`;
}
function commonLogPrefix(connectionType, reconnectionToken, isReconnect) {
    return `${_commonLogPrefix(connectionType, reconnectionToken)}[${isReconnect ? 'reconnect' : 'initial'}]`;
}
function connectLogPrefix(options, connectionType) {
    return `${commonLogPrefix(connectionType, options.reconnectionToken, !!options.reconnectionProtocol)}[${options.connectTo}]`;
}
function logElapsed(startTime) {
    return `${Date.now() - startTime} ms`;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlQWdlbnRDb25uZWN0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudENvbm5lY3Rpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ2pILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUN4RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDeEQsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDM0csT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDcEUsT0FBTyxLQUFLLFdBQVcsTUFBTSxxQ0FBcUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDOUQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRTVELE9BQU8sRUFBRSxNQUFNLEVBQVcsa0JBQWtCLEVBQTJDLE1BQU0sMkNBQTJDLENBQUM7QUFHekksT0FBTyxFQUFFLDRCQUE0QixFQUFvQixNQUFNLDhCQUE4QixDQUFDO0FBSTlGLE1BQU0saUJBQWlCLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUM7QUFFOUMsTUFBTSxDQUFOLElBQWtCLGNBSWpCO0FBSkQsV0FBa0IsY0FBYztJQUMvQiwr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