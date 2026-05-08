/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ModelId } from 'son-of-anton-core/llm/LlmClient';

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
 * Cost per 1M tokens for each model (USD).
 *
 * Pricing reflects published list prices for each provider as of the
 * extension's current configuration. Update alongside `ModelId` whenever a
 * new model is added to `LlmClient`.
 */
const MODEL_COSTS: Record<ModelId, { input: number; output: number; cachedInput: number }> = {
	// Anthropic short aliases.
	opus: { input: 15.0, output: 75.0, cachedInput: 1.5 },
	sonnet: { input: 3.0, output: 15.0, cachedInput: 0.3 },
	haiku: { input: 0.25, output: 1.25, cachedInput: 0.025 },
	// Claude 4.x — mirrored from `son-of-anton-core/llm/ModelRouter.MODEL_COSTS`.
	'claude-opus-4-7': { input: 15.0, output: 75.0, cachedInput: 1.5 },
	'claude-sonnet-4-7': { input: 3.0, output: 15.0, cachedInput: 0.3 },
	'claude-haiku-4-7': { input: 1.0, output: 5.0, cachedInput: 0.1 },
	'claude-opus-4-6': { input: 15.0, output: 75.0, cachedInput: 1.5 },
	'claude-sonnet-4-6': { input: 3.0, output: 15.0, cachedInput: 0.3 },
	'claude-haiku-4-6': { input: 1.0, output: 5.0, cachedInput: 0.1 },
	'claude-opus-4-5': { input: 15.0, output: 75.0, cachedInput: 1.5 },
	'claude-sonnet-4-5': { input: 3.0, output: 15.0, cachedInput: 0.3 },
	'claude-haiku-4-5': { input: 1.0, output: 5.0, cachedInput: 0.1 },
	'claude-opus-4-1': { input: 15.0, output: 75.0, cachedInput: 1.5 },
	'claude-sonnet-4-1': { input: 3.0, output: 15.0, cachedInput: 0.3 },
	'claude-opus-4': { input: 15.0, output: 75.0, cachedInput: 1.5 },
	'claude-sonnet-4': { input: 3.0, output: 15.0, cachedInput: 0.3 },
	'claude-3-7-sonnet': { input: 3.0, output: 15.0, cachedInput: 0.3 },
	'claude-3-5-sonnet': { input: 3.0, output: 15.0, cachedInput: 0.3 },
	'claude-3-5-haiku': { input: 0.8, output: 4.0, cachedInput: 0.08 },
	'claude-3-opus': { input: 15.0, output: 75.0, cachedInput: 1.5 },
	'claude-3-sonnet': { input: 3.0, output: 15.0, cachedInput: 0.3 },
	'claude-3-haiku': { input: 0.25, output: 1.25, cachedInput: 0.025 },
	// OpenAI.
	'gpt-4o': { input: 2.5, output: 10.0, cachedInput: 1.25 },
	'gpt-4o-mini': { input: 0.15, output: 0.6, cachedInput: 0.075 },
	'gpt-5': { input: 1.25, output: 10.0, cachedInput: 0.125 },
	'gpt-5-mini': { input: 0.25, output: 2.0, cachedInput: 0.025 },
	'gpt-5-nano': { input: 0.05, output: 0.4, cachedInput: 0.005 },
	'gpt-5-codex': { input: 1.25, output: 10.0, cachedInput: 0.125 },
	'gpt-4-1': { input: 2.0, output: 8.0, cachedInput: 0.5 },
	'gpt-4-1-mini': { input: 0.4, output: 1.6, cachedInput: 0.1 },
	'gpt-4-1-nano': { input: 0.1, output: 0.4, cachedInput: 0.025 },
	'gpt-4-turbo': { input: 10.0, output: 30.0, cachedInput: 5.0 },
	'gpt-3-5-turbo': { input: 0.5, output: 1.5, cachedInput: 0.25 },
	'o1': { input: 15.0, output: 60.0, cachedInput: 7.5 },
	'o1-mini': { input: 1.1, output: 4.4, cachedInput: 0.55 },
	'o1-pro': { input: 150.0, output: 600.0, cachedInput: 75.0 },
	'o3': { input: 2.0, output: 8.0, cachedInput: 0.5 },
	'o3-mini': { input: 1.1, output: 4.4, cachedInput: 0.55 },
	'o4-mini': { input: 1.1, output: 4.4, cachedInput: 0.275 },
	// Foundry / Azure.
	'foundry-gpt-4': { input: 2.5, output: 10.0, cachedInput: 1.25 },
	'foundry-gpt-4o': { input: 2.5, output: 10.0, cachedInput: 1.25 },
	'foundry-gpt-4o-mini': { input: 0.15, output: 0.6, cachedInput: 0.075 },
	'foundry-gpt-4-1': { input: 2.0, output: 8.0, cachedInput: 0.5 },
	'foundry-gpt-4-1-mini': { input: 0.4, output: 1.6, cachedInput: 0.1 },
	'foundry-gpt-4-1-nano': { input: 0.1, output: 0.4, cachedInput: 0.025 },
	'foundry-gpt-5': { input: 1.25, output: 10.0, cachedInput: 0.125 },
	'foundry-gpt-5-mini': { input: 0.25, output: 2.0, cachedInput: 0.025 },
	'foundry-gpt-5-nano': { input: 0.05, output: 0.4, cachedInput: 0.005 },
	'foundry-o1': { input: 15.0, output: 60.0, cachedInput: 7.5 },
	'foundry-o1-mini': { input: 1.1, output: 4.4, cachedInput: 0.55 },
	'foundry-o3': { input: 2.0, output: 8.0, cachedInput: 0.5 },
	'foundry-o3-mini': { input: 1.1, output: 4.4, cachedInput: 0.55 },
	'foundry-o4-mini': { input: 1.1, output: 4.4, cachedInput: 0.275 },
	'foundry-claude-sonnet': { input: 3.0, output: 15.0, cachedInput: 0.3 },
	'foundry-mistral-large': { input: 4.0, output: 12.0, cachedInput: 0 },
	'foundry-llama-3-70b': { input: 0.65, output: 2.75, cachedInput: 0 },
	'foundry-phi-4': { input: 0.125, output: 0.5, cachedInput: 0 },
	'foundry-custom': { input: 2.5, output: 10.0, cachedInput: 1.25 },
	// Bedrock.
	'bedrock-claude-opus-4': { input: 15.0, output: 75.0, cachedInput: 1.5 },
	'bedrock-claude-sonnet-4': { input: 3.0, output: 15.0, cachedInput: 0.3 },
	'bedrock-claude-haiku-4': { input: 1.0, output: 5.0, cachedInput: 0.1 },
	'bedrock-claude-3-7-sonnet': { input: 3.0, output: 15.0, cachedInput: 0.3 },
	'bedrock-claude-sonnet': { input: 3.0, output: 15.0, cachedInput: 0.3 },
	'bedrock-claude-haiku': { input: 0.25, output: 1.25, cachedInput: 0.025 },
	'bedrock-llama-3-1-70b': { input: 0.99, output: 0.99, cachedInput: 0 },
	'bedrock-llama-3-1-8b': { input: 0.22, output: 0.22, cachedInput: 0 },
	'bedrock-llama-3-70b': { input: 2.65, output: 3.5, cachedInput: 0 },
	'bedrock-mistral-large': { input: 4.0, output: 12.0, cachedInput: 0 },
	'bedrock-titan-text-express': { input: 0.2, output: 0.6, cachedInput: 0 },
	'bedrock-cohere-command-r-plus': { input: 3.0, output: 15.0, cachedInput: 0 },
	'bedrock-nova-pro': { input: 0.8, output: 3.2, cachedInput: 0.2 },
	'bedrock-nova-lite': { input: 0.06, output: 0.24, cachedInput: 0.015 },
	'bedrock-nova-micro': { input: 0.035, output: 0.14, cachedInput: 0.00875 },
	// Google Gemini.
	'gemini-2-5-pro': { input: 1.25, output: 10.0, cachedInput: 0.3125 },
	'gemini-2-5-flash': { input: 0.075, output: 0.3, cachedInput: 0.01875 },
	'gemini-2-0-pro': { input: 0.5, output: 2.0, cachedInput: 0.125 },
	'gemini-2-0-flash': { input: 0.1, output: 0.4, cachedInput: 0.025 },
	'gemini-2-0-flash-lite': { input: 0.075, output: 0.3, cachedInput: 0.01875 },
	'gemini-1-5-pro': { input: 1.25, output: 5.0, cachedInput: 0.3125 },
	'gemini-1-5-flash': { input: 0.075, output: 0.3, cachedInput: 0.01875 },
	// Claude Code (subscription).
	'claude-code-opus': { input: 0, output: 0, cachedInput: 0 },
	'claude-code-sonnet': { input: 0, output: 0, cachedInput: 0 },
	'claude-code-haiku': { input: 0, output: 0, cachedInput: 0 },
	// OpenRouter — pricing mirrors the upstream provider's published list
	// prices (OpenRouter adds ~5% markup; not modelled here).
	'openrouter-claude-opus-4-7': { input: 15.0, output: 75.0, cachedInput: 1.5 },
	'openrouter-claude-sonnet-4-7': { input: 3.0, output: 15.0, cachedInput: 0.3 },
	'openrouter-gpt-5': { input: 1.25, output: 10.0, cachedInput: 0.125 },
	'openrouter-llama-3-1-405b': { input: 2.7, output: 2.7, cachedInput: 0 },
	'openrouter-deepseek-v3': { input: 0.27, output: 1.1, cachedInput: 0 },
	'openrouter-mistral-large': { input: 4.0, output: 12.0, cachedInput: 0 },
	'openrouter-qwen-2-5-coder': { input: 0.18, output: 0.18, cachedInput: 0 },
	'openrouter-grok-2': { input: 2.0, output: 10.0, cachedInput: 0 },
	'openrouter-custom': { input: 0, output: 0, cachedInput: 0 },
	// Ollama / LM Studio — local inference, zero marginal cost.
	'ollama-llama-3-1': { input: 0, output: 0, cachedInput: 0 },
	'ollama-qwen-2-5-coder': { input: 0, output: 0, cachedInput: 0 },
	'ollama-deepseek-r1': { input: 0, output: 0, cachedInput: 0 },
	'ollama-custom': { input: 0, output: 0, cachedInput: 0 },
	'lmstudio-loaded': { input: 0, output: 0, cachedInput: 0 },
	'lmstudio-custom': { input: 0, output: 0, cachedInput: 0 },
	// DeepSeek — direct API list pricing.
	'deepseek-v3': { input: 0.27, output: 1.1, cachedInput: 0 },
	'deepseek-r1': { input: 0.55, output: 2.19, cachedInput: 0 },
	// Mistral — direct API list pricing.
	'mistral-large': { input: 2.0, output: 6.0, cachedInput: 0 },
	'mistral-small': { input: 0.2, output: 0.6, cachedInput: 0 },
	'codestral': { input: 0.3, output: 0.9, cachedInput: 0 },
	'mistral-pixtral': { input: 0.15, output: 0.15, cachedInput: 0 },
	// Groq — LPU-accelerated; very low list pricing.
	'groq-llama-3-3-70b': { input: 0.59, output: 0.79, cachedInput: 0 },
	'groq-llama-3-1-8b': { input: 0.05, output: 0.08, cachedInput: 0 },
	'groq-mixtral-8x7b': { input: 0.24, output: 0.24, cachedInput: 0 },
	'groq-deepseek-r1-llama-70b': { input: 0.75, output: 0.99, cachedInput: 0 },
	// Cerebras — wafer-scale; competitive list pricing.
	'cerebras-llama-3-3-70b': { input: 0.85, output: 1.2, cachedInput: 0 },
	'cerebras-llama-3-1-8b': { input: 0.1, output: 0.1, cachedInput: 0 },
	// Together AI — list pricing per model card.
	'together-llama-3-1-405b': { input: 3.5, output: 3.5, cachedInput: 0 },
	'together-qwen-2-5-coder': { input: 0.8, output: 0.8, cachedInput: 0 },
	'together-mixtral-8x22b': { input: 1.2, output: 1.2, cachedInput: 0 },
	'together-custom': { input: 0, output: 0, cachedInput: 0 },
	// Fireworks — list pricing per model card.
	'fireworks-llama-3-1-405b': { input: 3.0, output: 3.0, cachedInput: 0 },
	'fireworks-deepseek-v3': { input: 0.9, output: 0.9, cachedInput: 0 },
	'fireworks-qwen-2-5-coder': { input: 0.9, output: 0.9, cachedInput: 0 },
	'fireworks-custom': { input: 0, output: 0, cachedInput: 0 },
	// OpenAI Codex CLI — subscription-based; zero metered cost.
	'codex-gpt-5': { input: 0, output: 0, cachedInput: 0 },
	'codex-gpt-5-mini': { input: 0, output: 0, cachedInput: 0 },
	'codex-gpt-5-codex': { input: 0, output: 0, cachedInput: 0 },
};

