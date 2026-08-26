/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Executes the process-recovery matrix and summarizes the outcome.
 *
 * The same two rules that govern the restart-baseline matrix apply here, for
 * the same reasons:
 *
 * - **A build is never silently skipped.** A checkpoint that cannot be resolved
 *   is reported as a failed entry carrying the resolver's own explanation, so a
 *   run that covered three builds can never be mistaken for one that covered
 *   four.
 * - **Scenarios run sequentially.** Each forks a real Agent Host and kills it
 *   with `SIGKILL`; overlapping two of those on one machine would make a
 *   failure attributable to contention rather than to recovery.
 *
 * A third rule is specific to this matrix: the summary carries
 * {@link RECOVERY_BOUNDARIES} and {@link RECOVERY_INTEGRATION_PROPOSALS}
 * verbatim. A recovery run's most misreadable property is its *scope*, so what
 * was deliberately not covered ships inside the same artifact as what passed,
 * rather than living in a document that can drift away from the evidence.
 */

import { agentHostLiveCompatBuild, AgentHostBuildId } from '../harness/agentHostLiveCompatBuilds.js';
import type { IPreparedAgentHostBuild } from '../harness/crossVersionAgentHostTarget.js';
import { resolveBuild, type ILiveCompatMatrixOptions } from './agentHostLiveCompatMatrix.js';
import {
	RECOVERY_BOUNDARIES,
	RECOVERY_INTEGRATION_PROPOSALS,
	RecoveryClassification,
	runKillAtMutationBoundary,
	runRepeatedUncleanRestart,
	runUncleanKillRestart,
	runUncleanPredecessorUpgrade,
	type IRecoveryBoundary,
	type IRecoveryIntegrationProposal,
	type IRecoveryScenarioResult,
} from './recoveryMatrix.js';

/** Aggregate outcome of one recovery run. */
export interface IRecoveryMatrixSummary {
	readonly suite: string;
	readonly startedAt: string;
	readonly durationMs: number;
	readonly outcome: 'passed' | 'failed';
	readonly results: readonly IRecoveryScenarioResult[];
	/**
	 * Tally of admissible recovery shapes across every restart performed.
	 *
	 * This is where the catalogue-write durability gap becomes visible as a
	 * number instead of an anecdote: a run that is green but whose renames
	 * never survive reports it here rather than looking indistinguishable from
	 * a run where durability held.
	 */
	readonly classificationCounts: Readonly<Record<string, number>>;
	readonly boundaries: readonly IRecoveryBoundary[];
	readonly integrationProposals: readonly IRecoveryIntegrationProposal[];
}

export interface IRecoveryMatrixOptions extends ILiveCompatMatrixOptions {
	/**
	 * Build the current-vs-historical upgrade scenario hands a profile from.
	 * Defaults to the predecessor checkpoint, the closest realistic upgrade.
	 */
	readonly upgradeFromBuildId?: AgentHostBuildId | string;
}

/**
 * Run every recovery scenario for each requested checkpoint, in order.
 *
 * The cross-build upgrade scenario is run once at the end rather than per
 * build: it is a property of a *pair*, and running it for each requested build
 * against itself would assert nothing a single-build scenario has not already.
 */
export async function runRecoveryMatrix(
	buildIds: readonly (AgentHostBuildId | string)[],
	options: IRecoveryMatrixOptions,
): Promise<IRecoveryMatrixSummary> {
	const startedAt = Date.now();
	const results: IRecoveryScenarioResult[] = [];

	for (const buildId of buildIds) {
		const resolution = tryResolve(buildId, options);
		if (!resolution.build) {
			// One entry per scenario the build was going to run, so a resolution
			// failure cannot shrink the apparent size of the matrix.
			results.push(
				failedResolution('unclean-kill-restart', buildId, resolution.error),
				failedResolution('repeated-unclean-restart', buildId, resolution.error),
				failedResolution('kill-at-mutation-boundary', buildId, resolution.error),
			);
			continue;
		}
		const scenarioOptions = { diagnosticsRoot: options.diagnosticsRoot };
		results.push(await runUncleanKillRestart(resolution.build, scenarioOptions));
		results.push(await runRepeatedUncleanRestart(resolution.build, scenarioOptions));
		results.push(await runKillAtMutationBoundary(resolution.build, scenarioOptions));
	}

	results.push(await runUpgradeScenario(options));

	return {
		suite: 'agent-host-live-compat/recovery-matrix',
		startedAt: new Date(startedAt).toISOString(),
		durationMs: Date.now() - startedAt,
		outcome: results.every(result => result.outcome === 'passed') ? 'passed' : 'failed',
		results,
		classificationCounts: tallyClassifications(results),
		boundaries: RECOVERY_BOUNDARIES,
		integrationProposals: RECOVERY_INTEGRATION_PROPOSALS,
	};
}

/**
 * Hand a profile from a historical build, killed uncleanly, to the current one.
 *
 * Both ends must resolve for the scenario to mean anything, so a failure to
 * resolve either is reported as the scenario failing rather than as an absence.
 */
async function runUpgradeScenario(options: IRecoveryMatrixOptions): Promise<IRecoveryScenarioResult> {
	const fromId = options.upgradeFromBuildId ?? AgentHostBuildId.Predecessor;
	const from = tryResolve(fromId, options);
	const to = tryResolve(AgentHostBuildId.Current, options);
	if (!from.build || !to.build) {
		const error = from.build ? to.error : from.error;
		return failedResolution('unclean-predecessor-upgrade', fromId, error);
	}
	return runUncleanPredecessorUpgrade(from.build, to.build, { diagnosticsRoot: options.diagnosticsRoot });
}

/** Count each admissible recovery shape observed across the whole run. */
export function tallyClassifications(results: readonly IRecoveryScenarioResult[]): Readonly<Record<string, number>> {
	const counts: Record<string, number> = {
		[RecoveryClassification.ConvergedMutated]: 0,
		[RecoveryClassification.ConvergedPreMutation]: 0,
	};
	for (const result of results) {
		for (const classification of result.classifications) {
			counts[classification] = (counts[classification] ?? 0) + 1;
		}
	}
	return counts;
}

function tryResolve(
	buildId: AgentHostBuildId | string,
	options: ILiveCompatMatrixOptions,
): { build?: IPreparedAgentHostBuild; error: string } {
	try {
		// Validates the id against the known checkpoints before planning, so an
		// unknown id reports as such rather than as a missing build directory.
		agentHostLiveCompatBuild(buildId);
		return { build: resolveBuild(buildId, options), error: '' };
	} catch (error) {
		return { error: messageOf(error) };
	}
}

function failedResolution(scenario: string, buildId: AgentHostBuildId | string, error: string): IRecoveryScenarioResult {
	return {
		scenario,
		build: String(buildId),
		outcome: 'failed',
		durationMs: 0,
		steps: [{ name: 'resolve-build', outcome: 'failed', durationMs: 0, detail: error }],
		classifications: [],
		diagnosticsPath: '',
		error,
	};
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
