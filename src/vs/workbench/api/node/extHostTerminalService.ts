/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import vscode = require('vscode');
import {MainContext, MainThreadTerminalServiceShape} from './extHost.protocol';

export class ExtHostTerminal implements vscode.Terminal {

	public name: string;

	private _id: number;
	private _proxy: MainThreadTerminalServiceShape;
	private _disposed: boolean;

	constructor(proxy: MainThreadTerminalServiceShape, id: number, name?: string) {
		this.name = name;
		this._proxy = proxy;
		this._proxy.$createTerminal(name).then((terminalId) => {
			this._id = terminalId;
		});
	}

	public sendText(text: string, addNewLine: boolean = true): void {
		this.checkId();
		this.checkDisposed();
		this._proxy.$sendText(this._id, text, addNewLine);
	}

	public show(preserveFocus: boolean): void {
		this.checkId();
		this.checkDisposed();
		this._proxy.$show(this._id, preserveFocus);
	}

	public hide(): void {
		this.checkId();
		this.checkDisposed();
		this._proxy.$hide(this._id);
	}

	public dispose(): void {
		this.checkId();
		if (!this._disposed) {
			this._disposed = true;
			this._proxy.$dispose(this._id);
		}
	}

	private checkId() {
		if (!this._id) {
			throw new Error('Terminal has not been initialized yet');
		}
	}

	private checkDisposed() {
		if (this._disposed) {
			throw new Error('Terminal has already been disposed');
		}
	}
}

export class ExtHostTerminalService {

	private _proxy: MainThreadTerminalServiceShape;

	constructor(threadService: IThreadService) {
		this._proxy = threadService.get(MainContext.MainThreadTerminalService);
	}

	public createTerminal(name?: string): vscode.Terminal {
		return new ExtHostTerminal(this._proxy, -1, name);
	}
}
