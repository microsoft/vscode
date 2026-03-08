/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { AgentManager } from '../agents/AgentManager';

/**
 * Webview panel that displays OpenTelemetry-style traces of agent activity.
 * Shows a timeline of spans with filtering and detail views.
 */
export class TraceViewerPanel {
	private static currentPanel: TraceViewerPanel | undefined;
	private readonly panel: vscode.WebviewPanel;
	private readonly agentManager: AgentManager;
	private readonly disposables: vscode.Disposable[] = [];

	private constructor(
		panel: vscode.WebviewPanel,
		context: vscode.ExtensionContext,
		agentManager: AgentManager,
	) {
		this.panel = panel;
		this.agentManager = agentManager;

		this.panel.webview.html = this.getHtmlContent(context);
		this.setupMessageHandler();

		// Send initial trace data
		this.sendTraceData();

		// Update on new spans
		this.disposables.push(
			agentManager.onDidAddSpan(() => this.sendTraceData())
		);

		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
	}

	static createOrShow(context: vscode.ExtensionContext, agentManager: AgentManager): void {
		if (TraceViewerPanel.currentPanel) {
			TraceViewerPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			'sotaTraces',
			'Son of Anton Traces',
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
			}
		);

		TraceViewerPanel.currentPanel = new TraceViewerPanel(panel, context, agentManager);
	}

	private sendTraceData(): void {
		const spans = this.agentManager.getAllSpans();
		const tasks = this.agentManager.getAllTasks();
		const usage = this.agentManager.getLlmClient().getTokenUsage();
		const cost = this.agentManager.getLlmClient().estimateCost();

		this.panel.webview.postMessage({
			type: 'traceData',
			spans,
			tasks,
			tokenUsage: usage,
			estimatedCost: cost.toFixed(4),
		});
	}

	private setupMessageHandler(): void {
		this.panel.webview.onDidReceiveMessage(
			(message: { type: string; format?: string }) => {
				switch (message.type) {
					case 'exportTraces': {
						const spans = this.agentManager.getAllSpans();
						const tasks = this.agentManager.getAllTasks();
						const data = JSON.stringify({ spans, tasks }, null, 2);
						vscode.env.clipboard.writeText(data);
						vscode.window.showInformationMessage('Traces copied to clipboard as JSON.');
						break;
					}
					case 'refresh':
						this.sendTraceData();
						break;
				}
			},
			null,
			this.disposables
		);
	}

	private getHtmlContent(_context: vscode.ExtensionContext): string {
		return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
	<title>Agent Traces</title>
	<style>
		body {
			margin: 0;
			padding: 16px;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
		}

		.toolbar {
			display: flex;
			gap: 8px;
			margin-bottom: 16px;
			align-items: center;
		}

		.toolbar select, .toolbar input {
			padding: 4px 8px;
			background-color: var(--vscode-dropdown-background);
			color: var(--vscode-dropdown-foreground);
			border: 1px solid var(--vscode-dropdown-border);
			border-radius: 3px;
		}

		.toolbar button {
			padding: 4px 12px;
			background-color: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			border-radius: 3px;
			cursor: pointer;
		}

		.toolbar button:hover {
			background-color: var(--vscode-button-hoverBackground);
		}

		.stats {
			display: flex;
			gap: 16px;
			margin-bottom: 16px;
			padding: 8px 12px;
			background-color: var(--vscode-input-background);
			border-radius: 4px;
			font-size: 0.9em;
		}

		.stats .stat-label {
			color: var(--vscode-descriptionForeground);
		}

		.timeline {
			position: relative;
		}

		.span-row {
			display: flex;
			align-items: center;
			padding: 4px 0;
			border-bottom: 1px solid var(--vscode-panel-border);
			cursor: pointer;
		}

		.span-row:hover {
			background-color: var(--vscode-list-hoverBackground);
		}

		.span-name {
			width: 200px;
			flex-shrink: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			font-size: 0.9em;
		}

		.span-type {
			width: 80px;
			flex-shrink: 0;
			font-size: 0.8em;
			color: var(--vscode-descriptionForeground);
		}

		.span-bar-container {
			flex: 1;
			height: 16px;
			position: relative;
			background-color: var(--vscode-input-background);
			border-radius: 2px;
		}

		.span-bar {
			position: absolute;
			height: 100%;
			border-radius: 2px;
			min-width: 2px;
		}

		.span-bar.llm_call { background-color: var(--vscode-charts-blue); }
		.span-bar.mcp_tool { background-color: var(--vscode-charts-green); }
		.span-bar.file_change { background-color: var(--vscode-charts-yellow); }
		.span-bar.hook { background-color: var(--vscode-charts-orange); }
		.span-bar.lifecycle { background-color: var(--vscode-charts-purple); }

		.span-duration {
			width: 80px;
			flex-shrink: 0;
			text-align: right;
			font-size: 0.8em;
			color: var(--vscode-descriptionForeground);
		}

		.detail-panel {
			display: none;
			margin-top: 16px;
			padding: 12px;
			background-color: var(--vscode-input-background);
			border-radius: 4px;
			border: 1px solid var(--vscode-panel-border);
		}

		.detail-panel.visible {
			display: block;
		}

		.detail-panel h3 {
			margin: 0 0 8px 0;
			font-size: 1em;
		}

		.detail-panel table {
			width: 100%;
			border-collapse: collapse;
		}

		.detail-panel td {
			padding: 4px 8px;
			border-bottom: 1px solid var(--vscode-panel-border);
			font-size: 0.9em;
		}

		.detail-panel td:first-child {
			width: 150px;
			color: var(--vscode-descriptionForeground);
		}

		.empty-state {
			text-align: center;
			padding: 40px;
			color: var(--vscode-descriptionForeground);
		}
	</style>
</head>
<body>
	<div class="toolbar">
		<select id="filterType">
			<option value="all">All Types</option>
			<option value="llm_call">LLM Calls</option>
			<option value="mcp_tool">MCP Tools</option>
			<option value="file_change">File Changes</option>
			<option value="hook">Hooks</option>
			<option value="lifecycle">Lifecycle</option>
		</select>
		<button id="refreshBtn">Refresh</button>
		<button id="exportBtn">Export JSON</button>
	</div>

	<div class="stats" id="stats">
		<div><span class="stat-label">Spans:</span> <span id="spanCount">0</span></div>
		<div><span class="stat-label">Input tokens:</span> <span id="inputTokens">0</span></div>
		<div><span class="stat-label">Output tokens:</span> <span id="outputTokens">0</span></div>
		<div><span class="stat-label">Est. cost:</span> $<span id="estCost">0.00</span></div>
	</div>

	<div class="timeline" id="timeline">
		<div class="empty-state">No traces yet. Agent activity will appear here.</div>
	</div>

	<div class="detail-panel" id="detailPanel">
		<h3 id="detailTitle">Span Details</h3>
		<table id="detailTable"><tbody></tbody></table>
	</div>

	<script>
		const vscode = acquireVsCodeApi();
		let allSpans = [];

		const filterType = document.getElementById('filterType');
		const timeline = document.getElementById('timeline');
		const detailPanel = document.getElementById('detailPanel');
		const detailTitle = document.getElementById('detailTitle');
		const detailTable = document.getElementById('detailTable');

		document.getElementById('refreshBtn').addEventListener('click', () => {
			vscode.postMessage({ type: 'refresh' });
		});

		document.getElementById('exportBtn').addEventListener('click', () => {
			vscode.postMessage({ type: 'exportTraces' });
		});

		filterType.addEventListener('change', () => renderTimeline());

		function renderTimeline() {
			const filter = filterType.value;
			const spans = filter === 'all' ? allSpans : allSpans.filter(s => s.type === filter);

			if (spans.length === 0) {
				timeline.innerHTML = '<div class="empty-state">No traces match the current filter.</div>';
				return;
			}

			const minTime = Math.min(...spans.map(s => s.startTime));
			const maxTime = Math.max(...spans.map(s => s.endTime || Date.now()));
			const totalDuration = maxTime - minTime || 1;

			timeline.innerHTML = spans.map(span => {
				const start = ((span.startTime - minTime) / totalDuration) * 100;
				const end = span.endTime ? span.endTime : Date.now();
				const width = Math.max(1, ((end - span.startTime) / totalDuration) * 100);
				const duration = end - span.startTime;

				return '<div class="span-row" data-span-id="' + span.id + '">' +
					'<div class="span-name">' + escapeHtml(span.name) + '</div>' +
					'<div class="span-type">' + span.type + '</div>' +
					'<div class="span-bar-container">' +
					'<div class="span-bar ' + span.type + '" style="left:' + start + '%;width:' + width + '%"></div>' +
					'</div>' +
					'<div class="span-duration">' + formatDuration(duration) + '</div>' +
					'</div>';
			}).join('');

			// Click handlers
			timeline.querySelectorAll('.span-row').forEach(row => {
				row.addEventListener('click', () => {
					const spanId = row.getAttribute('data-span-id');
					const span = allSpans.find(s => s.id === spanId);
					if (span) showDetail(span);
				});
			});
		}

		function showDetail(span) {
			detailTitle.textContent = span.name;
			const rows = [
				['Type', span.type],
				['Start', new Date(span.startTime).toISOString()],
				['Duration', formatDuration((span.endTime || Date.now()) - span.startTime)],
				['Task ID', span.taskId],
			];
			for (const [key, value] of Object.entries(span.attributes || {})) {
				rows.push([key, String(value)]);
			}
			detailTable.innerHTML = '<tbody>' + rows.map(([k, v]) =>
				'<tr><td>' + escapeHtml(k) + '</td><td>' + escapeHtml(v) + '</td></tr>'
			).join('') + '</tbody>';
			detailPanel.classList.add('visible');
		}

		function escapeHtml(text) {
			const div = document.createElement('div');
			div.textContent = text;
			return div.innerHTML;
		}

		function formatDuration(ms) {
			if (ms < 1000) return ms + 'ms';
			if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
			return (ms / 60000).toFixed(1) + 'm';
		}

		window.addEventListener('message', (event) => {
			const message = event.data;
			if (message.type === 'traceData') {
				allSpans = message.spans || [];
				document.getElementById('spanCount').textContent = allSpans.length;
				document.getElementById('inputTokens').textContent = message.tokenUsage?.input || 0;
				document.getElementById('outputTokens').textContent = message.tokenUsage?.output || 0;
				document.getElementById('estCost').textContent = message.estimatedCost || '0.00';
				renderTimeline();
			}
		});
	</script>
</body>
</html>`;
	}

	private dispose(): void {
		TraceViewerPanel.currentPanel = undefined;
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}
