/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OutputChannel, window } from 'vscode';
import * as is from './is';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

export default class Logger {
	private _output: OutputChannel;

	private get output(): OutputChannel {
		if (!this._output) {
			this._output = window.createOutputChannel(localize('channelName', 'TypeScript'));
		}
		return this._output;
	}

	private data2String(data: any): string {
		if (data instanceof Error) {
			if (is.string(data.stack)) {
				return data.stack;
			}
			return (data as Error).message;
		}
		if (is.boolean(data.success) && !data.success && is.string(data.message)) {
			return data.message;
		}
		if (is.string(data)) {
			return data;
		}
		return data.toString();
	}

	public info(message: string, data?: any): void {
		this.logLevel('Info', message, data);
	}

	public warn(message: string, data?: any): void {
		this.logLevel('Warn', message, data);
	}

	public error(message: string, data?: any): void {
		// See https://github.com/Microsoft/TypeScript/issues/10496
		if (data && data.message === 'No content available.') {
			return;
		}
		this.logLevel('Error', message, data);
	}

	public logLevel(level: string, message: string, data?: any): void {
		this.output.appendLine(`[${level}  - ${(new Date().toLocaleTimeString())}] ${message}`);
		if (data) {
			this.output.appendLine(this.data2String(data));
		}
	}
}