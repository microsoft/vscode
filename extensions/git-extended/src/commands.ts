/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { PullRequestModel } from './common/models/pullRequestModel';
import { FileChangeTreeItem } from './common/treeItems';
import { ReviewManager } from './review/reviewManager';
import { TimelineEvent, EventType, CommentEvent, ReviewEvent, CommitEvent } from './common/models/timelineEvent';
const MarkdownIt = require('markdown-it');

let panel: vscode.WebviewPanel;

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

	context.subscriptions.push(vscode.commands.registerCommand('pr.openDescription', async (pr: PullRequestModel) => {
		// Create and show a new webview
		console.log(pr);
		console.log(pr.prItem);
		if (panel) {
			panel.title = `Pull Request #${pr.prNumber}`;
		} else {
			panel = vscode.window.createWebviewPanel(
				'pullRequestDescription', // Identifies the type of the webview. Used internally
				`Pull Request #${pr.prNumber}`, // Title of the panel displayed to the user
				vscode.ViewColumn.One, // Editor column to show the new webview panel in.
				{} // Webview options. More on these later.
			);
		}

		panel.webview.html = await getWebviewContent(pr);
	}));

	let md = new MarkdownIt();


	async function getWebviewContent(pr: PullRequestModel) {
		const timelineEvents = await pr.getTimelineEvents();
		return `<!DOCTYPE html>
	<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>Pull Request</title>
		<style>
			.title {
				display: flex;
				align-items: flex-start;
				margin-top: 10px;
			}

			h3 {
				margin: 0;
			}

			body hr {
				display: block;
				height: 1px;
				border: 0;
				border-top: 1px solid #555;
				margin: 0 !important;
				padding: 0;

			}
			body .review-comment {
				padding: 20px;
				display: flex;
			}

			body .review-comment .avatar-container {
				margin-top: 4px !important;
			}

			body img.avatar {
				height: 28px;
				width: 28px;
				max-width: 28px;
				max-height: 28px;
				display: inline-block;
				overflow: hidden;
				line-height: 1;
				vertical-align: middle;
				border-radius: 3px;
				border-style: none;
				margin-right: 5px;
			}

			body .review-comment .review-comment-contents {
				margin-left: 20px;
			}

			body {
				margin: auto;
				width: 100%;
				max-width: 1200px;
			}

			.prIcon {
				display: flex;
				border-radius: 10px;
				margin-right: 5px;
				margin-top: 18px;
			}

			.status {
				display: inline-block;
				height: 28px;
				box-sizing: border-box;
				line-height: 20px;
				background-color: ${getStatusBGCoor(pr)};
				border-radius: 3px;
				color: white;
				padding: 4px 8px;
				margin-right: 5px;
			}

			.details {
				display: flex;
				flex-direction: column;
			}

		</style>
	</head>
	<body>
		<div class="title">
			<div class="prIcon"><svg width="64" height="64" class="octicon octicon-git-compare" viewBox="0 0 14 16" version="1.1" aria-hidden="true"><path fill="#FFFFFF" fill-rule="evenodd" d="M5 12H4c-.27-.02-.48-.11-.69-.31-.21-.2-.3-.42-.31-.69V4.72A1.993 1.993 0 0 0 2 1a1.993 1.993 0 0 0-1 3.72V11c.03.78.34 1.47.94 2.06.6.59 1.28.91 2.06.94h1v2l3-3-3-3v2zM2 1.8c.66 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2C1.35 4.2.8 3.65.8 3c0-.65.55-1.2 1.2-1.2zm11 9.48V5c-.03-.78-.34-1.47-.94-2.06-.6-.59-1.28-.91-2.06-.94H9V0L6 3l3 3V4h1c.27.02.48.11.69.31.21.2.3.42.31.69v6.28A1.993 1.993 0 0 0 12 15a1.993 1.993 0 0 0 1-3.72zm-1 2.92c-.66 0-1.2-.55-1.2-1.2 0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2z"></path></svg></div>
			<div class="details">
				<div>
					<h2>${pr.title} (<a href=${pr.html_url}>#${pr.prNumber}</a>) </h2>
				</div>
				<div>
					<div class="status">${getStatus(pr)}</div>
					<img class="avatar" src="${pr.prItem.user.avatar_url}">
					<strong class="author"><a href="${pr.prItem.user.html_url}">${pr.prItem.user.login}</a></strong>
				</div>
				<div class="comment-body">
					${md.render(pr.prItem.body)}
				</div>
			</div>
		</div>
		<div class="discussion">

			${timelineEvents.map(renderTimelineEvent).join('')}
		</div>
	</body>
	</html>`;
	}

	function getStatusBGCoor(pr: PullRequestModel) {
		if (pr.isMerged) {
			return '#6f42c1';
		} else if (pr.isOpen) {
			return '#2cbe4e';
		} else {
			return '#cb2431';
		}
	}

	function getStatus(pr: PullRequestModel) {
		if (pr.isMerged) {
			return 'Merged';
		} else if (pr.isOpen) {
			return 'Open';
		} else {
			return 'Closed';
		}
	}

	function renderComment(user: any, body: string): string {
		return `<hr><div class="comment-container">

		<div class="review-comment" tabindex="0" role="treeitem">
			<div class="avatar-container">
				<img class="avatar" src="${user.avatar_url}">
			</div>
			<div class="review-comment-contents">
				<div>
					<strong class="author"><a href="${user.html_url}">${user.login}</a></strong>
				</div>
				<div class="comment-body">
					${md.render(body)}
				</div>
			</div>
		</div>
	</div>`;
	}

	function renderCommit(timelineEvent: CommitEvent): string {
		return `<hr><div class="comment-container">

		<div class="review-comment" tabindex="0" role="treeitem">
			<div class="review-comment-contents">
				<div>
					<strong>${timelineEvent.author.name} commit: <a href="${timelineEvent.html_url}">${timelineEvent.message} (${timelineEvent.sha})</a></strong>
				</div>
			</div>
		</div>
	</div>`;
	}

	function renderReview(timelineEvent: ReviewEvent): string {
		return `<hr><div class="comment-container">

		<div class="review-comment" tabindex="0" role="treeitem">
			<div class="review-comment-contents">
				<div>
					<strong><a href="${timelineEvent.html_url}">${timelineEvent.user.login} left a review.</a></strong><span></span>
				</div>
			</div>
		</div>
	</div>`;
	}

	function renderTimelineEvent(timelineEvent: TimelineEvent): string {
		switch (timelineEvent.event) {
			case EventType.Committed:
				return renderCommit((<CommitEvent>timelineEvent));
			case EventType.Commented:
				return renderComment((<CommentEvent>timelineEvent).user, (<CommentEvent>timelineEvent).body);
			case EventType.Reviewed:
				return renderReview((<ReviewEvent>timelineEvent));
		}
		return '';
	}
}