/**
 * Build a fresh per-model cost accumulator initialised to zero for every
 * known `ModelId`. Keeps the report self-updating when models are added.
 */
function emptyCostByModel(): Record<ModelId, number> {
	return Object.fromEntries(
		(Object.keys(MODEL_COSTS) as ModelId[]).map(id => [id, 0]),
	) as Record<ModelId, number>;
}

/**
 * CostReporter — tracks and reports API spending across models and agents.
 *
 * Responsibilities:
 * 1. Track cost per invocation (model + agent)
 * 2. Generate weekly cost reports
 * 3. Compare week-over-week spending
 * 4. Project monthly costs
 * 5. Persist reports for review
 *
 * Emits `onDidChange` whenever the live entry set mutates so subscribers
 * (e.g. the chat header cost meter) can refresh without polling. Both
 * `recordCost` and `resetSession` fire the event.
 */
export class CostReporter {
	private readonly entries: CostEntry[] = [];
	private readonly maxEntries = 50000;
	private readonly weeklyReports: WeeklyCostReport[] = [];
	private readonly _onDidChange = new vscode.EventEmitter<void>();

	/**
	 * Fires whenever the entry set mutates (record or reset). UI surfaces can
	 * subscribe to refresh totals without re-reading on a timer.
	 */
	readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

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

