/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SlackTreeDataProvider } from './treeDataProvider';
import { SlackService } from './service';
import { SlackAuthenticationProvider } from './authProvider';
import { SlackCommandsRegistry } from './commands';
import { SlackView } from './view';


export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(new SlackAuthenticationProvider(context));
	const slackService = new SlackService(context);
	const slackTreeDataProvider = new SlackTreeDataProvider(slackService);
	context.subscriptions.push(new SlackView(slackTreeDataProvider));
	context.subscriptions.push(new SlackCommandsRegistry(slackService, slackTreeDataProvider));
}

export function deactivate() { }
