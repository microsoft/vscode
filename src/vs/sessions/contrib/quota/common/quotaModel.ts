/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Data model for per-session cost and quota tracking (§9.4, F-15).
 *
 * Tracks cumulative token usage, estimated cost, per-model and per-tool
 * breakdowns, provider-specific quota information, and an optional spend cap.
 */

export interface TokenUsage {
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly cacheCreationInputTokens: number;
	readonly cacheReadInputTokens: number;
}

export interface EstimatedCost {
	readonly usd: number;
}

export interface ModelPricing {
	readonly inputPerMillion: number;
	readonly outputPerMillion: number;
	readonly cacheReadPerMillion: number;
	readonly cacheWritePerMillion: number;
}

export interface ModelUsageEntry {
	readonly modelId: string;
	readonly providerId: string;
	readonly displayLabel: string;
	readonly usage: TokenUsage;
	readonly estimatedCost: EstimatedCost;
}

export interface ToolUsageEntry {
	readonly toolName: string;
	readonly callCount: number;
}

export interface SessionCostSummary {
	readonly totalUsage: TokenUsage;
	readonly estimatedCost: EstimatedCost;
	readonly byModel: ReadonlyArray<ModelUsageEntry>;
	readonly byTool: ReadonlyArray<ToolUsageEntry>;
}

export interface ProviderQuotaInfo {
	readonly providerId: string;
	readonly displayName: string;
	/**
	 * 'api-key' — quota expressed as requests-per-minute and token limits.
	 * 'subscription' — quota expressed as window fraction used or token expiry.
	 */
	readonly kind: 'api-key' | 'subscription';
	readonly requestsUsed?: number;
	readonly requestsLimit?: number;
	/** Fraction of the subscription window consumed (0.0–1.0). */
	readonly windowFractionUsed?: number;
	/** Remaining window duration in seconds. */
	readonly windowRemainingSeconds?: number;
	/** Unix timestamp (ms) when the current window resets. */
	readonly windowResetsAt?: number;
	/** Unix timestamp (ms) of token expiry (OAuth subscription providers). */
	readonly tokenExpiresAt?: number;
}

export interface SpendCapConfig {
	/** Configured limit in USD; undefined means no cap is active. */
	readonly limitUsd: number | undefined;
	/** Accumulated cost for the current session. */
	readonly currentTotalUsd: number;
}

/** Wire shape for the full data pushed into QuotaPanel. */
export interface QuotaCostData {
	readonly summary: SessionCostSummary;
	readonly providerQuota: ReadonlyArray<ProviderQuotaInfo>;
	readonly spendCap: SpendCapConfig;
}

// ── Pricing catalogue ─────────────────────────────────────────────────────────

