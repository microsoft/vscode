/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { URI, UriComponents } from 'vs/base/common/uri';
import * as platform from 'vs/base/common/platform';
import * as terminalEnvironment from 'vs/workbench/contrib/terminal/node/terminalEnvironment';
import { Event, Emitter } from 'vs/base/common/event';
import { ExtHostTerminalServiceShape, MainContext, MainThreadTerminalServiceShape, IMainContext, ShellLaunchConfigDto } from 'vs/workbench/api/node/extHost.protocol';
import { ExtHostConfiguration } from 'vs/workbench/api/node/extHostConfiguration';
import { ILogService } from 'vs/platform/log/common/log';
import { EXT_HOST_CREATION_DELAY } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalProcess } from 'vs/workbench/contrib/terminal/node/terminalProcess';
import { timeout } from 'vs/base/common/async';
import { generateRandomPipeName } from 'vs/base/parts/ipc/node/ipc.net';
import * as http from 'http';
import * as fs from 'fs';
import { ExtHostCommands } from 'vs/workbench/api/node/extHostCommands';
import { sanitizeProcessEnvironment } from 'vs/base/node/processes';
import { IURIToOpen, URIType } from 'vs/platform/windows/common/windows';

const RENDERER_NO_PROCESS_ID = -1;

export class BaseExtHostTerminal {
	public _id: number;
	protected _idPromise: Promise<number>;
	private _idPromiseComplete: (value: number) => any;
	private _disposed: boolean = false;
	private _queuedRequests: ApiRequest[] = [];

	constructor(
		protected _proxy: MainThreadTerminalServiceShape,
		id?: number
	) {
		this._idPromise = new Promise<number>(c => {
			if (id !== undefined) {
				this._id = id;
				c(id);
			} else {
				this._idPromiseComplete = c;
			}
		});
	}

	public dispose(): void {
		if (!this._disposed) {
			this._disposed = true;
			this._queueApiRequest(this._proxy.$dispose, []);
		}
	}

	protected _checkDisposed() {
		if (this._disposed) {
			throw new Error('Terminal has already been disposed');
		}
	}

	protected _queueApiRequest(callback: (...args: any[]) => void, args: any[]): void {
		const request: ApiRequest = new ApiRequest(callback, args);
		if (!this._id) {
			this._queuedRequests.push(request);
			return;
		}
		request.run(this._proxy, this._id);
	}

	public _runQueuedRequests(id: number): void {
		this._id = id;
		this._idPromiseComplete(id);
		this._queuedRequests.forEach((r) => {
			r.run(this._proxy, this._id);
		});
		this._queuedRequests.length = 0;
	}
}

export class ExtHostTerminal extends BaseExtHostTerminal implements vscode.Terminal {
	private _pidPromise: Promise<number>;
	private _pidPromiseComplete: (value: number) => any;
	private _cols: number | undefined;
	private _rows: number | undefined;

	private readonly _onData = new Emitter<string>();
	public get onDidWriteData(): Event<string> {
		// Tell the main side to start sending data if it's not already
		this._idPromise.then(c => {
			this._proxy.$registerOnDataListener(this._id);
		});
		return this._onData && this._onData.event;
	}

	constructor(
		proxy: MainThreadTerminalServiceShape,
		private _name: string,
		id?: number,
		pid?: number
	) {
		super(proxy, id);
		this._pidPromise = new Promise<number>(c => {
			if (pid === RENDERER_NO_PROCESS_ID) {
				c(undefined);
			} else {
				this._pidPromiseComplete = c;
			}
		});
	}

	public create(
		shellPath?: string,
		shellArgs?: string[],
		cwd?: string | URI,
		env?: { [key: string]: string },
		waitOnExit?: boolean,
		strictEnv?: boolean
	): void {
		this._proxy.$createTerminal(this._name, shellPath, shellArgs, cwd, env, waitOnExit, strictEnv).then(terminal => {
			this._name = terminal.name;
			this._runQueuedRequests(terminal.id);
		});
	}

	public get name(): string {
		return this._name;
	}