		this._onDidChange.fire();
		return entry;
	}

	/**
	 * Clear all live entries — used by the chat surface's "reset session"
	 * action to zero the running cost meter without throwing away weekly
	 * reports already generated. Fires `onDidChange` so subscribers refresh.
	 */
	resetSession(): void {
		if (this.entries.length === 0) {
			return;
		}
		this.entries.length = 0;
		this._onDidChange.fire();
	}

	/**
	 * Get total token counts (input + output + cached) across all entries
	 * since `sinceMs` (or the full session if omitted). Used by the chat
	 * header to display a running token meter alongside the dollar total.
	 */
	getTotalTokens(sinceMs?: number): { input: number; output: number; cached: number } {
		const cutoff = sinceMs ? Date.now() - sinceMs : 0;
		let input = 0;
		let output = 0;
		let cached = 0;
		for (const entry of this.entries) {
			if (entry.timestamp >= cutoff) {
				input += entry.inputTokens;
				output += entry.outputTokens;
				cached += entry.cachedInputTokens;
			}
		}
		return { input, output, cached };
	}

	/**
	 * Per-model token breakdown. Mirrors `getCostByModel` so the chat header
	 * can show "tokens · dollars" rows without a second pass over entries.
	 */
	getTokensByModel(sinceMs?: number): Record<ModelId, { input: number; output: number; cached: number }> {
		const cutoff = sinceMs ? Date.now() - sinceMs : 0;
		const result: Record<ModelId, { input: number; output: number; cached: number }> = Object.fromEntries(
			(Object.keys(MODEL_COSTS) as ModelId[]).map(id => [id, { input: 0, output: 0, cached: 0 }]),
		) as Record<ModelId, { input: number; output: number; cached: number }>;

		for (const entry of this.entries) {
			if (entry.timestamp >= cutoff) {
				const bucket = result[entry.model];
				bucket.input += entry.inputTokens;
				bucket.output += entry.outputTokens;
				bucket.cached += entry.cachedInputTokens;
			}
		}
		return result;
	}

	/**
	 * Dispose the underlying event emitter. Tests and short-lived instances
	 * should call this to avoid leaking listeners.
	 */
	dispose(): void {
		this._onDidChange.dispose();
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
		const result = emptyCostByModel();

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

		const costByModel = emptyCostByModel();
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

		// Cost by model — only emit rows for models with non-zero spend so the
		// table stays readable when most of the 14 supported models are unused.
		const modelRows = (Object.keys(r.costByModel) as ModelId[])
			.map(model => ({ model, cost: r.costByModel[model] }))
			.filter(row => row.cost > 0)
			.sort((a, b) => b.cost - a.cost);

		lines.push('### Spend by Model\n');
		lines.push('| Model | Cost | % of Total |');
		lines.push('|---|---|---|');
		for (const { model, cost } of modelRows) {
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
