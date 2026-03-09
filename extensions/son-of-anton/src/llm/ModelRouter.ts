/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
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
	opus: { input: 15.0, output: 75.0, cachedInput: 1.5 },
	sonnet: { input: 3.0, output: 15.0, cachedInput: 0.3 },
	haiku: { input: 0.25, output: 1.25, cachedInput: 0.025 },
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

		for (const [key, experiment] of this.experiments.entries()) {
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
	 * Persist routing data to the workspace.
	 */
	async persistData(): Promise<void> {
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

		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const data = {
			timestamp: new Date().toISOString(),
			routingRules: [...this.routingRules.values()],
			experiments: [...this.experiments.values()],
			taskAnalysis: Object.fromEntries(this.getTaskAnalysis()),
		};

		const content = Buffer.from(JSON.stringify(data, null, '\t'));
		const fileUri = vscode.Uri.joinPath(metricsDir, `routing-data-${timestamp}.json`);
		await vscode.workspace.fs.writeFile(fileUri, content);
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
