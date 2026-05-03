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
			<div class="nx-sessions" aria-label="Chat sessions">
				<select class="nx-sessionSelect" id="sessionSelect" title="Select chat session"></select>
				<button class="nx-sessionNew" id="newSessionBtn" type="button" title="New chat">+</button>
				<button class="nx-sessionDelete" id="deleteSessionBtn" type="button" title="Delete chat session">-</button>
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
							<span class="nx-quickIcon" aria-hidden="true">#</span>
							Browse Platforms
						</button>
						<button class="nx-quickBtn" data-action="history">
							<span class="nx-quickIcon" aria-hidden="true">H</span>
							View History
						</button>
						<button class="nx-quickBtn" data-action="memory">
							<span class="nx-quickIcon" aria-hidden="true">I</span>
							Index Workspace
						</button>
					</div>
				</div>
			</section>
		</main>

		<footer class="nx-footer">
			<div class="nx-composerCard" id="composerCard">
				<div class="nx-composerInputRow">
					<input class="nx-input" type="text" id="input" placeholder="Ask a question, describe what to build, or give a command..." />
				</div>
				<div class="nx-composerToolbar">
					<div class="nx-modeSelector">
						<div class="nx-dd" id="modeDd" data-dd-kind="mode">
							<button type="button" class="nx-ddTrigger" id="modeDdTrigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="modeDdMenu" title="Select interaction mode">
								<span class="nx-ddTriggerText" id="modeDdText">Chat</span>
								<span class="nx-ddChevron" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 3.5 5 6 7.5 3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
							</button>
							<div class="nx-ddMenu" id="modeDdMenu" role="listbox" aria-labelledby="modeDdTrigger" hidden>
								<button type="button" class="nx-ddItem" role="option" data-value="chat">Chat</button>
								<button type="button" class="nx-ddItem" role="option" data-value="ask">Ask (workspace)</button>
								<button type="button" class="nx-ddItem" role="option" data-value="plan">Plan</button>
								<button type="button" class="nx-ddItem" role="option" data-value="execute">Execute</button>
								<button type="button" class="nx-ddItem" role="option" data-value="agent">Agent</button>
							</div>
							<input type="hidden" id="modeSelect" value="chat" />
						</div>
						<div class="nx-dd" id="modelDd" data-dd-kind="model">
							<button type="button" class="nx-ddTrigger" id="modelDdTrigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="modelDdMenu" title="Select AI model">
								<span class="nx-ddTriggerText" id="modelDdText">GPT-4o Mini</span>
								<span class="nx-ddChevron" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 3.5 5 6 7.5 3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
							</button>
							<div class="nx-ddMenu" id="modelDdMenu" role="listbox" aria-labelledby="modelDdTrigger" hidden>
								<button type="button" class="nx-ddItem" role="option" data-value="gpt-4o-mini">GPT-4o Mini</button>
								<button type="button" class="nx-ddItem" role="option" data-value="gpt-4o">GPT-4o</button>
								<button type="button" class="nx-ddItem" role="option" data-value="claude-haiku">Claude 3 Haiku</button>
								<button type="button" class="nx-ddItem" role="option" data-value="claude-sonnet">Claude 3 Sonnet</button>
							</div>
							<input type="hidden" id="modelSelect" value="gpt-4o-mini" />
						</div>
					</div>
					<div class="nx-sendActions">
						<button class="nx-btn nx-btnPrimary nx-sendBtn" id="sendBtn" type="button" title="Send (Enter)" aria-label="Send, press Enter">
							<span class="nx-sendGlyph" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22 2 11 13" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
							<span class="nx-sendBtnSr" id="sendBtnText">Send</span>
						</button>
					</div>
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

