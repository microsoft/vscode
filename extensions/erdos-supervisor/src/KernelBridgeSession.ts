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
import { JupyterKernelExtra, JupyterKernelSpec, JupyterLanguageRuntimeSession, JupyterSession } from './erdos-supervisor';
import { ActiveSession, ConnectionInfo, DefaultApi, HttpError, InterruptMode, NewSession, RestartSession, Status, VarAction, VarActionType } from './kbclient/api';
import { JupyterMessage, JupyterMessageHeader, JupyterChannel, JupyterCommOpen, JupyterCommMsg, JupyterCommRequest, JupyterExecuteRequest, JupyterIsCompleteRequest, KernelInfoReply } from './jupyter/JupyterTypes';
import { JupyterRequest, KernelInfoRequest, ExecuteRequest, IsCompleteRequest, CommInfoRequest, CommMsgRequest, ShutdownRequest } from './jupyter/JupyterRequests';
import { JupyterCommand, CommOpenCommand, CommCloseCommand, CommMsgCommand, InputReplyCommand, RpcReplyCommand } from './jupyter/JupyterCommands';
import { Barrier, PromiseHandles, withTimeout } from './async';
import { RuntimeMessageEmitter } from './RuntimeMessageEmitter';
import { LogStreamer } from './LogStreamer';
import { Comm } from './Comm';
import { DapClient } from './DapClient';
import { SocketSession } from './ws/SocketSession';
import { KernelOutputMessage } from './ws/KernelMessage';
import { UICommRequest } from './UICommRequest';
import { createUniqueId, summarizeError, summarizeHttpError } from './util';
import { AdoptedSession } from './AdoptedSession';
import { JupyterMessageType } from './jupyter/JupyterTypes';

export enum DisconnectReason {
	Exit = 'exit',
	Unknown = 'unknown',
	Transferred = 'transferred',
}

export interface DisconnectedEvent {
	state: erdos.RuntimeState;
	reason: DisconnectReason;
}

export class KernelBridgeSession implements JupyterLanguageRuntimeSession {
	private readonly _messages: RuntimeMessageEmitter = new RuntimeMessageEmitter();
	private readonly _state: vscode.EventEmitter<erdos.RuntimeState>;
	private readonly _exit: vscode.EventEmitter<erdos.LanguageRuntimeExit>;
	readonly disconnected: vscode.EventEmitter<DisconnectedEvent>;
	private readonly _established: Barrier = new Barrier();
	private _connected: Barrier = new Barrier();
	private _ready: Barrier = new Barrier();
	private _exitReason: erdos.RuntimeExitReason = erdos.RuntimeExitReason.Unknown;
	private _socket: SocketSession | undefined;
	private _runtimeState: erdos.RuntimeState = erdos.RuntimeState.Uninitialized;
	private _pendingRequests: Map<string, JupyterRequest<any, any>> = new Map();
	private _pendingUiCommRequests: UICommRequest[] = [];
	private _disposables: vscode.Disposable[] = [];
	private _restarting = false;
	private _canConnect = true;
	private _dapClient: DapClient | undefined;
	private _startingComms: Map<string, PromiseHandles<number>> = new Map();
	private _kernelSpec: JupyterKernelSpec | undefined;
	private readonly _kernelChannel: vscode.OutputChannel;
	private readonly _consoleChannel: vscode.LogOutputChannel;
	private _profileChannel: vscode.OutputChannel | undefined;
	private readonly _comms: Map<string, Comm> = new Map();
	private _kernelLogFile: string | undefined;
	private _activeSession: ActiveSession | undefined;
	private _activeBackendRequestHeader: JupyterMessageHeader | null = null;

	constructor(readonly metadata: erdos.RuntimeSessionMetadata,
		readonly runtimeMetadata: erdos.LanguageRuntimeMetadata,
		readonly dynState: erdos.LanguageRuntimeDynState,
		private readonly _api: DefaultApi,
		private readonly _new: boolean,
		private readonly _extra?: JupyterKernelExtra | undefined) {

		this._state = new vscode.EventEmitter<erdos.RuntimeState>();
		this._exit = new vscode.EventEmitter<erdos.LanguageRuntimeExit>();
		this.disconnected = new vscode.EventEmitter<DisconnectedEvent>();

		this._disposables.push(this._messages);
		this._disposables.push(this._state);
		this._disposables.push(this._exit);
		this._disposables.push(this.disconnected);

		this.onDidReceiveRuntimeMessage = this._messages.event;
		this.onDidChangeRuntimeState = this._state.event;
		this.onDidEndSession = this._exit.event;

		// Listen to runtime state messages from RuntimeMessageEmitter and update session state
		this._disposables.push(this._messages.event(message => {
			if (message.type === erdos.LanguageRuntimeMessageType.State) {
				const stateMessage = message as erdos.LanguageRuntimeState;
				// Convert Jupyter execution states to runtime states
				let newState: erdos.RuntimeState;
				switch (stateMessage.state) {
					case 'idle':
						newState = erdos.RuntimeState.Idle;
						break;
					case 'busy':
						newState = erdos.RuntimeState.Busy;
						break;
					default:
						// Unknown state, don't update
						return;
				}
				this.onStateChange(newState, `Jupyter kernel status: ${stateMessage.state}`);
			}
		}));

		this._consoleChannel = vscode.window.createOutputChannel(
			metadata.notebookUri ?
				`${runtimeMetadata.runtimeName}: Notebook: (${path.basename(metadata.notebookUri.path)})` :
				`${runtimeMetadata.runtimeName}: Console`,
			{ log: true });

		this._kernelChannel = erdos.window.createRawLogOutputChannel(
			`${runtimeMetadata.runtimeName}: Kernel`);
		this._kernelChannel.appendLine(`** Begin kernel log for session ${dynState.sessionName} (${metadata.sessionId}) at ${new Date().toLocaleString()} **`);
	}

