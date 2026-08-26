/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Executes live-compatibility scenarios across the prepared build matrix and
 * summarizes the outcome.
 *
 * Two rules shape this file:
 *
 * - **A build is never silently skipped.** A checkpoint that cannot even be
 *   resolved is reported as a failed entry carrying the resolver's own
 *   explanation, so a run that covered three of four builds can never be
 *   mistaken for a run that covered four.
 * - **Builds run sequentially.** Each scenario forks a real Agent Host and, for
 *   the historical checkpoints, that process is a different compiled tree
 *   sharing this machine's temp space. Serializing keeps a failure attributable
 *   to one build instead of to contention between them.
 */

import { existsSync, readFileSync } from 'fs';
import { agentHostLiveCompatBuild, agentHostLiveCompatPlanContext, type AgentHostBuildId } from '../harness/agentHostLiveCompatBuilds.js';
import { AgentHostBuildSourceKind, describeUnusableBuild, isBuildCacheUsable, planAgentHostBuild } from '../harness/agentHostBuildPlan.js';
import type { IPreparedAgentHostBuild } from '../harness/crossVersionAgentHostTarget.js';
import { runSameBuildRestartBaseline, type ILiveCompatScenarioResult } from './sameBuildRestartBaseline.js';

export interface ILiveCompatMatrixOptions {
	readonly repoRoot: string;
	/** Resolves a checkpoint ref to a full commit sha; supplied by the caller. */
	readonly resolveCommit: (ref: string) => string | undefined;
	readonly cacheRoot?: string;
	readonly diagnosticsRoot?: string;
}

/** Aggregate outcome of one live-compat run. */
export interface ILiveCompatMatrixSummary {
	readonly suite: string;
	readonly startedAt: string;
	readonly durationMs: number;
	readonly outcome: 'passed' | 'failed';
	readonly results: readonly ILiveCompatScenarioResult[];
}

/**
 * Run the same-build restart baseline for each requested checkpoint, in order.
 */
export async function runSameBuildRestartBaselines(
	buildIds: readonly (AgentHostBuildId | string)[],
	options: ILiveCompatMatrixOptions,
): Promise<ILiveCompatMatrixSummary> {
	const startedAt = Date.now();
	const results: ILiveCompatScenarioResult[] = [];
	for (const buildId of buildIds) {
		results.push(await runOne(buildId, options));
	}
	return {
		suite: 'agent-host-live-compat/same-build-restart-baseline',
		startedAt: new Date(startedAt).toISOString(),
		durationMs: Date.now() - startedAt,
		outcome: results.every(result => result.outcome === 'passed') ? 'passed' : 'failed',
		results,
	};
}

async function runOne(buildId: AgentHostBuildId | string, options: ILiveCompatMatrixOptions): Promise<ILiveCompatScenarioResult> {
	const startedAt = Date.now();
	let prepared: IPreparedAgentHostBuild;
	try {
		prepared = resolveBuild(buildId, options);
	} catch (error) {
		// Resolution failure is a real, reportable result — the whole point of
		// requirement "no silent skips" — and carries the resolver's actionable
		// message (which names the exact `--prepare` command to run).
		return {
			scenario: 'same-build-restart-baseline',
			build: String(buildId),
			outcome: 'failed',
			durationMs: Date.now() - startedAt,
			steps: [{ name: 'resolve-build', outcome: 'failed', durationMs: Date.now() - startedAt, detail: messageOf(error) }],
			diagnosticsPath: '',
			error: messageOf(error),
		};
	}
	return runSameBuildRestartBaseline(prepared, { diagnosticsRoot: options.diagnosticsRoot });
}

/**
 * Resolve a checkpoint into a launchable build, or explain what is missing.
 *
 * This repeats the few lines of `resolvePreparedBuild` rather than calling it,
 * for an import-graph reason worth stating: that function lives in
 * `crossVersionAgentHostTarget.ts`, which imports the Mocha-oriented server
 * helper and therefore cannot be loaded from a plain `node` process. The rules
 * themselves are not duplicated — `isBuildCacheUsable` and
 * `describeUnusableBuild` remain the single source of truth for what makes a
 * build usable and what to tell the developer about it.
 */
export function resolveBuild(buildId: AgentHostBuildId | string, options: ILiveCompatMatrixOptions): IPreparedAgentHostBuild {
	const descriptor = agentHostLiveCompatBuild(buildId);
	const plan = planAgentHostBuild(descriptor, agentHostLiveCompatPlanContext(descriptor, {
		repoRoot: options.repoRoot,
		cacheRoot: options.cacheRoot,
		resolveCommit: options.resolveCommit,
	}));
	const cacheUsable = plan.cacheMarkerPath === undefined
		? plan.source === AgentHostBuildSourceKind.WorkingTree
		: isBuildCacheUsable(plan, readTextOrUndefined(plan.cacheMarkerPath));
	const problem = describeUnusableBuild(plan, { serverEntryExists: existsSync(plan.serverEntry), cacheUsable });
	if (problem) {
		throw new Error(problem);
	}
	return {
		id: plan.id,
		serverEntry: plan.serverEntry,
		description: plan.description ?? plan.resolvedCommit ?? plan.ref,
	};
}

function readTextOrUndefined(path: string): string | undefined {
	try {
		return readFileSync(path, 'utf8');
	} catch {
		return undefined;
	}
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
