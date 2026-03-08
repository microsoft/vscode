/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AgentManager } from '../agents/AgentManager';
import { MetricsTracker } from '../agents/MetricsTracker';
import { BackgroundTaskClient, BackgroundTask } from '../background/BackgroundTaskClient';

/**
 * Agent fleet monitoring dashboard.
 * Shows all agent activity — foreground and background — with metrics,
 * task history, token spend, and alerts.
 */
export class FleetDashboardPanel {
	private static instance: FleetDashboardPanel | undefined;
	private readonly panel: vscode.WebviewPanel;
	private readonly agentManager: AgentManager;
	private readonly metricsTracker: MetricsTracker;
	private readonly backgroundClient: BackgroundTaskClient;
	private refreshTimer: ReturnType<typeof setInterval> | null = null;

	private constructor(
		extensionUri: vscode.Uri,
		agentManager: AgentManager,
		metricsTracker: MetricsTracker,
		backgroundClient: BackgroundTaskClient,
	) {
		this.agentManager = agentManager;
		this.metricsTracker = metricsTracker;
		this.backgroundClient = backgroundClient;

		this.panel = vscode.window.createWebviewPanel(
			'sota.fleetDashboard',
			'Agent Fleet Dashboard',
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
			}
		);

		this.panel.onDidDispose(() => {
			FleetDashboardPanel.instance = undefined;
			this.stopRefresh();
		});

		this.panel.webview.onDidReceiveMessage(async message => {
			switch (message.command) {
				case 'refresh':
					await this.updateDashboard();
					break;
				case 'cancelTask':
					await this.backgroundClient.cancelTask(message.taskId);
					await this.updateDashboard();
					break;
				case 'viewResults':
					vscode.commands.executeCommand('sota.showBackgroundTaskResults', message.taskId);
					break;
			}
		});

