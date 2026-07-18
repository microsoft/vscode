/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { IProcessEnvironment } from '../../../base/common/platform.js';
import { connect } from '../../../base/parts/ipc/node/ipc.net.js';
import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IProcessDetails } from '../common/terminalProcess.js';
import { IShellLaunchConfig, ITerminalProcessOptions, ITerminalDaemonService, TerminalIpcChannels } from '../common/terminal.js';
import { ILogService } from '../../log/common/log.js';
import { spawn } from 'child_process';
import { join } from '../../../base/common/path.js';
import { FileAccess } from '../../../base/common/network.js';

export class TerminalDaemonServiceClient extends Disposable implements ITerminalDaemonService {
	declare readonly _serviceBrand: undefined;

	private _proxy?: ITerminalDaemonService;
	private readonly _connectionDisposables = new DisposableStore();

	private readonly _onDidProcessData = this._register(new Emitter<{ id: number; data: string }>());
	readonly onDidProcessData = this._onDidProcessData.event;

	private readonly _onDidProcessExit = this._register(new Emitter<{ id: number; exitCode: number | undefined }>());
	readonly onDidProcessExit = this._onDidProcessExit.event;

	constructor(
		@ILogService private readonly _logService: ILogService
	) {
		super();
	}

	private async _ensureConnection(): Promise<ITerminalDaemonService> {
		if (this._proxy) {
			return this._proxy;
		}

		const pipePath = process.env.VSCODE_TERMINAL_DAEMON_PIPE || this._getDefaultPipePath();
		
		try {
			const client = await connect(pipePath, 'terminal-daemon-client');
			this._proxy = ProxyChannel.toService<ITerminalDaemonService>(client.getChannel(TerminalIpcChannels.PtyHost));
			
			this._connectionDisposables.add(this._proxy.onDidProcessData(e => this._onDidProcessData.fire(e)));
			this._connectionDisposables.add(this._proxy.onDidProcessExit(e => this._onDidProcessExit.fire(e)));
			
			this._logService.info(`Connected to terminal daemon at ${pipePath}`);
			return this._proxy;
		} catch (err) {
			this._logService.info(`Could not connect to terminal daemon, attempting to start it...`);
			await this._startDaemon(pipePath);
			// Retry connection once
			const client = await connect(pipePath, 'terminal-daemon-client');
			this._proxy = ProxyChannel.toService<ITerminalDaemonService>(client.getChannel(TerminalIpcChannels.PtyHost));
			return this._proxy;
		}
	}

	private _getDefaultPipePath(): string {
		if (process.platform === 'win32') {
			return `\\\\.\\pipe\\vscode-terminal-daemon-${process.env.USER || 'default'}`;
		}
		return join(process.env.XDG_RUNTIME_DIR || '/tmp', `vscode-terminal-daemon-${process.env.USER || 'default'}.sock`);
	}

	private async _startDaemon(pipePath: string): Promise<void> {
		const entryPoint = FileAccess.asFileUri('vs/platform/terminal/node/terminalDaemonMain.js').fsPath;
		const child = spawn(process.execPath, [entryPoint], {
			detached: true,
			stdio: 'ignore',
			env: {
				...process.env,
				VSCODE_TERMINAL_DAEMON_PIPE: pipePath
			}
		});
		child.unref();
		
		// Wait a bit for the daemon to start
		return new Promise(resolve => setTimeout(resolve, 1000));
	}

	async createProcess(shellLaunchConfig: IShellLaunchConfig, cwd: string, cols: number, rows: number, unicodeVersion: '6' | '11', env: IProcessEnvironment, options: ITerminalProcessOptions): Promise<number> {
		const proxy = await this._ensureConnection();
		return proxy.createProcess(shellLaunchConfig, cwd, cols, rows, unicodeVersion, env, options);
	}

	async attachToProcess(id: number): Promise<void> {
		const proxy = await this._ensureConnection();
		return proxy.attachToProcess(id);
	}

	async detachFromProcess(id: number): Promise<void> {
		const proxy = await this._ensureConnection();
		return proxy.detachFromProcess(id);
	}

	async input(id: number, data: string): Promise<void> {
		const proxy = await this._ensureConnection();
		return proxy.input(id, data);
	}

	async resize(id: number, cols: number, rows: number): Promise<void> {
		const proxy = await this._ensureConnection();
		return proxy.resize(id, cols, rows);
	}

	async shutdown(id: number, immediate: boolean): Promise<void> {
		const proxy = await this._ensureConnection();
		return proxy.shutdown(id, immediate);
	}

	async listProcesses(): Promise<IProcessDetails[]> {
		const proxy = await this._ensureConnection();
		return proxy.listProcesses();
	}
}
