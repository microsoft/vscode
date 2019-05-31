/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as net from 'net';
import { getNLSConfiguration } from 'vs/agent/remoteLanguagePacks';
import { uriTransformerPath } from 'vs/agent/remoteUriTransformer';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import { join, delimiter } from 'vs/base/common/path';
import { VSBuffer } from 'vs/base/common/buffer';
import { IRemoteConsoleLog } from 'vs/base/common/console';
import { Emitter, Event } from 'vs/base/common/event';
import { NodeSocket, WebSocketNodeSocket } from 'vs/base/parts/ipc/node/ipc.net';
import { getShellEnvironment } from 'vs/code/node/shellEnv';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { ILogService, LogLevel } from 'vs/platform/log/common/log';
import { IRemoteExtensionHostStartParams } from 'vs/platform/remote/common/remoteAgentConnection';
import { IExtHostReadyMessage, IExtHostSocketMessage } from 'vs/workbench/services/extensions/common/extensionHostProtocol';

export class ExtensionHostConnection {

	private _onClose = new Emitter<void>();
	readonly onClose: Event<void> = this._onClose.event;

	private _disposed: boolean;
	private _extensionHostProcess: cp.ChildProcess | null;
	private _rendererConnection: net.Socket | null;
	private _initialDataChunk: VSBuffer | null;
	private _skipWebSocketFrames: boolean;

	constructor(private readonly _environmentService: EnvironmentService, _socket: NodeSocket | WebSocketNodeSocket, initialDataChunk: VSBuffer) {
		this._disposed = false;
		this._extensionHostProcess = null;
		const { skipWebSocketFrames, socket } = this._getUnderlyingSocket(_socket);
		this._skipWebSocketFrames = skipWebSocketFrames;
		this._rendererConnection = socket;
		this._rendererConnection.pause();
		this._initialDataChunk = initialDataChunk;
	}

	private _getUnderlyingSocket(socket: NodeSocket | WebSocketNodeSocket): { skipWebSocketFrames: boolean; socket: net.Socket; } {
		if (socket instanceof NodeSocket) {
			return {
				skipWebSocketFrames: true,
				socket: socket.socket
			};
		} else {
			return {
				skipWebSocketFrames: false,
				socket: socket.socket.socket
			};
		}
	}

	public acceptReconnection(_socket: NodeSocket | WebSocketNodeSocket, initialDataChunk: VSBuffer): void {
		const { skipWebSocketFrames, socket } = this._getUnderlyingSocket(_socket);

		if (!this._extensionHostProcess) {
			// The extension host didn't even start up yet
			this._skipWebSocketFrames = skipWebSocketFrames;
			this._rendererConnection = socket;
			this._rendererConnection.pause();
			this._initialDataChunk = initialDataChunk;
			return;
		}

		socket.pause();
		const msg: IExtHostSocketMessage = {
			type: 'VSCODE_EXTHOST_IPC_SOCKET',
			initialDataChunk: (<Buffer>initialDataChunk.buffer).toString('base64'),
			skipWebSocketFrames: skipWebSocketFrames
		};
		this._extensionHostProcess.send(msg, socket);
	}

	private _cleanResources(): void {
		if (this._disposed) {
			// already called
			return;
		}
		this._disposed = true;
		if (this._rendererConnection) {
			this._rendererConnection.end();
			this._rendererConnection = null;
		}
		if (this._extensionHostProcess) {
			this._extensionHostProcess.kill();
			this._extensionHostProcess = null;
		}
		this._onClose.fire(undefined);
	}

