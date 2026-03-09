/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Benchmark result for a specific test case.
 */
export interface BenchmarkResult {
	testId: number;
	description: string;
	filesInvolved: number;
	complexity: 'low' | 'medium' | 'high';
	sequentialAvgMs: number;
	parallelAvgMs: number;
	speedup: number;
	conflictCount: number;
	mergeSuccess: boolean;
	runs: BenchmarkRun[];
}

/**
 * A single benchmark run.
 */
export interface BenchmarkRun {
	runNumber: number;
	agentCount: number;
	durationMs: number;
	conflicts: string[];
	mergeSuccess: boolean;
	lockContentionEvents: number;
	diskUsageMb: number;
	tokenUsage: number;
}

/**
 * Aggregate benchmark metrics.
 */
export interface BenchmarkAggregate {
	agentCount: number;
	averageSpeedup: number;
	overallConflictRate: number;
	mergeSuccessRate: number;
	averageTokenUsage: number;
	averageDiskUsageMb: number;
	maxLockContentionEvents: number;
	passesDecisionGate: boolean;
}

/**
 * Scaling readiness check result.
 */
export interface ScalingReadiness {
	currentMaxAgents: number;
	targetMaxAgents: number;
	ready: boolean;
	blockers: ScalingBlocker[];
	recommendations: string[];
}

export interface ScalingBlocker {
	category: 'conflict-rate' | 'performance' | 'lock-contention' | 'disk-usage' | 'rate-limit';
	description: string;
	currentValue: number;
	threshold: number;
}

const MAX_CONFLICT_RATE = 0.05; // 5%
const MAX_LOCK_CONTENTION_PER_RUN = 10;
const MAX_DISK_USAGE_PER_WORKTREE_MB = 2048;
const BENCHMARK_RUNS_PER_TEST = 3;

/**
 * ScalingManager — manages scaling from 2 to 4 concurrent agents.
 *
 * Responsibilities:
 * 1. Run benchmark suites with configurable agent counts
 * 2. Track and compare results across 2 and 4 agent configurations
 * 3. Enforce decision gates (conflict rate < 5%)
 * 4. Monitor lock contention, disk usage, and rate limits
 */
export class ScalingManager {
	private readonly benchmarkResults = new Map<number, BenchmarkResult[]>(); // agentCount -> results
	private currentMaxAgents = 2;

	/**
	 * Define the benchmark test suite.
	 */
	getTestSuite(): Array<{
		testId: number;
		description: string;
		filesInvolved: number;
		complexity: 'low' | 'medium' | 'high';
	}> {
		return [
			{ testId: 1, description: 'Add error handling to two independent modules', filesInvolved: 2, complexity: 'low' },
			{ testId: 2, description: 'Refactor function signatures across caller chain', filesInvolved: 4, complexity: 'medium' },
			{ testId: 3, description: 'Add tests for two unrelated components', filesInvolved: 4, complexity: 'low' },
			{ testId: 4, description: 'Update API types and their consumers', filesInvolved: 6, complexity: 'medium' },
			{ testId: 5, description: 'Add logging to two separate services', filesInvolved: 4, complexity: 'low' },
			{ testId: 6, description: 'Migrate callback-style to async/await in two modules', filesInvolved: 4, complexity: 'medium' },
			{ testId: 7, description: 'Add input validation to two API endpoints', filesInvolved: 4, complexity: 'low' },
			{ testId: 8, description: 'Refactor shared utility and update all callers', filesInvolved: 8, complexity: 'high' },
			{ testId: 9, description: 'Add documentation for three independent modules', filesInvolved: 6, complexity: 'low' },
			{ testId: 10, description: 'Cross-module type rename with dependent tests', filesInvolved: 10, complexity: 'high' },
		];
	}

	/**
	 * Record a benchmark result.
	 */
	recordBenchmarkResult(agentCount: number, result: BenchmarkResult): void {
		let results = this.benchmarkResults.get(agentCount);
		if (!results) {
			results = [];
			this.benchmarkResults.set(agentCount, results);
		}
		results.push(result);
	}

