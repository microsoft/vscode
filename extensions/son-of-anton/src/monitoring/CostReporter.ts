/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ModelId } from '../llm/LlmClient';

/**
 * Cost entry for a single LLM invocation.
 */
export interface CostEntry {
	timestamp: number;
	model: ModelId;
	agentHandle: string;
	inputTokens: number;
	outputTokens: number;
	cachedInputTokens: number;
	cost: number;
}

/**
 * Weekly cost report.
 */
export interface WeeklyCostReport {
	weekStart: string;
	weekEnd: string;
	totalCost: number;
	costByModel: Record<ModelId, number>;
	costByAgent: Record<string, number>;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCachedTokens: number;
	cacheHitSavings: number;
	previousWeekCost: number | null;
	weekOverWeekChange: number | null;
	projectedMonthlyCost: number;
}

/**
 * Cost per 1M tokens for each model (Anthropic pricing).
 */
const MODEL_COSTS: Record<ModelId, { input: number; output: number; cachedInput: number }> = {
	opus: { input: 15.0, output: 75.0, cachedInput: 1.5 },
	sonnet: { input: 3.0, output: 15.0, cachedInput: 0.3 },
	haiku: { input: 0.25, output: 1.25, cachedInput: 0.025 },
};

/**
 * CostReporter — tracks and reports API spending across models and agents.
 *
 * Responsibilities:
 * 1. Track cost per invocation (model + agent)
 * 2. Generate weekly cost reports
 * 3. Compare week-over-week spending
 * 4. Project monthly costs
 * 5. Persist reports for review
 */
export class CostReporter {
	private readonly entries: CostEntry[] = [];
	private readonly maxEntries = 50000;
	private readonly weeklyReports: WeeklyCostReport[] = [];

	/**
	 * Record a cost entry for an LLM invocation.
	 */
	recordCost(
		model: ModelId,
		agentHandle: string,
		inputTokens: number,
		outputTokens: number,
		cachedInputTokens: number = 0,
	): CostEntry {
		const costs = MODEL_COSTS[model];
		const nonCachedInput = inputTokens - cachedInputTokens;
		const cost = (nonCachedInput / 1_000_000) * costs.input
			+ (cachedInputTokens / 1_000_000) * costs.cachedInput
			+ (outputTokens / 1_000_000) * costs.output;

		const entry: CostEntry = {
			timestamp: Date.now(),
			model,
			agentHandle,
			inputTokens,
			outputTokens,
			cachedInputTokens,
			cost,
		};

		this.entries.push(entry);
		if (this.entries.length > this.maxEntries) {
			this.entries.splice(0, this.entries.length - this.maxEntries);
		}

		return entry;
	}

	/**
	 * Get total cost for a time period.
	 */
	getTotalCost(sinceMs?: number): number {
		const cutoff = sinceMs ? Date.now() - sinceMs : 0;
		return this.entries
			.filter(e => e.timestamp >= cutoff)
			.reduce((sum, e) => sum + e.cost, 0);
	}

	/**
	 * Get cost breakdown by model for a time period.
	 */
	getCostByModel(sinceMs?: number): Record<ModelId, number> {
		const cutoff = sinceMs ? Date.now() - sinceMs : 0;
		const result: Record<ModelId, number> = { opus: 0, sonnet: 0, haiku: 0 };

		for (const entry of this.entries) {
			if (entry.timestamp >= cutoff) {
				result[entry.model] += entry.cost;
			}
		}

		return result;
	}

	/**
	 * Get cost breakdown by agent for a time period.
	 */
	getCostByAgent(sinceMs?: number): Record<string, number> {
		const cutoff = sinceMs ? Date.now() - sinceMs : 0;
		const result: Record<string, number> = {};

		for (const entry of this.entries) {
			if (entry.timestamp >= cutoff) {
				result[entry.agentHandle] = (result[entry.agentHandle] ?? 0) + entry.cost;
			}
		}

		return result;
	}

