/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { PullRequestModel } from './common/models/pullRequestModel';
import { FileChangeTreeItem } from './common/treeItems';
import { ReviewManager } from './review/reviewManager';
import { PullRequestOverviewPanel } from './common/pullRequestOverview';

export function registerCommands(context: vscode.ExtensionContext) {
	// initialize resources
	context.subscriptions.push(vscode.commands.registerCommand('pr.openInGitHub', (e: PullRequestModel | FileChangeTreeItem) => {
		if (!e) {
			if (ReviewManager.instance.currentPullRequest) {
				vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(ReviewManager.instance.currentPullRequest.html_url));
			}
			return;
		}
		if (e instanceof PullRequestModel) {
			vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(e.html_url));
		} else {
			vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(e.blobUrl));
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('pr.pick', async (pr: PullRequestModel) => {
		vscode.window.withProgress({
			location: vscode.ProgressLocation.SourceControl,
			title: `Switching to Pull Request #${pr.prNumber}`,
		}, async (progress, token) => {
			await ReviewManager.instance.switch(pr);
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('pr.close', async (pr: PullRequestModel) => {
		vscode.window.showWarningMessage(`Are you sure you want to close PR`, 'Yes', 'No').then(async value => {
			if (value === 'Yes') {
				let newPR = await pr.close();
				return newPR;
			}

			return null;
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('pr.openDescription', async (pr: PullRequestModel) => {
		// Create and show a new webview
		PullRequestOverviewPanel.createOrShow(context.extensionPath, pr);
	}));
}
