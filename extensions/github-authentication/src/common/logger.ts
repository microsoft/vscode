/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AuthProviderType } from '../github';

type LogLevel = 'Trace' | 'Info' | 'Error';

export class Log {
	private output: vscode.OutputChannel;

	constructor(private readonly type: AuthProviderType) {
		const friendlyName = this.type === AuthProviderType.github ? 'GitHub' : 'GitHub Enterprise';
		this.output = vscode.window.createOutputChannel(`${friendlyName} Authentication`);
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

	public trace(message: string, data?: any): void {
		this.logLevel('Trace', message, data);
	}

	public info(message: string, data?: any): void {
		this.logLevel('Info', message, data);
	}

	public error(message: string, data?: any): void {
		this.logLevel('Error', message, data);
	}

	public logLevel(level: LogLevel, message: string, data?: any): void {
		this.output.appendLine(`[${level}  - ${this.now()}] ${message}`);
		if (data) {
			this.output.appendLine(this.data2String(data));
		}
	}

	private now(): string {
		const now = new Date();
		return padLeft(now.getUTCHours() + '', 2, '0')
			+ ':' + padLeft(now.getMinutes() + '', 2, '0')
			+ ':' + padLeft(now.getUTCSeconds() + '', 2, '0') + '.' + now.getMilliseconds();
	}
}

function padLeft(s: string, n: number, pad = ' ') {
	return pad.repeat(Math.max(0, n - s.length)) + s;
}
