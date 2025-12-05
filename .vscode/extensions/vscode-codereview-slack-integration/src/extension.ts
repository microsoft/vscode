/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SlackTreeDataProvider } from './slackTreeDataProvider';
import { SlackService } from './slackService';
import { SlackAuthenticationProvider } from './slackAuthenticationProvider';
import { registerCommands } from './commands';

export function activate(context: vscode.ExtensionContext) {

	// Register the Slack authentication provider
	const slackAuthProvider = new SlackAuthenticationProvider(context);
	context.subscriptions.push(slackAuthProvider);

	// Create the Slack service
	const slackService = new SlackService(context);

	// Create and register the Slack messages tree data provider
	const slackTreeDataProvider = new SlackTreeDataProvider(slackService);
	const treeView = vscode.window.createTreeView('codereview-slack-messages', { treeDataProvider: slackTreeDataProvider });
	context.subscriptions.push(treeView);

	// Update badge when message count changes
	slackTreeDataProvider.setOnMessageCountChanged((count) => {
		treeView.badge = count > 0 ? { value: count, tooltip: `${count} code review message${count !== 1 ? 's' : ''}` } : undefined;
	});

	registerCommands(context, slackService, slackTreeDataProvider);

	// Listen for authentication session changes
	context.subscriptions.push(
		vscode.authentication.onDidChangeSessions(async (e) => {
			if (e.provider.id === 'slack') {
				slackTreeDataProvider.refresh();
				// Auto-fetch messages if authenticated (channel is auto-discovered)
				const isAuthenticated = await slackService.isAuthenticated();
				if (isAuthenticated) {
					await slackTreeDataProvider.fetchMessages();
				}
			}
		})
	);

	// Auto-fetch messages if already authenticated (channel is auto-discovered)
	(async () => {
		const isAuthenticated = await slackService.isAuthenticated();
		if (isAuthenticated) {
			await slackTreeDataProvider.fetchMessages();
		}
	})();

	// Auto-refresh messages every 60 seconds
	const REFRESH_INTERVAL_MS = 60 * 1000; // 1 minute
	const autoRefreshInterval = setInterval(async () => {
		const isAuthenticated = await slackService.isAuthenticated();
		if (isAuthenticated) {
			await slackTreeDataProvider.fetchMessages();
		}
	}, REFRESH_INTERVAL_MS);

	// Clean up the interval when the extension is deactivated
	context.subscriptions.push({
		dispose: () => clearInterval(autoRefreshInterval)
	});
}

export function deactivate() { }
