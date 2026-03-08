/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ImpactAnalysisPanel — visual "blast radius" view for code changes.
 *
 * Shows what breaks if you change a function, class, or file.
 * Renders a graph visualization with color-coded nodes:
 * - Red: directly affected (direct callers, direct dependents)
 * - Amber: indirectly affected (transitive dependencies, depth 2+)
 * - Green: test files that cover the affected code
 * - Grey: documentation that references the affected code
 */

import * as vscode from 'vscode';

export interface ImpactNode {
	id: string;
	label: string;
	filePath: string;
	symbolName?: string;
	type: 'direct' | 'transitive' | 'test' | 'documentation';
	depth: number;
	signature?: string;
}

export interface ImpactEdge {
	source: string;
	target: string;
	relationship: string;
}

export interface ImpactAnalysisData {
	/** The symbol being analyzed */
	target: {
		name: string;
		filePath: string;
		signature?: string;
	};
	nodes: ImpactNode[];
	edges: ImpactEdge[];
	summary: {
		directCount: number;
		transitiveCount: number;
		testCount: number;
		documentationCount: number;
	};
}

export class ImpactAnalysisPanel {
	private static currentPanel: ImpactAnalysisPanel | undefined;
	private readonly panel: vscode.WebviewPanel;
	private readonly extensionUri: vscode.Uri;
	private disposables: vscode.Disposable[] = [];

	private constructor(
		panel: vscode.WebviewPanel,
		extensionUri: vscode.Uri,
	) {
		this.panel = panel;
		this.extensionUri = extensionUri;

		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

		this.panel.webview.onDidReceiveMessage(
			message => this.handleMessage(message),
			null,
			this.disposables,
		);
	}

	/**
	 * Create or reveal the impact analysis panel.
	 */
	static createOrShow(extensionUri: vscode.Uri): ImpactAnalysisPanel {
		const column = vscode.ViewColumn.Beside;

		if (ImpactAnalysisPanel.currentPanel) {
			ImpactAnalysisPanel.currentPanel.panel.reveal(column);
			return ImpactAnalysisPanel.currentPanel;
		}

		const panel = vscode.window.createWebviewPanel(
			'sonOfAntonImpactAnalysis',
			'Impact Analysis',
			column,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [extensionUri],
			},
		);

