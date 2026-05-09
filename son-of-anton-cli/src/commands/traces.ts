/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ModelRouter } from 'son-of-anton-core/dist/llm/ModelRouter';
import { PromptCacheOptimizer } from 'son-of-anton-core/dist/llm/PromptCacheOptimizer';
import { SOTA_EXIT_CODES } from '../headless';

interface TracesOptions {
	output?: 'text' | 'json';
	load?: string;
}

/**
 * Shape of the JSON file `PromptCacheOptimizer.persistMetrics()` writes under
 * `<workspaceRoot>/.son-of-anton/metrics/cache-metrics-<timestamp>.json`. Kept
 * loose so future fields don't break the loader.
 */
interface PersistedCacheMetrics {
	timestamp?: string;
	overallCacheHitRate?: number;
	agentStats?: Record<string, unknown>;
	recentMetrics?: unknown[];
}

/**
 * Shape of the JSON file `ModelRouter.persistData()` writes under
 * `<workspaceRoot>/.son-of-anton/metrics/routing-data-<timestamp>.json`.
 */
interface PersistedRoutingData {
	timestamp?: string;
	routingRules?: unknown[];
	experiments?: unknown[];
	taskAnalysis?: Record<string, unknown>;
}

/**
 * Locate the most recently-modified file in `dir` whose basename starts with
 * `prefix`. Returns `undefined` when the directory does not exist or contains
 * no matching files. Used by `--load` to default to the latest snapshot when
 * the user passes a directory rather than a specific JSON path.
 */
async function findLatestSnapshot(dir: string, prefix: string): Promise<string | undefined> {
	let entries: string[];
	try {
		entries = await fs.readdir(dir);
	} catch {
		return undefined;
	}

	const candidates = entries.filter(name => name.startsWith(prefix) && name.endsWith('.json'));
	if (candidates.length === 0) {
		return undefined;
	}

	let latest: { file: string; mtime: number } | undefined;
	for (const name of candidates) {
		const full = path.join(dir, name);
		try {
			const stat = await fs.stat(full);
			if (!latest || stat.mtimeMs > latest.mtime) {
				latest = { file: full, mtime: stat.mtimeMs };
			}
		} catch {
			// Skip unreadable entries.
		}
	}
	return latest?.file;
}

/**
 * Resolve the user-supplied `--load <path>` argument. Accepts either a
 * directory (we'll pick the latest snapshot of each type) or a specific JSON
 * file path (we'll load that file regardless of which snapshot type it is).
 * Falling back to the metrics directory under `<path>/.son-of-anton/metrics`
 * lets users pass a workspace root.
 */
async function resolveLoadPaths(loadArg: string): Promise<{
	cacheFile?: string;
	routingFile?: string;
}> {
	const stat = await fs.stat(loadArg).catch(() => undefined);
	if (!stat) {
		return {};
	}

	if (stat.isFile()) {
		const base = path.basename(loadArg);
		if (base.startsWith('cache-metrics-')) {
			return { cacheFile: loadArg };
		}
		if (base.startsWith('routing-data-')) {
			return { routingFile: loadArg };
		}
		// Unknown filename — try to read it as either; loader tolerates noise.
		return { cacheFile: loadArg, routingFile: loadArg };
	}

	// Directory — try `<dir>` first, then `<dir>/.son-of-anton/metrics`.
	const candidates = [loadArg, path.join(loadArg, '.son-of-anton', 'metrics')];
	for (const dir of candidates) {
		const cacheFile = await findLatestSnapshot(dir, 'cache-metrics-');
		const routingFile = await findLatestSnapshot(dir, 'routing-data-');
		if (cacheFile || routingFile) {
			return { cacheFile, routingFile };
		}
	}
	return {};
}

/**
 * Read and JSON-parse a snapshot file. Returns `undefined` on any error so
 * the caller can keep going (a missing routing snapshot must not block a
 * cache-stats dump and vice versa).
 */
async function readSnapshot<T>(file: string | undefined): Promise<T | undefined> {
	if (!file) {
		return undefined;
	}
	try {
		const raw = await fs.readFile(file, 'utf8');
		return JSON.parse(raw) as T;
	} catch {
		return undefined;
	}
}

