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
import * as cp from 'child_process';
import * as net from 'net';
import { VSBuffer } from '../../base/common/buffer.js';
import { Emitter, Event } from '../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../base/common/lifecycle.js';
import { FileAccess } from '../../base/common/network.js';
import { delimiter, join } from '../../base/common/path.js';
import { isWindows } from '../../base/common/platform.js';
import { removeDangerousEnvVariables } from '../../base/common/processes.js';
import { createRandomIPCHandle, NodeSocket, WebSocketNodeSocket } from '../../base/parts/ipc/node/ipc.net.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { ILogService } from '../../platform/log/common/log.js';
import { getResolvedShellEnv } from '../../platform/shell/node/shellEnv.js';
import { IExtensionHostStatusService } from './extensionHostStatusService.js';
import { getNLSConfiguration } from './remoteLanguagePacks.js';
import { IServerEnvironmentService } from './serverEnvironmentService.js';
import { IPCExtHostConnection, SocketExtHostConnection, writeExtHostConnection } from '../../workbench/services/extensions/common/extensionHostEnv.js';
export async function buildUserEnvironment(startParamsEnv = {}, withUserShellEnvironment, language, environmentService, logService, configurationService) {
    const nlsConfig = await getNLSConfiguration(language, environmentService.userDataPath);
    let userShellEnv = {};
    if (withUserShellEnvironment) {
        try {
            userShellEnv = await getResolvedShellEnv(configurationService, logService, environmentService.args, process.env);
        }
        catch (error) {
            logService.error('ExtensionHostConnection#buildUserEnvironment resolving shell environment failed', error);
        }
    }
    const processEnv = process.env;
    const env = {
        ...processEnv,
        ...userShellEnv,
        ...{
            VSCODE_ESM_ENTRYPOINT: 'vs/workbench/api/node/extensionHostProcess',
            VSCODE_HANDLES_UNCAUGHT_ERRORS: 'true',
            VSCODE_NLS_CONFIG: JSON.stringify(nlsConfig)
        },
        ...startParamsEnv
    };
    const binFolder = environmentService.isBuilt ? join(environmentService.appRoot, 'bin') : join(environmentService.appRoot, 'resources', 'server', 'bin-dev');
    const remoteCliBinFolder = join(binFolder, 'remote-cli'); // contains the `code` command that can talk to the remote server
    let PATH = readCaseInsensitive(env, 'PATH');
    if (PATH) {
        PATH = remoteCliBinFolder + delimiter + PATH;
    }
    else {
        PATH = remoteCliBinFolder;
    }
    setCaseInsensitive(env, 'PATH', PATH);
    if (!environmentService.args['without-browser-env-var']) {
        env.BROWSER = join(binFolder, 'helpers', isWindows ? 'browser.cmd' : 'browser.sh'); // a command that opens a browser on the local machine
    }
    env.VSCODE_RECONNECTION_GRACE_TIME = String(environmentService.reconnectionGraceTime);
    logService.trace(`[reconnection-grace-time] Setting VSCODE_RECONNECTION_GRACE_TIME env var for extension host: ${environmentService.reconnectionGraceTime}ms (${Math.floor(environmentService.reconnectionGraceTime / 1000)}s)`);
    removeNulls(env);
    return env;
}
class ConnectionData {
    constructor(socket, initialDataChunk) {
        this.socket = socket;
        this.initialDataChunk = initialDataChunk;
    }
    socketDrain() {
        return this.socket.drain();
    }
    toIExtHostSocketMessage() {
        let skipWebSocketFrames;
        let permessageDeflate;
        let inflateBytes;
        if (this.socket instanceof NodeSocket) {
            skipWebSocketFrames = true;
            permessageDeflate = false;
            inflateBytes = VSBuffer.alloc(0);
        }
        else {
            skipWebSocketFrames = false;
            permessageDeflate = this.socket.permessageDeflate;
            inflateBytes = this.socket.recordedInflateBytes;
            this.socket.setRecordInflateBytes(false);
        }
        return {
            type: 'VSCODE_EXTHOST_IPC_SOCKET',
            initialDataChunk: this.initialDataChunk.buffer.toString('base64'),
            skipWebSocketFrames: skipWebSocketFrames,
            permessageDeflate: permessageDeflate,
            inflateBytes: inflateBytes.buffer.toString('base64'),
        };
    }
}
let ExtensionHostConnection = class ExtensionHostConnection extends Disposable {
    constructor(_reconnectionToken, remoteAddress, socket, initialDataChunk, _environmentService, _logService, _extensionHostStatusService, _configurationService) {
        super();
        this._reconnectionToken = _reconnectionToken;
        this._environmentService = _environmentService;
        this._logService = _logService;
        this._extensionHostStatusService = _extensionHostStatusService;
        this._configurationService = _configurationService;
        this._onClose = this._register(new Emitter());
        this.onClose = this._onClose.event;
        this._canSendSocket = (!isWindows || !this._environmentService.args['socket-path']);
        this._disposed = false;
        this._remoteAddress = remoteAddress;
        this._extensionHostProcess = null;
        this._connectionData = new ConnectionData(socket, initialDataChunk);
        if (!this._canSendSocket && socket instanceof WebSocketNodeSocket) {
            socket.setRecordInflateBytes(false);
        }
        this._log(`New connection established.`);
    }
    dispose() {
        this._cleanResources();
        super.dispose();
    }
    get _logPrefix() {
        return `[${this._remoteAddress}][${this._reconnectionToken.substr(0, 8)}][ExtensionHostConnection] `;
    }
    _log(_str) {
        this._logService.info(`${this._logPrefix}${_str}`);
    }
    _logError(_str) {
        this._logService.error(`${this._logPrefix}${_str}`);
    }
    async _pipeSockets(extHostSocket, connectionData) {
        const disposables = new DisposableStore();
        disposables.add(connectionData.socket);
        disposables.add(toDisposable(() => {
            extHostSocket.destroy();
        }));
        const stopAndCleanup = () => {
            disposables.dispose();
        };
        disposables.add(connectionData.socket.onEnd(stopAndCleanup));
        disposables.add(connectionData.socket.onClose(stopAndCleanup));
        disposables.add(Event.fromNodeEventEmitter(extHostSocket, 'end')(stopAndCleanup));
        disposables.add(Event.fromNodeEventEmitter(extHostSocket, 'close')(stopAndCleanup));
        disposables.add(Event.fromNodeEventEmitter(extHostSocket, 'error')(stopAndCleanup));
        disposables.add(connectionData.socket.onData((e) => extHostSocket.write(e.buffer)));
        disposables.add(Event.fromNodeEventEmitter(extHostSocket, 'data')((e) => {
            connectionData.socket.write(VSBuffer.wrap(e));
        }));
        if (connectionData.initialDataChunk.byteLength > 0) {
            extHostSocket.write(connectionData.initialDataChunk.buffer);
        }
    }
    async _sendSocketToExtensionHost(extensionHostProcess, connectionData) {
        // Make sure all outstanding writes have been drained before sending the socket
        await connectionData.socketDrain();
        const msg = connectionData.toIExtHostSocketMessage();
        let socket;
        if (connectionData.socket instanceof NodeSocket) {
            socket = connectionData.socket.socket;
        }
        else {
            socket = connectionData.socket.socket.socket;
        }
        extensionHostProcess.send(msg, socket);
    }
    shortenReconnectionGraceTimeIfNecessary() {
        if (!this._extensionHostProcess) {
            return;
        }
        const msg = {
            type: 'VSCODE_EXTHOST_IPC_REDUCE_GRACE_TIME'
        };
        this._extensionHostProcess.send(msg);
    }
    acceptReconnection(remoteAddress, _socket, initialDataChunk) {
        this._remoteAddress = remoteAddress;
        this._log(`The client has reconnected.`);
        if (!this._canSendSocket && _socket instanceof WebSocketNodeSocket) {
            _socket.setRecordInflateBytes(false);
        }
        const connectionData = new ConnectionData(_socket, initialDataChunk);
        if (!this._extensionHostProcess) {
            // The extension host didn't even start up yet
            this._connectionData = connectionData;
            return;
        }
        this._sendSocketToExtensionHost(this._extensionHostProcess, connectionData);
    }
    _cleanResources() {
        if (this._disposed) {
            // already called
            return;
        }
        this._disposed = true;
        if (this._connectionData) {
            this._connectionData.socket.end();
            this._connectionData = null;
        }
        if (this._extensionHostProcess) {
            this._extensionHostProcess.kill();
            this._extensionHostProcess = null;
        }
        this._onClose.fire(undefined);
    }
    async start(startParams) {
        try {
            let execArgv = process.execArgv ? process.execArgv.filter(a => !/^--inspect(-brk)?=/.test(a)) : [];
            // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
            if (startParams.port && !process.pkg) {
                execArgv = [
                    `--inspect${startParams.break ? '-brk' : ''}=${startParams.port}`,
                    '--experimental-network-inspection'
                ];
            }
            const env = await buildUserEnvironment(startParams.env, true, startParams.language, this._environmentService, this._logService, this._configurationService);
            removeDangerousEnvVariables(env);
            let extHostNamedPipeServer;
            if (this._canSendSocket) {
                writeExtHostConnection(new SocketExtHostConnection(), env);
                extHostNamedPipeServer = null;
            }
            else {
                const { namedPipeServer, pipeName } = await this._listenOnPipe();
                writeExtHostConnection(new IPCExtHostConnection(pipeName), env);
                extHostNamedPipeServer = namedPipeServer;
            }
            const opts = {
                env,
                execArgv,
                silent: true
            };
            // Refs https://github.com/microsoft/vscode/issues/189805
            opts.execArgv.unshift('--dns-result-order=ipv4first');
            // Run Extension Host as fork of current process
            const args = ['--type=extensionHost', `--transformURIs`];
            const useHostProxy = this._environmentService.args['use-host-proxy'];
            args.push(`--useHostProxy=${useHostProxy ? 'true' : 'false'}`);
            if (this._configurationService.getValue('extensions.supportNodeGlobalNavigator')) {
                args.push('--supportGlobalNavigator');
            }
            this._extensionHostProcess = cp.fork(FileAccess.asFileUri('bootstrap-fork').fsPath, args, opts);
            const pid = this._extensionHostProcess.pid;
            this._log(`<${pid}> Launched Extension Host Process.`);
            // Catch all output coming from the extension host process
            this._extensionHostProcess.stdout.setEncoding('utf8');
            this._extensionHostProcess.stderr.setEncoding('utf8');
            const onStdout = Event.fromNodeEventEmitter(this._extensionHostProcess.stdout, 'data');
            const onStderr = Event.fromNodeEventEmitter(this._extensionHostProcess.stderr, 'data');
            this._register(onStdout((e) => this._log(`<${pid}> ${e}`)));
            this._register(onStderr((e) => this._log(`<${pid}><stderr> ${e}`)));
            // Lifecycle
            this._extensionHostProcess.on('error', (err) => {
                this._logError(`<${pid}> Extension Host Process had an error`);
                this._logService.error(err);
                this._cleanResources();
            });
            this._extensionHostProcess.on('exit', (code, signal) => {
                this._extensionHostStatusService.setExitInfo(this._reconnectionToken, { code, signal });
                this._log(`<${pid}> Extension Host Process exited with code: ${code}, signal: ${signal}.`);
                this._cleanResources();
            });
            if (extHostNamedPipeServer) {
                extHostNamedPipeServer.on('connection', (socket) => {
                    extHostNamedPipeServer.close();
                    this._pipeSockets(socket, this._connectionData);
                });
            }
            else {
                const messageListener = (msg) => {
                    if (msg.type === 'VSCODE_EXTHOST_IPC_READY') {
                        this._extensionHostProcess.removeListener('message', messageListener);
                        this._sendSocketToExtensionHost(this._extensionHostProcess, this._connectionData);
                        this._connectionData = null;
                    }
                };
                this._extensionHostProcess.on('message', messageListener);
            }
        }
        catch (error) {
            console.error('ExtensionHostConnection errored');
            if (error) {
                console.error(error);
            }
        }
    }
    _listenOnPipe() {
        return new Promise((resolve, reject) => {
            const pipeName = createRandomIPCHandle();
            const namedPipeServer = net.createServer();
            namedPipeServer.on('error', reject);
            namedPipeServer.listen(pipeName, () => {
                namedPipeServer?.removeListener('error', reject);
                resolve({ pipeName, namedPipeServer });
            });
        });
    }
};
ExtensionHostConnection = __decorate([
    __param(4, IServerEnvironmentService),
    __param(5, ILogService),
    __param(6, IExtensionHostStatusService),
    __param(7, IConfigurationService)
], ExtensionHostConnection);
export { ExtensionHostConnection };
function readCaseInsensitive(env, key) {
    const pathKeys = Object.keys(env).filter(k => k.toLowerCase() === key.toLowerCase());
    const pathKey = pathKeys.length > 0 ? pathKeys[0] : key;
    return env[pathKey];
}
function setCaseInsensitive(env, key, value) {
    const pathKeys = Object.keys(env).filter(k => k.toLowerCase() === key.toLowerCase());
    const pathKey = pathKeys.length > 0 ? pathKeys[0] : key;
    env[pathKey] = value;
}
function removeNulls(env) {
    // Don't delete while iterating the object itself
    for (const key of Object.keys(env)) {
        if (env[key] === null) {
            delete env[key];
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uSG9zdENvbm5lY3Rpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXJ2ZXIvbm9kZS9leHRlbnNpb25Ib3N0Q29ubmVjdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUNwQyxPQUFPLEtBQUssR0FBRyxNQUFNLEtBQUssQ0FBQztBQUMzQixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDdkQsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMzRixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDMUQsT0FBTyxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUM1RCxPQUFPLEVBQXVCLFNBQVMsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9FLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxVQUFVLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM5RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUM3RixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFL0QsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDNUUsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDOUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0s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