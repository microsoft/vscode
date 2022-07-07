/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogger } from 'vscode-markdown-languageservice';

class ConsoleLogger implements ILogger {

	public verbose(title: string, message: string, data?: any): void {
		this.appendLine(`[Verbose ${ConsoleLogger.now()}] ${title}: ${message}`);
		if (data) {
			this.appendLine(ConsoleLogger.data2String(data));
		}
	}

	private static now(): string {
		const now = new Date();
		return String(now.getUTCHours()).padStart(2, '0')
			+ ':' + String(now.getMinutes()).padStart(2, '0')
			+ ':' + String(now.getUTCSeconds()).padStart(2, '0') + '.' + String(now.getMilliseconds()).padStart(3, '0');
	}

	private appendLine(value: string): void {
		console.log(value);
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
}

export const consoleLogger = new ConsoleLogger();
