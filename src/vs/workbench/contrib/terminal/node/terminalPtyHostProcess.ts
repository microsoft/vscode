/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as net from 'net';
import * as nativeWatchdog from 'native-watchdog';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { BufferedEmitter, PersistentProtocol, ProtocolConstants } from 'vs/base/parts/ipc/common/ipc.net';
import { VSBuffer } from 'vs/base/common/buffer';
import { isMessageOfType, MessageType, IExtHostSocketMessage, IExtHostReadyMessage, createMessageOfType } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { Event } from 'vs/base/common/event';
import { NodeSocket } from 'vs/base/parts/ipc/node/ipc.net';
import { IPtyInitData } from 'vs/workbench/contrib/terminal/node/terminal';
import { onUnexpectedError } from 'vs/base/common/errors';

startExtensionHostProcess();

export async function startExtensionHostProcess(): Promise<void> {

	const protocol = await createExtHostProtocol();
	console.log('created ext host protocol');
	const renderer = await connectToRenderer(protocol);
	console.log('connected to renderer');

	renderer.protocol.onMessage(m => {
		renderer.protocol.send(VSBuffer.wrap(Buffer.from('hello world from host process', 'base64')));
	});
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
					onTerminate();
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
	};
}

function _createExtHostProtocol(): Promise<IMessagePassingProtocol> {
	if (process.env.VSCODE_EXTHOST_WILL_SEND_SOCKET) {

		return new Promise<IMessagePassingProtocol>((resolve, reject) => {

			let protocol: PersistentProtocol | null = null;

			let timer = setTimeout(() => {
				reject(new Error('VSCODE_EXTHOST_IPC_SOCKET timeout'));
			}, 60000);

			let disconnectWaitTimer: NodeJS.Timeout | null = null;

			process.on('message', (msg: IExtHostSocketMessage, handle: net.Socket) => {
				if (msg && msg.type === 'VSCODE_EXTHOST_IPC_SOCKET') {
					const initialDataChunk = VSBuffer.wrap(Buffer.from(msg.initialDataChunk, 'base64'));
					let socket: NodeSocket;// | WebSocketNodeSocket;
					// if (msg.skipWebSocketFrames) {
					socket = new NodeSocket(handle);
					// } else {
					// 	socket = new WebSocketNodeSocket(new NodeSocket(handle));
					// }
					if (protocol) {
						// reconnection case
						if (disconnectWaitTimer) {
							clearTimeout(disconnectWaitTimer);
							disconnectWaitTimer = null;
						}
						protocol.beginAcceptReconnection(socket, initialDataChunk);
						protocol.endAcceptReconnection();
					} else {
						clearTimeout(timer);
						protocol = new PersistentProtocol(socket, initialDataChunk);
						protocol.onClose(() => onTerminate());
						resolve(protocol);

						if (msg.skipWebSocketFrames) {
							// Wait for rich client to reconnect
							protocol.onSocketClose(() => {
								// The socket has closed, let's give the renderer a certain amount of time to reconnect
								disconnectWaitTimer = setTimeout(() => {
									disconnectWaitTimer = null;
									onTerminate();
								}, ProtocolConstants.ReconnectionGraceTime);
							});
						} else {
							// Do not wait for web companion to reconnect
							protocol.onSocketClose(() => {
								onTerminate();
							});
						}
					}
				}
			});

			// Now that we have managed to install a message listener, ask the other side to send us the socket
			const req: IExtHostReadyMessage = { type: 'VSCODE_EXTHOST_IPC_READY' };
			if (process.send) {
				process.send(req);
			}
		});

	} else {

		const pipeName = process.env.VSCODE_IPC_HOOK_EXTHOST!;

		return new Promise<IMessagePassingProtocol>((resolve, reject) => {

			const socket = net.createConnection(pipeName, () => {
				socket.removeListener('error', reject);
				resolve(new PersistentProtocol(new NodeSocket(socket)));
			});
			socket.once('error', reject);

		});
	}
}

interface IRendererConnection {
	protocol: IMessagePassingProtocol;
	initData: IPtyInitData;
}

function connectToRenderer(protocol: IMessagePassingProtocol): Promise<IRendererConnection> {
	return new Promise<IRendererConnection>((c) => {

		// Listen init data message
		const first = protocol.onMessage(raw => {
			first.dispose();

			const initData = <IPtyInitData>JSON.parse(raw.toString());

			// const rendererCommit = initData.commit;
			// const myCommit = product.commit;

			// if (rendererCommit && myCommit) {
			// 	// Running in the built version where commits are defined
			// 	if (rendererCommit !== myCommit) {
			// 		nativeExit(55);
			// 	}
			// }

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
							console.warn(`rejected promise not handled within 1 second: ${e}`);
							if (e.stack) {
								console.warn(`stack trace: ${e.stack}`);
							}
							onUnexpectedError(reason);
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
				onUnexpectedError(err);
			});

			// Kill oneself if one's parent dies. Much drama.
			setInterval(function () {
				try {
					process.kill(initData.parentPid, 0); // throws an exception if the main process doesn't exist anymore.
				} catch (e) {
					onTerminate();
				}
			}, 1000);

			// In certain cases, the event loop can become busy and never yield
			// e.g. while-true or process.nextTick endless loops
			// So also use the native node module to do it from a separate thread
			let watchdog: typeof nativeWatchdog;
			try {
				watchdog = require.__$__nodeRequire('native-watchdog');
				watchdog.start(initData.parentPid);
			} catch (err) {
				// no problem...
				onUnexpectedError(err);
			}

			// Tell the outside that we are initialized
			protocol.send(createMessageOfType(MessageType.Initialized));

			c({ protocol, initData });
		});

		// Tell the outside that we are ready to receive messages
		protocol.send(createMessageOfType(MessageType.Ready));
	});
}

let onTerminate = function () {
	process.exit();
};

// import * as os from 'os';
// // import { spawn, IPtyForkOptions, IWindowsPtyForkOptions } from 'node-pty';
// import { basename } from 'path';

// declare const process: NodeJS.Process;

// // TODO: Fix type ITerminalStartPtyMessage
// const startListener = (e: any) => {
// 	console.log('start');
// 	if (e.type === 'start') {
// 		startProcess(e.executable, e.cwd);
// 		process.off('message', startListener);
// 	}
// };
// process.on('message', startListener);

// console.log('log test');

// function startProcess(executable: string, cwd: string): void {
// 	// let shellName: string;
// 	// if (os.platform() === 'win32') {
// 	// 	shellName = basename(executable || '');
// 	// } else {
// 	// 	// Using 'xterm-256color' here helps ensure that the majority of Linux distributions will use a
// 	// 	// color prompt as defined in the default ~/.bashrc file.
// 	// 	shellName = 'xterm-256color';
// 	// }

// 	console.log('startProcess ' + executable + ', ' + cwd);

// 	// this._initialCwd = cwd;
// 	process.send({
// 		type: 'data',
// 		content: executable + ', ' + cwd
// 	});
// 	// const useConpty = windowsEnableConpty && process.platform === 'win32' && getWindowsBuildNumber() >= 18309;
// 	// const options: pty.IPtyForkOptions | pty.IWindowsPtyForkOptions = {
// 	// 	name: shellName,
// 	// 	cwd,
// 	// 	env,
// 	// 	cols,
// 	// 	rows,
// 	// 	experimentalUseConpty: useConpty,
// 	// 	// This option will force conpty to not redraw the whole viewport on launch
// 	// 	conptyInheritCursor: useConpty && !!shellLaunchConfig.initialText
// 	// };
// }
