/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from './util/dispose';


export interface ILogger {
	verbose(message: string, ...args: any[]): void;
}

export class VsCodeOutputLogger extends Disposable implements ILogger {
	private _outputChannelValue?: vscode.LogOutputChannel;

	private get _outputChannel() {
		this._outputChannelValue ??= vscode.window.createOutputChannel('TypeScript', { log: true });
		return this._outputChannelValue;
	}

	constructor() {
		super();
	}

	public verbose(message: string, ...args: any[]): void {
		if (this._outputChannel.logLevel === vscode.LogLevel.Trace) {
			this._outputChannel.trace(message, ...args);
		}
	}
}