	public set name(name: string) {
		this._name = name;
	}

	public get dimensions(): vscode.TerminalDimensions | undefined {
		if (this._cols === undefined && this._rows === undefined) {
			return undefined;
		}
		return {
			columns: this._cols,
			rows: this._rows
		};
	}

	public setDimensions(cols: number, rows: number): boolean {
		if (cols === this._cols && rows === this._rows) {
			// Nothing changed
			return false;
		}
		this._cols = cols;
		this._rows = rows;
		return true;
	}

	public get processId(): Promise<number> {
		return this._pidPromise;
	}

	public sendText(text: string, addNewLine: boolean = true): void {
		this._checkDisposed();
		this._queueApiRequest(this._proxy.$sendText, [text, addNewLine]);
	}

	public show(preserveFocus: boolean): void {
		this._checkDisposed();
		this._queueApiRequest(this._proxy.$show, [preserveFocus]);
	}

	public hide(): void {
		this._checkDisposed();
		this._queueApiRequest(this._proxy.$hide, []);
	}

	public _setProcessId(processId: number): void {
		// The event may fire 2 times when the panel is restored
		if (this._pidPromiseComplete) {
			this._pidPromiseComplete(processId);
			this._pidPromiseComplete = null;
		} else {
			// Recreate the promise if this is the nth processId set (eg. reused task terminals)
			this._pidPromise.then(pid => {
				if (pid !== processId) {
					this._pidPromise = Promise.resolve(processId);
				}
			});
		}
	}

	public _fireOnData(data: string): void {
		this._onData.fire(data);
	}
}

export class ExtHostTerminalRenderer extends BaseExtHostTerminal implements vscode.TerminalRenderer {
	public get name(): string { return this._name; }
	public set name(newName: string) {
		this._name = newName;
		this._checkDisposed();
		this._queueApiRequest(this._proxy.$terminalRendererSetName, [this._name]);
	}

	private readonly _onInput = new Emitter<string>();
	public get onDidAcceptInput(): Event<string> {
		this._checkDisposed();
		this._queueApiRequest(this._proxy.$terminalRendererRegisterOnInputListener, [this._id]);
		// Tell the main side to start sending data if it's not already
		// this._proxy.$terminalRendererRegisterOnDataListener(this._id);
		return this._onInput && this._onInput.event;
	}

	private _dimensions: vscode.TerminalDimensions | undefined;
	public get dimensions(): vscode.TerminalDimensions { return this._dimensions; }
	public set dimensions(dimensions: vscode.TerminalDimensions) {
		this._checkDisposed();
		this._dimensions = dimensions;
		this._queueApiRequest(this._proxy.$terminalRendererSetDimensions, [dimensions]);
	}

	private _maximumDimensions: vscode.TerminalDimensions;
	public get maximumDimensions(): vscode.TerminalDimensions {
		if (!this._maximumDimensions) {
			return undefined;
		}
		return {
			rows: this._maximumDimensions.rows,
			columns: this._maximumDimensions.columns
		};
	}

	private readonly _onDidChangeMaximumDimensions: Emitter<vscode.TerminalDimensions> = new Emitter<vscode.TerminalDimensions>();
	public get onDidChangeMaximumDimensions(): Event<vscode.TerminalDimensions> {
		return this._onDidChangeMaximumDimensions && this._onDidChangeMaximumDimensions.event;
	}

	public get terminal(): ExtHostTerminal {
		return this._terminal;
	}

	constructor(
		proxy: MainThreadTerminalServiceShape,
		private _name: string,
		private _terminal: ExtHostTerminal
	) {
		super(proxy);
		this._proxy.$createTerminalRenderer(this._name).then(id => {
			this._runQueuedRequests(id);
			(<any>this._terminal)._runQueuedRequests(id);
		});
	}

	public write(data: string): void {
		this._checkDisposed();
		this._queueApiRequest(this._proxy.$terminalRendererWrite, [data]);
	}

	public _fireOnInput(data: string): void {
		this._onInput.fire(data);
	}