	async buildEnvVarActions(restart: boolean): Promise<VarAction[]> {
		const varActions: Array<VarAction> = [];

		varActions.push({
			action: VarActionType.Replace, name: 'ERDOS',
			value: '1'
		});

		varActions.push({
			action: VarActionType.Replace, name: 'ERDOS_VERSION',
			value: erdos.version
		});

		varActions.push({
			action: VarActionType.Replace, name: 'ERDOS_LONG_VERSION',
			value: `${erdos.version}+${erdos.buildNumber}`
		});

		varActions.push({
			action: VarActionType.Replace,
			name: 'ERDOS_MODE',
			value: vscode.env.uiKind === vscode.UIKind.Desktop ? 'desktop' : 'server'
		});

		const contributedVars = await erdos.environment.getEnvironmentContributions();
		for (const [extensionId, actions] of Object.entries(contributedVars)) {

			if (restart && extensionId === 'ms-python.erdos-python') {
				continue;
			}

			for (const action of actions) {
				let actionType: VarActionType;
				switch (action.action) {
					case vscode.EnvironmentVariableMutatorType.Replace:
						actionType = VarActionType.Replace;
						break;
					case vscode.EnvironmentVariableMutatorType.Append:
						actionType = VarActionType.Append;
						break;
					case vscode.EnvironmentVariableMutatorType.Prepend:
						actionType = VarActionType.Prepend;
						break;
					default:
						this.log(`Unknown environment variable action type ${action.action} ` +
							`for extension ${extensionId}, ${action.name} => ${action.value}; ignoring`,
							vscode.LogLevel.Error);
						continue;
				}

				const varAction: VarAction = {
					action: actionType,
					name: action.name,
					value: action.value
				};
				varActions.push(varAction);
			}
		}

		if (this._kernelSpec?.env) {
			for (const [key, value] of Object.entries(this._kernelSpec.env)) {
				if (typeof value === 'string') {
					const action: VarAction = {
						action: VarActionType.Replace,
						name: key,
						value
					};
					varActions.push(action);
				}
			}
		}

		return varActions;
	}

	public async create(kernelSpec: JupyterKernelSpec) {
		this.log(`[DEBUG-SESSION-CREATE] Starting session creation`, vscode.LogLevel.Info);
		this.log(`[DEBUG-SESSION-CREATE] kernelSpec: ${JSON.stringify(kernelSpec, null, 2)}`, vscode.LogLevel.Info);
		this.log(`[DEBUG-SESSION-CREATE] metadata: ${JSON.stringify(this.metadata, null, 2)}`, vscode.LogLevel.Info);
		
		if (!this._new) {
			throw new Error(`Session ${this.metadata.sessionId} already exists`);
		}

		this._kernelSpec = kernelSpec;
		const varActions = await this.buildEnvVarActions(false);
		this.log(`[DEBUG-SESSION-CREATE] varActions: ${JSON.stringify(varActions, null, 2)}`, vscode.LogLevel.Info);

		let workingDir = this.metadata.workingDirectory;
		if (!workingDir) {
			workingDir = vscode.workspace.workspaceFolders?.[0].uri.fsPath || os.homedir();
		}
		this.log(`[DEBUG-SESSION-CREATE] workingDir: ${workingDir}`, vscode.LogLevel.Info);

		const tempdir = os.tmpdir();
		const sep = path.sep;
		const kerneldir = fs.mkdtempSync(`${tempdir}${sep}kernel-`);
		const logFile = path.join(kerneldir, 'kernel.log');
		const profileFile = path.join(kerneldir, 'kernel-profile.log');
		this.log(`[DEBUG-SESSION-CREATE] kernel temp files: ${JSON.stringify({ kerneldir, logFile, profileFile })}`, vscode.LogLevel.Info);
		
		const args = kernelSpec.argv.map((arg, _idx) => {

			if (arg === '{log_file}') {
				fs.writeFile(logFile, '', async () => {
					await this.streamLogFile(logFile);
				});
				return logFile;
			}

			if (profileFile && arg === '{profile_file}') {
				fs.writeFile(profileFile, '', async () => {
					await this.streamProfileFile(profileFile);
				});
				return profileFile;
			}

			return arg;
		}) as Array<string>;
		this.log(`[DEBUG-SESSION-CREATE] processed args: ${JSON.stringify(args)}`, vscode.LogLevel.Info);

		let interruptMode = InterruptMode.Message;

		if (kernelSpec.interrupt_mode) {
			switch (kernelSpec.interrupt_mode) {
				case 'signal':
					interruptMode = InterruptMode.Signal;
					break;
				case 'message':
					interruptMode = InterruptMode.Message;
					break;
			}
		}

		const config = vscode.workspace.getConfiguration('kernelSupervisor');
		const attachOnStartup = config.get('attachOnStartup', false) && this._extra?.attachOnStartup;
		const sleepOnStartup = config.get('sleepOnStartup', undefined) && this._extra?.sleepOnStartup;
		const connectionTimeout = config.get('connectionTimeout', 30);
		if (attachOnStartup) {
			this._extra!.attachOnStartup!.init(args);
		}
		if (sleepOnStartup) {
			const delay = config.get('sleepOnStartup', 0);
			this._extra!.sleepOnStartup!.init(args, delay);
		}

		const runInShell = config.get('runInShell', false);

		const session: NewSession = {
			argv: args,
			sessionId: this.metadata.sessionId,
			language: kernelSpec.language,
			displayName: this.dynState.sessionName,
			inputPrompt: '',
			continuationPrompt: '',
			env: varActions,
			workingDirectory: workingDir,
			runInShell,
			username: os.userInfo().username,
			interruptMode,
			connectionTimeout,
			protocolVersion: kernelSpec.kernel_protocol_version
		};
		this.log(`[DEBUG] ORIGINAL kernelSpec.argv: ${JSON.stringify(kernelSpec.argv)}`, vscode.LogLevel.Info);
		this.log(`[DEBUG] PROCESSED args: ${JSON.stringify(args)}`, vscode.LogLevel.Info);
		this.log(`[DEBUG] FULL NewSession object: ${JSON.stringify(session, null, 2)}`, vscode.LogLevel.Info);
		this.log(`[DEBUG-SESSION-CREATE] API configuration: ${JSON.stringify((this._api as any).configuration, null, 2)}`, vscode.LogLevel.Info);
		this.log(`[DEBUG-SESSION-CREATE] About to call newSession API`, vscode.LogLevel.Info);
		
		try {
			await this._api.newSession(session);
			this.log(`[DEBUG-SESSION-CREATE] newSession API call succeeded`, vscode.LogLevel.Info);
		} catch (error) {
			this.log(`[DEBUG-SESSION-CREATE] newSession API call failed: ${JSON.stringify({
				error: error,
				errorMessage: error.message,
				errorStack: error.stack,
				errorCode: error.code,
				errorStatus: error.status,
				errorResponse: error.response
			}, null, 2)}`, vscode.LogLevel.Info);
			throw error;
		}
		
		this.log(`${kernelSpec.display_name} session '${this.metadata.sessionId}' created in ${workingDir} with command:`, vscode.LogLevel.Info);
		this.log(args.join(' '), vscode.LogLevel.Info);
		this.log(`[DEBUG-SESSION-CREATE] Opening established barrier`, vscode.LogLevel.Info);
		this._established.open();
	}

