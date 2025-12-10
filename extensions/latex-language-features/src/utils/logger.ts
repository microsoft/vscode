/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class OutputChannelLogger {
	private outputChannel: vscode.OutputChannel;

	constructor(channelName: string) {
		this.outputChannel = vscode.window.createOutputChannel(channelName);
	}

	info(message: string): void {
		this.outputChannel.appendLine(`[INFO] ${message}`);
	}

	warn(message: string): void {
		this.outputChannel.appendLine(`[WARN] ${message}`);
	}

	error(message: string): void {
		this.outputChannel.appendLine(`[ERROR] ${message}`);
	}

	show(): void {
		this.outputChannel.show(true);
	}

	dispose(): void {
		this.outputChannel.dispose();
	}
}

