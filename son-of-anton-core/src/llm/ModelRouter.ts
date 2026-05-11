/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ModelId } from './LlmClient';

/**
 * Task categories for model routing decisions.
 */
export type TaskCategory =
	| 'code-generation'
	| 'code-refactoring'
	| 'test-writing'
	| 'security-scanning'
	| 'documentation'
	| 'planning'
	| 'exploration'
	| 'import-changes'
	| 'simple-completion'
	| 'lint-suggestion'
	| 'ci-analysis'
	| 'pr-generation'
	| 'review';

/**
 * Result of a model routing A/B trial.
 */
export interface RoutingTrial {
	id: string;
	taskCategory: TaskCategory;
	modelA: ModelId;
	modelB: ModelId;
	selectedModel: ModelId;
	success: boolean;
	inputTokens: number;
	outputTokens: number;
	latencyMs: number;
	cost: number;
	timestamp: number;
}

/**
 * Accumulated statistics for a routing experiment.
 */
export interface RoutingExperiment {
	taskCategory: TaskCategory;
	modelA: ModelId;
	modelB: ModelId;
	modelATrials: number;
	modelBTrials: number;
	modelASuccessRate: number;
	modelBSuccessRate: number;
	modelAAvgLatency: number;
	modelBAvgLatency: number;
	modelAAvgCost: number;
	modelBAvgCost: number;
	winner: ModelId | null;
	confidence: number;
	totalTrials: number;
	minTrialsForDecision: number;
}

/**
 * Configuration for model routing rules.
 */
export interface RoutingRule {
	taskCategory: TaskCategory;
	model: ModelId;
	reason: string;
	overridable: boolean;
}

/**
 * Cost per 1M tokens for each model.
 */
