/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nativeWatchdog from 'native-watchdog';
import * as net from 'net';
import * as minimist from 'minimist';
import * as dns from 'dns';
import * as performance from 'vs/base/common/performance';
import type { MessagePortMain } from 'vs/base/parts/sandbox/node/electronTypes';
import { isCancellationError, isSigPipeError, onUnexpectedError } from 'vs/base/common/errors';
import { Event } from 'vs/base/common/event';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { PersistentProtocol, ProtocolConstants, BufferedEmitter } from 'vs/base/parts/ipc/common/ipc.net';
import { NodeSocket, WebSocketNodeSocket } from 'vs/base/parts/ipc/node/ipc.net';
import product from 'vs/platform/product/common/product';
import { MessageType, createMessageOfType, isMessageOfType, IExtHostSocketMessage, IExtHostReadyMessage, IExtHostReduceGraceTimeMessage, ExtensionHostExitCode, IExtensionHostInitData } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { ExtensionHostMain, IExitFn } from 'vs/workbench/api/common/extensionHostMain';
import { VSBuffer } from 'vs/base/common/buffer';
import { IURITransformer } from 'vs/base/common/uriIpc';
import { Promises } from 'vs/base/node/pfs';
import { realpath } from 'vs/base/node/extpath';
import { IHostUtils } from 'vs/workbench/api/common/extHostExtensionService';
import { ProcessTimeRunOnceScheduler } from 'vs/base/common/async';
import { boolean } from 'vs/editor/common/config/editorOptions';
import { createURITransformer } from 'vs/workbench/api/node/uriTransformer';
import { ExtHostConnectionType, readExtHostConnection } from 'vs/workbench/services/extensions/common/extensionHostEnv';

import 'vs/workbench/api/common/extHost.common.services';
import 'vs/workbench/api/node/extHost.node.services';

