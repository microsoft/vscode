/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as net from 'net';
import { getNLSConfiguration } from 'vs/server/remoteLanguagePacks';
import { uriTransformerPath } from 'vs/server/remoteUriTransformer';
import { FileAccess } from 'vs/base/common/network';
import { join, delimiter } from 'vs/base/common/path';
import { VSBuffer } from 'vs/base/common/buffer';
import { IRemoteConsoleLog } from 'vs/base/common/console';
import { Emitter, Event } from 'vs/base/common/event';
import { NodeSocket, WebSocketNodeSocket } from 'vs/base/parts/ipc/node/ipc.net';
import { resolveShellEnv } from 'vs/platform/environment/node/shellEnv';
import { ILogService } from 'vs/platform/log/common/log';
import { IRemoteExtensionHostStartParams } from 'vs/platform/remote/common/remoteAgentConnection';
import { IExtHostReadyMessage, IExtHostSocketMessage, IExtHostReduceGraceTimeMessage } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { IServerEnvironmentService } from 'vs/server/serverEnvironmentService';
import { IProcessEnvironment, isWindows } from 'vs/base/common/platform';
import { logRemoteEntry } from 'vs/workbench/services/extensions/common/remoteConsoleUtil';
import { removeDangerousEnvVariables } from 'vs/base/node/processes';

export async function buildUserEnvironment(startParamsEnv: { [key: string]: string | null } = {}, language: string, isDebug: boolean, environmentService: IServerEnvironmentService, logService: ILogService): Promise<IProcessEnvironment> {
	const nlsConfig = await getNLSConfiguration(language, environmentService.userDataPath);

	let userShellEnv: typeof process.env | undefined = undefined;
	try {
		userShellEnv = await resolveShellEnv(logService, environmentService.args, process.env);
	} catch (error) {
		logService.error('ExtensionHostConnection#buildUserEnvironment resolving shell environment failed', error);
		userShellEnv = {};
	}

	const binFolder = environmentService.isBuilt ? join(environmentService.appRoot, 'bin') : join(environmentService.appRoot, 'resources', 'server', 'bin-dev');
	const processEnv = process.env;
	let PATH = startParamsEnv['PATH'] || (userShellEnv ? userShellEnv['PATH'] : undefined) || processEnv['PATH'];
	if (PATH) {
		PATH = binFolder + delimiter + PATH;
	} else {
		PATH = binFolder;
	}

	const env: IProcessEnvironment = {
		...processEnv,
		...userShellEnv,
		...{
			VSCODE_LOG_NATIVE: String(isDebug),
			VSCODE_AMD_ENTRYPOINT: 'vs/server/remoteExtensionHostProcess',
			VSCODE_PIPE_LOGGING: 'true',
			VSCODE_VERBOSE_LOGGING: 'true',
			VSCODE_EXTHOST_WILL_SEND_SOCKET: 'true',
			VSCODE_HANDLES_UNCAUGHT_ERRORS: 'true',
			VSCODE_LOG_STACK: 'false',
			VSCODE_NLS_CONFIG: JSON.stringify(nlsConfig, undefined, 0)
		},
		...startParamsEnv
	};
	if (!environmentService.args['without-browser-env-var']) {
		env.BROWSER = join(binFolder, 'helpers', isWindows ? 'browser.cmd' : 'browser.sh');
	}

	setCaseInsensitive(env, 'PATH', PATH);
	removeNulls(env);

	return env;
}

class ConnectionData {
	constructor(
		public readonly socket: net.Socket,
		public readonly socketDrain: Promise<void>,
		public readonly initialDataChunk: VSBuffer,
		public readonly skipWebSocketFrames: boolean,
		public readonly permessageDeflate: boolean,
		public readonly inflateBytes: VSBuffer,
	) { }

	public toIExtHostSocketMessage(): IExtHostSocketMessage {
		return {
			type: 'VSCODE_EXTHOST_IPC_SOCKET',
			initialDataChunk: (<Buffer>this.initialDataChunk.buffer).toString('base64'),
			skipWebSocketFrames: this.skipWebSocketFrames,
			permessageDeflate: this.permessageDeflate,
			inflateBytes: (<Buffer>this.inflateBytes.buffer).toString('base64'),
		};
	}
}

export class ExtensionHostConnection {

	private _onClose = new Emitter<void>();
	readonly onClose: Event<void> = this._onClose.event;

	private _disposed: boolean;
	private _remoteAddress: string;
	private _extensionHostProcess: cp.ChildProcess | null;
	private _connectionData: ConnectionData | null;

	constructor(
		private readonly _environmentService: IServerEnvironmentService,
		private readonly _logService: ILogService,
		private readonly _reconnectionToken: string,
		remoteAddress: string,
		socket: NodeSocket | WebSocketNodeSocket,
		initialDataChunk: VSBuffer
	) {
		this._disposed = false;
		this._remoteAddress = remoteAddress;
		this._extensionHostProcess = null;
		this._connectionData = ExtensionHostConnection._toConnectionData(socket, initialDataChunk);
		this._connectionData.socket.pause();

		this._log(`New connection established.`);
	}

	private get _logPrefix(): string {
		return `[${this._remoteAddress}][${this._reconnectionToken.substr(0, 8)}][ExtensionHostConnection] `;
	}

