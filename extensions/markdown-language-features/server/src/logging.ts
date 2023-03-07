/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogger, LogLevel } from 'vscode-markdown-languageservice';

export class LogFunctionLogger implements ILogger {

	private static now(): string {
		const now = new Date();
		return String(now.getUTCHours()).padStart(2, '0')
			+ ':' + String(now.getMinutes()).padStart(2, '0')
			+ ':' + String(now.getUTCSeconds()).padStart(2, '0') + '.' + String(now.getMilliseconds()).padStart(3, '0');
	}

	private static data2String(data: any): string {
		if (data instanceof Error) {
			if (typeof data.stack === 'string') {
				return data.stack;
			}
			return data.message;
		}
		if (typeof data === 'string') {
			return data;
		}
		return JSON.stringify(data, undefined, 2);
	}

	constructor(
		private readonly _logFn: typeof console.log
	) { }

	get level(): LogLevel {
		return LogLevel.Debug; // TODO: remove hardcoding
	}

	public log(level: LogLevel, message: string, data?: any): void {
		if (level < this.level) {
			return;
		}

		this.appendLine(`[${this.toLevelLabel(level)} ${LogFunctionLogger.now()}] ${message}`);
		if (data) {
			this.appendLine(LogFunctionLogger.data2String(data));
		}
	}

	private toLevelLabel(level: LogLevel): string {
		switch (level) {
			case LogLevel.Off: return 'Off';
			case LogLevel.Debug: return 'Debug';
			case LogLevel.Trace: return 'Trace';
		}
	}

	private appendLine(value: string): void {
		this._logFn(value);
	}
}

export const consoleLogger = new LogFunctionLogger(console.log);
