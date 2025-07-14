/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from './util/dispose';


export interface ILogger {
	trace(title: string, message: string, data?: any): void;
}

export class VsCodeOutputLogger extends Disposable implements ILogger {
	private _outputChannelValue?: vscode.LogOutputChannel;

	private get _outputChannel() {
		this._outputChannelValue ??= this._register(vscode.window.createOutputChannel('Markdown', { log: true }));
		return this._outputChannelValue;
	}

	constructor() {
		super();
	}

	public trace(title: string, message: string, data?: any): void {
		this._outputChannel.trace(`${title}: ${message}`, ...(data ? [JSON.stringify(data, null, 4)] : []));
	}
}
