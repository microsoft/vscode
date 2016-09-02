/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import vscode = require('vscode');
import {MainContext, MainThreadTerminalServiceShape} from './extHost.protocol';

export class ExtHostTerminal implements vscode.Terminal {

	public _name: string;

	private _id: number;
	private _proxy: MainThreadTerminalServiceShape;
	private _disposed: boolean;
	private _queuedRequests: ApiRequest[] = [];

	constructor(proxy: MainThreadTerminalServiceShape, id: number, name?: string) {
		this._name = name;
		this._proxy = proxy;
		this._proxy.$createTerminal(name).then((terminalId) => {
			this._id = terminalId;
			this._queuedRequests.forEach((r) => {
				r.run(this._proxy, this._id);
			});
		});
	}

	public get name(): string {
		this._checkDisposed();
		return this._name;
	}

	public sendText(text: string, addNewLine: boolean = true): void {
		this._checkDisposed();
		let request: ApiRequest = new ApiRequest(this._proxy.$sendText, [text, addNewLine]);
		if (!this._id) {
			this._queuedRequests.push(request);
			return;
		}
		request.run(this._proxy, this._id);
	}

	public show(preserveFocus: boolean): void {
		this._checkDisposed();
		let request: ApiRequest = new ApiRequest(this._proxy.$show, [preserveFocus]);
		if (!this._id) {
			this._queuedRequests.push(request);
			return;
		}
		request.run(this._proxy, this._id);
	}

	public hide(): void {
		this._checkDisposed();
		let request: ApiRequest = new ApiRequest(this._proxy.$hide, []);
		if (!this._id) {
			this._queuedRequests.push(request);
			return;
		}
		request.run(this._proxy, this._id);
	}

	public dispose(): void {
		if (!this._disposed) {
			this._disposed = true;
			this._proxy.$dispose(this._id);
		}
	}

	private _checkDisposed() {
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

class ApiRequest {
	private _callback: (...args: any[]) => void;
	private _args: any[];

	constructor(callback: (...args: any[]) => void, args: any[]) {
		this._callback = callback;
		this._args = args;
	}

	public run(proxy: MainThreadTerminalServiceShape, id: number) {
		this._callback.apply(proxy, [id].concat(this._args));
	}
}
