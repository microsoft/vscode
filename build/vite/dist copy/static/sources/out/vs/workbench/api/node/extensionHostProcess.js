/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import minimist from 'minimist';
import * as net from 'net';
import { ProcessTimeRunOnceScheduler } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { PendingMigrationError, isCancellationError, isSigPipeError, onUnexpectedError, onUnexpectedExternalError } from '../../../base/common/errors.js';
import { Event } from '../../../base/common/event.js';
import * as performance from '../../../base/common/performance.js';
import { Promises } from '../../../base/node/pfs.js';
import { BufferedEmitter, PersistentProtocol } from '../../../base/parts/ipc/common/ipc.net.js';
import { NodeSocket, WebSocketNodeSocket } from '../../../base/parts/ipc/node/ipc.net.js';
import { boolean } from '../../../editor/common/config/editorOptions.js';
import product from '../../../platform/product/common/product.js';
import { ExtensionHostMain } from '../common/extensionHostMain.js';
import { createURITransformer } from '../../../base/common/uriTransformer.js';
import { readExtHostConnection } from '../../services/extensions/common/extensionHostEnv.js';
import { createMessageOfType, isMessageOfType } from '../../services/extensions/common/extensionHostProtocol.js';
import '../common/extHost.common.services.js';
import './extHost.node.services.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// silence experimental warnings when in development
if (process.env.VSCODE_DEV) {
    const warningListeners = process.listeners('warning');
    process.removeAllListeners('warning');
    process.on('warning', (warning) => {
        if (warning.code === 'ExperimentalWarning' || warning.name === 'ExperimentalWarning' || warning.name === 'DeprecationWarning') {
            console.debug(warning);
            return;
        }
        warningListeners[0](warning);
    });
}
// workaround for https://github.com/microsoft/vscode/issues/85490
// remove --inspect-port=0 after start so that it doesn't trigger LSP debugging
(function removeInspectPort() {
    for (let i = 0; i < process.execArgv.length; i++) {
        if (process.execArgv[i] === '--inspect-port=0') {
            process.execArgv.splice(i, 1);
            i--;
        }
    }
})();
const args = minimist(process.argv.slice(2), {
    boolean: [
        'transformURIs',
        'skipWorkspaceStorageLock',
        'supportGlobalNavigator',
    ],
    string: [
        'useHostProxy' // 'true' | 'false' | undefined
    ]
});
// With Electron 2.x and node.js 8.x the "natives" module
// can cause a native crash (see https://github.com/nodejs/node/issues/19891 and
// https://github.com/electron/electron/issues/10905). To prevent this from
// happening we essentially blocklist this module from getting loaded in any
// extension by patching the node require() function.
(function () {
    const Module = require('module');
    const originalLoad = Module._load;
    Module._load = function (request) {
        if (request === 'natives') {
            throw new Error('Either the extension or an NPM dependency is using the [unsupported "natives" node module](https://go.microsoft.com/fwlink/?linkid=871887).');
        }
        return originalLoad.apply(this, arguments);
    };
})();
// custom process.exit logic...
const nativeExit = process.exit.bind(process);
const nativeOn = process.on.bind(process);
function patchProcess(allowExit) {
    process.exit = function (code) {
        if (allowExit) {
            nativeExit(code);
        }
        else {
            const err = new Error('An extension called process.exit() and this was prevented.');
            console.warn(err.stack);
        }
    };
    // override Electron's process.crash() method
    // eslint-disable-next-line local/code-no-any-casts
    process /* bypass layer checker */.crash = function () {
        const err = new Error('An extension called process.crash() and this was prevented.');
        console.warn(err.stack);
    };
    // Set ELECTRON_RUN_AS_NODE environment variable for extensions that use
    // child_process.spawn with process.execPath and expect to run as node process
    // on the desktop.
    // Refs https://github.com/microsoft/vscode/issues/151012#issuecomment-1156593228
    process.env['ELECTRON_RUN_AS_NODE'] = '1';
    // eslint-disable-next-line local/code-no-any-casts
    process.on = function (event, listener) {
        if (event === 'uncaughtException') {
            const actualListener = listener;
            listener = function (...args) {
                try {
                    return actualListener.apply(undefined, args);
                }
                catch {
                    // DO NOT HANDLE NOR PRINT the error here because this can and will lead to
                    // more errors which will cause error handling to be reentrant and eventually
                    // overflowing the stack. Do not be sad, we do handle and annotate uncaught
                    // errors properly in 'extensionHostMain'
                }
            };
        }
        nativeOn(event, listener);
    };
}
// NodeJS since v21 defines navigator as a global object. This will likely surprise many extensions and potentially break them
// because `navigator` has historically often been used to check if running in a browser (vs running inside NodeJS)
if (!args.supportGlobalNavigator) {
    Object.defineProperty(globalThis, 'navigator', {
        get: () => {
            onUnexpectedExternalError(new PendingMigrationError('navigator is now a global in nodejs, please see https://aka.ms/vscode-extensions/navigator for additional info on this error.'));
            return undefined;
        }
    });
}
// This calls exit directly in case the initialization is not finished and we need to exit
// Otherwise, if initialization completed we go to extensionHostMain.terminate()
let onTerminate = function (reason) {
    nativeExit();
};
function readReconnectionValue(envKey, fallback) {
    const raw = process.env[envKey];
    if (typeof raw !== 'string' || raw.trim().length === 0) {
        console.log(`[reconnection-grace-time] Extension host: env var ${envKey} not set, using default: ${fallback}ms (${Math.floor(fallback / 1000)}s)`);
        return fallback;
    }
    const parsed = Number(raw);
    if (!isFinite(parsed) || parsed < 0) {
        console.log(`[reconnection-grace-time] Extension host: env var ${envKey} invalid value '${raw}', using default: ${fallback}ms (${Math.floor(fallback / 1000)}s)`);
        return fallback;
    }
    const millis = Math.floor(parsed);
    const result = millis > Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : millis;
    console.log(`[reconnection-grace-time] Extension host: read ${envKey}=${raw}ms (${Math.floor(result / 1000)}s)`);
    return result;
}
function _createExtHostProtocol() {
    const extHostConnection = readExtHostConnection(process.env);
    if (extHostConnection.type === 3 /* ExtHostConnectionType.MessagePort */) {
        return new Promise((resolve, reject) => {
            const withPorts = (ports) => {
                const port = ports[0];
                const onMessage = new BufferedEmitter();
                port.on('message', (e) => onMessage.fire(VSBuffer.wrap(e.data)));
                port.on('close', () => {
                    onTerminate('renderer closed the MessagePort');
                });
                port.start();
                resolve({
                    onMessage: onMessage.event,
                    send: message => port.postMessage(message.buffer)
                });
            };
            process.parentPort.on('message', (e) => withPorts(e.ports));
        });
    }
    else if (extHostConnection.type === 2 /* ExtHostConnectionType.Socket */) {
        return new Promise((resolve, reject) => {
            let protocol = null;
            const timer = setTimeout(() => {
                onTerminate('VSCODE_EXTHOST_IPC_SOCKET timeout');
            }, 60000);
            const reconnectionGraceTime = readReconnectionValue('VSCODE_RECONNECTION_GRACE_TIME', 10800000 /* ProtocolConstants.ReconnectionGraceTime */);
            const reconnectionShortGraceTime = reconnectionGraceTime > 0 ? Math.min(300000 /* ProtocolConstants.ReconnectionShortGraceTime */, reconnectionGraceTime) : 0;
            const disconnectRunner1 = new ProcessTimeRunOnceScheduler(() => onTerminate('renderer disconnected for too long (1)'), reconnectionGraceTime);
            const disconnectRunner2 = new ProcessTimeRunOnceScheduler(() => onTerminate('renderer disconnected for too long (2)'), reconnectionShortGraceTime);
            process.on('message', (msg, handle) => {
                if (msg && msg.type === 'VSCODE_EXTHOST_IPC_SOCKET') {
                    // Disable Nagle's algorithm. We also do this on the server process,
                    // but nodejs doesn't document if this option is transferred with the socket
                    handle.setNoDelay(true);
                    const initialDataChunk = VSBuffer.wrap(Buffer.from(msg.initialDataChunk, 'base64'));
                    let socket;
                    if (msg.skipWebSocketFrames) {
                        socket = new NodeSocket(handle, 'extHost-socket');
                    }
                    else {
                        const inflateBytes = VSBuffer.wrap(Buffer.from(msg.inflateBytes, 'base64'));
                        socket = new WebSocketNodeSocket(new NodeSocket(handle, 'extHost-socket'), msg.permessageDeflate, inflateBytes, false);
                    }
                    if (protocol) {
                        // reconnection case
                        disconnectRunner1.cancel();
                        disconnectRunner2.cancel();
                        protocol.beginAcceptReconnection(socket, initialDataChunk);
                        protocol.endAcceptReconnection();
                        protocol.sendResume();
                    }
                    else {
                        clearTimeout(timer);
                        protocol = new PersistentProtocol({ socket, initialChunk: initialDataChunk });
                        protocol.sendResume();
                        Event.once(protocol.onDidDispose)(() => onTerminate('renderer disconnected'));
                        resolve(protocol);
                        // Wait for rich client to reconnect
                        protocol.onSocketClose(() => {
                            // The socket has closed, let's give the renderer a certain amount of time to reconnect
                            disconnectRunner1.schedule();
                        });
                    }
                }
                if (msg && msg.type === 'VSCODE_EXTHOST_IPC_REDUCE_GRACE_TIME') {
                    if (disconnectRunner2.isScheduled()) {
                        // we are disconnected and already running the short reconnection timer
                        return;
                    }
                    if (disconnectRunner1.isScheduled()) {
                        // we are disconnected and running the long reconnection timer
                        disconnectRunner2.schedule();
                    }
                }
            });
            // Now that we have managed to install a message listener, ask the other side to send us the socket
            const req = { type: 'VSCODE_EXTHOST_IPC_READY' };
            process.send?.(req);
        });
    }
    else {
        const pipeName = extHostConnection.pipeName;
        return new Promise((resolve, reject) => {
            const socket = net.createConnection(pipeName, () => {
                socket.removeListener('error', reject);
                const protocol = new PersistentProtocol({ socket: new NodeSocket(socket, 'extHost-renderer') });
                protocol.sendResume();
                resolve(protocol);
            });
            socket.once('error', reject);
            socket.on('close', () => {
                onTerminate('renderer closed the socket');
            });
        });
    }
}
async function createExtHostProtocol() {
    const protocol = await _createExtHostProtocol();
    return new class {
        constructor() {
            this._onMessage = new BufferedEmitter();
            this.onMessage = this._onMessage.event;
            this._terminating = false;
            this._protocolListener = protocol.onMessage((msg) => {
                if (isMessageOfType(msg, 2 /* MessageType.Terminate */)) {
                    this._terminating = true;
                    this._protocolListener.dispose();
                    onTerminate('received terminate message from renderer');
                }
                else {
                    this._onMessage.fire(msg);
                }
            });
        }
        send(msg) {
            if (!this._terminating) {
                protocol.send(msg);
            }
        }
        async drain() {
            if (protocol.drain) {
                return protocol.drain();
            }
        }
    };
}
function connectToRenderer(protocol) {
    return new Promise((c) => {
        // Listen init data message
        const first = protocol.onMessage(raw => {
            first.dispose();
            const initData = JSON.parse(raw.toString());
            const rendererCommit = initData.commit;
            const myCommit = product.commit;
            if (rendererCommit && myCommit) {
                // Running in the built version where commits are defined
                if (rendererCommit !== myCommit) {
                    nativeExit(55 /* ExtensionHostExitCode.VersionMismatch */);
                }
            }
            if (initData.parentPid) {
                // Kill oneself if one's parent dies. Much drama.
                let epermErrors = 0;
                setInterval(function () {
                    try {
                        process.kill(initData.parentPid, 0); // throws an exception if the main process doesn't exist anymore.
                        epermErrors = 0;
                    }
                    catch (e) {
                        if (e && e.code === 'EPERM') {
                            // Even if the parent process is still alive,
                            // some antivirus software can lead to an EPERM error to be thrown here.
                            // Let's terminate only if we get 3 consecutive EPERM errors.
                            epermErrors++;
                            if (epermErrors >= 3) {
                                onTerminate(`parent process ${initData.parentPid} does not exist anymore (3 x EPERM): ${e.message} (code: ${e.code}) (errno: ${e.errno})`);
                            }
                        }
                        else {
                            onTerminate(`parent process ${initData.parentPid} does not exist anymore: ${e.message} (code: ${e.code}) (errno: ${e.errno})`);
                        }
                    }
                }, 1000);
                // In certain cases, the event loop can become busy and never yield
                // e.g. while-true or process.nextTick endless loops
                // So also use the native node module to do it from a separate thread
                let watchdog;
                try {
                    watchdog = require('@vscode/native-watchdog');
                    watchdog.start(initData.parentPid);
                }
                catch (err) {
                    // no problem...
                    onUnexpectedError(err);
                }
            }
            // Tell the outside that we are initialized
            protocol.send(createMessageOfType(0 /* MessageType.Initialized */));
            c({ protocol, initData });
        });
        // Tell the outside that we are ready to receive messages
        protocol.send(createMessageOfType(1 /* MessageType.Ready */));
    });
}
async function startExtensionHostProcess() {
    // Print a console message when rejection isn't handled within N seconds. For details:
    // see https://nodejs.org/api/process.html#process_event_unhandledrejection
    // and https://nodejs.org/api/process.html#process_event_rejectionhandled
    const unhandledPromises = [];
    process.on('unhandledRejection', (reason, promise) => {
        unhandledPromises.push(promise);
        setTimeout(() => {
            const idx = unhandledPromises.indexOf(promise);
            if (idx >= 0) {
                promise.catch(e => {
                    unhandledPromises.splice(idx, 1);
                    if (!isCancellationError(e)) {
                        console.warn(`rejected promise not handled within 1 second: ${e}`);
                        if (e && e.stack) {
                            console.warn(`stack trace: ${e.stack}`);
                        }
                        if (reason) {
                            onUnexpectedError(reason);
                        }
                    }
                });
            }
        }, 1000);
    });
    process.on('rejectionHandled', (promise) => {
        const idx = unhandledPromises.indexOf(promise);
        if (idx >= 0) {
            unhandledPromises.splice(idx, 1);
        }
    });
    // Print a console message when an exception isn't handled.
    process.on('uncaughtException', function (err) {
        if (!isSigPipeError(err)) {
            onUnexpectedError(err);
        }
    });
    performance.mark(`code/extHost/willConnectToRenderer`);
    const protocol = await createExtHostProtocol();
    performance.mark(`code/extHost/didConnectToRenderer`);
    const renderer = await connectToRenderer(protocol);
    performance.mark(`code/extHost/didWaitForInitData`);
    const { initData } = renderer;
    // setup things
    patchProcess(!!initData.environment.extensionTestsLocationURI); // to support other test frameworks like Jasmin that use process.exit (https://github.com/microsoft/vscode/issues/37708)
    initData.environment.useHostProxy = args.useHostProxy !== undefined ? args.useHostProxy !== 'false' : undefined;
    initData.environment.skipWorkspaceStorageLock = boolean(args.skipWorkspaceStorageLock, false);
    // host abstraction
    const hostUtils = new class NodeHost {
        constructor() {
            this.pid = process.pid;
        }
        exit(code) { nativeExit(code); }
        fsExists(path) { return Promises.exists(path); }
        fsRealpath(path) { return Promises.realpath(path); }
    };
    // Attempt to load uri transformer
    let uriTransformer = null;
    if (initData.remote.authority && args.transformURIs) {
        uriTransformer = createURITransformer(initData.remote.authority);
    }
    const extensionHostMain = new ExtensionHostMain(renderer.protocol, initData, hostUtils, uriTransformer);
    // rewrite onTerminate-function to be a proper shutdown
    onTerminate = (reason) => extensionHostMain.terminate(reason);
}
startExtensionHostProcess().catch((err) => console.log(err));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uSG9zdFByb2Nlc3MuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL25vZGUvZXh0ZW5zaW9uSG9zdFByb2Nlc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxRQUFRLE1BQU0sVUFBVSxDQUFDO0FBRWhDLE9BQU8sS0FBSyxHQUFHLE1BQU0sS0FBSyxDQUFDO0FBQzNCLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzVFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsbUJBQW1CLEVBQUUsY0FBYyxFQUFFLGlCQUFpQixFQUFFLHlCQUF5QixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDMUosT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RELE9BQU8sS0FBSyxXQUFXLE1BQU0scUNBQXFDLENBQUM7QUFFbkUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBRXJELE9BQU8sRUFBRSxlQUFlLEVBQUUsa0JBQWtCLEVBQXFCLE1BQU0sMkNBQTJDLENBQUM7QUFDbkgsT0FBTyxFQUFFLFVBQVUsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRTFGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN6RSxPQUFPLE9BQU8sTUFBTSw2Q0FBNkMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsaUJBQWlCLEVBQVcsTUFBTSxnQ0FBZ0MsQ0FBQztBQUU1RSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUM5RSxPQUFPLEVBQXlCLHFCQUFxQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDcEgsT0FBTyxFQUEySSxtQkFBbUIsRUFBRSxlQUFlLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUUxUCxPQUFPLHNDQUFzQyxDQUFDO0FBQzlDLE9BQU8sNEJBQTRCLENBQUM7QUFDcEMsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUM1QyxNQUFNLE9BQU8sR0FBRyxhQUFhLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztBQVMvQyxvREFBb0Q7QUFDcEQsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDO0lBQzVCLE1BQU0sZ0JBQWdCLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUN0RCxPQUFPLENBQUMsa0JBQWtCLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDdEMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxPQUFZLEVBQUUsRUFBRTtRQUN0QyxJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUsscUJBQXFCLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxxQkFBcUIsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLG9CQUFvQixFQUFFLENBQUM7WUFDL0gsT0FBTyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUN2QixPQUFPO1FBQ1IsQ0FBQztRQUVELGdCQUFnQixDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzlCLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUVELGtFQUFrRTtBQUNsRSwrRUFBK0U7QUFDL0UsQ0FBQyxTQUFTLGlCQUFpQjtJQUMxQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUNsRCxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEtBQUssa0JBQWtCLEVBQUUsQ0FBQztZQUNoRCxPQUFPLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDOUIsQ0FBQyxFQUFFLENBQUM7UUFDTCxDQUFDO0lBQ0YsQ0FBQztBQUNGLENBQUMsQ0FBQyxFQUFFLENBQUM7QUFFTCxNQUFNLElBQUksR0FBRyxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUU7SUFDNUMsT0FBTyxFQUFFO1FBQ1IsZUFBZTtRQUNmLDBCQUEwQjtRQUMxQix3QkFBd0I7S0FDeEI7SUFDRCxNQUFNLEVBQUU7UUFDUCxjQUFjLENBQUMsK0JBQStCO0tBQzlDO0NBQ0QsQ0FBc0IsQ0FBQztBQUV4Qix5REFBeUQ7QUFDekQsZ0ZBQWdGO0FBQ2hGLDJFQUEyRTtBQUMzRSw0RUFBNEU7QUFDNUUscURBQXFEO0FBQ3JELENBQUM7SUFDQSxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDakMsTUFBTSxZQUFZLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQztJQUVsQyxNQUFNLENBQUMsS0FBSyxHQUFHLFVBQVUsT0FBZTtRQUN2QyxJQUFJLE9BQU8sS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUMzQixNQUFNLElBQUksS0FBSyxDQUFDLDZJQUE2SSxDQUFDLENBQUM7UUFDaEssQ0FBQztRQUVELE9BQU8sWUFBWSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDNUMsQ0FBQyxDQUFDO0FBQ0gsQ0FBQyxDQUFDLEVBQUUsQ0FBQztBQUVMLCtCQUErQjtBQUMvQixNQUFNLFVBQVUsR0FBWSxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUN2RCxNQUFNLFFBQVEsR0FBRyxPQUFPLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUMxQyxTQUFTLFlBQVksQ0FBQyxTQUFrQjtJQUN2QyxPQUFPLENBQUMsSUFBSSxHQUFHLFVBQVUsSUFBYTtRQUNyQyxJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ2YsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2xCLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxHQUFHLEdBQUcsSUFBSSxLQUFLLENBQUMsNERBQTRELENBQUMsQ0FBQztZQUNwRixPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN6QixDQUFDO0lBQ0YsQ0FBNkIsQ0FBQztJQUU5Qiw2Q0FBNkM7SUFDN0MsbURBQW1EO0lBQ2xELE9BQWMsQ0FBQywwQkFBMkIsQ0FBQyxLQUFLLEdBQUc7UUFDbkQsTUFBTSxHQUFHLEdBQUcsSUFBSSxLQUFLLENBQUMsNkRBQTZELENBQUMsQ0FBQztRQUNyRixPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN6QixDQUFDLENBQUM7SUFFRix3RUFBd0U7SUFDeEUsOEVBQThFO0lBQzlFLGtCQUFrQjtJQUNsQixpRkFBaUY7SUFDakYsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsQ0FBQyxHQUFHLEdBQUcsQ0FBQztJQUUxQyxtREFBbUQ7SUFDbkQsT0FBTyxDQUFDLEVBQUUsR0FBUSxVQUFVLEtBQWEsRUFBRSxRQUFzQztRQUNoRixJQUFJLEtBQUssS0FBSyxtQkFBbUIsRUFBRSxDQUFDO1lBQ25DLE1BQU0sY0FBYyxHQUFHLFFBQVEsQ0FBQztZQUNoQyxRQUFRLEdBQUcsVUFBVSxHQUFHLElBQWU7Z0JBQ3RDLElBQUksQ0FBQztvQkFDSixPQUFPLGNBQWMsQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUM5QyxDQUFDO2dCQUFDLE1BQU0sQ0FBQztvQkFDUiwyRUFBMkU7b0JBQzNFLDZFQUE2RTtvQkFDN0UsMkVBQTJFO29CQUMzRSx5Q0FBeUM7Z0JBQzFDLENBQUM7WUFDRixDQUFDLENBQUM7UUFDSCxDQUFDO1FBQ0QsUUFBUSxDQUFDLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztJQUMzQixDQUFDLENBQUM7QUFFSCxDQUFDO0FBRUQsOEhBQThIO0FBQzlILG1IQUFtSDtBQUNuSCxJQUFJLENBQUMsSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUM7SUFDbEMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxVQUFVLEVBQUUsV0FBVyxFQUFFO1FBQzlDLEdBQUcsRUFBRSxHQUFHLEVBQUU7WUFDVCx5QkFBeUIsQ0FBQyxJQUFJLHFCQUFxQixDQUFDLCtIQUErSCxDQUFDLENBQUMsQ0FBQztZQUN0TCxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO0tBQ0QsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQVFELDBGQUEwRjtBQUMxRixnRkFBZ0Y7QUFDaEYsSUFBSSxXQUFXLEdBQUcsVUFBVSxNQUFjO0lBQ3pDLFVBQVUsRUFBRSxDQUFDO0FBQ2QsQ0FBQyxDQUFDO0FBRUYsU0FBUyxxQkFBcUIsQ0FBQyxNQUFjLEVBQUUsUUFBZ0I7SUFDOUQsTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUNoQyxJQUFJLE9BQU8sR0FBRyxLQUFLLFFBQVEsSUFBSSxHQUFHLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQ3hELE9BQU8sQ0FBQyxHQUFHLENBQUMscURBQXFELE1BQU0sNEJBQTRCLFFBQVEsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbkosT0FBTyxRQUFRLENBQUM7SUFDakIsQ0FBQztJQUNELE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUMzQixJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUNyQyxPQUFPLENBQUMsR0FBRyxDQUFDLHFEQUFxRCxNQUFNLG1CQUFtQixHQUFHLHFCQUFxQixRQUFRLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2xLLE9BQU8sUUFBUSxDQUFDO0lBQ2pCLENBQUM7SUFDRCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ2xDLE1BQU0sTUFBTSxHQUFHLE1BQU0sR0FBRyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO0lBQ25GLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0RBQWtELE1BQU0sSUFBSSxHQUFHLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2pILE9BQU8sTUFBTSxDQUFDO0FBQ2YsQ0FBQztBQUVELFNBQVMsc0JBQXNCO0lBQzlCLE1BQU0saUJBQWlCLEdBQUcscUJBQXFCLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBRTdELElBQUksaUJBQWlCLENBQUMsSUFBSSw4Q0FBc0MsRUFBRSxDQUFDO1FBRWxFLE9BQU8sSUFBSSxPQUFPLENBQTBCLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1lBRS9ELE1BQU0sU0FBUyxHQUFHLENBQUMsS0FBd0IsRUFBRSxFQUFFO2dCQUM5QyxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3RCLE1BQU0sU0FBUyxHQUFHLElBQUksZUFBZSxFQUFZLENBQUM7Z0JBQ2xELElBQUksQ0FBQyxFQUFFLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQy9FLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRTtvQkFDckIsV0FBVyxDQUFDLGlDQUFpQyxDQUFDLENBQUM7Z0JBQ2hELENBQUMsQ0FBQyxDQUFDO2dCQUNILElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFFYixPQUFPLENBQUM7b0JBQ1AsU0FBUyxFQUFFLFNBQVMsQ0FBQyxLQUFLO29CQUMxQixJQUFJLEVBQUUsT0FBTyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUM7aUJBQ2pELENBQUMsQ0FBQztZQUNKLENBQUMsQ0FBQztZQUVELE9BQWdJLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFzQixFQUFFLEVBQUUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDNU0sQ0FBQyxDQUFDLENBQUM7SUFFSixDQUFDO1NBQU0sSUFBSSxpQkFBaUIsQ0FBQyxJQUFJLHlDQUFpQyxFQUFFLENBQUM7UUFFcEUsT0FBTyxJQUFJLE9BQU8sQ0FBcUIsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFFMUQsSUFBSSxRQUFRLEdBQThCLElBQUksQ0FBQztZQUUvQyxNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsR0FBRyxFQUFFO2dCQUM3QixXQUFXLENBQUMsbUNBQW1DLENBQUMsQ0FBQztZQUNsRCxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFFVixNQUFNLHFCQUFxQixHQUFHLHFCQUFxQixDQUFDLGdDQUFnQyx5REFBMEMsQ0FBQztZQUMvSCxNQUFNLDBCQUEwQixHQUFHLHFCQUFxQixHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsNERBQStDLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNqSixNQUFNLGlCQUFpQixHQUFHLElBQUksMkJBQTJCLENBQUMsR0FBRyxFQUFFLENBQUMsV0FBVyxDQUFDLHdDQUF3QyxDQUFDLEVBQUUscUJBQXFCLENBQUMsQ0FBQztZQUM5SSxNQUFNLGlCQUFpQixHQUFHLElBQUksMkJBQTJCLENBQUMsR0FBRyxFQUFFLENBQUMsV0FBVyxDQUFDLHdDQUF3QyxDQUFDLEVBQUUsMEJBQTBCLENBQUMsQ0FBQztZQUVuSixPQUFPLENBQUMsRUFBRSxDQUFDLFNBQVMsRUFBRSxDQUFDLEdBQTJELEVBQUUsTUFBa0IsRUFBRSxFQUFFO2dCQUN6RyxJQUFJLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxLQUFLLDJCQUEyQixFQUFFLENBQUM7b0JBQ3JELG9FQUFvRTtvQkFDcEUsNEVBQTRFO29CQUM1RSxNQUFNLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUV4QixNQUFNLGdCQUFnQixHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQztvQkFDcEYsSUFBSSxNQUF3QyxDQUFDO29CQUM3QyxJQUFJLEdBQUcsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO3dCQUM3QixNQUFNLEdBQUcsSUFBSSxVQUFVLENBQUMsTUFBTSxFQUFFLGdCQUFnQixDQUFDLENBQUM7b0JBQ25ELENBQUM7eUJBQU0sQ0FBQzt3QkFDUCxNQUFNLFlBQVksR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDO3dCQUM1RSxNQUFNLEdBQUcsSUFBSSxtQkFBbUIsQ0FBQyxJQUFJLFVBQVUsQ0FBQyxNQUFNLEVBQUUsZ0JBQWdCLENBQUMsRUFBRSxHQUFHLENBQUMsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLEtBQUssQ0FBQyxDQUFDO29CQUN4SCxDQUFDO29CQUNELElBQUksUUFBUSxFQUFFLENBQUM7d0JBQ2Qsb0JBQW9CO3dCQUNwQixpQkFBaUIsQ0FBQyxNQUFNLEVBQUUsQ0FBQzt3QkFDM0IsaUJBQWlCLENBQUMsTUFBTSxFQUFFLENBQUM7d0JBQzNCLFFBQVEsQ0FBQyx1QkFBdUIsQ0FBQyxNQUFNLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQzt3QkFDM0QsUUFBUSxDQUFDLHFCQUFxQixFQUFFLENBQUM7d0JBQ2pDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsQ0FBQztvQkFDdkIsQ0FBQzt5QkFBTSxDQUFDO3dCQUNQLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQzt3QkFDcEIsUUFBUSxHQUFHLElBQUksa0JBQWtCLENBQUMsRUFBRSxNQUFNLEVBQUUsWUFBWSxFQUFFLGdCQUFnQixFQUFFLENBQUMsQ0FBQzt3QkFDOUUsUUFBUSxDQUFDLFVBQVUsRUFBRSxDQUFDO3dCQUN0QixLQUFLLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxXQUFXLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDO3dCQUM5RSxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7d0JBRWxCLG9DQUFvQzt3QkFDcEMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxHQUFHLEVBQUU7NEJBQzNCLHVGQUF1Rjs0QkFDdkYsaUJBQWlCLENBQUMsUUFBUSxFQUFFLENBQUM7d0JBQzlCLENBQUMsQ0FBQyxDQUFDO29CQUNKLENBQUM7Z0JBQ0YsQ0FBQztnQkFDRCxJQUFJLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxLQUFLLHNDQUFzQyxFQUFFLENBQUM7b0JBQ2hFLElBQUksaUJBQWlCLENBQUMsV0FBVyxFQUFFLEVBQUUsQ0FBQzt3QkFDckMsdUVBQXVFO3dCQUN2RSxPQUFPO29CQUNSLENBQUM7b0JBQ0QsSUFBSSxpQkFBaUIsQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDO3dCQUNyQyw4REFBOEQ7d0JBQzlELGlCQUFpQixDQUFDLFFBQVEsRUFBRSxDQUFDO29CQUM5QixDQUFDO2dCQUNGLENBQUM7WUFDRixDQUFDLENBQUMsQ0FBQztZQUVILG1HQUFtRztZQUNuRyxNQUFNLEdBQUcsR0FBeUIsRUFBRSxJQUFJLEVBQUUsMEJBQTBCLEVBQUUsQ0FBQztZQUN2RSxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDckIsQ0FBQyxDQUFDLENBQUM7SUFFSixDQUFDO1NBQU0sQ0FBQztRQUVQLE1BQU0sUUFBUSxHQUFHLGlCQUFpQixDQUFDLFFBQVEsQ0FBQztRQUU1QyxPQUFPLElBQUksT0FBTyxDQUFxQixDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtZQUUxRCxNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxFQUFFLEdBQUcsRUFBRTtnQkFDbEQsTUFBTSxDQUFDLGNBQWMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQ3ZDLE1BQU0sUUFBUSxHQUFHLElBQUksa0JBQWtCLENBQUMsRUFBRSxNQUFNLEVBQUUsSUFBSSxVQUFVLENBQUMsTUFBTSxFQUFFLGtCQUFrQixDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNoRyxRQUFRLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ3RCLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUNuQixDQUFDLENBQUMsQ0FBQztZQUNILE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBRTdCLE1BQU0sQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRTtnQkFDdkIsV0FBVyxDQUFDLDRCQUE0QixDQUFDLENBQUM7WUFDM0MsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7QUFDRixDQUFDO0FBRUQsS0FBSyxVQUFVLHFCQUFxQjtJQUVuQyxNQUFNLFFBQVEsR0FBRyxNQUFNLHNCQUFzQixFQUFFLENBQUM7SUFFaEQsT0FBTyxJQUFJO1FBUVY7WUFOaUIsZUFBVSxHQUFHLElBQUksZUFBZSxFQUFZLENBQUM7WUFDckQsY0FBUyxHQUFvQixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQztZQU0zRCxJQUFJLENBQUMsWUFBWSxHQUFHLEtBQUssQ0FBQztZQUMxQixJQUFJLENBQUMsaUJBQWlCLEdBQUcsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFO2dCQUNuRCxJQUFJLGVBQWUsQ0FBQyxHQUFHLGdDQUF3QixFQUFFLENBQUM7b0JBQ2pELElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDO29CQUN6QixJQUFJLENBQUMsaUJBQWlCLENBQUMsT0FBTyxFQUFFLENBQUM7b0JBQ2pDLFdBQVcsQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDO2dCQUN6RCxDQUFDO3FCQUFNLENBQUM7b0JBQ1AsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQzNCLENBQUM7WUFDRixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUM7UUFFRCxJQUFJLENBQUMsR0FBUTtZQUNaLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7Z0JBQ3hCLFFBQVEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDcEIsQ0FBQztRQUNGLENBQUM7UUFFRCxLQUFLLENBQUMsS0FBSztZQUNWLElBQUksUUFBUSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNwQixPQUFPLFFBQVEsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUN6QixDQUFDO1FBQ0YsQ0FBQztLQUNELENBQUM7QUFDSCxDQUFDO0FBRUQsU0FBUyxpQkFBaUIsQ0FBQyxRQUFpQztJQUMzRCxPQUFPLElBQUksT0FBTyxDQUFzQixDQUFDLENBQUMsRUFBRSxFQUFFO1FBRTdDLDJCQUEyQjtRQUMzQixNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxFQUFFO1lBQ3RDLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUVoQixNQUFNLFFBQVEsR0FBMkIsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztZQUVwRSxNQUFNLGNBQWMsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDO1lBQ3ZDLE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUM7WUFFaEMsSUFBSSxjQUFjLElBQUksUUFBUSxFQUFFLENBQUM7Z0JBQ2hDLHlEQUF5RDtnQkFDekQsSUFBSSxjQUFjLEtBQUssUUFBUSxFQUFFLENBQUM7b0JBQ2pDLFVBQVUsZ0RBQXVDLENBQUM7Z0JBQ25ELENBQUM7WUFDRixDQUFDO1lBRUQsSUFBSSxRQUFRLENBQUMsU0FBUyxFQUFFLENBQUM7Z0JBQ3hCLGlEQUFpRDtnQkFDakQsSUFBSSxXQUFXLEdBQUcsQ0FBQyxDQUFDO2dCQUNwQixXQUFXLENBQUM7b0JBQ1gsSUFBSSxDQUFDO3dCQUNKLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLGlFQUFpRTt3QkFDdEcsV0FBVyxHQUFHLENBQUMsQ0FBQztvQkFDakIsQ0FBQztvQkFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO3dCQUNaLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssT0FBTyxFQUFFLENBQUM7NEJBQzdCLDZDQUE2Qzs0QkFDN0Msd0VBQXdFOzRCQUN4RSw2REFBNkQ7NEJBQzdELFdBQVcsRUFBRSxDQUFDOzRCQUNkLElBQUksV0FBVyxJQUFJLENBQUMsRUFBRSxDQUFDO2dDQUN0QixXQUFXLENBQUMsa0JBQWtCLFFBQVEsQ0FBQyxTQUFTLHdDQUF3QyxDQUFDLENBQUMsT0FBTyxXQUFXLENBQUMsQ0FBQyxJQUFJLGFBQWEsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUM7NEJBQzVJLENBQUM7d0JBQ0YsQ0FBQzs2QkFBTSxDQUFDOzRCQUNQLFdBQVcsQ0FBQyxrQkFBa0IsUUFBUSxDQUFDLFNBQVMsNEJBQTRCLENBQUMsQ0FBQyxPQUFPLFdBQVcsQ0FBQyxDQUFDLElBQUksYUFBYSxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQzt3QkFDaEksQ0FBQztvQkFDRixDQUFDO2dCQUNGLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFFVCxtRUFBbUU7Z0JBQ25FLG9EQUFvRDtnQkFDcEQscUVBQXFFO2dCQUNyRSxJQUFJLFFBQStCLENBQUM7Z0JBQ3BDLElBQUksQ0FBQztvQkFDSixRQUFRLEdBQUcsT0FBTyxDQUFDLHlCQUF5QixDQUFDLENBQUM7b0JBQzlDLFFBQVEsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUNwQyxDQUFDO2dCQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7b0JBQ2QsZ0JBQWdCO29CQUNoQixpQkFBaUIsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDeEIsQ0FBQztZQUNGLENBQUM7WUFFRCwyQ0FBMkM7WUFDM0MsUUFBUSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsaUNBQXlCLENBQUMsQ0FBQztZQUU1RCxDQUFDLENBQUMsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUMzQixDQUFDLENBQUMsQ0FBQztRQUVILHlEQUF5RDtRQUN6RCxRQUFRLENBQUMsSUFBSSxDQUFDLG1CQUFtQiwyQkFBbUIsQ0FBQyxDQUFDO0lBQ3ZELENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUVELEtBQUssVUFBVSx5QkFBeUI7SUFFdkMsc0ZBQXNGO0lBQ3RGLDJFQUEyRTtJQUMzRSx5RUFBeUU7SUFDekUsTUFBTSxpQkFBaUIsR0FBbUIsRUFBRSxDQUFDO0lBQzdDLE9BQU8sQ0FBQyxFQUFFLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxNQUFXLEVBQUUsT0FBcUIsRUFBRSxFQUFFO1FBQ3ZFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNoQyxVQUFVLENBQUMsR0FBRyxFQUFFO1lBQ2YsTUFBTSxHQUFHLEdBQUcsaUJBQWlCLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQy9DLElBQUksR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDO2dCQUNkLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUU7b0JBQ2pCLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUM7b0JBQ2pDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO3dCQUM3QixPQUFPLENBQUMsSUFBSSxDQUFDLGlEQUFpRCxDQUFDLEVBQUUsQ0FBQyxDQUFDO3dCQUNuRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7NEJBQ2xCLE9BQU8sQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO3dCQUN6QyxDQUFDO3dCQUNELElBQUksTUFBTSxFQUFFLENBQUM7NEJBQ1osaUJBQWlCLENBQUMsTUFBTSxDQUFDLENBQUM7d0JBQzNCLENBQUM7b0JBQ0YsQ0FBQztnQkFDRixDQUFDLENBQUMsQ0FBQztZQUNKLENBQUM7UUFDRixDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDVixDQUFDLENBQUMsQ0FBQztJQUVILE9BQU8sQ0FBQyxFQUFFLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxPQUFxQixFQUFFLEVBQUU7UUFDeEQsTUFBTSxHQUFHLEdBQUcsaUJBQWlCLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQy9DLElBQUksR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ2QsaUJBQWlCLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsQyxDQUFDO0lBQ0YsQ0FBQyxDQUFDLENBQUM7SUFFSCwyREFBMkQ7SUFDM0QsT0FBTyxDQUFDLEVBQUUsQ0FBQyxtQkFBbUIsRUFBRSxVQUFVLEdBQVU7UUFDbkQsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzFCLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3hCLENBQUM7SUFDRixDQUFDLENBQUMsQ0FBQztJQUVILFdBQVcsQ0FBQyxJQUFJLENBQUMsb0NBQW9DLENBQUMsQ0FBQztJQUN2RCxNQUFNLFFBQVEsR0FBRyxNQUFNLHFCQUFxQixFQUFFLENBQUM7SUFDL0MsV0FBVyxDQUFDLElBQUksQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO0lBQ3RELE1BQU0sUUFBUSxHQUFHLE1BQU0saUJBQWlCLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDbkQsV0FBVyxDQUFDLElBQUksQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO0lBQ3BELE1BQU0sRUFBRSxRQUFRLEVBQUUsR0FBRyxRQUFRLENBQUM7SUFDOUIsZUFBZTtJQUNmLFlBQVksQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsd0hBQXdIO0lBQ3hMLFFBQVEsQ0FBQyxXQUFXLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxZQUFZLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO0lBQ2hILFFBQVEsQ0FBQyxXQUFXLENBQUMsd0JBQXdCLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyx3QkFBd0IsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUU5RixtQkFBbUI7SUFDbkIsTUFBTSxTQUFTLEdBQUcsSUFBSSxNQUFNLFFBQVE7UUFBZDtZQUVMLFFBQUcsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDO1FBSW5DLENBQUM7UUFIQSxJQUFJLENBQUMsSUFBWSxJQUFJLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDeEMsUUFBUSxDQUFDLElBQVksSUFBSSxPQUFPLFFBQVEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3hELFVBQVUsQ0FBQyxJQUFZLElBQUksT0FBTyxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUM1RCxDQUFDO0lBRUYsa0NBQWtDO0lBQ2xDLElBQUksY0FBYyxHQUEyQixJQUFJLENBQUM7SUFDbEQsSUFBSSxRQUFRLENBQUMsTUFBTSxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDckQsY0FBYyxHQUFHLG9CQUFvQixDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDbEUsQ0FBQztJQUVELE1BQU0saUJBQWlCLEdBQUcsSUFBSSxpQkFBaUIsQ0FDOUMsUUFBUSxDQUFDLFFBQVEsRUFDakIsUUFBUSxFQUNSLFNBQVMsRUFDVCxjQUFjLENBQ2QsQ0FBQztJQUVGLHVEQUF1RDtJQUN2RCxXQUFXLEdBQUcsQ0FBQyxNQUFjLEVBQUUsRUFBRSxDQUFDLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUN2RSxDQUFDO0FBRUQseUJBQXlCLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyJ9