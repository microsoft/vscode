/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
// eslint-disable-next-line import/no-unresolved
import * as erdos from 'erdos';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { ClientHeartbeat, DefaultApi, HttpBearerAuth, HttpError, ServerStatus, Status } from './kbclient/api';
import { ErdosSupervisorApi, JupyterKernelExtra, JupyterKernelSpec, JupyterLanguageRuntimeSession } from './erdos-supervisor';
import { DisconnectedEvent, DisconnectReason, KernelBridgeSession } from './KernelBridgeSession';
import { Barrier, PromiseHandles, withTimeout } from './async';
import { LogStreamer } from './LogStreamer';
import { createUniqueId, summarizeError, summarizeHttpError } from './util';
import { namedPipeInterceptor } from './NamedPipeHttpAgent';

const KERNEL_BRIDGE_STATE_KEY = 'erdos-supervisor.v2';

interface KernelBridgeServerState {
	port?: number;
	base_path?: string;
	server_path: string;
	server_pid: number;
	bearer_token: string;
	log_path: string;
	transport?: string;
	socket_path?: string;
	named_pipe?: string;
}

function isDomainSocketPath(basePath: string): boolean {
	return basePath.includes('unix:');
}

function isNamedPipePath(basePath: string): boolean {
	return basePath.includes('npipe:');
}

function extractSocketPath(basePath: string): string | null {
	const match = basePath.match(/unix:([^:]+)/);
	return match ? match[1] : null;
}

function extractPipeName(basePath: string): string | null {
	const match = basePath.match(/npipe:([^:]+)/);
	return match ? match[1] : null;
}

function constructWebSocketUri(apiBasePath: string, sessionId: string): string {
	const uri = vscode.Uri.parse(apiBasePath);

	if (isDomainSocketPath(apiBasePath)) {
		const socketPath = extractSocketPath(apiBasePath);
		if (socketPath) {
			return `ws+unix://${socketPath}:/sessions/${sessionId}/channels`;
		}
	}

	if (isNamedPipePath(apiBasePath)) {
		const pipeName = extractPipeName(apiBasePath);
		if (pipeName) {
			return `ws+npipe://${pipeName}:/sessions/${sessionId}/channels`;
		}
	}

	return `ws://${uri.authority}/sessions/${sessionId}/channels`;
}

export class KBApi implements ErdosSupervisorApi {

	private readonly _api: DefaultApi;
	private _started: Barrier = new Barrier();
	private _starting: PromiseHandles<void> | undefined;
	private readonly _sessions: Array<KernelBridgeSession> = [];
	private _logStreamer: LogStreamer | undefined;
	private _disposables: vscode.Disposable[] = [];
	private _terminal: vscode.Terminal | undefined;
	private _newSupervisor = true;
	private _showingDisconnectedWarning = false;

	constructor(
		private readonly _context: vscode.ExtensionContext,
		private readonly _log: vscode.OutputChannel) {

		this._api = new DefaultApi();

		if (os.platform() === 'win32') {
			(this._api as any).interceptors.push(namedPipeInterceptor);
		}

		this.ensureStarted().then(async () => {
			this.startClientHeartbeat();
		}).catch((err) => {
			this.log(`Failed to start KernelBridge server: ${err}`);
		});

		_context.subscriptions.push(vscode.commands.registerCommand('erdos.supervisor.reconnectSession', () => {
			this.reconnectActiveSession();
		}));

		_context.subscriptions.push(vscode.commands.registerCommand('erdos.supervisor.restartSupervisor', () => {
			this.restartSupervisor();
		}));

		if (vscode.env.uiKind === vscode.UIKind.Desktop) {
			const configListener = vscode.workspace.onDidChangeConfiguration((event) => {
				if (event.affectsConfiguration('kernelSupervisor.shutdownTimeout')) {
					if (this._started.isOpen()) {
						this.log(
							'Updating server configuration with new shutdown timeout: ' +
							this.getShutdownHours());
						this.updateIdleTimeout();
					}
				}
			});
			_context.subscriptions.push(configListener);
		}
	}

	public async ensureStarted(): Promise<void> {
		this.debugLog('ENSURE_STARTED_BEGIN', {
			alreadyStarted: this._started.isOpen(),
			currentlyStarting: !!this._starting
		});

		if (this._started.isOpen()) {
			this.debugLog('ENSURE_STARTED_ALREADY_OPEN', {});
			return;
		}

		if (this._starting) {
			this.debugLog('ENSURE_STARTED_WAIT_FOR_EXISTING', {});
			return this._starting.promise;
		}

		this.debugLog('ENSURE_STARTED_STARTING_NEW', {});
		this._starting = new PromiseHandles<void>();
		this.start().then(() => {
			this.debugLog('ENSURE_STARTED_SUCCESS', {});
			this._starting?.resolve();
			this._starting = undefined;
		}).catch((err) => {
			this.debugLog('ENSURE_STARTED_ERROR', { error: err, errorMessage: err.message, errorStack: err.stack });
			this._starting?.reject(err);
			this._starting = undefined;
		});
		return this._starting.promise;
	}

	async start() {
		this.debugLog('START_BEGIN', {});
		
		let connectionFile = process.env['ERDOS_SUPERVISOR_CONNECTION_FILE'];
		this.debugLog('START_ENV_CHECK', { connectionFile });
		
		if (connectionFile) {
			if (fs.existsSync(connectionFile)) {
				this.log(`Using connection file from ` +
					`ERDOS_SUPERVISOR_CONNECTION_FILE: ${connectionFile}`);
				try {
					const connectionContents = JSON.parse(fs.readFileSync(connectionFile, 'utf8'));
					this.debugLog('START_RECONNECT_ATTEMPT', { connectionContents });
					if (await this.reconnect(connectionContents)) {
						this.log(
							`Connected to previously established supervisor.`);
						this.debugLog('START_RECONNECT_SUCCESS', {});
						return;
					}
					this.debugLog('START_RECONNECT_FAILED', {});
				} catch (err) {
					this.log(
						`Error connecting to KernelBridge (${connectionFile}): ${summarizeError(err)}`);
					this.debugLog('START_RECONNECT_ERROR', { error: err });
				}
			} else {
				this.log(`Connection file named in ` +
					`ERDOS_SUPERVISOR_CONNECTION_FILE does not exist: ${connectionFile}`);
				this.debugLog('START_ENV_FILE_MISSING', { connectionFile });
			}
		}

		const serverState =
			this._context.workspaceState.get<KernelBridgeServerState>(KERNEL_BRIDGE_STATE_KEY);

		if (serverState) {
			try {
				const reconnectResult = await this.reconnect(serverState);
				if (reconnectResult) {
					return;
				} else {
					const connectionInfo = serverState.base_path ||
						(serverState.socket_path ? `socket:${serverState.socket_path}` : '') ||
						(serverState.named_pipe ? `pipe:${serverState.named_pipe}` : '');
					this.log(`Could not reconnect to KernelBridge server ` +
						`at ${connectionInfo}. Starting a new server`);
				}
			} catch (err) {
				const connectionInfo = serverState.base_path ||
					(serverState.socket_path ? `socket:${serverState.socket_path}` : '') ||
					(serverState.named_pipe ? `pipe:${serverState.named_pipe}` : '');
				this.log(`Failed to reconnect to KernelBridge server ` +
					` at ${connectionInfo}: ${err}. Starting a new server.`);
			}
		}

		const shellPath = this.getKernelBridgePath();
		this.debugLog('START_GET_SHELL_PATH', { shellPath });

		const sessionId = `${createUniqueId()}-${process.pid}`;
		this.debugLog('START_SESSION_ID', { sessionId });

		if (!connectionFile) {
			connectionFile = path.join(os.tmpdir(), `kernelBridge-${sessionId}.json`);
			this.log(`Generated connection file path: ${connectionFile}`);
		}
		this.debugLog('START_CONNECTION_FILE', { connectionFile });

		const startTime = Date.now();

		const config = vscode.workspace.getConfiguration('kernelSupervisor');
		const showTerminal = config.get<boolean>('showTerminal', false);
		const supervisorStartupTimeout = config.get<number>('supervisorStartupTimeout', 60000);

		const logFile = path.join(os.tmpdir(), `kernelBridge-${sessionId}.log`);
		const outFile = path.join(os.tmpdir(), `kernelBridge-${sessionId}.out.log`);

		const wrapperName = os.platform() === 'win32' ? 'supervisor-wrapper.bat' : 'supervisor-wrapper.sh';
		let wrapperPath = path.join(this._context.extensionPath, 'resources', wrapperName);
		this.debugLog('START_WRAPPER_SETUP', { 
			wrapperName, 
			wrapperPath, 
			wrapperExists: fs.existsSync(wrapperPath),
			logFile,
			outFile
		});

		const shellArgs = [
			outFile
		];

		const shutdownTimeout = config.get<string>('shutdownTimeout', 'immediately');
		if (shutdownTimeout !== 'immediately') {
			const kernelWrapper = wrapperPath;
			if (os.platform() === 'win32') {
				this.log(`Running KernelBridge server with 'start /b' to persist sessions`);
				wrapperPath = 'start';
				shellArgs.unshift('/b', kernelWrapper);
			} else {
				this.log(`Running KernelBridge server with nohup to persist sessions`);
				shellArgs.unshift('nohup');
			}
		}

		const logLevel = config.get<string>('logLevel') ?? 'warn';

		shellArgs.push('node', shellPath, '--connection-file', connectionFile, '--log-file', logFile);
		this.debugLog('START_FINAL_COMMAND', { 
			wrapperPath, 
			shellArgs, 
			fullCommand: `${wrapperPath} ${shellArgs.join(' ')}`,
			platform: os.platform()
		});
		
		this.log(`Starting kernel-bridge server with dynamic port allocation`);

		this.log(`Starting kernel-bridge server ${shellPath}`);
		const terminal = vscode.window.createTerminal({
			name: 'Kernel Bridge',
			shellPath: wrapperPath,
			shellArgs,
			message: `*** Kernel Bridge Server (${shellPath}) ***`,
			hideFromUser: !showTerminal,
			isTransient: false
		} satisfies vscode.TerminalOptions);
		this.debugLog('START_TERMINAL_CREATED', { 
			terminalName: terminal.name,
			hideFromUser: !showTerminal
		});

		let exited = false;

		const closeListener = vscode.window.onDidCloseTerminal(async (closedTerminal) => {
			if (closedTerminal !== terminal) {
				return;
			}

			if (this._started.isOpen()) {
				return;
			}

			if (Date.now() - startTime > 300000) {
				return;
			}

			exited = true;

			const contents = fs.readFileSync(outFile, 'utf8');
			if (terminal.exitStatus && terminal.exitStatus.code) {
				this.log(`Supervisor terminal closed with exit code ${terminal.exitStatus.code}; output:\n${contents}`);
			} else {
				this.log(`Supervisor terminal closed unexpectedly; output:\n${contents}`);
			}

			const selection = await vscode.window.showInformationMessage(
				vscode.l10n.t('There was an error starting the kernel supervisor. Check the log for more information.'), {
				title: vscode.l10n.t('Open Log'),
				execute: () => {
					this._log.show(false);
				}
			});
			if (selection) {
				selection.execute();
			}
		});

		this._disposables.push(closeListener);

		this._disposables.push(new vscode.Disposable(() => {
			fs.unlinkSync(outFile);
		}));

		let processId = await terminal.processId;
		this.debugLog('START_PROCESS_ID', { processId });

		let connectionData: KernelBridgeServerState | undefined = undefined;
		let basePath: string = '';
		let serverPort: number = 0;

		this.debugLog('START_POLLING_LOOP', { 
			connectionFile, 
			maxRetries: 100,
			startTime 
		});

		for (let retry = 0; retry < 100; retry++) {
			const elapsed = Date.now() - startTime;
			this.debugLog('START_POLLING_ATTEMPT', { 
				retry, 
				elapsed, 
				connectionFileExists: fs.existsSync(connectionFile),
				outFileExists: fs.existsSync(outFile),
				exited
			});

			try {
				if (fs.existsSync(connectionFile)) {
					const rawContent = fs.readFileSync(connectionFile, 'utf8');
					this.debugLog('START_CONNECTION_FILE_FOUND', { 
						rawContent, 
						fileSize: rawContent.length 
					});
					
					connectionData = JSON.parse(rawContent);
					this.debugLog('START_CONNECTION_DATA_PARSED', { connectionData });
					
					if (!connectionData) {
						this.log(`Connection file ${connectionFile} is empty or invalid`);
						throw new Error(`Connection file ${connectionFile} is empty or invalid`);
					}

					if (connectionData.base_path) {
						basePath = connectionData.base_path;
						serverPort = connectionData.port || 0;
						this.log(`Read TCP connection information from ${connectionFile}: ${basePath}`);
						this.debugLog('START_TCP_CONNECTION', { basePath, serverPort });
					} else if (connectionData.socket_path) {
						basePath = `http://unix:${connectionData.socket_path}:`;
						serverPort = 0;
						this.log(`Read domain socket connection information from ${connectionFile}: ${connectionData.socket_path}, constructed base path: ${basePath}`);
						this.debugLog('START_SOCKET_CONNECTION', { socketPath: connectionData.socket_path, basePath });
					} else if (connectionData.named_pipe) {
						basePath = `http://npipe:${connectionData.named_pipe}:`;
						serverPort = 0;
						this.log(`Read named pipe connection information from ${connectionFile}: ${connectionData.named_pipe}, constructed base path: ${basePath}`);
						this.debugLog('START_PIPE_CONNECTION', { namedPipe: connectionData.named_pipe, basePath });
					} else {
						this.log(`Connection file ${connectionFile} missing base_path, socket_path, and named_pipe`);
						this.debugLog('START_INVALID_CONNECTION_DATA', { connectionData });
						throw new Error(`Connection file ${connectionFile} missing base_path, socket_path, and named_pipe`);
					}
					this.debugLog('START_CONNECTION_SUCCESS', { basePath, serverPort });
					break;
				}
			} catch (err) {
				this.log(`Error reading connection file (attempt ${retry}): ${err}`);
				this.debugLog('START_CONNECTION_FILE_ERROR', { 
					retry, 
					error: err, 
					errorMessage: err.message,
					errorStack: err.stack 
				});
			}

			if (exited) {
				let message = `The supervisor process exited unexpectedly during startup`;
				let outputContents = '';

				if (fs.existsSync(outFile)) {
					outputContents = fs.readFileSync(outFile, 'utf8');
					if (outputContents) {
						message += `; output:\n\n${outputContents}`;
					}
				}
				this.log(message);
				this.debugLog('START_PROCESS_EXITED', { 
					message, 
					outputContents,
					outFileExists: fs.existsSync(outFile)
				});
				throw new Error(message);
			}

			if (elapsed > supervisorStartupTimeout) {
				let message = `Connection file was not created after ${elapsed}ms`;
				let outputContents = '';

				if (fs.existsSync(outFile)) {
					outputContents = fs.readFileSync(outFile, 'utf8');
					if (outputContents) {
						message += `; output:\n\n${outputContents}`;
					}
				}
				this.log(message);
				this.debugLog('START_TIMEOUT', { 
					message, 
					elapsed, 
					outputContents,
					connectionFileExists: fs.existsSync(connectionFile),
					outFileExists: fs.existsSync(outFile)
				});
				throw new Error(message);
			}

			await new Promise((resolve) => setTimeout(resolve, 500));
		}

		if (!connectionData) {
			let message = `Timed out waiting for connection file to be ` +
				`created at ${connectionFile} after ${supervisorStartupTimeout / 1000} seconds`;

			if (fs.existsSync(outFile)) {
				const contents = fs.readFileSync(outFile, 'utf8');
				if (contents) {
					message += `; output:\n\n${contents}`;
				}
			}
			this.log(message);
			throw new Error(message);
		}

		if (process.env.http_proxy && serverPort > 0) {
			process.env.no_proxy = (process.env.no_proxy ? process.env.no_proxy + ',' : '') + `localhost:${serverPort}`;
			this.log(`HTTP proxy set to ${process.env.http_proxy}; setting no_proxy to ${process.env.no_proxy} to exempt supervisor`);
		}

		const bearerToken = connectionData.bearer_token;
		const bearer = new HttpBearerAuth();
		bearer.accessToken = bearerToken;

		this._api.basePath = basePath;
		this._api.setDefaultAuthentication(bearer);

		for (let retry = 0; retry < 100; retry++) {
			try {
				const status = await this._api.serverStatus();
				this.log(`KernelBridge ${status.body.version} server online with ${status.body.sessions} sessions`);

				if (processId !== status.body.processId) {
					this.log(`Running as pid ${status.body.processId} (terminal pid ${processId})`);
					processId = status.body.processId;
				}

				break;
			} catch (err) {
				const elapsed = Date.now() - startTime;

				if (exited) {
					throw new Error(`The supervisor process exited before the server was ready.`);
				}

				if (err.code === 'ECONNREFUSED') {
					if (elapsed < 10000) {
						if (retry > 0 && retry % 5 === 0) {
							this.log(`Waiting for KernelBridge server to start (attempt ${retry}, ${elapsed}ms)`);
						}
						await new Promise((resolve) => setTimeout(resolve, 100));
						continue;
					} else {
						let message = `KernelBridge server did not start after ${Date.now() - startTime}ms`;
						this.log(message);

						if (fs.existsSync(outFile)) {
							const contents = fs.readFileSync(outFile, 'utf8');
							if (contents) {
								message += `; output:\n\n${contents}`;
							}
						}
						throw new Error(message);
					}
				}

				if (err.code === 'ETIMEDOUT' && elapsed < 10000) {
					this.log(`Request for server status timed out; retrying (attempt ${retry + 1}, ${elapsed}ms)`);
					continue;
				}

				this.log(`Failed to get initial server status from KernelBridge; ` +
					`server may not be running or may not be ready. Check the terminal for errors. ` +
					`Error: ${JSON.stringify(err)}`);
				throw err;
			}
		}

		this.log(`KernelBridge server started in ${Date.now() - startTime}ms`);

		if (this._logStreamer) {
			this._logStreamer.dispose();
		}
		this._logStreamer = new LogStreamer(this._log, logFile);
		this._logStreamer.watch().then(() => {
			this.log(`Streaming KernelBridge server logs from ${logFile} (log level: ${logLevel})`);
		});

		closeListener.dispose();

		this._started.open();

		const configTransport = config.get<string>('transport', 'ipc');
		let actualTransport: string;
		if (configTransport === 'tcp') {
			actualTransport = 'tcp';
		} else {
			actualTransport = isDomainSocketPath(basePath) ? 'socket' :
				(isNamedPipePath(basePath) ? 'named-pipe' : 'tcp');
		}

		const state: KernelBridgeServerState = {
			base_path: this._api.basePath,
			port: serverPort,
			server_path: shellPath,
			server_pid: processId || 0,
			bearer_token: bearerToken,
			log_path: logFile,
			transport: actualTransport,
			socket_path: connectionData?.socket_path || (isDomainSocketPath(basePath) ? extractSocketPath(basePath) || undefined : undefined),
			named_pipe: connectionData?.named_pipe || (isNamedPipePath(basePath) ? extractPipeName(basePath) || undefined : undefined)
		};
		this._context.workspaceState.update(KERNEL_BRIDGE_STATE_KEY, state);
	}