		this.updateDashboard();
		this.startRefresh();
	}

	static createOrShow(
		extensionUri: vscode.Uri,
		agentManager: AgentManager,
		metricsTracker: MetricsTracker,
		backgroundClient: BackgroundTaskClient,
	): FleetDashboardPanel {
		if (FleetDashboardPanel.instance) {
			FleetDashboardPanel.instance.panel.reveal();
			return FleetDashboardPanel.instance;
		}

		FleetDashboardPanel.instance = new FleetDashboardPanel(
			extensionUri, agentManager, metricsTracker, backgroundClient
		);
		return FleetDashboardPanel.instance;
	}

	private startRefresh(): void {
		this.refreshTimer = setInterval(() => {
			this.updateDashboard();
		}, 10000);
	}

	private stopRefresh(): void {
		if (this.refreshTimer) {
			clearInterval(this.refreshTimer);
			this.refreshTimer = null;
		}
	}

	private async updateDashboard(): Promise<void> {
		const [backgroundTasks, foregroundMetrics] = await Promise.all([
			this.backgroundClient.listTasks(),
			Promise.resolve(this.metricsTracker.getAllMetrics()),
		]);

		const activeTasks = backgroundTasks.filter(
			t => t.status === 'running' || t.status === 'pending'
		);
		const completedTasks = backgroundTasks.filter(
			t => t.status !== 'running' && t.status !== 'pending'
		);

		const alerts = this.generateAlerts(backgroundTasks, foregroundMetrics);

		this.panel.webview.html = this.buildHtml(
			activeTasks,
			completedTasks,
			foregroundMetrics,
			alerts,
		);
	}

	private generateAlerts(
		tasks: BackgroundTask[],
		_metrics: ReturnType<MetricsTracker['getAllMetrics']>,
	): Alert[] {
		const alerts: Alert[] = [];

		for (const task of tasks) {
			if (task.status === 'failed' && task.error) {
				alerts.push({
					type: 'error',
					message: `Task "${task.name}" failed: ${task.error}`,
					taskId: task.id,
				});
			}
			if (task.status === 'timeout') {
				alerts.push({
					type: 'warning',
					message: `Task "${task.name}" timed out after ${formatDuration(task.resourceLimits.timeoutMs)}`,
					taskId: task.id,
				});
			}
			if (task.tokenUsage.estimatedCostUsd >= task.resourceLimits.maxTokenBudgetUsd * 0.9) {
				alerts.push({
					type: 'warning',
					message: `Task "${task.name}" approaching token budget ($${task.tokenUsage.estimatedCostUsd.toFixed(2)} / $${task.resourceLimits.maxTokenBudgetUsd})`,
					taskId: task.id,
				});
			}
		}

		return alerts;
	}

	private buildHtml(
		activeTasks: BackgroundTask[],
		completedTasks: BackgroundTask[],
		metrics: ReturnType<MetricsTracker['getAllMetrics']>,
		alerts: Alert[],
	): string {
		const totalTokens = metrics.reduce((sum, m) => sum + m.totalInputTokens + m.totalOutputTokens, 0);
		const totalInvocations = metrics.reduce((sum, m) => sum + m.totalInvocations, 0);
		const avgSuccessRate = metrics.length > 0
			? metrics.reduce((sum, m) =>
				sum + (m.totalInvocations > 0 ? m.firstPassSuccessCount / m.totalInvocations : 0), 0
			) / metrics.length * 100
			: 0;

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Agent Fleet Dashboard</title>
	<style>
		body {
			font-family: var(--vscode-font-family, sans-serif);
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
			padding: 16px;
			margin: 0;
		}
		h1 { font-size: 1.4em; margin-bottom: 16px; }
		h2 { font-size: 1.1em; margin: 16px 0 8px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 4px; }
		.metrics-grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
			gap: 12px;
			margin-bottom: 16px;
		}
		.metric-card {
			background: var(--vscode-editor-inactiveSelectionBackground);
			border-radius: 6px;
			padding: 12px;
			text-align: center;
		}
		.metric-value { font-size: 1.8em; font-weight: bold; color: var(--vscode-textLink-foreground); }
		.metric-label { font-size: 0.85em; opacity: 0.7; margin-top: 4px; }
		.alert {
			padding: 8px 12px;
			border-radius: 4px;
			margin-bottom: 6px;
			display: flex;
			align-items: center;
			gap: 8px;
		}
		.alert-error { background: var(--vscode-inputValidation-errorBackground); border: 1px solid var(--vscode-inputValidation-errorBorder); }
		.alert-warning { background: var(--vscode-inputValidation-warningBackground); border: 1px solid var(--vscode-inputValidation-warningBorder); }
		table {
			width: 100%;
			border-collapse: collapse;
			font-size: 0.9em;
		}
		th, td {
			padding: 6px 10px;
			text-align: left;
			border-bottom: 1px solid var(--vscode-panel-border);
		}
		th { font-weight: 600; opacity: 0.8; }
		.status-badge {
			display: inline-block;
			padding: 2px 8px;
			border-radius: 10px;
			font-size: 0.8em;
			font-weight: 600;
		}
		.status-running { background: var(--vscode-charts-blue); color: white; }
		.status-completed { background: var(--vscode-charts-green); color: white; }
		.status-failed { background: var(--vscode-charts-red); color: white; }
		.status-pending { background: var(--vscode-charts-yellow); color: black; }
		.status-cancelled, .status-timeout { background: var(--vscode-charts-orange); color: white; }
		.progress-bar {
			width: 100%;
			height: 6px;
			background: var(--vscode-progressBar-background);
			border-radius: 3px;
			overflow: hidden;
		}
		.progress-fill {
			height: 100%;
			background: var(--vscode-textLink-foreground);
			transition: width 0.3s ease;
		}
		button {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			padding: 4px 12px;
			border-radius: 4px;
			cursor: pointer;
			font-size: 0.85em;
		}
		button:hover { background: var(--vscode-button-hoverBackground); }
		.btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
		.empty { opacity: 0.6; font-style: italic; padding: 12px; }
	</style>