	public _setMaximumDimensions(columns: number, rows: number): void {
		if (this._maximumDimensions && this._maximumDimensions.columns === columns && this._maximumDimensions.rows === rows) {
			return;
		}
		this._maximumDimensions = { columns, rows };
		this._onDidChangeMaximumDimensions.fire(this.maximumDimensions);
	}
}

export class ExtHostTerminalService implements ExtHostTerminalServiceShape {
	private _proxy: MainThreadTerminalServiceShape;
	private _activeTerminal: ExtHostTerminal;
	private _terminals: ExtHostTerminal[] = [];
	private _terminalProcesses: { [id: number]: TerminalProcess } = {};
	private _terminalRenderers: ExtHostTerminalRenderer[] = [];
	private _getTerminalPromises: { [id: number]: Promise<ExtHostTerminal> } = {};
	private _cliServer: CLIServer | undefined;

	public get activeTerminal(): ExtHostTerminal { return this._activeTerminal; }
	public get terminals(): ExtHostTerminal[] { return this._terminals; }

	private readonly _onDidCloseTerminal: Emitter<vscode.Terminal> = new Emitter<vscode.Terminal>();
	public get onDidCloseTerminal(): Event<vscode.Terminal> { return this._onDidCloseTerminal && this._onDidCloseTerminal.event; }
	private readonly _onDidOpenTerminal: Emitter<vscode.Terminal> = new Emitter<vscode.Terminal>();
	public get onDidOpenTerminal(): Event<vscode.Terminal> { return this._onDidOpenTerminal && this._onDidOpenTerminal.event; }
	private readonly _onDidChangeActiveTerminal: Emitter<vscode.Terminal | undefined> = new Emitter<vscode.Terminal | undefined>();
	public get onDidChangeActiveTerminal(): Event<vscode.Terminal | undefined> { return this._onDidChangeActiveTerminal && this._onDidChangeActiveTerminal.event; }
	private readonly _onDidChangeTerminalDimensions: Emitter<vscode.TerminalDimensionsChangeEvent> = new Emitter<vscode.TerminalDimensionsChangeEvent>();
	public get onDidChangeTerminalDimensions(): Event<vscode.TerminalDimensionsChangeEvent> { return this._onDidChangeTerminalDimensions && this._onDidChangeTerminalDimensions.event; }