	getShutdownHours(): number {
		if (vscode.env.uiKind === vscode.UIKind.Web) {
			return -1;
		}

		const config = vscode.workspace.getConfiguration('kernelSupervisor');
		const shutdownTimeout = config.get<string>('shutdownTimeout', 'immediately');

		if (shutdownTimeout === 'immediately') {
			if (vscode.env.uiKind === vscode.UIKind.Desktop) {
				return 1;
			}
		} else if (shutdownTimeout === 'when idle') {
			return 0;
		} else if (shutdownTimeout !== 'indefinitely') {
			try {
				const hours = parseInt(shutdownTimeout, 10);
				return hours;
			} catch (err) {
				this.log(`Invalid hour value for kernelSupervisor.shutdownTimeout: '${shutdownTimeout}'; persisting sessions indefinitely`);
			}
		}

		return -1;
	}

	async reconnect(serverState: KernelBridgeServerState): Promise<boolean> {
		const pid = serverState.server_pid;
		if (pid) {
			try {
				process.kill(pid, 0);
			} catch (err) {
				this.log(`KernelBridge server PID ${pid} is not running`);
				return false;
			}
		}

		this._log.clear();
		const connectionInfo = serverState.base_path ||
			(serverState.socket_path ? `socket:${serverState.socket_path}` : '') ||
			(serverState.named_pipe ? `npipe:${serverState.named_pipe}` : '');
		this.log(`Reconnecting to KernelBridge server at ${connectionInfo} (PID ${pid})`);

		const bearer = new HttpBearerAuth();
		bearer.accessToken = serverState.bearer_token;
		this._api.setDefaultAuthentication(bearer);

		if (this._logStreamer) {
			this._logStreamer.dispose();
		}
		this._logStreamer = new LogStreamer(this._log, serverState.log_path);
		this._logStreamer.watch().then(() => {
			this.log(`Streaming KernelBridge server logs at ${serverState.log_path}`);
		});

		if (serverState.base_path) {
			this._api.basePath = serverState.base_path;
			this.log(`Reconnecting to TCP server at ${serverState.base_path}`);
		} else if (serverState.socket_path) {
			const socketBasePath = `http://unix:${serverState.socket_path}:`;
			this._api.basePath = socketBasePath;
			this.log(`Reconnecting to socket: ${serverState.socket_path}`);
		} else if (serverState.named_pipe) {
			const pipeBasePath = `http://npipe:${serverState.named_pipe}:`;
			this._api.basePath = pipeBasePath;
			this.log(`Reconnecting to named pipe: ${serverState.named_pipe}`);
		} else {
			throw new Error('Server state missing base_path, socket_path, and named_pipe');
		}

		try {
			const status = await this._api.serverStatus();
			this._started.open();
			this.log(`KernelBridge ${status.body.version} server reconnected with ${status.body.sessions} sessions`);
		} catch (error) {
			throw error;
		}

		if (vscode.env.uiKind !== vscode.UIKind.Web) {
			this.updateIdleTimeout();
		}

		this._newSupervisor = false;

		return true;
	}

