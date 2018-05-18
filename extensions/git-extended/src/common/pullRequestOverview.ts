/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { PullRequestModel } from './models/pullRequestModel';

const MarkdownIt = require('markdown-it');

export class PullRequestOverviewPanel {
	/**
	 * Track the currently panel. Only allow a single panel to exist at a time.
	 */
	public static currentPanel: PullRequestOverviewPanel | undefined;

	private static readonly viewType = 'PullRequestOverview';

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionPath: string;
	private _disposables: vscode.Disposable[] = [];
	private _pullRequest: PullRequestModel;
	private _md = MarkdownIt();

	public static createOrShow(extensionPath: string, pullRequestModel: PullRequestModel) {
		const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

		// If we already have a panel, show it.
		// Otherwise, create a new panel.
		if (PullRequestOverviewPanel.currentPanel) {
			PullRequestOverviewPanel.currentPanel._panel.reveal(column);
		} else {
			PullRequestOverviewPanel.currentPanel = new PullRequestOverviewPanel(extensionPath, column || vscode.ViewColumn.One);
		}

		PullRequestOverviewPanel.currentPanel.update(pullRequestModel);
		PullRequestOverviewPanel.currentPanel._panel.webview.postMessage({
			command: 'refactor'
		});
	}

	private constructor(extensionPath: string, column: vscode.ViewColumn) {
		this._extensionPath = extensionPath;

		// Create and show a new webview panel
		this._panel = vscode.window.createWebviewPanel(PullRequestOverviewPanel.viewType, 'Pull Request', column, {
			// Enable javascript in the webview
			enableScripts: true,

			// And restric the webview to only loading content from our extension's `media` directory.
			localResourceRoots: [
				vscode.Uri.file(path.join(this._extensionPath, 'media'))
			]
		});

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programatically
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(message => {
			console.log(message);
			this._onDidReceiveMessage(message);
		}, null, this._disposables);
	}

	public async update(pullRequestModel: PullRequestModel) {
		this._pullRequest = pullRequestModel;
		this._panel.webview.html = this.getHtmlForWebview();
		const timelineEvents = await pullRequestModel.getTimelineEvents();
		this._panel.webview.postMessage({
			command: 'initialize',
			pullrequest: {
				number: pullRequestModel.prNumber,
				title: pullRequestModel.title,
				body: pullRequestModel.prItem.body,
				author: pullRequestModel.author,
				state: pullRequestModel.state,
				events: timelineEvents
			}
		});
	}

	private _onDidReceiveMessage(message) {
		switch (message.command) {
			case 'alert':
				vscode.window.showErrorMessage(message.text);
				return;
		}
	}

	public dispose() {
		PullRequestOverviewPanel.currentPanel = undefined;

		// Clean up our resources
		this._panel.dispose();

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	private getHtmlForWebview() {
		const scriptPathOnDisk = vscode.Uri.file(path.join(this._extensionPath, 'media', 'index.js'));
		const scriptUri = scriptPathOnDisk.with({ scheme: 'vscode-resource' });
		const stylePathOnDisk = vscode.Uri.file(path.join(this._extensionPath, 'media', 'index.css'));
		const styleUri = stylePathOnDisk.with({ scheme: 'vscode-resource' });
		const baseStyles = `<link rel="stylesheet" type="text/css" href="${styleUri}">`;

		const nonce = getNonce();

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-resource: https:; script-src 'nonce-${nonce}'; style-src vscode-resource: 'unsafe-inline' http: https: data:;">
				${baseStyles}

				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Cat Coding</title>
			</head>
			<body>
				<script nonce="${nonce}" src="${scriptUri}"></script>
				<div id="title" class="title"></div>
				<div id="pullrequest" class="discussion"></div>
			</body>
			</html>`;
	}
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}