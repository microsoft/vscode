/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Lazy } from '../utils/lazy';

export class Logger {

	private readonly output = new Lazy<vscode.LogOutputChannel>(() => {
		return vscode.window.createOutputChannel('TypeScript', { log: true });
	});

	public get logLevel(): vscode.LogLevel {
		return this.output.value.logLevel;
	}

	public info(message: string, ...args: unknown[]): void {
		this.output.value.info(message, ...args);
	}

	public trace(message: string, ...args: unknown[]): void {
		this.output.value.trace(message, ...args);
	}

	public error(message: string, data?: unknown): void {
		// See https://github.com/microsoft/TypeScript/issues/10496
		if (data && (data as { message?: string }).message === 'No content available.') {
			return;
		}
		this.output.value.error(message, ...(data ? [data] : []));
	}
}