	async updateIdleTimeout() {
		const timeout = this.getShutdownHours();
		try {
			await this._api.setServerConfiguration({
				idleShutdownHours: timeout
			});
		} catch (err) {
			this.log(`Failed to update idle timeout: ${summarizeError(err)}`);
		}
	}

	async startClientHeartbeat() {
		await this._started.wait();

		const pid = process.pid;
		const heartbeatPayload: ClientHeartbeat = {
			processId: pid
		};

		const interval = setInterval(() => {
			if (this._started.isOpen()) {
				this._api.clientHeartbeat(heartbeatPayload).catch(async (err) => {
					if (err.code === 'ECONNREFUSED') {
						this.log(
							`Connection refused while attempting to send heartbeat;` +
							`checking server status`);
						await this.testServerExited();
					} else {
						this.log(`Failed to send client heartbeat: ` +
							summarizeError(err));
					}
				});
			} else {
				clearInterval(interval);
				setTimeout(async () => {
					this.startClientHeartbeat();
				}, 0);
			}
		}, 20000);
	}

	async createSession(
		runtimeMetadata: erdos.LanguageRuntimeMetadata,
		sessionMetadata: erdos.RuntimeSessionMetadata,
		kernel: JupyterKernelSpec,
		dynState: erdos.LanguageRuntimeDynState,
		_extra?: JupyterKernelExtra | undefined): Promise<JupyterLanguageRuntimeSession> {

		this.debugLog('CREATE_SESSION_START', {
			runtimeMetadata,
			sessionMetadata,
			kernel,
			dynState,
			extra: _extra
		});

		await this.ensureStarted();
		this.debugLog('CREATE_SESSION_SERVER_READY', { serverStarted: this._started.isOpen() });

		const session = new KernelBridgeSession(
			sessionMetadata, runtimeMetadata, dynState, this._api, true, _extra);

		this.log(`Creating session: ${JSON.stringify(sessionMetadata)}`);
		this.debugLog('CREATE_SESSION_OBJECT_CREATED', { sessionId: sessionMetadata.sessionId });

		let retried = false;
		while (true) {
			try {
				this.debugLog('CREATE_SESSION_CALLING_CREATE', { 
					kernel, 
					retried,
					apiBase: (this._api as any).configuration?.basePath 
				});
				
				await session.create(kernel);
				this.debugLog('CREATE_SESSION_CREATE_SUCCESS', { sessionId: sessionMetadata.sessionId });
				break;
			} catch (err) {
				this.debugLog('CREATE_SESSION_CREATE_ERROR', { 
					error: err,
					errorCode: err.code,
					errorMessage: err.message,
					errorStack: err.stack,
					retried
				});
				
				if (err.code === 'ECONNREFUSED' && !retried) {
					this.log(`Connection refused while attempting to create session; checking server status`);
					await this.testServerExited();

					if (this._started.isOpen()) {
						retried = true;
						this.debugLog('CREATE_SESSION_RETRY', { serverStillRunning: true });
						continue;
					}
				}

				this.debugLog('CREATE_SESSION_FINAL_ERROR', { 
					finalError: summarizeError(err),
					originalError: err
				});
				throw new Error(summarizeError(err));
			}
		}

		this.addDisconnectHandler(session);
		this._sessions.push(session);
		this.debugLog('CREATE_SESSION_COMPLETE', { 
			sessionId: sessionMetadata.sessionId,
			totalSessions: this._sessions.length 
		});

		return session;
	}