interface ParsedExtHostArgs {
	transformURIs?: boolean;
	skipWorkspaceStorageLock?: boolean;
	useHostProxy?: 'true' | 'false'; // use a string, as undefined is also a valid value
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

// TODO(deepak1556): Remove this once
// https://github.com/electron/electron/pull/39376
// is available. The following API call is needed to get our
// remote integration tests to pass.
(function configureDnsResultOrder() {
	// Refs https://github.com/microsoft/vscode/issues/189805
	dns.setDefaultResultOrder('ipv4first');
})();

const args = minimist(process.argv.slice(2), {
	boolean: [
		'transformURIs',
		'skipWorkspaceStorageLock'
	],
	string: [
		'useHostProxy' // 'true' | 'false' | undefined
	]
}) as ParsedExtHostArgs;

// With Electron 2.x and node.js 8.x the "natives" module
// can cause a native crash (see https://github.com/nodejs/node/issues/19891 and
// https://github.com/electron/electron/issues/10905). To prevent this from
// happening we essentially blocklist this module from getting loaded in any
// extension by patching the node require() function.
(function () {
	const Module = globalThis._VSCODE_NODE_MODULES.module as any;
	const originalLoad = Module._load;

	Module._load = function (request: string) {
		if (request === 'natives') {
			throw new Error('Either the extension or an NPM dependency is using the [unsupported "natives" node module](https://go.microsoft.com/fwlink/?linkid=871887).');
		}

		return originalLoad.apply(this, arguments);
	};
})();

// custom process.exit logic...
const nativeExit: IExitFn = process.exit.bind(process);
function patchProcess(allowExit: boolean) {
	process.exit = function (code?: number) {
		if (allowExit) {
			nativeExit(code);
		} else {
			const err = new Error('An extension called process.exit() and this was prevented.');
			console.warn(err.stack);
		}
	} as (code?: number) => never;

	// override Electron's process.crash() method
	process.crash = function () {
		const err = new Error('An extension called process.crash() and this was prevented.');
		console.warn(err.stack);
	};

	// Set ELECTRON_RUN_AS_NODE environment variable for extensions that use
	// child_process.spawn with process.execPath and expect to run as node process
	// on the desktop.
	// Refs https://github.com/microsoft/vscode/issues/151012#issuecomment-1156593228
	process.env['ELECTRON_RUN_AS_NODE'] = '1';
}

interface IRendererConnection {
	protocol: IMessagePassingProtocol;
	initData: IExtensionHostInitData;
}

// This calls exit directly in case the initialization is not finished and we need to exit
// Otherwise, if initialization completed we go to extensionHostMain.terminate()
let onTerminate = function (reason: string) {
	nativeExit();
};

function _createExtHostProtocol(): Promise<IMessagePassingProtocol> {
	const extHostConnection = readExtHostConnection(process.env);

	if (extHostConnection.type === ExtHostConnectionType.MessagePort) {

		return new Promise<IMessagePassingProtocol>((resolve, reject) => {

			const withPorts = (ports: MessagePortMain[]) => {
				const port = ports[0];
				const onMessage = new BufferedEmitter<VSBuffer>();
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

			process.parentPort.on('message', (e: Electron.MessageEvent) => withPorts(e.ports));
		});

	} else if (extHostConnection.type === ExtHostConnectionType.Socket) {

		return new Promise<PersistentProtocol>((resolve, reject) => {

			let protocol: PersistentProtocol | null = null;

			const timer = setTimeout(() => {
				onTerminate('VSCODE_EXTHOST_IPC_SOCKET timeout');
			}, 60000);

			const reconnectionGraceTime = ProtocolConstants.ReconnectionGraceTime;
			const reconnectionShortGraceTime = ProtocolConstants.ReconnectionShortGraceTime;
			const disconnectRunner1 = new ProcessTimeRunOnceScheduler(() => onTerminate('renderer disconnected for too long (1)'), reconnectionGraceTime);
			const disconnectRunner2 = new ProcessTimeRunOnceScheduler(() => onTerminate('renderer disconnected for too long (2)'), reconnectionShortGraceTime);

			process.on('message', (msg: IExtHostSocketMessage | IExtHostReduceGraceTimeMessage, handle: net.Socket) => {
				if (msg && msg.type === 'VSCODE_EXTHOST_IPC_SOCKET') {
					// Disable Nagle's algorithm. We also do this on the server process,
					// but nodejs doesn't document if this option is transferred with the socket
					handle.setNoDelay(true);

					const initialDataChunk = VSBuffer.wrap(Buffer.from(msg.initialDataChunk, 'base64'));
					let socket: NodeSocket | WebSocketNodeSocket;
					if (msg.skipWebSocketFrames) {
						socket = new NodeSocket(handle, 'extHost-socket');
					} else {
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
					} else {
						clearTimeout(timer);
						protocol = new PersistentProtocol({ socket, initialChunk: initialDataChunk });
						protocol.sendResume();
						protocol.onDidDispose(() => onTerminate('renderer disconnected'));
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
			const req: IExtHostReadyMessage = { type: 'VSCODE_EXTHOST_IPC_READY' };
			process.send?.(req);
		});

	} else {

		const pipeName = extHostConnection.pipeName;

		return new Promise<PersistentProtocol>((resolve, reject) => {

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

async function createExtHostProtocol(): Promise<IMessagePassingProtocol> {

	const protocol = await _createExtHostProtocol();

	return new class implements IMessagePassingProtocol {

		private readonly _onMessage = new BufferedEmitter<VSBuffer>();
		readonly onMessage: Event<VSBuffer> = this._onMessage.event;

		private _terminating: boolean;

		constructor() {
			this._terminating = false;
			protocol.onMessage((msg) => {
				if (isMessageOfType(msg, MessageType.Terminate)) {
					this._terminating = true;
					onTerminate('received terminate message from renderer');
				} else {
					this._onMessage.fire(msg);
				}
			});
		}

		send(msg: any): void {
			if (!this._terminating) {
				protocol.send(msg);
			}
		}

		async drain(): Promise<void> {
			if (protocol.drain) {
				return protocol.drain();
			}
		}
	};
}

function connectToRenderer(protocol: IMessagePassingProtocol): Promise<IRendererConnection> {
	return new Promise<IRendererConnection>((c) => {

		// Listen init data message
		const first = protocol.onMessage(raw => {
			first.dispose();

			const initData = <IExtensionHostInitData>JSON.parse(raw.toString());

			const rendererCommit = initData.commit;
			const myCommit = product.commit;

			if (rendererCommit && myCommit) {
				// Running in the built version where commits are defined
				if (rendererCommit !== myCommit) {
					nativeExit(ExtensionHostExitCode.VersionMismatch);
				}
			}

			if (initData.parentPid) {
				// Kill oneself if one's parent dies. Much drama.
				let epermErrors = 0;
				setInterval(function () {
					try {
						process.kill(initData.parentPid, 0); // throws an exception if the main process doesn't exist anymore.
						epermErrors = 0;
					} catch (e) {
						if (e && e.code === 'EPERM') {
							// Even if the parent process is still alive,
							// some antivirus software can lead to an EPERM error to be thrown here.
							// Let's terminate only if we get 3 consecutive EPERM errors.
							epermErrors++;
							if (epermErrors >= 3) {
								onTerminate(`parent process ${initData.parentPid} does not exist anymore (3 x EPERM): ${e.message} (code: ${e.code}) (errno: ${e.errno})`);
							}
						} else {
							onTerminate(`parent process ${initData.parentPid} does not exist anymore: ${e.message} (code: ${e.code}) (errno: ${e.errno})`);
						}
					}
				}, 1000);

				// In certain cases, the event loop can become busy and never yield
				// e.g. while-true or process.nextTick endless loops
				// So also use the native node module to do it from a separate thread
				let watchdog: typeof nativeWatchdog;
				try {
					watchdog = globalThis._VSCODE_NODE_MODULES['native-watchdog'];
					watchdog.start(initData.parentPid);
				} catch (err) {
					// no problem...
					onUnexpectedError(err);
				}
			}

			// Tell the outside that we are initialized
			protocol.send(createMessageOfType(MessageType.Initialized));

			c({ protocol, initData });
		});

		// Tell the outside that we are ready to receive messages
		protocol.send(createMessageOfType(MessageType.Ready));
	});
}

async function startExtensionHostProcess(): Promise<void> {

	// Print a console message when rejection isn't handled within N seconds. For details:
	// see https://nodejs.org/api/process.html#process_event_unhandledrejection
	// and https://nodejs.org/api/process.html#process_event_rejectionhandled
	const unhandledPromises: Promise<any>[] = [];
	process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
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

	process.on('rejectionHandled', (promise: Promise<any>) => {
		const idx = unhandledPromises.indexOf(promise);
		if (idx >= 0) {
			unhandledPromises.splice(idx, 1);
		}
	});

	// Print a console message when an exception isn't handled.
	process.on('uncaughtException', function (err: Error) {
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
	const hostUtils = new class NodeHost implements IHostUtils {
		declare readonly _serviceBrand: undefined;
		public readonly pid = process.pid;
		exit(code: number) { nativeExit(code); }
		fsExists(path: string) { return Promises.exists(path); }
		fsRealpath(path: string) { return realpath(path); }
	};

	// Attempt to load uri transformer
	let uriTransformer: IURITransformer | null = null;
	if (initData.remote.authority && args.transformURIs) {
		uriTransformer = createURITransformer(initData.remote.authority);
	}

	const extensionHostMain = new ExtensionHostMain(
		renderer.protocol,
		initData,
		hostUtils,
		uriTransformer
	);

	// rewrite onTerminate-function to be a proper shutdown
	onTerminate = (reason: string) => extensionHostMain.terminate(reason);
}

startExtensionHostProcess().catch((err) => console.log(err));