		ImpactAnalysisPanel.currentPanel = new ImpactAnalysisPanel(panel, extensionUri);
		return ImpactAnalysisPanel.currentPanel;
	}

	/**
	 * Update the panel with new impact analysis data.
	 */
	update(data: ImpactAnalysisData): void {
		this.panel.webview.html = this.getHtml(data);
	}

	private handleMessage(message: { command: string; filePath?: string; line?: number }): void {
		switch (message.command) {
			case 'navigateToFile':
				if (message.filePath) {
					const uri = vscode.Uri.file(message.filePath);
					const options: vscode.TextDocumentShowOptions = {};
					if (message.line) {
						options.selection = new vscode.Range(message.line - 1, 0, message.line - 1, 0);
					}
					vscode.window.showTextDocument(uri, options);
				}
				break;
		}
	}

	private getHtml(data: ImpactAnalysisData): string {
		const nodeColors: Record<string, string> = {
			direct: '#e74c3c',       // Red
			transitive: '#f39c12',   // Amber
			test: '#2ecc71',         // Green
			documentation: '#95a5a6', // Grey
		};

		const nodesJson = JSON.stringify(data.nodes.map(n => ({
			id: n.id,
			label: n.label,
			color: nodeColors[n.type] ?? '#95a5a6',
			type: n.type,
			filePath: n.filePath,
			symbolName: n.symbolName,
			signature: n.signature,
			depth: n.depth,
		})));

		const edgesJson = JSON.stringify(data.edges.map(e => ({
			from: e.source,
			to: e.target,
			label: e.relationship,
		})));

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Impact Analysis</title>
	<style>
		body {
			margin: 0;
			padding: 0;
			font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
			background: var(--vscode-editor-background, #1e1e1e);
			color: var(--vscode-editor-foreground, #d4d4d4);
		}
		.header {
			padding: 12px 16px;
			border-bottom: 1px solid var(--vscode-panel-border, #333);
		}
		.header h2 {
			margin: 0 0 4px 0;
			font-size: 14px;
		}
		.header .target {
			font-size: 12px;
			opacity: 0.8;
		}
		.summary {
			display: flex;
			gap: 16px;
			padding: 8px 16px;
			font-size: 12px;
			border-bottom: 1px solid var(--vscode-panel-border, #333);
		}
		.summary-item {
			display: flex;
			align-items: center;
			gap: 4px;
		}
		.summary-dot {
			width: 8px;
			height: 8px;
			border-radius: 50%;
		}
		.filters {
			padding: 8px 16px;
			display: flex;
			gap: 8px;
			border-bottom: 1px solid var(--vscode-panel-border, #333);
		}
		.filter-btn {
			padding: 2px 8px;
			font-size: 11px;
			border: 1px solid var(--vscode-button-border, #555);
			border-radius: 3px;
			background: transparent;
			color: var(--vscode-editor-foreground, #d4d4d4);
			cursor: pointer;
		}
		.filter-btn.active {
			background: var(--vscode-button-background, #0e639c);
			color: var(--vscode-button-foreground, #fff);
		}
		.graph-container {
			width: 100%;
			height: calc(100vh - 140px);
			overflow: auto;
		}
		.node-list {
			padding: 8px 16px;
		}
		.node-item {
			padding: 6px 8px;
			margin: 2px 0;
			border-radius: 3px;
			cursor: pointer;
			display: flex;
			align-items: center;
			gap: 8px;
			font-size: 12px;
		}
		.node-item:hover {
			background: var(--vscode-list-hoverBackground, #2a2d2e);
		}
		.node-dot {
			width: 10px;
			height: 10px;
			border-radius: 50%;
			flex-shrink: 0;
		}
		.node-label {
			flex: 1;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.node-path {
			font-size: 10px;
			opacity: 0.6;
		}
		.depth-indent {
			display: inline-block;
		}
	</style>
</head>
<body>
	<div class="header">
		<h2>Impact Analysis</h2>
		<div class="target">${escapeHtml(data.target.name)} — ${escapeHtml(data.target.filePath)}</div>
	</div>
	<div class="summary">
		<div class="summary-item">
			<div class="summary-dot" style="background: #e74c3c"></div>
			Direct: ${data.summary.directCount}
		</div>
		<div class="summary-item">
			<div class="summary-dot" style="background: #f39c12"></div>
			Transitive: ${data.summary.transitiveCount}
		</div>
		<div class="summary-item">
			<div class="summary-dot" style="background: #2ecc71"></div>
			Tests: ${data.summary.testCount}
		</div>
		<div class="summary-item">
			<div class="summary-dot" style="background: #95a5a6"></div>
			Docs: ${data.summary.documentationCount}
		</div>
	</div>
	<div class="filters">
		<button class="filter-btn active" onclick="filterNodes('all')">All</button>
		<button class="filter-btn" onclick="filterNodes('direct')">Direct</button>
		<button class="filter-btn" onclick="filterNodes('transitive')">Transitive</button>
		<button class="filter-btn" onclick="filterNodes('test')">Tests</button>
		<button class="filter-btn" onclick="filterNodes('documentation')">Docs</button>
	</div>
	<div class="graph-container">
		<div class="node-list" id="nodeList"></div>
	</div>
	<script>
		const vscode = acquireVsCodeApi();
		const nodes = ${nodesJson};
		const edges = ${edgesJson};
		let activeFilter = 'all';

		function renderNodes(filter) {
			const container = document.getElementById('nodeList');
			const filtered = filter === 'all' ? nodes : nodes.filter(n => n.type === filter);

			container.innerHTML = filtered.map(node => {
				const indent = node.depth * 16;
				return '<div class="node-item" onclick="navigateToFile(\\'' +
					node.filePath.replace(/'/g, "\\\\'") + '\\')" ' +
					'title="' + escapeAttr(node.signature || node.label) + '\\n' + escapeAttr(node.filePath) + '">' +
					'<div class="depth-indent" style="width: ' + indent + 'px"></div>' +
					'<div class="node-dot" style="background: ' + node.color + '"></div>' +
					'<div class="node-label">' + escapeHtmlJs(node.label) + '</div>' +
					'<div class="node-path">' + escapeHtmlJs(node.filePath) + '</div>' +
					'</div>';
			}).join('');
		}

		function filterNodes(filter) {
			activeFilter = filter;
			document.querySelectorAll('.filter-btn').forEach(btn => {
				btn.classList.toggle('active', btn.textContent.toLowerCase().includes(filter) || filter === 'all' && btn.textContent === 'All');
			});
			renderNodes(filter);
		}

		function navigateToFile(filePath) {
			vscode.postMessage({ command: 'navigateToFile', filePath: filePath });
		}

		function escapeHtmlJs(text) {
			return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		}

		function escapeAttr(text) {
			return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		}

		renderNodes('all');
	</script>
</body>
</html>`;
	}

	private dispose(): void {
		ImpactAnalysisPanel.currentPanel = undefined;
		this.panel.dispose();
		while (this.disposables.length) {
			const x = this.disposables.pop();
			x?.dispose();
		}
	}
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