	private addDisconnectHandler(session: KernelBridgeSession) {
		this._disposables.push(session.disconnected.event(async (evt: DisconnectedEvent) => {
			if (evt.reason === DisconnectReason.Unknown) {
				this.log(`Session '${session.metadata.sessionId}' disconnected ` +
					`while in state '${evt.state}'. This is unexpected; checking server status.`);

				const exited = await this.testServerExited();
				if (!exited) {
					this.log(`The server is still running; attempting to reconnect to session ${session.metadata.sessionId}`);
					try {
						await withTimeout(session.connect(), 2000, `Timed out reconnecting to session ${session.metadata.sessionId}`);
						this.log(`Successfully restored connection to  ${session.metadata.sessionId}`);
					} catch (err) {
						const errorMessage = summarizeError(err);
						session.markOffline('Lost connection to the session WebSocket event stream and could not restore it: ' + errorMessage);
						vscode.window.showErrorMessage(vscode.l10n.t('Unable to re-establish connection to {0}: {1}',
							session.metadata.sessionId,
							errorMessage));
					}
				}
			} else if (evt.reason === DisconnectReason.Transferred) {
				this.log(`Session '${session.metadata.sessionId}' disconnected ` +
					`because another client connected to it.`);
				if (!this._showingDisconnectedWarning) {
					this._showingDisconnectedWarning = true;
					try {
						await erdos.window.showSimpleModalDialogMessage(
							vscode.l10n.t('Interpreters Disconnected'),
							vscode.l10n.t('This Erdos session has been opened in another window. ' +
								'As a result, interpreters have been disconnected in the current window. Reload this window to reconnect to your sessions.'),
							vscode.l10n.t('Continue')
						);
					} finally {
						this._showingDisconnectedWarning = false;
					}
				}
			}
		}));
	}

