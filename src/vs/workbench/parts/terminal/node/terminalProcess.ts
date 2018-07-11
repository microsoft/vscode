/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as path from 'path';
import * as platform from 'vs/base/common/platform';
import * as pty from 'node-pty';
import * as terminalEnvironment from 'vs/workbench/parts/terminal/node/terminalEnvironment';
import { Event, Emitter } from 'vs/base/common/event';
import { ITerminalChildProcess } from 'vs/workbench/parts/terminal/node/terminal';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IShellLaunchConfig, ITerminalConfigHelper } from 'vs/workbench/parts/terminal/common/terminal';
import { IWorkspaceContextService, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import URI from 'vs/base/common/uri';

export class TerminalProcess implements ITerminalChildProcess, IDisposable {
	private _exitCode: number;
	private _closeTimeout: number;
	private _ptyProcess: pty.IPty;
	private _currentTitle: string = '';

	private readonly _onProcessData: Emitter<string> = new Emitter<string>();
	public get onProcessData(): Event<string> { return this._onProcessData.event; }
	private readonly _onProcessExit: Emitter<number> = new Emitter<number>();
	public get onProcessExit(): Event<number> { return this._onProcessExit.event; }
	private readonly _onProcessIdReady: Emitter<number> = new Emitter<number>();
	public get onProcessIdReady(): Event<number> { return this._onProcessIdReady.event; }
	private readonly _onProcessTitleChanged: Emitter<string> = new Emitter<string>();
	public get onProcessTitleChanged(): Event<string> { return this._onProcessTitleChanged.event; }

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IConfigurationResolverService private readonly _configurationResolverService: IConfigurationResolverService,
		shellLaunchConfig: IShellLaunchConfig,
		cwd: string,
		cols: number,
		rows: number,
		lastActiveWorkspaceRootUri: URI,
		private readonly _configHelper: ITerminalConfigHelper
	) {
		// The pty process needs to be run in its own child process to get around maxing out CPU on Mac,
		// see https://github.com/electron/electron/issues/38
		let shellName: string;
		if (os.platform() === 'win32') {
			shellName = path.basename(shellLaunchConfig.executable);
		} else {
			// Using 'xterm-256color' here helps ensure that the majority of Linux distributions will use a
			// color prompt as defined in the default ~/.bashrc file.
			shellName = 'xterm-256color';
		}

		if (!shellLaunchConfig.executable) {
			this._configHelper.mergeDefaultShellPathAndArgs(shellLaunchConfig);
		}

		const lastActiveWorkspaceRoot = this._workspaceContextService.getWorkspaceFolder(lastActiveWorkspaceRootUri);

		const env = this._createEnv(shellLaunchConfig, lastActiveWorkspaceRoot);
		const options: pty.IPtyForkOptions = {
			name: shellName,
			cwd,
			env,
			cols,
			rows
		};

		this._ptyProcess = pty.spawn(shellLaunchConfig.executable, shellLaunchConfig.args, options);
		this._ptyProcess.on('data', (data) => {
			this._onProcessData.fire(data);
			if (this._closeTimeout) {
				clearTimeout(this._closeTimeout);
				this._queueProcessExit();
			}
		});
		this._ptyProcess.on('exit', (code) => {
			this._exitCode = code;
			this._queueProcessExit();
		});

		// TODO: We should no longer need to delay this since spawn is sync
		setTimeout(() => {
			this._sendProcessId();
		}, 1000);
		this._setupTitlePolling();
	}

	public dispose(): void {
		this._onProcessData.dispose();
		this._onProcessExit.dispose();
		this._onProcessIdReady.dispose();
		this._onProcessTitleChanged.dispose();
	}

	private _createEnv(shellLaunchConfig: IShellLaunchConfig, lastActiveWorkspaceRoot: IWorkspaceFolder): platform.IProcessEnvironment {
		// TODO: Move locale into TerminalProcess
		const locale = this._configHelper.config.setLocaleVariables ? platform.locale : undefined;
		// Resolve env vars from config and shell
		const platformKey = platform.isWindows ? 'windows' : (platform.isMacintosh ? 'osx' : 'linux');
		const envFromConfig = terminalEnvironment.resolveConfigurationVariables(this._configurationResolverService, { ...this._configHelper.config.env[platformKey] }, lastActiveWorkspaceRoot);
		const envFromShell = terminalEnvironment.resolveConfigurationVariables(this._configurationResolverService, { ...shellLaunchConfig.env }, lastActiveWorkspaceRoot);
		shellLaunchConfig.env = envFromShell;

		const env: platform.IProcessEnvironment = { ...process.env };

		// Merge process env with the env from config
		// TODO: Move environment merge stuff into TerminalProcess
		terminalEnvironment.mergeEnvironments(env, envFromConfig);

		// Continue env initialization, merging in the env from the launch
		// config and adding keys that are needed to create the process
		const env = terminalEnvironment.createTerminalEnv(shellLaunchConfig, locale);

		const keysToRemove = [
			'ELECTRON_ENABLE_STACK_DUMPING',
			'ELECTRON_ENABLE_LOGGING',
			'ELECTRON_NO_ASAR',
			'ELECTRON_RUN_AS_NODE',
			'GOOGLE_API_KEY',
			'VSCODE_CLI',
			'VSCODE_DEV',
			'VSCODE_IPC_HOOK',
			'VSCODE_LOGS',
			'VSCODE_NLS_CONFIG',
			'VSCODE_PORTABLE',
			'VSCODE_PID',
		];
		keysToRemove.forEach((key) => {
			if (env[key]) {
				delete env[key];
			}
		});
		Object.keys(env).forEach(key => {
			if (key.search(/^VSCODE_NODE_CACHED_DATA_DIR_\d+$/) === 0) {
				delete env[key];
			}
		});
		// TODO: Determine which parts of env initialization should go where
		// const envFromConfig = terminalEnvironment.resolveConfigurationVariables(this._configurationResolverService, { ...this._configHelper.config.env[platformKey] }, lastActiveWorkspaceRoot);
		// const envFromShell = terminalEnvironment.resolveConfigurationVariables(this._configurationResolverService, { ...shellLaunchConfig.env }, lastActiveWorkspaceRoot);
		// shellLaunchConfig.env = envFromShell;
		// terminalEnvironment.mergeEnvironments(parentEnv, envFromConfig);
		// const env = terminalEnvironment.createTerminalEnv(parentEnv, shellLaunchConfig, this.initialCwd, locale, cols, rows);
		return env;
	}

	private _setupTitlePolling() {
		this._sendProcessTitle();
		setInterval(() => {
			if (this._currentTitle !== this._ptyProcess.process) {
				this._sendProcessTitle();
			}
		}, 200);
	}

	// Allow any trailing data events to be sent before the exit event is sent.
	// See https://github.com/Tyriar/node-pty/issues/72
	private _queueProcessExit() {
		if (this._closeTimeout) {
			clearTimeout(this._closeTimeout);
		}
		// TODO: Dispose correctly
		this._closeTimeout = setTimeout(() => {
			this._ptyProcess.kill();
			this._onProcessExit.fire(this._exitCode);
		}, 250);
	}

	private _sendProcessId() {
		this._onProcessIdReady.fire(this._ptyProcess.pid);
	}
	private _sendProcessTitle(): void {
		this._currentTitle = this._ptyProcess.process;
		this._onProcessTitleChanged.fire(this._currentTitle);
	}

	public shutdown(): void {
		this._queueProcessExit();
	}

	public input(data: string): void {
		this._ptyProcess.write(data);
	}

	public resize(cols: number, rows: number): void {
		// Ensure that cols and rows are always >= 1, this prevents a native
		// exception in winpty.
		this._ptyProcess.resize(Math.max(cols, 1), Math.max(rows, 1));
	}

	public get isConnected(): boolean {
		// Don't need connected anymore as it's the same process
		return true;
	}
}
