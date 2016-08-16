/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import vscode = require('vscode');
import {MainContext, MainThreadTerminalServiceShape} from './extHost.protocol';

export class ExtHostTerminal implements vscode.Terminal {

	public name: string;

	private _id: number;
	private _proxy: MainThreadTerminalServiceShape;

	constructor(proxy: MainThreadTerminalServiceShape, id: number, name?: string) {
		this.name = name;
		this._id = id;
		this._proxy = proxy;
	}

	public sendText(text: string, addNewLine: boolean = true) {
		this._proxy.$sendText(this._id, text, addNewLine);
	}

	public show(preserveFocus: boolean): void {
		this._proxy.$show(this._id, preserveFocus);
	}

	public hide(): void {
		// TODO: Implement
	}

	public dispose(): void {
		// TODO: Implement
	}
}

export class ExtHostTerminalService {

	private _proxy: MainThreadTerminalServiceShape;

	constructor(threadService: IThreadService) {
		this._proxy = threadService.get(MainContext.MainThreadTerminalService);
	}

	public createTerminal(name?: string): TPromise<vscode.Terminal> {
		return this._proxy.$createTerminal(name).then((terminalId) => {
			return new ExtHostTerminal(this._proxy, terminalId, name);
		});
	}
}
