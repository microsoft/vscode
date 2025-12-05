/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SlackTreeDataProvider } from './slackTreeDataProvider';
import { SlackService } from './slackService';
import { SlackAuthenticationProvider } from './slackAuthenticationProvider';
import { registerCommands } from './commands';
import { SessionManager } from './session';
import { View } from './view';


export function activate(context: vscode.ExtensionContext) {

	// Register the Slack authentication provider
	const slackAuthProvider = new SlackAuthenticationProvider(context);
	context.subscriptions.push(slackAuthProvider);

	// Create the Slack service
	const slackService = new SlackService(context);

	// Create and register the Slack messages tree data provider
	const slackTreeDataProvider = new SlackTreeDataProvider(slackService);

	context.subscriptions.push(...registerCommands(slackService, slackTreeDataProvider));

	context.subscriptions.push(new View(slackTreeDataProvider));
	context.subscriptions.push(new SessionManager(slackService, slackTreeDataProvider));
}

export function deactivate() { }
