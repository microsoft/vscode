/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import pkg from 'vs/platform/product/node/package';
import * as os from 'os';
import { URI, UriComponents } from 'vs/base/common/uri';
import * as platform from 'vs/base/common/platform';
import * as terminalEnvironment from 'vs/workbench/contrib/terminal/common/terminalEnvironment';
import { Event, Emitter } from 'vs/base/common/event';
import { ExtHostTerminalServiceShape, MainContext, MainThreadTerminalServiceShape, IMainContext, ShellLaunchConfigDto, IShellDefinitionDto, IShellAndArgsDto, ITerminalDimensionsDto } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostConfiguration, ExtHostConfigProvider } from 'vs/workbench/api/common/extHostConfiguration';
import { ILogService } from 'vs/platform/log/common/log';
import { EXT_HOST_CREATION_DELAY, IShellLaunchConfig, ITerminalEnvironment, ITerminalChildProcess, ITerminalDimensions } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalProcess } from 'vs/workbench/contrib/terminal/node/terminalProcess';
import { timeout } from 'vs/base/common/async';
import { ExtHostWorkspace } from 'vs/workbench/api/common/extHostWorkspace';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { ExtHostVariableResolverService } from 'vs/workbench/api/node/extHostDebugService';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { getSystemShell, detectAvailableShells } from 'vs/workbench/contrib/terminal/node/terminal';
import { getMainProcessParentEnv } from 'vs/workbench/contrib/terminal/node/terminalEnvironment';
import { IDisposable } from 'vs/base/common/lifecycle';

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
	private _pidPromise: Promise<number | undefined>;
	private _cols: number | undefined;
	private _pidPromiseComplete: ((value: number | undefined) => any) | null;
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
		private _name?: string,
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
		shellArgs?: string[] | string,
		cwd?: string | URI,
		env?: { [key: string]: string | null },
		waitOnExit?: boolean,
		strictEnv?: boolean,
		hideFromUser?: boolean
	): void {
		this._proxy.$createTerminal({ name: this._name, shellPath, shellArgs, cwd, env, waitOnExit, strictEnv, hideFromUser }).then(terminal => {
			this._name = terminal.name;
			this._runQueuedRequests(terminal.id);
		});
	}

	public createVirtualProcess(): Promise<void> {
		return this._proxy.$createTerminal({ name: this._name, isVirtualProcess: true }).then(terminal => {
			this._name = terminal.name;
			this._runQueuedRequests(terminal.id);
		});
	}

	public get name(): string {
		return this._name || '';
	}

	public set name(name: string) {
		this._name = name;
	}

	public get dimensions(): vscode.TerminalDimensions | undefined {
		if (this._cols === undefined || this._rows === undefined) {
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

	public get processId(): Promise<number | undefined> {
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

	public _setProcessId(processId: number | undefined): void {
		// The event may fire 2 times when the panel is restored
		if (this._pidPromiseComplete) {
			this._pidPromiseComplete(processId);
			this._pidPromiseComplete = null;
		} else {
			// Recreate the promise if this is the nth processId set (e.g. reused task terminals)
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
	public get dimensions(): vscode.TerminalDimensions | undefined { return this._dimensions; }
	public set dimensions(dimensions: vscode.TerminalDimensions | undefined) {
		this._checkDisposed();
		this._dimensions = dimensions;
		this._queueApiRequest(this._proxy.$terminalRendererSetDimensions, [dimensions]);
	}

	private _maximumDimensions: vscode.TerminalDimensions | undefined;
	public get maximumDimensions(): vscode.TerminalDimensions | undefined {
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
		private _terminal: ExtHostTerminal,
		id?: number
	) {
		super(proxy, id);

		if (!id) {
			this._proxy.$createTerminalRenderer(this._name).then(id => {
				this._runQueuedRequests(id);
				(<any>this._terminal)._runQueuedRequests(id);
			});
		}
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
		const newValue = { columns, rows };
		this._maximumDimensions = newValue;
		this._onDidChangeMaximumDimensions.fire(newValue);
	}
}

export class ExtHostTerminalService implements ExtHostTerminalServiceShape {
	private _proxy: MainThreadTerminalServiceShape;
	private _activeTerminal: ExtHostTerminal | undefined;
	private _terminals: ExtHostTerminal[] = [];
	private _terminalProcesses: { [id: number]: ITerminalChildProcess } = {};
	private _terminalRenderers: ExtHostTerminalRenderer[] = [];
	private _getTerminalPromises: { [id: number]: Promise<ExtHostTerminal> } = {};

	// TODO: Pull this from main side
	private _isWorkspaceShellAllowed: boolean = false;

	public get activeTerminal(): ExtHostTerminal | undefined { return this._activeTerminal; }
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
		private _extHostWorkspace: ExtHostWorkspace,
		private _extHostDocumentsAndEditors: ExtHostDocumentsAndEditors,
		private _logService: ILogService,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadTerminalService);
	}

	public createTerminal(name?: string, shellPath?: string, shellArgs?: string[] | string): vscode.Terminal {
		const terminal = new ExtHostTerminal(this._proxy, name);
		terminal.create(shellPath, shellArgs);
		this._terminals.push(terminal);
		return terminal;
	}

	public createTerminalFromOptions(options: vscode.TerminalOptions): vscode.Terminal {
		const terminal = new ExtHostTerminal(this._proxy, options.name);
		terminal.create(options.shellPath, options.shellArgs, options.cwd, options.env, /*options.waitOnExit*/ undefined, options.strictEnv, options.hideFromUser);
		this._terminals.push(terminal);
		return terminal;
	}

	public createVirtualProcessTerminal(options: vscode.TerminalVirtualProcessOptions): vscode.Terminal {
		const terminal = new ExtHostTerminal(this._proxy, options.name);
		const p = new ExtHostVirtualProcess(options.virtualProcess);
		terminal.createVirtualProcess().then(() => this._setupExtHostProcessListeners(terminal._id, p));
		this._terminals.push(terminal);
		return terminal;
	}

	public attachVirtualProcessToTerminal(id: number, virtualProcess: vscode.TerminalVirtualProcess) {
		const terminal = this._getTerminalById(id);
		if (!terminal) {
			throw new Error(`Cannot resolve terminal with id ${id} for virtual process`);
		}
		const p = new ExtHostVirtualProcess(virtualProcess);
		this._setupExtHostProcessListeners(id, p);
	}

	public createTerminalRenderer(name: string): vscode.TerminalRenderer {
		const terminal = new ExtHostTerminal(this._proxy, name);
		terminal._setProcessId(undefined);
		this._terminals.push(terminal);

		const renderer = new ExtHostTerminalRenderer(this._proxy, name, terminal);
		this._terminalRenderers.push(renderer);

		return renderer;
	}

	public getDefaultShell(configProvider: ExtHostConfigProvider): string {
		const fetchSetting = (key: string) => {
			const setting = configProvider
				.getConfiguration(key.substr(0, key.lastIndexOf('.')))
				.inspect<string | string[]>(key.substr(key.lastIndexOf('.') + 1));
			return this._apiInspectConfigToPlain<string | string[]>(setting);
		};
		return terminalEnvironment.getDefaultShell(
			fetchSetting,
			this._isWorkspaceShellAllowed,
			getSystemShell(platform.platform),
			process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432'),
			process.env.windir
		);
	}

	private _getDefaultShellArgs(configProvider: ExtHostConfigProvider): string[] | string | undefined {
		const fetchSetting = (key: string) => {
			const setting = configProvider
				.getConfiguration(key.substr(0, key.lastIndexOf('.')))
				.inspect<string | string[]>(key.substr(key.lastIndexOf('.') + 1));
			return this._apiInspectConfigToPlain<string | string[]>(setting);
		};
		return terminalEnvironment.getDefaultShellArgs(fetchSetting, this._isWorkspaceShellAllowed);
	}

	public async resolveTerminalRenderer(id: number): Promise<vscode.TerminalRenderer> {
		// Check to see if the extension host already knows about this terminal.
		for (const terminalRenderer of this._terminalRenderers) {
			if (terminalRenderer._id === id) {
				return terminalRenderer;
			}
		}

		const terminal = this._getTerminalById(id);
		if (!terminal) {
			throw new Error(`Cannot resolve terminal renderer for terminal id ${id}`);
		}
		const renderer = new ExtHostTerminalRenderer(this._proxy, terminal.name, terminal, terminal._id);
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
			return;
		}
		this.performTerminalIdAction(id, terminal => {
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

	public $acceptTerminalDimensions(id: number, cols: number, rows: number): void {
		this._getTerminalByIdEventually(id).then(terminal => {
			if (terminal) {
				if (terminal.setDimensions(cols, rows)) {
					this._onDidChangeTerminalDimensions.fire({
						terminal: terminal,
						dimensions: terminal.dimensions as vscode.TerminalDimensions
					});
				}
			}
		});
	}

	public $acceptTerminalMaximumDimensions(id: number, cols: number, rows: number): void {
		if (this._terminalProcesses[id]) {
			// Virtual processes only - when virtual process resize fires it means that the
			// terminal's maximum dimensions changed
			this._terminalProcesses[id].resize(cols, rows);
		} else {
			// Terminal renderer
			this._getTerminalByIdEventually(id).then(() => {
				// When a terminal's dimensions change, a renderer's _maximum_ dimensions change
				const renderer = this._getTerminalRendererById(id);
				if (renderer) {
					renderer._setMaximumDimensions(cols, rows);
				}
			});
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
		if (index !== null) {
			const terminal = this._terminals.splice(index, 1)[0];
			this._onDidCloseTerminal.fire(terminal);
		}
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
		this.performTerminalIdAction(id, terminal => terminal._setProcessId(processId));
	}

	public performTerminalIdAction(id: number, callback: (terminal: ExtHostTerminal) => void): void {
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
			}, EXT_HOST_CREATION_DELAY * 2);
		}
	}

	private _apiInspectConfigToPlain<T>(
		config: { key: string; defaultValue?: T; globalValue?: T; workspaceValue?: T, workspaceFolderValue?: T } | undefined
	): { user: T | undefined, value: T | undefined, default: T | undefined } {
		return {
			user: config ? config.globalValue : undefined,
			value: config ? config.workspaceValue : undefined,
			default: config ? config.defaultValue : undefined,
		};
	}

	private async _getNonInheritedEnv(): Promise<platform.IProcessEnvironment> {
		const env = await getMainProcessParentEnv();
		env.VSCODE_IPC_HOOK_CLI = process.env['VSCODE_IPC_HOOK_CLI']!;
		return env;
	}

	public async $createProcess(id: number, shellLaunchConfigDto: ShellLaunchConfigDto, activeWorkspaceRootUriComponents: UriComponents, cols: number, rows: number, isWorkspaceShellAllowed: boolean): Promise<void> {
		const shellLaunchConfig: IShellLaunchConfig = {
			name: shellLaunchConfigDto.name,
			executable: shellLaunchConfigDto.executable,
			args: shellLaunchConfigDto.args,
			cwd: typeof shellLaunchConfigDto.cwd === 'string' ? shellLaunchConfigDto.cwd : URI.revive(shellLaunchConfigDto.cwd),
			env: shellLaunchConfigDto.env
		};

		// Merge in shell and args from settings
		const platformKey = platform.isWindows ? 'windows' : (platform.isMacintosh ? 'osx' : 'linux');
		const configProvider = await this._extHostConfiguration.getConfigProvider();
		if (!shellLaunchConfig.executable) {
			shellLaunchConfig.executable = this.getDefaultShell(configProvider);
			shellLaunchConfig.args = this._getDefaultShellArgs(configProvider);
		}

		// Get the initial cwd
		const terminalConfig = configProvider.getConfiguration('terminal.integrated');
		const activeWorkspaceRootUri = URI.revive(activeWorkspaceRootUriComponents);
		const initialCwd = terminalEnvironment.getCwd(shellLaunchConfig, os.homedir(), activeWorkspaceRootUri, terminalConfig.cwd);

		// Get the environment
		const apiLastActiveWorkspace = await this._extHostWorkspace.getWorkspaceFolder(activeWorkspaceRootUri);
		const lastActiveWorkspace = apiLastActiveWorkspace ? {
			uri: apiLastActiveWorkspace.uri,
			name: apiLastActiveWorkspace.name,
			index: apiLastActiveWorkspace.index,
			toResource: () => {
				throw new Error('Not implemented');
			}
		} as IWorkspaceFolder : null;
		const envFromConfig = this._apiInspectConfigToPlain(configProvider.getConfiguration('terminal.integrated').inspect<ITerminalEnvironment>(`env.${platformKey}`));
		const workspaceFolders = await this._extHostWorkspace.getWorkspaceFolders2();
		const variableResolver = workspaceFolders ? new ExtHostVariableResolverService(workspaceFolders, this._extHostDocumentsAndEditors, configProvider) : undefined;
		const baseEnv = terminalConfig.get<boolean>('inheritEnv', true) ? process.env as platform.IProcessEnvironment : await this._getNonInheritedEnv();
		const env = terminalEnvironment.createTerminalEnvironment(
			shellLaunchConfig,
			lastActiveWorkspace,
			envFromConfig,
			variableResolver,
			isWorkspaceShellAllowed,
			pkg.version,
			terminalConfig.get<boolean>('setLocaleVariables', false),
			baseEnv
		);

		// Fork the process and listen for messages
		this._logService.debug(`Terminal process launching on ext host`, shellLaunchConfig, initialCwd, cols, rows, env);
		// TODO: Support conpty on remote, it doesn't seem to work for some reason?
		// TODO: When conpty is enabled, only enable it when accessibilityMode is off
		const enableConpty = false; //terminalConfig.get('windowsEnableConpty') as boolean;
		this._setupExtHostProcessListeners(id, new TerminalProcess(shellLaunchConfig, initialCwd, cols, rows, env, enableConpty, this._logService));
	}

	public $startVirtualProcess(id: number, initialDimensions: ITerminalDimensionsDto | undefined): void {
		(this._terminalProcesses[id] as ExtHostVirtualProcess).startSendingEvents(initialDimensions);
	}

	private _setupExtHostProcessListeners(id: number, p: ITerminalChildProcess): void {
		p.onProcessReady((e: { pid: number, cwd: string }) => this._proxy.$sendProcessReady(id, e.pid, e.cwd));
		p.onProcessTitleChanged(title => this._proxy.$sendProcessTitle(id, title));
		p.onProcessData(data => this._proxy.$sendProcessData(id, data));
		p.onProcessExit(exitCode => this._onProcessExit(id, exitCode));
		if (p.onProcessOverrideDimensions) {
			p.onProcessOverrideDimensions(e => this._proxy.$sendOverrideDimensions(id, e));
		}
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

	public $acceptProcessRequestLatency(id: number): number {
		return id;
	}

	public $requestAvailableShells(): Promise<IShellDefinitionDto[]> {
		return detectAvailableShells();
	}

	public async $requestDefaultShellAndArgs(): Promise<IShellAndArgsDto> {
		const configProvider = await this._extHostConfiguration.getConfigProvider();
		return Promise.resolve({
			shell: this.getDefaultShell(configProvider),
			args: this._getDefaultShellArgs(configProvider)
		});
	}

	private _onProcessExit(id: number, exitCode: number): void {
		// Remove process reference
		delete this._terminalProcesses[id];

		// Send exit event to main side
		this._proxy.$sendProcessExit(id, exitCode);
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
				timeout(200).then(() => c(this._createGetTerminalPromise(id, retries - 1)));
			}
		});
	}

	private _getTerminalById(id: number): ExtHostTerminal | null {
		return this._getTerminalObjectById(this._terminals, id);
	}

	private _getTerminalRendererById(id: number): ExtHostTerminalRenderer | null {
		return this._getTerminalObjectById(this._terminalRenderers, id);
	}

	private _getTerminalObjectById<T extends ExtHostTerminal | ExtHostTerminalRenderer>(array: T[], id: number): T | null {
		const index = this._getTerminalObjectIndexById(array, id);
		return index !== null ? array[index] : null;
	}

	private _getTerminalObjectIndexById<T extends ExtHostTerminal | ExtHostTerminalRenderer>(array: T[], id: number): number | null {
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

	public $acceptWorkspacePermissionsChanged(isAllowed: boolean): void {
		this._isWorkspaceShellAllowed = isAllowed;
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

class ExtHostVirtualProcess implements ITerminalChildProcess {
	private _queuedEvents: (IQueuedEvent<string> | IQueuedEvent<number> | IQueuedEvent<{ pid: number, cwd: string }> | IQueuedEvent<ITerminalDimensions | undefined>)[] = [];
	private _queueDisposables: IDisposable[] | undefined;

	private readonly _onProcessData = new Emitter<string>();
	public get onProcessData(): Event<string> { return this._onProcessData.event; }
	private readonly _onProcessExit = new Emitter<number>();
	public get onProcessExit(): Event<number> { return this._onProcessExit.event; }
	private readonly _onProcessReady = new Emitter<{ pid: number, cwd: string }>();
	public get onProcessReady(): Event<{ pid: number, cwd: string }> { return this._onProcessReady.event; }
	private readonly _onProcessTitleChanged = new Emitter<string>();
	public get onProcessTitleChanged(): Event<string> { return this._onProcessTitleChanged.event; }
	private readonly _onProcessOverrideDimensions = new Emitter<ITerminalDimensions | undefined>();
	public get onProcessOverrideDimensions(): Event<ITerminalDimensions | undefined> { return this._onProcessOverrideDimensions.event; }

	constructor(
		private readonly _virtualProcess: vscode.TerminalVirtualProcess
	) {
		this._queueDisposables = [];
		this._queueDisposables.push(this._virtualProcess.onDidWrite(e => this._queuedEvents.push({ emitter: this._onProcessData, data: e })));
		if (this._virtualProcess.onDidExit) {
			this._queueDisposables.push(this._virtualProcess.onDidExit(e => this._queuedEvents.push({ emitter: this._onProcessExit, data: e })));
		}
		if (this._virtualProcess.onDidOverrideDimensions) {
			this._queueDisposables.push(this._virtualProcess.onDidOverrideDimensions(e => this._queuedEvents.push({ emitter: this._onProcessOverrideDimensions, data: e ? { cols: e.columns, rows: e.rows } : undefined })));
		}
	}

	shutdown(): void {
		if (this._virtualProcess.shutdown) {
			this._virtualProcess.shutdown();
		}
	}

	input(data: string): void {
		if (this._virtualProcess.handleInput) {
			this._virtualProcess.handleInput(data);
		}
	}

	resize(cols: number, rows: number): void {
		if (this._virtualProcess.setDimensions) {
			this._virtualProcess.setDimensions({ columns: cols, rows });
		}
	}

	getInitialCwd(): Promise<string> {
		return Promise.resolve('');
	}

	getCwd(): Promise<string> {
		return Promise.resolve('');
	}

	getLatency(): Promise<number> {
		return Promise.resolve(0);
	}

	startSendingEvents(initialDimensions: ITerminalDimensionsDto | undefined): void {
		// Flush all buffered events
		this._queuedEvents.forEach(e => (<any>e.emitter.fire)(e.data));
		this._queuedEvents = [];
		this._queueDisposables = undefined;

		// Attach the real listeners
		this._virtualProcess.onDidWrite(e => this._onProcessData.fire(e));
		if (this._virtualProcess.onDidExit) {
			this._virtualProcess.onDidExit(e => {
				// Ensure only positive exit codes are returned
				this._onProcessExit.fire(e >= 0 ? e : 1);
			});
		}
		if (this._virtualProcess.onDidOverrideDimensions) {
			this._virtualProcess.onDidOverrideDimensions(e => this._onProcessOverrideDimensions.fire(e ? { cols: e.columns, rows: e.rows } : e));
		}

		if (this._virtualProcess.start) {
			this._virtualProcess.start(initialDimensions);
		}
	}
}

interface IQueuedEvent<T> {
	emitter: Emitter<T>;
	data: T;
}
