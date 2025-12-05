/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SlackTreeDataProvider, SlackMessageItem } from './slackTreeDataProvider';
import { SlackService } from './slackService';
import { SlackAuthenticationProvider } from './slackAuthenticationProvider';

export function activate(context: vscode.ExtensionContext) {

	// Register the Slack authentication provider
	const slackAuthProvider = new SlackAuthenticationProvider(context);
	context.subscriptions.push(slackAuthProvider);

	// Create the Slack service
	const slackService = new SlackService(context);

	// Create and register the Slack messages tree data provider
	const slackTreeDataProvider = new SlackTreeDataProvider(slackService);
	const treeView = vscode.window.createTreeView('codereview-slack-messages', {
		treeDataProvider: slackTreeDataProvider,
		showCollapseAll: true
	});
	context.subscriptions.push(treeView);

	// Update badge when message count changes
	slackTreeDataProvider.setOnMessageCountChanged((count) => {
		treeView.badge = count > 0 ? { value: count, tooltip: `${count} code review message${count !== 1 ? 's' : ''}` } : undefined;
	});

	// Register sign in command
	const signInCommand = vscode.commands.registerCommand('vs-code-codereview.signIn', async () => {
		const success = await slackService.signIn();
		if (success) {
			slackTreeDataProvider.refresh();
		}
	});
	context.subscriptions.push(signInCommand);

	// Register sign out command
	const signOutCommand = vscode.commands.registerCommand('vs-code-codereview.signOut', async () => {
		await slackService.signOut();
		slackTreeDataProvider.refresh();
	});
	context.subscriptions.push(signOutCommand);

	// Register refresh command
	const refreshCommand = vscode.commands.registerCommand('vs-code-codereview.refreshMessages', async () => {
		await slackTreeDataProvider.fetchMessages();
	});
	context.subscriptions.push(refreshCommand);

	// Register open PR locally command
	const openPrLocallyCommand = vscode.commands.registerCommand('vs-code-codereview.openPrLocally', async (item: SlackMessageItem) => {
		if (!item || !item.message.prOwner || !item.message.prRepo || !item.message.prNumber) {
			vscode.window.showWarningMessage('No PR information available for this item');
			return;
		}

		// Show loading state
		slackTreeDataProvider.setLoadingPr(item.message.id);

		try {
			const params = {
				owner: item.message.prOwner,
				repo: item.message.prRepo,
				pullRequestNumber: item.message.prNumber
			};
			const encodedParams = encodeURIComponent(JSON.stringify(params));
			const uri = await vscode.env.asExternalUri(
				vscode.Uri.parse(`${vscode.env.uriScheme}://github.vscode-pull-request-github/open-pull-request-webview?${encodedParams}&`)
			);
			await vscode.env.openExternal(uri);
		} catch (error) {
			console.error('Failed to open pull request:', error);
			vscode.window.showErrorMessage(`Failed to open PR #${item.message.prNumber}: ${error}`);
		} finally {
			// Clear loading state after a delay to give time for the PR view to open
			setTimeout(() => {
				slackTreeDataProvider.setLoadingPr(undefined);
			}, 2000);
		}
	});
	context.subscriptions.push(openPrLocallyCommand);

	// Register open PR in browser command
	const openPrInBrowserCommand = vscode.commands.registerCommand('vs-code-codereview.openPrInBrowser', async (item: SlackMessageItem) => {
		if (!item || !item.message.prUrl) {
			vscode.window.showWarningMessage('No PR URL available for this item');
			return;
		}

		try {
			await vscode.env.openExternal(vscode.Uri.parse(item.message.prUrl));
		} catch (error) {
			console.error('Failed to open PR in browser:', error);
			vscode.window.showErrorMessage(`Failed to open PR in browser: ${error}`);
		}
	});
	context.subscriptions.push(openPrInBrowserCommand);

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
