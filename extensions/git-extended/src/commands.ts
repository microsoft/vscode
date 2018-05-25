/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { PullRequestModel } from './models/pullRequestModel';
import { ReviewManager } from './review/reviewManager';
import { PullRequestOverviewPanel } from './common/pullRequestOverview';
import { fromGitUri } from './common/uri';
import { PRFileChangeNode } from './tree/prFileChangeNode';
import { PRNode } from './tree/prNode';

export function registerCommands(context: vscode.ExtensionContext) {
	// initialize resources
	context.subscriptions.push(vscode.commands.registerCommand('pr.openInGitHub', (e: PRNode | PRFileChangeNode) => {
		if (!e) {
			if (ReviewManager.instance.currentPullRequest) {
				vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(ReviewManager.instance.currentPullRequest.html_url));
			}
			return;
		}
		if (e instanceof PRNode) {
			vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(e.element.html_url));
		} else {
			vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(e.blobUrl));
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('pr.pick', async (pr: PRNode) => {
		vscode.window.withProgress({
			location: vscode.ProgressLocation.SourceControl,
			title: `Switching to Pull Request #${pr.element.prNumber}`,
		}, async (progress, token) => {
			await ReviewManager.instance.switch(pr.element);
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('pr.close', async (pr: PRNode) => {
		vscode.window.showWarningMessage(`Are you sure you want to close PR`, 'Yes', 'No').then(async value => {
			if (value === 'Yes') {
				let newPR = await pr.element.close();
				return newPR;
			}

			return null;
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('pr.openDescription', async (pr: PullRequestModel) => {
		// Create and show a new webview
		PullRequestOverviewPanel.createOrShow(context.extensionPath, pr);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('pr.viewChanges', async (fileChange: PRFileChangeNode) => {
		// Show the file change in a diff view.
		let { path, ref, commit } = fromGitUri(fileChange.filePath);
		let previousCommit = `${commit}^`;
		let previousFileUri = fileChange.filePath.with({
			query: JSON.stringify({
				path: path,
				ref: ref,
				commit: previousCommit
			})
		});
		return vscode.commands.executeCommand('vscode.diff', previousFileUri, fileChange.filePath, `${fileChange.fileName} from ${commit.substr(0, 8)}`);
	}));
}
