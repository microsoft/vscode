/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as fs from 'fs';
import * as net from 'net';
import { createRequire } from 'node:module';
import { performance } from 'perf_hooks';
import * as url from 'url';
import { VSBuffer } from '../../base/common/buffer.js';
import { isSigPipeError, onUnexpectedError, setUnexpectedErrorHandler } from '../../base/common/errors.js';
import { isEqualOrParent } from '../../base/common/extpath.js';
import { Disposable, DisposableMap, DisposableStore } from '../../base/common/lifecycle.js';
import { connectionTokenQueryName, FileAccess, getServerProductSegment, Schemas } from '../../base/common/network.js';
import { dirname, join } from '../../base/common/path.js';
import * as perf from '../../base/common/performance.js';
import * as platform from '../../base/common/platform.js';
import { createRegExp, escapeRegExpCharacters } from '../../base/common/strings.js';
import { URI } from '../../base/common/uri.js';
import { generateUuid } from '../../base/common/uuid.js';
import { getOSReleaseInfo } from '../../base/node/osReleaseInfo.js';
import { findFreePort } from '../../base/node/ports.js';
import { addUNCHostToAllowlist, disableUNCAccessRestrictions } from '../../base/node/unc.js';
import { PersistentProtocol } from '../../base/parts/ipc/common/ipc.net.js';
import { NodeSocket, upgradeToISocket, WebSocketNodeSocket } from '../../base/parts/ipc/node/ipc.net.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../platform/log/common/log.js';
import { IProductService } from '../../platform/product/common/productService.js';
import { ITelemetryService } from '../../platform/telemetry/common/telemetry.js';
import { ExtensionHostConnection } from './extensionHostConnection.js';
import { ManagementConnection } from './remoteExtensionManagement.js';
import { determineServerConnectionToken, requestHasValidConnectionToken as httpRequestHasValidConnectionToken, ServerConnectionTokenParseError } from './serverConnectionToken.js';
import { IServerEnvironmentService } from './serverEnvironmentService.js';
import { IServerLifetimeService } from './serverLifetimeService.js';
import { setupServerServices } from './serverServices.js';
import { serveError, serveFile, WebClientServer } from './webClientServer.js';
const require = createRequire(import.meta.url);
let RemoteExtensionHostAgentServer = class RemoteExtensionHostAgentServer extends Disposable {
    constructor(_socketServer, _connectionToken, _vsdaMod, hasWebClient, serverBasePath, _environmentService, _productService, _logService, _instantiationService, _serverLifetimeService) {
        super();
        this._socketServer = _socketServer;
        this._connectionToken = _connectionToken;
        this._vsdaMod = _vsdaMod;
        this._environmentService = _environmentService;
        this._productService = _productService;
        this._logService = _logService;
        this._instantiationService = _instantiationService;
        this._serverLifetimeService = _serverLifetimeService;
        this._extHostLifetimeTokens = this._register(new DisposableMap());
        this._webEndpointOriginChecker = WebEndpointOriginChecker.create(this._productService);
        if (serverBasePath !== undefined && serverBasePath.charCodeAt(serverBasePath.length - 1) === 47 /* CharCode.Slash */) {
            // Remove trailing slash from base path
            serverBasePath = serverBasePath.substring(0, serverBasePath.length - 1);
        }
        this._serverBasePath = serverBasePath; // undefined or starts with a slash
        this._serverProductPath = `/${getServerProductSegment(_productService)}`; // starts with a slash
        this._extHostConnections = Object.create(null);
        this._managementConnections = Object.create(null);
        this._allReconnectionTokens = new Set();
        this._webClientServer = (hasWebClient
            ? this._instantiationService.createInstance(WebClientServer, this._connectionToken, serverBasePath ?? '/', this._serverProductPath)
            : null);
        this._logService.info(`Extension host agent started.`);
        this._reconnectionGraceTime = this._environmentService.reconnectionGraceTime;
    }
    async handleRequest(req, res) {
        // Only serve GET requests
        if (req.method !== 'GET') {
            return serveError(req, res, 405, `Unsupported method ${req.method}`);
        }
        if (!req.url) {
            return serveError(req, res, 400, `Bad request.`);
        }
        const parsedUrl = url.parse(req.url, true);
        let pathname = parsedUrl.pathname;
        if (!pathname) {
            return serveError(req, res, 400, `Bad request.`);
        }
        // Serve from both '/' and serverBasePath
        if (this._serverBasePath !== undefined && pathname.startsWith(this._serverBasePath)) {
            pathname = pathname.substring(this._serverBasePath.length) || '/';
        }
        // for now accept all paths, with or without server product path
        if (pathname.startsWith(this._serverProductPath) && pathname.charCodeAt(this._serverProductPath.length) === 47 /* CharCode.Slash */) {
            pathname = pathname.substring(this._serverProductPath.length);
        }
        // Version
        if (pathname === '/version') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            return void res.end(this._productService.commit || '');
        }
        // Delay shutdown
        if (pathname === '/delay-shutdown') {
            this._serverLifetimeService.delay();
            res.writeHead(200);
            return void res.end('OK');
        }
        if (!httpRequestHasValidConnectionToken(this._connectionToken, req, parsedUrl)) {
            // invalid connection token
            return serveError(req, res, 403, `Forbidden.`);
        }
        if (pathname === '/vscode-remote-resource') {
            // Handle HTTP requests for resources rendered in the rich client (images, fonts, etc.)
            // These resources could be files shipped with extensions or even workspace files.
            const desiredPath = parsedUrl.query['path'];
            if (typeof desiredPath !== 'string') {
                return serveError(req, res, 400, `Bad request.`);
            }
            let filePath;
            try {
                filePath = URI.from({ scheme: Schemas.file, path: desiredPath }).fsPath;
            }
            catch (err) {
                return serveError(req, res, 400, `Bad request.`);
            }
            const responseHeaders = Object.create(null);
            if (this._environmentService.isBuilt) {
                if (isEqualOrParent(filePath, this._environmentService.builtinExtensionsPath, !platform.isLinux)
                    || isEqualOrParent(filePath, this._environmentService.extensionsPath, !platform.isLinux)) {
                    responseHeaders['Cache-Control'] = 'public, max-age=31536000';
                }
            }
            // Allow cross origin requests from the web worker extension host
            responseHeaders['Vary'] = 'Origin';
            const requestOrigin = req.headers['origin'];
            if (requestOrigin && this._webEndpointOriginChecker.matches(requestOrigin)) {
                responseHeaders['Access-Control-Allow-Origin'] = requestOrigin;
            }
            return serveFile(filePath, 1 /* CacheControl.ETAG */, this._logService, req, res, responseHeaders);
        }
        // workbench web UI
        if (this._webClientServer) {
            this._webClientServer.handle(req, res, parsedUrl, pathname);
            return;
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return void res.end('Not found');
    }
    handleUpgrade(req, socket) {
        let reconnectionToken = generateUuid();
        let isReconnection = false;
        let skipWebSocketFrames = false;
        if (req.url) {
            const query = url.parse(req.url, true).query;
            if (typeof query.reconnectionToken === 'string') {
                reconnectionToken = query.reconnectionToken;
            }
            if (query.reconnection === 'true') {
                isReconnection = true;
            }
            if (query.skipWebSocketFrames === 'true') {
                skipWebSocketFrames = true;
            }
        }
        const upgraded = upgradeToISocket(req, socket, {
            debugLabel: `server-connection-${reconnectionToken}`,
            skipWebSocketFrames,
            disableWebSocketCompression: this._environmentService.args['disable-websocket-compression']
        });
        if (!upgraded) {
            return;
        }
        this._handleWebSocketConnection(upgraded, isReconnection, reconnectionToken);
    }
    handleServerError(err) {
        this._logService.error(`Error occurred in server`);
        this._logService.error(err);
    }
    // Eventually cleanup
    _getRemoteAddress(socket) {
        let _socket;
        if (socket instanceof NodeSocket) {
            _socket = socket.socket;
        }
        else {
            _socket = socket.socket.socket;
        }
        return _socket.remoteAddress || `<unknown>`;
    }
    async _rejectWebSocketConnection(logPrefix, protocol, reason) {
        const socket = protocol.getSocket();
        this._logService.error(`${logPrefix} ${reason}.`);
        const errMessage = {
            type: 'error',
            reason: reason
        };
        protocol.sendControl(VSBuffer.fromString(JSON.stringify(errMessage)));
        protocol.dispose();
        await socket.drain();
        socket.dispose();
    }
    /**
     * NOTE: Avoid using await in this method!
     * The problem is that await introduces a process.nextTick due to the implicit Promise.then
     * This can lead to some bytes being received and interpreted and a control message being emitted before the next listener has a chance to be registered.
     */
    _handleWebSocketConnection(socket, isReconnection, reconnectionToken) {
        const remoteAddress = this._getRemoteAddress(socket);
        const logPrefix = `[${remoteAddress}][${reconnectionToken.substr(0, 8)}]`;
        const protocol = new PersistentProtocol({ socket });
        const validator = this._vsdaMod ? new this._vsdaMod.validator() : null;
        const signer = this._vsdaMod ? new this._vsdaMod.signer() : null;
        let State;
        (function (State) {
            State[State["WaitingForAuth"] = 0] = "WaitingForAuth";
            State[State["WaitingForConnectionType"] = 1] = "WaitingForConnectionType";
            State[State["Done"] = 2] = "Done";
            State[State["Error"] = 3] = "Error";
        })(State || (State = {}));
        let state = 0 /* State.WaitingForAuth */;
        const rejectWebSocketConnection = (msg) => {
            state = 3 /* State.Error */;
            listener.dispose();
            this._rejectWebSocketConnection(logPrefix, protocol, msg);
        };
        const listener = protocol.onControlMessage((raw) => {
            if (state === 0 /* State.WaitingForAuth */) {
                let msg1;
                try {
                    msg1 = JSON.parse(raw.toString());
                }
                catch (err) {
                    return rejectWebSocketConnection(`Malformed first message`);
                }
                if (msg1.type !== 'auth') {
                    return rejectWebSocketConnection(`Invalid first message`);
                }
                if (this._connectionToken.type === 2 /* ServerConnectionTokenType.Mandatory */ && !this._connectionToken.validate(msg1.auth)) {
                    return rejectWebSocketConnection(`Unauthorized client refused: auth mismatch`);
                }
                // Send `sign` request
                let signedData = generateUuid();
                if (signer) {
                    try {
                        signedData = signer.sign(msg1.data);
                    }
                    catch (e) {
                    }
                }
                let someText = generateUuid();
                if (validator) {
                    try {
                        someText = validator.createNewMessage(someText);
                    }
                    catch (e) {
                    }
                }
                const signRequest = {
                    type: 'sign',
                    data: someText,
                    signedData: signedData
                };
                protocol.sendControl(VSBuffer.fromString(JSON.stringify(signRequest)));
                state = 1 /* State.WaitingForConnectionType */;
            }
            else if (state === 1 /* State.WaitingForConnectionType */) {
                let msg2;
                try {
                    msg2 = JSON.parse(raw.toString());
                }
                catch (err) {
                    return rejectWebSocketConnection(`Malformed second message`);
                }
                if (msg2.type !== 'connectionType') {
                    return rejectWebSocketConnection(`Invalid second message`);
                }
                if (typeof msg2.signedData !== 'string') {
                    return rejectWebSocketConnection(`Invalid second message field type`);
                }
                const rendererCommit = msg2.commit;
                const myCommit = this._productService.commit;
                if (rendererCommit && myCommit) {
                    // Running in the built version where commits are defined
                    if (rendererCommit !== myCommit) {
                        return rejectWebSocketConnection(`Client refused: version mismatch`);
                    }
                }
                let valid = false;
                if (!validator) {
                    valid = true;
                }
                else if (this._connectionToken.validate(msg2.signedData)) {
                    // web client
                    valid = true;
                }
                else {
                    try {
                        valid = validator.validate(msg2.signedData) === 'ok';
                    }
                    catch (e) {
                    }
                }
                if (!valid) {
                    if (this._environmentService.isBuilt) {
                        return rejectWebSocketConnection(`Unauthorized client refused`);
                    }
                    else {
                        this._logService.error(`${logPrefix} Unauthorized client handshake failed but we proceed because of dev mode.`);
                    }
                }
                // We have received a new connection.
                // This indicates that the server owner has connectivity.
                // Therefore we will shorten the reconnection grace period for disconnected connections!
                for (const key in this._managementConnections) {
                    const managementConnection = this._managementConnections[key];
                    managementConnection.shortenReconnectionGraceTimeIfNecessary();
                }
                for (const key in this._extHostConnections) {
                    const extHostConnection = this._extHostConnections[key];
                    extHostConnection.shortenReconnectionGraceTimeIfNecessary();
                }
                state = 2 /* State.Done */;
                listener.dispose();
                this._handleConnectionType(remoteAddress, logPrefix, protocol, socket, isReconnection, reconnectionToken, msg2);
            }
        });
    }
    async _handleConnectionType(remoteAddress, _logPrefix, protocol, socket, isReconnection, reconnectionToken, msg) {
        const logPrefix = (msg.desiredConnectionType === 1 /* ConnectionType.Management */
            ? `${_logPrefix}[ManagementConnection]`
            : msg.desiredConnectionType === 2 /* ConnectionType.ExtensionHost */
                ? `${_logPrefix}[ExtensionHostConnection]`
                : _logPrefix);
        if (msg.desiredConnectionType === 1 /* ConnectionType.Management */) {
            // This should become a management connection
            if (socket instanceof WebSocketNodeSocket) {
                socket.setRecordInflateBytes(false);
            }
            if (isReconnection) {
                // This is a reconnection
                if (!this._managementConnections[reconnectionToken]) {
                    if (!this._allReconnectionTokens.has(reconnectionToken)) {
                        // This is an unknown reconnection token
                        return this._rejectWebSocketConnection(logPrefix, protocol, `Unknown reconnection token (never seen)`);
                    }
                    else {
                        // This is a connection that was seen in the past, but is no longer valid
                        return this._rejectWebSocketConnection(logPrefix, protocol, `Unknown reconnection token (seen before)`);
                    }
                }
                protocol.sendControl(VSBuffer.fromString(JSON.stringify({ type: 'ok' })));
                const dataChunk = protocol.readEntireBuffer();
                protocol.dispose();
                this._managementConnections[reconnectionToken].acceptReconnection(remoteAddress, socket, dataChunk);
            }
            else {
                // This is a fresh connection
                if (this._managementConnections[reconnectionToken]) {
                    // Cannot have two concurrent connections using the same reconnection token
                    return this._rejectWebSocketConnection(logPrefix, protocol, `Duplicate reconnection token`);
                }
                protocol.sendControl(VSBuffer.fromString(JSON.stringify({ type: 'ok' })));
                const con = new ManagementConnection(this._logService, reconnectionToken, remoteAddress, protocol, this._reconnectionGraceTime);
                this._socketServer.acceptConnection(con.protocol, con.onClose);
                this._managementConnections[reconnectionToken] = con;
                this._allReconnectionTokens.add(reconnectionToken);
                con.onClose(() => {
                    delete this._managementConnections[reconnectionToken];
                });
            }
        }
        else if (msg.desiredConnectionType === 2 /* ConnectionType.ExtensionHost */) {
            // This should become an extension host connection
            const startParams0 = msg.args || { language: 'en' };
            const startParams = await this._updateWithFreeDebugPort(startParams0);
            if (startParams.port) {
                this._logService.trace(`${logPrefix} - startParams debug port ${startParams.port}`);
            }
            this._logService.trace(`${logPrefix} - startParams language: ${startParams.language}`);
            this._logService.trace(`${logPrefix} - startParams env: ${JSON.stringify(startParams.env)}`);
            if (isReconnection) {
                // This is a reconnection
                if (!this._extHostConnections[reconnectionToken]) {
                    if (!this._allReconnectionTokens.has(reconnectionToken)) {
                        // This is an unknown reconnection token
                        return this._rejectWebSocketConnection(logPrefix, protocol, `Unknown reconnection token (never seen)`);
                    }
                    else {
                        // This is a connection that was seen in the past, but is no longer valid
                        return this._rejectWebSocketConnection(logPrefix, protocol, `Unknown reconnection token (seen before)`);
                    }
                }
                protocol.sendPause();
                protocol.sendControl(VSBuffer.fromString(JSON.stringify(startParams.port ? { debugPort: startParams.port } : {})));
                const dataChunk = protocol.readEntireBuffer();
                protocol.dispose();
                this._extHostConnections[reconnectionToken].acceptReconnection(remoteAddress, socket, dataChunk);
            }
            else {
                // This is a fresh connection
                if (this._extHostConnections[reconnectionToken]) {
                    // Cannot have two concurrent connections using the same reconnection token
                    return this._rejectWebSocketConnection(logPrefix, protocol, `Duplicate reconnection token`);
                }
                protocol.sendPause();
                protocol.sendControl(VSBuffer.fromString(JSON.stringify(startParams.port ? { debugPort: startParams.port } : {})));
                const dataChunk = protocol.readEntireBuffer();
                protocol.dispose();
                const con = this._instantiationService.createInstance(ExtensionHostConnection, reconnectionToken, remoteAddress, socket, dataChunk);
                this._extHostConnections[reconnectionToken] = con;
                this._allReconnectionTokens.add(reconnectionToken);
                this._extHostLifetimeTokens.set(reconnectionToken, this._serverLifetimeService.active(`ExtensionHost:${reconnectionToken.substring(0, 8)}`));
                con.onClose(() => {
                    con.dispose();
                    delete this._extHostConnections[reconnectionToken];
                    this._extHostLifetimeTokens.deleteAndDispose(reconnectionToken);
                });
                con.start(startParams);
            }
        }
        else if (msg.desiredConnectionType === 3 /* ConnectionType.Tunnel */) {
            if (socket instanceof WebSocketNodeSocket) {
                socket.setRecordInflateBytes(false);
            }
            const tunnelStartParams = msg.args;
            this._createTunnel(protocol, tunnelStartParams);
        }
        else {
            return this._rejectWebSocketConnection(logPrefix, protocol, `Unknown initial data received`);
        }
    }
    async _createTunnel(protocol, tunnelStartParams) {
        const remoteSocket = protocol.getSocket().socket;
        const dataChunk = protocol.readEntireBuffer();
        protocol.dispose();
        remoteSocket.pause();
        const localSocket = await this._connectTunnelSocket(tunnelStartParams.host, tunnelStartParams.port);
        if (dataChunk.byteLength > 0) {
            localSocket.write(dataChunk.buffer);
        }
        localSocket.on('end', () => remoteSocket.end());
        localSocket.on('close', () => remoteSocket.end());
        localSocket.on('error', () => remoteSocket.destroy());
        remoteSocket.on('end', () => localSocket.end());
        remoteSocket.on('close', () => localSocket.end());
        remoteSocket.on('error', () => localSocket.destroy());
        localSocket.pipe(remoteSocket);
        remoteSocket.pipe(localSocket);
    }
    _connectTunnelSocket(host, port) {
        return new Promise((c, e) => {
            const socket = net.createConnection({
                host: host,
                port: port,
                autoSelectFamily: true
            }, () => {
                socket.removeListener('error', e);
                socket.pause();
                c(socket);
            });
            socket.once('error', e);
        });
    }
    _updateWithFreeDebugPort(startParams) {
        if (typeof startParams.port === 'number') {
            return findFreePort(startParams.port, 10 /* try 10 ports */, 5000 /* try up to 5 seconds */).then(freePort => {
                startParams.port = freePort;
                return startParams;
            });
        }
        // No port clear debug configuration.
        startParams.debugId = undefined;
        startParams.port = undefined;
        startParams.break = undefined;
        return Promise.resolve(startParams);
    }
};
RemoteExtensionHostAgentServer = __decorate([
    __param(5, IServerEnvironmentService),
    __param(6, IProductService),
    __param(7, ILogService),
    __param(8, IInstantiationService),
    __param(9, IServerLifetimeService)
], RemoteExtensionHostAgentServer);
export async function createServer(address, args, REMOTE_DATA_FOLDER) {
    const connectionToken = await determineServerConnectionToken(args);
    if (connectionToken instanceof ServerConnectionTokenParseError) {
        console.warn(connectionToken.message);
        process.exit(1);
    }
    // setting up error handlers, first with console.error, then, once available, using the log service
    function initUnexpectedErrorHandler(handler) {
        setUnexpectedErrorHandler(err => {
            // See https://github.com/microsoft/vscode-remote-release/issues/6481
            // In some circumstances, console.error will throw an asynchronous error. This asynchronous error
            // will end up here, and then it will be logged again, thus creating an endless asynchronous loop.
            // Here we try to break the loop by ignoring EPIPE errors that include our own unexpected error handler in the stack.
            if (isSigPipeError(err) && err.stack && /unexpectedErrorHandler/.test(err.stack)) {
                return;
            }
            handler(err);
        });
    }
    const unloggedErrors = [];
    initUnexpectedErrorHandler((error) => {
        unloggedErrors.push(error);
        console.error(error);
    });
    let didLogAboutSIGPIPE = false;
    process.on('SIGPIPE', () => {
        // See https://github.com/microsoft/vscode-remote-release/issues/6543
        // We would normally install a SIGPIPE listener in bootstrap-node.js
        // But in certain situations, the console itself can be in a broken pipe state
        // so logging SIGPIPE to the console will cause an infinite async loop
        if (!didLogAboutSIGPIPE) {
            didLogAboutSIGPIPE = true;
            onUnexpectedError(new Error(`Unexpected SIGPIPE`));
        }
    });
    const disposables = new DisposableStore();
    const { socketServer, instantiationService } = await setupServerServices(connectionToken, args, REMOTE_DATA_FOLDER, disposables);
    // Set the unexpected error handler after the services have been initialized, to avoid having
    // the telemetry service overwrite our handler
    instantiationService.invokeFunction((accessor) => {
        const logService = accessor.get(ILogService);
        unloggedErrors.forEach(error => logService.error(error));
        unloggedErrors.length = 0;
        initUnexpectedErrorHandler((error) => logService.error(error));
    });
    // On Windows, configure the UNC allow list based on settings
    instantiationService.invokeFunction((accessor) => {
        const configurationService = accessor.get(IConfigurationService);
        if (platform.isWindows) {
            if (configurationService.getValue('security.restrictUNCAccess') === false) {
                disableUNCAccessRestrictions();
            }
            else {
                addUNCHostToAllowlist(configurationService.getValue('security.allowedUNCHosts'));
            }
        }
    });
    //
    // On Windows, exit early with warning message to users about potential security issue
    // if there is node_modules folder under home drive or Users folder.
    //
    instantiationService.invokeFunction((accessor) => {
        const logService = accessor.get(ILogService);
        if (platform.isWindows && process.env.HOMEDRIVE && process.env.HOMEPATH) {
            const homeDirModulesPath = join(process.env.HOMEDRIVE, 'node_modules');
            const userDir = dirname(join(process.env.HOMEDRIVE, process.env.HOMEPATH));
            const userDirModulesPath = join(userDir, 'node_modules');
            if (fs.existsSync(homeDirModulesPath) || fs.existsSync(userDirModulesPath)) {
                const message = `

*
* !!!! Server terminated due to presence of CVE-2020-1416 !!!!
*
* Please remove the following directories and re-try
* ${homeDirModulesPath}
* ${userDirModulesPath}
*
* For more information on the vulnerability https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2020-1416
*

`;
                logService.warn(message);
                console.warn(message);
                process.exit(0);
            }
        }
    });
    const vsdaMod = instantiationService.invokeFunction((accessor) => {
        const logService = accessor.get(ILogService);
        const hasVSDA = fs.existsSync(join(FileAccess.asFileUri('').fsPath, '../node_modules/vsda'));
        if (hasVSDA) {
            try {
                return require('vsda');
            }
            catch (err) {
                logService.error(err);
            }
        }
        return null;
    });
    let serverBasePath = args['server-base-path'];
    if (serverBasePath && !serverBasePath.startsWith('/')) {
        serverBasePath = `/${serverBasePath}`;
    }
    const hasWebClient = fs.existsSync(FileAccess.asFileUri(`vs/code/browser/workbench/workbench.html`).fsPath);
    if (hasWebClient && address && typeof address !== 'string') {
        // ships the web ui!
        const queryPart = (connectionToken.type !== 0 /* ServerConnectionTokenType.None */ ? `?${connectionTokenQueryName}=${connectionToken.value}` : '');
        console.log(`Web UI available at http://localhost${address.port === 80 ? '' : `:${address.port}`}${serverBasePath ?? ''}${queryPart}`);
    }
    const remoteExtensionHostAgentServer = instantiationService.createInstance(RemoteExtensionHostAgentServer, socketServer, connectionToken, vsdaMod, hasWebClient, serverBasePath);
    perf.mark('code/server/ready');
    const currentTime = performance.now();
    // eslint-disable-next-line local/code-no-any-casts
    const vscodeServerStartTime = global.vscodeServerStartTime;
    // eslint-disable-next-line local/code-no-any-casts
    const vscodeServerListenTime = global.vscodeServerListenTime;
    // eslint-disable-next-line local/code-no-any-casts
    const vscodeServerCodeLoadedTime = global.vscodeServerCodeLoadedTime;
    instantiationService.invokeFunction(async (accessor) => {
        const telemetryService = accessor.get(ITelemetryService);
        telemetryService.publicLog2('serverStart', {
            startTime: vscodeServerStartTime,
            startedTime: vscodeServerListenTime,
            codeLoadedTime: vscodeServerCodeLoadedTime,
            readyTime: currentTime
        });
        if (platform.isLinux) {
            const logService = accessor.get(ILogService);
            const releaseInfo = await getOSReleaseInfo(logService.error.bind(logService));
            if (releaseInfo) {
                telemetryService.publicLog2('serverPlatformInfo', {
                    platformId: releaseInfo.id,
                    platformVersionId: releaseInfo.version_id,
                    platformIdLike: releaseInfo.id_like
                });
            }
        }
    });
    if (args['print-startup-performance']) {
        let output = '';
        output += `Start-up time: ${vscodeServerListenTime - vscodeServerStartTime}\n`;
        output += `Code loading time: ${vscodeServerCodeLoadedTime - vscodeServerStartTime}\n`;
        output += `Initialized time: ${currentTime - vscodeServerStartTime}\n`;
        output += `\n`;
        console.log(output);
    }
    return remoteExtensionHostAgentServer;
}
class WebEndpointOriginChecker {
    static create(productService) {
        const webEndpointUrlTemplate = productService.webEndpointUrlTemplate;
        const commit = productService.commit;
        const quality = productService.quality;
        if (!webEndpointUrlTemplate || !commit || !quality) {
            return new WebEndpointOriginChecker(null);
        }
        const uuid = generateUuid();
        const exampleUrl = new URL(webEndpointUrlTemplate
            .replace('{{uuid}}', uuid)
            .replace('{{commit}}', commit)
            .replace('{{quality}}', quality));
        const exampleOrigin = exampleUrl.origin;
        const originRegExpSource = (escapeRegExpCharacters(exampleOrigin)
            .replace(uuid, '[a-zA-Z0-9\\-]+'));
        try {
            const originRegExp = createRegExp(`^${originRegExpSource}$`, true, { matchCase: false });
            return new WebEndpointOriginChecker(originRegExp);
        }
        catch (err) {
            return new WebEndpointOriginChecker(null);
        }
    }
    constructor(_originRegExp) {
        this._originRegExp = _originRegExp;
    }
    matches(origin) {
        if (!this._originRegExp) {
            return false;
        }
        return this._originRegExp.test(origin);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlRXh0ZW5zaW9uSG9zdEFnZW50U2VydmVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2VydmVyL25vZGUvcmVtb3RlRXh0ZW5zaW9uSG9zdEFnZW50U2VydmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBRXpCLE9BQU8sS0FBSyxHQUFHLE1BQU0sS0FBSyxDQUFDO0FBQzNCLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFDNUMsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUN6QyxPQUFPLEtBQUssR0FBRyxNQUFNLEtBQUssQ0FBQztBQUMzQixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFFdkQsT0FBTyxFQUFFLGNBQWMsRUFBRSxpQkFBaUIsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQzNHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUMvRCxPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUM1RixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsVUFBVSxFQUFFLHVCQUF1QixFQUFFLE9BQU8sRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3RILE9BQU8sRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDMUQsT0FBTyxLQUFLLElBQUksTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEtBQUssUUFBUSxNQUFNLCtCQUErQixDQUFDO0FBQzFELE9BQU8sRUFBRSxZQUFZLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNwRixPQUFPLEVB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