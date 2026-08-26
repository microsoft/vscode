/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Entry point that resolves checkpoints and runs the backward-compatibility
 * round trips.
 *
 * Split from {@link backwardCompatibilityMatrix} so the scenario itself takes
 * already-prepared builds and knows nothing about the repository, git, or the
 * build cache. This module is the only place the two meet, and it inherits the
 * matrix runner's governing rule:
 *
 * - **A pairing is never silently skipped.** A checkpoint that cannot be
 *   resolved becomes a *failed* result carrying the resolver's own explanation
 *   (which names the exact `--prepare` command to run), so a run that covered
 *   two of three pairings can never be mistaken for a run that covered three.
 */

import { runBackwardCompatibilityRoundTrip, unresolvedBackwardCompatResult, type IBackwardCompatMatrixSummary, type IBackwardCompatScenarioResult } from './backwardCompatibilityMatrix.js';
import { AgentHostBuildId } from '../harness/agentHostLiveCompatBuilds.js';
import { resolveBuild, type ILiveCompatMatrixOptions } from './agentHostLiveCompatMatrix.js';
import type { IPreparedAgentHostBuild } from '../harness/crossVersionAgentHostTarget.js';

/**
 * Older checkpoints the current build is handed down to, oldest first.
 *
 * Ordering is deliberate: the oldest build is the most likely to fail, and
 * running it first means the longest-standing incompatibility is reported
 * before time is spent on the closer ones.
 */
export const BACKWARD_COMPAT_OLDER_BUILDS: readonly string[] = Object.freeze([
	AgentHostBuildId.Legacy,
	AgentHostBuildId.Intermediate,
	AgentHostBuildId.Predecessor,
]);

/**
 * Run `current → older → current → restart` for each requested older build.
 *
 * Builds run sequentially; see {@link runBackwardCompatibilityMatrix} for why.
 */
export async function runBackwardCompatibilityMatrixForBuilds(
	olderBuildIds: readonly string[],
	options: ILiveCompatMatrixOptions,
): Promise<IBackwardCompatMatrixSummary> {
	const startedAt = Date.now();
	const results: IBackwardCompatScenarioResult[] = [];

	let current: IPreparedAgentHostBuild | undefined;
	let currentProblem: string | undefined;
	try {
		current = resolveBuild(AgentHostBuildId.Current, options);
	} catch (error) {
		currentProblem = messageOf(error);
	}

	for (const olderBuildId of olderBuildIds) {
		if (!current) {
			// Every pairing needs the current build, so its absence fails them
			// all rather than aborting the run with a single opaque throw.
			results.push(unresolvedBackwardCompatResult(AgentHostBuildId.Current, olderBuildId, currentProblem!));
			continue;
		}
		let older: IPreparedAgentHostBuild;
		try {
			older = resolveBuild(olderBuildId, options);
		} catch (error) {
			results.push(unresolvedBackwardCompatResult(current.id, olderBuildId, messageOf(error)));
			continue;
		}
		results.push(await runBackwardCompatibilityRoundTrip(current, older, { diagnosticsRoot: options.diagnosticsRoot }));
	}

	return {
		suite: 'agent-host-live-compat/backward-compatibility-round-trip',
		startedAt: new Date(startedAt).toISOString(),
		durationMs: Date.now() - startedAt,
		outcome: results.every(entry => entry.outcome === 'passed') ? 'passed' : 'failed',
		results,
	};
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