	constructor(
		mainContext: IMainContext,
		private _extHostConfiguration: ExtHostConfiguration,
		private _logService: ILogService,
		private _commands: ExtHostCommands
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadTerminalService);
	}

	public createTerminal(name?: string, shellPath?: string, shellArgs?: string[]): vscode.Terminal {
		const terminal = new ExtHostTerminal(this._proxy, name);
		terminal.create(shellPath, shellArgs);
		this._terminals.push(terminal);
		return terminal;
	}

	public createTerminalFromOptions(options: vscode.TerminalOptions): vscode.Terminal {
		const terminal = new ExtHostTerminal(this._proxy, options.name);
		terminal.create(options.shellPath, options.shellArgs, options.cwd, options.env, /*options.waitOnExit*/ undefined, options.strictEnv);
		this._terminals.push(terminal);
		return terminal;
	}

	public createTerminalRenderer(name: string): vscode.TerminalRenderer {
		const terminal = new ExtHostTerminal(this._proxy, name);
		terminal._setProcessId(undefined);
		this._terminals.push(terminal);

		const renderer = new ExtHostTerminalRenderer(this._proxy, name, terminal);
		this._terminalRenderers.push(renderer);

		return renderer;
	}

	public $acceptActiveTerminalChanged(id: number | null): void {
		const original = this._activeTerminal;
		if (id === null) {
			this._activeTerminal = undefined;
			if (original !== this._activeTerminal) {
				this._onDidChangeActiveTerminal.fire(this._activeTerminal);
			}
		}
		this._performTerminalIdAction(id, terminal => {
			if (terminal) {
				this._activeTerminal = terminal;
				if (original !== this._activeTerminal) {
					this._onDidChangeActiveTerminal.fire(this._activeTerminal);
				}
			}
		});
	}

	public $acceptTerminalProcessData(id: number, data: string): void {
		this._getTerminalByIdEventually(id).then(terminal => {
			if (terminal) {
				terminal._fireOnData(data);
			}
		});
	}

	public async $acceptTerminalDimensions(id: number, cols: number, rows: number): Promise<void> {
		const terminal = this._getTerminalById(id);
		if (terminal) {
			if (terminal.setDimensions(cols, rows)) {
				this._onDidChangeTerminalDimensions.fire({
					terminal: terminal,
					dimensions: terminal.dimensions
				});
			}
		}
		// When a terminal's dimensions change, a renderer's _maximum_ dimensions change
		const renderer = this._getTerminalRendererById(id);
		if (renderer) {
			renderer._setMaximumDimensions(cols, rows);
		}
	}

	public $acceptTerminalRendererInput(id: number, data: string): void {
		const renderer = this._getTerminalRendererById(id);
		if (renderer) {
			renderer._fireOnInput(data);
		}
	}

	public $acceptTerminalTitleChange(id: number, name: string): void {
		const extHostTerminal = this._getTerminalObjectById(this.terminals, id);
		if (extHostTerminal) {
			extHostTerminal.name = name;
		}
	}

	public $acceptTerminalClosed(id: number): void {
		const index = this._getTerminalObjectIndexById(this.terminals, id);
		if (index === null) {
			return;
		}
		const terminal = this._terminals.splice(index, 1)[0];
		this._onDidCloseTerminal.fire(terminal);
	}

	public $acceptTerminalOpened(id: number, name: string): void {
		const index = this._getTerminalObjectIndexById(this._terminals, id);
		if (index !== null) {
			// The terminal has already been created (via createTerminal*), only fire the event
			this._onDidOpenTerminal.fire(this.terminals[index]);
			return;
		}
		const renderer = this._getTerminalRendererById(id);
		const terminal = new ExtHostTerminal(this._proxy, name, id, renderer ? RENDERER_NO_PROCESS_ID : undefined);
		this._terminals.push(terminal);
		this._onDidOpenTerminal.fire(terminal);
	}

	public $acceptTerminalProcessId(id: number, processId: number): void {
		this._performTerminalIdAction(id, terminal => terminal._setProcessId(processId));
	}

	private _performTerminalIdAction(id: number, callback: (terminal: ExtHostTerminal) => void): void {
		let terminal = this._getTerminalById(id);
		if (terminal) {
			callback(terminal);
		} else {
			// Retry one more time in case the terminal has not yet been initialized.
			setTimeout(() => {
				terminal = this._getTerminalById(id);
				if (terminal) {
					callback(terminal);
				}
			}, EXT_HOST_CREATION_DELAY);
		}
	}

	public async $createProcess(id: number, shellLaunchConfig: ShellLaunchConfigDto, activeWorkspaceRootUriComponents: UriComponents, cols: number, rows: number): Promise<void> {
		// TODO: This function duplicates a lot of TerminalProcessManager.createProcess, ideally
		// they would be merged into a single implementation.
		const configProvider = await this._extHostConfiguration.getConfigProvider();
		const terminalConfig = configProvider.getConfiguration('terminal.integrated');

		if (!shellLaunchConfig.executable) {
			// TODO: This duplicates some of TerminalConfigHelper.mergeDefaultShellPathAndArgs and should be merged
			// this._configHelper.mergeDefaultShellPathAndArgs(shellLaunchConfig);

			const platformKey = platform.isWindows ? 'windows' : platform.isMacintosh ? 'osx' : 'linux';
			const shellConfigValue: string = terminalConfig.get(`shell.${platformKey}`);
			const shellArgsConfigValue: string = terminalConfig.get(`shellArgs.${platformKey}`);

			shellLaunchConfig.executable = shellConfigValue;
			shellLaunchConfig.args = shellArgsConfigValue;
		}

		// TODO: @daniel
		const activeWorkspaceRootUri = URI.revive(activeWorkspaceRootUriComponents);
		const initialCwd = terminalEnvironment.getCwd(shellLaunchConfig, activeWorkspaceRootUri, terminalConfig.cwd);

		// TODO: Pull in and resolve config settings
		// // Resolve env vars from config and shell
		// const lastActiveWorkspaceRoot = this._workspaceContextService.getWorkspaceFolder(lastActiveWorkspaceRootUri);
		const platformKey = platform.isWindows ? 'windows' : (platform.isMacintosh ? 'osx' : 'linux');
		// const envFromConfig = terminalEnvironment.resolveConfigurationVariables(this._configurationResolverService, { ...terminalConfig.env[platformKey] }, lastActiveWorkspaceRoot);
		const envFromConfig = { ...terminalConfig.env[platformKey] };
		// const envFromShell = terminalEnvironment.resolveConfigurationVariables(this._configurationResolverService, { ...shellLaunchConfig.env }, lastActiveWorkspaceRoot);

		// Merge process env with the env from config
		const env = { ...process.env };
		terminalEnvironment.mergeEnvironments(env, envFromConfig);
		terminalEnvironment.mergeEnvironments(env, shellLaunchConfig.env);

		// Sanitize the environment, removing any undesirable VS Code and Electron environment
		// variables
		sanitizeProcessEnvironment(env);

		// Continue env initialization, merging in the env from the launch
		// config and adding keys that are needed to create the process
		terminalEnvironment.addTerminalEnvironmentKeys(env, platform.locale, terminalConfig.get('setLocaleVariables'));

		if (!this._cliServer) {
			this._cliServer = new CLIServer(this._commands);
		}
		env['VSCODE_IPC_HOOK_CLI'] = this._cliServer.ipcHandlePath;

		// Fork the process and listen for messages
		this._logService.debug(`Terminal process launching on ext host`, shellLaunchConfig, initialCwd, cols, rows, env);
		const p = new TerminalProcess(shellLaunchConfig, initialCwd, cols, rows, env, terminalConfig.get('windowsEnableConpty'));
		p.onProcessIdReady(pid => this._proxy.$sendProcessPid(id, pid));
		p.onProcessTitleChanged(title => this._proxy.$sendProcessTitle(id, title));
		p.onProcessData(data => this._proxy.$sendProcessData(id, data));
		p.onProcessExit((exitCode) => this._onProcessExit(id, exitCode));
		this._terminalProcesses[id] = p;
	}


	public $acceptProcessInput(id: number, data: string): void {
		this._terminalProcesses[id].input(data);
	}

	public $acceptProcessResize(id: number, cols: number, rows: number): void {
		try {
			this._terminalProcesses[id].resize(cols, rows);
		} catch (error) {
			// We tried to write to a closed pipe / channel.
			if (error.code !== 'EPIPE' && error.code !== 'ERR_IPC_CHANNEL_CLOSED') {
				throw (error);
			}
		}
	}

	public $acceptProcessShutdown(id: number, immediate: boolean): void {
		this._terminalProcesses[id].shutdown(immediate);
	}

	public $acceptProcessRequestInitialCwd(id: number): void {
		this._terminalProcesses[id].getInitialCwd().then(initialCwd => this._proxy.$sendProcessInitialCwd(id, initialCwd));
	}

	public $acceptProcessRequestCwd(id: number): void {
		this._terminalProcesses[id].getCwd().then(cwd => this._proxy.$sendProcessCwd(id, cwd));
	}

	private _onProcessExit(id: number, exitCode: number): void {
		// Remove listeners
		this._terminalProcesses[id].dispose();

		// Remove process reference
		delete this._terminalProcesses[id];

		// Send exit event to main side
		this._proxy.$sendProcessExit(id, exitCode);

		if (this._cliServer && !Object.keys(this._terminalProcesses).length) {
			this._cliServer.dispose();
			this._cliServer = undefined;
		}

	}

	private _getTerminalByIdEventually(id: number, retries: number = 5): Promise<ExtHostTerminal> {
		if (!this._getTerminalPromises[id]) {
			this._getTerminalPromises[id] = this._createGetTerminalPromise(id, retries);
		} else {
			this._getTerminalPromises[id].then(c => {
				return this._createGetTerminalPromise(id, retries);
			});
		}
		return this._getTerminalPromises[id];
	}

	private _createGetTerminalPromise(id: number, retries: number = 5): Promise<ExtHostTerminal> {
		return new Promise(c => {
			if (retries === 0) {
				c(undefined);
				return;
			}

			const terminal = this._getTerminalById(id);
			if (terminal) {
				c(terminal);
			} else {
				// This should only be needed immediately after createTerminalRenderer is called as
				// the ExtHostTerminal has not yet been iniitalized
				timeout(200).then(() => c(this._getTerminalByIdEventually(id, retries - 1)));
			}
		});
	}

	private _getTerminalById(id: number): ExtHostTerminal {
		return this._getTerminalObjectById(this._terminals, id);
	}

	private _getTerminalRendererById(id: number): ExtHostTerminalRenderer {
		return this._getTerminalObjectById(this._terminalRenderers, id);
	}

	private _getTerminalObjectById<T extends ExtHostTerminal | ExtHostTerminalRenderer>(array: T[], id: number): T {
		const index = this._getTerminalObjectIndexById(array, id);
		return index !== null ? array[index] : null;
	}

	private _getTerminalObjectIndexById<T extends ExtHostTerminal | ExtHostTerminalRenderer>(array: T[], id: number): number {
		let index: number | null = null;
		array.some((item, i) => {
			const thisId = item._id;
			if (thisId === id) {
				index = i;
				return true;
			}
			return false;
		});
		return index;
	}
}