	private async testServerExited(): Promise<boolean> {
		if (this._starting) {
			await this._starting.promise;
			return false;
		}

		const serverState =
			this._context.workspaceState.get<KernelBridgeServerState>(KERNEL_BRIDGE_STATE_KEY);

		if (!serverState) {
			this.log(`No KernelBridge server state found; cannot test server process`);
			return false;
		}

		let serverRunning = true;
		if (serverState.server_pid) {
			try {
				process.kill(serverState.server_pid, 0);
				this.log(`KernelBridge server PID ${serverState.server_pid} is still running`);
			} catch (err) {
				this.log(`KernelBridge server PID ${serverState.server_pid} is not running`);
				serverRunning = false;
			}
		}

		if (serverRunning) {
			return false;
		}

		this._context.workspaceState.update(KERNEL_BRIDGE_STATE_KEY, undefined);

		for (const session of this._sessions) {
			session.markExited(1, erdos.RuntimeExitReason.Error);
		}

		if (this._logStreamer) {
			this._logStreamer.dispose();
			this._logStreamer = undefined;
		}

		this._started = new Barrier();
		try {
			await this.ensureStarted();

			if (this._sessions.length > 0) {
				vscode.window.showInformationMessage(
					vscode.l10n.t('The process supervising the interpreters has exited unexpectedly and was automatically restarted. You may need to start your interpreter again.'));
			}

		} catch (err) {
			vscode.window.showInformationMessage(
				vscode.l10n.t('The process supervising the interpreters has exited unexpectedly and could not automatically restarted: ' + err));
		}

		return true;
	}

