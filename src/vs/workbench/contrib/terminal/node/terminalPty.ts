/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as objects from 'vs/base/common/objects';
import * as platform from 'vs/base/common/platform';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { Server, createServer, Socket } from 'net';
import { PersistentProtocol } from 'vs/base/parts/ipc/common/ipc.net';
import { fork, ChildProcess } from 'child_process';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import { Event, Emitter } from 'vs/base/common/event';
import { IRemoteConsoleLog, log } from 'vs/base/common/console';
import { generateRandomPipeName, NodeSocket } from 'vs/base/parts/ipc/node/ipc.net';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { isMessageOfType, MessageType } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { VSBuffer } from 'vs/base/common/buffer';
import { IPtyInitData } from 'vs/workbench/contrib/terminal/node/terminal';

export class TerminalPty {

	private readonly _onExit: Emitter<[number, string]> = new Emitter<[number, string]>();
	public readonly onExit: Event<[number, string]> = this._onExit.event;

	// State
	private _lastExtensionHostError: string | null;
	private _terminating: boolean;

	private _namedPipeServer: Server | null;
	private _ptyHostProcess: ChildProcess | null;
	private _ptyHostConnection: Socket | null;
	private _messageProtocol: Promise<PersistentProtocol> | null;

	start(): Promise<IMessagePassingProtocol> | null {
		if (this._terminating) {
			// .terminate() was called
			return null;
		}

		if (!this._messageProtocol) {
			this._messageProtocol = Promise.all([
				this._tryListenOnPipe(),
				/*!this._environmentService.args['disable-inspect'] ? this._tryFindDebugPort() : */Promise.resolve(null)
			]).then(data => {
				const pipeName = data[0];
				// const portData = data[1];

				const opts = {
					env: objects.mixin(objects.deepClone(process.env), {
						AMD_ENTRYPOINT: 'vs/workbench/contrib/terminal/node/terminalPtyHostProcess',
						PIPE_LOGGING: 'true',
						VERBOSE_LOGGING: true,
						VSCODE_IPC_HOOK_EXTHOST: pipeName,
						VSCODE_HANDLES_UNCAUGHT_ERRORS: true,
						// VSCODE_LOG_STACK: !this._isExtensionDevTestFromCli && (this._isExtensionDevHost || !this._environmentService.isBuilt || product.quality !== 'stable' || this._environmentService.verbose),
						// VSCODE_LOG_LEVEL: this._environmentService.verbose ? 'trace' : this._environmentService.log
					}),
					// We only detach the extension host on windows. Linux and Mac orphan by default
					// and detach under Linux and Mac create another process group.
					// We detach because we have noticed that when the renderer exits, its child processes
					// (i.e. extension host) are taken down in a brutal fashion by the OS
					detached: !!platform.isWindows,
					execArgv: undefined as string[] | undefined,
					silent: true
				};

				// if (portData && portData.actual) {
				// 	opts.execArgv = [
				// 		// '--nolazy',
				// 		// (this._isExtensionDevDebugBrk ? '--inspect-brk=' : '--inspect=') + portData.actual
				// 	];
				// 	if (!portData.expected) {
				// 		// No one asked for 'inspect' or 'inspect-brk', only us. We add another
				// 		// option such that the extension host can manipulate the execArgv array
				// 		opts.env.VSCODE_PREVENT_FOREIGN_INSPECT = true;
				// 	}
				// }

				const crashReporterOptions = undefined; // TODO@electron pass this in as options to the extension host after verifying this actually works
				if (crashReporterOptions) {
					opts.env.CRASH_REPORTER_START_OPTIONS = JSON.stringify(crashReporterOptions);
				}

				// Run Extension Host as fork of current process
				// this._extensionHostProcess = fork(getPathFromAmdModule(require, 'bootstrap-fork'), ['--type=extensionHost'], opts);
				this._ptyHostProcess = fork(getPathFromAmdModule(require, 'bootstrap-fork'), ['--type=terminal'], opts);

				// Catch all output coming from the pty host process
				type Output = { data: string, format: string[] };
				this._ptyHostProcess.stdout.setEncoding('utf8');
				this._ptyHostProcess.stderr.setEncoding('utf8');
				const onStdout = Event.fromNodeEventEmitter<string>(this._ptyHostProcess.stdout, 'data');
				const onStderr = Event.fromNodeEventEmitter<string>(this._ptyHostProcess.stderr, 'data');
				const onOutput = Event.any(
					Event.map(onStdout, o => ({ data: `%c${o}`, format: [''] })),
					Event.map(onStderr, o => ({ data: `%c${o}`, format: ['color: red'] }))
				);

				// Debounce all output, so we can render it in the Chrome console as a group
				const onDebouncedOutput = Event.debounce<Output>(onOutput, (r, o) => {
					return r
						? { data: r.data + o.data, format: [...r.format, ...o.format] }
						: { data: o.data, format: o.format };
				}, 100);

				// Print out extension host output
				onDebouncedOutput(output => {
					// const inspectorUrlMatch = output.data && output.data.match(/ws:\/\/([^\s]+:(\d+)\/[^\s]+)/);
					// if (inspectorUrlMatch) {
					// if (!this._environmentService.isBuilt) {
					// 	console.log(`%c[Extension Host] %cdebugger inspector at chrome-devtools://devtools/bundled/inspector.html?experiments=true&v8only=true&ws=${inspectorUrlMatch[1]}`, 'color: blue', 'color:');
					// }
					// if (!this._inspectPort) {
					// 	this._inspectPort = Number(inspectorUrlMatch[2]);
					// }
					// } else {
					console.group('Pty Host');
					console.log(output.data, ...output.format);
					console.groupEnd();
					// }
				});

				// Support logging from extension host
				this._ptyHostProcess.on('message', msg => {
					if (msg && (<IRemoteConsoleLog>msg).type === '__$console') {
						this._logExtensionHostMessage(<IRemoteConsoleLog>msg);
					}
				});

				// Lifecycle
				this._ptyHostProcess.on('error', (err) => this._onExtHostProcessError(err));
				this._ptyHostProcess.on('exit', (code: number, signal: string) => this._onExtHostProcessExit(code, signal));

				// Notify debugger that we are ready to attach to the process if we run a development extension
				// if (portData) {
				// 	if (this._isExtensionDevHost && portData.actual && this._isExtensionDevDebug && this._environmentService.debugExtensionHost.debugId) {
				// 		this._extensionHostDebugService.attachSession(this._environmentService.debugExtensionHost.debugId, portData.actual);
				// 	}
				// 	this._inspectPort = portData.actual;
				// }

				// Help in case we fail to start it
				// let startupTimeoutHandle: any;
				// if (!this._environmentService.isBuilt && !this._environmentService.configuration.remoteAuthority || this._isExtensionDevHost) {
				// 	startupTimeoutHandle = setTimeout(() => {
				// 		const msg = this._isExtensionDevDebugBrk
				// 			? nls.localize('extensionHost.startupFailDebug', "Extension host did not start in 10 seconds, it might be stopped on the first line and needs a debugger to continue.")
				// 			: nls.localize('extensionHost.startupFail', "Extension host did not start in 10 seconds, that might be a problem.");

				// 		this._notificationService.prompt(Severity.Warning, msg,
				// 			[{
				// 				label: nls.localize('reloadWindow', "Reload Window"),
				// 				run: () => this._windowService.reloadWindow()
				// 			}],
				// 			{ sticky: true }
				// 		);
				// 	}, 10000);
				// }

				// Initialize extension host process with hand shakes
				return this._tryExtHostHandshake().then((protocol) => {
					// clearTimeout(startupTimeoutHandle);
					return protocol;
				});
			});
		}

		return this._messageProtocol;
	}