	/**
	 * Generate a weekly cost report.
	 */
	generateWeeklyReport(): WeeklyCostReport {
		const now = new Date();
		const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
		const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

		const weekMs = 7 * 24 * 60 * 60 * 1000;

		// Current week entries
		const currentWeekEntries = this.entries.filter(
			e => e.timestamp >= weekAgo.getTime()
		);

		// Previous week entries
		const previousWeekEntries = this.entries.filter(
			e => e.timestamp >= twoWeeksAgo.getTime() && e.timestamp < weekAgo.getTime()
		);

		const totalCost = currentWeekEntries.reduce((sum, e) => sum + e.cost, 0);
		const previousWeekCost = previousWeekEntries.length > 0
			? previousWeekEntries.reduce((sum, e) => sum + e.cost, 0)
			: null;

		const costByModel: Record<ModelId, number> = { opus: 0, sonnet: 0, haiku: 0 };
		const costByAgent: Record<string, number> = {};
		let totalInput = 0;
		let totalOutput = 0;
		let totalCached = 0;

		for (const entry of currentWeekEntries) {
			costByModel[entry.model] += entry.cost;
			costByAgent[entry.agentHandle] = (costByAgent[entry.agentHandle] ?? 0) + entry.cost;
			totalInput += entry.inputTokens;
			totalOutput += entry.outputTokens;
			totalCached += entry.cachedInputTokens;
		}

		// Calculate cache savings (what it would have cost without caching)
		let cacheHitSavings = 0;
		for (const entry of currentWeekEntries) {
			const costs = MODEL_COSTS[entry.model];
			const savedPerToken = (costs.input - costs.cachedInput) / 1_000_000;
			cacheHitSavings += entry.cachedInputTokens * savedPerToken;
		}

		const report: WeeklyCostReport = {
			weekStart: weekAgo.toISOString().split('T')[0],
			weekEnd: now.toISOString().split('T')[0],
			totalCost,
			costByModel,
			costByAgent,
			totalInputTokens: totalInput,
			totalOutputTokens: totalOutput,
			totalCachedTokens: totalCached,
			cacheHitSavings,
			previousWeekCost,
			weekOverWeekChange: previousWeekCost !== null
				? ((totalCost - previousWeekCost) / previousWeekCost) * 100
				: null,
			projectedMonthlyCost: totalCost * (30 / 7),
		};

		this.weeklyReports.push(report);
		return report;
	}

	/**
	 * Format a weekly report as human-readable markdown.
	 */
	formatWeeklyReport(report?: WeeklyCostReport): string {
		const r = report ?? this.generateWeeklyReport();
		const lines: string[] = ['## Weekly Cost Report\n'];

		lines.push(`**Period:** ${r.weekStart} to ${r.weekEnd}`);
		lines.push(`**Total Spend:** $${r.totalCost.toFixed(4)}`);

		if (r.previousWeekCost !== null) {
			const changeDir = (r.weekOverWeekChange ?? 0) >= 0 ? 'UP' : 'DOWN';
			lines.push(`**Previous Week:** $${r.previousWeekCost.toFixed(4)}`);
			lines.push(`**Week-over-Week:** ${changeDir} ${Math.abs(r.weekOverWeekChange ?? 0).toFixed(1)}%`);
		}

		lines.push(`**Projected Monthly:** $${r.projectedMonthlyCost.toFixed(2)}`);
		lines.push(`**Cache Savings:** $${r.cacheHitSavings.toFixed(4)}`);
		lines.push('');

		// Cost by model
		lines.push('### Spend by Model\n');
		lines.push('| Model | Cost | % of Total |');
		lines.push('|---|---|---|');
		for (const model of ['opus', 'sonnet', 'haiku'] as ModelId[]) {
			const cost = r.costByModel[model];
			const pct = r.totalCost > 0 ? (cost / r.totalCost * 100).toFixed(1) : '0.0';
			lines.push(`| ${model} | $${cost.toFixed(4)} | ${pct}% |`);
		}
		lines.push('');

		// Cost by agent
		const sortedAgents = Object.entries(r.costByAgent)
			.sort(([, a], [, b]) => b - a);

		if (sortedAgents.length > 0) {
			lines.push('### Spend by Agent\n');
			lines.push('| Agent | Cost | % of Total |');
			lines.push('|---|---|---|');
			for (const [agent, cost] of sortedAgents) {
				const pct = r.totalCost > 0 ? (cost / r.totalCost * 100).toFixed(1) : '0.0';
				lines.push(`| ${agent} | $${cost.toFixed(4)} | ${pct}% |`);
			}
			lines.push('');
		}

		// Token usage
		lines.push('### Token Usage\n');
		lines.push(`- Input tokens: ${r.totalInputTokens.toLocaleString()}`);
		lines.push(`- Output tokens: ${r.totalOutputTokens.toLocaleString()}`);
		lines.push(`- Cached tokens: ${r.totalCachedTokens.toLocaleString()}`);

		return lines.join('\n');
	}

	/**
	 * Get all weekly reports.
	 */
	getWeeklyReports(): WeeklyCostReport[] {
		return [...this.weeklyReports];
	}

	/**
	 * Persist the latest report to the workspace.
	 */
	async persistReport(): Promise<void> {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders?.length) {
			return;
		}

		const metricsDir = vscode.Uri.joinPath(
			workspaceFolders[0].uri,
			'.son-of-anton',
			'metrics',
		);
		await vscode.workspace.fs.createDirectory(metricsDir);

		const report = this.generateWeeklyReport();
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const content = Buffer.from(JSON.stringify(report, null, '\t'));
		const fileUri = vscode.Uri.joinPath(metricsDir, `cost-report-${timestamp}.json`);
		await vscode.workspace.fs.writeFile(fileUri, content);
	}
}