	async validateSession(sessionId: string): Promise<boolean> {
		await this.ensureStarted();

		if (this._newSupervisor) {
			return false;
		}
		try {
			const session = await this._api.getSession(sessionId);

			const status = session.body.status;
			return status !== Status.Exited && status !== Status.Uninitialized;
		} catch (e) {
			if (e instanceof HttpError && e.response.statusCode === 404) {
				return false;
			}

			this.log(`Error validating session ${sessionId}: ${summarizeError(e)}`);
		}

		return false;
	}

	async restoreSession(
		runtimeMetadata: erdos.LanguageRuntimeMetadata,
		sessionMetadata: erdos.RuntimeSessionMetadata,
		dynState: erdos.LanguageRuntimeDynState
	): Promise<JupyterLanguageRuntimeSession> {

		await this.ensureStarted();

		return new Promise<JupyterLanguageRuntimeSession>((resolve, reject) => {
			this._api.getSession(sessionMetadata.sessionId).then(async (response) => {
				const kcSession = response.body;
				if (kcSession.status === Status.Exited) {
					this.log(`Attempt to reconnect to session ${sessionMetadata.sessionId} failed because it is no longer running`);
					reject(`Session (${sessionMetadata.sessionId}) is no longer running`);
					return;
				}

				const session = new KernelBridgeSession(sessionMetadata, runtimeMetadata, {
					sessionName: dynState.sessionName,
					continuationPrompt: kcSession.continuationPrompt,
					inputPrompt: kcSession.inputPrompt,
				}, this._api, false);

				try {
					session.restore(kcSession);
				} catch (err) {
					this.log(`Failed to restore session ${sessionMetadata.sessionId}: ${JSON.stringify(err)}`);
					if (err.code === 'ECONNREFUSED') {
						this.log(`Connection refused while attempting to restore session; checking server status`);
						await this.testServerExited();
					}
					reject(err);
				}
				this.addDisconnectHandler(session);
				this._sessions.push(session);
				resolve(session);
			}).catch((err) => {
				if (err instanceof HttpError) {
					const message = summarizeHttpError(err);
					this.log(`Failed to reconnect to session ${sessionMetadata.sessionId}: ${message}`);
					reject(message);
					return;
				}
				this.log(`Failed to reconnect to session ${sessionMetadata.sessionId}: ${JSON.stringify(err)}`);
				reject(err);
			});
		});
	}