	/**
	 * Start a server (`this._namedPipeServer`) that listens on a named pipe and return the named pipe name.
	 */
	private _tryListenOnPipe(): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			const pipeName = generateRandomPipeName();

			this._namedPipeServer = createServer();
			this._namedPipeServer.on('error', reject);
			this._namedPipeServer.listen(pipeName, () => {
				if (this._namedPipeServer) {
					this._namedPipeServer.removeListener('error', reject);
				}
				resolve(pipeName);
			});
		});
	}

	private _tryExtHostHandshake(): Promise<PersistentProtocol> {

		return new Promise<PersistentProtocol>((resolve, reject) => {

			// Wait for the extension host to connect to our named pipe
			// and wrap the socket in the message passing protocol
			let handle = setTimeout(() => {
				if (this._namedPipeServer) {
					this._namedPipeServer.close();
					this._namedPipeServer = null;
				}
				reject('timeout');
			}, 60 * 1000);

			this._namedPipeServer!.on('connection', socket => {
				console.log('pipe server connection');
				clearTimeout(handle);
				if (this._namedPipeServer) {
					this._namedPipeServer.close();
					this._namedPipeServer = null;
				}
				this._ptyHostConnection = socket;

				// using a buffered message protocol here because between now
				// and the first time a `then` executes some messages might be lost
				// unless we immediately register a listener for `onMessage`.
				resolve(new PersistentProtocol(new NodeSocket(this._ptyHostConnection)));
			});

		}).then((protocol) => {

			// 1) wait for the incoming `ready` event and send the initialization data.
			// 2) wait for the incoming `initialized` event.
			return new Promise<PersistentProtocol>((resolve, reject) => {

				let timeoutHandle: NodeJS.Timer;
				const installTimeoutCheck = () => {
					timeoutHandle = setTimeout(() => {
						reject('timeout');
					}, 60 * 1000);
				};
				const uninstallTimeoutCheck = () => {
					clearTimeout(timeoutHandle);
				};

				// Wait 60s for the ready message
				installTimeoutCheck();

				const disposable = protocol.onMessage(msg => {

					if (isMessageOfType(msg, MessageType.Ready)) {
						// 1) Extension Host is ready to receive messages, initialize it
						uninstallTimeoutCheck();

						protocol.send(VSBuffer.fromString(JSON.stringify(this._createPtyInitData())));
						return;
					}

					if (isMessageOfType(msg, MessageType.Initialized)) {
						// 2) Extension Host is initialized
						uninstallTimeoutCheck();

						// stop listening for messages here
						disposable.dispose();

						// release this promise
						resolve(protocol);
						return;
					}

					console.error(`received unexpected message during handshake phase from the extension host: `, msg);
				});

			});

		});
	}

	private _createPtyInitData(): IPtyInitData {
		console.log('create init data');
		return {
			cwd: '_cwd_',
			executable: '_executable_',
			parentPid: process.pid
		};
	}

	private _logExtensionHostMessage(entry: IRemoteConsoleLog) {

		// Send to local console unless we run tests from cli
		// if (!this._isExtensionDevTestFromCli) {
		log(entry, 'Extension Host');
		// }

		// Log on main side if running tests from cli
		// if (this._isExtensionDevTestFromCli) {
		// 	this._windowsService.log(entry.severity, parse(entry).args);
		// }

		// Broadcast to other windows if we are in development mode
		// else if (this._environmentService.debugExtensionHost.debugId && (!this._environmentService.isBuilt || this._isExtensionDevHost)) {
		// 	this._extensionHostDebugService.logToSession(this._environmentService.debugExtensionHost.debugId, entry);
		// }
	}

	private _onExtHostProcessError(err: any): void {
		let errorMessage = toErrorMessage(err);
		if (errorMessage === this._lastExtensionHostError) {
			return; // prevent error spam
		}

		this._lastExtensionHostError = errorMessage;

		// this._notificationService.error(nls.localize('extensionHost.error', "Error from the extension host: {0}", errorMessage));
	}

	private _onExtHostProcessExit(code: number, signal: string): void {
		if (this._terminating) {
			// Expected termination path (we asked the process to terminate)
			return;
		}

		this._onExit.fire([code, signal]);
	}
}
