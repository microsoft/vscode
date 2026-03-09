/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ModelId } from './LlmClient';

/**
 * Cache metrics for a single LLM request.
 */
export interface CacheMetrics {
	requestId: string;
	model: ModelId;
	agentHandle: string;
	timestamp: number;
	cacheCreationInputTokens: number;
	cacheReadInputTokens: number;
	totalInputTokens: number;
	outputTokens: number;
	cacheHitRate: number;
}

/**
 * Aggregate cache statistics per agent type.
 */
export interface AgentCacheStats {
	agentHandle: string;
	totalRequests: number;
	averageCacheHitRate: number;
	totalCacheCreationTokens: number;
	totalCacheReadTokens: number;
	totalInputTokens: number;
	estimatedSavings: number;
}

/**
 * Prompt structure audit result for an agent type.
 */
export interface PromptAuditResult {
	agentHandle: string;
	systemPromptHash: string;
	systemPromptLength: number;
	claudeMdHash: string;
	claudeMdLength: number;
	graphContextLength: number;
	dynamicContentLength: number;
	issues: PromptAuditIssue[];
	cachePrefixLength: number;
}

export interface PromptAuditIssue {
	severity: 'error' | 'warning' | 'info';
	message: string;
	recommendation: string;
}

/**
 * PromptCacheOptimizer — monitors and improves prompt cache hit rates.
 *
 * Responsibilities:
 * 1. Log cache_creation_input_tokens and cache_read_input_tokens from API responses
 * 2. Calculate cache_hit_rate per agent and overall
 * 3. Audit prompt structure for cache-busting patterns
 * 4. Detect and prevent common cache-busting mistakes
 */
export class PromptCacheOptimizer {
	private readonly cacheMetrics: CacheMetrics[] = [];
	private readonly agentStats = new Map<string, AgentCacheStats>();
	private readonly promptHashes = new Map<string, string[]>(); // agentHandle -> recent hashes
	private readonly maxMetricsHistory = 1000;
	private nextRequestId = 1;

	/**
	 * Record cache metrics from an API response.
	 */
	recordCacheMetrics(
		model: ModelId,
		agentHandle: string,
		cacheCreationInputTokens: number,
		cacheReadInputTokens: number,
		totalInputTokens: number,
		outputTokens: number,
	): CacheMetrics {
		const cacheHitRate = (cacheCreationInputTokens + cacheReadInputTokens) > 0
			? cacheReadInputTokens / (cacheReadInputTokens + cacheCreationInputTokens)
			: 0;

		const metrics: CacheMetrics = {
			requestId: `req-${this.nextRequestId++}`,
			model,
			agentHandle,
			timestamp: Date.now(),
			cacheCreationInputTokens,
			cacheReadInputTokens,
			totalInputTokens,
			outputTokens,
			cacheHitRate,
		};

		this.cacheMetrics.push(metrics);

		// Trim old entries
		if (this.cacheMetrics.length > this.maxMetricsHistory) {
			this.cacheMetrics.splice(0, this.cacheMetrics.length - this.maxMetricsHistory);
		}

		// Update aggregate stats
		this.updateAgentStats(agentHandle, metrics);

		// Log if cache hit rate is below target
		if (cacheHitRate < 0.9 && (cacheCreationInputTokens + cacheReadInputTokens) > 0) {
			console.warn(
				`[PromptCacheOptimizer] Low cache hit rate for ${agentHandle}: ` +
				`${(cacheHitRate * 100).toFixed(1)}% ` +
				`(creation: ${cacheCreationInputTokens}, read: ${cacheReadInputTokens})`
			);
		}

		return metrics;
	}

	/**
	 * Audit the prompt structure for an agent type.
	 * Detects common cache-busting patterns.
	 */
	auditPromptStructure(
		agentHandle: string,
		systemPrompt: string,
		claudeMdContent: string,
		graphContext: string,
		dynamicContent: string,
	): PromptAuditResult {
		const issues: PromptAuditIssue[] = [];

		// Check for timestamps in system prompt
		const timestampPatterns = [
			/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,
			/\d{13,}/, // Unix timestamps
			/Date\.now\(\)/,
			/new Date\(\)/,
		];

		for (const pattern of timestampPatterns) {
			if (pattern.test(systemPrompt)) {
				issues.push({
					severity: 'error',
					message: 'System prompt contains timestamp-like content that changes per request',
					recommendation: 'Move timestamps to dynamic content section at the end of the prompt',
				});
				break;
			}
		}

		// Check for changing file contents in system prompt
		const systemPromptHash = this.simpleHash(systemPrompt);
		const prevHashes = this.promptHashes.get(agentHandle) ?? [];
		if (prevHashes.length > 0 && prevHashes[prevHashes.length - 1] !== systemPromptHash) {
			issues.push({
				severity: 'warning',
				message: 'System prompt hash changed between invocations',
				recommendation: 'Ensure system prompt is identical across invocations of the same agent type',
			});
		}
		prevHashes.push(systemPromptHash);
		if (prevHashes.length > 10) {
			prevHashes.shift();
		}
		this.promptHashes.set(agentHandle, prevHashes);

		// Check prompt ordering (static should come before dynamic)
		const systemPromptPosition = 0;
		const claudeMdPosition = systemPrompt.length;
		const graphContextPosition = claudeMdPosition + claudeMdContent.length;
		const dynamicPosition = graphContextPosition + graphContext.length;

		if (claudeMdContent && graphContext && claudeMdContent.length > 0 && graphContext.length > 0) {
			// Verify no dynamic content is interspersed before static content
			if (dynamicContent && systemPrompt.includes(dynamicContent.substring(0, 50))) {
				issues.push({
					severity: 'error',
					message: 'Dynamic content appears to be embedded in the system prompt',
					recommendation: 'Keep static content at the top, dynamic at the bottom for prefix matching',
				});
			}
		}

		// Check for conversation history ordering
		if (systemPrompt.includes('conversation') || systemPrompt.includes('history')) {
			issues.push({
				severity: 'info',
				message: 'System prompt references conversation history',
				recommendation: 'Ensure conversation history is placed at the end of the prompt, not in the middle',
			});
		}

		// Calculate cache prefix length (estimated static portion)
		const cachePrefixLength = systemPrompt.length + claudeMdContent.length;

		return {
			agentHandle,
			systemPromptHash,
			systemPromptLength: systemPrompt.length,
			claudeMdHash: this.simpleHash(claudeMdContent),
			claudeMdLength: claudeMdContent.length,
			graphContextLength: graphContext.length,
			dynamicContentLength: dynamicContent.length,
			issues,
			cachePrefixLength,
		};
	}

