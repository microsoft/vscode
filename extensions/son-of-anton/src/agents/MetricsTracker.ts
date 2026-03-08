/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AgentHandle, AgentMetrics, TokenUsage } from './types';

/**
 * Tracks per-agent metrics: success rates, retries, escalations, and token usage.
 * Persists metrics to .son-of-anton/metrics/ for review.
 */
export class MetricsTracker {
	private readonly metrics: Map<AgentHandle, AgentMetrics> = new Map();
	private readonly latencies: Map<AgentHandle, number[]> = new Map();

	private ensureMetrics(handle: AgentHandle): AgentMetrics {
		let m = this.metrics.get(handle);
		if (!m) {
			m = {
				agentHandle: handle,
				totalInvocations: 0,
				firstPassSuccessCount: 0,
				totalRetries: 0,
				escalationCount: 0,
				totalInputTokens: 0,
				totalOutputTokens: 0,
				totalNaiveInputTokens: 0,
				averageLatencyMs: 0,
				failureModes: new Map(),
			};
			this.metrics.set(handle, m);
			this.latencies.set(handle, []);
		}
		return m;
	}

	recordInvocation(handle: AgentHandle, latencyMs: number, tokenUsage: TokenUsage): void {
		const m = this.ensureMetrics(handle);
		m.totalInvocations++;
		m.totalInputTokens += tokenUsage.inputTokens;
		m.totalOutputTokens += tokenUsage.outputTokens;
		m.totalNaiveInputTokens += tokenUsage.naiveInputTokens;

		const latencyList = this.latencies.get(handle)!;
		latencyList.push(latencyMs);
		m.averageLatencyMs = latencyList.reduce((a, b) => a + b, 0) / latencyList.length;
	}

	recordFirstPassSuccess(handle: AgentHandle): void {
		this.ensureMetrics(handle).firstPassSuccessCount++;
	}

	recordRetry(handle: AgentHandle): void {
		this.ensureMetrics(handle).totalRetries++;
	}

	recordEscalation(handle: AgentHandle): void {
		this.ensureMetrics(handle).escalationCount++;
	}

	recordFailureMode(handle: AgentHandle, mode: string): void {
		const m = this.ensureMetrics(handle);
		const count = m.failureModes.get(mode) ?? 0;
		m.failureModes.set(mode, count + 1);
	}

	getMetrics(handle: AgentHandle): AgentMetrics | undefined {
		return this.metrics.get(handle);
	}

	getAllMetrics(): AgentMetrics[] {
		return [...this.metrics.values()];
	}

	/**
	 * Calculate token savings percentage from graph-routed context.
	 */
	getTokenSavings(handle: AgentHandle): number {
		const m = this.metrics.get(handle);
		if (!m || m.totalNaiveInputTokens === 0) {
			return 0;
		}
		return ((m.totalNaiveInputTokens - m.totalInputTokens) / m.totalNaiveInputTokens) * 100;
	}

	/**
	 * Persist metrics to the workspace .son-of-anton/metrics/ directory.
	 */
	async persistMetrics(): Promise<void> {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders?.length) {
			return;
		}

		const metricsDir = vscode.Uri.joinPath(workspaceFolders[0].uri, '.son-of-anton', 'metrics');
		await vscode.workspace.fs.createDirectory(metricsDir);

		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const data: Record<string, unknown> = {};

		for (const [handle, m] of this.metrics) {
			data[handle] = {
				totalInvocations: m.totalInvocations,
				firstPassSuccessRate: m.totalInvocations > 0
					? (m.firstPassSuccessCount / m.totalInvocations * 100).toFixed(1) + '%'
					: 'N/A',
				averageRetries: m.totalInvocations > 0
					? (m.totalRetries / m.totalInvocations).toFixed(2)
					: '0',
				escalationRate: m.totalInvocations > 0
					? (m.escalationCount / m.totalInvocations * 100).toFixed(1) + '%'
					: 'N/A',
				tokenSavings: this.getTokenSavings(handle).toFixed(1) + '%',
				averageLatencyMs: Math.round(m.averageLatencyMs),
				failureModes: Object.fromEntries(m.failureModes),
			};
		}

		const content = Buffer.from(JSON.stringify(data, null, '\t'));
		const fileUri = vscode.Uri.joinPath(metricsDir, `metrics-${timestamp}.json`);
		await vscode.workspace.fs.writeFile(fileUri, content);
	}

	/**
	 * Format metrics as a human-readable summary string.
	 */
	formatSummary(): string {
		const lines: string[] = ['## Agent Metrics Summary\n'];

		for (const m of this.metrics.values()) {
			const successRate = m.totalInvocations > 0
				? (m.firstPassSuccessCount / m.totalInvocations * 100).toFixed(1)
				: 'N/A';
			const savings = this.getTokenSavings(m.agentHandle).toFixed(1);

			lines.push(`### ${m.agentHandle}`);
			lines.push(`- Invocations: ${m.totalInvocations}`);
			lines.push(`- First-pass success: ${successRate}%`);
			lines.push(`- Avg retries: ${m.totalInvocations > 0 ? (m.totalRetries / m.totalInvocations).toFixed(2) : '0'}`);
			lines.push(`- Escalations: ${m.escalationCount}`);
			lines.push(`- Token savings: ${savings}%`);
			lines.push(`- Avg latency: ${Math.round(m.averageLatencyMs)}ms`);
			lines.push('');
		}

		return lines.join('\n');
	}
}
