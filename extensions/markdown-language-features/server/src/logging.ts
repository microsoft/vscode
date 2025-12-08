/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as md from 'vscode-markdown-languageservice';
import { ConfigurationManager } from './configuration';
import { Disposable } from './util/dispose';

export class LogFunctionLogger extends Disposable implements md.ILogger {

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

	private _logLevel: md.LogLevel;

	constructor(
		private readonly _logFn: typeof console.log,
		private readonly _config: ConfigurationManager,
	) {
		super();

		this._register(this._config.onDidChangeConfiguration(() => {
			this._logLevel = LogFunctionLogger.readLogLevel(this._config);
		}));

		this._logLevel = LogFunctionLogger.readLogLevel(this._config);
	}

	private static readLogLevel(config: ConfigurationManager): md.LogLevel {
		switch (config.getSettings()?.markdown.server.log) {
			case 'trace': return md.LogLevel.Trace;
			case 'debug': return md.LogLevel.Debug;
			case 'off':
			default:
				return md.LogLevel.Off;
		}
	}

	get level(): md.LogLevel { return this._logLevel; }

	public log(level: md.LogLevel, message: string, data?: any): void {
		if (this.level < level) {
			return;
		}

		this.appendLine(`[${this.toLevelLabel(level)} ${LogFunctionLogger.now()}] ${message}`);
		if (data) {
			this.appendLine(LogFunctionLogger.data2String(data));
		}
	}

	private toLevelLabel(level: md.LogLevel): string {
		switch (level) {
			case md.LogLevel.Off: return 'Off';
			case md.LogLevel.Debug: return 'Debug';
			case md.LogLevel.Trace: return 'Trace';
		}
	}

	private appendLine(value: string): void {
		this._logFn(value);
	}
}
