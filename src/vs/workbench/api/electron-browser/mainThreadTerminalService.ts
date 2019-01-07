/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ITerminalService, ITerminalInstance, IShellLaunchConfig, ITerminalProcessExtHostProxy, ITerminalProcessExtHostRequest, ITerminalDimensions, EXT_HOST_CREATION_DELAY } from 'vs/workbench/parts/terminal/common/terminal';
import { ExtHostContext, ExtHostTerminalServiceShape, MainThreadTerminalServiceShape, MainContext, IExtHostContext, ShellLaunchConfigDto } from 'vs/workbench/api/node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadTerminalService)
export class MainThreadTerminalService implements MainThreadTerminalServiceShape {

	private _proxy: ExtHostTerminalServiceShape;
	private _remoteAuthority: string | null;
	private _toDispose: IDisposable[] = [];
	private _terminalProcesses: { [id: number]: ITerminalProcessExtHostProxy } = {};
	private _terminalOnDidWriteDataListeners: { [id: number]: IDisposable } = {};
	private _terminalOnDidAcceptInputListeners: { [id: number]: IDisposable } = {};

	constructor(
		extHostContext: IExtHostContext,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTerminalService);
		this._remoteAuthority = extHostContext.remoteAuthority;
		this._toDispose.push(terminalService.onInstanceCreated((instance) => {
			// Delay this message so the TerminalInstance constructor has a chance to finish and
			// return the ID normally to the extension host. The ID that is passed here will be used
			// to register non-extension API terminals in the extension host.
			setTimeout(() => this._onTerminalOpened(instance), EXT_HOST_CREATION_DELAY);
		}));
		this._toDispose.push(terminalService.onInstanceDisposed(instance => this._onTerminalDisposed(instance)));
		this._toDispose.push(terminalService.onInstanceProcessIdReady(instance => this._onTerminalProcessIdReady(instance)));
		this._toDispose.push(terminalService.onInstanceDimensionsChanged(instance => this._onInstanceDimensionsChanged(instance)));
		this._toDispose.push(terminalService.onInstanceRequestExtHostProcess(request => this._onTerminalRequestExtHostProcess(request)));
		this._toDispose.push(terminalService.onActiveInstanceChanged(instance => this._onActiveTerminalChanged(instance ? instance.id : undefined)));
		this._toDispose.push(terminalService.onInstanceTitleChanged(instance => this._onTitleChanged(instance.id, instance.title)));

