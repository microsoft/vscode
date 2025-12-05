/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SlackTreeDataProvider } from './slackTreeDataProvider';
import { SlackService } from './slackService';
import { SlackAuthenticationProvider } from './slackAuthenticationProvider';
import { SlackCommandsRegistry } from './commands';
import { SlackSessionManager } from './session';
import { SlackView } from './view';


export function activate(context: vscode.ExtensionContext) {

	// Create the Slack service
	const slackService = new SlackService(context);
	// Create and register the Slack messages tree data provider
	const slackTreeDataProvider = new SlackTreeDataProvider(slackService);

	context.subscriptions.push(new SlackAuthenticationProvider(context));
	context.subscriptions.push(new SlackView(slackTreeDataProvider));
	context.subscriptions.push(new SlackCommandsRegistry(slackService, slackTreeDataProvider));
	context.subscriptions.push(new SlackSessionManager(slackService, slackTreeDataProvider));
}

export function deactivate() { }
