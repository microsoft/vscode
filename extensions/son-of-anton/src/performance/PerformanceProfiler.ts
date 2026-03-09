/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Memory snapshot for a single process or service.
 */
export interface MemorySnapshot {
	timestamp: number;
	processName: string;
	rssBytes: number;
	heapUsedBytes: number;
	heapTotalBytes: number;
	externalBytes: number;
}

/**
 * Profile result for a specific scenario.
 */
export interface ProfileScenario {
	name: string;
	activeAgentCount: number;
	memorySnapshots: MemorySnapshot[];
	cpuSamples: CpuSample[];
	graphQueryLatencies: QueryLatency[];
	inputLatencyMs: number;
	timestamp: number;
}

/**
 * CPU usage sample.
 */
export interface CpuSample {
	timestamp: number;
	processName: string;
	userCpuMs: number;
	systemCpuMs: number;
	percentCpu: number;
}

/**
 * Graph query latency measurement.
 */
export interface QueryLatency {
	query: string;
	queryHash: string;
	latencyMs: number;
	resultCount: number;
	timestamp: number;
	cached: boolean;
}

/**
 * Hot path identified by CPU profiling.
 */
export interface HotPath {
	name: string;
	category: 'llm-parsing' | 'graph-query' | 'ui-rendering' | 'tree-sitter' | 'other';
	totalTimeMs: number;
	callCount: number;
	averageTimeMs: number;
	percentage: number;
}

/**
 * Performance budget thresholds.
 */
export interface PerformanceBudget {
	maxInputLatencyMs: number;
	maxGraphQueryMs: number;
	maxMemoryMb: number;
	maxConcurrentAgents: number;
}

const DEFAULT_BUDGET: PerformanceBudget = {
	maxInputLatencyMs: 100,
	maxGraphQueryMs: 500,
	maxMemoryMb: 4096,
	maxConcurrentAgents: 4,
};

/**
 * Graph query cache entry.
 */
interface QueryCacheEntry {
	result: unknown;
	timestamp: number;
	hitCount: number;
}

/**
 * PerformanceProfiler — measures and monitors IDE performance under agent load.
 *
 * Responsibilities:
 * 1. Memory profiling across scenarios (0, 1, 2, 4 agents)
 * 2. CPU profiling to identify hot paths
 * 3. Graph query optimization with caching and index recommendations
 * 4. Lazy loading of graph data with LRU eviction
 * 5. Input latency monitoring with budget enforcement
 */
export class PerformanceProfiler {
	private readonly scenarios: ProfileScenario[] = [];
	private readonly queryLatencies: QueryLatency[] = [];
	private readonly queryFrequency = new Map<string, number>();
	private readonly queryCache = new Map<string, QueryCacheEntry>();
	private readonly hotSubgraphs = new Map<string, { accessCount: number; lastAccessed: number }>();
	private readonly budget: PerformanceBudget;

	private readonly maxQueryCacheSize = 500;
	private readonly queryCacheTtlMs = 300_000; // 5 minutes
	private readonly coldEvictionMs = 600_000; // 10 minutes

	private profilingActive = false;
	private currentScenario: ProfileScenario | undefined;
	private memoryCheckTimer: ReturnType<typeof setInterval> | undefined;

	constructor(budget?: Partial<PerformanceBudget>) {
		this.budget = { ...DEFAULT_BUDGET, ...budget };
	}

	/**
	 * Start a profiling session for a specific scenario.
	 */
	startProfiling(scenarioName: string, activeAgentCount: number): void {
		this.currentScenario = {
			name: scenarioName,
			activeAgentCount,
			memorySnapshots: [],
			cpuSamples: [],
			graphQueryLatencies: [],
			inputLatencyMs: 0,
			timestamp: Date.now(),
		};

		this.profilingActive = true;

		// Take periodic memory snapshots
		this.memoryCheckTimer = setInterval(() => {
			if (this.currentScenario) {
				this.takeMemorySnapshot();
			}
		}, 5000); // Every 5 seconds
	}

	/**
	 * Stop the current profiling session and return results.
	 */
	stopProfiling(): ProfileScenario | undefined {
		if (this.memoryCheckTimer) {
			clearInterval(this.memoryCheckTimer);
			this.memoryCheckTimer = undefined;
		}

		this.profilingActive = false;
		const scenario = this.currentScenario;
		if (scenario) {
			this.scenarios.push(scenario);
			this.currentScenario = undefined;
		}
		return scenario;
	}