	/**
	 * Record a single benchmark run.
	 */
	recordBenchmarkRun(
		agentCount: number,
		testId: number,
		run: BenchmarkRun,
	): void {
		const results = this.benchmarkResults.get(agentCount) ?? [];
		let result = results.find(r => r.testId === testId);

		if (!result) {
			const testDef = this.getTestSuite().find(t => t.testId === testId);
			result = {
				testId,
				description: testDef?.description ?? `Test ${testId}`,
				filesInvolved: testDef?.filesInvolved ?? 0,
				complexity: testDef?.complexity ?? 'low',
				sequentialAvgMs: 0,
				parallelAvgMs: 0,
				speedup: 0,
				conflictCount: 0,
				mergeSuccess: true,
				runs: [],
			};
			results.push(result);
			this.benchmarkResults.set(agentCount, results);
		}

		result.runs.push(run);
		result.conflictCount += run.conflicts.length;
		result.mergeSuccess = result.mergeSuccess && run.mergeSuccess;

		// Recalculate averages
		const totalDuration = result.runs.reduce((sum, r) => sum + r.durationMs, 0);
		result.parallelAvgMs = totalDuration / result.runs.length;
		if (result.sequentialAvgMs > 0) {
			result.speedup = result.sequentialAvgMs / result.parallelAvgMs;
		}
	}

	/**
	 * Calculate aggregate metrics for a given agent count.
	 */
	getAggregate(agentCount: number): BenchmarkAggregate {
		const results = this.benchmarkResults.get(agentCount) ?? [];

		if (results.length === 0) {
			return {
				agentCount,
				averageSpeedup: 0,
				overallConflictRate: 0,
				mergeSuccessRate: 0,
				averageTokenUsage: 0,
				averageDiskUsageMb: 0,
				maxLockContentionEvents: 0,
				passesDecisionGate: false,
			};
		}

		const totalRuns = results.reduce((sum, r) => sum + r.runs.length, 0);
		const totalConflicts = results.reduce((sum, r) => sum + r.conflictCount, 0);
		const mergeSuccesses = results.filter(r => r.mergeSuccess).length;
		const avgSpeedup = results.reduce((sum, r) => sum + r.speedup, 0) / results.length;

		let totalTokens = 0;
		let totalDisk = 0;
		let maxContention = 0;

		for (const result of results) {
			for (const run of result.runs) {
				totalTokens += run.tokenUsage;
				totalDisk += run.diskUsageMb;
				maxContention = Math.max(maxContention, run.lockContentionEvents);
			}
		}

		const conflictRate = totalRuns > 0 ? totalConflicts / totalRuns : 0;

		return {
			agentCount,
			averageSpeedup: avgSpeedup,
			overallConflictRate: conflictRate,
			mergeSuccessRate: results.length > 0 ? mergeSuccesses / results.length : 0,
			averageTokenUsage: totalRuns > 0 ? totalTokens / totalRuns : 0,
			averageDiskUsageMb: totalRuns > 0 ? totalDisk / totalRuns : 0,
			maxLockContentionEvents: maxContention,
			passesDecisionGate: conflictRate <= MAX_CONFLICT_RATE,
		};
	}

	/**
	 * Check if it's safe to scale to a target agent count.
	 */
	checkScalingReadiness(targetAgentCount: number): ScalingReadiness {
		const blockers: ScalingBlocker[] = [];
		const recommendations: string[] = [];

		// Check baseline (2 agents) conflict rate
		const baselineAggregate = this.getAggregate(2);
		if (baselineAggregate.overallConflictRate > MAX_CONFLICT_RATE) {
			blockers.push({
				category: 'conflict-rate',
				description: `Baseline (2 agents) conflict rate ${(baselineAggregate.overallConflictRate * 100).toFixed(1)}% exceeds ${(MAX_CONFLICT_RATE * 100).toFixed(0)}% threshold`,
				currentValue: baselineAggregate.overallConflictRate,
				threshold: MAX_CONFLICT_RATE,
			});
		}

		// Check target agent count results if available
		const targetAggregate = this.getAggregate(targetAgentCount);
		if (targetAggregate.overallConflictRate > MAX_CONFLICT_RATE) {
			blockers.push({
				category: 'conflict-rate',
				description: `${targetAgentCount}-agent conflict rate ${(targetAggregate.overallConflictRate * 100).toFixed(1)}% exceeds threshold`,
				currentValue: targetAggregate.overallConflictRate,
				threshold: MAX_CONFLICT_RATE,
			});

			recommendations.push('Consider finer-grained scope locking at file+function level');
			recommendations.push('Review task decomposition for overlap reduction');
		}

		// Check lock contention
		if (targetAggregate.maxLockContentionEvents > MAX_LOCK_CONTENTION_PER_RUN) {
			blockers.push({
				category: 'lock-contention',
				description: `Lock contention events (${targetAggregate.maxLockContentionEvents}) exceed threshold`,
				currentValue: targetAggregate.maxLockContentionEvents,
				threshold: MAX_LOCK_CONTENTION_PER_RUN,
			});

			recommendations.push('Improve scope locking to support file+function level granularity');
		}

		// Check disk usage (N worktrees)
		const estimatedDisk = targetAggregate.averageDiskUsageMb * targetAgentCount;
		if (estimatedDisk > MAX_DISK_USAGE_PER_WORKTREE_MB * targetAgentCount) {
			blockers.push({
				category: 'disk-usage',
				description: `Estimated disk usage ${estimatedDisk.toFixed(0)}MB for ${targetAgentCount} worktrees exceeds limit`,
				currentValue: estimatedDisk,
				threshold: MAX_DISK_USAGE_PER_WORKTREE_MB * targetAgentCount,
			});
		}

		return {
			currentMaxAgents: this.currentMaxAgents,
			targetMaxAgents: targetAgentCount,
			ready: blockers.length === 0,
			blockers,
			recommendations,
		};
	}

