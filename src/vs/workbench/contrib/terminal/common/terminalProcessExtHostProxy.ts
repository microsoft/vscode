/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { ITerminalService, ITerminalProcessExtHostProxy, IShellLaunchConfig, ITerminalChildProcess, ITerminalConfigHelper } from 'vs/workbench/contrib/terminal/common/terminal';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import * as nls from 'vs/nls';

let hasReceivedResponse: boolean = false;

export class TerminalProcessExtHostProxy implements ITerminalChildProcess, ITerminalProcessExtHostProxy {
	private _disposables: IDisposable[] = [];

	private readonly _onProcessData = new Emitter<string>();
	public get onProcessData(): Event<string> { return this._onProcessData.event; }
	private readonly _onProcessExit = new Emitter<number>();
	public get onProcessExit(): Event<number> { return this._onProcessExit.event; }
	private readonly _onProcessIdReady = new Emitter<number>();
	public get onProcessIdReady(): Event<number> { return this._onProcessIdReady.event; }
	private readonly _onProcessTitleChanged = new Emitter<string>();
	public get onProcessTitleChanged(): Event<string> { return this._onProcessTitleChanged.event; }

	private readonly _onInput = new Emitter<string>();
	public get onInput(): Event<string> { return this._onInput.event; }
	private readonly _onResize: Emitter<{ cols: number, rows: number }> = new Emitter<{ cols: number, rows: number }>();
	public get onResize(): Event<{ cols: number, rows: number }> { return this._onResize.event; }
	private readonly _onShutdown = new Emitter<boolean>();
	public get onShutdown(): Event<boolean> { return this._onShutdown.event; }
	private readonly _onRequestInitialCwd = new Emitter<void>();
	public get onRequestInitialCwd(): Event<void> { return this._onRequestInitialCwd.event; }
	private readonly _onRequestCwd = new Emitter<void>();
	public get onRequestCwd(): Event<void> { return this._onRequestCwd.event; }
	private readonly _onRequestLatency = new Emitter<void>();
	public get onRequestLatency(): Event<void> { return this._onRequestLatency.event; }

	private _pendingInitialCwdRequests: ((value?: string | Thenable<string>) => void)[] = [];
	private _pendingCwdRequests: ((value?: string | Thenable<string>) => void)[] = [];
	private _pendingLatencyRequests: ((value?: number | Thenable<number>) => void)[] = [];

	constructor(
		public terminalId: number,
		shellLaunchConfig: IShellLaunchConfig,
		activeWorkspaceRootUri: URI,
		cols: number,
		rows: number,
		configHelper: ITerminalConfigHelper,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IRemoteAgentService readonly remoteAgentService: IRemoteAgentService
	) {
		remoteAgentService.getEnvironment().then(env => {
			if (!env) {
				throw new Error('Could not fetch environment');
			}
			this._terminalService.requestExtHostProcess(this, shellLaunchConfig, activeWorkspaceRootUri, cols, rows, configHelper.checkWorkspaceShellPermissions(env.os));
		});
		if (!hasReceivedResponse) {
			setTimeout(() => this._onProcessTitleChanged.fire(nls.localize('terminal.integrated.starting', "Starting...")), 0);
		}
	}

	public dispose(): void {
		this._disposables.forEach(d => d.dispose());
		this._disposables.length = 0;
	}

	public emitData(data: string): void {
		this._onProcessData.fire(data);
	}

	public emitTitle(title: string): void {
		hasReceivedResponse = true;
		this._onProcessTitleChanged.fire(title);
	}

	public emitPid(pid: number): void {
		this._onProcessIdReady.fire(pid);
	}

	public emitExit(exitCode: number): void {
		this._onProcessExit.fire(exitCode);
		this.dispose();
	}

	public emitInitialCwd(initialCwd: string): void {
		while (this._pendingInitialCwdRequests.length > 0) {
			this._pendingInitialCwdRequests.pop()!(initialCwd);
		}
	}

	public emitCwd(cwd: string): void {
		while (this._pendingCwdRequests.length > 0) {
			this._pendingCwdRequests.pop()!(cwd);
		}
	}

	public emitLatency(latency: number): void {
		while (this._pendingLatencyRequests.length > 0) {
			this._pendingLatencyRequests.pop()!(latency);
		}
	}

	public shutdown(immediate: boolean): void {
		this._onShutdown.fire(immediate);
	}

	public input(data: string): void {
		this._onInput.fire(data);
	}

	public resize(cols: number, rows: number): void {
		this._onResize.fire({ cols, rows });
	}

	public getInitialCwd(): Promise<string> {
		return new Promise<string>(resolve => {
			this._onRequestInitialCwd.fire();
			this._pendingInitialCwdRequests.push(resolve);
		});
	}

	public getCwd(): Promise<string> {
		return new Promise<string>(resolve => {
			this._onRequestCwd.fire();
			this._pendingCwdRequests.push(resolve);
		});
	}

	public getLatency(): Promise<number> {
		return new Promise<number>(resolve => {
			this._onRequestLatency.fire();
			this._pendingLatencyRequests.push(resolve);
		});
	}
}