	/**
	 * Take a memory snapshot of the current process.
	 */
	takeMemorySnapshot(): MemorySnapshot {
		const memUsage = process.memoryUsage();
		const snapshot: MemorySnapshot = {
			timestamp: Date.now(),
			processName: 'extension-host',
			rssBytes: memUsage.rss,
			heapUsedBytes: memUsage.heapUsed,
			heapTotalBytes: memUsage.heapTotal,
			externalBytes: memUsage.external,
		};

		if (this.currentScenario) {
			this.currentScenario.memorySnapshots.push(snapshot);
		}

		return snapshot;
	}

	/**
	 * Record a CPU usage sample.
	 */
	recordCpuSample(processName: string): CpuSample {
		const cpuUsage = process.cpuUsage();
		const sample: CpuSample = {
			timestamp: Date.now(),
			processName,
			userCpuMs: cpuUsage.user / 1000,
			systemCpuMs: cpuUsage.system / 1000,
			percentCpu: 0, // Calculated from delta
		};

		if (this.currentScenario) {
			this.currentScenario.cpuSamples.push(sample);
		}

		return sample;
	}

	/**
	 * Record a graph query execution and its latency.
	 */
	recordQueryLatency(query: string, latencyMs: number, resultCount: number, cached: boolean = false): QueryLatency {
		const queryHash = this.hashQuery(query);

		const entry: QueryLatency = {
			query,
			queryHash,
			latencyMs,
			resultCount,
			timestamp: Date.now(),
			cached,
		};

		this.queryLatencies.push(entry);
		if (this.queryLatencies.length > 10000) {
			this.queryLatencies.splice(0, this.queryLatencies.length - 10000);
		}

		if (this.currentScenario) {
			this.currentScenario.graphQueryLatencies.push(entry);
		}

		// Track frequency
		const freq = this.queryFrequency.get(queryHash) ?? 0;
		this.queryFrequency.set(queryHash, freq + 1);

		// Check budget
		if (latencyMs > this.budget.maxGraphQueryMs) {
			console.warn(
				`[PerformanceProfiler] Graph query exceeded budget: ` +
				`${latencyMs}ms > ${this.budget.maxGraphQueryMs}ms ` +
				`(query: ${query.substring(0, 100)}...)`
			);
		}

		return entry;
	}

	/**
	 * Record input latency measurement.
	 */
	recordInputLatency(latencyMs: number): void {
		if (this.currentScenario) {
			// Running average
			if (this.currentScenario.inputLatencyMs === 0) {
				this.currentScenario.inputLatencyMs = latencyMs;
			} else {
				this.currentScenario.inputLatencyMs =
					this.currentScenario.inputLatencyMs * 0.9 + latencyMs * 0.1;
			}
		}

		if (latencyMs > this.budget.maxInputLatencyMs) {
			console.warn(
				`[PerformanceProfiler] Input latency exceeded budget: ` +
				`${latencyMs}ms > ${this.budget.maxInputLatencyMs}ms`
			);
		}
	}

	/**
	 * Get the top N most frequent queries for optimization.
	 */
	getTopQueries(n: number = 10): Array<{ query: string; frequency: number; avgLatencyMs: number }> {
		const queryStats = new Map<string, { query: string; totalLatency: number; count: number }>();

		for (const entry of this.queryLatencies) {
			let stats = queryStats.get(entry.queryHash);
			if (!stats) {
				stats = { query: entry.query, totalLatency: 0, count: 0 };
				queryStats.set(entry.queryHash, stats);
			}
			stats.totalLatency += entry.latencyMs;
			stats.count++;
		}

		return [...queryStats.values()]
			.map(s => ({
				query: s.query,
				frequency: s.count,
				avgLatencyMs: s.totalLatency / s.count,
			}))
			.sort((a, b) => b.frequency - a.frequency)
			.slice(0, n);
	}

	/**
	 * Check or populate query cache.
	 * Returns cached result if available, or undefined.
	 */
	getCachedQuery(query: string): unknown | undefined {
		const hash = this.hashQuery(query);
		const entry = this.queryCache.get(hash);

		if (!entry) {
			return undefined;
		}

		// Check TTL
		if (Date.now() - entry.timestamp > this.queryCacheTtlMs) {
			this.queryCache.delete(hash);
			return undefined;
		}

		entry.hitCount++;
		return entry.result;
	}