	async startErdosLsp(clientId: string, ipAddress: string): Promise<number> {
		this.log(`Starting LSP server ${clientId} for ${ipAddress}`, vscode.LogLevel.Info);

		this._disposables.push(erdos.runtime.registerClientInstance(clientId));

		await this.createClient(
			clientId,
			erdos.RuntimeClientType.Lsp,
			{ ip_address: ipAddress }
		);

		const startPromise = new PromiseHandles<number>();
		this._startingComms.set(clientId, startPromise);
		return startPromise.promise;
	}

	async startErdosDap(clientId: string, debugType: string, debugName: string) {
		const ipAddress = '127.0.0.1';

		this.log(`Starting DAP server ${clientId} for ${ipAddress}`, vscode.LogLevel.Debug);

		this._disposables.push(erdos.runtime.registerClientInstance(clientId));

		await this.createClient(
			clientId,
			erdos.RuntimeClientType.Dap,
			{ ip_address: ipAddress }
		);

		const startPromise = new PromiseHandles<number>();
		this._startingComms.set(clientId, startPromise);

		const port = await startPromise.promise;

		this._dapClient = new DapClient(clientId, port, debugType, debugName, this);
	}

	createErdosLspClientId(): string {
		return `erdos-lsp-${this.runtimeMetadata.languageId}-${createUniqueId()}`;
	}

	createErdosDapClientId(): string {
		return `erdos-dap-${this.runtimeMetadata.languageId}-${createUniqueId()}`;
	}

	emitJupyterLog(message: string, logLevel?: vscode.LogLevel): void {
		this.log(message, logLevel);
	}

	showOutput(channel?: erdos.LanguageRuntimeSessionChannel): void {
		switch (channel) {
			case erdos.LanguageRuntimeSessionChannel.Kernel:
				this._kernelChannel?.show();
				break;
			case erdos.LanguageRuntimeSessionChannel.Console:
				this._consoleChannel.show();
				break;
			case undefined:
				this._kernelChannel.show();
				break;
			default:
				throw new Error(`Unknown output channel ${channel}`);
		}
	}

	listOutputChannels(): erdos.LanguageRuntimeSessionChannel[] {
		const channels = [erdos.LanguageRuntimeSessionChannel.Console, erdos.LanguageRuntimeSessionChannel.Kernel];
		return channels;
	}

	callMethod(method: string, ...args: Array<any>): Promise<any> {
		const promise = new PromiseHandles;

		const request = new UICommRequest(method, args, promise);

		const uiComm = Array.from(this._comms.values())
			.find(c => c.target === erdos.RuntimeClientType.Ui);

		if (!uiComm) {
			this._pendingUiCommRequests.push(request);
			this.log(`No UI comm open yet; queueing request '${method}'`, vscode.LogLevel.Debug);
			return promise.promise;
		}

		return this.performUiCommRequest(request, uiComm.id);
	}

	performUiCommRequest(req: UICommRequest, uiCommId: string): Promise<any> {
		const request = {
			jsonrpc: '2.0',
			method: 'call_method',
			params: {
				method: req.method,
				params: req.args
			},
		};

		const commMsg: JupyterCommMsg = {
			comm_id: uiCommId,
			data: request
		};

		const commRequest = new CommMsgRequest(createUniqueId(), commMsg);
		this.sendRequest(commRequest).then((reply) => {
			const response = reply.data;

			if (Object.keys(response).includes('error')) {
				const error = response.error as any;

				error.name = `RPC Error ${error.code}`;

				req.promise.reject(error);
			}

			if (!Object.keys(response).includes('result')) {
				const error: erdos.RuntimeMethodError = {
					code: erdos.RuntimeMethodErrorCode.InternalError,
					message: `Invalid response from UI comm: no 'result' field. ` +
						`(response = ${JSON.stringify(response)})`,
					name: `InvalidResponseError`,
					data: {},
				};

				req.promise.reject(error);
			}

			req.promise.resolve(response.result);
		})
			.catch((err) => {
				this.log(`Failed to send UI comm request: ${JSON.stringify(err)}`, vscode.LogLevel.Error);
				req.promise.reject(err);
			});

		return req.promise.promise;
	}

	getKernelLogFile(): string {
		if (!this._kernelLogFile) {
			throw new Error('Kernel log file not available');
		}
		return this._kernelLogFile;
	}

	onDidReceiveRuntimeMessage: vscode.Event<erdos.LanguageRuntimeMessage>;
	onDidChangeRuntimeState: vscode.Event<erdos.RuntimeState>;
	onDidEndSession: vscode.Event<erdos.LanguageRuntimeExit>;

	execute(code: string,
		id: string,
		mode: erdos.RuntimeCodeExecutionMode,
		errorBehavior: erdos.RuntimeErrorBehavior): void {

		const request: JupyterExecuteRequest = {
			code,
			silent: mode === erdos.RuntimeCodeExecutionMode.Silent,
			store_history: mode === erdos.RuntimeCodeExecutionMode.Interactive,
			user_expressions: {},
			allow_stdin: true,
			stop_on_error: errorBehavior === erdos.RuntimeErrorBehavior.Stop,
		};

		const execute = new ExecuteRequest(id, request);
		this.sendRequest(execute).then((reply) => {
			this.log(`Execution result: ${JSON.stringify(reply)}`, vscode.LogLevel.Debug);
		}).catch((err) => {
			this.log(`Failed to send execution request for '${code}': ${err}`, vscode.LogLevel.Error);
		});
	}

	async isCodeFragmentComplete(code: string): Promise<erdos.RuntimeCodeFragmentStatus> {
		const request: JupyterIsCompleteRequest = {
			code
		};
		const isComplete = new IsCompleteRequest(request);
		const reply = await this.sendRequest(isComplete);
		switch (reply.status) {
			case 'complete':
				return erdos.RuntimeCodeFragmentStatus.Complete;
			case 'incomplete':
				return erdos.RuntimeCodeFragmentStatus.Incomplete;
			case 'invalid':
				return erdos.RuntimeCodeFragmentStatus.Invalid;
			case 'unknown':
				return erdos.RuntimeCodeFragmentStatus.Unknown;
		}
	}