/**
 * Render a persisted cache-metrics snapshot as the same markdown shape that
 * `PromptCacheOptimizer.formatSummary()` produces, so `--load` output is
 * indistinguishable from a live dump.
 */
function formatPersistedCacheSummary(snapshot: PersistedCacheMetrics): string {
	const lines: string[] = ['## Prompt Cache Performance\n'];
	const overall = snapshot.overallCacheHitRate ?? 0;
	const target = 0.9;
	const status = overall >= target ? 'ON TARGET' : 'BELOW TARGET';
	lines.push(`**Overall Cache Hit Rate:** ${(overall * 100).toFixed(1)}% (${status}, target: ${(target * 100).toFixed(0)}%)`);
	if (snapshot.timestamp) {
		lines.push(`_Snapshot taken at ${snapshot.timestamp}_`);
	}
	lines.push('');

	const stats = snapshot.agentStats ?? {};
	for (const [handle, raw] of Object.entries(stats)) {
		const s = raw as {
			totalRequests?: number;
			averageCacheHitRate?: number;
			totalCacheReadTokens?: number;
			totalCacheCreationTokens?: number;
			estimatedSavings?: number;
		};
		lines.push(`### ${handle}`);
		lines.push(`- Requests: ${s.totalRequests ?? 0}`);
		lines.push(`- Avg cache hit rate: ${((s.averageCacheHitRate ?? 0) * 100).toFixed(1)}%`);
		lines.push(`- Cache read tokens: ${(s.totalCacheReadTokens ?? 0).toLocaleString()}`);
		lines.push(`- Cache creation tokens: ${(s.totalCacheCreationTokens ?? 0).toLocaleString()}`);
		lines.push(`- Estimated savings: $${(s.estimatedSavings ?? 0).toFixed(4)}`);
		lines.push('');
	}
	return lines.join('\n');
}

/**
 * Render a persisted routing-data snapshot as a markdown table set, mirroring
 * `ModelRouter.formatSummary()` so output is consistent across live / loaded
 * modes.
 */
function formatPersistedRoutingSummary(snapshot: PersistedRoutingData): string {
	const lines: string[] = ['## Model Routing Summary\n'];
	if (snapshot.timestamp) {
		lines.push(`_Snapshot taken at ${snapshot.timestamp}_\n`);
	}

	const rules = snapshot.routingRules ?? [];
	if (rules.length > 0) {
		lines.push('### Current Routing Rules\n');
		lines.push('| Task Category | Model | Reason |');
		lines.push('|---|---|---|');
		for (const raw of rules) {
			const r = raw as { taskCategory?: string; model?: string; reason?: string };
			lines.push(`| ${r.taskCategory ?? '?'} | ${r.model ?? '?'} | ${r.reason ?? ''} |`);
		}
	}

	const experiments = (snapshot.experiments ?? []) as Array<{
		taskCategory?: string;
		modelA?: string;
		modelB?: string;
		modelASuccessRate?: number;
		modelBSuccessRate?: number;
		totalTrials?: number;
		winner?: string | null;
	}>;
	const activeExperiments = experiments.filter(e => (e.totalTrials ?? 0) > 0);
	if (activeExperiments.length > 0) {
		lines.push('\n### Active Experiments\n');
		lines.push('| Category | Model A | Model B | A Success | B Success | Trials | Winner |');
		lines.push('|---|---|---|---|---|---|---|');
		for (const e of activeExperiments) {
			lines.push(
				`| ${e.taskCategory ?? '?'} | ${e.modelA ?? '?'} | ${e.modelB ?? '?'} ` +
				`| ${((e.modelASuccessRate ?? 0) * 100).toFixed(1)}% | ${((e.modelBSuccessRate ?? 0) * 100).toFixed(1)}% ` +
				`| ${e.totalTrials ?? 0} | ${e.winner ?? 'TBD'} |`,
			);
		}
	}

	const analysis = snapshot.taskAnalysis ?? {};
	const analysisEntries = Object.entries(analysis);
	if (analysisEntries.length > 0) {
		lines.push('\n### Task Performance\n');
		lines.push('| Category | Model | Success Rate | Avg Latency | Avg Cost | Trials |');
		lines.push('|---|---|---|---|---|---|');
		for (const [category, raw] of analysisEntries) {
			const d = raw as { model?: string; successRate?: number; avgLatency?: number; avgCost?: number; totalTrials?: number };
			lines.push(
				`| ${category} | ${d.model ?? '?'} ` +
				`| ${((d.successRate ?? 0) * 100).toFixed(1)}% ` +
				`| ${Math.round(d.avgLatency ?? 0)}ms ` +
				`| $${(d.avgCost ?? 0).toFixed(4)} ` +
				`| ${d.totalTrials ?? 0} |`,
			);
		}
	}

	return lines.join('\n');
}

