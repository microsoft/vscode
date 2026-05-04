/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IGlassBoxService } from '../common/glassBoxService';
import {
	GlassBoxHostMessage,
	GlassBoxRequestAggregate,
} from '../common/types';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { redactSensitiveData } from '../common/sensitiveDataFilter';

/**
 * Manages the Glass Box AI DevTools webview panel.
 */
export class GlassBoxPanel extends Disposable {
	public static readonly viewType = 'github.copilot.chat.glassBox';
	private static readonly title = 'Copilot DevTools \u2014 Glass Box AI';

	private _panel: vscode.WebviewPanel | undefined;
	private _focusRequestId: string | undefined;
	private _replayCts: vscode.CancellationTokenSource | undefined;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		@IGlassBoxService private readonly _glassBoxService: IGlassBoxService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();
	}

	/**
	 * Open or reveal the Glass Box panel, optionally focusing a specific request.
	 */
	public show(requestId?: string): void {
		this._focusRequestId = requestId;

		if (this._panel) {
			this._panel.reveal(vscode.ViewColumn.Beside);
			if (requestId) {
				this._postMessage({ type: 'focusRequest', requestId });
			}
			return;
		}

		this._panel = vscode.window.createWebviewPanel(
			GlassBoxPanel.viewType,
			GlassBoxPanel.title,
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [this._extensionUri],
			},
		);

		this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

		// Handle messages from the webview
		this._register(this._panel.webview.onDidReceiveMessage((message: GlassBoxHostMessage) => {
			switch (message.type) {
				case 'refresh':
					this._sendUpdatedData();
					break;
				case 'getAvailableModels':
					this._sendAvailableModels();
					break;
				case 'runReplay': {
					// Validate inputs from the webview before acting on them
					const knownRequests = this._glassBoxService.getRequests();
					const requestExists = knownRequests.some(r => r.id === message.requestId);
					if (!requestExists) { break; }
					const userQuery = String(message.userQuery ?? '').slice(0, 32_000);
					const modelId = String(message.modelId ?? '').slice(0, 256);
					if (!userQuery || !modelId) { break; }
					// Send coarse model family to telemetry, not the raw model ID
					const safeModelFamily = modelId.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 64);
					this._telemetryService.sendMSFTTelemetryEvent('glassbox.replay.run', { modelFamily: safeModelFamily });
					this._runReplay(message.requestId, userQuery, modelId);
					break;
				}
				case 'switchTab': {
					// Only emit known tab values to telemetry
					const knownTabs = new Set(['context', 'tokenBudget', 'reasoning', 'performance', 'replay']);
					const tab = knownTabs.has(message.tab) ? message.tab : 'unknown';
					this._telemetryService.sendMSFTTelemetryEvent('glassbox.tab.switched', { tab });
					break;
				}
				case 'focusRequest':
					// UI state managed in webview
					break;
			}
		}));

		// Handle panel disposal
		this._register(this._panel.onDidDispose(() => {
			this._replayCts?.cancel();
			this._panel = undefined;
		}));

		// Subscribe to data changes
		this._register(this._glassBoxService.onDidChangeRequests(() => {
			this._sendUpdatedData();
		}));

		// Send initial data
		this._sendUpdatedData();
	}

	private _sendUpdatedData(): void {
		if (!this._panel) {
			return;
		}

		const requests = this._glassBoxService.getRequests();
		this._postMessage({
			type: 'requestsUpdated',
			requests: requests as GlassBoxRequestAggregate[],
		});

		if (this._focusRequestId) {
			this._postMessage({
				type: 'focusRequest',
				requestId: this._focusRequestId,
			});
			this._focusRequestId = undefined;
		}
	}

	private _postMessage(message: unknown): void {
		this._panel?.webview.postMessage(message);
	}

	private async _sendAvailableModels(): Promise<void> {
		try {
			const models = await vscode.lm.selectChatModels();
			const modelList = models.map(m => ({ id: m.id, name: m.name, family: m.family }));
			this._postMessage({ type: 'availableModels', models: modelList });
		} catch {
			this._postMessage({ type: 'availableModels', models: [] });
		}
	}

	private async _runReplay(requestId: string, userQuery: string, modelId: string): Promise<void> {
		this._replayCts?.cancel();
		this._replayCts = new vscode.CancellationTokenSource();
		const token = this._replayCts.token;

		this._postMessage({ type: 'replayStarted', requestId });
		const start = Date.now();

		try {
			const models = await vscode.lm.selectChatModels();
			const model = models.find(m => m.id === modelId) ?? models[0];

			if (!model) {
				this._postMessage({ type: 'replayResult', requestId, error: 'No language model available. Ensure Copilot is signed in.', latencyMs: 0, responseText: '', promptTokens: 0, completionTokens: 0, model: modelId });
				return;
			}

			const messages = [vscode.LanguageModelChatMessage.User(userQuery)];

			// Count prompt tokens before sending — countTokens takes a single message, not an array
			const promptTokens = await Promise.resolve(model.countTokens(messages[0], token)).catch(() => 0);

			const response = await model.sendRequest(messages, {}, token);

			let responseText = '';
			for await (const chunk of response.stream) {
				if (token.isCancellationRequested) { break; }
				if (chunk instanceof vscode.LanguageModelTextPart) {
					responseText += chunk.value;
				}
			}

			const latencyMs = Date.now() - start;
			// Count completion tokens from the response text — single message
			const completionTokens = await Promise.resolve(model.countTokens(
				vscode.LanguageModelChatMessage.Assistant(responseText), token
			)).catch(() => Math.ceil(responseText.length / 4));

			// Redact any secrets the model may have echoed back before sending to webview
			const safeResponseText = redactSensitiveData(responseText);
			this._postMessage({ type: 'replayResult', requestId, responseText: safeResponseText, latencyMs, promptTokens, completionTokens, model: model.name });
		} catch (e: unknown) {
			if (!token.isCancellationRequested) {
				// Redact error messages — provider errors can include key fragments
				const rawError = e instanceof Error ? e.message : String(e);
				const error = redactSensitiveData(rawError);
				this._postMessage({ type: 'replayResult', requestId, error, latencyMs: Date.now() - start, responseText: '', promptTokens: 0, completionTokens: 0, model: modelId });
			}
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview): string {
		const nonce = getNonce();

		return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy"
		content="default-src 'none'; style-src 'nonce-${nonce}' 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<title>${GlassBoxPanel.title}</title>
	<style nonce="${nonce}">
		:root {
			--bg: var(--vscode-editor-background);
			--fg: var(--vscode-editor-foreground);
			--border: var(--vscode-panel-border);
			--tab-active-bg: var(--vscode-tab-activeBackground);
			--tab-inactive-bg: var(--vscode-tab-inactiveBackground);
			--badge-bg: var(--vscode-badge-background);
			--badge-fg: var(--vscode-badge-foreground);
			--success: var(--vscode-testing-iconPassed);
			--error: var(--vscode-testing-iconFailed);
			--warning: var(--vscode-editorWarning-foreground);
			--bar-used: var(--vscode-progressBar-background);
			--bar-cached: var(--vscode-terminal-ansiGreen);
			--bar-reasoning: var(--vscode-terminal-ansiYellow);
			--bar-remaining: var(--vscode-editorWidget-background);
		}
		* { box-sizing: border-box; margin: 0; padding: 0; }
		body {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--fg);
			background: var(--bg);
			overflow: hidden;
		}
		.container { display: flex; flex-direction: column; height: 100vh; }

		/* Tabs */
		.tabs {
			display: flex;
			border-bottom: 1px solid var(--border);
			background: var(--tab-inactive-bg);
			flex-shrink: 0;
		}
		.tab {
			padding: 8px 16px;
			cursor: pointer;
			border: none;
			background: transparent;
			color: var(--fg);
			opacity: 0.7;
			font-size: 12px;
			border-bottom: 2px solid transparent;
		}
		.tab:hover { opacity: 1; }
		.tab.active {
			opacity: 1;
			background: var(--tab-active-bg);
			border-bottom-color: var(--bar-used);
		}

		/* Request selector */
		.request-selector {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 8px 12px;
			border-bottom: 1px solid var(--border);
			flex-shrink: 0;
		}
		.request-selector select {
			flex: 1;
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border);
			padding: 4px 8px;
			border-radius: 2px;
		}
		.status-badge {
			padding: 2px 6px;
			border-radius: 10px;
			font-size: 10px;
			font-weight: bold;
		}
		.status-badge.success { background: var(--success); color: #fff; }
		.status-badge.error { background: var(--error); color: #fff; }

		/* Content panels */
		.panel-content {
			flex: 1;
			overflow-y: auto;
			padding: 12px;
		}
		.panel-content[hidden] { display: none; }

		/* Context inspector */
		.context-item {
			padding: 8px;
			margin-bottom: 4px;
			border-radius: 4px;
			background: var(--vscode-list-hoverBackground);
			border-left: 3px solid var(--bar-used);
		}
		.context-item .header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 4px;
		}
		.context-item .kind-badge {
			font-size: 10px;
			padding: 1px 6px;
			border-radius: 8px;
			background: var(--badge-bg);
			color: var(--badge-fg);
		}
		.context-item .tokens {
			font-size: 11px;
			opacity: 0.8;
		}
		.context-item .preview {
			font-family: var(--vscode-editor-font-family);
			font-size: 11px;
			opacity: 0.7;
			white-space: pre-wrap;
			max-height: 60px;
			overflow: hidden;
			margin-top: 4px;
		}
		.relevance-bar {
			height: 4px;
			border-radius: 2px;
			background: var(--bar-remaining);
			margin-top: 4px;
		}
		.relevance-bar .fill {
			height: 100%;
			border-radius: 2px;
			background: var(--bar-used);
		}
		.context-item .preview.expanded {
			max-height: 400px;
			overflow-y: auto;
			border: 1px solid var(--border);
			border-radius: 2px;
			padding: 4px 6px;
			opacity: 0.9;
		}
		.expand-toggle {
			background: none;
			border: none;
			color: var(--vscode-textLink-foreground);
			cursor: pointer;
			font-size: 11px;
			padding: 2px 0;
			margin-top: 2px;
			display: inline-block;
			opacity: 0.8;
		}
		.expand-toggle:hover { opacity: 1; text-decoration: underline; }
		.preview-truncated-note {
			font-size: 10px;
			opacity: 0.5;
			margin-left: 6px;
		}

		/* Call flow timeline */
		.call-flow-section {
			border-bottom: 1px solid var(--border);
			background: var(--tab-inactive-bg);
			padding: 6px 12px;
			flex-shrink: 0;
		}
		.call-flow-label {
			font-size: 10px;
			opacity: 0.6;
			margin-bottom: 4px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}
		.call-flow-strip {
			display: flex;
			align-items: center;
			gap: 2px;
			overflow-x: auto;
			padding-bottom: 2px;
		}
		.call-node {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 2px;
			cursor: pointer;
			min-width: 52px;
			max-width: 84px;
			padding: 3px 5px;
			border-radius: 4px;
			border: 1px solid transparent;
			font-size: 10px;
			text-align: center;
			opacity: 0.7;
			flex-shrink: 0;
		}
		.call-node:hover { opacity: 1; background: var(--vscode-list-hoverBackground); }
		.call-node.selected { opacity: 1; border-color: var(--bar-used); background: var(--vscode-list-hoverBackground); }
		.call-badge {
			width: 18px;
			height: 18px;
			border-radius: 50%;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 9px;
			font-weight: bold;
			color: #fff;
			background: var(--bar-used);
			flex-shrink: 0;
		}
		.call-node.failed .call-badge { background: var(--error); }
		.call-type-label {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			max-width: 82px;
		}
		.call-arrow {
			color: var(--border);
			font-size: 12px;
			flex-shrink: 0;
			padding-bottom: 8px;
		}

		/* Request meta info bar */
		.request-meta {
			display: flex;
			align-items: center;
			gap: 6px;
			font-size: 11px;
			opacity: 0.65;
			margin-bottom: 10px;
			flex-wrap: wrap;
		}
		.request-meta .meta-model {
			background: var(--badge-bg);
			color: var(--badge-fg);
			padding: 1px 6px;
			border-radius: 8px;
			font-size: 10px;
			opacity: 1;
		}
		.request-meta .meta-sep { opacity: 0.4; }

		/* Token budget visualizer */
		.token-overview {
			display: flex;
			justify-content: space-between;
			align-items: baseline;
			margin-bottom: 6px;
			font-size: 12px;
		}
		.token-overview .token-max { font-weight: 600; }
		.token-overview .token-used { opacity: 0.7; }
		.budget-bar {
			display: flex;
			height: 20px;
			border-radius: 4px;
			overflow: hidden;
			margin: 0 0 2px;
			background: var(--bar-remaining);
		}
		.budget-bar .segment { min-width: 3px; }
		.budget-bar .prompt { background: var(--bar-used); }
		.budget-bar .completion { background: var(--vscode-terminal-ansiBlue); }
		.bar-pct-labels {
			display: flex;
			justify-content: space-between;
			font-size: 10px;
			opacity: 0.6;
			margin-bottom: 12px;
		}
		.token-table {
			width: 100%;
			border-collapse: collapse;
			font-size: 12px;
			margin: 8px 0;
		}
		.token-table thead th {
			text-align: left;
			opacity: 0.6;
			font-weight: 600;
			font-size: 10px;
			text-transform: uppercase;
			letter-spacing: 0.4px;
			padding: 3px 8px 3px 4px;
			border-bottom: 1px solid var(--border);
		}
		.token-table thead th.num { text-align: right; }
		.token-table td {
			padding: 5px 8px 5px 4px;
			border-bottom: 1px solid var(--border);
			vertical-align: middle;
		}
		.token-table tr:last-child td { border-bottom: none; }
		.token-row .cat-cell { font-weight: 600; }
		.token-row.remaining .cat-cell { opacity: 0.75; font-weight: normal; }
		.token-row.sub td { opacity: 0.75; font-size: 11px; }
		.token-row.sub .cat-cell { padding-left: 18px; font-style: italic; font-weight: normal; }
		td.num { text-align: right; font-variant-numeric: tabular-nums; }
		td.desc { opacity: 0.5; font-size: 11px; }
		.token-explain {
			margin-top: 14px;
			border: 1px solid var(--border);
			border-radius: 4px;
			overflow: hidden;
			font-size: 12px;
		}
		.token-explain-title {
			font-size: 10px;
			font-weight: 700;
			padding: 5px 10px;
			background: var(--vscode-list-hoverBackground);
			text-transform: uppercase;
			letter-spacing: 0.5px;
			opacity: 0.8;
		}
		.token-explain-row {
			padding: 8px 10px;
			border-top: 1px solid var(--border);
		}
		.token-explain-formula {
			font-family: var(--vscode-editor-font-family);
			font-size: 11px;
			font-weight: 700;
			color: var(--bar-used);
			margin-bottom: 2px;
		}
		.token-explain-calc {
			font-family: var(--vscode-editor-font-family);
			font-size: 12px;
			margin-bottom: 4px;
		}
		.token-explain-why {
			font-size: 11px;
			opacity: 0.6;
			line-height: 1.5;
		}

		/* Element breakdown */
		.element-breakdown {
			margin: 12px 0;
		}
		.element-row {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 4px 0;
			font-size: 12px;
		}
		.element-row .name { flex: 1; }
		.element-row .bar-container {
			flex: 2;
			height: 8px;
			border-radius: 4px;
			background: var(--bar-remaining);
		}
		.element-row .bar-fill {
			height: 100%;
			border-radius: 4px;
			background: var(--bar-used);
		}
		.element-row .count { width: 60px; text-align: right; font-size: 11px; opacity: 0.8; }

		/* Performance dashboard */
		.perf-grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
			gap: 8px;
			margin: 12px 0;
		}
		.perf-card {
			padding: 12px;
			border-radius: 4px;
			background: var(--vscode-list-hoverBackground);
			text-align: center;
		}
		.perf-card .value {
			font-size: 24px;
			font-weight: bold;
		}
		.perf-card .unit { font-size: 11px; opacity: 0.7; }
		.perf-card .label { font-size: 11px; opacity: 0.7; margin-top: 4px; }

		.tool-calls-table {
			width: 100%;
			border-collapse: collapse;
			margin: 12px 0;
			font-size: 12px;
		}
		.tool-calls-table th, .tool-calls-table td {
			padding: 6px 8px;
			text-align: left;
			border-bottom: 1px solid var(--border);
		}
		.tool-calls-table th {
			opacity: 0.7;
			font-weight: 600;
		}

		/* Empty state */
		.empty-state {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			height: 100%;
			opacity: 0.5;
			text-align: center;
			padding: 24px;
		}
		.empty-state .icon { font-size: 48px; margin-bottom: 12px; }

		h3 { margin: 12px 0 8px; font-size: 13px; }

		/* Replay panel */
		.replay-desc { font-size: 11px; opacity: 0.6; margin: 0 0 14px; line-height: 1.5; }
		.replay-field { margin-bottom: 12px; }
		.replay-label { display: block; font-size: 10px; font-weight: 700; opacity: 0.7; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
		.replay-textarea, .replay-select {
			width: 100%;
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border);
			padding: 6px 8px;
			border-radius: 2px;
			font-size: 12px;
		}
		.replay-textarea {
			font-family: var(--vscode-editor-font-family);
			resize: vertical;
			min-height: 80px;
			max-height: 260px;
		}
		.replay-sysprompt {
			font-family: var(--vscode-editor-font-family);
			font-size: 11px;
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			border-radius: 2px;
			padding: 6px 8px;
			max-height: 140px;
			overflow-y: auto;
			white-space: pre-wrap;
			opacity: 0.75;
		}
		.replay-run-btn {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			padding: 6px 18px;
			border-radius: 2px;
			cursor: pointer;
			font-size: 12px;
			font-weight: 600;
			margin-top: 4px;
		}
		.replay-run-btn:hover { background: var(--vscode-button-hoverBackground); }
		.replay-run-btn:disabled { opacity: 0.5; cursor: not-allowed; }
		.replay-spinner { font-size: 11px; opacity: 0.6; padding: 10px 0; }
		.replay-divider { border: none; border-top: 1px solid var(--border); margin: 16px 0; }
		.replay-note { font-size: 11px; color: var(--foreground); background: rgba(0, 120, 212, 0.1); border-left: 3px solid var(--focusBorder, #0078d4); padding: 6px 10px; border-radius: 3px; margin-bottom: 8px; }
		.replay-compare { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
		.replay-result-card { border: 1px solid var(--border); border-radius: 4px; overflow: hidden; }
		.replay-card-header {
			font-size: 10px;
			font-weight: 700;
			padding: 5px 10px;
			background: var(--vscode-list-hoverBackground);
			text-transform: uppercase;
			letter-spacing: 0.5px;
			opacity: 0.8;
			border-bottom: 1px solid var(--border);
		}
		.replay-card-stats {
			display: flex;
			flex-wrap: wrap;
			gap: 6px;
			padding: 6px 10px;
			border-bottom: 1px solid var(--border);
		}
		.replay-card-stat {
			font-size: 11px;
			background: var(--badge-bg);
			color: var(--badge-fg);
			padding: 1px 6px;
			border-radius: 8px;
		}
		.replay-card-stat-muted {
			opacity: 0.5;
			font-style: italic;
			cursor: help;
		}
		.replay-card-body {
			font-family: var(--vscode-editor-font-family);
			font-size: 11px;
			padding: 8px 10px;
			max-height: 260px;
			overflow-y: auto;
			white-space: pre-wrap;
			line-height: 1.5;
		}
		.replay-card-body.no-data { opacity: 0.4; font-style: italic; }
		.replay-error-msg { color: var(--error); padding: 8px 10px; font-size: 12px; }
	</style>
</head>
<body>
	<div class="container">
		<div class="tabs">
			<button class="tab active" data-tab="context">\ud83d\udd0c Context</button>
			<button class="tab" data-tab="tokenBudget">\ud83d\udce8 Tokens</button>
			<button class="tab" data-tab="performance">\u26a1 Performance</button>
			<button class="tab" data-tab="replay">\ud83d\udd04 Replay</button>
		</div>

		<div class="request-selector">
			<select id="requestSelect">
				<option value="">\u2014 No requests yet \u2014</option>
			</select>
		</div>

		<div id="call-flow" class="call-flow-section" style="display:none">
			<div class="call-flow-label">Session call flow \u2014 click any step to inspect</div>
			<div id="call-flow-strip" class="call-flow-strip"></div>
		</div>

		<div id="panel-context" class="panel-content">
			<div class="empty-state">
				<div class="icon">\ud83d\udd0c</div>
				<p>No context data yet. Make a Copilot request to see what context it uses.</p>
			</div>
		</div>

		<div id="panel-tokenBudget" class="panel-content" hidden>
			<div class="empty-state">
				<div class="icon">\ud83d\udce8</div>
				<p>Token budget data will appear after a request completes.</p>
			</div>
		</div>

		<div id="panel-performance" class="panel-content" hidden>
			<div class="empty-state">
				<div class="icon">\u26a1</div>
				<p>Performance metrics will appear after a request completes.</p>
			</div>
		</div>

		<div id="panel-replay" class="panel-content" hidden>
			<div class="empty-state">
				<div class="icon">\ud83d\udd04</div>
				<p>Select a request then switch to this tab to replay it with a different model or edited query.</p>
			</div>
		</div>
	</div>

	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		let allRequests = [];
		let selectedRequestId = null;
		let activeTab = 'context';
		let replayState = { availableModels: [], selectedModelId: null, runningRequestId: null, results: {} };

		// Tab switching
		document.querySelectorAll('.tab').forEach(tab => {
			tab.addEventListener('click', () => {
				document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
				tab.classList.add('active');

				const tabName = tab.dataset.tab;
				activeTab = tabName;
				document.querySelectorAll('.panel-content').forEach(p => p.hidden = true);
				document.getElementById('panel-' + tabName).hidden = false;

				vscode.postMessage({ type: 'switchTab', tab: tabName });

				// Lazily fetch models the first time the Replay tab is opened
				if (tabName === 'replay' && replayState.availableModels.length === 0) {
					vscode.postMessage({ type: 'getAvailableModels' });
				}

				renderActiveTab();
			});
		});

		// Request selector
		document.getElementById('requestSelect').addEventListener('change', (e) => {
			selectedRequestId = e.target.value || null;
			renderCallFlow();
			renderActiveTab();
		});

		// Handle messages from extension
		window.addEventListener('message', event => {
			const msg = event.data;
			switch (msg.type) {
				case 'requestsUpdated':
					allRequests = msg.requests;
					updateRequestSelector();
					renderActiveTab();
					break;
				case 'focusRequest':
					selectedRequestId = msg.requestId;
					updateRequestSelector();
					renderActiveTab();
					break;
				case 'activeTabChanged':
					// Programmatic tab switch
					document.querySelectorAll('.tab').forEach(t => {
						t.classList.toggle('active', t.dataset.tab === msg.tab);
					});
					activeTab = msg.tab;
					document.querySelectorAll('.panel-content').forEach(p => p.hidden = true);
					document.getElementById('panel-' + msg.tab).hidden = false;
					renderActiveTab();
					break;
				case 'availableModels':
					replayState.availableModels = msg.models;
					if (activeTab === 'replay') { renderActiveTab(); }
					break;
				case 'replayStarted':
					replayState.runningRequestId = msg.requestId;
					// Clear only this request's previous result while it reruns
					delete replayState.results[msg.requestId];
					if (activeTab === 'replay') { renderActiveTab(); }
					break;
				case 'replayResult':
					replayState.runningRequestId = null;
					replayState.results[msg.requestId] = msg;
					if (activeTab === 'replay') { renderActiveTab(); }
					break;
			}
		});

		function updateRequestSelector() {
			const select = document.getElementById('requestSelect');
			const currentValue = selectedRequestId || select.value;
			select.innerHTML = '';

			if (allRequests.length === 0) {
				select.innerHTML = '<option value="">\u2014 No requests yet \u2014</option>';
				return;
			}

			allRequests.forEach((req, i) => {
				const opt = document.createElement('option');
				opt.value = req.id;
				const time = new Date(req.timestamp).toLocaleTimeString();
				const status = req.success ? '\u2714' : '\u2718';
				opt.textContent = status + ' ' + time + ' \u2014 ' + req.label + ' (' + req.model + ')';
				select.appendChild(opt);
			});

			// Select the current or latest request
			if (currentValue && allRequests.some(r => r.id === currentValue)) {
				select.value = currentValue;
				selectedRequestId = currentValue;
			} else if (allRequests.length > 0) {
				select.value = allRequests[allRequests.length - 1].id;
				selectedRequestId = select.value;
			}
			renderCallFlow();
		}

		function getSelectedRequest() {
			return allRequests.find(r => r.id === selectedRequestId) || null;
		}

		function renderActiveTab() {
			const req = getSelectedRequest();
			switch (activeTab) {
				case 'context': renderContext(req); break;
				case 'tokenBudget': renderTokenBudget(req); break;
				case 'performance': renderPerformance(req); break;
				case 'replay': renderReplay(req); break;
			}
		}

		function esc(str) {
			const div = document.createElement('div');
			div.textContent = str;
			return div.innerHTML;
		}

		function renderCallFlow() {
			const section = document.getElementById('call-flow');
			const strip = document.getElementById('call-flow-strip');
			if (allRequests.length === 0) {
				section.style.display = 'none';
				return;
			}
			section.style.display = '';
			let html = '';
			allRequests.forEach((req, i) => {
				if (i > 0) {
					html += '<span class="call-arrow">\u2192</span>';
				}
				const isSel = req.id === selectedRequestId;
				const cls = (isSel ? ' selected' : '') + (req.success ? '' : ' failed');
				const shortLabel = getShortCallLabel(req.label);
				html +=
					'<div class="call-node' + cls + '" data-idx="' + i + '"' +
					' title="' + esc(req.label + ' (' + req.model + ')') + '">' +
						'<div class="call-badge">' + (i + 1) + '</div>' +
						'<div class="call-type-label">' + esc(shortLabel) + '</div>' +
					'</div>';
			});
			strip.innerHTML = html;
			strip.addEventListener('click', (e) => {
				const node = e.target.closest('.call-node');
				if (node) {
					const idx = parseInt(node.dataset.idx, 10);
					if (!isNaN(idx) && allRequests[idx]) {
						selectedRequestId = allRequests[idx].id;
						document.getElementById('requestSelect').value = selectedRequestId;
						renderCallFlow();
						renderActiveTab();
					}
				}
			});
		}

		function getShortCallLabel(label) {
			const l = label.toLowerCase();
			if (l === 'title' || l.includes('title gen')) { return 'Title'; }
			if (l.includes('categor') || l.includes('intent') || l.includes('classif')) { return 'Intent'; }
			if (l.includes('progress')) { return 'Progress'; }
			if (l.startsWith('ghost') || (l.startsWith('nes') && !l.includes('response')) || l === 'xtabprovider') { return 'Suggestion'; }
			if (l.includes('tool')) { return 'Tool call'; }
			return label.length > 12 ? label.substring(0, 12) + '\u2026' : label;
		}


		/**
		 * Maps ContextItemKind enum values to short, readable display labels.
		 */
		function kindLabel(kind) {
			switch (kind) {
				case 'system-message': return 'System';
				case 'user-message': return 'User';
				case 'history': return 'Assistant';
				case 'tool-result': return 'Tool';
				case 'file': return 'File';
				case 'symbol': return 'Symbol';
				case 'selection': return 'Selection';
				default: return kind.charAt(0).toUpperCase() + kind.slice(1);
			}
		}

		function togglePreview(index) {
			const preview = document.getElementById('preview-' + index);
			const btn = document.getElementById('expand-btn-' + index);
			if (preview && btn) {
				const expanded = preview.classList.toggle('expanded');
				btn.textContent = expanded ? '\u25bc Show less' : '\u25b6 Show more';
			}
		}

		function renderContext(req) {
			const panel = document.getElementById('panel-context');
			if (!req || !req.contextItems || req.contextItems.length === 0) {
				panel.innerHTML = '<div class="empty-state"><div class="icon">\ud83d\udd0c</div><p>No context data for this request.</p></div>';
				return;
			}

			const reqIndex = allRequests.findIndex(r => r.id === req.id);
			let html = '';

			// Compact request meta bar: model \u00b7 time \u00b7 step N of M
			const metaTime = new Date(req.timestamp).toLocaleTimeString();
			const metaStep = (reqIndex + 1) + ' of ' + allRequests.length;
			html += '<div class="request-meta">' +
				'<span class="meta-model">' + esc(req.model) + '</span>' +
				'<span class="meta-sep">\u00b7</span>' +
				'<span>' + esc(metaTime) + '</span>' +
				'<span class="meta-sep">\u00b7</span>' +
				'<span>Step ' + metaStep + '</span>' +
				'</div>';

			html += '<h3>Context Items (' + req.contextItems.length + ')</h3>';

			// Sort by relevance descending
			const sorted = [...req.contextItems].sort((a, b) => b.relevance - a.relevance);

			sorted.forEach((item, i) => {
				const pct = (item.relevance * 100).toFixed(1);
				html += '<div class="context-item">' +
					'<div class="header">' +
						'<span><strong>' + esc(item.label) + '</strong> <span class="kind-badge">' + esc(kindLabel(item.kind)) + '</span></span>' +
						'<span class="tokens">' + item.tokens.toLocaleString() + ' tokens (' + pct + '%)</span>' +
					'</div>';
				if (item.preview) {
					const isTruncated = item.preview.endsWith('\u2026 [truncated]');
					html += '<div class="preview" id="preview-' + i + '">' + esc(item.preview) + '</div>';
					// Only show expand toggle when there's enough content to warrant it
					if (item.preview.length > 150) {
						html += '<button class="expand-toggle" id="expand-btn-' + i + '" data-preview-idx="' + i + '">\u25b6 Show more</button>';
						if (isTruncated) {
							html += '<span class="preview-truncated-note">preview only \u2014 full content sent to model</span>';
						}
					}
				}
				html += '<div class="relevance-bar"><div class="fill" style="width:' + pct + '%"></div></div>' +
					'</div>';
			});

			// Model response output
			if (req.responseText) {
				html += '<h3>Model Response</h3>';
				html += '<div class="context-item" style="border-left-color:var(--success)">' +
					'<div class="header">' +
						'<span><strong>Response</strong> <span class="kind-badge">Output</span></span>' +
						(req.tokenBudget ? '<span class="tokens">' + req.tokenBudget.completionTokens.toLocaleString() + ' completion tokens</span>' : '') +
					'</div>' +
					'<div class="preview" id="preview-response">' + esc(req.responseText) + '</div>';
				if (req.responseText.length > 150) {
					html += '<button class="expand-toggle" id="expand-btn-response" data-preview-idx="response">\u25b6 Show more</button>';
				}
				html += '</div>';
			} else if (req.errorMessage) {
				html += '<h3>Model Response</h3>';
				html += '<div class="context-item" style="border-left-color:var(--error)">' +
					'<div class="header">' +
						'<span><strong>Error</strong> <span class="kind-badge" style="background:var(--error);color:#fff">Failed</span></span>' +
					'</div>' +
					'<div class="preview">' + esc(req.errorMessage) + '</div>' +
				'</div>';
			}

			panel.innerHTML = html;

			// Wire expand toggles via addEventListener (inline onclick is blocked by CSP)
			panel.querySelectorAll('.expand-toggle').forEach(btn => {
				btn.addEventListener('click', () => togglePreview(btn.dataset.previewIdx));
			});
		}

		function renderTokenBudget(req) {
			const panel = document.getElementById('panel-tokenBudget');
			if (!req || !req.tokenBudget) {
				panel.innerHTML = '<div class="empty-state"><div class="icon">\ud83d\udce8</div><p>No token data for this request.</p></div>';
				return;
			}

			const b = req.tokenBudget;
			const max = b.modelMaxTokens || 1;
			const fmt = v => (v == null ? '\u2014' : v.toLocaleString());
			const pct = v => (v / max * 100);
			const fmtPct = v => pct(v).toFixed(1) + '%';

			// Header
			let html = '<div class="token-overview">';
			html += '<span class="token-max">Max Context: ' + fmt(b.modelMaxTokens) + ' tokens</span>';
			html += '<span class="token-used">In use: ' + fmt(b.totalTokens) + ' (' + fmtPct(b.totalTokens) + ')</span>';
			html += '</div>';

			// Overview stacked bar (background = remaining)
			const promptPct = pct(b.promptTokens);
			const completionPct = pct(b.completionTokens);
			html += '<div class="budget-bar">';
			if (promptPct > 0) {
				html += '<div class="segment prompt" style="width:' + promptPct + '%" title="Prompt: ' + fmt(b.promptTokens) + ' (' + fmtPct(b.promptTokens) + ')"></div>';
			}
			if (completionPct > 0) {
				html += '<div class="segment completion" style="width:' + completionPct + '%" title="Completion: ' + fmt(b.completionTokens) + ' (' + fmtPct(b.completionTokens) + ')"></div>';
			}
			html += '</div>';
			html += '<div class="bar-pct-labels">';
			html += '<span>' + fmtPct(b.promptTokens) + ' used (Prompt)</span>';
			html += '<span>' + fmtPct(b.remainingTokens) + ' remaining</span>';
			html += '</div>';

			// Breakdown table
			html += '<h3>Token Breakdown</h3>';
			html += '<table class="token-table">';
			html += '<thead><tr><th>Category</th><th class="num">Tokens</th><th class="num">% of Max</th><th>What it means</th></tr></thead>';
			html += '<tbody>';
			html += '<tr class="token-row prompt"><td class="cat-cell">\ud83d\udcdd Prompt</td><td class="num">' + fmt(b.promptTokens) + '</td><td class="num">' + fmtPct(b.promptTokens) + '</td><td class="desc">Everything sent to the model: history, code, tool results</td></tr>';
			if (b.cachedTokens) {
				html += '<tr class="token-row sub"><td class="cat-cell">\u2193 Cached</td><td class="num">' + fmt(b.cachedTokens) + '</td><td class="num">' + fmtPct(b.cachedTokens) + '</td><td class="desc">Part of Prompt \u2014 matched model cache, no recomputation needed</td></tr>';
			}
			if (b.completionTokens > 0) {
				html += '<tr class="token-row completion"><td class="cat-cell">\ud83d\udcda Completion</td><td class="num">' + fmt(b.completionTokens) + '</td><td class="num">' + fmtPct(b.completionTokens) + '</td><td class="desc">Tokens the model generated in its response</td></tr>';
				if (b.reasoningTokens) {
					html += '<tr class="token-row sub"><td class="cat-cell">\u2193 Reasoning</td><td class="num">' + fmt(b.reasoningTokens) + '</td><td class="num">' + fmtPct(b.reasoningTokens) + '</td><td class="desc">Part of Completion \u2014 internal thinking, not shown to user</td></tr>';
				}
			}
			html += '<tr class="token-row remaining"><td class="cat-cell">\u2b1c Remaining</td><td class="num">' + fmt(b.remainingTokens) + '</td><td class="num">' + fmtPct(b.remainingTokens) + '</td><td class="desc">Max \u2212 Prompt = room left in context window</td></tr>';
			html += '</tbody></table>';

			// Math explanation card
			html += '<div class="token-explain">';
			html += '<div class="token-explain-title">\ud83d\udcd3 Understanding these numbers</div>';

			// Total
			html += '<div class="token-explain-row">';
			html += '<div class="token-explain-formula">Total = Prompt + Completion</div>';
			html += '<div class="token-explain-calc" style="margin-left:6ch">= ' + fmt(b.promptTokens) + ' + ' + fmt(b.completionTokens) + ' = <strong>' + fmt(b.totalTokens) + '</strong></div>';
			html += '<div class="token-explain-why">Every token used in this exchange \u2014 everything you sent in plus everything the model wrote back.</div>';
			html += '</div>';

			// Remaining
			html += '<div class="token-explain-row">';
			html += '<div class="token-explain-formula">Remaining = Max Context \u2212 Prompt</div>';
			html += '<div class="token-explain-calc" style="margin-left:10ch">= ' + fmt(b.modelMaxTokens) + ' \u2212 ' + fmt(b.promptTokens) + ' = <strong>' + fmt(b.remainingTokens) + '</strong></div>';
			html += '<div class="token-explain-why">How much more you could send before reaching the context window limit. Completion tokens do <em>not</em> count against this \u2014 only what you send in (Prompt) does.</div>';
			html += '</div>';

			// Cached (only if present)
			if (b.cachedTokens) {
				const cachedSharePct = (b.cachedTokens / b.promptTokens * 100).toFixed(0);
				html += '<div class="token-explain-row">';
				html += '<div class="token-explain-formula">Cached is part of Prompt (not extra tokens)</div>';
				html += '<div class="token-explain-calc">' + fmt(b.cachedTokens) + ' of ' + fmt(b.promptTokens) + ' prompt tokens (' + cachedSharePct + '%) were served from cache</div>';
				html += '<div class="token-explain-why">These tokens matched a recent request already in the model cache. Instead of reprocessing them, the model reused the cached result \u2014 making the response faster and cheaper.</div>';
				html += '</div>';
			}

			// Reasoning (only if present)
			if (b.reasoningTokens) {
				const reasoningSharePct = (b.reasoningTokens / b.completionTokens * 100).toFixed(0);
				html += '<div class="token-explain-row">';
				html += '<div class="token-explain-formula">Reasoning is part of Completion (not extra tokens)</div>';
				html += '<div class="token-explain-calc">' + fmt(b.reasoningTokens) + ' of ' + fmt(b.completionTokens) + ' completion tokens (' + reasoningSharePct + '%) were internal thinking</div>';
				html += '<div class="token-explain-why">Before writing its visible reply, the model generates internal "thinking" steps. These reasoning tokens are not shown to you but are counted as part of Completion.</div>';
				html += '</div>';
			}

			html += '</div>';

			// Prompt element breakdown
			if (b.elementBreakdown && b.elementBreakdown.length > 0) {
				html += '<h3>Prompt Element Breakdown</h3>';
				html += '<div class="element-breakdown">';
				for (const elem of b.elementBreakdown) {
					const elemPct = elem.maxTokens > 0 ? (elem.tokens / elem.maxTokens * 100) : 0;
					html += '<div class="element-row">' +
						'<span class="name">' + esc(elem.name) + '</span>' +
						'<div class="bar-container"><div class="bar-fill" style="width:' + Math.min(100, elemPct) + '%"></div></div>' +
						'<span class="count">' + elem.tokens.toLocaleString() + '</span>' +
					'</div>';
				}
				html += '</div>';
			}

			panel.innerHTML = html;
		}

		function renderPerformance(req) {
			const panel = document.getElementById('panel-performance');
			if (!req || !req.performance) {
				panel.innerHTML = '<div class="empty-state"><div class="icon">\u26a1</div><p>No performance data for this request.</p></div>';
				return;
			}

			const p = req.performance;
			let html = '<h3>Response Metrics</h3>';
			html += '<div class="perf-grid">';
			html += perfCard(p.totalDurationMs, 'ms', 'Total Duration');
			if (p.timeToFirstTokenMs !== undefined) {
				html += perfCard(p.timeToFirstTokenMs, 'ms', 'Time to First Token');
			}
			html += perfCard(p.toolCallCount, '', 'Tool Calls');
			html += perfCard(p.cachedTokens, '', 'Cached Tokens');
			html += perfCard(p.cacheHit ? 'Yes' : 'No', '', 'Cache Hit');
			html += '</div>';

			// Tool call table
			if (p.toolCalls && p.toolCalls.length > 0) {
				html += '<h3>Tool Call Breakdown</h3>';
				html += '<table class="tool-calls-table"><thead><tr><th>Tool</th><th title="Gap between consecutive tool completion times. First call duration is not available.">Duration \u2139</th></tr></thead><tbody>';
				for (const tc of p.toolCalls) {
					const dur = tc.durationMs == null ? '<span style="opacity:0.5">N/A</span>' : '~' + tc.durationMs + 'ms';
					html += '<tr><td>' + esc(tc.name) + '</td><td>' + dur + '</td></tr>';
				}
				html += '</tbody></table>';
				html += '<p style="font-size:10px;opacity:0.5;margin-top:4px">\u2139 Duration = gap between consecutive tool completion timestamps (includes model think time between calls). First call has no prior reference so shows N/A.</p>';
			}

			// Aggregate stats across all requests
			if (allRequests.length > 1) {
				html += '<h3>Session Aggregate (' + allRequests.length + ' requests)</h3>';
				const totalDuration = allRequests.reduce((sum, r) => sum + (r.performance?.totalDurationMs || 0), 0);
				const avgDuration = Math.round(totalDuration / allRequests.length);
				const successCount = allRequests.filter(r => r.success).length;
				const avgTtft = allRequests.filter(r => r.performance?.timeToFirstTokenMs != null);
				const avgTtftMs = avgTtft.length > 0 ? Math.round(avgTtft.reduce((sum, r) => sum + r.performance.timeToFirstTokenMs, 0) / avgTtft.length) : 0;
				const totalCacheHits = allRequests.filter(r => r.performance?.cacheHit).length;

				html += '<div class="perf-grid">';
				html += perfCard(avgDuration, 'ms', 'Avg Duration');
				if (avgTtftMs > 0) { html += perfCard(avgTtftMs, 'ms', 'Avg TTFT (Time to First Token)'); }
				html += perfCard(successCount + '/' + allRequests.length, '', 'Success Rate');
				html += perfCard(totalCacheHits, '', 'Cache Hits');
				html += '</div>';
			}

			panel.innerHTML = html;
		}

		function perfCard(value, unit, label) {
			return '<div class="perf-card"><div class="value">' + esc(String(value)) + '<span class="unit">' + esc(unit) + '</span></div><div class="label">' + esc(label) + '</div></div>';
		}

		function renderReplay(req) {
			const panel = document.getElementById('panel-replay');
			if (!req) {
				panel.innerHTML = '<div class="empty-state"><div class="icon">\ud83d\udd04</div><p>Select a request to replay it.</p></div>';
				return;
			}

			// Extract system prompt and user query from context items
			const sysItem = req.contextItems.find(item => item.kind === 'system-message');
			const userItems = req.contextItems.filter(item => item.kind === 'user-message');
			const userQuery = userItems.length > 0 ? (userItems[userItems.length - 1].preview || '') : '';

			let html = '<div class="replay-field">';
			html += '<p class="replay-desc">Edit the query, pick a model, then click Run Replay to see the response alongside the original captured metrics.</p>';
			html += '</div>';

			// System prompt (read-only reference)
			if (sysItem && sysItem.preview) {
				html += '<div class="replay-field">';
				html += '<label class="replay-label">System Prompt (reference \u2014 read only)</label>';
				html += '<div class="replay-sysprompt">' + esc(sysItem.preview) + '</div>';
				html += '</div>';
			}

			// User query editor
			html += '<div class="replay-field">';
			html += '<label class="replay-label">User Query (editable)</label>';
			html += '<textarea class="replay-textarea" id="replay-query">' + esc(userQuery) + '</textarea>';
			html += '</div>';

			// Model selector
			html += '<div class="replay-field">';
			html += '<label class="replay-label">Model</label>';
			if (replayState.availableModels.length === 0) {
				html += '<div style="font-size:11px;opacity:0.5">Loading available models...</div>';
			} else {
				html += '<select class="replay-select" id="replay-model">';
				replayState.availableModels.forEach(m => {
					const selected = replayState.selectedModelId === m.id ? ' selected' : '';
					html += '<option value="' + esc(m.id) + '"' + selected + '>' + esc(m.name) + ' (' + esc(m.family) + ')' + '</option>';
				});
				html += '</select>';
			}
			html += '</div>';

			// Run button \u2014 shows spinner only for THIS request's active replay
			if (replayState.runningRequestId === req.id) {
				html += '<button class="replay-run-btn" disabled>Running...</button>';
				html += '<div class="replay-spinner">Waiting for model response...</div>';
			} else {
				html += '<button class="replay-run-btn" id="replay-run-btn">Run Replay</button>';
			}

			// Always show original response
			html += '<hr class="replay-divider">';
			html += '<h3>Original Response</h3>';
			html += '<div class="replay-result-card">';
			html += '<div class="replay-card-header">Original \u2014 ' + esc(req.model) + '</div>';
			html += '<div class="replay-card-stats">';
			html += '<span class="replay-card-stat">' + (req.performance ? esc(String(req.performance.totalDurationMs)) + 'ms' : 'N/A') + '</span>';
			if (req.tokenBudget) {
				html += '<span class="replay-card-stat">' + req.tokenBudget.promptTokens.toLocaleString() + ' prompt tokens</span>';
				html += '<span class="replay-card-stat">' + req.tokenBudget.completionTokens.toLocaleString() + ' completion tokens</span>';
			}
			if (req.performance && req.performance.cacheHit) {
				html += '<span class="replay-card-stat">cache hit</span>';
			}
			html += '</div>';
			if (req.responseText) {
				html += '<div class="replay-card-body">' + esc(req.responseText) + '</div>';
			} else {
				html += '<div class="replay-card-body no-data">Response text not captured for this request.</div>';
			}
			html += '</div>';

			// Replay comparison \u2014 shown after running a replay
			const res = replayState.results[req.id];
			if (res && res.requestId === req.id) {
				html += '<hr class="replay-divider">';
				html += '<h3>Replay Comparison</h3>';
				// Dynamic note: if we have both original and replay prompt tokens, show the delta
				let noteText = 'Replay sends only your user query \u2014 no system prompt, conversation history, or context.';
				if (!res.error && res.promptTokens > 0 && req.tokenBudget && req.tokenBudget.promptTokens > res.promptTokens) {
					const overhead = req.tokenBudget.promptTokens - res.promptTokens;
					noteText += ' The original had ' + overhead.toLocaleString() + ' extra tokens of Copilot system prompt + context not sent in replay.';
				}
				noteText += ' The replay appears as the next captured session above \u2014 its prompt tokens will be slightly higher (~40 tokens) because Copilot adds a hidden system wrapper even to API calls.';
				html += '<div class="replay-note">' + noteText + '</div>';

				html += '<div class="replay-result-card">';
				html += '<div class="replay-card-header">Replay \u2014 ' + esc(res.model) + '</div>';
				if (res.error) {
					html += '<div class="replay-error-msg">Error: ' + esc(res.error) + '</div>';
				} else {
					html += '<div class="replay-card-stats">';
					html += '<span class="replay-card-stat">' + esc(String(res.latencyMs)) + 'ms</span>';
					if (res.promptTokens > 0) {
						html += '<span class="replay-card-stat" title="Tokens counted for your user message only. Copilot adds ~40 tokens of hidden system wrapper, visible in the next captured session.">' + res.promptTokens.toLocaleString() + ' prompt tokens (user msg only)</span>';
					}
					if (res.completionTokens > 0) {
						html += '<span class="replay-card-stat">' + res.completionTokens.toLocaleString() + ' completion tokens</span>';
					}
					html += '<span class="replay-card-stat replay-card-stat-muted" title="Cache hit data is not exposed by the VS Code public language model API">cache: N/A</span>';
					html += '</div>';
					html += '<div class="replay-card-body">' + esc(res.responseText) + '</div>';
				}
				html += '</div>';
			}

			panel.innerHTML = html;

			// Wire event handlers via addEventListener (inline onclick blocked by CSP)
			const runBtn = document.getElementById('replay-run-btn');
			if (runBtn) {
				runBtn.addEventListener('click', () => {
					const queryEl = document.getElementById('replay-query');
					const modelEl = document.getElementById('replay-model');
					const query = queryEl ? queryEl.value.trim() : '';
					const modelId = modelEl ? modelEl.value : '';
					if (!query || !modelId) { return; }
					replayState.selectedModelId = modelId;
					vscode.postMessage({ type: 'runReplay', requestId: req.id, userQuery: query, modelId });
				});
			}

			const modelEl = document.getElementById('replay-model');
			if (modelEl) {
				modelEl.addEventListener('change', e => {
					replayState.selectedModelId = e.target.value;
				});
			}
		}

		// Request initial data
		vscode.postMessage({ type: 'refresh' });
	</script>
</body>
</html>`;
	}
}

function getNonce(): string {
	const bytes = new Uint8Array(32);
	// crypto.getRandomValues is cryptographically secure (CSPRNG), unlike Math.random()
	globalThis.crypto.getRandomValues(bytes);
	// Base64url-encode: safe for use in HTML attributes and CSP headers
	return Buffer.from(bytes).toString('base64url');
}