	async createClient(
		id: string,
		type: erdos.RuntimeClientType,
		params: Record<string, unknown>,
		metadata?: Record<string, unknown>): Promise<void> {

		if (
			type === erdos.RuntimeClientType.Lsp ||
			type === erdos.RuntimeClientType.Dap ||
			type === erdos.RuntimeClientType.Ui ||
			type === erdos.RuntimeClientType.Help ||
			type === erdos.RuntimeClientType.Plot ||
			type === erdos.RuntimeClientType.IPyWidgetControl) {

			const msg: JupyterCommOpen = {
				target_name: type,
				comm_id: id,
				data: params
			};
			const commOpen = new CommOpenCommand(msg, metadata);
			await this.sendCommand(commOpen);
			this._comms.set(id, new Comm(id, type));

			if (type === erdos.RuntimeClientType.Ui) {
				this.sendPendingUiCommRequests(id).then(() => {
					this.log(`Sent pending UI comm requests to ${id}`, vscode.LogLevel.Trace);
				});
			}
		} else {
			this.log(`Can't create ${type} client for ${this.runtimeMetadata.languageName} (not supported)`, vscode.LogLevel.Error);
		}
	}

	async listClients(type?: erdos.RuntimeClientType): Promise<Record<string, string>> {
		const request = new CommInfoRequest(type || '');
		const reply = await this.sendRequest(request);
		const result: Record<string, string> = {};
		const comms = reply.comms;
		for (const key in comms) {
			if (comms.hasOwnProperty(key)) {
				const target = comms[key].target_name;
				result[key] = target;
				if (!this._comms.has(key)) {
					this._comms.set(key, new Comm(key, target));
				}

				if (target === erdos.RuntimeClientType.Ui) {
					this.sendPendingUiCommRequests(key).then(() => {
						this.log(`Sent pending UI comm requests to ${key}`, vscode.LogLevel.Trace);
					});
				}
			}
		}
		return result;
	}

	removeClient(id: string): void {
		if (this._runtimeState === erdos.RuntimeState.Exited) {
			this.log(`Ignoring request to close comm ${id}; kernel has already exited`, vscode.LogLevel.Debug);
			return;
		}
		const commClose = new CommCloseCommand(id);
		this.sendCommand(commClose);
	}

	sendClientMessage(client_id: string, message_id: string, message: any): void {
		const msg: JupyterCommMsg = {
			comm_id: client_id,
			data: message
		};
		const commMsg = new CommMsgCommand(message_id, msg);
		this.sendCommand(commMsg).then(() => {
		}).catch((err) => {
			this.log(`Failed to send message ${JSON.stringify(message)} to ${client_id}: ${err}`, vscode.LogLevel.Error);
		});
	}

	replyToPrompt(id: string, value: string): void {
		if (!this._activeBackendRequestHeader) {
			this.log(`Failed to find parent for input request ${id}; sending anyway: ${value}`, vscode.LogLevel.Warning);
			return;
		}
		const reply = new InputReplyCommand(this._activeBackendRequestHeader, value);
		this.log(`Sending input reply for ${id}: ${value}`, vscode.LogLevel.Debug);
		this.sendCommand(reply);
	}

	setWorkingDirectory(workingDirectory: string): Promise<void> {
		return Promise.reject(
			`Cannot change working directory to ${workingDirectory} (not implemented)`);
	}

	async restore(session: ActiveSession) {
		for (const arg of ['--log', '--logfile']) {
			const logFileIndex = session.argv.indexOf(arg);
			if (logFileIndex > 0 && logFileIndex < session.argv.length - 1) {
				const logFile = session.argv[logFileIndex + 1];
				if (fs.existsSync(logFile)) {
					await this.streamLogFile(logFile);
					break;
				}
			}
		}

		const profileFileIndex = session.argv.indexOf('--profile');
		if (profileFileIndex > 0 && profileFileIndex < session.argv.length - 1) {
			const profileFile = session.argv[profileFileIndex + 1];
			if (fs.existsSync(profileFile)) {
				this.streamProfileFile(profileFile);
			}
		}

		this._activeSession = session;
		this._established.open();
	}

	async startAndAdoptKernel(
		kernelSpec: JupyterKernelSpec):
		Promise<erdos.LanguageRuntimeInfo> {

		this.onStateChange(erdos.RuntimeState.Starting, 'starting kernel via external provider');

		try {
			const result = await this.tryStartAndAdoptKernel(kernelSpec);
			return result;
		} catch (err) {
			if (this._runtimeState === erdos.RuntimeState.Starting) {
				const event: erdos.LanguageRuntimeExit = {
					runtime_name: this.runtimeMetadata.runtimeName,
					session_name: this.dynState.sessionName,
					exit_code: 0,
					reason: erdos.RuntimeExitReason.StartupFailed,
					message: summarizeError(err)
				};
				this._exit.fire(event);
				this.onStateChange(erdos.RuntimeState.Exited, 'kernel adoption failed');
			}
			throw err;
		}
	}

	async tryStartAndAdoptKernel(kernelSpec: JupyterKernelSpec): Promise<erdos.LanguageRuntimeInfo> {

		const connectionFileContents = {};
		let connectionInfo: ConnectionInfo;
		try {
			const result = await this._api.connectionInfo(this.metadata.sessionId);
			connectionInfo = result.body;

			for (const [inKey, val] of Object.entries(connectionInfo)) {
				for (const outKey of ConnectionInfo.attributeTypeMap) {
					if (inKey === outKey.name) {
						connectionFileContents[outKey.baseName] = val;
					}
				}
			}
		} catch (err) {
			throw new Error(`Failed to aquire connection info for session ${this.metadata.sessionId}: ${summarizeError(err)}`);
		}

		if (!this._kernelLogFile) {
			const logFile = path.join(os.tmpdir(), `kernel-${this.metadata.sessionId}.log`);
			this._kernelLogFile = logFile;
			fs.writeFile(logFile, '', async () => {
				await this.streamLogFile(logFile);
			});
		}

		const connectionFile = path.join(os.tmpdir(), `connection-${this.metadata.sessionId}.json`);
		fs.writeFileSync(connectionFile, JSON.stringify(connectionFileContents));
		const session: JupyterSession = {
			state: {
				sessionId: this.metadata.sessionId,
				connectionFile: connectionFile,
				logFile: this._kernelLogFile,
				processId: 0,
			}
		};

		const kernel = new AdoptedSession(this, connectionInfo, this._api);

		await kernelSpec.startKernel!(session, kernel);

		await kernel.connected.wait();

		await withTimeout(this.connect(), 2000, `Start failed: timed out connecting to adopted session ${this.metadata.sessionId}`);

		this.markReady('kernel adoption complete');

		const info = kernel.runtimeInfo;
		if (info) {
			return this.runtimeInfoFromKernelInfo(info);
		} else {
			return this.getKernelInfo();
		}
	}

