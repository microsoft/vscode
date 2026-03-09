// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import type { AggregatedMetrics, ModelPricing, RequestMetrics } from './types.js';

export const PRICING: Record<string, ModelPricing> = {
	'claude-sonnet-4-20250514': { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
	'claude-haiku-4-5-20251001': { inputPerMillion: 0.8, outputPerMillion: 4, cacheReadPerMillion: 0.08, cacheWritePerMillion: 1 },
	'claude-opus-4-20250514': { inputPerMillion: 15, outputPerMillion: 75, cacheReadPerMillion: 1.5, cacheWritePerMillion: 18.75 },
	'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
	'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
};

export function calculateCost(
	model: string,
	inputTokens: number,
	outputTokens: number,
	cachedTokens: number
): number {
	const pricing = PRICING[model];
	if (!pricing) {
		return 0;
	}

	const nonCachedInput = inputTokens - cachedTokens;
	const inputCost = (nonCachedInput / 1_000_000) * pricing.inputPerMillion;
	const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
	const cacheCost = pricing.cacheReadPerMillion
		? (cachedTokens / 1_000_000) * pricing.cacheReadPerMillion
		: 0;

	return inputCost + outputCost + cacheCost;
}

export class MetricsCollector {
	private metrics: RequestMetrics[] = [];

	record(metric: RequestMetrics): void {
		this.metrics.push(metric);
	}

	getAggregated(): AggregatedMetrics {
		const result: AggregatedMetrics = {
			totalRequests: this.metrics.length,
			totalCost: 0,
			totalInputTokens: 0,
			totalOutputTokens: 0,
			byProvider: {},
			byModel: {},
			byAgentRole: {},
			byTaskType: {},
		};

		for (const m of this.metrics) {
			result.totalCost += m.cost;
			result.totalInputTokens += m.inputTokens;
			result.totalOutputTokens += m.outputTokens;

			// By provider
			if (!result.byProvider[m.provider]) {
				result.byProvider[m.provider] = { requests: 0, cost: 0, avgLatencyMs: 0 };
			}
			const prov = result.byProvider[m.provider];
			prov.cost += m.cost;
			prov.avgLatencyMs = ((prov.avgLatencyMs * prov.requests) + m.latencyMs) / (prov.requests + 1);
			prov.requests += 1;

			// By model
			if (!result.byModel[m.model]) {
				result.byModel[m.model] = { requests: 0, cost: 0, avgLatencyMs: 0 };
			}
			const mod = result.byModel[m.model];
			mod.cost += m.cost;
			mod.avgLatencyMs = ((mod.avgLatencyMs * mod.requests) + m.latencyMs) / (mod.requests + 1);
			mod.requests += 1;

			// By agent role
			if (!result.byAgentRole[m.agentRole]) {
				result.byAgentRole[m.agentRole] = { requests: 0, cost: 0 };
			}
			result.byAgentRole[m.agentRole].requests += 1;
			result.byAgentRole[m.agentRole].cost += m.cost;

			// By task type
			if (m.taskType) {
				if (!result.byTaskType[m.taskType]) {
					result.byTaskType[m.taskType] = { requests: 0, cost: 0 };
				}
				result.byTaskType[m.taskType].requests += 1;
				result.byTaskType[m.taskType].cost += m.cost;
			}
		}

		return result;
	}

	reset(): void {
		this.metrics = [];
	}

	getRecent(count: number): RequestMetrics[] {
		return this.metrics.slice(-count);
	}
}
