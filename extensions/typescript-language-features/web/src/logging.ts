/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type * as ts from 'typescript/lib/tsserverlibrary';

/**
 * Matches the ts.server.LogLevel enum
 */
export enum LogLevel {
	terse = 0,
	normal = 1,
	requestTime = 2,
	verbose = 3,
}

export class Logger {
	public readonly tsLogger: ts.server.Logger;

	constructor(logLevel: LogLevel | undefined) {
		const doLog = typeof logLevel === 'undefined'
			? (_message: string) => { }
			: (message: string) => { postMessage({ type: 'log', body: message }); };

		this.tsLogger = {
			close: () => { },
			hasLevel: level => typeof logLevel === 'undefined' ? false : level <= logLevel,
			loggingEnabled: () => true,
			perftrc: () => { },
			info: doLog,
			msg: doLog,
			startGroup: () => { },
			endGroup: () => { },
			getLogFileName: () => undefined
		};
	}

	log(level: LogLevel, message: string, data?: any) {
		if (this.tsLogger.hasLevel(level)) {
			this.tsLogger.info(message + (data ? ' ' + JSON.stringify(data) : ''));
		}
	}

	logNormal(message: string, data?: any) {
		this.log(LogLevel.normal, message, data);
	}

	logVerbose(message: string, data?: any) {
		this.log(LogLevel.verbose, message, data);
	}
}

export function parseLogLevel(input: string | undefined): LogLevel | undefined {
	switch (input) {
		case 'normal': return LogLevel.normal;
		case 'terse': return LogLevel.terse;
		case 'verbose': return LogLevel.verbose;
		default: return undefined;
	}
}