	public async serverStatus(): Promise<ServerStatus> {
		const status = await this._api.serverStatus();
		return status.body;
	}

	dispose() {
		this._sessions.forEach(session => session.dispose());
		this._sessions.length = 0;

		if (this._logStreamer) {
			this._logStreamer.dispose();
			this._logStreamer = undefined;
		}

		this._disposables.forEach(disposable => disposable.dispose());
	}

	getKernelBridgePath(): string {

		// Use the embedded kernel-bridge from resources directory
		const embeddedKernelBridgePath = path.join(
			this._context.extensionPath, 'resources', 'kernel-bridge', 'dist', 'index.js');
		
		if (fs.existsSync(embeddedKernelBridgePath)) {
			this.log(`Using embedded kernel-bridge at ${embeddedKernelBridgePath}`);
			return embeddedKernelBridgePath;
		}

		throw new Error(`Kernel-bridge server not found (expected at ${embeddedKernelBridgePath})`);
	}

	async reconnectActiveSession() {
		const session = await erdos.runtime.getForegroundSession();
		if (!session) {
			vscode.window.showInformationMessage(vscode.l10n.t('No active session to reconnect to'));
			return;
		}

		const kernelBridgeSession = this._sessions.find(s => s.metadata.sessionId === session.metadata.sessionId);
		if (!kernelBridgeSession) {
			vscode.window.showInformationMessage(vscode.l10n.t('Active session {0} not managed by the kernel supervisor', session.dynState.sessionName));
			return;
		}

		if (kernelBridgeSession.runtimeState === erdos.RuntimeState.Exited) {
			vscode.window.showInformationMessage(vscode.l10n.t('Session {0} is not running', session.dynState.sessionName));
			return;
		}

		kernelBridgeSession.log('Disconnecting by user request', vscode.LogLevel.Info);
		kernelBridgeSession.disconnect();
	}

	private async restartSupervisor(): Promise<void> {

		if (!this._started.isOpen()) {
			return this.ensureStarted();
		}

		this.log('Restarting KernelBridge server');

		this._sessions.forEach(session => {
			session.markExited(0, erdos.RuntimeExitReason.Shutdown);
			session.dispose();
		});
		this._sessions.length = 0;

		this._context.workspaceState.update(KERNEL_BRIDGE_STATE_KEY, undefined);

		const connectionFile = process.env['ERDOS_SUPERVISOR_CONNECTION_FILE'];
		if (connectionFile && fs.existsSync(connectionFile)) {
			this.log(`Cleaning up connection file ${connectionFile}`);
			try {
				fs.unlinkSync(connectionFile);
			} catch (err) {
				this.log(
					`Failed to delete connection file ${connectionFile}: ${err}`);
			}
		}

		try {
			await this._api.shutdownServer();
		} catch (err) {
			const message = summarizeError(err);
			this.log(`Failed to shut down KernelBridge server: ${message}`);
		}

		if (this._terminal) {
			this._terminal.dispose();
			this._terminal = undefined;
		}

		this._started = new Barrier();

		try {
			await this.ensureStarted();
			vscode.window.showInformationMessage(vscode.l10n.t('Kernel supervisor successfully restarted'));
		} catch (err) {
			const message = err instanceof HttpError ? summarizeHttpError(err) : err;
			vscode.window.showErrorMessage(vscode.l10n.t('Failed to restart kernel supervisor: {0}', err));
		}
	}

	private log(message: string) {
		const logTime = new Date().toISOString().substring(11, 19);
		this._log.appendLine(`${logTime} [Erdos] ${message}`);
	}

	private debugLog(stage: string, data: any): void {
		const logTime = new Date().toISOString().substring(11, 19);
		this._log.appendLine(`${logTime} [DEBUG-${stage}] ${JSON.stringify(data, null, 2)}`);
	}
}