	/**
	 * Store a query result in the cache.
	 */
	setCachedQuery(query: string, result: unknown): void {
		const hash = this.hashQuery(query);

		// Evict if at capacity
		if (this.queryCache.size >= this.maxQueryCacheSize) {
			this.evictLruCacheEntry();
		}

		this.queryCache.set(hash, {
			result,
			timestamp: Date.now(),
			hitCount: 0,
		});
	}

	/**
	 * Track access to a subgraph for lazy loading heuristics.
	 */
	recordSubgraphAccess(subgraphKey: string): void {
		const existing = this.hotSubgraphs.get(subgraphKey);
		if (existing) {
			existing.accessCount++;
			existing.lastAccessed = Date.now();
		} else {
			this.hotSubgraphs.set(subgraphKey, {
				accessCount: 1,
				lastAccessed: Date.now(),
			});
		}
	}

	/**
	 * Get "hot" subgraphs that should be kept in memory.
	 */
	getHotSubgraphs(): string[] {
		const now = Date.now();
		const hot: string[] = [];

		for (const [key, data] of this.hotSubgraphs.entries()) {
			if (now - data.lastAccessed < this.coldEvictionMs) {
				hot.push(key);
			} else {
				this.hotSubgraphs.delete(key);
			}
		}

		return hot.sort((a, b) => {
			const aData = this.hotSubgraphs.get(a)!;
			const bData = this.hotSubgraphs.get(b)!;
			return bData.accessCount - aData.accessCount;
		});
	}

	/**
	 * Get cold subgraphs eligible for eviction.
	 */
	getColdSubgraphs(): string[] {
		const now = Date.now();
		const cold: string[] = [];

		for (const [key, data] of this.hotSubgraphs.entries()) {
			if (now - data.lastAccessed >= this.coldEvictionMs) {
				cold.push(key);
			}
		}

		return cold;
	}

	/**
	 * Identify performance bottlenecks from profiling data.
	 */
	identifyHotPaths(): HotPath[] {
		if (this.queryLatencies.length === 0) {
			return [];
		}

		const categories = new Map<string, { totalTime: number; count: number }>();

		for (const entry of this.queryLatencies) {
			const category = this.categorizeQuery(entry.query);
			const existing = categories.get(category) ?? { totalTime: 0, count: 0 };
			existing.totalTime += entry.latencyMs;
			existing.count++;
			categories.set(category, existing);
		}

		const totalTime = [...categories.values()].reduce((sum, c) => sum + c.totalTime, 0);

		return [...categories.entries()].map(([name, data]) => ({
			name,
			category: this.mapToHotPathCategory(name),
			totalTimeMs: data.totalTime,
			callCount: data.count,
			averageTimeMs: data.totalTime / data.count,
			percentage: totalTime > 0 ? (data.totalTime / totalTime) * 100 : 0,
		})).sort((a, b) => b.totalTimeMs - a.totalTimeMs);
	}

	/**
	 * Check if performance is within budget for a given agent count.
	 */
	checkBudget(activeAgentCount: number): {
		withinBudget: boolean;
		violations: string[];
	} {
		const violations: string[] = [];

		if (activeAgentCount > this.budget.maxConcurrentAgents) {
			violations.push(
				`Agent count ${activeAgentCount} exceeds budget of ${this.budget.maxConcurrentAgents}`
			);
		}

		const memUsage = process.memoryUsage();
		const rssMb = memUsage.rss / (1024 * 1024);
		if (rssMb > this.budget.maxMemoryMb) {
			violations.push(
				`Memory usage ${rssMb.toFixed(0)}MB exceeds budget of ${this.budget.maxMemoryMb}MB`
			);
		}

		if (this.currentScenario && this.currentScenario.inputLatencyMs > this.budget.maxInputLatencyMs) {
			violations.push(
				`Input latency ${this.currentScenario.inputLatencyMs.toFixed(0)}ms exceeds budget of ${this.budget.maxInputLatencyMs}ms`
			);
		}

		return {
			withinBudget: violations.length === 0,
			violations,
		};
	}

	/**
	 * Get all profiling scenarios for comparison.
	 */
	getScenarios(): ProfileScenario[] {
		return [...this.scenarios];
	}