	private _log(_str: string): void {
		this._logService.info(`${this._logPrefix}${_str}`);
	}

	private _logError(_str: string): void {
		this._logService.error(`${this._logPrefix}${_str}`);
	}

	private static _toConnectionData(socket: NodeSocket | WebSocketNodeSocket, initialDataChunk: VSBuffer): ConnectionData {
		if (socket instanceof NodeSocket) {
			return new ConnectionData(socket.socket, socket.drain(), initialDataChunk, true, false, VSBuffer.alloc(0));
		} else {
			return new ConnectionData(socket.socket.socket, socket.drain(), initialDataChunk, false, socket.permessageDeflate, socket.recordedInflateBytes);
		}
	}

	private async _sendSocketToExtensionHost(extensionHostProcess: cp.ChildProcess, connectionData: ConnectionData): Promise<void> {
		// Make sure all outstanding writes have been drained before sending the socket
		await connectionData.socketDrain;
		const msg = connectionData.toIExtHostSocketMessage();
		extensionHostProcess.send(msg, connectionData.socket);
	}

	public shortenReconnectionGraceTimeIfNecessary(): void {
		if (!this._extensionHostProcess) {
			return;
		}
		const msg: IExtHostReduceGraceTimeMessage = {
			type: 'VSCODE_EXTHOST_IPC_REDUCE_GRACE_TIME'
		};
		this._extensionHostProcess.send(msg);
	}

	public acceptReconnection(remoteAddress: string, _socket: NodeSocket | WebSocketNodeSocket, initialDataChunk: VSBuffer): void {
		this._remoteAddress = remoteAddress;
		this._log(`The client has reconnected.`);
		const connectionData = ExtensionHostConnection._toConnectionData(_socket, initialDataChunk);
		connectionData.socket.pause();

		if (!this._extensionHostProcess) {
			// The extension host didn't even start up yet
			this._connectionData = connectionData;
			return;
		}

		this._sendSocketToExtensionHost(this._extensionHostProcess, connectionData);
	}

	private _cleanResources(): void {
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

	public async start(startParams: IRemoteExtensionHostStartParams): Promise<void> {
		try {
			let execArgv: string[] = [];
			if (startParams.port && !(<any>process).pkg) {
				execArgv = [`--inspect${startParams.break ? '-brk' : ''}=0.0.0.0:${startParams.port}`];
			}

			const env = await buildUserEnvironment(startParams.env, startParams.language, !!startParams.debugId, this._environmentService, this._logService);
			removeDangerousEnvVariables(env);

			const opts = {
				env,
				execArgv,
				silent: true
			};

			// Run Extension Host as fork of current process
			const args = ['--type=extensionHost', `--uriTransformerPath=${uriTransformerPath}`];
			const useHostProxy = this._environmentService.args['use-host-proxy'];
			if (useHostProxy !== undefined) {
				args.push(`--useHostProxy=${useHostProxy}`);
			}
			this._extensionHostProcess = cp.fork(FileAccess.asFileUri('bootstrap-fork', require).fsPath, args, opts);
			const pid = this._extensionHostProcess.pid;
			this._log(`<${pid}> Launched Extension Host Process.`);

			// Catch all output coming from the extension host process
			this._extensionHostProcess.stdout!.setEncoding('utf8');
			this._extensionHostProcess.stderr!.setEncoding('utf8');
			const onStdout = Event.fromNodeEventEmitter<string>(this._extensionHostProcess.stdout!, 'data');
			const onStderr = Event.fromNodeEventEmitter<string>(this._extensionHostProcess.stderr!, 'data');
			onStdout((e) => this._log(`<${pid}> ${e}`));
			onStderr((e) => this._log(`<${pid}><stderr> ${e}`));


			// Support logging from extension host
			this._extensionHostProcess.on('message', msg => {
				if (msg && (<IRemoteConsoleLog>msg).type === '__$console') {
					logRemoteEntry(this._logService, (<IRemoteConsoleLog>msg), `${this._logPrefix}<${pid}>`);
				}
			});

			// Lifecycle
			this._extensionHostProcess.on('error', (err) => {
				this._logError(`<${pid}> Extension Host Process had an error`);
				this._logService.error(err);
				this._cleanResources();
			});

			this._extensionHostProcess.on('exit', (code: number, signal: string) => {
				this._log(`<${pid}> Extension Host Process exited with code: ${code}, signal: ${signal}.`);
				this._cleanResources();
			});

			const messageListener = (msg: IExtHostReadyMessage) => {
				if (msg.type === 'VSCODE_EXTHOST_IPC_READY') {
					this._extensionHostProcess!.removeListener('message', messageListener);
					this._sendSocketToExtensionHost(this._extensionHostProcess!, this._connectionData!);
					this._connectionData = null;
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

function setCaseInsensitive(env: { [key: string]: unknown }, key: string, value: string): void {
	const pathKeys = Object.keys(env).filter(k => k.toLowerCase() === key.toLowerCase());
	const pathKey = pathKeys.length > 0 ? pathKeys[0] : key;
	env[pathKey] = value;
}

function removeNulls(env: { [key: string]: unknown | null }): void {
	// Don't delete while iterating the object itself
	for (let key of Object.keys(env)) {
		if (env[key] === null) {
			delete env[key];
		}
	}
}
