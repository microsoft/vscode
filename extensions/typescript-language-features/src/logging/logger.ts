/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { memoize } from '../utils/memoize';

export class Logger {

	@memoize
	private get output(): vscode.LogOutputChannel {
		return vscode.window.createOutputChannel('TypeScript', { log: true });
	}

	public get logLevel(): vscode.LogLevel {
		return this.output.logLevel;
	}

	public info(message: string, ...args: any[]): void {
		this.output.info(message, ...args);
	}

	public trace(message: string, ...args: any[]): void {
		this.output.trace(message, ...args);
	}

	public error(message: string, data?: any): void {
		// See https://github.com/microsoft/TypeScript/issues/10496
		if (data && data.message === 'No content available.') {
			return;
		}
		this.output.error(message, ...(data ? [data] : []));
	}
}