	/**
	 * Get aggregate cache statistics for a specific agent.
	 */
	getAgentCacheStats(agentHandle: string): AgentCacheStats | undefined {
		return this.agentStats.get(agentHandle);
	}

	/**
	 * Get aggregate cache statistics for all agents.
	 */
	getAllCacheStats(): AgentCacheStats[] {
		return [...this.agentStats.values()];
	}

	/**
	 * Get the overall cache hit rate across all agents.
	 */
	getOverallCacheHitRate(): number {
		let totalRead = 0;
		let totalCreation = 0;

		for (const stats of this.agentStats.values()) {
			totalRead += stats.totalCacheReadTokens;
			totalCreation += stats.totalCacheCreationTokens;
		}

		if (totalRead + totalCreation === 0) {
			return 0;
		}

		return totalRead / (totalRead + totalCreation);
	}

	/**
	 * Get recent cache metrics (last N entries).
	 */
	getRecentMetrics(count: number = 50): CacheMetrics[] {
		return this.cacheMetrics.slice(-count);
	}

	/**
	 * Format cache statistics as a human-readable summary.
	 */
	formatSummary(): string {
		const lines: string[] = ['## Prompt Cache Performance\n'];
		const overallRate = this.getOverallCacheHitRate();
		const target = 0.9;
		const status = overallRate >= target ? 'ON TARGET' : 'BELOW TARGET';

		lines.push(`**Overall Cache Hit Rate:** ${(overallRate * 100).toFixed(1)}% (${status}, target: ${(target * 100).toFixed(0)}%)\n`);

		for (const stats of this.agentStats.values()) {
			const rateStr = (stats.averageCacheHitRate * 100).toFixed(1);
			const savingsStr = stats.estimatedSavings.toFixed(4);

			lines.push(`### ${stats.agentHandle}`);
			lines.push(`- Requests: ${stats.totalRequests}`);
			lines.push(`- Avg cache hit rate: ${rateStr}%`);
			lines.push(`- Cache read tokens: ${stats.totalCacheReadTokens.toLocaleString()}`);
			lines.push(`- Cache creation tokens: ${stats.totalCacheCreationTokens.toLocaleString()}`);
			lines.push(`- Estimated savings: $${savingsStr}`);
			lines.push('');
		}

		return lines.join('\n');
	}

	/**
	 * Persist cache metrics to the workspace.
	 */
	async persistMetrics(): Promise<void> {
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
			overallCacheHitRate: this.getOverallCacheHitRate(),
			agentStats: Object.fromEntries(this.agentStats),
			recentMetrics: this.getRecentMetrics(100),
		};

		const content = Buffer.from(JSON.stringify(data, null, '\t'));
		const fileUri = vscode.Uri.joinPath(metricsDir, `cache-metrics-${timestamp}.json`);
		await vscode.workspace.fs.writeFile(fileUri, content);
	}

	private updateAgentStats(agentHandle: string, metrics: CacheMetrics): void {
		let stats = this.agentStats.get(agentHandle);
		if (!stats) {
			stats = {
				agentHandle,
				totalRequests: 0,
				averageCacheHitRate: 0,
				totalCacheCreationTokens: 0,
				totalCacheReadTokens: 0,
				totalInputTokens: 0,
				estimatedSavings: 0,
			};
			this.agentStats.set(agentHandle, stats);
		}

		stats.totalRequests++;
		stats.totalCacheCreationTokens += metrics.cacheCreationInputTokens;
		stats.totalCacheReadTokens += metrics.cacheReadInputTokens;
		stats.totalInputTokens += metrics.totalInputTokens;

		// Recalculate average
		stats.averageCacheHitRate = (stats.totalCacheReadTokens + stats.totalCacheCreationTokens) > 0
			? stats.totalCacheReadTokens / (stats.totalCacheReadTokens + stats.totalCacheCreationTokens)
			: 0;

		// Estimate savings: cached tokens cost 90% less
		// Standard input cost ~$3/1M tokens, cached cost ~$0.30/1M tokens
		const savedTokens = stats.totalCacheReadTokens;
		const savingsPerToken = (3.0 - 0.30) / 1_000_000;
		stats.estimatedSavings = savedTokens * savingsPerToken;
	}

	private simpleHash(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash |= 0; // Convert to 32-bit integer
		}
		return hash.toString(16);
	}
}