const MODEL_COSTS: Record<ModelId, { input: number; output: number; cachedInput: number }> = {
	// Anthropic short aliases — point at Claude 3 Opus/Sonnet/Haiku rates
	// since the aliases resolve to the original Claude 3 snapshots.
	opus: { input: 15.0, output: 75.0, cachedInput: 1.5 },
	sonnet: { input: 3.0, output: 15.0, cachedInput: 0.3 },
	haiku: { input: 0.25, output: 1.25, cachedInput: 0.025 },
	// Claude 4.x — public Anthropic API list pricing as of Jan 2026.
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
	// OpenAI — Aug 2025+ pricing. GPT-5 and GPT-4.1 have published list prices.
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
	// Foundry / Azure OpenAI — Azure published list prices typically mirror
	// OpenAI's. We mirror the OpenAI cost rows here so cost reports stay
	// consistent across both providers; per-region commitment-tier discounts
	// aren't auto-detected.
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
	// Amazon Bedrock — public list prices. Inference profile pricing varies
	// by region; rates here are the most common (us-east-1 / on-demand).
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
	// Google Gemini — public list prices (lower-context tier, <128K tokens).
	'gemini-3-1-pro-preview': { input: 2.0, output: 16.0, cachedInput: 0.5 },
	'gemini-3-1-flash-lite': { input: 0.05, output: 0.2, cachedInput: 0.0125 },
	'gemini-3-1-flash-live-preview': { input: 0.5, output: 2.0, cachedInput: 0.125 },
	'gemini-3-flash-preview': { input: 0.15, output: 0.6, cachedInput: 0.0375 },
	'gemini-deep-research-preview': { input: 5.0, output: 40.0, cachedInput: 1.25 },
	'gemini-deep-research-max-preview': { input: 10.0, output: 80.0, cachedInput: 2.5 },
	'gemma-4-31b-it': { input: 0.0, output: 0.0, cachedInput: 0.0 },
	'gemini-2-5-pro': { input: 1.25, output: 10.0, cachedInput: 0.3125 },
	'gemini-2-5-flash': { input: 0.075, output: 0.3, cachedInput: 0.01875 },
	'gemini-2-0-pro': { input: 0.5, output: 2.0, cachedInput: 0.125 },
	'gemini-2-0-flash': { input: 0.1, output: 0.4, cachedInput: 0.025 },
	'gemini-2-0-flash-lite': { input: 0.075, output: 0.3, cachedInput: 0.01875 },
	// Claude Code variants route through the user's subscription, not metered
	// API. Cost per token is $0 — the subscription is the bill.
	'claude-code-opus': { input: 0, output: 0, cachedInput: 0 },
	'claude-code-sonnet': { input: 0, output: 0, cachedInput: 0 },
	'claude-code-haiku': { input: 0, output: 0, cachedInput: 0 },
	// OpenRouter — pricing mirrors the upstream provider's published list
	// prices. OpenRouter applies a small markup (~5%) we don't model here.
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
	// DeepSeek — direct API list pricing (Jan 2026).
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

const DEFAULT_ROUTING: RoutingRule[] = [
	{ taskCategory: 'planning', model: 'opus', reason: 'Complex reasoning requires highest capability', overridable: true },
	{ taskCategory: 'code-generation', model: 'sonnet', reason: 'Best balance of capability and cost', overridable: true },
	{ taskCategory: 'code-refactoring', model: 'sonnet', reason: 'Best balance of capability and cost', overridable: true },
	{ taskCategory: 'test-writing', model: 'sonnet', reason: 'Requires understanding of code semantics', overridable: true },
	{ taskCategory: 'security-scanning', model: 'sonnet', reason: 'Security requires careful analysis', overridable: false },
	{ taskCategory: 'documentation', model: 'haiku', reason: 'Low complexity, high volume', overridable: true },
	{ taskCategory: 'exploration', model: 'haiku', reason: 'Quick summaries and lookups', overridable: true },
	{ taskCategory: 'import-changes', model: 'haiku', reason: 'Simple mechanical changes', overridable: true },
	{ taskCategory: 'simple-completion', model: 'haiku', reason: 'Fast, low-cost completions', overridable: true },
	{ taskCategory: 'lint-suggestion', model: 'haiku', reason: 'Formulaic corrections', overridable: true },
	{ taskCategory: 'ci-analysis', model: 'sonnet', reason: 'Error analysis requires reasoning', overridable: true },
	{ taskCategory: 'pr-generation', model: 'sonnet', reason: 'PR descriptions need context awareness', overridable: true },
	{ taskCategory: 'review', model: 'sonnet', reason: 'Code review requires careful analysis', overridable: true },
];

const MIN_TRIALS_FOR_DECISION = 20;
const REQUIRED_SUCCESS_RATE_THRESHOLD = 0.95;
const AB_TRAFFIC_SPLIT = 0.2; // 20% goes to challenger model

/**
 * ModelRouter — intelligent model selection based on task type and A/B testing.
 *
 * Responsibilities:
 * 1. Route tasks to appropriate models based on category
 * 2. Run A/B experiments to discover cost-saving opportunities
 * 3. Track success rates per model per task category
 * 4. Automatically promote cheaper models when they perform equivalently
 */
export class ModelRouter {
	private readonly routingRules: Map<TaskCategory, RoutingRule>;
	private readonly experiments = new Map<string, RoutingExperiment>();
	private readonly trials: RoutingTrial[] = [];
	private readonly maxTrialsHistory = 5000;
	private nextTrialId = 1;

	constructor() {
		this.routingRules = new Map(
			DEFAULT_ROUTING.map(rule => [rule.taskCategory, rule])
		);
	}

	/**
	 * Select the appropriate model for a task category.
	 * May route to a challenger model for A/B testing.
	 */
	selectModel(taskCategory: TaskCategory): { model: ModelId; isExperiment: boolean; experimentId?: string } {
		const rule = this.routingRules.get(taskCategory);
		if (!rule) {
			return { model: 'sonnet', isExperiment: false };
		}

		// Check if there's an active experiment for this category
		const experiment = this.getActiveExperiment(taskCategory);
		if (experiment && rule.overridable) {
			// Route AB_TRAFFIC_SPLIT to the challenger
			if (Math.random() < AB_TRAFFIC_SPLIT) {
				return {
					model: experiment.modelB,
					isExperiment: true,
					experimentId: this.experimentKey(taskCategory, experiment.modelA, experiment.modelB),
				};
			}
		}

		return { model: rule.model, isExperiment: false };
	}

	/**
	 * Start an A/B experiment comparing two models for a task category.
	 */
	startExperiment(taskCategory: TaskCategory, modelA: ModelId, modelB: ModelId): RoutingExperiment {
		const key = this.experimentKey(taskCategory, modelA, modelB);
		const experiment: RoutingExperiment = {
			taskCategory,
			modelA,
			modelB,
			modelATrials: 0,
			modelBTrials: 0,
			modelASuccessRate: 0,
			modelBSuccessRate: 0,
			modelAAvgLatency: 0,
			modelBAvgLatency: 0,
			modelAAvgCost: 0,
			modelBAvgCost: 0,
			winner: null,
			confidence: 0,
			totalTrials: 0,
			minTrialsForDecision: MIN_TRIALS_FOR_DECISION,
		};

		this.experiments.set(key, experiment);
		return experiment;
	}

	/**
	 * Record the result of a trial (either A/B experiment or standard routing).
	 */
	recordTrial(
		taskCategory: TaskCategory,
		model: ModelId,
		success: boolean,
		inputTokens: number,
		outputTokens: number,
		latencyMs: number,
	): RoutingTrial {
		const cost = this.calculateCost(model, inputTokens, outputTokens);

		const trial: RoutingTrial = {
			id: `trial-${this.nextTrialId++}`,
			taskCategory,
			modelA: model,
			modelB: model,
			selectedModel: model,
			success,
			inputTokens,
			outputTokens,
			latencyMs,
			cost,
			timestamp: Date.now(),
		};

		this.trials.push(trial);
		if (this.trials.length > this.maxTrialsHistory) {
			this.trials.splice(0, this.trials.length - this.maxTrialsHistory);
		}

		// Update any active experiment
		this.updateExperiments(taskCategory, model, success, latencyMs, cost);

		return trial;
	}

	/**
	 * Check all experiments and auto-promote winners.
	 */
	evaluateExperiments(): Array<{ taskCategory: TaskCategory; winner: ModelId; reason: string }> {
		const promotions: Array<{ taskCategory: TaskCategory; winner: ModelId; reason: string }> = [];

		for (const experiment of this.experiments.values()) {
			if (experiment.totalTrials < experiment.minTrialsForDecision) {
				continue;
			}

			// Check if the cheaper model (modelB) matches or exceeds the baseline
			if (
				experiment.modelBSuccessRate >= REQUIRED_SUCCESS_RATE_THRESHOLD &&
				experiment.modelBSuccessRate >= experiment.modelASuccessRate * 0.95 // Within 5% of model A
			) {
				// Cheaper model is good enough — promote it
				const rule = this.routingRules.get(experiment.taskCategory);
				if (rule && rule.overridable) {
					rule.model = experiment.modelB;
					rule.reason = `Auto-promoted: ${experiment.modelB} achieved ${(experiment.modelBSuccessRate * 100).toFixed(1)}% success rate over ${experiment.modelBTrials} trials`;

					experiment.winner = experiment.modelB;
					experiment.confidence = experiment.modelBSuccessRate;

					promotions.push({
						taskCategory: experiment.taskCategory,
						winner: experiment.modelB,
						reason: rule.reason,
					});
				}
			} else if (experiment.modelASuccessRate > experiment.modelBSuccessRate * 1.1) {
				// Model A is significantly better — keep it
				experiment.winner = experiment.modelA;
				experiment.confidence = experiment.modelASuccessRate;
			}
		}

		return promotions;
	}

	/**
	 * Get current routing rules.
	 */
	getRoutingRules(): RoutingRule[] {
		return [...this.routingRules.values()];
	}

	/**
	 * Get all active experiments.
	 */
	getExperiments(): RoutingExperiment[] {
		return [...this.experiments.values()];
	}

	/**
	 * Get task-level performance data for analysis.
	 */
	getTaskAnalysis(): Map<TaskCategory, {
		model: ModelId;
		successRate: number;
		avgLatency: number;
		avgCost: number;
		totalTrials: number;
	}> {
		const analysis = new Map<TaskCategory, Map<ModelId, {
			successes: number;
			totalLatency: number;
			totalCost: number;
			count: number;
		}>>();

		for (const trial of this.trials) {
			let categoryData = analysis.get(trial.taskCategory);
			if (!categoryData) {
				categoryData = new Map();
				analysis.set(trial.taskCategory, categoryData);
			}

			let modelData = categoryData.get(trial.selectedModel);
			if (!modelData) {
				modelData = { successes: 0, totalLatency: 0, totalCost: 0, count: 0 };
				categoryData.set(trial.selectedModel, modelData);
			}

			modelData.count++;
			modelData.totalLatency += trial.latencyMs;
			modelData.totalCost += trial.cost;
			if (trial.success) {
				modelData.successes++;
			}
		}

		const result = new Map<TaskCategory, {
			model: ModelId;
			successRate: number;
			avgLatency: number;
			avgCost: number;
			totalTrials: number;
		}>();

		for (const [category, categoryData] of analysis) {
			// Pick the model with the most trials as the primary
			let bestModel: ModelId = 'sonnet';
			let bestCount = 0;
			for (const [model, data] of categoryData) {
				if (data.count > bestCount) {
					bestCount = data.count;
					bestModel = model;
				}
			}

			const data = categoryData.get(bestModel)!;
			result.set(category, {
				model: bestModel,
				successRate: data.count > 0 ? data.successes / data.count : 0,
				avgLatency: data.count > 0 ? data.totalLatency / data.count : 0,
				avgCost: data.count > 0 ? data.totalCost / data.count : 0,
				totalTrials: data.count,
			});
		}

		return result;
	}

	/**
	 * H7 — Confidence-driven escalation ladder.
	 *
	 * Returns the next-stronger Anthropic model in the same major version
	 * family, or `undefined` when escalation isn't applicable:
	 *  - haiku family → sonnet of the same major version
	 *  - sonnet family → opus of the same major version
	 *  - opus (already the strongest) → undefined
	 *  - non-Anthropic models → undefined (escalation is Anthropic-only for v1
	 *    — other providers don't share a clean haiku/sonnet/opus ladder)
	 *
	 * Examples:
	 *   `claude-haiku-4-7`  → `claude-sonnet-4-7`
	 *   `claude-sonnet-4-6` → `claude-opus-4-6`
	 *   `claude-opus-4-7`   → undefined
	 *   `gpt-5-mini`        → undefined
	 *
	 * Short aliases (`haiku`, `sonnet`, `opus`) follow the same rules.
	 */
	selectEscalationModel(currentModel: ModelId): ModelId | undefined {
		// Short aliases — the legacy unscoped tier names.
		if (currentModel === 'haiku') {
			return 'sonnet';
		}
		if (currentModel === 'sonnet') {
			return 'opus';
		}
		if (currentModel === 'opus') {
			return undefined;
		}

		// Versioned 4.x ids — replace the tier segment in-place to preserve the
		// major.minor suffix (`claude-haiku-4-7` → `claude-sonnet-4-7`).
		const versioned = currentModel.match(/^claude-(haiku|sonnet|opus)-(.+)$/);
		if (versioned) {
			const tier = versioned[1];
			const version = versioned[2];
			if (tier === 'haiku') {
				return `claude-sonnet-${version}` as ModelId;
			}
			if (tier === 'sonnet') {
				return `claude-opus-${version}` as ModelId;
			}
			// opus — already at the top.
			return undefined;
		}

		// Claude 3 / 3.5 / 3.7 ids carry the version *before* the tier
		// (`claude-3-5-haiku`, `claude-3-7-sonnet`). Handle them explicitly.
		const claude3Match = currentModel.match(/^claude-(3(?:-5|-7)?)-(haiku|sonnet|opus)$/);
		if (claude3Match) {
			const version = claude3Match[1];
			const tier = claude3Match[2];
			if (tier === 'haiku') {
				return `claude-${version}-sonnet` as ModelId;
			}
			if (tier === 'sonnet') {
				// 3 / 3.5 / 3.7 sonnet escalate to claude-3-opus (the only
				// opus snapshot in the Claude 3 family). 3.5/3.7 don't have
				// their own opus tiers.
				return 'claude-3-opus' as ModelId;
			}
			return undefined;
		}

		// Anything else (OpenAI, Foundry, Bedrock, Gemini, OpenRouter, local
		// providers, …) — no defined escalation ladder yet.
		return undefined;
	}

	/**
	 * Calculate the cost for a specific model and token usage.
	 */
	calculateCost(model: ModelId, inputTokens: number, outputTokens: number, cachedInputTokens: number = 0): number {
		const costs = MODEL_COSTS[model];
		const nonCachedInput = inputTokens - cachedInputTokens;
		return (nonCachedInput / 1_000_000) * costs.input
			+ (cachedInputTokens / 1_000_000) * costs.cachedInput
			+ (outputTokens / 1_000_000) * costs.output;
	}

	/**
	 * Format routing summary as a human-readable string.
	 */
	formatSummary(): string {
		const lines: string[] = ['## Model Routing Summary\n'];

		lines.push('### Current Routing Rules\n');
		lines.push('| Task Category | Model | Reason |');
		lines.push('|---|---|---|');
		for (const rule of this.routingRules.values()) {
			lines.push(`| ${rule.taskCategory} | ${rule.model} | ${rule.reason} |`);
		}

		const experiments = this.getExperiments().filter(e => e.totalTrials > 0);
		if (experiments.length > 0) {
			lines.push('\n### Active Experiments\n');
			lines.push('| Category | Model A | Model B | A Success | B Success | Trials | Winner |');
			lines.push('|---|---|---|---|---|---|---|');
			for (const exp of experiments) {
				const winner = exp.winner ?? 'TBD';
				lines.push(
					`| ${exp.taskCategory} | ${exp.modelA} | ${exp.modelB} ` +
					`| ${(exp.modelASuccessRate * 100).toFixed(1)}% | ${(exp.modelBSuccessRate * 100).toFixed(1)}% ` +
					`| ${exp.totalTrials} | ${winner} |`
				);
			}
		}

		const analysis = this.getTaskAnalysis();
		if (analysis.size > 0) {
			lines.push('\n### Task Performance\n');
			lines.push('| Category | Model | Success Rate | Avg Latency | Avg Cost | Trials |');
			lines.push('|---|---|---|---|---|---|');
			for (const [category, data] of analysis) {
				lines.push(
					`| ${category} | ${data.model} ` +
					`| ${(data.successRate * 100).toFixed(1)}% ` +
					`| ${Math.round(data.avgLatency)}ms ` +
					`| $${data.avgCost.toFixed(4)} ` +
					`| ${data.totalTrials} |`
				);
			}
		}

		return lines.join('\n');
	}

	/**
	 * Persist routing data to a JSON file under `<workspaceRoot>/.son-of-anton/metrics/`.
	 * The host (extension or CLI) supplies the workspace root; passing
	 * `undefined` is a no-op so the call site can stay defensive when no
	 * workspace is available.
	 */
	async persistData(workspaceRoot: string | undefined): Promise<void> {
		if (!workspaceRoot) {
			return;
		}

		const metricsDir = path.join(workspaceRoot, '.son-of-anton', 'metrics');
		await fs.mkdir(metricsDir, { recursive: true });

		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const data = {
			timestamp: new Date().toISOString(),
			routingRules: [...this.routingRules.values()],
			experiments: [...this.experiments.values()],
			taskAnalysis: Object.fromEntries(this.getTaskAnalysis()),
		};

		const content = JSON.stringify(data, null, '\t');
		const filePath = path.join(metricsDir, `routing-data-${timestamp}.json`);
		await fs.writeFile(filePath, content);
	}

	private getActiveExperiment(taskCategory: TaskCategory): RoutingExperiment | undefined {
		for (const experiment of this.experiments.values()) {
			if (experiment.taskCategory === taskCategory && experiment.winner === null) {
				return experiment;
			}
		}
		return undefined;
	}

	private updateExperiments(
		taskCategory: TaskCategory,
		model: ModelId,
		success: boolean,
		latencyMs: number,
		cost: number,
	): void {
		for (const experiment of this.experiments.values()) {
			if (experiment.taskCategory !== taskCategory) {
				continue;
			}

			experiment.totalTrials++;

			if (model === experiment.modelA) {
				experiment.modelATrials++;
				const prevSuccesses = experiment.modelASuccessRate * (experiment.modelATrials - 1);
				experiment.modelASuccessRate = (prevSuccesses + (success ? 1 : 0)) / experiment.modelATrials;

				const prevLatency = experiment.modelAAvgLatency * (experiment.modelATrials - 1);
				experiment.modelAAvgLatency = (prevLatency + latencyMs) / experiment.modelATrials;

				const prevCost = experiment.modelAAvgCost * (experiment.modelATrials - 1);
				experiment.modelAAvgCost = (prevCost + cost) / experiment.modelATrials;
			} else if (model === experiment.modelB) {
				experiment.modelBTrials++;
				const prevSuccesses = experiment.modelBSuccessRate * (experiment.modelBTrials - 1);
				experiment.modelBSuccessRate = (prevSuccesses + (success ? 1 : 0)) / experiment.modelBTrials;

				const prevLatency = experiment.modelBAvgLatency * (experiment.modelBTrials - 1);
				experiment.modelBAvgLatency = (prevLatency + latencyMs) / experiment.modelBTrials;

				const prevCost = experiment.modelBAvgCost * (experiment.modelBTrials - 1);
				experiment.modelBAvgCost = (prevCost + cost) / experiment.modelBTrials;
			}
		}
	}

	private experimentKey(taskCategory: TaskCategory, modelA: ModelId, modelB: ModelId): string {
		return `${taskCategory}:${modelA}:${modelB}`;
	}
}
