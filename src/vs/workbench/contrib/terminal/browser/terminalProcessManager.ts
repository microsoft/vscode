/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as platform from 'vs/base/common/platform';
import * as terminalEnvironment from 'vs/workbench/contrib/terminal/common/terminalEnvironment';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ProcessState, ITerminalProcessManager, IShellLaunchConfig, ITerminalConfigHelper, ITerminalChildProcess, IBeforeProcessDataEvent, ITerminalEnvironment } from 'vs/workbench/contrib/terminal/common/terminal';
import { ILogService } from 'vs/platform/log/common/log';
import { Emitter, Event } from 'vs/base/common/event';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { TerminalProcessExtHostProxy } from 'vs/workbench/contrib/terminal/common/terminalProcessExtHostProxy';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { Schemas } from 'vs/base/common/network';
import { getRemoteAuthority } from 'vs/platform/remote/common/remoteHosts';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IProductService } from 'vs/platform/product/common/product';
import { ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';

/** The amount of time to consider terminal errors to be related to the launch */
const LAUNCHING_DURATION = 500;

/**
 * The minimum amount of time between latency requests.
 */
const LATENCY_MEASURING_INTERVAL = 1000;

/**
 * Holds all state related to the creation and management of terminal processes.
 *
 * Internal definitions:
 * - Process: The process launched with the terminalProcess.ts file, or the pty as a whole
 * - Pty Process: The pseudoterminal master process (or the winpty agent process)
 * - Shell Process: The pseudoterminal slave process (ie. the shell)
 */
export class TerminalProcessManager implements ITerminalProcessManager {
	public processState: ProcessState = ProcessState.UNINITIALIZED;
	public ptyProcessReady: Promise<void>;
	public shellProcessId: number;
	public remoteAuthority: string | undefined;
	public os: platform.OperatingSystem | undefined;
	public userHome: string | undefined;

	private _process: ITerminalChildProcess | null = null;
	private _preLaunchInputQueue: string[] = [];
	private _disposables: IDisposable[] = [];
	private _latency: number = -1;
	private _latencyRequest: Promise<number>;
	private _latencyLastMeasured: number = 0;

	private readonly _onProcessReady = new Emitter<void>();
	public get onProcessReady(): Event<void> { return this._onProcessReady.event; }
	private readonly _onBeforeProcessData = new Emitter<IBeforeProcessDataEvent>();
	public get onBeforeProcessData(): Event<IBeforeProcessDataEvent> { return this._onBeforeProcessData.event; }
	private readonly _onProcessData = new Emitter<string>();
	public get onProcessData(): Event<string> { return this._onProcessData.event; }
	private readonly _onProcessTitle = new Emitter<string>();
	public get onProcessTitle(): Event<string> { return this._onProcessTitle.event; }
	private readonly _onProcessExit = new Emitter<number>();
	public get onProcessExit(): Event<number> { return this._onProcessExit.event; }

	constructor(
		private readonly _terminalId: number,
		private readonly _configHelper: ITerminalConfigHelper,
		@IHistoryService private readonly _historyService: IHistoryService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IConfigurationResolverService private readonly _configurationResolverService: IConfigurationResolverService,
		@IConfigurationService private readonly _workspaceConfigurationService: IConfigurationService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IProductService private readonly _productService: IProductService,
		@ITerminalInstanceService private readonly _terminalInstanceService: ITerminalInstanceService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService
	) {
		this.ptyProcessReady = new Promise<void>(c => {
			this.onProcessReady(() => {
				this._logService.debug(`Terminal process ready (shellProcessId: ${this.shellProcessId})`);
				c(undefined);
			});
		});
		this.ptyProcessReady.then(async () => await this.getLatency());
	}

	public dispose(immediate: boolean = false): void {
		if (this._process) {
			// If the process was still connected this dispose came from
			// within VS Code, not the process, so mark the process as
			// killed by the user.
			this.processState = ProcessState.KILLED_BY_USER;
			this._process.shutdown(immediate);
			this._process = null;
		}
		this._disposables.forEach(d => d.dispose());
		this._disposables.length = 0;
	}

	public addDisposable(disposable: IDisposable) {
		this._disposables.push(disposable);
	}

	public createProcess(
		shellLaunchConfig: IShellLaunchConfig,
		cols: number,
		rows: number
	): void {
		const forceExtHostProcess = (this._configHelper.config as any).extHostProcess;
		if (shellLaunchConfig.cwd && typeof shellLaunchConfig.cwd === 'object') {
			this.remoteAuthority = getRemoteAuthority(shellLaunchConfig.cwd);
		} else {
			this.remoteAuthority = this._environmentService.configuration.remoteAuthority;
		}
		const hasRemoteAuthority = !!this.remoteAuthority;
		let launchRemotely = hasRemoteAuthority || forceExtHostProcess;

		this.userHome = this._environmentService.userHome;
		this.os = platform.OS;
		if (launchRemotely) {
			if (hasRemoteAuthority) {
				this._remoteAgentService.getEnvironment().then(env => {
					if (!env) {
						return;
					}
					this.userHome = env.userHome.path;
					this.os = env.os;
				});
			}

			const activeWorkspaceRootUri = this._historyService.getLastActiveWorkspaceRoot();
			this._process = this._instantiationService.createInstance(TerminalProcessExtHostProxy, this._terminalId, shellLaunchConfig, activeWorkspaceRootUri, cols, rows, this._configHelper);
		} else {
			this._process = this._launchProcess(shellLaunchConfig, cols, rows);
		}
		this.processState = ProcessState.LAUNCHING;

		this._process.onProcessData(data => {
			const beforeProcessDataEvent: IBeforeProcessDataEvent = { data };
			this._onBeforeProcessData.fire(beforeProcessDataEvent);
			if (beforeProcessDataEvent.data && beforeProcessDataEvent.data.length > 0) {
				this._onProcessData.fire(beforeProcessDataEvent.data);
			}
		});

		this._process.onProcessIdReady(pid => {
			this.shellProcessId = pid;
			this._onProcessReady.fire();

			// Send any queued data that's waiting
			if (this._preLaunchInputQueue.length > 0 && this._process) {
				this._process.input(this._preLaunchInputQueue.join(''));
				this._preLaunchInputQueue.length = 0;
			}
		});

		this._process.onProcessTitleChanged(title => this._onProcessTitle.fire(title));
		this._process.onProcessExit(exitCode => this._onExit(exitCode));

		setTimeout(() => {
			if (this.processState === ProcessState.LAUNCHING) {
				this.processState = ProcessState.RUNNING;
			}
		}, LAUNCHING_DURATION);
	}

	private _launchProcess(shellLaunchConfig: IShellLaunchConfig, cols: number, rows: number): ITerminalChildProcess {
		if (!shellLaunchConfig.executable) {
			this._configHelper.mergeDefaultShellPathAndArgs(shellLaunchConfig, this._terminalInstanceService.getDefaultShell(platform.platform));
		}

		const activeWorkspaceRootUri = this._historyService.getLastActiveWorkspaceRoot(Schemas.file);
		const initialCwd = terminalEnvironment.getCwd(shellLaunchConfig, this._environmentService.userHome, activeWorkspaceRootUri, this._configHelper.config.cwd);

		const platformKey = platform.isWindows ? 'windows' : (platform.isMacintosh ? 'osx' : 'linux');
		const lastActiveWorkspace = activeWorkspaceRootUri ? this._workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri) : null;
		const envFromConfigValue = this._workspaceConfigurationService.inspect<ITerminalEnvironment | undefined>(`terminal.integrated.env.${platformKey}`);
		const isWorkspaceShellAllowed = this._configHelper.checkWorkspaceShellPermissions();
		const env = terminalEnvironment.createTerminalEnvironment(shellLaunchConfig, lastActiveWorkspace, envFromConfigValue, this._configurationResolverService, isWorkspaceShellAllowed, this._productService.version, this._configHelper.config.setLocaleVariables);

		const useConpty = this._configHelper.config.windowsEnableConpty;
		return this._terminalInstanceService.createTerminalProcess(shellLaunchConfig, initialCwd, cols, rows, env, useConpty);
	}

	public setDimensions(cols: number, rows: number): void {
		if (!this._process) {
			return;
		}

		// The child process could already be terminated
		try {
			this._process.resize(cols, rows);
		} catch (error) {
			// We tried to write to a closed pipe / channel.
			if (error.code !== 'EPIPE' && error.code !== 'ERR_IPC_CHANNEL_CLOSED') {
				throw (error);
			}
		}
	}

	public write(data: string): void {
		if (this.shellProcessId) {
			if (this._process) {
				// Send data if the pty is ready
				this._process.input(data);
			}
		} else {
			// If the pty is not ready, queue the data received to send later
			this._preLaunchInputQueue.push(data);
		}
	}

	public getInitialCwd(): Promise<string> {
		if (!this._process) {
			return Promise.resolve('');
		}
		return this._process.getInitialCwd();
	}

	public getCwd(): Promise<string> {
		if (!this._process) {
			return Promise.resolve('');
		}
		return this._process.getCwd();
	}

	public async getLatency(): Promise<number> {
		await this.ptyProcessReady;
		if (!this._process) {
			return Promise.resolve(0);
		}
		if (this._latencyLastMeasured === 0 || this._latencyLastMeasured + LATENCY_MEASURING_INTERVAL < Date.now()) {
			this._latencyRequest = this._process.getLatency();
			this._latency = await this._latencyRequest;
			this._latencyLastMeasured = Date.now();
		}
		return Promise.resolve(this._latency);
	}

	private _onExit(exitCode: number): void {
		this._process = null;

		// If the process is marked as launching then mark the process as killed
		// during launch. This typically means that there is a problem with the
		// shell and args.
		if (this.processState === ProcessState.LAUNCHING) {
			this.processState = ProcessState.KILLED_DURING_LAUNCH;
		}

		// If TerminalInstance did not know about the process exit then it was
		// triggered by the process, not on VS Code's side.
		if (this.processState === ProcessState.RUNNING) {
			this.processState = ProcessState.KILLED_BY_PROCESS;
		}

		this._onProcessExit.fire(exitCode);
	}
}