	public async start(startParams: IRemoteExtensionHostStartParams): Promise<void> {
		try {
			const nlsConfig = await getNLSConfiguration(startParams.language, this._environmentService.userDataPath);

			let execArgv = process.execArgv;
			if (startParams.port && !(<any>process).pkg) {
				execArgv = [`--inspect${startParams.break ? '-brk' : ''}=0.0.0.0:${startParams.port}`];
			}

			// TODO@Rob/Alex, we can't get a real log service here because the loglevel is sent over the management connection
			const userShellEnv = await getShellEnvironment(new StubLogService());
			const processEnv = process.env;
			const binFolder = this._environmentService.isBuilt ? join(this._environmentService.appRoot, 'bin') : join(this._environmentService.appRoot, 'resources', 'server', 'bin-dev');
			let PATH = userShellEnv['PATH'] || processEnv['PATH'];
			if (PATH) {
				PATH = binFolder + delimiter + PATH;
			} else {
				PATH = binFolder;
			}
			const opts = {
				env: {
					...processEnv,
					...userShellEnv,
					...{
						AMD_ENTRYPOINT: 'vs/agent/remoteExtensionHostProcess',
						PIPE_LOGGING: 'true',
						VERBOSE_LOGGING: 'true',
						VSCODE_EXTHOST_WILL_SEND_SOCKET: 'true',
						VSCODE_HANDLES_UNCAUGHT_ERRORS: 'true',
						VSCODE_LOG_STACK: 'false',
						VSCODE_NLS_CONFIG: JSON.stringify(nlsConfig, undefined, 0),
						PATH
					}
				},
				execArgv,
				silent: true
			};

			// Run Extension Host as fork of current process
			this._extensionHostProcess = cp.fork(getPathFromAmdModule(require, 'bootstrap-fork'), ['--type=extensionHost', `--uriTransformerPath=${uriTransformerPath}`], opts);

			// Catch all output coming from the extension host process
			this._extensionHostProcess.stdout.setEncoding('utf8');
			this._extensionHostProcess.stderr.setEncoding('utf8');
			const onStdout = Event.fromNodeEventEmitter<string>(this._extensionHostProcess.stdout, 'data');
			const onStderr = Event.fromNodeEventEmitter<string>(this._extensionHostProcess.stderr, 'data');
			onStdout((e) => console.log(`EXTHOST-STDOUT::::::::` + e));
			onStderr((e) => console.log(`EXTHOST-STDERR::::::::` + e));


			// Support logging from extension host
			this._extensionHostProcess.on('message', msg => {
				if (msg && (<IRemoteConsoleLog>msg).type === '__$console') {
					console.log(`EXTHOST-LOG:::::`);
					console.log((<IRemoteConsoleLog>msg).arguments);
					// this._logExtensionHostMessage(<IRemoteConsoleLog>msg);
				}
			});

			// Lifecycle
			this._extensionHostProcess.on('error', (err) => {
				console.log(`EXTHOST: PROCESS ERRORD`);
				console.log(err);
				this._cleanResources();
			});

			this._extensionHostProcess.on('exit', (code: number, signal: string) => {
				console.log(`EXTHOST: PROCESS EXITED`);
				console.log(code);
				console.log(signal);
				this._cleanResources();
			});

			const messageListener = (msg: IExtHostReadyMessage) => {
				if (msg.type === 'VSCODE_EXTHOST_IPC_READY') {
					this._extensionHostProcess!.removeListener('message', messageListener);
					const reply: IExtHostSocketMessage = {
						type: 'VSCODE_EXTHOST_IPC_SOCKET',
						initialDataChunk: (<Buffer>this._initialDataChunk!.buffer).toString('base64'),
						skipWebSocketFrames: this._skipWebSocketFrames
					};
					this._extensionHostProcess!.send(reply, this._rendererConnection!);
					this._initialDataChunk = null;
					this._rendererConnection = null;
				}
			};
			this._extensionHostProcess.on('message', messageListener);

		} catch (error) {
			console.error('ExtensionHostConnection errored');
			if (error) {
				console.error(error);
			}
		}
	}
}

class StubLogService implements ILogService {
	_serviceBrand: any;

	onDidChangeLogLevel: Event<LogLevel>;

	getLevel(): LogLevel { return LogLevel.Off; }

	setLevel(level: LogLevel): void { }

	trace(message: string, ...args: any[]): void { }

	debug(message: string, ...args: any[]): void { }

	info(message: string, ...args: any[]): void { }

	warn(message: string, ...args: any[]): void { }

	error(message: string | Error, ...args: any[]): void { }

	critical(message: string | Error, ...args: any[]): void { }

	dispose(): void { }
}
