/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, DisposableStore, Disposable } from 'vs/base/common/lifecycle';
import { ITerminalService, ITerminalInstance, IShellLaunchConfig, ITerminalProcessExtHostProxy, ISpawnExtHostProcessRequest, ITerminalDimensions, EXT_HOST_CREATION_DELAY, IAvailableShellsRequest, IDefaultShellAndArgsRequest, IStartExtensionTerminalRequest } from 'vs/workbench/contrib/terminal/common/terminal';
import { ExtHostContext, ExtHostTerminalServiceShape, MainThreadTerminalServiceShape, MainContext, IExtHostContext, IShellLaunchConfigDto, TerminalLaunchConfig, ITerminalDimensionsDto } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { URI } from 'vs/base/common/uri';
import { StopWatch } from 'vs/base/common/stopwatch';
import { ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

@extHostNamedCustomer(MainContext.MainThreadTerminalService)
export class MainThreadTerminalService implements MainThreadTerminalServiceShape {

	private _proxy: ExtHostTerminalServiceShape;
	private _remoteAuthority: string | null;
	private readonly _toDispose = new DisposableStore();
	private readonly _terminalProcesses = new Map<number, Promise<ITerminalProcessExtHostProxy>>();
	private readonly _terminalProcessesReady = new Map<number, (proxy: ITerminalProcessExtHostProxy) => void>();
	private readonly _terminalOnDidWriteDataListeners = new Map<number, IDisposable>();
	private _dataEventTracker: TerminalDataEventTracker | undefined;

	constructor(
		extHostContext: IExtHostContext,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalInstanceService readonly terminalInstanceService: ITerminalInstanceService,
		@IRemoteAgentService readonly _remoteAgentService: IRemoteAgentService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTerminalService);
		this._remoteAuthority = extHostContext.remoteAuthority;

		// ITerminalService listeners
		this._toDispose.add(_terminalService.onInstanceCreated((instance) => {
			// Delay this message so the TerminalInstance constructor has a chance to finish and
			// return the ID normally to the extension host. The ID that is passed here will be
			// used to register non-extension API terminals in the extension host.
			setTimeout(() => {
				this._onTerminalOpened(instance);
				this._onInstanceDimensionsChanged(instance);
			}, EXT_HOST_CREATION_DELAY);
		}));

		this._toDispose.add(_terminalService.onInstanceDisposed(instance => this._onTerminalDisposed(instance)));
		this._toDispose.add(_terminalService.onInstanceProcessIdReady(instance => this._onTerminalProcessIdReady(instance)));
		this._toDispose.add(_terminalService.onInstanceDimensionsChanged(instance => this._onInstanceDimensionsChanged(instance)));
		this._toDispose.add(_terminalService.onInstanceMaximumDimensionsChanged(instance => this._onInstanceMaximumDimensionsChanged(instance)));
		this._toDispose.add(_terminalService.onInstanceRequestSpawnExtHostProcess(request => this._onRequestSpawnExtHostProcess(request)));
		this._toDispose.add(_terminalService.onInstanceRequestStartExtensionTerminal(e => this._onRequestStartExtensionTerminal(e)));
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
			isExtensionTerminal: launchConfig.isExtensionTerminal
		};
		const terminal = this._terminalService.createTerminal(shellLaunchConfig);
		this._terminalProcesses.set(terminal.id, new Promise<ITerminalProcessExtHostProxy>(r => this._terminalProcessesReady.set(terminal.id, r)));
		return Promise.resolve({
			id: terminal.id,
			name: terminal.title
		});
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

	public $sendText(terminalId: number, text: string, addNewLine: boolean): void {
		const terminalInstance = this._terminalService.getInstanceFromId(terminalId);
		if (terminalInstance) {
			terminalInstance.sendText(text, addNewLine);
		}
	}

	/** @deprecated */
	public $registerOnDataListener(terminalId: number): void {
		const terminalInstance = this._terminalService.getInstanceFromId(terminalId);
		if (!terminalInstance) {
			return;
		}

		// Listener already registered
		if (this._terminalOnDidWriteDataListeners.has(terminalId)) {
			return;
		}

		// Register
		const listener = terminalInstance.onData(data => {
			this._onTerminalData(terminalId, data);
		});
		this._terminalOnDidWriteDataListeners.set(terminalId, listener);
		terminalInstance.addDisposable(listener);
	}

	public $startSendingDataEvents(): void {
		if (!this._dataEventTracker) {
			this._dataEventTracker = this._instantiationService.createInstance(TerminalDataEventTracker, (id, data) => {
				this._onTerminalData2(id, data);
			});
		}
	}

	public $stopSendingDataEvents(): void {
		if (this._dataEventTracker) {
			this._dataEventTracker.dispose();
			this._dataEventTracker = undefined;
		}
	}

	private _onActiveTerminalChanged(terminalId: number | null): void {
		this._proxy.$acceptActiveTerminalChanged(terminalId);
	}

	/** @deprecated */
	private _onTerminalData(terminalId: number, data: string): void {
		this._proxy.$acceptTerminalProcessData(terminalId, data);
	}

	private _onTerminalData2(terminalId: number, data: string): void {
		this._proxy.$acceptTerminalProcessData2(terminalId, data);
	}

	private _onTitleChanged(terminalId: number, name: string): void {
		this._proxy.$acceptTerminalTitleChange(terminalId, name);
	}

	private _onWorkspacePermissionsChanged(isAllowed: boolean): void {
		this._proxy.$acceptWorkspacePermissionsChanged(isAllowed);
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

	private _onRequestSpawnExtHostProcess(request: ISpawnExtHostProcessRequest): void {
		// Only allow processes on remote ext hosts
		if (!this._remoteAuthority) {
			return;
		}

		const proxy = request.proxy;
		const ready = this._terminalProcessesReady.get(proxy.terminalId);
		if (ready) {
			ready(proxy);
			this._terminalProcessesReady.delete(proxy.terminalId);
		} else {
			this._terminalProcesses.set(proxy.terminalId, Promise.resolve(proxy));
		}
		const shellLaunchConfigDto: IShellLaunchConfigDto = {
			name: request.shellLaunchConfig.name,
			executable: request.shellLaunchConfig.executable,
			args: request.shellLaunchConfig.args,
			cwd: request.shellLaunchConfig.cwd,
			env: request.shellLaunchConfig.env
		};
		this._proxy.$spawnExtHostProcess(proxy.terminalId, shellLaunchConfigDto, request.activeWorkspaceRootUri, request.cols, request.rows, request.isWorkspaceShellAllowed);
		proxy.onInput(data => this._proxy.$acceptProcessInput(proxy.terminalId, data));
		proxy.onResize(dimensions => this._proxy.$acceptProcessResize(proxy.terminalId, dimensions.cols, dimensions.rows));
		proxy.onShutdown(immediate => this._proxy.$acceptProcessShutdown(proxy.terminalId, immediate));
		proxy.onRequestCwd(() => this._proxy.$acceptProcessRequestCwd(proxy.terminalId));
		proxy.onRequestInitialCwd(() => this._proxy.$acceptProcessRequestInitialCwd(proxy.terminalId));
		proxy.onRequestLatency(() => this._onRequestLatency(proxy.terminalId));
	}

	private _onRequestStartExtensionTerminal(request: IStartExtensionTerminalRequest): void {
		const proxy = request.proxy;
		const ready = this._terminalProcessesReady.get(proxy.terminalId);
		if (!ready) {
			this._terminalProcesses.set(proxy.terminalId, Promise.resolve(proxy));
		} else {
			ready(proxy);
			this._terminalProcessesReady.delete(proxy.terminalId);
		}

		// Note that onReisze is not being listened to here as it needs to fire when max dimensions
		// change, excluding the dimension override
		const initialDimensions: ITerminalDimensionsDto | undefined = request.cols && request.rows ? {
			columns: request.cols,
			rows: request.rows
		} : undefined;
		this._proxy.$startExtensionTerminal(proxy.terminalId, initialDimensions);
		proxy.onInput(data => this._proxy.$acceptProcessInput(proxy.terminalId, data));
		proxy.onShutdown(immediate => this._proxy.$acceptProcessShutdown(proxy.terminalId, immediate));
		proxy.onRequestCwd(() => this._proxy.$acceptProcessRequestCwd(proxy.terminalId));
		proxy.onRequestInitialCwd(() => this._proxy.$acceptProcessRequestInitialCwd(proxy.terminalId));
		proxy.onRequestLatency(() => this._onRequestLatency(proxy.terminalId));
	}

	public $sendProcessTitle(terminalId: number, title: string): void {
		this._getTerminalProcess(terminalId).then(e => e.emitTitle(title));
	}

	public $sendProcessData(terminalId: number, data: string): void {
		this._getTerminalProcess(terminalId).then(e => e.emitData(data));
	}

	public $sendProcessReady(terminalId: number, pid: number, cwd: string): void {
		this._getTerminalProcess(terminalId).then(e => e.emitReady(pid, cwd));
	}

	public $sendProcessExit(terminalId: number, exitCode: number): void {
		this._getTerminalProcess(terminalId).then(e => e.emitExit(exitCode));
		this._terminalProcesses.delete(terminalId);
	}

	public $sendOverrideDimensions(terminalId: number, dimensions: ITerminalDimensions | undefined): void {
		this._getTerminalProcess(terminalId).then(e => e.emitOverrideDimensions(dimensions));
	}

	public $sendProcessInitialCwd(terminalId: number, initialCwd: string): void {
		this._getTerminalProcess(terminalId).then(e => e.emitInitialCwd(initialCwd));
	}

	public $sendProcessCwd(terminalId: number, cwd: string): void {
		this._getTerminalProcess(terminalId).then(e => e.emitCwd(cwd));
	}

	public $sendResolvedLaunchConfig(terminalId: number, shellLaunchConfig: IShellLaunchConfig): void {
		const instance = this._terminalService.getInstanceFromId(terminalId);
		if (instance) {
			this._getTerminalProcess(terminalId).then(e => e.emitResolvedShellLaunchConfig(shellLaunchConfig));
		}
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
		this._getTerminalProcess(terminalId).then(e => e.emitLatency(sum / COUNT));
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
			this._proxy.$requestDefaultShellAndArgs(request.useAutomationShell).then(e => request.callback(e.shell, e.args));
		}
	}

	private _getTerminalProcess(terminalId: number): Promise<ITerminalProcessExtHostProxy> {
		const terminal = this._terminalProcesses.get(terminalId);
		if (!terminal) {
			throw new Error(`Unknown terminal: ${terminalId}`);
		}
		return terminal;
	}
}

/**
 * Encapsulates temporary tracking of data events from terminal instances, once disposed all
 * listeners are removed.
 */
class TerminalDataEventTracker extends Disposable {
	constructor(
		private readonly _callback: (id: number, data: string) => void,
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
		super();
		this._terminalService.terminalInstances.forEach(instance => this._registerInstance(instance));
		this._register(this._terminalService.onInstanceCreated(instance => this._registerInstance(instance)));
	}

	private _registerInstance(instance: ITerminalInstance): void {
		this._register(instance.onData(e => this._callback(instance.id, e)));
	}
}
