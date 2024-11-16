/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LogLevel as MsalLogLevel } from '@azure/msal-node';
import { env, LogLevel, LogOutputChannel } from 'vscode';

export class MsalLoggerOptions {
	piiLoggingEnabled = false;

	constructor(private readonly _output: LogOutputChannel) { }

	get logLevel(): MsalLogLevel {
		return this._toMsalLogLevel(env.logLevel);
	}

	loggerCallback(level: MsalLogLevel, message: string, containsPii: boolean): void {
		if (containsPii) {
			return;
		}

		switch (level) {
			case MsalLogLevel.Error:
				this._output.error(message);
				return;
			case MsalLogLevel.Warning:
				this._output.warn(message);
				return;
			case MsalLogLevel.Info:
				this._output.info(message);
				return;
			case MsalLogLevel.Verbose:
				this._output.debug(message);
				return;
			case MsalLogLevel.Trace:
				this._output.trace(message);
				return;
			default:
				this._output.info(message);
				return;
		}
	}

	private _toMsalLogLevel(logLevel: LogLevel): MsalLogLevel {
		switch (logLevel) {
			case LogLevel.Trace:
				return MsalLogLevel.Trace;
			case LogLevel.Debug:
				return MsalLogLevel.Verbose;
			case LogLevel.Info:
				return MsalLogLevel.Info;
			case LogLevel.Warning:
				return MsalLogLevel.Warning;
			case LogLevel.Error:
				return MsalLogLevel.Error;
			default:
				return MsalLogLevel.Info;
		}
	}
}
