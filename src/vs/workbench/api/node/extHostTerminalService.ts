/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import vscode = require('vscode');
import {MainContext, MainThreadTerminalServiceShape} from './extHost.protocol';

export class ExtHostTerminal implements vscode.Terminal {

	private _name: string;
	private _id: number;
	private _proxy: MainThreadTerminalServiceShape;
	private _disposed: boolean;
	private _queuedRequests: ApiRequest[] = [];

	constructor(proxy: MainThreadTerminalServiceShape, name?: string, shellPath?: string, shellArgs?: string[]) {
		this._name = name;
		this._proxy = proxy;
		this._proxy.$createTerminal(name, shellPath, shellArgs).then((id) => {
			this._id = id;
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
		this._queueApiRequest(this._proxy.$sendText, [text, addNewLine]);
	}

	public show(preserveFocus: boolean): void {
		this._checkDisposed();
		this._queueApiRequest(this._proxy.$show, [preserveFocus]);
	}

	public hide(): void {
		this._checkDisposed();
		this._queueApiRequest(this._proxy.$hide, []);
	}

	public dispose(): void {
		if (!this._disposed) {
			this._disposed = true;
			this._queueApiRequest(this._proxy.$dispose, []);
		}
	}

	private _queueApiRequest(callback: (...args: any[]) => void, args: any[]) {
		let request: ApiRequest = new ApiRequest(callback, args);
		if (!this._id) {
			this._queuedRequests.push(request);
			return;
		}
		request.run(this._proxy, this._id);
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

	public createTerminal(name?: string, shellPath?: string, shellArgs?: string[]): vscode.Terminal {
		return new ExtHostTerminal(this._proxy, name, shellPath, shellArgs);
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