class ApiRequest {
	private _callback: (...args: any[]) => void;
	private _args: any[];

	constructor(callback: (...args: any[]) => void, args: any[]) {
		this._callback = callback;
		this._args = args;
	}

	public run(proxy: MainThreadTerminalServiceShape, id: number) {
		this._callback.apply(proxy, [id].concat(this._args));
	}
}


class CLIServer {

	private _server: http.Server;
	private _ipcHandlePath: string | undefined;

	constructor(private _commands: ExtHostCommands) {
		this._server = http.createServer((req, res) => this.onRequest(req, res));
		this.setup().catch(err => {
			console.error(err);
			return '';
		});
	}

	public get ipcHandlePath() {
		return this._ipcHandlePath;
	}

	private async setup(): Promise<string> {
		this._ipcHandlePath = generateRandomPipeName();

		try {
			this._server.listen(this.ipcHandlePath);
			this._server.on('error', err => console.error(err));
		} catch (err) {
			console.error('Could not start open from terminal server.');
		}

		return this.ipcHandlePath;
	}
	private collectURIToOpen(strs: string[], typeHint: URIType, result: IURIToOpen[]): void {
		if (Array.isArray(strs)) {
			for (const s of strs) {
				try {
					result.push({ uri: URI.parse(s), typeHint });
				} catch (e) {
					// ignore
				}
			}
		}
	}

	private onRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
		const chunks: string[] = [];
		req.setEncoding('utf8');
		req.on('data', (d: string) => chunks.push(d));
		req.on('end', () => {
			let { fileURIs, folderURIs, forceNewWindow, diffMode, addMode, forceReuseWindow } = JSON.parse(chunks.join(''));
			if (folderURIs && folderURIs.length || fileURIs && fileURIs.length) {
				if (folderURIs && folderURIs.length && !forceReuseWindow) {
					forceNewWindow = true;
				}
				const urisToOpen: IURIToOpen[] = [];
				this.collectURIToOpen(folderURIs, 'folder', urisToOpen);
				this.collectURIToOpen(fileURIs, 'file', urisToOpen);
				this._commands.executeCommand('_files.windowOpen', { urisToOpen, forceNewWindow, diffMode, addMode, forceReuseWindow });
			}
			res.writeHead(200);
			res.end();
		});
	}

	dispose(): void {
		this._server.close();

		if (this._ipcHandlePath && process.platform !== 'win32' && fs.existsSync(this._ipcHandlePath)) {
			fs.unlinkSync(this._ipcHandlePath);
		}
	}
}
