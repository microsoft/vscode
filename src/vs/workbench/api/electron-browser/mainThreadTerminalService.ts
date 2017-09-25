/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ITerminalService, ITerminalInstance, IShellLaunchConfig } from 'vs/workbench/parts/terminal/common/terminal';
import { TPromise } from 'vs/base/common/winjs.base';
import { ExtHostContext, ExtHostTerminalServiceShape, MainThreadTerminalServiceShape, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadTerminalService)
export class MainThreadTerminalService implements MainThreadTerminalServiceShape {

	private _proxy: ExtHostTerminalServiceShape;
	private _toDispose: IDisposable[];

	constructor(
		extHostContext: IExtHostContext,
		@ITerminalService private terminalService: ITerminalService
	) {
		this._proxy = extHostContext.get(ExtHostContext.ExtHostTerminalService);
		this._toDispose = [];
		this._toDispose.push(terminalService.onInstanceDisposed((terminalInstance) => this._onTerminalDisposed(terminalInstance)));
		this._toDispose.push(terminalService.onInstanceProcessIdReady((terminalInstance) => this._onTerminalProcessIdReady(terminalInstance)));
	}

	public dispose(): void {
		this._toDispose = dispose(this._toDispose);

		// TODO@Daniel: Should all the previously created terminals be disposed
		// when the extension host process goes down ?
	}

	public $createTerminal(name?: string, shellPath?: string, shellArgs?: string[], waitOnExit?: boolean): TPromise<number> {
		const shellLaunchConfig: IShellLaunchConfig = {
			name,
			executable: shellPath,
			args: shellArgs,
			waitOnExit,
			ignoreConfigurationCwd: true
		};
		return TPromise.as(this.terminalService.createInstance(shellLaunchConfig).id);
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

	private _onTerminalDisposed(terminalInstance: ITerminalInstance): void {
		this._proxy.$acceptTerminalClosed(terminalInstance.id);
	}

	private _onTerminalProcessIdReady(terminalInstance: ITerminalInstance): void {
		this._proxy.$acceptTerminalProcessId(terminalInstance.id, terminalInstance.processId);
	}
}
