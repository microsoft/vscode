/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { ChatInitialState } from './types';

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

export function getChatWebviewHtml(
	webview: vscode.Webview,
	extensionUri: vscode.Uri,
	initialState: ChatInitialState
): string {
	const nonce = getNonce();

	const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'chat', 'chat.css'));
	const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'chat', 'chat.js'));

	const csp = [
		`default-src 'none'`,
		`img-src ${webview.cspSource} https: data:`,
		`style-src ${webview.cspSource}`,
		`script-src 'nonce-${nonce}'`,
	].join('; ');

	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="Content-Security-Policy" content="${csp}">
	<link rel="stylesheet" href="${cssUri}">
	<title>Nexora Chat</title>
</head>
<body>
	<div class="nx-root">
		<header class="nx-header">
			<div class="nx-status">
				<span class="nx-dot" id="statusDot" aria-hidden="true"></span>
				<span class="nx-statusText" id="statusText">Checking backend...</span>
			</div>
			<div class="nx-auth" aria-label="Authentication status">
				<button class="nx-badge" id="githubBadge" type="button" title="Click to connect GitHub">
					<span class="nx-badgeLabel">GH</span>
					<span class="nx-badgeDot" aria-hidden="true"></span>
				</button>
				<button class="nx-badge" id="vercelBadge" type="button" title="Click to connect Vercel">
					<span class="nx-badgeLabel">Vc</span>
					<span class="nx-badgeDot" aria-hidden="true"></span>
				</button>
			</div>
		</header>

		<main class="nx-main">
			<section class="nx-messages" id="messages" aria-label="Messages">
				<div class="nx-welcome" id="welcome">
					<div class="nx-welcomeTitle">Nexora</div>
					<div class="nx-welcomeSub">Plan, generate, and deploy - directly from your workspace.</div>
					<div class="nx-welcomeHint">
						<span class="nx-kbd">Enter</span> to plan | <span class="nx-kbd">Shift</span>+<span class="nx-kbd">Enter</span> to generate
					</div>
				</div>
			</section>
		</main>

		<footer class="nx-footer">
			<div class="nx-composer">
				<input class="nx-input" type="text" id="input" placeholder="What would you like to build?" />
				<button class="nx-btn" id="send" type="button">Plan</button>
			</div>
			<div class="nx-actions">
				<label class="nx-label" for="connector">AI</label>
				<select class="nx-select" id="connector">
					<option value="openai">GPT-4o-mini</option>
					<option value="anthropic">Claude-3-Haiku</option>
				</select>
				<button class="nx-btn nx-btnSecondary" id="generate" type="button">Generate</button>
				<button class="nx-btn nx-btnPrimary" id="deploy" type="button" title="Generate, push to GitHub, deploy to Vercel">Deploy</button>
			</div>
		</footer>
	</div>

	<script nonce="${nonce}">
		window.__NEXORA_INITIAL_STATE__ = ${JSON.stringify(initialState)};
	</script>
	<script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
}

