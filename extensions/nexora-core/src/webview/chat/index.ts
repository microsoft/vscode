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
					<div class="nx-welcomeIcon">
						<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
							<path d="M12 2L2 7l10 5 10-5-10-5z"/>
							<path d="M2 17l10 5 10-5"/>
							<path d="M2 12l10 5 10-5"/>
						</svg>
					</div>
					<div class="nx-welcomeTitle">Nexora AI</div>
					<div class="nx-welcomeSub">Universal AI Orchestration - Chat, Plan, or Execute</div>
					
					<div class="nx-quickActions">
						<button class="nx-quickBtn" data-action="platforms">
							<span class="nx-quickIcon" aria-hidden="true">[P]</span>
							Browse Platforms
						</button>
						<button class="nx-quickBtn" data-action="history">
							<span class="nx-quickIcon" aria-hidden="true">[H]</span>
							View History
						</button>
						<button class="nx-quickBtn" data-action="memory">
							<span class="nx-quickIcon" aria-hidden="true">[M]</span>
							Index Workspace
						</button>
					</div>
				</div>
			</section>
		</main>

		<footer class="nx-footer">
			<div class="nx-composerTop">
				<input class="nx-input" type="text" id="input" placeholder="Ask a question, describe what to build, or give a command..." />
			</div>
			<div class="nx-composerBottom">
				<div class="nx-modeSelector">
					<select class="nx-modeSelect" id="modeSelect" title="Select interaction mode">
						<option value="chat">Chat</option>
						<option value="plan">Plan</option>
						<option value="execute">Execute</option>
						<option value="agent">Agent</option>
					</select>
					<select class="nx-modelSelect" id="modelSelect" title="Select AI model">
						<option value="gpt-4o-mini">GPT-4o Mini</option>
						<option value="gpt-4o">GPT-4o</option>
						<option value="claude-haiku">Claude 3 Haiku</option>
						<option value="claude-sonnet">Claude 3 Sonnet</option>
					</select>
				</div>
				<div class="nx-sendActions">
					<button class="nx-btn nx-btnPrimary" id="sendBtn" type="button">
						<span id="sendBtnText">Send</span>
						<span class="nx-sendIcon" aria-hidden="true">Enter</span>
					</button>
				</div>
			</div>
			<div class="nx-modeHint" id="modeHint">
				<span class="nx-hintText">Chat mode: Have a conversation, ask questions, get explanations</span>
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

