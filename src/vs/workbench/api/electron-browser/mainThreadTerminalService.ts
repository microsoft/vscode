/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ITerminalService, ITerminalInstance, IShellLaunchConfig, ITerminalProcessExtHostProxy, ITerminalProcessExtHostRequest } from 'vs/workbench/parts/terminal/common/terminal';
import { TPromise } from 'vs/base/common/winjs.base';
import { ExtHostContext, ExtHostTerminalServiceShape, MainThreadTerminalServiceShape, MainContext, IExtHostContext, ShellLaunchConfigDto } from '../node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadTerminalService)
export class MainThreadTerminalService implements MainThreadTerminalServiceShape {

	private _proxy: ExtHostTerminalServiceShape;
	private _toDispose: IDisposable[] = [];
	private _terminalProcesses: { [id: number]: ITerminalProcessExtHostProxy } = {};
	private _dataListeners: { [id: number]: IDisposable } = {};

	constructor(
		extHostContext: IExtHostContext,
		@ITerminalService private terminalService: ITerminalService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTerminalService);
		this._toDispose.push(terminalService.onInstanceCreated((terminalInstance) => {
			// Delay this message so the TerminalInstance constructor has a chance to finish and
			// return the ID normally to the extension host. The ID that is passed here will be used
			// to register non-extension API terminals in the extension host.
			setTimeout(() => this._onTerminalOpened(terminalInstance), 100);
		}));
		this._toDispose.push(terminalService.onInstanceDisposed(terminalInstance => this._onTerminalDisposed(terminalInstance)));
		this._toDispose.push(terminalService.onInstanceProcessIdReady(terminalInstance => this._onTerminalProcessIdReady(terminalInstance)));
		this._toDispose.push(terminalService.onInstanceRequestExtHostProcess(request => this._onTerminalRequestExtHostProcess(request)));

		// Set initial ext host state
		this.terminalService.terminalInstances.forEach(t => {
			this._onTerminalOpened(t);
			t.processReady.then(() => this._onTerminalProcessIdReady(t));
		});
	}

	public dispose(): void {
		this._toDispose = dispose(this._toDispose);

		// TODO@Daniel: Should all the previously created terminals be disposed
		// when the extension host process goes down ?
	}

	public $createTerminal(name?: string, shellPath?: string, shellArgs?: string[], cwd?: string, env?: { [key: string]: string }, waitOnExit?: boolean): TPromise<number> {
		const shellLaunchConfig: IShellLaunchConfig = {
			name,
			executable: shellPath,
			args: shellArgs,
			cwd,
			waitOnExit,
			ignoreConfigurationCwd: true,
			env
		};
		return TPromise.as(this.terminalService.createTerminal(shellLaunchConfig).id);
	}

	public $show(terminalId: number, preserveFocus: boolean): void {
		let terminalInstance = this.terminalService.getInstanceFromId(terminalId);
		if (terminalInstance) {
			this.terminalService.setActiveInstance(terminalInstance);
			this.terminalService.showPanel(!preserveFocus);
		}
	}

	public $hide(terminalId: number): void {
		if (this.terminalService.getActiveInstance().id === terminalId) {
			this.terminalService.hidePanel();
		}
	}

	public $dispose(terminalId: number): void {
		let terminalInstance = this.terminalService.getInstanceFromId(terminalId);
		if (terminalInstance) {
			terminalInstance.dispose();
		}
	}

	public $sendText(terminalId: number, text: string, addNewLine: boolean): void {
		let terminalInstance = this.terminalService.getInstanceFromId(terminalId);
		if (terminalInstance) {
			terminalInstance.sendText(text, addNewLine);
		}
	}

	public $registerOnDataListener(terminalId: number): void {
		let terminalInstance = this.terminalService.getInstanceFromId(terminalId);
		if (terminalInstance) {
			this._dataListeners[terminalId] = terminalInstance.onData(data => this._onTerminalData(terminalId, data));
			terminalInstance.onDisposed(instance => delete this._dataListeners[terminalId]);
		}
	}

	private _onTerminalData(terminalId: number, data: string): void {
		this._proxy.$acceptTerminalProcessData(terminalId, data);
	}

	private _onTerminalDisposed(terminalInstance: ITerminalInstance): void {
		this._proxy.$acceptTerminalClosed(terminalInstance.id);
	}

	private _onTerminalOpened(terminalInstance: ITerminalInstance): void {
		this._proxy.$acceptTerminalOpened(terminalInstance.id, terminalInstance.title);
	}

	private _onTerminalProcessIdReady(terminalInstance: ITerminalInstance): void {
		this._proxy.$acceptTerminalProcessId(terminalInstance.id, terminalInstance.processId);
	}

	private _onTerminalRequestExtHostProcess(request: ITerminalProcessExtHostRequest): void {
		this._terminalProcesses[request.proxy.terminalId] = request.proxy;
		const shellLaunchConfigDto: ShellLaunchConfigDto = {
			name: request.shellLaunchConfig.name,
			executable: request.shellLaunchConfig.executable,
			args: request.shellLaunchConfig.args,
			cwd: request.shellLaunchConfig.cwd,
			env: request.shellLaunchConfig.env
		};
		this._proxy.$createProcess(request.proxy.terminalId, shellLaunchConfigDto, request.cols, request.rows);
		request.proxy.onInput(data => this._proxy.$acceptProcessInput(request.proxy.terminalId, data));
		request.proxy.onResize((cols, rows) => this._proxy.$acceptProcessResize(request.proxy.terminalId, cols, rows));
		request.proxy.onShutdown(() => this._proxy.$acceptProcessShutdown(request.proxy.terminalId));
	}

	public $sendProcessTitle(terminalId: number, title: string): void {
		this._terminalProcesses[terminalId].emitTitle(title);
	}

	public $sendProcessData(terminalId: number, data: string): void {
		this._terminalProcesses[terminalId].emitData(data);
	}

	public $sendProcessPid(terminalId: number, pid: number): void {
		this._terminalProcesses[terminalId].emitPid(pid);
	}

	public $sendProcessExit(terminalId: number, exitCode: number): void {
		this._terminalProcesses[terminalId].emitExit(exitCode);
		delete this._terminalProcesses[terminalId];
	}
}