		// Set initial ext host state
		this.terminalService.terminalInstances.forEach(t => {
			this._onTerminalOpened(t);
			t.processReady.then(() => this._onTerminalProcessIdReady(t));
		});
		const activeInstance = this.terminalService.getActiveInstance();
		if (activeInstance) {
			this._proxy.$acceptActiveTerminalChanged(activeInstance.id);
		}
	}

	public dispose(): void {
		this._toDispose = dispose(this._toDispose);

		// TODO@Daniel: Should all the previously created terminals be disposed
		// when the extension host process goes down ?
	}

	public $createTerminal(name?: string, shellPath?: string, shellArgs?: string[], cwd?: string, env?: { [key: string]: string }, waitOnExit?: boolean): Promise<{ id: number, name: string }> {
		const shellLaunchConfig: IShellLaunchConfig = {
			name,
			executable: shellPath,
			args: shellArgs,
			cwd,
			waitOnExit,
			ignoreConfigurationCwd: true,
			env
		};
		const terminal = this.terminalService.createTerminal(shellLaunchConfig);
		return Promise.resolve({
			id: terminal.id,
			name: terminal.title
		});
	}

	public $createTerminalRenderer(name: string): Promise<number> {
		const instance = this.terminalService.createTerminalRenderer(name);
		return Promise.resolve(instance.id);
	}

	public $show(terminalId: number, preserveFocus: boolean): void {
		const terminalInstance = this.terminalService.getInstanceFromId(terminalId);
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
		const terminalInstance = this.terminalService.getInstanceFromId(terminalId);
		if (terminalInstance) {
			terminalInstance.dispose();
		}
	}

	public $terminalRendererWrite(terminalId: number, text: string): void {
		const terminalInstance = this.terminalService.getInstanceFromId(terminalId);
		if (terminalInstance && terminalInstance.shellLaunchConfig.isRendererOnly) {
			terminalInstance.write(text);
		}
	}

	public $terminalRendererSetName(terminalId: number, name: string): void {
		const terminalInstance = this.terminalService.getInstanceFromId(terminalId);
		if (terminalInstance && terminalInstance.shellLaunchConfig.isRendererOnly) {
			terminalInstance.setTitle(name, false);
		}
	}

	public $terminalRendererSetDimensions(terminalId: number, dimensions: ITerminalDimensions): void {
		const terminalInstance = this.terminalService.getInstanceFromId(terminalId);
		if (terminalInstance && terminalInstance.shellLaunchConfig.isRendererOnly) {
			terminalInstance.setDimensions(dimensions);
		}
	}

	public $terminalRendererRegisterOnInputListener(terminalId: number): void {
		const terminalInstance = this.terminalService.getInstanceFromId(terminalId);
		if (!terminalInstance) {
			return;
		}

		// Listener already registered
		if (this._terminalOnDidAcceptInputListeners.hasOwnProperty(terminalId)) {
			return;
		}

		// Register
		this._terminalOnDidAcceptInputListeners[terminalId] = terminalInstance.onRendererInput(data => this._onTerminalRendererInput(terminalId, data));
		terminalInstance.addDisposable(this._terminalOnDidAcceptInputListeners[terminalId]);
	}

	public $sendText(terminalId: number, text: string, addNewLine: boolean): void {
		const terminalInstance = this.terminalService.getInstanceFromId(terminalId);
		if (terminalInstance) {
			terminalInstance.sendText(text, addNewLine);
		}
	}

	public $registerOnDataListener(terminalId: number): void {
		const terminalInstance = this.terminalService.getInstanceFromId(terminalId);
		if (!terminalInstance) {
			return;
		}

		// Listener already registered
		if (this._terminalOnDidWriteDataListeners[terminalId]) {
			return;
		}

		// Register
		this._terminalOnDidWriteDataListeners[terminalId] = terminalInstance.onData(data => {
			this._onTerminalData(terminalId, data);
		});
		terminalInstance.addDisposable(this._terminalOnDidWriteDataListeners[terminalId]);
	}

	private _onActiveTerminalChanged(terminalId: number | undefined): void {
		this._proxy.$acceptActiveTerminalChanged(terminalId);
	}

	private _onTerminalData(terminalId: number, data: string): void {
		this._proxy.$acceptTerminalProcessData(terminalId, data);
	}

	private _onTitleChanged(terminalId: number, name: string): void {
		this._proxy.$acceptTerminalTitleChange(terminalId, name);
	}

	private _onTerminalRendererInput(terminalId: number, data: string): void {
		this._proxy.$acceptTerminalRendererInput(terminalId, data);
	}

	private _onTerminalDisposed(terminalInstance: ITerminalInstance): void {
		this._proxy.$acceptTerminalClosed(terminalInstance.id);
	}

	private _onTerminalOpened(terminalInstance: ITerminalInstance): void {
		if (terminalInstance.title) {
			this._proxy.$acceptTerminalOpened(terminalInstance.id, terminalInstance.title);
		} else {
			terminalInstance.waitForTitle().then(title => {
				this._proxy.$acceptTerminalOpened(terminalInstance.id, title);
			});
		}
	}

	private _onTerminalProcessIdReady(terminalInstance: ITerminalInstance): void {
		this._proxy.$acceptTerminalProcessId(terminalInstance.id, terminalInstance.processId);
	}

	private _onInstanceDimensionsChanged(instance: ITerminalInstance): void {
		// Only send the dimensions if the terminal is a renderer only as there is no API to access
		// dimensions on a plain Terminal.
		if (instance.shellLaunchConfig.isRendererOnly) {
			this._proxy.$acceptTerminalRendererDimensions(instance.id, instance.cols, instance.rows);
		}
	}

	private _onTerminalRequestExtHostProcess(request: ITerminalProcessExtHostRequest): void {
		// Only allow processes on remote ext hosts
		if (!this._remoteAuthority) {
			return;
		}

		this._terminalProcesses[request.proxy.terminalId] = request.proxy;
		const shellLaunchConfigDto: ShellLaunchConfigDto = {
			name: request.shellLaunchConfig.name,
			executable: request.shellLaunchConfig.executable,
			args: request.shellLaunchConfig.args,
			cwd: request.shellLaunchConfig.cwd,
			env: request.shellLaunchConfig.env
		};
		this._proxy.$createProcess(request.proxy.terminalId, shellLaunchConfigDto, request.activeWorkspaceRootUri, request.cols, request.rows);
		request.proxy.onInput(data => this._proxy.$acceptProcessInput(request.proxy.terminalId, data));
		request.proxy.onResize(dimensions => this._proxy.$acceptProcessResize(request.proxy.terminalId, dimensions.cols, dimensions.rows));
		request.proxy.onShutdown(immediate => this._proxy.$acceptProcessShutdown(request.proxy.terminalId, immediate));
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
