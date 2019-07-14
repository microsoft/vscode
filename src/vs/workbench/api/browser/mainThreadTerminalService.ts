/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ITerminalService, ITerminalInstance, IShellLaunchConfig, ITerminalProcessExtHostProxy, ITerminalProcessExtHostRequest, ITerminalDimensions, EXT_HOST_CREATION_DELAY, IAvailableShellsRequest, IDefaultShellAndArgsRequest, ITerminalVirtualProcessRequest } from 'vs/workbench/contrib/terminal/common/terminal';
import { ExtHostContext, ExtHostTerminalServiceShape, MainThreadTerminalServiceShape, MainContext, IExtHostContext, ShellLaunchConfigDto, TerminalLaunchConfig, ITerminalDimensionsDto } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { URI } from 'vs/base/common/uri';
import { StopWatch } from 'vs/base/common/stopwatch';
import { ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';

@extHostNamedCustomer(MainContext.MainThreadTerminalService)
export class MainThreadTerminalService implements MainThreadTerminalServiceShape {

	private _proxy: ExtHostTerminalServiceShape;
	private _remoteAuthority: string | null;
	private readonly _toDispose = new DisposableStore();
	private _terminalProcesses: { [id: number]: Promise<ITerminalProcessExtHostProxy> } = {};
	private _terminalProcessesReady: { [id: number]: (proxy: ITerminalProcessExtHostProxy) => void } = {};
	private _terminalOnDidWriteDataListeners: { [id: number]: IDisposable } = {};
	private _terminalOnDidAcceptInputListeners: { [id: number]: IDisposable } = {};

	constructor(
		extHostContext: IExtHostContext,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalInstanceService readonly terminalInstanceService: ITerminalInstanceService,
		@IRemoteAgentService readonly _remoteAgentService: IRemoteAgentService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTerminalService);
		this._remoteAuthority = extHostContext.remoteAuthority;

		// ITerminalService listeners
		this._toDispose.add(_terminalService.onInstanceCreated((instance) => {
			// Delay this message so the TerminalInstance constructor has a chance to finish and
			// return the ID normally to the extension host. The ID that is passed here will be used
			// to register non-extension API terminals in the extension host.
			setTimeout(() => {
				this._onTerminalOpened(instance);
				this._onInstanceDimensionsChanged(instance);
			}, EXT_HOST_CREATION_DELAY);
		}));

		this._toDispose.add(_terminalService.onInstanceDisposed(instance => this._onTerminalDisposed(instance)));
		this._toDispose.add(_terminalService.onInstanceProcessIdReady(instance => this._onTerminalProcessIdReady(instance)));
		this._toDispose.add(_terminalService.onInstanceDimensionsChanged(instance => this._onInstanceDimensionsChanged(instance)));
		this._toDispose.add(_terminalService.onInstanceMaximumDimensionsChanged(instance => this._onInstanceMaximumDimensionsChanged(instance)));
		this._toDispose.add(_terminalService.onInstanceRequestExtHostProcess(request => this._onTerminalRequestExtHostProcess(request)));
		this._toDispose.add(_terminalService.onInstanceRequestVirtualProcess(e => this._onTerminalRequestVirtualProcess(e)));
		this._toDispose.add(_terminalService.onActiveInstanceChanged(instance => this._onActiveTerminalChanged(instance ? instance.id : null)));
		this._toDispose.add(_terminalService.onInstanceTitleChanged(instance => this._onTitleChanged(instance.id, instance.title)));
		this._toDispose.add(_terminalService.configHelper.onWorkspacePermissionsChanged(isAllowed => this._onWorkspacePermissionsChanged(isAllowed)));
		this._toDispose.add(_terminalService.onRequestAvailableShells(e => this._onRequestAvailableShells(e)));

		// ITerminalInstanceService listeners
		if (terminalInstanceService.onRequestDefaultShellAndArgs) {
			this._toDispose.add(terminalInstanceService.onRequestDefaultShellAndArgs(e => this._onRequestDefaultShellAndArgs(e)));
		}

		// Set initial ext host state
		this._terminalService.terminalInstances.forEach(t => {
			this._onTerminalOpened(t);
			t.processReady.then(() => this._onTerminalProcessIdReady(t));
		});
		const activeInstance = this._terminalService.getActiveInstance();
		if (activeInstance) {
			this._proxy.$acceptActiveTerminalChanged(activeInstance.id);
		}

		this._terminalService.extHostReady(extHostContext.remoteAuthority);
	}

	public dispose(): void {
		this._toDispose.dispose();

		// TODO@Daniel: Should all the previously created terminals be disposed
		// when the extension host process goes down ?
	}

	public $createTerminal(launchConfig: TerminalLaunchConfig): Promise<{ id: number, name: string }> {
		const shellLaunchConfig: IShellLaunchConfig = {
			name: launchConfig.name,
			executable: launchConfig.shellPath,
			args: launchConfig.shellArgs,
			cwd: typeof launchConfig.cwd === 'string' ? launchConfig.cwd : URI.revive(launchConfig.cwd),
			waitOnExit: launchConfig.waitOnExit,
			ignoreConfigurationCwd: true,
			env: launchConfig.env,
			strictEnv: launchConfig.strictEnv,
			hideFromUser: launchConfig.hideFromUser,
			isVirtualProcess: launchConfig.isVirtualProcess
		};
		const terminal = this._terminalService.createTerminal(shellLaunchConfig);
		this._terminalProcesses[terminal.id] = new Promise<ITerminalProcessExtHostProxy>(r => this._terminalProcessesReady[terminal.id] = r);
		return Promise.resolve({
			id: terminal.id,
			name: terminal.title
		});
	}

	public $createTerminalRenderer(name: string): Promise<number> {
		const instance = this._terminalService.createTerminalRenderer(name);
		return Promise.resolve(instance.id);
	}

	public $show(terminalId: number, preserveFocus: boolean): void {
		const terminalInstance = this._terminalService.getInstanceFromId(terminalId);
		if (terminalInstance) {
			this._terminalService.setActiveInstance(terminalInstance);
			this._terminalService.showPanel(!preserveFocus);
		}
	}

	public $hide(terminalId: number): void {
		const instance = this._terminalService.getActiveInstance();
		if (instance && instance.id === terminalId) {
			this._terminalService.hidePanel();
		}
	}

	public $dispose(terminalId: number): void {
		const terminalInstance = this._terminalService.getInstanceFromId(terminalId);
		if (terminalInstance) {
			terminalInstance.dispose();
		}
	}

	public $terminalRendererWrite(terminalId: number, text: string): void {
		const terminalInstance = this._terminalService.getInstanceFromId(terminalId);
		if (terminalInstance && terminalInstance.shellLaunchConfig.isRendererOnly) {
			terminalInstance.write(text);
		}
	}

	public $terminalRendererSetName(terminalId: number, name: string): void {
		const terminalInstance = this._terminalService.getInstanceFromId(terminalId);
		if (terminalInstance && terminalInstance.shellLaunchConfig.isRendererOnly) {
			terminalInstance.setTitle(name, false);
		}
	}

	public $terminalRendererSetDimensions(terminalId: number, dimensions: ITerminalDimensions): void {
		const terminalInstance = this._terminalService.getInstanceFromId(terminalId);
		if (terminalInstance && terminalInstance.shellLaunchConfig.isRendererOnly) {
			terminalInstance.setDimensions(dimensions);
		}
	}

	public $terminalRendererRegisterOnInputListener(terminalId: number): void {
		const terminalInstance = this._terminalService.getInstanceFromId(terminalId);
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
		const terminalInstance = this._terminalService.getInstanceFromId(terminalId);
		if (terminalInstance) {
			terminalInstance.sendText(text, addNewLine);
		}
	}

	public $registerOnDataListener(terminalId: number): void {
		const terminalInstance = this._terminalService.getInstanceFromId(terminalId);
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

	private _onActiveTerminalChanged(terminalId: number | null): void {
		this._proxy.$acceptActiveTerminalChanged(terminalId);
	}

	private _onTerminalData(terminalId: number, data: string): void {
		this._proxy.$acceptTerminalProcessData(terminalId, data);
	}

	private _onTitleChanged(terminalId: number, name: string): void {
		this._proxy.$acceptTerminalTitleChange(terminalId, name);
	}

	private _onWorkspacePermissionsChanged(isAllowed: boolean): void {
		this._proxy.$acceptWorkspacePermissionsChanged(isAllowed);
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
		if (terminalInstance.processId === undefined) {
			return;
		}
		this._proxy.$acceptTerminalProcessId(terminalInstance.id, terminalInstance.processId);
	}

	private _onInstanceDimensionsChanged(instance: ITerminalInstance): void {
		this._proxy.$acceptTerminalDimensions(instance.id, instance.cols, instance.rows);
	}

	private _onInstanceMaximumDimensionsChanged(instance: ITerminalInstance): void {
		this._proxy.$acceptTerminalMaximumDimensions(instance.id, instance.maxCols, instance.maxRows);
	}

	private _onTerminalRequestExtHostProcess(request: ITerminalProcessExtHostRequest): void {
		// Only allow processes on remote ext hosts
		if (!this._remoteAuthority) {
			return;
		}

		const proxy = request.proxy;
		const ready = this._terminalProcessesReady[proxy.terminalId];
		if (ready) {
			ready(proxy);
			delete this._terminalProcessesReady[proxy.terminalId];
		} else {
			this._terminalProcesses[proxy.terminalId] = Promise.resolve(proxy);
		}
		const shellLaunchConfigDto: ShellLaunchConfigDto = {
			name: request.shellLaunchConfig.name,
			executable: request.shellLaunchConfig.executable,
			args: request.shellLaunchConfig.args,
			cwd: request.shellLaunchConfig.cwd,
			env: request.shellLaunchConfig.env
		};
		this._proxy.$createProcess(proxy.terminalId, shellLaunchConfigDto, request.activeWorkspaceRootUri, request.cols, request.rows, request.isWorkspaceShellAllowed);
		proxy.onInput(data => this._proxy.$acceptProcessInput(proxy.terminalId, data));
		proxy.onResize(dimensions => this._proxy.$acceptProcessResize(proxy.terminalId, dimensions.cols, dimensions.rows));
		proxy.onShutdown(immediate => this._proxy.$acceptProcessShutdown(proxy.terminalId, immediate));
		proxy.onRequestCwd(() => this._proxy.$acceptProcessRequestCwd(proxy.terminalId));
		proxy.onRequestInitialCwd(() => this._proxy.$acceptProcessRequestInitialCwd(proxy.terminalId));
		proxy.onRequestLatency(() => this._onRequestLatency(proxy.terminalId));
	}

	private _onTerminalRequestVirtualProcess(request: ITerminalVirtualProcessRequest): void {
		const proxy = request.proxy;
		const ready = this._terminalProcessesReady[proxy.terminalId];
		if (!ready) {
			this._terminalProcesses[proxy.terminalId] = Promise.resolve(proxy);
		} else {
			ready(proxy);
			delete this._terminalProcessesReady[proxy.terminalId];
		}

		// Note that onReisze is not being listened to here as it needs to fire when max dimensions
		// change, excluding the dimension override
		const initialDimensions: ITerminalDimensionsDto | undefined = request.cols && request.rows ? {
			columns: request.cols,
			rows: request.rows
		} : undefined;
		this._proxy.$startVirtualProcess(proxy.terminalId, initialDimensions);
		proxy.onInput(data => this._proxy.$acceptProcessInput(proxy.terminalId, data));
		proxy.onShutdown(immediate => this._proxy.$acceptProcessShutdown(proxy.terminalId, immediate));
		proxy.onRequestCwd(() => this._proxy.$acceptProcessRequestCwd(proxy.terminalId));
		proxy.onRequestInitialCwd(() => this._proxy.$acceptProcessRequestInitialCwd(proxy.terminalId));
		proxy.onRequestLatency(() => this._onRequestLatency(proxy.terminalId));
	}

	public $sendProcessTitle(terminalId: number, title: string): void {
		this._terminalProcesses[terminalId].then(e => e.emitTitle(title));
	}

	public $sendProcessData(terminalId: number, data: string): void {
		this._terminalProcesses[terminalId].then(e => e.emitData(data));
	}

	public $sendProcessReady(terminalId: number, pid: number, cwd: string): void {
		this._terminalProcesses[terminalId].then(e => e.emitReady(pid, cwd));
	}

	public $sendProcessExit(terminalId: number, exitCode: number): void {
		this._terminalProcesses[terminalId].then(e => e.emitExit(exitCode));
		delete this._terminalProcesses[terminalId];
	}

	public $sendOverrideDimensions(terminalId: number, dimensions: ITerminalDimensions | undefined): void {
		this._terminalProcesses[terminalId].then(e => e.emitOverrideDimensions(dimensions));
	}

	public $sendProcessInitialCwd(terminalId: number, initialCwd: string): void {
		this._terminalProcesses[terminalId].then(e => e.emitInitialCwd(initialCwd));
	}

	public $sendProcessCwd(terminalId: number, cwd: string): void {
		this._terminalProcesses[terminalId].then(e => e.emitCwd(cwd));
	}

	private async _onRequestLatency(terminalId: number): Promise<void> {
		const COUNT = 2;
		let sum = 0;
		for (let i = 0; i < COUNT; i++) {
			const sw = StopWatch.create(true);
			await this._proxy.$acceptProcessRequestLatency(terminalId);
			sw.stop();
			sum += sw.elapsed();
		}
		this._terminalProcesses[terminalId].then(e => e.emitLatency(sum / COUNT));
	}

	private _isPrimaryExtHost(): boolean {
		// The "primary" ext host is the remote ext host if there is one, otherwise the local
		const conn = this._remoteAgentService.getConnection();
		if (conn) {
			return this._remoteAuthority === conn.remoteAuthority;
		}
		return true;
	}

	private _onRequestAvailableShells(request: IAvailableShellsRequest): void {
		if (this._isPrimaryExtHost()) {
			this._proxy.$requestAvailableShells().then(e => request(e));
		}
	}

	private _onRequestDefaultShellAndArgs(request: IDefaultShellAndArgsRequest): void {
		if (this._isPrimaryExtHost()) {
			this._proxy.$requestDefaultShellAndArgs().then(e => request(e.shell, e.args));
		}
	}
}
