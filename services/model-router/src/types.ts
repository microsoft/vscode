// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

export interface FallbackTarget {
	provider: string;
	model: string;
}

export interface RouteConfig {
	name: string;
	match: RouteMatch;
	provider?: string;
	model?: string;
	priority: number;
	/** Single fallback — kept for backward compatibility. `fallbacks` takes precedence when both are set. */
	fallback?: FallbackTarget;
	/** Ordered failover chain tried in sequence after the primary fails. */
	fallbacks?: FallbackTarget[];
	split?: SplitConfig[];
}

export interface RouteMatch {
	agentRole: string;
	taskType?: string;
	maxLatencyMs?: number;
}

export interface SplitConfig {
	provider: string;
	model: string;
	weight: number;
}

export interface ProviderConfig {
	baseUrl: string;
	apiKey?: string;
	format: 'anthropic' | 'openai';
	local?: boolean;
}

export interface ModelRoutesConfig {
	routes: RouteConfig[];
	providers: Record<string, ProviderConfig>;
}

export interface RoutingContext {
	agentRole: string;
	taskType?: string;
	taskId?: string;
}

export interface RequestMetrics {
	id: string;
	timestamp: number;
	provider: string;
	model: string;
	agentRole: string;
	taskType: string;
	taskId: string;
	inputTokens: number;
	outputTokens: number;
	cachedTokens: number;
	latencyMs: number;
	cost: number;
	success: boolean;
	error?: string;
}

export interface AggregatedMetrics {
	totalRequests: number;
	totalCost: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	byProvider: Record<string, { requests: number; cost: number; avgLatencyMs: number }>;
	byModel: Record<string, { requests: number; cost: number; avgLatencyMs: number }>;
	byAgentRole: Record<string, { requests: number; cost: number }>;
	byTaskType: Record<string, { requests: number; cost: number }>;
}

// Pricing per 1M tokens
export interface ModelPricing {
	inputPerMillion: number;
	outputPerMillion: number;
	cacheReadPerMillion?: number;
	cacheWritePerMillion?: number;
}

export interface UnifiedResponse {
	content: string;
	model: string;
	inputTokens: number;
	outputTokens: number;
	cachedTokens: number;
	finishReason: string;
}
