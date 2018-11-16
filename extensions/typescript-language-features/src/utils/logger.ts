/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { memoize } from './memoize';

const localize = nls.loadMessageBundle();

type LogLevel = 'Trace' | 'Info' | 'Error';

export default class Logger {

	@memoize
	private get output(): vscode.OutputChannel {
		return vscode.window.createOutputChannel(localize('channelName', 'TypeScript'));
	}

	private data2String(data: any): string {
		if (data instanceof Error) {
			return data.stack || data.message;
		}
		if (data.success === false && data.message) {
			return data.message;
		}
		return data.toString();
	}

	public info(message: string, data?: any): void {
		this.logLevel('Info', message, data);
	}

	public error(message: string, data?: any): void {
		// See https://github.com/Microsoft/TypeScript/issues/10496
		if (data && data.message === 'No content available.') {
			return;
		}
		this.logLevel('Error', message, data);
	}

	public logLevel(level: LogLevel, message: string, data?: any): void {
		this.output.appendLine(`[${level}  - ${(new Date().toLocaleTimeString())}] ${message}`);
		if (data) {
			this.output.appendLine(this.data2String(data));
		}
	}
}