</head>
<body>
	<h1>Agent Fleet Dashboard</h1>

	${alerts.length > 0 ? `
	<div class="alerts">
		${alerts.map(a => `
			<div class="alert alert-${a.type}">
				<span>${a.type === 'error' ? '&#x26D4;' : '&#x26A0;'}</span>
				<span>${escapeHtml(a.message)}</span>
			</div>
		`).join('')}
	</div>` : ''}

	<div class="metrics-grid">
		<div class="metric-card">
			<div class="metric-value">${activeTasks.length}</div>
			<div class="metric-label">Active Agents</div>
		</div>
		<div class="metric-card">
			<div class="metric-value">${totalInvocations}</div>
			<div class="metric-label">Total Invocations</div>
		</div>
		<div class="metric-card">
			<div class="metric-value">${avgSuccessRate.toFixed(1)}%</div>
			<div class="metric-label">Success Rate</div>
		</div>
		<div class="metric-card">
			<div class="metric-value">${formatTokenCount(totalTokens)}</div>
			<div class="metric-label">Total Tokens</div>
		</div>
	</div>

	<h2>Active Tasks</h2>
	${activeTasks.length === 0 ? '<p class="empty">No active tasks</p>' : `
	<table>
		<thead><tr><th>Name</th><th>Status</th><th>Progress</th><th>Duration</th><th>Actions</th></tr></thead>
		<tbody>
		${activeTasks.map(t => `
			<tr>
				<td>${escapeHtml(t.name)}</td>
				<td><span class="status-badge status-${t.status}">${t.status}</span></td>
				<td>
					<div class="progress-bar"><div class="progress-fill" style="width:${t.progress.percentage}%"></div></div>
					<small>${escapeHtml(t.progress.message)}</small>
				</td>
				<td>${t.startedAt ? formatDuration(Date.now() - t.startedAt) : '-'}</td>
				<td><button onclick="cancelTask('${t.id}')">Cancel</button></td>
			</tr>
		`).join('')}
		</tbody>
	</table>`}

	<h2>Completed Tasks</h2>
	${completedTasks.length === 0 ? '<p class="empty">No completed tasks</p>' : `
	<table>
		<thead><tr><th>Name</th><th>Status</th><th>Duration</th><th>Cost</th><th>Actions</th></tr></thead>
		<tbody>
		${completedTasks.slice(0, 20).map(t => `
			<tr>
				<td>${escapeHtml(t.name)}</td>
				<td><span class="status-badge status-${t.status}">${t.status}</span></td>
				<td>${t.startedAt && t.completedAt ? formatDuration(t.completedAt - t.startedAt) : '-'}</td>
				<td>$${t.tokenUsage.estimatedCostUsd.toFixed(2)}</td>
				<td><button class="btn-secondary" onclick="viewResults('${t.id}')">Results</button></td>
			</tr>
		`).join('')}
		</tbody>
	</table>`}

	<h2>Agent Metrics</h2>
	${metrics.length === 0 ? '<p class="empty">No agent metrics recorded yet</p>' : `
	<table>
		<thead><tr><th>Agent</th><th>Invocations</th><th>Success Rate</th><th>Avg Retries</th><th>Avg Latency</th></tr></thead>
		<tbody>
		${metrics.map(m => `
			<tr>
				<td>${escapeHtml(m.agentHandle)}</td>
				<td>${m.totalInvocations}</td>
				<td>${m.totalInvocations > 0 ? (m.firstPassSuccessCount / m.totalInvocations * 100).toFixed(1) : 'N/A'}%</td>
				<td>${m.totalInvocations > 0 ? (m.totalRetries / m.totalInvocations).toFixed(2) : '0'}</td>
				<td>${Math.round(m.averageLatencyMs)}ms</td>
			</tr>
		`).join('')}
		</tbody>
	</table>`}

	<div style="margin-top: 16px; text-align: right;">
		<button onclick="refresh()">Refresh</button>
	</div>

	<script>
		const vscode = acquireVsCodeApi();
		function refresh() { vscode.postMessage({ command: 'refresh' }); }
		function cancelTask(taskId) { vscode.postMessage({ command: 'cancelTask', taskId }); }
		function viewResults(taskId) { vscode.postMessage({ command: 'viewResults', taskId }); }
	</script>
</body>
</html>`;
	}
}

interface Alert {
	type: 'error' | 'warning';
	message: string;
	taskId: string;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${ms}ms`;
	}
	if (ms < 60000) {
		return `${(ms / 1000).toFixed(1)}s`;
	}
	if (ms < 3600000) {
		return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
	}
	return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

function formatTokenCount(count: number): string {
	if (count < 1000) {
		return String(count);
	}
	if (count < 1000000) {
		return `${(count / 1000).toFixed(1)}K`;
	}
	return `${(count / 1000000).toFixed(1)}M`;
}
