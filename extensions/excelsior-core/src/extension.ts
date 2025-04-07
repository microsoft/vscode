/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Logger } from './logger'; // Import the Logger
/**
 * This method is called when your extension is activated.
 * Your extension is activated the very first time the command is executed.
 * Or, as specified in package.json, on 'onStartupFinished'.
 */
export function activate(context: vscode.ExtensionContext) {
	// Triggering watch process

	Logger.initialize(context); // Initialize the logger
	Logger.logInfo('Extension "excelsior-core" activating...');

	// Read configuration
	const config = vscode.workspace.getConfiguration('excelsiorAi.core');
	const enableExperimental = config.get<boolean>('enableExperimentalFeatures');
	Logger.logInfo(`Experimental features are ${enableExperimental ? 'ENABLED' : 'DISABLED'}`);

	// Example: Register a simple command
	let disposable = vscode.commands.registerCommand('excelsior-core.helloWorld', () => {
		Logger.logInfo('helloWorld command executed.');
		// We can decide later if we want to show the output channel automatically on command execution
		// Logger.showOutputChannel(); // Example if we add a show method to Logger
		vscode.window.showInformationMessage('Hello World command logged to Excelsior AI Log!'); // Keep simple feedback for now
	}); // Correctly closing the registerCommand callback

	context.subscriptions.push(disposable);

	// TODO: Initialize core framework components here
	// - Configuration management
	// - Event bus
	// - Logging service
	// - Telemetry service (opt-in)
	// - Status bar integration
}

/**
 * This method is called when your extension is deactivated.
 */
export function deactivate() {
	Logger.logInfo('Extension "excelsior-core" deactivating...');
	Logger.dispose(); // Dispose the logger resources if necessary (though channel is handled by context)
	// TODO: Clean up other resources here
}
