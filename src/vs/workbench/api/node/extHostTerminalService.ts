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
		return this._onData.event;
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

	public async create(
		shellPath?: string,
		shellArgs?: string[] | string,
		cwd?: string | URI,
		env?: { [key: string]: string | null },
		waitOnExit?: boolean,
		strictEnv?: boolean,
		hideFromUser?: boolean
	): Promise<void> {
		const terminal = await this._proxy.$createTerminal({ name: this._name, shellPath, shellArgs, cwd, env, waitOnExit, strictEnv, hideFromUser });
		this._name = terminal.name;
		this._runQueuedRequests(terminal.id);
	}

	public async createExtensionTerminal(): Promise<void> {
		const terminal = await this._proxy.$createTerminal({ name: this._name, isExtensionTerminal: true });
		this._name = terminal.name;
		this._runQueuedRequests(terminal.id);
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
	private _variableResolver: ExtHostVariableResolverService | undefined;
	private _lastActiveWorkspace: IWorkspaceFolder | undefined;

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
		private _logService: ILogService
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadTerminalService);
		this._updateLastActiveWorkspace();
		this._updateVariableResolver();
		this._registerListeners();
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

	public createExtensionTerminal(options: vscode.ExtensionTerminalOptions): vscode.Terminal {
		const terminal = new ExtHostTerminal(this._proxy, options.name);
		const p = new ExtHostPseudoterminal(options.pty);
		terminal.createExtensionTerminal().then(() => this._setupExtHostProcessListeners(terminal._id, p));
		this._terminals.push(terminal);
		return terminal;
	}

	public async attachPtyToTerminal(id: number, pty: vscode.Pseudoterminal): Promise<void> {
		const terminal = this._getTerminalByIdEventually(id);
		if (!terminal) {
			throw new Error(`Cannot resolve terminal with id ${id} for virtual process`);
		}
		const p = new ExtHostPseudoterminal(pty);
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
			process.env.windir,
			this._lastActiveWorkspace,
			this._variableResolver,
			this._logService
		);
	}

	private _getDefaultShellArgs(configProvider: ExtHostConfigProvider): string[] | string {
		const fetchSetting = (key: string) => {
			const setting = configProvider
				.getConfiguration(key.substr(0, key.lastIndexOf('.')))
				.inspect<string | string[]>(key.substr(key.lastIndexOf('.') + 1));
			return this._apiInspectConfigToPlain<string | string[]>(setting);
		};

		return terminalEnvironment.getDefaultShellArgs(fetchSetting, this._isWorkspaceShellAllowed, this._lastActiveWorkspace, this._variableResolver, this._logService);
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

	private _registerListeners(): void {
		this._extHostDocumentsAndEditors.onDidChangeActiveTextEditor(() => this._updateLastActiveWorkspace());
		this._extHostWorkspace.onDidChangeWorkspace(() => this._updateVariableResolver());
	}

	private _updateLastActiveWorkspace(): void {
		const activeEditor = this._extHostDocumentsAndEditors.activeEditor();
		if (activeEditor) {
			this._lastActiveWorkspace = this._extHostWorkspace.getWorkspaceFolder(activeEditor.document.uri) as IWorkspaceFolder;
		}
	}

	private async _updateVariableResolver(): Promise<void> {
		const configProvider = await this._extHostConfiguration.getConfigProvider();
		const workspaceFolders = await this._extHostWorkspace.getWorkspaceFolders2();
		this._variableResolver = new ExtHostVariableResolverService(workspaceFolders || [], this._extHostDocumentsAndEditors, configProvider);
	}

	public async $spawnExtHostProcess(id: number, shellLaunchConfigDto: ShellLaunchConfigDto, activeWorkspaceRootUriComponents: UriComponents, cols: number, rows: number, isWorkspaceShellAllowed: boolean): Promise<void> {
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
		} else {
			if (this._variableResolver) {
				shellLaunchConfig.executable = this._variableResolver.resolve(this._lastActiveWorkspace, shellLaunchConfig.executable);
				if (shellLaunchConfig.args) {
					if (Array.isArray(shellLaunchConfig.args)) {
						const resolvedArgs: string[] = [];
						for (const arg of shellLaunchConfig.args) {
							resolvedArgs.push(this._variableResolver.resolve(this._lastActiveWorkspace, arg));
						}
						shellLaunchConfig.args = resolvedArgs;
					} else {
						shellLaunchConfig.args = this._variableResolver.resolve(this._lastActiveWorkspace, shellLaunchConfig.args);
					}
				}
			}
		}

		const activeWorkspaceRootUri = URI.revive(activeWorkspaceRootUriComponents);
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

		// Get the initial cwd
		const terminalConfig = configProvider.getConfiguration('terminal.integrated');

		const initialCwd = terminalEnvironment.getCwd(shellLaunchConfig, os.homedir(), lastActiveWorkspace ? lastActiveWorkspace : undefined, this._variableResolver, activeWorkspaceRootUri, terminalConfig.cwd, this._logService);

		const envFromConfig = this._apiInspectConfigToPlain(configProvider.getConfiguration('terminal.integrated').inspect<ITerminalEnvironment>(`env.${platformKey}`));
		const baseEnv = terminalConfig.get<boolean>('inheritEnv', true) ? process.env as platform.IProcessEnvironment : await this._getNonInheritedEnv();
		const env = terminalEnvironment.createTerminalEnvironment(
			shellLaunchConfig,
			lastActiveWorkspace,
			envFromConfig,
			this._variableResolver,
			isWorkspaceShellAllowed,
			pkg.version,
			terminalConfig.get<boolean>('setLocaleVariables', false),
			baseEnv
		);

		this._proxy.$sendResolvedLaunchConfig(id, shellLaunchConfig);
		// Fork the process and listen for messages
		this._logService.debug(`Terminal process launching on ext host`, shellLaunchConfig, initialCwd, cols, rows, env);
		// TODO: Support conpty on remote, it doesn't seem to work for some reason?
		// TODO: When conpty is enabled, only enable it when accessibilityMode is off
		const enableConpty = false; //terminalConfig.get('windowsEnableConpty') as boolean;
		this._setupExtHostProcessListeners(id, new TerminalProcess(shellLaunchConfig, initialCwd, cols, rows, env, enableConpty, this._logService));
	}

	public async $startExtensionTerminal(id: number, initialDimensions: ITerminalDimensionsDto | undefined): Promise<void> {
		// Make sure the ExtHostTerminal exists so onDidOpenTerminal has fired before we call
		// Pseudoterminal.start
		await this._getTerminalByIdEventually(id);

		// Processes should be initialized here for normal virtual process terminals, however for
		// tasks they are responsible for attaching the virtual process to a terminal so this
		// function may be called before tasks is able to attach to the terminal.
		let retries = 5;
		while (retries-- > 0) {
			if (this._terminalProcesses[id]) {
				(this._terminalProcesses[id] as ExtHostPseudoterminal).startSendingEvents(initialDimensions);
				return;
			}
			await timeout(50);
		}
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

class ExtHostPseudoterminal implements ITerminalChildProcess {
	private _queuedEvents: (IQueuedEvent<string> | IQueuedEvent<number> | IQueuedEvent<{ pid: number, cwd: string }> | IQueuedEvent<ITerminalDimensions | undefined>)[] = [];
	private _queueDisposables: IDisposable[] | undefined;

	private readonly _onProcessData = new Emitter<string>();
	public readonly onProcessData: Event<string> = this._onProcessData.event;
	private readonly _onProcessExit = new Emitter<number>();
	public readonly onProcessExit: Event<number> = this._onProcessExit.event;
	private readonly _onProcessReady = new Emitter<{ pid: number, cwd: string }>();
	public get onProcessReady(): Event<{ pid: number, cwd: string }> { return this._onProcessReady.event; }
	private readonly _onProcessTitleChanged = new Emitter<string>();
	public readonly onProcessTitleChanged: Event<string> = this._onProcessTitleChanged.event;
	private readonly _onProcessOverrideDimensions = new Emitter<ITerminalDimensions | undefined>();
	public get onProcessOverrideDimensions(): Event<ITerminalDimensions | undefined> { return this._onProcessOverrideDimensions.event; }

	constructor(
		private readonly _pty: vscode.Pseudoterminal
	) {
		this._queueDisposables = [];
		this._queueDisposables.push(this._pty.onDidWrite(e => this._queuedEvents.push({ emitter: this._onProcessData, data: e })));
		if (this._pty.onDidClose) {
			this._queueDisposables.push(this._pty.onDidClose(e => this._queuedEvents.push({ emitter: this._onProcessExit, data: 0 })));
		}
		if (this._pty.onDidOverrideDimensions) {
			this._queueDisposables.push(this._pty.onDidOverrideDimensions(e => this._queuedEvents.push({ emitter: this._onProcessOverrideDimensions, data: e ? { cols: e.columns, rows: e.rows } : undefined })));
		}
	}

	shutdown(): void {
		if (this._pty.close) {
			this._pty.close();
		}
	}

	input(data: string): void {
		if (this._pty.handleInput) {
			this._pty.handleInput(data);
		}
	}

	resize(cols: number, rows: number): void {
		if (this._pty.setDimensions) {
			this._pty.setDimensions({ columns: cols, rows });
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
		this._pty.onDidWrite(e => this._onProcessData.fire(e));
		if (this._pty.onDidClose) {
			this._pty.onDidClose(e => this._onProcessExit.fire(0));
		}
		if (this._pty.onDidOverrideDimensions) {
			this._pty.onDidOverrideDimensions(e => this._onProcessOverrideDimensions.fire(e ? { cols: e.columns, rows: e.rows } : e));
		}

		if (this._pty.open) {
			this._pty.open(initialDimensions);
		}
	}
}

interface IQueuedEvent<T> {
	emitter: Emitter<T>;
	data: T;
}