	/**
	 * Promote the max concurrent agent count if readiness checks pass.
	 */
	promoteMaxAgents(targetAgentCount: number): boolean {
		const readiness = this.checkScalingReadiness(targetAgentCount);
		if (readiness.ready) {
			this.currentMaxAgents = targetAgentCount;
			return true;
		}
		return false;
	}

	/**
	 * Get the current maximum concurrent agent count.
	 */
	getMaxAgents(): number {
		return this.currentMaxAgents;
	}

	/**
	 * Format benchmark results as a markdown report.
	 */
	formatReport(agentCount: number): string {
		const results = this.benchmarkResults.get(agentCount) ?? [];
		const aggregate = this.getAggregate(agentCount);

		const lines: string[] = [`## Parallel Agent Benchmark Results (${agentCount} agents)\n`];

		if (results.length === 0) {
			lines.push('> No benchmark results available. Run benchmarks to populate.\n');
			return lines.join('\n');
		}

		lines.push('| Test | Description | Files | Parallel Avg | Speedup | Conflicts | Merge |');
		lines.push('|------|------------|-------|-------------|---------|-----------|-------|');

		for (const result of results) {
			lines.push(
				`| ${result.testId} | ${result.description} ` +
				`| ${result.filesInvolved} ` +
				`| ${result.parallelAvgMs.toFixed(0)}ms ` +
				`| ${result.speedup.toFixed(2)}x ` +
				`| ${result.conflictCount} ` +
				`| ${result.mergeSuccess ? 'Yes' : 'No'} |`
			);
		}

		lines.push('\n### Aggregate Metrics\n');
		lines.push(`| Metric | Value |`);
		lines.push(`|--------|-------|`);
		lines.push(`| Average parallel speedup | ${aggregate.averageSpeedup.toFixed(2)}x |`);
		lines.push(`| Overall conflict rate | ${(aggregate.overallConflictRate * 100).toFixed(1)}% |`);
		lines.push(`| Merge success rate | ${(aggregate.mergeSuccessRate * 100).toFixed(1)}% |`);
		lines.push(`| Average token usage | ${aggregate.averageTokenUsage.toFixed(0)} |`);
		lines.push(`| Decision gate | ${aggregate.passesDecisionGate ? 'PASS' : 'FAIL'} |`);

		// Scaling readiness
		if (agentCount < 4) {
			const readiness = this.checkScalingReadiness(4);
			lines.push('\n### Scaling to 4 Agents\n');
			lines.push(`**Status:** ${readiness.ready ? 'READY' : 'NOT READY'}\n`);
			for (const blocker of readiness.blockers) {
				lines.push(`- **Blocker (${blocker.category}):** ${blocker.description}`);
			}
			for (const rec of readiness.recommendations) {
				lines.push(`- **Recommendation:** ${rec}`);
			}
		}

		return lines.join('\n');
	}

	/**
	 * Persist benchmark results to the workspace.
	 */
	async persistResults(): Promise<void> {
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
		const data: Record<string, unknown> = {};

		for (const [agentCount, results] of this.benchmarkResults) {
			data[`${agentCount}-agents`] = {
				results,
				aggregate: this.getAggregate(agentCount),
			};
		}

		const content = Buffer.from(JSON.stringify(data, null, '\t'));
		const fileUri = vscode.Uri.joinPath(metricsDir, `benchmark-results-${timestamp}.json`);
		await vscode.workspace.fs.writeFile(fileUri, content);
	}
}