	/**
	 * Format profiling results as a human-readable summary.
	 */
	formatSummary(): string {
		const lines: string[] = ['## Performance Profile Summary\n'];

		// Budget check
		const budgetCheck = this.checkBudget(this.currentScenario?.activeAgentCount ?? 0);
		lines.push(`**Budget Status:** ${budgetCheck.withinBudget ? 'WITHIN BUDGET' : 'OVER BUDGET'}`);
		for (const violation of budgetCheck.violations) {
			lines.push(`- ${violation}`);
		}
		lines.push('');

		// Current memory
		const memUsage = process.memoryUsage();
		lines.push('### Memory Usage');
		lines.push(`- RSS: ${(memUsage.rss / 1024 / 1024).toFixed(1)}MB`);
		lines.push(`- Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(1)}MB`);
		lines.push(`- Heap Total: ${(memUsage.heapTotal / 1024 / 1024).toFixed(1)}MB`);
		lines.push('');

		// Top queries
		const topQueries = this.getTopQueries(5);
		if (topQueries.length > 0) {
			lines.push('### Top Queries (by frequency)');
			lines.push('| Query | Frequency | Avg Latency |');
			lines.push('|---|---|---|');
			for (const q of topQueries) {
				lines.push(`| ${q.query.substring(0, 60)}... | ${q.frequency} | ${q.avgLatencyMs.toFixed(1)}ms |`);
			}
			lines.push('');
		}

		// Hot paths
		const hotPaths = this.identifyHotPaths();
		if (hotPaths.length > 0) {
			lines.push('### Hot Paths');
			lines.push('| Category | Total Time | Calls | Avg Time | % |');
			lines.push('|---|---|---|---|---|');
			for (const hp of hotPaths.slice(0, 5)) {
				lines.push(
					`| ${hp.name} | ${hp.totalTimeMs.toFixed(0)}ms ` +
					`| ${hp.callCount} | ${hp.averageTimeMs.toFixed(1)}ms ` +
					`| ${hp.percentage.toFixed(1)}% |`
				);
			}
			lines.push('');
		}

		// Cache stats
		lines.push('### Query Cache');
		lines.push(`- Entries: ${this.queryCache.size}/${this.maxQueryCacheSize}`);
		lines.push(`- Hot subgraphs: ${this.getHotSubgraphs().length}`);
		lines.push(`- Cold subgraphs (evictable): ${this.getColdSubgraphs().length}`);

		return lines.join('\n');
	}

	/**
	 * Persist profiling data to the workspace.
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
			scenarios: this.scenarios,
			topQueries: this.getTopQueries(20),
			hotPaths: this.identifyHotPaths(),
			hotSubgraphs: this.getHotSubgraphs(),
			budget: this.budget,
		};

		const content = Buffer.from(JSON.stringify(data, null, '\t'));
		const fileUri = vscode.Uri.joinPath(metricsDir, `performance-profile-${timestamp}.json`);
		await vscode.workspace.fs.writeFile(fileUri, content);
	}

	/**
	 * Dispose of timers and resources.
	 */
	dispose(): void {
		if (this.memoryCheckTimer) {
			clearInterval(this.memoryCheckTimer);
			this.memoryCheckTimer = undefined;
		}
	}

	private evictLruCacheEntry(): void {
		let oldestKey: string | undefined;
		let oldestTime = Infinity;

		for (const [key, entry] of this.queryCache.entries()) {
			if (entry.timestamp < oldestTime) {
				oldestTime = entry.timestamp;
				oldestKey = key;
			}
		}

		if (oldestKey) {
			this.queryCache.delete(oldestKey);
		}
	}

	private hashQuery(query: string): string {
		let hash = 0;
		for (let i = 0; i < query.length; i++) {
			const char = query.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash |= 0;
		}
		return hash.toString(16);
	}

	private categorizeQuery(query: string): string {
		const lower = query.toLowerCase();
		if (lower.includes('match') && lower.includes('symbol')) {
			return 'symbol-lookup';
		}
		if (lower.includes('match') && lower.includes('imports')) {
			return 'dependency-traversal';
		}
		if (lower.includes('match') && lower.includes('references')) {
			return 'find-references';
		}
		if (lower.includes('match') && lower.includes('file')) {
			return 'file-summary';
		}
		return 'other-query';
	}

	private mapToHotPathCategory(name: string): HotPath['category'] {
		if (name.includes('symbol') || name.includes('dependency') || name.includes('reference') || name.includes('file')) {
			return 'graph-query';
		}
		return 'other';
	}
}
