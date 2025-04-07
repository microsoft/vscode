/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

export class Logger {
	public static initialize(context: vscode.ExtensionContext) {
		if (!outputChannel) {
			outputChannel = vscode.window.createOutputChannel("Excelsior AI Log");
			context.subscriptions.push(outputChannel); // Ensure channel is disposed on deactivation
			this.logInfo("Logger initialized.");
		}
	}

	public static logInfo(message: string) {
		if (outputChannel) {
			const timestamp = new Date().toISOString();
			outputChannel.appendLine(`[INFO ${timestamp}] ${message}`);
		} else {
			console.warn("Excelsior Logger not initialized. Message:", message);
		}
	}

	public static logWarning(message: string) {
		if (outputChannel) {
			const timestamp = new Date().toISOString();
			outputChannel.appendLine(`[WARN ${timestamp}] ${message}`);
			outputChannel.show(true); // Show warnings automatically
		} else {
			console.warn("Excelsior Logger not initialized. Warning:", message);
		}
	}

	public static logError(message: string, error?: any) {
		if (outputChannel) {
			const timestamp = new Date().toISOString();
			outputChannel.appendLine(`[ERROR ${timestamp}] ${message}`);
			if (error) {
				if (error instanceof Error) {
					outputChannel.appendLine(`[ERROR ${timestamp}] Details: ${error.message}`);
					if (error.stack) {
						outputChannel.appendLine(`[ERROR ${timestamp}] Stack: ${error.stack}`);
					}
				} else {
					outputChannel.appendLine(`[ERROR ${timestamp}] Details: ${JSON.stringify(error)}`);
				}
			}
			outputChannel.show(true); // Show errors automatically
		} else {
			console.error("Excelsior Logger not initialized. Error:", message, error);
		}
	}

	public static dispose() {
		// Output channel is disposed via context.subscriptions
		outputChannel = undefined;
	}
}
