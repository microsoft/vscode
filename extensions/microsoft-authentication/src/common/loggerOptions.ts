/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LogLevel as MsalLogLevel } from '@azure/msal-node';
import { env, LogLevel, LogOutputChannel } from 'vscode';
import { MicrosoftAuthenticationTelemetryReporter } from './telemetryReporter';

export class MsalLoggerOptions {
	piiLoggingEnabled = false;

	constructor(
		private readonly _output: LogOutputChannel,
		private readonly _telemtryReporter: MicrosoftAuthenticationTelemetryReporter
	) { }

	get logLevel(): MsalLogLevel {
		return this._toMsalLogLevel(env.logLevel);
	}

	loggerCallback(level: MsalLogLevel, message: string, containsPii: boolean): void {
		if (containsPii) {
			// TODO: Should we still log the message if it contains PII? It's just going to
			// an output channel that doesn't leave the machine.
			this._output.debug('Skipped logging message because it may contain PII');
			return;
		}

		// Log to output channel one level lower than the MSAL log level
		switch (level) {
			case MsalLogLevel.Error:
				this._output.error(message);
				this._telemtryReporter.sendTelemetryErrorEvent(message);
				return;
			case MsalLogLevel.Warning:
				this._output.warn(message);
				return;
			case MsalLogLevel.Info:
				this._output.debug(message);
				return;
			case MsalLogLevel.Verbose:
				this._output.trace(message);
				return;
			case MsalLogLevel.Trace:
				// Do not log trace messages
				return;
			default:
				this._output.debug(message);
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
