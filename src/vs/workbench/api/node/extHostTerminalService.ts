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

	constructor(proxy: MainThreadTerminalServiceShape, id: number, name?: string) {
		this._name = name;
		this._proxy = proxy;
		this._id = this._proxy.$createTerminal(name);
	}

	public get name(): string {
		this._checkDisposed();
		return this._name;
	}

	public sendText(text: string, addNewLine: boolean = true): void {
		this._checkDisposed();
		this._proxy.$sendText(this._id, text, addNewLine);
	}

	public show(preserveFocus: boolean): void {
		this._checkDisposed();
		this._proxy.$show(this._id, preserveFocus);
	}

	public hide(): void {
		this._checkDisposed();
		this._proxy.$hide(this._id);
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