	async start(): Promise<erdos.LanguageRuntimeInfo> {
		if (this._kernelSpec?.startKernel) {
			return this.startAndAdoptKernel(this._kernelSpec);
		}

		try {
			const info = await this.tryStart();
			return info;
		} catch (err) {
			if (err instanceof HttpError && err.statusCode === 500) {
				const startupErr = err.body;
				let message = startupErr.error.message;
				if (startupErr.output) {
					message += `\n${startupErr.output}`;
				}
				const event: erdos.LanguageRuntimeExit = {
					runtime_name: this.runtimeMetadata.runtimeName,
					session_name: this.dynState.sessionName,
					exit_code: startupErr.exit_code ?? 0,
					reason: erdos.RuntimeExitReason.StartupFailed,
					message
				};
				this._exit.fire(event);
			} else {
				const event: erdos.LanguageRuntimeExit = {
					runtime_name: this.runtimeMetadata.runtimeName,
					session_name: this.dynState.sessionName,
					exit_code: 0,
					reason: erdos.RuntimeExitReason.StartupFailed,
					message: summarizeError(err)
				};
				this._exit.fire(event);
			}

			this.onStateChange(erdos.RuntimeState.Exited, 'startup failed');
			throw err;
		}
	}

	private async tryStart(): Promise<erdos.LanguageRuntimeInfo> {
		await withTimeout(this._established.wait(), 2000, `Start failed: timed out waiting for session ${this.metadata.sessionId} to be established`);

		let runtimeInfo: erdos.LanguageRuntimeInfo | undefined;

		this.onStateChange(erdos.RuntimeState.Starting, 'invoking start API');

		if (this._new) {
			try {
				const result = await this._api.startSession(this.metadata.sessionId);
				const kernelInfo = result.body as KernelInfoReply;
				
				if (kernelInfo.status === 'ok') {
					runtimeInfo = this.runtimeInfoFromKernelInfo(kernelInfo);
				}
			} catch (error) {
				throw error;
			}
		}

		const config = vscode.workspace.getConfiguration('kernelSupervisor');
		const attachOnStartup = config.get('attachOnStartup', false) && this._extra?.attachOnStartup;
		if (attachOnStartup) {
			try {
				await this._extra!.attachOnStartup!.attach();
			} catch (err) {
				this.log(`Can't execute attach action: ${err}`, vscode.LogLevel.Error);
			}
		}

		await withTimeout(this.connect(), 2000, `Start failed: timed out connecting to session ${this.metadata.sessionId}`);

		if (this._new) {
			if (runtimeInfo) {
				this.markReady('new session');
			} else {
				await withTimeout(this._ready.wait(), 10000, `Start failed: timed out waiting for session ${this.metadata.sessionId} to be ready`);
			}
		} else {
			if (this._activeSession?.status === Status.Busy) {
				vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: vscode.l10n.t('{0} is busy; waiting for it to become idle before reconnecting.', this.dynState.sessionName),
					cancellable: true,
				}, async (progress, token) => {
					const disposable = token.onCancellationRequested(() => {
						this.requestReconnectInterrupt();
					});
					try {
						await this.waitForIdle();
					} finally {
						disposable.dispose();
					}
					this.markReady('idle after busy reconnect');
				});
			} else {
				this.markReady('idle after reconnect');
			}
		}

		if (!runtimeInfo) {
			runtimeInfo = await this.getKernelInfo();
		}

		return runtimeInfo;
	}

	private requestReconnectInterrupt() {
		erdos.window.showSimpleModalDialogPrompt(
			vscode.l10n.t('Interrupt {0}', this.dynState.sessionName),
			vscode.l10n.t('Erdos is waiting for {0} to complete work; it will reconnect automatically when {1} becomes idle. Do you want to interrupt the active computation in order to reconnect now?', this.runtimeMetadata.languageName, this.runtimeMetadata.languageName),
			vscode.l10n.t('Interrupt'),
			vscode.l10n.t('Wait'),
		).then((result) => {
			if (!result) {
				vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: vscode.l10n.t('{0} is busy; continuing to wait for it to become idle.', this.dynState.sessionName),
					cancellable: true,
				}, async (_progress, token) => {
					const disposable = token.onCancellationRequested(() => {
						this.requestReconnectInterrupt();
					});
					try {
						await this.waitForIdle();
					} finally {
						disposable.dispose();
					}
				});
				return;
			}

			vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: vscode.l10n.t('Interrupting {0}', this.dynState.sessionName),
				cancellable: false,
			}, async (_progress, _token) => {
				try {
					await this._api.interruptSession(this.metadata.sessionId);
				} catch (err) {
					this.log(`Failed to interrupt session ${this.metadata.sessionId}: ${summarizeError(err)}`, vscode.LogLevel.Error);
					vscode.window.showErrorMessage(vscode.l10n.t('Failed to interrupt {0}: {1}', this.dynState.sessionName, summarizeError(err)));
				}
			});
		});
	}

	async waitForIdle(): Promise<void> {
		return new Promise((resolve, _reject) => {
			this._state.event(async (state) => {
				if (state === erdos.RuntimeState.Idle) {
					resolve();
				}
			});
		});
	}

	private markReady(reason: string) {
		this._ready.open();

		if (this._runtimeState !== erdos.RuntimeState.Ready) {
			this.onStateChange(erdos.RuntimeState.Ready, reason);
		}
	}

	async getWebsocketUri(): Promise<string> {
		const basePath = this._api.basePath;
		let wsUri: string;

		if (basePath && basePath.includes('unix:')) {
			this.log(
				`Using Unix domain socket transport, getting socket path for session ${this.metadata.sessionId}`,
				vscode.LogLevel.Debug);
			const channelsResponse = await this._api.channelsUpgrade(this.metadata.sessionId);
			const socketPath = channelsResponse.body;

			if (socketPath.startsWith('ws+unix://')) {
				wsUri = socketPath;
			} else if (socketPath.startsWith('/')) {
				wsUri = `ws+unix://${socketPath}:/api/channels/${this.metadata.sessionId}`;
			} else {
				const socketMatch = basePath.match(/unix:([^:]+):/);
				if (socketMatch) {
					const baseSocketPath = socketMatch[1];
					wsUri = `ws+unix://${baseSocketPath}:/api/channels/${this.metadata.sessionId}`;
				} else {
					throw new Error(`Cannot extract socket path from base path: ${basePath}`);
				}
			}
		} else if (basePath && basePath.includes('npipe:')) {
			this.log(
				`Using named pipe transport, getting pipe name for session ${this.metadata.sessionId}`,
				vscode.LogLevel.Debug
			);
			const channelsResponse = await this._api.channelsUpgrade(this.metadata.sessionId);
			const pipeName = channelsResponse.body;

			if (pipeName.startsWith('ws+npipe://')) {
				wsUri = pipeName;
			} else if (pipeName.startsWith('\\\\.\\pipe\\') || pipeName.includes('pipe\\')) {
				wsUri = `ws+npipe://${pipeName}:/api/channels/${this.metadata.sessionId}`;
			} else {
				const pipeMatch = basePath.match(/npipe:([^:]+):/);
				if (pipeMatch) {
					const basePipeName = pipeMatch[1];
					const fullPipeName = basePipeName.startsWith('\\\\.\\pipe\\') ?
						basePipeName :
						(basePipeName.startsWith('pipe\\') ? `\\\\.\\${basePipeName}` : `\\\\.\\pipe\\${basePipeName}`);
					wsUri = `ws+npipe://${fullPipeName}:/api/channels/${this.metadata.sessionId}`;
				} else {
					throw new Error(`Cannot extract pipe name from base path: ${basePath}`);
				}
			}
		} else {
			this.log(`Using TCP transport, constructing WebSocket URI from base path: ${basePath}`, vscode.LogLevel.Debug);
			if (!basePath) {
				throw new Error('API base path is not set for TCP transport');
			}

			const wsScheme = basePath.startsWith('https://') ? 'wss://' : 'ws://';
			const baseUrl = basePath.replace(/^https?:\/\//, '').replace(/\/$/, '');
			wsUri = `${wsScheme}${baseUrl}/sessions/${this.metadata.sessionId}/channels`;
		}
		return wsUri;
	}

	async connect(): Promise<void> {
		if (!this._canConnect) {
			return Promise.reject(new Error('This session cannot be reconnected.'));
		}

		const wsUri = await this.getWebsocketUri();

		return new Promise((resolve, reject) => {
			if (this._socket) {
				this._socket.close();
			}

			this.log(`Connecting to session WebSocket via ${wsUri}`, vscode.LogLevel.Info);

			const defaultAuth = (this._api as any).authentications?.default;
			let accessToken: string | undefined;
			const headers: { [key: string]: string } = {};
			if (defaultAuth && typeof defaultAuth.accessToken !== 'undefined') {
				accessToken = typeof defaultAuth.accessToken === 'function' ? defaultAuth.accessToken() : defaultAuth.accessToken;
				headers['Authorization'] = `Bearer ${accessToken}`;
			} else {
				this.log(`Warning: No Bearer token found for WebSocket authentication`, vscode.LogLevel.Warning);
			}

			this._socket = new SocketSession(wsUri, this.metadata.sessionId, this._consoleChannel, headers);
			this._disposables.push(this._socket);

			this._socket.ws.onopen = () => {
				this.log(`🔍 ERDOS WEBSOCKET CONNECTED to ${wsUri}`, vscode.LogLevel.Info);
				this._connected.open();
				resolve();
			};

			this._socket.ws.onerror = (err: any) => {
				this.log(`Websocket error: ${JSON.stringify(err)}`, vscode.LogLevel.Error);
				if (this._connected.isOpen()) {
					this._connected = new Barrier();
					vscode.window.showErrorMessage(`Error connecting to ${this.dynState.sessionName} (${this.metadata.sessionId}): ${JSON.stringify(err)}`);
				} else {
					reject(err);
				}
			};

			this._socket.ws.onclose = (evt: any) => {
				this.log(`Websocket closed with kernel in status ${this._runtimeState}: ${JSON.stringify(evt)}`, vscode.LogLevel.Info);

				if (this._canConnect) {
					const disconnectEvent: DisconnectedEvent = {
						reason: this._runtimeState === erdos.RuntimeState.Exited ?
							DisconnectReason.Exit : DisconnectReason.Unknown,
						state: this._runtimeState,
					};
					this.disconnected.fire(disconnectEvent);
				}

				this._connected = new Barrier();
				this._socket = undefined;
			};

			this._socket.ws.onmessage = (msg: any) => {
				try {
					const data = JSON.parse(msg.data.toString());
					this.handleMessage(data);
				} catch (err) {
					this.log(`Could not parse message: ${err}`, vscode.LogLevel.Error);
				}
			};
		});
	}

	async interrupt(): Promise<void> {
		this._activeBackendRequestHeader = null;

		try {
			await this._api.interruptSession(this.metadata.sessionId);
		} catch (err) {
			if (err instanceof HttpError) {
				throw new Error(summarizeHttpError(err));
			}
			throw err;
		}
	}

	async restart(workingDirectory?: string): Promise<void> {
		this._exitReason = erdos.RuntimeExitReason.Restart;

		this._restarting = true;
		try {
			const restart: RestartSession = {
				workingDirectory,
				env: await this.buildEnvVarActions(true),
			};
			await this._api.restartSession(this.metadata.sessionId, restart);
		} catch (err) {
			if (err instanceof HttpError) {
				throw new Error(summarizeHttpError(err));
			} else {
				throw err;
			}
		}
	}

	async shutdown(exitReason: erdos.RuntimeExitReason): Promise<void> {
		this._exitReason = exitReason;
		const restarting = exitReason === erdos.RuntimeExitReason.Restart;
		const shutdownRequest = new ShutdownRequest(restarting);
		await this.sendRequest(shutdownRequest);
		
		const exitEvent: erdos.LanguageRuntimeExit = {
			runtime_name: this.runtimeMetadata.runtimeName,
			session_name: this.dynState.sessionName,
			exit_code: 0,
			reason: this._exitReason,
			message: ''
		};
		this._exit.fire(exitEvent);
		this.onStateChange(erdos.RuntimeState.Exited, 'session shutdown completed');
	}

	async forceQuit(): Promise<void> {
		try {
			this._exitReason = erdos.RuntimeExitReason.ForcedQuit;
			await this._api.deleteSession(this.metadata.sessionId);
		} catch (err) {
			this._exitReason = erdos.RuntimeExitReason.Unknown;
			if (err instanceof HttpError) {
				throw new Error(summarizeHttpError(err));
			} else {
				throw err;
			}
		}
	}

	async showProfile?(): Promise<void> {
		this._profileChannel?.show();
	}

	dispose() {
		if (this._socket) {
			this._socket.close();
		}

		this._disposables.forEach(d => d.dispose());
		this._disposables = [];
	}

	public disconnect() {
		this._socket?.ws.close();
	}

	handleMessage(data: any) {
		this.log(`🔍 ERDOS RAW MESSAGE: ${JSON.stringify(data, null, 2)}`, vscode.LogLevel.Info);
		
		if (!data.kind) {
			this.log(`KernelBridge session ${this.metadata.sessionId} message has no kind: ${JSON.stringify(data)}`, vscode.LogLevel.Warning);
			return;
		}
		
		this.log(`🔍 ERDOS MESSAGE KIND: ${data.kind}`, vscode.LogLevel.Info);
		
		switch (data.kind) {
			case 'kernel':
				this.log(`🔍 ERDOS HANDLING KERNEL MESSAGE`, vscode.LogLevel.Info);
				this.handleKernelMessage(data);
				break;
			case 'jupyter':
				this.log(`🔍 ERDOS HANDLING JUPYTER MESSAGE`, vscode.LogLevel.Info);
				this.handleJupyterMessage(data);
				break;
		}
	}

	handleKernelMessage(data: any) {
		this.log(`<<< RECV [kernel]: ${JSON.stringify(data)}`, vscode.LogLevel.Debug);
		if (data.hasOwnProperty('status')) {
			const status = data.status.status;

			if (Object.values(erdos.RuntimeState).includes(status)) {
				if (status === erdos.RuntimeState.Starting &&
					this._runtimeState !== erdos.RuntimeState.Uninitialized &&
					this._runtimeState !== erdos.RuntimeState.Exited &&
					this._runtimeState !== erdos.RuntimeState.Restarting) {
					this.log(`Ignoring 'starting' state message; already in state '${this._runtimeState}'`, vscode.LogLevel.Trace);
					return;
				}
				if (status === erdos.RuntimeState.Ready &&
					this._runtimeState === erdos.RuntimeState.Idle &&
					!this._restarting) {
					this.log(`Ignoring 'ready' state message; already in state '${this._runtimeState}'`, vscode.LogLevel.Trace);
					return;
				}
				this.onStateChange(status, data.status.reason);
			} else {
				this.log(`Unknown state: ${status}`);
			}
		} else if (data.hasOwnProperty('output')) {
			const output = data as KernelOutputMessage;
			this._kernelChannel.append(output.output[1]);
		} else if (data.hasOwnProperty('clientDisconnected')) {
			this._kernelChannel.append(`Client disconnected: ${data.clientDisconnected}`);
			this.disconnect();

			const disconnectEvent: DisconnectedEvent = {
				reason: DisconnectReason.Transferred,
				state: this._runtimeState,
			};
			this.disconnected.fire(disconnectEvent);
			this.onStateChange(erdos.RuntimeState.Exited, data.clientDisconnected);

			const exitEvent: erdos.LanguageRuntimeExit = {
				exit_code: 0,
				reason: erdos.RuntimeExitReason.Transferred,
				runtime_name: this.runtimeMetadata.runtimeName,
				session_name: this.dynState.sessionName,
				message: ''
			};
			this._exit.fire(exitEvent);

			this._canConnect = false;
		} else if (data.hasOwnProperty('exited')) {
			this.onExited(data.exited);
		}
	}

	updateSessionName(sessionName: string): void {
		this.dynState.sessionName = sessionName;
	}

	get runtimeState(): erdos.RuntimeState {
		return this._runtimeState;
	}

	private onStateChange(newState: erdos.RuntimeState, reason: string) {
		if (newState === erdos.RuntimeState.Ready) {
			this.log(`Kernel is ready.`);
			this._ready.open();
		}

		if (newState === erdos.RuntimeState.Offline) {
			this._connected = new Barrier();
		}
		if (this._runtimeState === erdos.RuntimeState.Offline &&
			newState !== erdos.RuntimeState.Exited &&
			newState !== erdos.RuntimeState.Offline) {
			this.log(`The kernel is back online.`, vscode.LogLevel.Info);
			this._connected.open();
		}
		if (newState === erdos.RuntimeState.Starting) {
			if (this._restarting) {
				this.log(`The kernel has started up after a restart.`, vscode.LogLevel.Info);
				this._restarting = false;
			}
		}

		if (this._runtimeState !== newState) {
			this._runtimeState = newState;
			this._state.fire(newState);
		}
	}

	markExited(exitCode: number, reason: erdos.RuntimeExitReason) {
		this._exitReason = reason;
		this.onStateChange(erdos.RuntimeState.Exited, 'kernel exited with code ' + exitCode);
		this.onExited(exitCode);
	}

	markOffline(reason: string) {
		this.onStateChange(erdos.RuntimeState.Offline, reason);
	}

	private onExited(exitCode: number) {
		if (this._restarting) {
			this.log(`Kernel exited with code ${exitCode}; waiting for restart to finish.`, vscode.LogLevel.Info);
		} else {
			this.log(`Kernel exited with code ${exitCode}; cleaning up.`, vscode.LogLevel.Info);
			this._socket?.close();
			this._socket = undefined;
			this._connected = new Barrier();
		}

		this._comms.clear();

		this._startingComms.forEach((promise) => {
			promise.reject(new Error('Kernel exited'));
		});
		this._startingComms.clear();

		this._pendingRequests.clear();
		this._pendingUiCommRequests.forEach((req) => {
			req.promise.reject(new Error('Kernel exited'));
		});
		this._pendingUiCommRequests = [];

		this._ready = new Barrier();

		if (this._exitReason === erdos.RuntimeExitReason.Unknown && exitCode !== 0) {
			this._exitReason = erdos.RuntimeExitReason.Error;
		}

		const event: erdos.LanguageRuntimeExit = {
			runtime_name: this.runtimeMetadata.runtimeName,
			session_name: this.dynState.sessionName,
			exit_code: exitCode,
			reason: this._exitReason,
			message: ''
		};
		this._exit.fire(event);

		this._exitReason = erdos.RuntimeExitReason.Unknown;
	}

	async getKernelInfo(): Promise<erdos.LanguageRuntimeInfo> {
		const request = new KernelInfoRequest();
		const reply = await this.sendRequest(request);
		return this.runtimeInfoFromKernelInfo(reply);
	}

	private runtimeInfoFromKernelInfo(reply: KernelInfoReply) {
		const input_prompt = reply.language_info.erdos?.input_prompt;
		const continuation_prompt = reply.language_info.erdos?.continuation_prompt;

		if (input_prompt) {
			this.dynState.inputPrompt = input_prompt;
		}
		if (continuation_prompt) {
			this.dynState.continuationPrompt = continuation_prompt;
		}

		const info: erdos.LanguageRuntimeInfo = {
			banner: reply.banner,
			implementation_version: reply.implementation_version,
			language_version: reply.language_info.version,
			input_prompt,
			continuation_prompt,
		};

		return info;
	}

	async handleJupyterMessage(data: any) {
		if (data.buffers?.length > 0) {
			data.buffers = data.buffers.map((b: string) => {
				return Buffer.from(b, 'base64');
			});
		}

		const msg = data as JupyterMessage;


		if (msg.parent_header && msg.parent_header.msg_id) {
			const request = this._pendingRequests.get(msg.parent_header.msg_id);
			if (request) {
				if (request.replyType === msg.header.msg_type) {
					request.resolve(msg.content);
					this._pendingRequests.delete(msg.parent_header.msg_id);
				}
			}
		}

		if (msg.channel === JupyterChannel.Stdin) {
			switch (msg.header.msg_type) {
				case JupyterMessageType.InputRequest:
					this._activeBackendRequestHeader = msg.header;
					break;
				case JupyterMessageType.RpcRequest: {
					try {
						await this.onCommRequest(msg);
						this.log(`Handled comm request: ${JSON.stringify(msg.content)}`, vscode.LogLevel.Debug);
					} catch (err) {
						this.log(`Failed to handle comm request: ${JSON.stringify(err)}`, vscode.LogLevel.Error);
					}
					break;
				}
			}
		}

		if (msg.header.msg_type === 'comm_msg') {
			const commMsg = msg.content as JupyterCommMsg;

			if (this._dapClient) {
				const comm = this._comms.get(commMsg.comm_id);
				if (comm && comm.id === this._dapClient.clientId) {
					this._dapClient.handleDapMessage(commMsg.data);
				}
			}

			if (commMsg.data.msg_type === 'server_started') {
				const serverStarted = commMsg.data.content as any;
				const startingPromise = this._startingComms.get(commMsg.comm_id);
				if (startingPromise) {
					startingPromise.resolve(serverStarted.port);
					this._startingComms.delete(commMsg.comm_id);
				}
			}
		}

		await this._ready.wait();

		this._messages.emitJupyter(msg);
	}

	async onCommRequest(msg: JupyterMessage): Promise<void> {
		const request = msg.content as JupyterCommRequest;

		const response = await erdos.methods.call(request.method, request.params);

		const reply = new RpcReplyCommand(msg.header, response);
		return this.sendCommand(reply);
	}

	async sendRequest<T>(request: JupyterRequest<any, T>): Promise<T> {
		await this._connected.wait();

		this.log(`🔍 ERDOS SENDING REQUEST: ${JSON.stringify(request, null, 2)}`, vscode.LogLevel.Info);

		this._pendingRequests.set(request.msgId, request);

		return request.sendRpc(this._socket!);
	}

	async sendCommand<T>(command: JupyterCommand<T>): Promise<void> {
		await this._connected.wait();

		this.log(`🔍 ERDOS SENDING COMMAND: ${JSON.stringify(command, null, 2)}`, vscode.LogLevel.Info);
		
		return command.sendCommand(this._socket!);
	}

	private async streamLogFile(logFile: string) {
		const logStreamer = new LogStreamer(this._kernelChannel, logFile, this.runtimeMetadata.languageName);
		this._kernelChannel.appendLine(`Streaming kernel log file: ${logFile}`);
		this._disposables.push(logStreamer);
		this._kernelLogFile = logFile;
		return logStreamer.watch();
	}

	private async streamProfileFile(profileFilePath: string) {

		this._profileChannel = erdos.window.createRawLogOutputChannel(
			this.metadata.notebookUri ?
				`Notebook: Profiler ${path.basename(this.metadata.notebookUri.path)} (${this.runtimeMetadata.runtimeName})` :
				`Erdos ${this.runtimeMetadata.languageName} Profiler`);

		this.log('Streaming profile file: ' + profileFilePath, vscode.LogLevel.Debug);

		const profileStreamer = new LogStreamer(this._profileChannel, profileFilePath);
		this._disposables.push(profileStreamer);

		await profileStreamer.watch();
	}

	public log(msg: string, logLevel?: vscode.LogLevel) {
		if (msg.length > 2048) {
			msg = msg.substring(0, 2048) + '... (truncated)';
		}

		switch (logLevel) {
			case vscode.LogLevel.Error:
				this._consoleChannel.error(msg);
				break;
			case vscode.LogLevel.Warning:
				this._consoleChannel.warn(msg);
				break;
			case vscode.LogLevel.Info:
				this._consoleChannel.info(msg);
				break;
			case vscode.LogLevel.Debug:
				this._consoleChannel.debug(msg);
				break;
			case vscode.LogLevel.Trace:
				this._consoleChannel.trace(msg);
				break;
			default:
				this._consoleChannel.appendLine(msg);
		}
	}

	private async sendPendingUiCommRequests(uiCommId: string) {
		if (this._pendingUiCommRequests.length === 0) {
			return;
		}

		const pendingRequests = this._pendingUiCommRequests;
		this._pendingUiCommRequests = [];

		await this.waitForIdle();

		const count = pendingRequests.length;
		for (let i = 0; i < pendingRequests.length; i++) {
			const req = pendingRequests[i];
			this.log(`Sending queued UI comm request '${req.method}' (${i + 1} of ${count})`, vscode.LogLevel.Debug);
			try {
				await this.performUiCommRequest(req, uiCommId);
			} catch (err) {
				this.log(`Failed to perform queued request '${req.method}': ${err}`, vscode.LogLevel.Error);
			}
		}
	}
}
