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

	private _proxy: MainThreadTerminalServiceShape;

	constructor(proxy: MainThreadTerminalServiceShape, name?: string) {
		this.name = name;
		this._proxy = proxy;
	}
}

export class ExtHostTerminalService {

	private _proxy: MainThreadTerminalServiceShape;

	constructor(threadService: IThreadService) {
		this._proxy = threadService.get(MainContext.MainThreadTerminalService);
	}

	createTerminal(name?: string): vscode.Terminal {
		return new ExtHostTerminal(this._proxy, name);
	}
}