const KNOWN_PRICING: Record<string, ModelPricing> = {
	'claude-opus-4-7':   { inputPerMillion: 15,   outputPerMillion: 75,   cacheReadPerMillion: 1.5,  cacheWritePerMillion: 18.75 },
	'claude-opus-4-6':   { inputPerMillion: 15,   outputPerMillion: 75,   cacheReadPerMillion: 1.5,  cacheWritePerMillion: 18.75 },
	'claude-sonnet-4-6': { inputPerMillion: 3,    outputPerMillion: 15,   cacheReadPerMillion: 0.3,  cacheWritePerMillion: 3.75  },
	'claude-haiku-4-5':  { inputPerMillion: 0.25, outputPerMillion: 1.25, cacheReadPerMillion: 0.03, cacheWritePerMillion: 0.3   },
	// Copilot-proxied and subscription models — cost is absorbed by the subscription.
	'claude-opus':       { inputPerMillion: 0, outputPerMillion: 0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
	'claude-sonnet':     { inputPerMillion: 0, outputPerMillion: 0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
	'gpt-4o':            { inputPerMillion: 0, outputPerMillion: 0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
	'gpt-4o-mini':       { inputPerMillion: 0, outputPerMillion: 0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
	'gpt-5-codex':       { inputPerMillion: 0, outputPerMillion: 0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
	'o4-mini':           { inputPerMillion: 0, outputPerMillion: 0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
	'gemini-1.5-pro':    { inputPerMillion: 0, outputPerMillion: 0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
};

const UNKNOWN_PRICING: ModelPricing = { inputPerMillion: 0, outputPerMillion: 0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 };

export function pricingFor(modelId: string): ModelPricing {
	return KNOWN_PRICING[modelId] ?? UNKNOWN_PRICING;
}

export function estimateCost(usage: TokenUsage, pricing: ModelPricing): EstimatedCost {
	const usd =
		(usage.inputTokens              * pricing.inputPerMillion      / 1_000_000) +
		(usage.outputTokens             * pricing.outputPerMillion     / 1_000_000) +
		(usage.cacheReadInputTokens     * pricing.cacheReadPerMillion  / 1_000_000) +
		(usage.cacheCreationInputTokens * pricing.cacheWritePerMillion / 1_000_000);
	return { usd };
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
	return {
		inputTokens:              a.inputTokens              + b.inputTokens,
		outputTokens:             a.outputTokens             + b.outputTokens,
		cacheCreationInputTokens: a.cacheCreationInputTokens + b.cacheCreationInputTokens,
		cacheReadInputTokens:     a.cacheReadInputTokens     + b.cacheReadInputTokens,
	};
}

export function emptyUsage(): TokenUsage {
	return { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };
}

export function isSpendCapExceeded(cap: SpendCapConfig): boolean {
	return cap.limitUsd !== undefined && cap.currentTotalUsd >= cap.limitUsd;
}

// ── Display formatting ────────────────────────────────────────────────────────

export function formatCostUsd(usd: number): string {
	if (usd === 0) {
		return '$0.00';
	}
	if (usd < 0.01) {
		return '<$0.01';
	}
	return `$${usd.toFixed(2)}`;
}

export function formatTokenCount(n: number): string {
	if (n >= 1_000_000) {
		return `${(n / 1_000_000).toFixed(1)}M`;
	}
	if (n >= 1_000) {
		return `${(n / 1_000).toFixed(1)}K`;
	}
	return String(n);
}

export function formatWindowFraction(fraction: number): string {
	return `${Math.round(fraction * 100)}%`;
}

export function formatDurationSeconds(seconds: number): string {
	if (seconds < 60) {
		return `${seconds}s`;
	}
	if (seconds < 3600) {
		return `${Math.floor(seconds / 60)}m`;
	}
	return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

/**
 * Build a compact one-line summary string suitable for a status chip.
 *
 * Examples:
 *   API-key:      "$0.42 · 12.3K tokens · 4 / 30 RPM"
 *   Subscription: "$0.00 · Claude Pro · 12% of window"
 *   Expiry-only:  "$0.00 · Copilot · session valid 24m"
 */
export function buildCompactSummary(data: QuotaCostData): string {
	const parts: string[] = [];

	parts.push(formatCostUsd(data.summary.estimatedCost.usd));

	const total = data.summary.totalUsage;
	const allTokens = total.inputTokens + total.outputTokens + total.cacheReadInputTokens + total.cacheCreationInputTokens;
	if (allTokens > 0) {
		parts.push(`${formatTokenCount(allTokens)} tokens`);
	}

	const subQuota = data.providerQuota.find(q => q.kind === 'subscription');
	if (subQuota) {
		if (subQuota.windowFractionUsed !== undefined) {
			parts.push(`${subQuota.displayName} · ${formatWindowFraction(subQuota.windowFractionUsed)} of window`);
		} else if (subQuota.tokenExpiresAt !== undefined) {
			const remaining = Math.max(0, Math.floor((subQuota.tokenExpiresAt - Date.now()) / 1000));
			parts.push(`${subQuota.displayName} · session valid ${formatDurationSeconds(remaining)}`);
		}
	} else {
		const apiQuota = data.providerQuota.find(q => q.kind === 'api-key');
		if (apiQuota?.requestsUsed !== undefined && apiQuota.requestsLimit !== undefined) {
			parts.push(`${apiQuota.requestsUsed} / ${apiQuota.requestsLimit} RPM`);
		}
	}

	return parts.join(' · ');
}
