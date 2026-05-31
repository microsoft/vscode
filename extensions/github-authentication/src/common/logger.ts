/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AuthProviderType } from '../github';

export class Log {
	private output: vscode.LogOutputChannel;

	constructor(private readonly type: AuthProviderType) {
		const friendlyName = this.type === AuthProviderType.github ? 'GitHub' : 'GitHub Enterprise';
		this.output = vscode.window.createOutputChannel(`${friendlyName} Authentication`, { log: true });
	}

	public trace(message: string): void {
		this.output.trace(message);
	}

	public debug(message: string): void {
		this.output.debug(message);
	}

	public info(message: string): void {
		this.output.info(message);
	}

	public error(message: string): void {
		this.output.error(message);
	}

	public warn(message: string): void {
		this.output.warn(message);
	}
}