/**
 * Top-level `sota traces` command. Surfaces the markdown summaries that
 * `PromptCacheOptimizer.formatSummary()` and `ModelRouter.formatSummary()`
 * already produce internally, so harness phase H16 has a developer-facing
 * dump even when the IDE isn't open.
 *
 * Without `--load`, both summaries are read from freshly-instantiated
 * objects — empty by design, since no LLM calls have run inside this process.
 * With `--load <path>`, the most recent persisted snapshots from
 * `<path>/.son-of-anton/metrics/` are rendered instead.
 */
export async function runTraces(opts: TracesOptions): Promise<void> {
	let cacheMarkdown: string;
	let routingMarkdown: string;
	let cacheJson: unknown;
	let routingJson: unknown;

	if (opts.load) {
		const { cacheFile, routingFile } = await resolveLoadPaths(opts.load);
		const cacheSnapshot = await readSnapshot<PersistedCacheMetrics>(cacheFile);
		const routingSnapshot = await readSnapshot<PersistedRoutingData>(routingFile);

		if (!cacheSnapshot && !routingSnapshot) {
			const message = `No persisted metrics found under ${opts.load} — expected cache-metrics-*.json or routing-data-*.json.`;
			if (opts.output === 'json') {
				process.stdout.write(JSON.stringify({ ok: false, error: message }) + '\n');
			} else {
				process.stderr.write(`error: ${message}\n`);
			}
			process.exit(SOTA_EXIT_CODES.HARD_FAIL);
		}

		cacheMarkdown = cacheSnapshot
			? formatPersistedCacheSummary(cacheSnapshot)
			: '## Prompt Cache Performance\n\n_(no cache-metrics snapshot found at the supplied path)_\n';
		routingMarkdown = routingSnapshot
			? formatPersistedRoutingSummary(routingSnapshot)
			: '## Model Routing Summary\n\n_(no routing-data snapshot found at the supplied path)_\n';
		cacheJson = cacheSnapshot ?? null;
		routingJson = routingSnapshot ?? null;
	} else {
		// Live dump from a fresh in-process pair. Both classes have parameterless
		// constructors and aggregate per-process data only — without `--load`
		// the output is the default routing rules + an empty cache summary,
		// which is still useful for confirming the surface is wired up.
		const cacheOptimizer = new PromptCacheOptimizer();
		const modelRouter = new ModelRouter();
		cacheMarkdown = cacheOptimizer.formatSummary();
		routingMarkdown = modelRouter.formatSummary();
		cacheJson = {
			overallCacheHitRate: cacheOptimizer.getOverallCacheHitRate(),
			agentStats: Object.fromEntries(
				cacheOptimizer.getAllCacheStats().map(s => [s.agentHandle, s]),
			),
		};
		routingJson = {
			routingRules: modelRouter.getRoutingRules(),
			experiments: modelRouter.getExperiments(),
			taskAnalysis: Object.fromEntries(modelRouter.getTaskAnalysis()),
		};
	}

	if (opts.output === 'json') {
		process.stdout.write(JSON.stringify({
			cache: cacheJson,
			routing: routingJson,
		}, null, 2) + '\n');
		return;
	}

	process.stdout.write('# Son of Anton — Harness Traces\n\n');
	process.stdout.write(cacheMarkdown);
	if (!cacheMarkdown.endsWith('\n')) {
		process.stdout.write('\n');
	}
	process.stdout.write('\n');
	process.stdout.write(routingMarkdown);
	if (!routingMarkdown.endsWith('\n')) {
		process.stdout.write('\n');
	}
}
